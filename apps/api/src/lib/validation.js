import dns from 'node:dns/promises';
import { prisma } from '@linkpulse/db';
import { validateDestination, validateAlias, suggestAliases, isReserved, isPrivateIPv4, isPrivateIPv6 } from '@linkpulse/core';
import { config } from '@linkpulse/runtime';

// One validator for the wizard, the CSV import and the browser extension.
// Pure format checks come from @linkpulse/core; this adds the database and network checks.

let blockCache = { at: 0, set: new Set() };
export async function blockedDomains() {
  if (Date.now() - blockCache.at < 30_000) return blockCache.set;
  const rows = await prisma.blockedDomain.findMany({ select: { domain: true } });
  blockCache = { at: Date.now(), set: new Set(rows.map(r => r.domain.toLowerCase())) };
  return blockCache.set;
}
export function resetBlockCache() { blockCache.at = 0; }

export const aliasTaken = async lower => isReserved(lower) || !!(await prisma.link.findUnique({ where: { codeLower: lower }, select: { id: true } }));

/** Resolve the host and refuse names that point into private networks (DNS-based SSRF). */
async function resolvesPrivately(hostname) {
  try {
    const addrs = await dns.lookup(hostname, { all: true });
    return addrs.some(a => (a.family === 4 ? isPrivateIPv4(a.address) : isPrivateIPv6(a.address)));
  } catch { return null; } // does not resolve
}

/** Best-effort reachability check; also reads the page title for the link. */
export async function probe(url, timeoutMs = 4000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // redirect: 'manual' so a public URL cannot bounce the probe into a private network.
    const res = await fetch(url, { redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': 'LinkPulseBot/1.0 (+link validation)', accept: 'text/html,*/*' } });
    let title = null;
    if ((res.headers.get('content-type') || '').includes('text/html')) {
      const text = (await res.text()).slice(0, 200_000);
      const m = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(text);
      if (m) title = m[1].replace(/\s+/g, ' ').trim();
    }
    return { status: res.status, title };
  } catch { return { status: null, title: null }; } finally { clearTimeout(t); }
}

async function safeBrowsing(url) {
  if (!config.safeBrowsingKey) return null;
  try {
    const res = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${config.safeBrowsingKey}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'linkpulse', clientVersion: '0.1.0' },
        threatInfo: { threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'], platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'], threatEntries: [{ url }] },
      }),
    });
    const data = await res.json();
    return Array.isArray(data.matches) && data.matches.length > 0;
  } catch { return null; }
}

/**
 * Full validation. Returns { ok, url, title, errors[], warnings[], suggestions[] }.
 * `network: false` skips DNS, reachability and Safe Browsing (used for big CSV previews).
 */
export async function validateLinkInput({ destination, alias, expiresAt, startsAt, clickLimit }, { user, network = true, excludeLinkId } = {}) {
  const dest = validateDestination(destination, { ownHost: config.publicHost, ownPath: config.basePath, blockedDomains: await blockedDomains() });
  const errors = [...dest.errors], warnings = [...dest.warnings];
  let suggestions = [], title = null;

  if (alias) {
    const a = validateAlias(alias);
    errors.push(...a.errors);
    if (!a.errors.length) {
      const existing = await prisma.link.findUnique({ where: { codeLower: a.alias.toLowerCase() }, select: { id: true } });
      if (existing && existing.id !== excludeLinkId) {
        errors.push({ field: 'alias', code: 'taken', message: `“${a.alias}” is already taken.` });
        suggestions = await suggestAliases(a.alias, aliasTaken);
      }
    }
  }

  const now = new Date();
  if (expiresAt && new Date(expiresAt) <= now) errors.push({ field: 'expiresAt', code: 'past', message: 'The expiry date is in the past.' });
  if (startsAt && expiresAt && new Date(startsAt) >= new Date(expiresAt)) errors.push({ field: 'startsAt', code: 'order', message: 'The start date must be before the expiry date.' });
  if (clickLimit != null && (!Number.isInteger(clickLimit) || clickLimit <= 0)) errors.push({ field: 'clickLimit', code: 'invalid', message: 'The click limit must be above 0.' });

  if (dest.url && !dest.errors.length) {
    if (user) {
      const dup = await prisma.link.findFirst({ where: { ownerId: user.id, destination: dest.url, status: { not: 'ARCHIVED' }, ...(excludeLinkId ? { id: { not: excludeLinkId } } : {}) }, select: { code: true } });
      if (dup) warnings.push({ field: 'destination', code: 'duplicate', message: `You already shortened this URL as ${config.publicBaseUrl}/${dup.code}.`, existing: dup.code });
    }
    if (network) {
      const [priv, reach, unsafe] = await Promise.all([resolvesPrivately(dest.hostname), probe(dest.url), safeBrowsing(dest.url)]);
      if (priv === true) errors.push({ field: 'destination', code: 'private', message: 'This domain points to a private network address.' });
      if (priv === null) warnings.push({ field: 'destination', code: 'dns', message: 'This domain does not resolve right now.' });
      if (unsafe === true) errors.push({ field: 'destination', code: 'unsafe', message: 'Google Safe Browsing flags this URL as unsafe.' });
      if (reach.status === null && priv !== null) warnings.push({ field: 'destination', code: 'unreachable', message: 'We could not reach this page. It may be down or slow.' });
      else if (reach.status >= 400) warnings.push({ field: 'destination', code: 'http_error', message: `The page answered with HTTP ${reach.status}.` });
      title = reach.title;
    }
  }
  return { ok: errors.length === 0, url: dest.url, title, errors, warnings, suggestions };
}
