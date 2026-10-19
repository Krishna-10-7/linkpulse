import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDestination, normalizeUrl, matchBlocked } from '../src/url.js';

const codes = r => r.errors.map(e => e.code);
const warns = r => r.warnings.map(w => w.code);

test('adds https when the scheme is missing', () => {
  assert.equal(normalizeUrl('  example.com/a '), 'https://example.com/a');
  assert.equal(validateDestination('example.com').url, 'https://example.com/');
});

test('rejects dangerous schemes', () => {
  assert.deepEqual(codes(validateDestination('javascript:alert(1)')), ['scheme']);
  assert.ok(codes(validateDestination('data:text/html,hi')).includes('scheme'));
  assert.ok(codes(validateDestination('file:///etc/passwd')).includes('scheme'));
});

test('blocks private and internal destinations (SSRF)', () => {
  for (const u of ['http://127.0.0.1/', 'http://10.0.0.5', 'http://192.168.1.1', 'http://172.20.0.1',
    'http://169.254.169.254/latest', 'http://[::1]/', 'http://localhost:3000', 'http://printer.local', 'http://intranet']) {
    assert.ok(codes(validateDestination(u)).includes('private'), u);
  }
  assert.deepEqual(codes(validateDestination('https://172.32.0.1')), []);
});

test('blocklist matches the domain and its subdomains', () => {
  const blocked = new Set(['evil.example']);
  assert.ok(codes(validateDestination('https://login.evil.example/x', { blockedDomains: blocked })).includes('blocked'));
  assert.equal(matchBlocked('notevil.example', blocked), null);
});

test('own short domain is a loop, other shorteners are a warning', () => {
  const opts = { ownHost: 'r2-d2.xyz', ownPath: '/lk' };
  assert.ok(codes(validateDestination('https://r2-d2.xyz/lk/abc', opts)).includes('loop'));
  assert.deepEqual(codes(validateDestination('https://r2-d2.xyz/orbit/', opts)), []);
  assert.ok(warns(validateDestination('https://bit.ly/x')).includes('shortener'));
});

test('credentials in URLs are rejected, plain http is a warning', () => {
  assert.ok(codes(validateDestination('https://user:pw@example.com')).includes('credentials'));
  assert.ok(warns(validateDestination('http://example.com')).includes('insecure'));
});
