import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomCode, generateUniqueCode, BASE62 } from '../src/shortcode.js';

test('random codes are Base62 and the requested length', () => {
  for (let i = 0; i < 200; i++) {
    const c = randomCode();
    assert.equal(c.length, 7);
    for (const ch of c) assert.ok(BASE62.includes(ch));
  }
  assert.equal(randomCode(9).length, 9);
});

test('generateUniqueCode retries on collision', async () => {
  let calls = 0;
  const code = await generateUniqueCode(async () => ++calls < 3);
  assert.equal(calls, 3);
  assert.equal(code.length, 7);
});

test('generateUniqueCode grows the code after repeated collisions', async () => {
  let calls = 0;
  const code = await generateUniqueCode(async () => ++calls <= 5, { attempts: 5 });
  assert.equal(code.length, 8);
});

test('reserved codes are skipped', async () => {
  let n = 0;
  const code = await generateUniqueCode(async () => false, { isReserved: () => ++n === 1 });
  assert.ok(code);
  assert.equal(n, 2);
});
