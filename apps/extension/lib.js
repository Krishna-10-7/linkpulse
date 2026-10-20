// Shared by the service worker, popup and options page.

export const DEFAULT_SERVER = 'https://r2-d2.xyz/lk';

export async function getSettings() {
  const { server = DEFAULT_SERVER, token = '' } = await chrome.storage.sync.get(['server', 'token']);
  return { server: server.replace(/\/+$/, ''), token };
}

export class NotConfigured extends Error {}

/** Call the LinkPulse API with the personal access token. */
export async function call(path, { method = 'GET', body } = {}) {
  const { server, token } = await getSettings();
  if (!token) throw new NotConfigured('Add your access token in the extension options first.');
  const res = await fetch(`${server}/api${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.errors?.[0]?.message || data?.error?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data?.error;
    throw err;
  }
  return data;
}

/** An active link you already made for this exact URL, if any. */
export async function findExisting(url) {
  const { items } = await call(`/links?status=ACTIVE&pageSize=1&destination=${encodeURIComponent(url)}`);
  return items[0] || null;
}

/**
 * Shorten a URL. Without a custom alias or other options, an existing active link
 * for the same URL is reused instead of creating a duplicate (reused: true).
 */
export async function shorten(url, extra = {}, { reuse = true } = {}) {
  const plain = !Object.values(extra).some(v => v !== null && v !== undefined && v !== '');
  if (reuse && plain) {
    const existing = await findExisting(url).catch(() => null);
    if (existing) {
      await remember(existing);
      return { link: existing, warnings: [], reused: true };
    }
  }
  const { link, warnings } = await call('/links', { method: 'POST', body: { destination: url, ...extra } });
  await remember(link);
  return { link, warnings, reused: false };
}

async function remember(link) {
  const { recent = [] } = await chrome.storage.local.get('recent');
  const item = { id: link.id, shortUrl: link.shortUrl, destination: link.destination, title: link.title, at: Date.now() };
  await chrome.storage.local.set({ recent: [item, ...recent.filter(r => r.id !== link.id)].slice(0, 8) });
}

export function isShortenable(url) {
  return /^https?:\/\//i.test(url || '');
}
