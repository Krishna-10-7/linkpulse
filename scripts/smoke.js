// End-to-end smoke test against a running deployment:
// sign in → create a link → follow it → see the click in analytics → bot filtered → archive.
//
//   SMOKE_BASE=https://r2-d2.xyz/lk SMOKE_EMAIL=demo@linkpulse.app SMOKE_PASSWORD=... npm run smoke

const BASE = (process.env.SMOKE_BASE || process.env.PUBLIC_BASE_URL || 'http://localhost:8440/lk').replace(/\/+$/, '');
const EMAIL = process.env.SMOKE_EMAIL || 'demo@linkpulse.app';
const PASSWORD = process.env.SMOKE_PASSWORD || 'pulse-demo-2026';
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

let cookie = '';
let failures = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: res.status, data: await res.json().catch(() => null) };
}

function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const health = await api('/health');
check('API and database are healthy', health.status === 200 && health.data?.ok, JSON.stringify(health.data));

const login = await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
check('sign in', login.status === 200, `HTTP ${login.status}`);

const alias = `smoke-${Date.now().toString(36)}`;
const created = await api('/links', { method: 'POST', body: { destination: 'https://example.com/?smoke=1', alias, clickLimit: 5 } });
check('create link', created.status === 201, created.data?.link?.shortUrl || JSON.stringify(created.data));
const link = created.data?.link;

if (link) {
  const r1 = await fetch(`${BASE}/${alias}`, { redirect: 'manual', headers: { 'user-agent': BROWSER } });
  check('short link redirects with 302', r1.status === 302 && r1.headers.get('location')?.startsWith('https://example.com/'), `HTTP ${r1.status}`);
  const r2 = await fetch(`${BASE}/${alias}`, { redirect: 'manual', headers: { 'user-agent': 'Slackbot-LinkExpanding 1.0' } });
  check('preview bot is still redirected', r2.status === 302, `HTTP ${r2.status}`);
  const preview = await fetch(`${BASE}/${alias}+`);
  check('safe preview page', preview.status === 200 && (await preview.text()).includes('example.com'));
  const missing = await fetch(`${BASE}/no-such-${alias}`, { redirect: 'manual' });
  check('unknown code is 404', missing.status === 404);

  let stats;
  for (let i = 0; i < 10; i++) {
    await sleep(1000);
    stats = await api(`/links/${link.id}/analytics?period=24h`);
    if (stats.data?.totals?.clicks >= 1 && stats.data?.totals?.bots >= 1) break;
  }
  check('click recorded by the worker', stats.data?.totals?.clicks === 1, `clicks=${stats.data?.totals?.clicks}`);
  check('bot filtered out of totals', stats.data?.totals?.bots === 1, `bots=${stats.data?.totals?.bots}`);

  const archived = await api(`/links/${link.id}`, { method: 'DELETE' });
  check('archive link', archived.data?.link?.status === 'ARCHIVED');
  const r3 = await fetch(`${BASE}/${alias}`, { redirect: 'manual', headers: { 'user-agent': BROWSER } });
  check('archived link stops redirecting (410)', r3.status === 410, `HTTP ${r3.status}`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
