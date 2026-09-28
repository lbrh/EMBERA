import * as metadataRepository from '../metadata/metadata.repository.ts';
import { lookUpFireWeather } from './fire-weather.ts';
import { reassessForWeather } from './assess-severity.ts';
import { logger, errorMeta } from '../utils/logger.ts';

// Keeps open incidents' weather live: the newest image of each gets fresh weather (station
// observation plus forecast), and its AI severity is re-scored if fire danger crossed the line.
// A coordinator's severity override is untouched, since it always wins over the AI's.
const LOCK_KEY = 727101;
const REFRESHED_BY = 'Weather refresh';
export async function refreshOpenIncidentWeather(freshMs: number): Promise<{ refreshed: number; rescored: number } | null> {
    return metadataRepository.withTryLock(LOCK_KEY, async () => {
        let refreshed = 0;
        let rescored = 0;
        for (const image of await metadataRepository.findOpenIncidentLatestImages()) {
            const fetchedAt = image.weather?.fetchedAt ? Date.parse(image.weather.fetchedAt) : 0;
            // looked up this recently: another instance, or a restart, just did it
            if (Date.now() - fetchedAt < freshMs) continue;
            // one at a time: Open-Meteo is shared and BoM's file is cached, so there's nothing to gain
            const weather = await lookUpFireWeather(image.latitude, image.longitude);
            if (!weather) continue;
            const patch = reassessForWeather(image, weather);
            await metadataRepository.applyWeatherRefresh(image.imageId, patch, REFRESHED_BY);
            refreshed++;
            if (patch.severityScore !== image.severityScore) rescored++;
        }
        return { refreshed, rescored };
    });
}

/** Refreshes now (a cold start after scale-to-zero may have missed runs), then every `minutes`. */
export function startWeatherRefresh(minutes: number): void {
    // two thirds of the interval, so a run a little early still refreshes what the last one did
    const freshMs = (minutes * 60_000 * 2) / 3;
    const run = () =>
        refreshOpenIncidentWeather(freshMs)
            .then((result) => result && logger.info('weather refreshed', result))
            .catch((err) => logger.error('weather refresh failed', errorMeta(err)));
    void run();
    setInterval(run, minutes * 60_000).unref();
}
