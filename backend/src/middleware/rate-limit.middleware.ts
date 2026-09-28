import type { NextFunction, Request, Response } from 'express';

const WINDOW_MS = 60_000;
// Reads are cheap and the UI polls and loads thumbnails, so they get a wide budget. Writes are
// kept tighter: POST /ingest runs four watsonx calls and a COS write per image.
export const LIMITS = { read: 600, write: 60 };

// ponytail: in-memory per-instance limiter — fine at this project's scale (Code Engine
// max-scale=5, low request volume). A shared store (e.g. Redis) would only matter if the
// limit must hold exactly across many concurrent instances rather than per-instance.
const hits = new Map<string, number[]>();

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
    // Per caller *and* client: the frontend proxies every user through one api key, so keying on
    // the key alone would give the whole site a single shared budget. The proxy passes the user's
    // IP as the first x-forwarded-for entry. Only keyed (trusted) callers get here, so a caller
    // spoofing that header can only split its own budget, not anyone else's.
    const caller = res.locals?.caller ?? req.header('x-api-key') ?? 'anonymous';
    const client = req.header('x-forwarded-for')?.split(',')[0].trim() || req.ip || 'unknown';
    const kind = req.method === 'GET' || req.method === 'HEAD' ? 'read' : 'write';
    const key = `${caller}:${client}:${kind}`;
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= LIMITS[kind]) {
        res.status(429).json({ error: 'rate limit exceeded' });
        return;
    }
    recent.push(now);
    hits.set(key, recent);
    next();
}
