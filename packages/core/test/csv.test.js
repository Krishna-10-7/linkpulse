import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateRows, summarize, errorReportCsv, CSV_TEMPLATE } from '../src/csv.js';

const now = new Date('2026-10-19T00:00:00Z');

test('the template parses and validates cleanly', () => {
  const { rows, headerError } = parseCsv(CSV_TEMPLATE);
  assert.equal(headerError, null);
  const res = validateRows(rows, { now });
  assert.deepEqual(summarize(res), { total: 2, valid: 2, invalid: 0, duplicate: 0 });
  assert.deepEqual(res[0].data.tags, ['festive', 'apparel']);
  assert.equal(res[1].data.clickLimit, 500);
});

test('header aliases are understood', () => {
  const { rows } = parseCsv('URL,Slug,Max Clicks\nexample.com,abc-1,10\n');
  assert.equal(rows[0].destination_url, 'example.com');
  assert.equal(rows[0].alias, 'abc-1');
  assert.equal(rows[0].click_limit, '10');
});

test('missing destination column is a header error', () => {
  assert.ok(parseCsv('alias,title\nx,y\n').headerError);
});

test('invalid, duplicate in-file, taken and blocked rows are flagged with reasons', () => {
  const csv = [
    'destination_url,alias,expires_at,click_limit',
    'https://ok.example.com,promo-a,,',
    'javascript:alert(1),,,',
    'https://ok.example.com/2,promo-a,,',
    'https://ok.example.com/3,taken-one,,',
    'https://bad.example/x,,,',
    'https://ok.example.com/4,,2020-01-01,',
    'https://ok.example.com/5,,,-3',
  ].join('\n');
  const res = validateRows(parseCsv(csv).rows, { now, takenAliases: new Set(['taken-one']), blockedDomains: new Set(['bad.example']) });
  assert.deepEqual(res.map(r => r.status), ['valid', 'invalid', 'duplicate', 'duplicate', 'invalid', 'invalid', 'invalid']);
  assert.match(res[2].messages[0], /repeated \(row 2\)/);
  assert.match(res[4].messages.join(' '), /blocklist/);
  const report = errorReportCsv(res);
  assert.equal(report.trim().split('\n').length, 7); // header + 6 problem rows
});
