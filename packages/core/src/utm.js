// UTM builder used by the link wizard. The campaign name fills utm_campaign by default.

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

export function slugify(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/**
 * Merge UTM parameters into a destination URL. Existing query parameters are kept,
 * empty values are skipped, explicit values win over the campaign default.
 */
export function applyUtm(destination, utm = {}, { campaignName } = {}) {
  let u;
  try { u = new URL(destination); } catch { return destination; }
  const values = { ...utm };
  if (!values.utm_campaign && campaignName) values.utm_campaign = slugify(campaignName);
  for (const k of UTM_KEYS) {
    const v = String(values[k] ?? '').trim();
    if (v) u.searchParams.set(k, v);
  }
  return u.toString();
}

export function readUtm(destination) {
  try {
    const u = new URL(destination);
    return Object.fromEntries(UTM_KEYS.filter(k => u.searchParams.has(k)).map(k => [k, u.searchParams.get(k)]));
  } catch { return {}; }
}
