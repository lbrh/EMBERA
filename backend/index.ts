import express, { type Express, type Request, type Response } from 'express';
import { ingestionRouter } from './src/routes/ingestion.routes.ts';
import { imagesRouter } from './src/routes/images.routes.ts';
import { incidentsRouter } from './src/routes/incidents.ts';
import { coordinatorRouter } from './src/routes/coordinator.routes.ts';
import { requireApiKey } from './src/middleware/api-key.middleware.ts';
import { rateLimit } from './src/middleware/rate-limit.middleware.ts';
import { cors } from './src/middleware/cors.middleware.ts';
import { checkDatabaseConnection, expireStalePendingAssessments } from './src/metadata/metadata.repository.ts';
import { logger, errorMeta } from './src/utils/logger.ts';
import { startWeatherRefresh } from './src/pipeline/refresh-weather.ts';

const app: Express = express();
const port = 3000;

app.use(cors);
app.use(express.json());

// Liveness: process is up, no dependency checks (fast, always 200 while running).
app.get('/', (req: Request, res: Response) => {
    res.json({ status: 'ok' });
});

// Readiness: dependencies are actually reachable. Kept separate from '/' so a slow DB
// doesn't fail a liveness probe and trigger an unnecessary restart loop.
app.get('/health', async (req: Request, res: Response) => {
    try {
        await checkDatabaseConnection();
        res.json({ status: 'ok', database: 'reachable' });
    } catch (err) {
        logger.error('health check failed', errorMeta(err));
        res.status(503).json({ status: 'unhealthy' });
    }
});

// Everything below needs an API key. Applied once: path-less app.use(middleware, router)
// runs its middleware for every request that falls through it, so repeating rateLimit per
// router counted each request once per router and cut the real limit to a fraction.
app.use(requireApiKey, rateLimit);

app.use(ingestionRouter); // POST /ingest
app.use(imagesRouter); // signed image URLs
app.use(incidentsRouter); // map / incident / order reads, classifier write-back
app.use(coordinatorRouter); // review, override, dispatch, decision log

const server = app.listen(port, () => {
    logger.info('app listening', { port });
});

// Live weather for open incidents (station wind + forecast). 0 turns it off, e.g. to keep the demo
// seed's fixed weather.
const weatherRefreshMinutes = Number(process.env.WEATHER_REFRESH_MINUTES ?? 30);
if (weatherRefreshMinutes > 0) startWeatherRefresh(weatherRefreshMinutes);

// Images whose background AI assessment was killed (deploy, scale-down) go to manual review.
// ponytail: 10 min covers the slowest model call (undici's 5 min timeout) twice over; runs on its own
// timer, not the weather refresh, which the demo turns off.
const sweepStaleAssessments = () =>
    expireStalePendingAssessments(10)
        .then((moved) => moved && logger.info('stale assessments sent to manual review', { moved }))
        .catch((err) => logger.error('stale assessment sweep failed', errorMeta(err)));
void sweepStaleAssessments();
setInterval(sweepStaleAssessments, 5 * 60_000).unref();

// Code Engine sends SIGTERM on scale-down; finish in-flight requests instead of
// dropping them mid-upload.
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
});
