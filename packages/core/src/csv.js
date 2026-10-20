import Papa from 'papaparse';
import { validateDestination } from './url.js';
import { validateAlias } from './alias.js';

export const CSV_COLUMNS = ['destination_url', 'alias', 'title', 'campaign', 'tags', 'expires_at', 'click_limit'];
export const MAX_IMPORT_ROWS = 1000;

export const CSV_TEMPLATE = CSV_COLUMNS.join(',') + '\n' +
  'https://shop.example.com/festive/kurtas,diwali-kurtas,Festive kurtas,Diwali,festive;apparel,2026-11-30,5000\n' +
  'https://shop.example.com/sale,,Flash sale,Diwali,sale,,500\n';

const ALIASES = { url: 'destination_url', destination: 'destination_url', link: 'destination_url', long_url: 'destination_url',
  code: 'alias', slug: 'alias', short_code: 'alias', name: 'title', expiry: 'expires_at', expires: 'expires_at',
  limit: 'click_limit', max_clicks: 'click_limit', tag: 'tags' };

function headerKey(h) {
  const k = String(h).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ALIASES[k] || k;
}

/** Parse CSV text into normalised row objects. */
export function parseCsv(text) {
  const res = Papa.parse(String(text || '').replace(/^﻿/, ''), { header: true, skipEmptyLines: 'greedy', transformHeader: headerKey });
  const missing = res.meta.fields && !res.meta.fields.includes('destination_url');
  return {
    rows: res.data.slice(0, MAX_IMPORT_ROWS),
    truncated: res.data.length > MAX_IMPORT_ROWS,
    headerError: missing ? 'The CSV needs a destination_url column.' : null,
    parseErrors: res.errors.slice(0, 20).map(e => ({ row: (e.row ?? 0) + 2, message: e.message })),
  };
}

function parseDate(v) {
  const s = String(v || '').trim();
  if (!s) return { value: null };
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T23:59:59' : s);
  return Number.isNaN(d.getTime()) ? { error: `“${s}” is not a date (use YYYY-MM-DD).` } : { value: d };
}

/**
 * Validate parsed rows with the same rules as the link wizard.
 * @param rows        parsed rows
 * @param ctx         { takenAliases: Set<lowercase>, blockedDomains: Set, ownHost, ownPath, now }
 * Each result: { rowNumber, status: 'valid'|'invalid'|'duplicate', messages[], data }
 */
export function validateRows(rows, ctx = {}) {
  const seen = new Map();
  const now = ctx.now ?? new Date();
  return rows.map((raw, i) => {
    const rowNumber = i + 2; // header is row 1
    const messages = [];
    let status = 'valid';
    const dest = validateDestination(raw.destination_url, ctx);
    if (dest.errors.length) { status = 'invalid'; messages.push(...dest.errors.map(e => e.message)); }

    const aliasRaw = String(raw.alias || '').trim();
    if (aliasRaw) {
      const a = validateAlias(aliasRaw);
      if (a.errors.length) { status = 'invalid'; messages.push(...a.errors.map(e => e.message)); }
      const lower = aliasRaw.toLowerCase();
      if (seen.has(lower)) {
        if (status === 'valid') status = 'duplicate';
        messages.push(`Alias “${aliasRaw}” is repeated (row ${seen.get(lower)}).`);
      } else seen.set(lower, rowNumber);
      if (status === 'valid' && ctx.takenAliases?.has(lower)) { status = 'duplicate'; messages.push(`Alias “${aliasRaw}” is already taken.`); }
    }

    const exp = parseDate(raw.expires_at);
    if (exp.error) { status = 'invalid'; messages.push(exp.error); }
    else if (exp.value && exp.value <= now) { status = 'invalid'; messages.push('Expiry date is in the past.'); }

    let clickLimit = null;
    const cl = String(raw.click_limit || '').trim();
    if (cl) {
      clickLimit = Number(cl);
      if (!Number.isInteger(clickLimit) || clickLimit <= 0) { status = 'invalid'; messages.push('click_limit must be a whole number above 0.'); }
    }

    const tags = String(raw.tags || '').split(/[;|]/).map(t => t.trim()).filter(Boolean).slice(0, 10);
    return {
      rowNumber, status, messages,
      warnings: dest.warnings.map(w => w.message),
      data: { destination: dest.url, alias: aliasRaw || null, title: String(raw.title || '').trim() || null,
        campaign: String(raw.campaign || '').trim() || null, tags, expiresAt: exp.value ?? null, clickLimit },
      raw,
    };
  });
}

export function summarize(results) {
  const s = { total: results.length, valid: 0, invalid: 0, duplicate: 0 };
  for (const r of results) s[r.status]++;
  return s;
}

/** Rows that will not be imported, as a downloadable CSV. */
export function errorReportCsv(results) {
  const bad = results.filter(r => r.status !== 'valid' && r.status !== 'imported');
  return Papa.unparse(bad.map(r => ({ row: r.rowNumber, status: r.status, problem: r.messages.join(' '), ...r.raw })));
}

/** Rows (array of plain objects) to CSV text, for exports. */
export function toCsv(rows, columns) {
  return Papa.unparse(rows, columns ? { columns } : undefined);
}
