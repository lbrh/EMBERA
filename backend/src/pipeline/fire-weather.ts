import { logger, errorMeta } from '../utils/logger.ts';
import type { FireWeather } from '../metadata/metadata.types.ts';

// Current weather at a point from Open-Meteo: free, no key, 10k calls/day for non-commercial use.
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 5000;

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

export function dangerRating(ffdi: number): string {
    if (ffdi >= 100) return 'Catastrophic';
    if (ffdi >= 75) return 'Extreme';
    if (ffdi >= 50) return 'Severe';
    if (ffdi >= 25) return 'Very high';
    if (ffdi >= 12) return 'High';
    return 'Low-moderate';
}

interface OpenMeteoCurrent {
    current?: {
        time: string;
        temperature_2m: number;
        relative_humidity_2m: number;
        wind_speed_10m: number;
        wind_direction_10m: number;
    };
}

/** Weather and fire danger at a point right now, or null if Open-Meteo can't be reached. */
export async function lookUpFireWeather(latitude: number, longitude: number): Promise<FireWeather | null> {
    const url = `${OPEN_METEO}?latitude=${latitude}&longitude=${longitude}&timezone=UTC&wind_speed_unit=kmh`
        + '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m';
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
        const { current } = (await res.json()) as OpenMeteoCurrent;
        if (!current) throw new Error('Open-Meteo returned no current weather');
        return {
            observedAt: new Date(`${current.time}Z`).toISOString(),
            temperatureC: current.temperature_2m,
            humidityPct: current.relative_humidity_2m,
            windKmh: current.wind_speed_10m,
            windFromDeg: current.wind_direction_10m,
            ffdi: forestFireDangerIndex(current.temperature_2m, current.relative_humidity_2m, current.wind_speed_10m),
        };
    } catch (err) {
        logger.warn('fire weather lookup failed', errorMeta(err));
        return null;
    }
}
