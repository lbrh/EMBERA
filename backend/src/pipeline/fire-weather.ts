import { logger, errorMeta } from '../utils/logger.ts';
import { nearestStationObservation } from './bom-stations.ts';
import type { FireWeather, FireWeatherHour } from '../metadata/metadata.types.ts';

// Weather at a point: the nearest Bureau of Meteorology station's latest observation for "now" when
// one is close enough (bom-stations.ts), and Open-Meteo's forecast for the hours after (free, no
// key, 10k calls/day for non-commercial use). Gridded model wind runs low on bad fire days
// (docs/live/spread-backtest.md), which is why a real observation wins when there is one.
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 5000;
const FORECAST_HOURS = 2; // the spread envelope runs 3 h: now, then these
const FIELDS = 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m';

// ponytail: drought factor fixed at its maximum (fully cured fuel), so FFDI reads worst-case for
// the conditions. Derive it from recent rainfall (Griffiths / KBDI) if wet-season readings matter.
const DROUGHT_FACTOR = 10;

// McArthur Mk5 Forest Fire Danger Index (Noble et al. 1980). Wind in km/h at 10 m.
export function forestFireDangerIndex(temperatureC: number, humidityPct: number, windKmh: number): number {
    const ffdi = 2 * Math.exp(-0.45 + 0.987 * Math.log(DROUGHT_FACTOR) - 0.0345 * humidityPct + 0.0338 * temperatureC + 0.0234 * windKmh);
    return Math.round(ffdi * 10) / 10;
}

// FFDI 50+ is "Severe" and above on the McArthur scale: fire behaviour gets past what crews can
// directly attack, so a photo's severity is raised one level (see assess-severity.ts).
export const SEVERE_FFDI = 50;

// Band on the legacy (pre-September 2022) McArthur scale. Not an AFDRS rating, which comes from the
// Fire Behaviour Index; always label it as legacy wherever it's shown.
export function dangerRating(ffdi: number): string {
    if (ffdi >= 100) return 'Catastrophic';
    if (ffdi >= 75) return 'Extreme';
    if (ffdi >= 50) return 'Severe';
    if (ffdi >= 25) return 'Very high';
    if (ffdi >= 12) return 'High';
    return 'Low-moderate';
}

interface OpenMeteoResponse {
    elevation?: number; // ground height of the grid point, m
    current?: {
        time: string;
        temperature_2m: number;
        relative_humidity_2m: number;
        wind_speed_10m: number;
        wind_direction_10m: number;
    };
    // hourly starts at the current hour
    hourly?: {
        time: string[];
        temperature_2m: number[];
        relative_humidity_2m: number[];
        wind_speed_10m: number[];
        wind_direction_10m: number[];
    };
}

const utc = (time: string) => new Date(`${time}Z`).toISOString();

function conditions(temperatureC: number, humidityPct: number, windKmh: number, windFromDeg: number) {
    return { temperatureC, humidityPct, windKmh, windFromDeg, ffdi: forestFireDangerIndex(temperatureC, humidityPct, windKmh) };
}

function nextHoursFrom(currentTime: string, hourly: NonNullable<OpenMeteoResponse['hourly']>): FireWeatherHour[] {
    return hourly.time
        .map((time, i) => ({
            time: utc(time),
            ...conditions(hourly.temperature_2m[i], hourly.relative_humidity_2m[i], hourly.wind_speed_10m[i], hourly.wind_direction_10m[i]),
        }))
        .filter((hour) => hour.time > utc(currentTime))
        .slice(0, FORECAST_HOURS);
}

async function modelWeather(latitude: number, longitude: number): Promise<{ weather: FireWeather; elevationM: number | null } | null> {
    const url = `${OPEN_METEO}?latitude=${latitude}&longitude=${longitude}&timezone=UTC&wind_speed_unit=kmh`
        + `&current=${FIELDS}&hourly=${FIELDS}&forecast_hours=${FORECAST_HOURS + 2}`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
        const { current, hourly, elevation } = (await res.json()) as OpenMeteoResponse;
        if (!current) throw new Error('Open-Meteo returned no current weather');
        const weather = {
            observedAt: utc(current.time),
            ...conditions(current.temperature_2m, current.relative_humidity_2m, current.wind_speed_10m, current.wind_direction_10m),
            nextHours: hourly ? nextHoursFrom(current.time, hourly) : [],
        };
        return { weather, elevationM: elevation ?? null };
    } catch (err) {
        logger.warn('fire weather lookup failed', errorMeta(err));
        return null;
    }
}

/** Weather and fire danger at a point now and for the next hours, or null if neither the
 * Bureau nor Open-Meteo can be reached. */
export async function lookUpFireWeather(latitude: number, longitude: number): Promise<FireWeather | null> {
    const model = await modelWeather(latitude, longitude);
    const nearest = await nearestStationObservation(latitude, longitude, model?.elevationM ?? null);
    const fetchedAt = new Date().toISOString();
    if (!nearest) return model ? { ...model.weather, fetchedAt } : null;
    const { station, distanceKm } = nearest;
    return {
        observedAt: station.observedAt,
        fetchedAt,
        ...conditions(station.temperatureC, station.humidityPct, station.windKmh, station.windFromDeg),
        nextHours: model?.weather.nextHours ?? [],
        station: { name: station.name, distanceKm: Math.round(distanceKm * 10) / 10 },
    };
}
