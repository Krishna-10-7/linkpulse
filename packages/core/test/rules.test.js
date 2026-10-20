import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, OUTCOME } from '../src/rules.js';

const now = new Date('2026-10-19T12:00:00Z');
const base = { status: 'ACTIVE', destination: 'https://example.com', clickCount: 0, rules: [] };

test('missing link is not found', () => {
  assert.equal(evaluate(null, { now }).outcome, OUTCOME.NOT_FOUND);
});

test('admin disable beats every other rule, including password', () => {
  const r = evaluate({ ...base, status: 'DISABLED', passwordHash: 'x', expiresAt: '2020-01-01' }, { now });
  assert.equal(r.outcome, OUTCOME.DISABLED);
  assert.equal(r.status, 410);
  assert.equal(r.step, 2);
});

test('paused and archived links are inactive', () => {
  assert.equal(evaluate({ ...base, status: 'PAUSED' }, { now }).outcome, OUTCOME.INACTIVE);
  assert.equal(evaluate({ ...base, status: 'ARCHIVED' }, { now }).outcome, OUTCOME.INACTIVE);
});

test('scheduled links are not live before their start date', () => {
  assert.equal(evaluate({ ...base, startsAt: '2026-10-20T00:00:00Z' }, { now }).outcome, OUTCOME.NOT_LIVE);
  assert.equal(evaluate({ ...base, startsAt: '2026-10-18T00:00:00Z' }, { now }).outcome, OUTCOME.REDIRECT);
});

test('expired links return 410 and expire exactly at expiresAt', () => {
  assert.equal(evaluate({ ...base, expiresAt: '2026-10-19T11:59:59Z' }, { now }).outcome, OUTCOME.EXPIRED);
  assert.equal(evaluate({ ...base, expiresAt: '2026-10-19T12:00:00Z' }, { now }).outcome, OUTCOME.EXPIRED);
  assert.equal(evaluate({ ...base, expiresAt: '2026-10-19T12:00:01Z' }, { now }).outcome, OUTCOME.REDIRECT);
});

test('click cap is checked before the password prompt', () => {
  const link = { ...base, clickLimit: 500, passwordHash: 'x' };
  assert.equal(evaluate(link, { now, currentClicks: 500 }).outcome, OUTCOME.LIMIT);
  assert.equal(evaluate(link, { now, currentClicks: 499 }).outcome, OUTCOME.PASSWORD);
});

test('unlocked password links redirect', () => {
  const r = evaluate({ ...base, passwordHash: 'x' }, { now, unlocked: true });
  assert.equal(r.outcome, OUTCOME.REDIRECT);
  assert.equal(r.destination, 'https://example.com');
});

test('targeting rules pick a destination by priority', () => {
  const link = {
    ...base,
    rules: [
      { type: 'device', value: 'mobile', destination: 'https://m.example.com', priority: 1 },
      { type: 'os', value: 'iOS', destination: 'https://apps.apple.com/app', priority: 5 },
    ],
  };
  assert.equal(evaluate(link, { now, device: 'mobile', os: 'iOS' }).destination, 'https://apps.apple.com/app');
  assert.equal(evaluate(link, { now, device: 'mobile', os: 'Android' }).destination, 'https://m.example.com');
  const desk = evaluate(link, { now, device: 'desktop', os: 'Windows' });
  assert.equal(desk.destination, 'https://example.com');
  assert.equal(desk.step, 9);
});

test('country rules match the visitor country case-insensitively', () => {
  const link = { ...base, rules: [{ type: 'country', value: 'IN', destination: 'https://in.example.com', priority: 1 }] };
  assert.equal(evaluate(link, { now, country: 'in' }).destination, 'https://in.example.com');
  assert.equal(evaluate(link, { now, country: 'US' }).destination, 'https://example.com');
  assert.equal(evaluate(link, { now, country: null }).destination, 'https://example.com');
});
