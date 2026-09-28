import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseComment, parseCoordinatorPatch, parseCrewIds, parseSupportRequest } from '../src/routes/coordinator.routes.ts';
import { canMoveAssignment } from '../src/metadata/metadata.repository.ts';
import { ValidationError } from '../src/pipeline/validate.ts';

test('accepts a review confirm and trims who', () => {
    const { patch, by } = parseCoordinatorPatch({
        severityScoreOverride: 3,
        classificationLabelOverride: 'fire',
        assessmentStatus: 'assessed',
        by: '  EC  ',
    });
    assert.deepEqual(patch, { severityScoreOverride: 3, classificationLabelOverride: 'fire', assessmentStatus: 'assessed' });
    assert.equal(by, 'EC');
});

test('null clears an override (undo)', () => {
    const { patch } = parseCoordinatorPatch({ severityScoreOverride: null, by: 'EC' });
    assert.deepEqual(patch, { severityScoreOverride: null });
});

test('rejects bad values, empty patches and a missing author', () => {
    for (const body of [
        { severityScoreOverride: 5, by: 'EC' },
        { severityScoreOverride: 2.5, by: 'EC' },
        { classificationLabelOverride: 'smoke', by: 'EC' },
        { assessmentStatus: 'pending_review', by: 'EC' },
        { by: 'EC' },
        { severityScoreOverride: 2 },
        { severityScoreOverride: 2, by: '   ' },
        null,
    ]) {
        assert.throws(() => parseCoordinatorPatch(body), ValidationError, JSON.stringify(body));
    }
});

test('a comment is trimmed and needs text and an author', () => {
    assert.deepEqual(parseComment({ body: '  Crew reports wind change  ', by: 'EC' }), { body: 'Crew reports wind change', by: 'EC' });
    for (const body of [{ body: '   ', by: 'EC' }, { body: 'x'.repeat(1001), by: 'EC' }, { body: 42, by: 'EC' }, { body: 'hi' }, null]) {
        assert.throws(() => parseComment(body), ValidationError, JSON.stringify(body));
    }
});

test('a dispatch names 1-10 distinct crews and who sent them', () => {
    const crew = 'c0000000-0000-4000-8000-000000000001';
    assert.deepEqual(parseCrewIds({ crewIds: [crew], by: 'EC' }), { crewIds: [crew], by: 'EC' });
    for (const body of [
        { crewIds: [], by: 'EC' },
        { crewIds: [crew, crew], by: 'EC' },
        { crewIds: ['kinglake'], by: 'EC' },
        { crewIds: crew, by: 'EC' },
        { crewIds: [crew] },
    ]) {
        assert.throws(() => parseCrewIds(body), ValidationError, JSON.stringify(body));
    }
});

test('a crew moves forward one step at a time and can be cleared until it is', () => {
    assert.equal(canMoveAssignment('dispatched', 'en_route'), true);
    assert.equal(canMoveAssignment('en_route', 'on_scene'), true);
    assert.equal(canMoveAssignment('on_scene', 'cleared'), true);
    assert.equal(canMoveAssignment('dispatched', 'cleared'), true);
    assert.equal(canMoveAssignment('dispatched', 'on_scene'), false, 'no skipping en route');
    assert.equal(canMoveAssignment('on_scene', 'en_route'), false, 'no going backwards');
    assert.equal(canMoveAssignment('cleared', 'dispatched'), false, 'a cleared assignment is finished');
});

test('a support request names the crew, an optional crew type and an optional note', () => {
    const crew = 'c0000000-0000-4000-8000-000000000002';
    assert.deepEqual(parseSupportRequest({ crewId: crew, crewType: 'heavy', note: '  eastern flank  ', by: 'Kinglake Heavy 1' }), {
        crewId: crew,
        crewType: 'heavy',
        note: 'eastern flank',
        by: 'Kinglake Heavy 1',
    });
    assert.deepEqual(parseSupportRequest({ crewId: crew, note: ' ', by: 'K' }), { crewId: crew, crewType: null, note: null, by: 'K' });
    for (const body of [
        { crewType: 'heavy', by: 'K' },
        { crewId: crew, crewType: 'tanker', by: 'K' },
        { crewId: crew, note: 'x'.repeat(501), by: 'K' },
        { crewId: crew, note: 5, by: 'K' },
        { crewId: crew },
    ]) {
        assert.throws(() => parseSupportRequest(body), ValidationError, JSON.stringify(body));
    }
});
