import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyUtm, readUtm, slugify } from '../src/utm.js';

test('campaign name becomes utm_campaign', () => {
  const u = applyUtm('https://shop.example.com/sale?ref=bio', { utm_source: 'instagram', utm_medium: 'story' }, { campaignName: 'Diwali 2026' });
  const p = new URL(u).searchParams;
  assert.equal(p.get('ref'), 'bio');
  assert.equal(p.get('utm_source'), 'instagram');
  assert.equal(p.get('utm_campaign'), 'diwali-2026');
});

test('explicit utm_campaign wins and empty values are skipped', () => {
  const u = applyUtm('https://x.example.com/', { utm_campaign: 'custom', utm_term: ' ' }, { campaignName: 'Ignored' });
  assert.deepEqual(readUtm(u), { utm_campaign: 'custom' });
});

test('slugify', () => {
  assert.equal(slugify('  Back to College!! '), 'back-to-college');
});
