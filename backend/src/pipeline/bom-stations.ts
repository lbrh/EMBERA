import { logger, errorMeta } from '../utils/logger.ts';
import { haversineKm } from '../utils/geo.ts';

// Latest observations from every Bureau of Meteorology automatic weather station in Victoria, in one
// file (product IDV60920), reissued about every 10 minutes. Public, no key, but the Bureau refuses
// requests without an identifying User-Agent. Wind is the 10 m 10-minute mean, the same height the
// McArthur and 10% rule models expect. Data (c) Commonwealth of Australia, Bureau of Meteorology.
// ponytail: Victoria only (the operating region); add IDN60920 (NSW) / IDS60920 (SA) for border fires.
const BOM_VIC = 'http://www.bom.gov.au/fwo/IDV60920.xml';
const USER_AGENT = 'EMBERA-bushfire-triage/0.1 (RMIT student project)';
const TIMEOUT_MS = 8000;
const CACHE_MS = 10 * 60_000; // the file itself only changes every ~10 minutes
export const MAX_STATION_KM = 40; // further than this, terrain makes the station a poor stand-in
export const MAX_OBSERVATION_AGE_MS = 90 * 60_000;
// A summit station reads far windier than the valley below it (Mount William vs Halls Gap).
export const MAX_HEIGHT_DIFFERENCE_M = 400;

export interface StationObservation {
    name: string;
    latitude: number;
    longitude: number;
    heightM: number;
    observedAt: string;
    windKmh: number;
    windFromDeg: number;
    temperatureC: number;
    humidityPct: number;
}

const attributes = (text: string) => Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

// ponytail: regex over the Bureau's fixed product schema (v1.7) instead of an XML parser dependency.
export function parseStations(xml: string): StationObservation[] {
    const stations: StationObservation[] = [];
    for (const [, attrText, body] of xml.matchAll(/<station ([^>]*)>([\s\S]*?)<\/station>/g)) {
        const station = attributes(attrText);
        const period = body.match(/<period ([^>]*)>([\s\S]*?)<\/period>/);
        if (!period) continue;
        const el = Object.fromEntries([...period[2].matchAll(/<element [^>]*type="([^"]+)"[^>]*>([^<]*)<\/element>/g)].map((m) => [m[1], m[2]]));
        const raw = [el.wind_spd_kmh, el.wind_dir_deg, el.air_temperature, el['rel-humidity']];
        if (raw.some((v) => v === undefined || v.trim() === '' || Number.isNaN(Number(v)))) continue;
        const [windKmh, windFromDeg, temperatureC, humidityPct] = raw.map(Number);
        stations.push({
            name: station.description ?? station['stn-name'],
            latitude: Number(station.lat),
            longitude: Number(station.lon),
            heightM: Number(station['stn-height']),
            observedAt: new Date(attributes(period[1])['time-utc']).toISOString(),
            windKmh,
            windFromDeg,
            temperatureC,
            humidityPct,
        });
    }
    return stations;
}

let cache: { at: number; stations: Promise<StationObservation[]> } | null = null;

function latestStations(): Promise<StationObservation[]> {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.stations;
    const stations = fetch(BOM_VIC, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) })
        .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`BoM ${res.status}`))))
        .then(parseStations)
        .catch((err) => {
            logger.warn('BoM station observations unavailable', errorMeta(err));
            cache = null; // try again next call rather than caching the failure
            return [];
        });
    cache = { at: Date.now(), stations };
    return stations;
}

/** The nearest usable station from a list (exported for tests). `elevationM` is the fire's ground
 * height, when known. */
export function nearestFrom(stations: StationObservation[], latitude: number, longitude: number, elevationM: number | null, now = Date.now()) {
    let best: { station: StationObservation; distanceKm: number } | null = null;
    for (const station of stations) {
        if (now - Date.parse(station.observedAt) > MAX_OBSERVATION_AGE_MS) continue;
        if (elevationM != null && Math.abs(station.heightM - elevationM) > MAX_HEIGHT_DIFFERENCE_M) continue;
        const distanceKm = haversineKm(latitude, longitude, station.latitude, station.longitude);
        if (distanceKm <= MAX_STATION_KM && (!best || distanceKm < best.distanceKm)) best = { station, distanceKm };
    }
    return best;
}

/** The nearest Bureau station within 40 km and 400 m of height that reported in the last 90 minutes, or null. */
export async function nearestStationObservation(latitude: number, longitude: number, elevationM: number | null) {
    return nearestFrom(await latestStations(), latitude, longitude, elevationM);
}
