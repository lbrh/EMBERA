import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { LIMITS, rateLimit } from '../src/middleware/rate-limit.middleware.ts';

function fakeReq(key: string, method = 'POST'): Request {
    return { method, header: () => key, ip: key } as unknown as Request;
}

function fakeRes() {
    const res = {
        statusCode: 0,
        status(code: number) {
            res.statusCode = code;
            return res;
        },
        json() {
            return res;
        },
    };
    return res as unknown as Response & typeof res;
}

function allowed(req: Request): boolean {
    let nextCalled = false;
    rateLimit(req, fakeRes(), () => {
        nextCalled = true;
    });
    return nextCalled;
}

function exhaust(req: Request, limit: number): void {
    for (let i = 0; i < limit; i++) {
        assert.equal(allowed(req), true, `request ${i + 1} should have been allowed`);
    }
}

// Each test uses its own key so the module-level hit counter doesn't leak between tests.

test('allows writes up to the write limit, then blocks with 429', () => {
    const req = fakeReq('unit-test-write-limit');
    exhaust(req, LIMITS.write);
    const res = fakeRes();
    let nextCalled = false;
    rateLimit(req, res, () => {
        nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 429);
});

test('reads get their own, larger budget', () => {
    const key = 'unit-test-read-limit';
    exhaust(fakeReq(key, 'POST'), LIMITS.write);
    assert.equal(allowed(fakeReq(key, 'POST')), false);
    // writes are used up, reads still go through until the read limit
    exhaust(fakeReq(key, 'GET'), LIMITS.read);
    assert.equal(allowed(fakeReq(key, 'GET')), false);
});

test('tracks separate callers independently', () => {
    exhaust(fakeReq('unit-test-caller-a'), LIMITS.write);
    assert.equal(allowed(fakeReq('unit-test-caller-b')), true);
});

test('clients behind the same proxy key get separate budgets', () => {
    const proxied = (ip: string) =>
        ({
            method: 'POST',
            header: (name: string) =>
                name === 'x-forwarded-for' ? `${ip}, 10.0.0.1` : 'unit-test-shared-proxy-key',
            ip: '10.0.0.1',
        }) as unknown as Request;
    exhaust(proxied('203.0.113.1'), LIMITS.write);
    assert.equal(allowed(proxied('203.0.113.1')), false);
    assert.equal(allowed(proxied('203.0.113.2')), true);
});
