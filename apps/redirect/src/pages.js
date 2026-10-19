import { config } from '@linkpulse/runtime';

// Server-rendered visitor pages: not found, expired, disabled, password, preview.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CSS = `
:root{--paper:#f4f2ea;--card:#fffefb;--ink:#15161c;--muted:#6f6c62;--mark:#ddf75b;--coral:#ff5b3a;--line:rgba(21,22,28,.14)}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--paper);color:var(--ink);font:16px/1.5 Inter,"Segoe UI",system-ui,sans-serif}
.card{width:100%;max-width:520px;background:var(--card);border:2px solid var(--ink);border-radius:22px;box-shadow:6px 6px 0 var(--ink);padding:32px}
.brand{display:flex;align-items:center;gap:10px;font:700 13px ui-monospace,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;margin-bottom:22px}
.brand svg{width:28px;height:28px}
.tag{display:inline-block;font:700 12px ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;padding:4px 10px;border-radius:8px;border:1.5px solid var(--ink);background:var(--mark)}
.tag.bad{background:#ffe4dc;border-color:#c63b20;color:#c63b20}
h1{font:600 34px/1.1 Georgia,"Times New Roman",serif;letter-spacing:-.02em;margin:14px 0 8px}
p{margin:0 0 14px;color:#3f3e39}.muted{color:var(--muted);font-size:14px}
code,.mono{font-family:ui-monospace,Consolas,monospace;word-break:break-all}
.dest{padding:12px 14px;border-radius:12px;background:var(--paper);border:1.5px solid var(--line);margin:12px 0 18px}
input{width:100%;height:46px;border:2px solid var(--ink);border-radius:12px;padding:0 14px;font:inherit;margin:6px 0 12px}
button,.btn{display:inline-block;height:46px;line-height:42px;padding:0 20px;border-radius:12px;border:2px solid var(--ink);background:var(--ink);color:var(--mark);font:700 15px ui-monospace,Consolas,monospace;cursor:pointer;text-decoration:none}
.btn.ghost{background:#fff;color:var(--ink)}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.err{color:#c63b20;font-weight:600}details{margin-top:18px}summary{cursor:pointer;color:var(--muted);font-size:14px}
select,textarea{width:100%;border:2px solid var(--ink);border-radius:12px;padding:10px 12px;font:inherit;margin:6px 0 12px}`;

const LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#15161c"/><polyline points="8,34 20,34 26,20 34,48 42,12 48,34 56,34" fill="none" stroke="#ddf75b" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/></svg>';

export function page({ title, tag, bad = false, heading, body }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} · LinkPulse</title><style>${CSS}</style></head>
<body><main class="card"><div class="brand">${LOGO}LinkPulse</div>${tag ? `<span class="tag${bad ? ' bad' : ''}">${esc(tag)}</span>` : ''}
<h1>${esc(heading)}</h1>${body}</main></body></html>`;
}

const reportForm = code => `<details><summary>Report this link</summary>
<form method="post" action="${config.basePath}/api/report"><input type="hidden" name="code" value="${esc(code)}">
<select name="reason"><option value="phishing">Phishing or scam</option><option value="malware">Malware</option><option value="spam">Spam</option><option value="other">Something else</option></select>
<button type="submit">Send report</button></form></details>`;

export const pages = {
  notFound: code => page({ title: 'Link not found', tag: '404', heading: 'This link does not exist.', body: `<p>No LinkPulse link uses <code>${esc(code)}</code>. Check the address for typos.</p>` }),
  disabled: code => page({ title: 'Link disabled', tag: 'Disabled for safety', bad: true, heading: 'This link has been disabled.', body: '<p>Our team disabled this link because it was reported as unsafe. We have stopped redirecting visitors to it.</p><p class="muted">If you own this link and think this is a mistake, contact the workspace admin.</p>' }),
  inactive: () => page({ title: 'Link inactive', tag: 'Inactive', heading: 'This link is not active.', body: '<p>The owner has paused or archived this link.</p>' }),
  notLive: startsAt => page({ title: 'Not live yet', tag: 'Scheduled', heading: 'This link is not live yet.', body: `<p>It opens on <strong>${esc(new Date(startsAt).toUTCString())}</strong>.</p>` }),
  expired: expiresAt => page({ title: 'Link expired', tag: 'Expired', heading: 'This link has expired.', body: `<p>It stopped working on <strong>${esc(new Date(expiresAt).toUTCString())}</strong>.</p>` }),
  limit: () => page({ title: 'Link limit reached', tag: 'Limit reached', heading: 'This link has reached its click limit.', body: '<p>The owner capped how many times it can be opened, and that number has been reached.</p>' }),
  password: (code, error, query = '') => page({ title: 'Password required', tag: 'Protected', heading: 'Enter the password to continue.', body: `
<form method="post" action="${config.basePath}/${esc(code)}/unlock${esc(query)}"><label for="pw" class="muted">Password</label>
<input id="pw" name="password" type="password" autocomplete="current-password" autofocus required>
${error ? `<p class="err">${esc(error)}</p>` : ''}<button type="submit">Unlock link</button></form>` }),
  tooMany: () => page({ title: 'Too many attempts', tag: 'Slow down', bad: true, heading: 'Too many password attempts.', body: '<p>Please wait 15 minutes and try again.</p>' }),
  preview: ({ link, state, shortUrl }) => page({
    title: 'Link preview', tag: state.ok ? 'Safe preview' : state.label, bad: !state.ok, heading: link.title || 'Where this link goes',
    body: `<p class="muted">${esc(shortUrl)} leads to:</p><div class="dest mono">${esc(link.destination)}</div>
<p class="muted">Created ${esc(new Date(link.createdAt).toDateString())}${link.passwordHash ? ' · password protected' : ''}${link.expiresAt ? ` · expires ${esc(new Date(link.expiresAt).toDateString())}` : ''}</p>
<div class="row">${state.ok ? `<a class="btn" href="${esc(shortUrl)}">Continue</a>` : ''}<a class="btn ghost" href="${config.basePath}/app/">Make your own link</a></div>${reportForm(link.code)}`,
  }),
};
