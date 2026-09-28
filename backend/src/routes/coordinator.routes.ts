import { Router, type Request, type Response } from 'express';
import * as metadataRepository from '../metadata/metadata.repository.ts';
import { requireCaller } from '../middleware/api-key.middleware.ts';
import { ValidationError } from '../pipeline/validate.ts';
import { logger, errorMeta } from '../utils/logger.ts';
import type { AssignmentStatus, ClassificationLabel, CoordinatorPatch, CrewType, DispatchState } from '../metadata/metadata.types.ts';

// Coordinator actions (Sprint 2 §5): review confirm/change/discard, severity override, dispatch,
// extinguish/reopen, and the decision log behind every one of them. Undo is just another call
// with the previous values, so it's logged too.
export const coordinatorRouter: Router = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LABELS = new Set<ClassificationLabel>(['fire', 'non_fire', 'extinguished', 'uncertain']);
const REVIEW_STATUSES = new Set(['assessed', 'unable_to_assess']);
const DISPATCH_STATES = new Set<DispatchState>(['awaiting', 'live', 'extinguished', 'archived']);
const ASSIGNMENT_STATUSES = new Set<AssignmentStatus>(['dispatched', 'en_route', 'on_scene', 'cleared']);
// assignment and support-request ids: BIGSERIAL
const SERIAL_ID = /^\d{1,18}$/;
const MAX_CREWS_PER_DISPATCH = 10;
const CREW_TYPES = new Set<CrewType>(['light', 'heavy', 'aerial']);
const MAX_SUPPORT_NOTE = 500;

// ponytail: "who" is whatever the frontend sends until user auth exists — it's recorded, not verified.
function parseBy(body: Record<string, unknown>): string {
    const by = body.by;
    if (typeof by !== 'string' || by.trim() === '' || by.length > 100) {
        throw new ValidationError('by is required: who made the decision (max 100 chars)');
    }
    return by.trim();
}

export function parseCoordinatorPatch(body: unknown): { patch: CoordinatorPatch; by: string } {
    if (typeof body !== 'object' || body === null) throw new ValidationError('request body must be a JSON object');
    const b = body as Record<string, unknown>;
    const patch: CoordinatorPatch = {};

    if ('severityScoreOverride' in b) {
        const v = b.severityScoreOverride;
        if (v !== null && !(Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 4)) {
            throw new ValidationError('severityScoreOverride must be 1-4 or null');
        }
        patch.severityScoreOverride = v as CoordinatorPatch['severityScoreOverride'];
    }
    if ('classificationLabelOverride' in b) {
        const v = b.classificationLabelOverride;
        if (v !== null && !LABELS.has(v as ClassificationLabel)) {
            throw new ValidationError(`classificationLabelOverride must be one of ${[...LABELS].join(', ')} or null`);
        }
        patch.classificationLabelOverride = v as ClassificationLabel | null;
    }
    if ('assessmentStatus' in b) {
        if (!REVIEW_STATUSES.has(b.assessmentStatus as string)) {
            throw new ValidationError('assessmentStatus must be assessed or unable_to_assess');
        }
        patch.assessmentStatus = b.assessmentStatus as CoordinatorPatch['assessmentStatus'];
    }
    if (Object.keys(patch).length === 0) {
        throw new ValidationError('nothing to change: send severityScoreOverride, classificationLabelOverride and/or assessmentStatus');
    }
    return { patch, by: parseBy(b) };
}

const MAX_COMMENT_LENGTH = 1000;

export function parseComment(body: unknown): { body: string; by: string } {
    if (typeof body !== 'object' || body === null) throw new ValidationError('request body must be a JSON object');
    const b = body as Record<string, unknown>;
    const text = typeof b.body === 'string' ? b.body.trim() : '';
    if (text === '' || text.length > MAX_COMMENT_LENGTH) {
        throw new ValidationError(`body is required: the comment text (max ${MAX_COMMENT_LENGTH} chars)`);
    }
    return { body: text, by: parseBy(b) };
}

export function parseCrewIds(body: unknown): { crewIds: string[]; by: string } {
    if (typeof body !== 'object' || body === null) throw new ValidationError('request body must be a JSON object');
    const b = body as Record<string, unknown>;
    const ids = b.crewIds;
    if (
        !Array.isArray(ids) ||
        ids.length === 0 ||
        ids.length > MAX_CREWS_PER_DISPATCH ||
        !ids.every((id) => typeof id === 'string' && UUID.test(id)) ||
        new Set(ids).size !== ids.length
    ) {
        throw new ValidationError(`crewIds must be 1-${MAX_CREWS_PER_DISPATCH} distinct crew ids`);
    }
    return { crewIds: ids as string[], by: parseBy(b) };
}

export function parseSupportRequest(body: unknown): { crewId: string; crewType: CrewType | null; note: string | null; by: string } {
    if (typeof body !== 'object' || body === null) throw new ValidationError('request body must be a JSON object');
    const b = body as Record<string, unknown>;
    if (typeof b.crewId !== 'string' || !UUID.test(b.crewId)) throw new ValidationError('crewId is required: the crew asking');
    const crewType = b.crewType ?? null;
    if (crewType !== null && !CREW_TYPES.has(crewType as CrewType)) {
        throw new ValidationError(`crewType must be one of ${[...CREW_TYPES].join(', ')} or null (any)`);
    }
    const note = typeof b.note === 'string' && b.note.trim() !== '' ? b.note.trim() : null;
    if (b.note != null && typeof b.note !== 'string') throw new ValidationError('note must be text');
    if (note && note.length > MAX_SUPPORT_NOTE) throw new ValidationError(`note is too long (max ${MAX_SUPPORT_NOTE} chars)`);
    return { crewId: b.crewId, crewType: crewType as CrewType | null, note, by: parseBy(b) };
}

// `:id` is checked against `idPattern` (incident and image ids are UUIDs, assignment ids are numbers).
function handle(fn: (req: Request<{ id: string }>, res: Response) => Promise<void>, idPattern = UUID) {
    return async (req: Request<{ id: string }>, res: Response) => {
        if (req.params.id !== undefined && !idPattern.test(req.params.id)) {
            res.status(404).json({ error: 'not found' });
            return;
        }
        try {
            await fn(req, res);
        } catch (err) {
            if (err instanceof ValidationError) {
                res.status(400).json({ error: err.message });
                return;
            }
            if (err instanceof metadataRepository.ConflictError) {
                res.status(409).json({ error: err.message });
                return;
            }
            logger.error('coordinator action failed', errorMeta(err));
            res.status(500).json({ error: 'internal error' });
        }
    };
}

// Review and override decisions on one image. Examples:
//   confirm AI tag:   { severityScoreOverride: <AI score>, classificationLabelOverride: 'fire', assessmentStatus: 'assessed' }
//   discard as non-fire: { classificationLabelOverride: 'non_fire', assessmentStatus: 'assessed' }
//   send to review:   { assessmentStatus: 'unable_to_assess' }
coordinatorRouter.patch(
    '/images/:id/decision',
    requireCaller('frontend'),
    handle(async (req, res) => {
        const { patch, by } = parseCoordinatorPatch(req.body);
        const updated = await metadataRepository.applyCoordinatorDecision(req.params.id, patch, by);
        if (!updated) {
            res.status(404).json({ error: 'image not found' });
            return;
        }
        res.json(updated);
    }),
);

// Dispatch lifecycle for an incident: awaiting -> live (crew dispatched) -> extinguished ->
// archived, and back (cancel dispatch, reopen on re-ignition, restore from the archive).
coordinatorRouter.put(
    '/incidents/:id/dispatch',
    requireCaller('frontend'),
    handle(async (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if (!DISPATCH_STATES.has(body.state as DispatchState)) {
            throw new ValidationError(`state must be one of ${[...DISPATCH_STATES].join(', ')}`);
        }
        const result = await metadataRepository.setDispatchState(req.params.id, body.state as DispatchState, parseBy(body));
        if (!result) {
            res.status(404).json({ error: 'incident not found' });
            return;
        }
        res.json(result);
    }),
);

// Merge another incident into this one: { intoIncidentId, by } on the incident being absorbed.
coordinatorRouter.post(
    '/incidents/:id/merge',
    requireCaller('frontend'),
    handle(async (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if (typeof body.intoIncidentId !== 'string' || !UUID.test(body.intoIncidentId)) {
            throw new ValidationError('intoIncidentId must be an incident id');
        }
        const result = await metadataRepository.mergeIncidents(req.params.id, body.intoIncidentId, parseBy(body));
        if (!result) {
            res.status(404).json({ error: 'incident not found' });
            return;
        }
        res.json(result);
    }),
);

// Split one image off into a new incident of its own.
coordinatorRouter.post(
    '/images/:id/split',
    requireCaller('frontend'),
    handle(async (req, res) => {
        const result = await metadataRepository.splitImage(req.params.id, parseBy((req.body ?? {}) as Record<string, unknown>));
        if (!result) {
            res.status(404).json({ error: 'image not found' });
            return;
        }
        res.status(201).json(result);
    }),
);

// Decision log for an incident, newest first.
coordinatorRouter.get(
    '/incidents/:id/decisions',
    requireCaller('frontend'),
    handle(async (req, res) => {
        res.json(await metadataRepository.findDecisions(req.params.id));
    }),
);

// Comments on an incident, newest first. Append-only: there is no edit or delete.
coordinatorRouter.get(
    '/incidents/:id/comments',
    requireCaller('frontend'),
    handle(async (req, res) => {
        res.json(await metadataRepository.findComments(req.params.id));
    }),
);

coordinatorRouter.post(
    '/incidents/:id/comments',
    requireCaller('frontend'),
    handle(async (req, res) => {
        const { body, by } = parseComment(req.body);
        const comment = await metadataRepository.addComment(req.params.id, by, body);
        if (!comment) {
            res.status(404).json({ error: 'incident not found' });
            return;
        }
        res.status(201).json(comment);
    }),
);

// Every crew with its station and open assignment (null = available).
coordinatorRouter.get(
    '/crews',
    requireCaller('frontend'),
    handle(async (req, res) => {
        res.json(await metadataRepository.findCrews());
    }),
);

// Send one or more crews to an incident; the incident goes live. 409 if a crew is already out.
coordinatorRouter.post(
    '/incidents/:id/assignments',
    requireCaller('frontend'),
    handle(async (req, res) => {
        const { crewIds, by } = parseCrewIds(req.body);
        const assignments = await metadataRepository.assignCrews(req.params.id, crewIds, by);
        if (!assignments) {
            res.status(404).json({ error: 'incident not found' });
            return;
        }
        res.status(201).json(assignments);
    }),
);

// Move a crew along (en_route, on_scene) or recall it (cleared). 409 for an out-of-order step.
coordinatorRouter.patch(
    '/assignments/:id',
    requireCaller('frontend'),
    handle(async (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if (!ASSIGNMENT_STATUSES.has(body.status as AssignmentStatus)) {
            throw new ValidationError(`status must be one of ${[...ASSIGNMENT_STATUSES].join(', ')}`);
        }
        const updated = await metadataRepository.setAssignmentStatus(Number(req.params.id), body.status as AssignmentStatus, parseBy(body));
        if (!updated) {
            res.status(404).json({ error: 'assignment not found' });
            return;
        }
        res.json(updated);
    }, SERIAL_ID),
);

// A crew on the incident asks for more help. 409 if the crew isn't assigned there.
coordinatorRouter.post(
    '/incidents/:id/support-requests',
    requireCaller('frontend'),
    handle(async (req, res) => {
        const { crewId, crewType, note, by } = parseSupportRequest(req.body);
        const request = await metadataRepository.createSupportRequest(req.params.id, crewId, crewType, note, by);
        if (!request) {
            res.status(404).json({ error: 'incident not found' });
            return;
        }
        res.status(201).json(request);
    }),
);

// Open support requests, newest first: the coordinator's alerts.
coordinatorRouter.get(
    '/support-requests',
    requireCaller('frontend'),
    handle(async (req, res) => {
        res.json(await metadataRepository.findOpenSupportRequests());
    }),
);

coordinatorRouter.patch(
    '/support-requests/:id',
    requireCaller('frontend'),
    handle(async (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if (body.status !== 'fulfilled' && body.status !== 'dismissed') {
            throw new ValidationError('status must be fulfilled or dismissed');
        }
        const updated = await metadataRepository.setSupportRequestStatus(Number(req.params.id), body.status, parseBy(body));
        if (!updated) {
            res.status(404).json({ error: 'support request not found' });
            return;
        }
        res.json(updated);
    }, SERIAL_ID),
);
