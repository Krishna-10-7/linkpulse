import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAlias, suggestAliases } from '../src/alias.js';

const codes = a => validateAlias(a).errors.map(e => e.code);

test('accepts letters, digits, dash and underscore', () => {
  assert.deepEqual(codes('diwali-26'), []);
  assert.deepEqual(codes('Spring_Sale'), []);
});

test('enforces 3–30 characters', () => {
  assert.ok(codes('ab').includes('length'));
  assert.ok(codes('a'.repeat(31)).includes('length'));
});

test('rejects other characters', () => {
  assert.ok(codes('hello world').includes('chars'));
  assert.ok(codes('sale!').includes('chars'));
});

test('reserved routes are refused case-insensitively', () => {
  assert.ok(codes('API').includes('reserved'));
  assert.ok(codes('admin').includes('reserved'));
});

test('blocked words are refused', () => {
  assert.ok(codes('free-porn').includes('blocked_word'));
});

test('suggestions skip taken aliases', async () => {
  const taken = new Set(['diwali-26']);
  const s = await suggestAliases('diwali', async c => taken.has(c), { year: 2026 });
  assert.equal(s.length, 3);
  assert.ok(!s.includes('diwali-26'));
  assert.equal(s[0], 'diwali-2026');
});
