import { Router, type Request, type Response } from 'express';
import * as metadataRepository from '../metadata/metadata.repository.ts';
import { assessSeverity, parseSeverityAssessmentInput } from '../pipeline/assess-severity.ts';
import { ValidationError } from '../pipeline/validate.ts';
import { requireCaller } from '../middleware/api-key.middleware.ts';
import { logger, errorMeta } from '../utils/logger.ts';

export const incidentsRouter: Router = Router();

// Map Page: markers within the current viewport, one per incident (its most recent
// image) — V2 doc section 7.
incidentsRouter.get('/incidents', async (req: Request, res: Response) => {
    const minLat = Number(req.query.minLat);
    const maxLat = Number(req.query.maxLat);
    const minLon = Number(req.query.minLon);
    const maxLon = Number(req.query.maxLon);

    if ([minLat, maxLat, minLon, maxLon].some((n) => Number.isNaN(n))) {
        res.status(400).json({ error: 'minLat, maxLat, minLon, maxLon are required query params' });
        return;
    }

    const incidents = await metadataRepository.findInBoundingBox({ minLat, maxLat, minLon, maxLon });
    res.json(incidents);
});

// Incident Page: every image at one incident, most recent first — V2 doc section 7.
incidentsRouter.get('/incidents/:id', async (req: Request<{ id: string }>, res: Response) => {
    const images = await metadataRepository.findByIncidentId(req.params.id);
    if (images.length === 0) {
        res.status(404).json({ error: 'incident not found' });
        return;
    }
    res.json(images);
});

// Order Page: dispatch order by priority_rank — V2 doc section 7. priority_rank is
// null for every row until the (separate, not-yet-built) prioritisation phase exists.
incidentsRouter.get('/order', async (req: Request, res: Response) => {
    const ordered = await metadataRepository.findOrderedByPriority();
    res.json(ordered);
});

// Writes severity results, so only the "classifier" caller may use it — never the frontend.
incidentsRouter.post('/images/:id/assess', requireCaller('classifier'), async (req: Request<{ id: string }>, res: Response) => {
    const existing = await metadataRepository.get(req.params.id);
    if (!existing) {
        res.status(404).json({ error: 'image not found' });
        return;
    }

    try {
        const input = parseSeverityAssessmentInput(req.body);
        const result = assessSeverity({ ...input, weather: existing.weather });
        const updated = await metadataRepository.update(req.params.id, result);
        res.status(200).json(updated);
    } catch (err) {
        if (err instanceof ValidationError) {
            res.status(400).json({ error: err.message });
            return;
        }
        logger.error('assess failed', errorMeta(err));
        res.status(500).json({ error: 'internal error' });
    }
});
