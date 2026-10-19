import { getSettings, call, shorten, isShortenable } from './lib.js';

const $ = id => document.getElementById(id);
let current = null;

async function init() {
  const { token } = await getSettings();
  $('opts').onclick = $('openOptions').onclick = e => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
  renderRecent();
  if (!token) { $('setup').hidden = false; return; }

  $('form').hidden = false;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $('url').value = isShortenable(tab?.url) ? tab.url : '';
  $('alias').focus();
  call('/campaigns').then(({ items }) => {
    for (const c of items) $('campaign').append(new Option(c.name, c.id));
  }).catch(() => {});
}

async function go() {
  const url = $('url').value.trim();
  $('error').hidden = true;
  if (!url) return;
  $('go').disabled = true; $('go').textContent = 'Shortening…';
  try {
    const expires = $('expires').value;
    const { link, warnings } = await shorten(url, {
      alias: $('alias').value.trim() || null,
      campaignId: $('campaign').value || null,
      expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
    });
    current = link;
    await navigator.clipboard.writeText(link.shortUrl).catch(() => {});
    $('short').textContent = link.shortUrl.replace(/^https?:\/\//, '');
    $('warn').textContent = warnings?.[0]?.message || '';
    await showQr(link);
    $('form').hidden = true; $('result').hidden = false;
    renderRecent();
  } catch (err) {
    const suggestions = err.data?.suggestions?.length ? ` Try ${err.data.suggestions.join(', ')}.` : '';
    $('error').textContent = err.message + suggestions;
    $('error').hidden = false;
  } finally { $('go').disabled = false; $('go').textContent = 'Shorten and copy'; }
}

// The QR endpoint needs the token, so fetch it and show it as a blob.
async function showQr(link) {
  const { server, token } = await getSettings();
  const res = await fetch(`${server}/api/links/${link.id}/qr.svg`, { headers: { authorization: `Bearer ${token}` } });
  if (res.ok) $('qr').src = URL.createObjectURL(await res.blob());
}

async function renderRecent() {
  const { recent = [] } = await chrome.storage.local.get('recent');
  const ul = $('recent');
  ul.replaceChildren();
  if (!recent.length) { ul.innerHTML = '<li class="muted">Nothing yet.</li>'; return; }
  for (const r of recent.slice(0, 5)) {
    const li = document.createElement('li');
    li.innerHTML = `<div class="row" style="justify-content:space-between"><span class="mono" style="font-size:12px;font-weight:700"></span><button class="ghost" style="height:26px;padding:0 8px;font-size:11px">Copy</button></div><div class="muted" style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>`;
    li.querySelector('.mono').textContent = r.shortUrl.replace(/^https?:\/\//, '');
    li.querySelector('.muted').textContent = r.title || r.destination;
    li.querySelector('button').onclick = () => navigator.clipboard.writeText(r.shortUrl);
    ul.append(li);
  }
}

$('go').onclick = go;
$('alias').onkeydown = $('url').onkeydown = e => { if (e.key === 'Enter') go(); };
$('copy').onclick = () => current && navigator.clipboard.writeText(current.shortUrl);
$('analytics').onclick = async () => {
  const { server } = await getSettings();
  chrome.tabs.create({ url: `${server}/app/link/?id=${current.id}` });
};
init();
