import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, offsetMinutes, startOfDay, addDays, isValidTimeZone } from '../src/time.js';

const IST = 'Asia/Kolkata';

test('an evening click in India belongs to the Indian day', () => {
  const t = new Date('2026-10-19T18:45:00Z'); // 00:15 on the 20th in India
  assert.equal(dayKey(t, 'UTC'), '2026-10-19');
  assert.equal(dayKey(t, IST), '2026-10-20');
});

test('offsets', () => {
  assert.equal(offsetMinutes(new Date('2026-10-20T00:00:00Z'), IST), 330);
  assert.equal(offsetMinutes(new Date('2026-07-01T12:00:00Z'), 'America/New_York'), -240);
  assert.equal(offsetMinutes(new Date('2026-12-01T12:00:00Z'), 'America/New_York'), -300);
});

test('start of day in a zone', () => {
  assert.equal(startOfDay('2026-10-20', IST).toISOString(), '2026-10-19T18:30:00.000Z');
  assert.equal(startOfDay('2026-10-20', 'UTC').toISOString(), '2026-10-20T00:00:00.000Z');
});

test('addDays crosses months and years', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

test('zone validation', () => {
  assert.equal(isValidTimeZone(IST), true);
  assert.equal(isValidTimeZone('Mars/Olympus'), false);
});
