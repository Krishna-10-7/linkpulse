import { prisma, Prisma } from '@linkpulse/db';
import { dayKey, startOfDay, addDays } from '@linkpulse/core';
import { config } from '@linkpulse/runtime';
import { badRequest } from './http.js';

// Shared analytics helpers. Daily numbers come from click_daily rollups,
// breakdowns (source, device, browser, country) from click_events within the period.

const DAY = 86400000;
const TZ = config.timezone;
const localDay = d => dayKey(d, TZ);           // calendar day of an instant in the workspace zone
const dateKey = d => d.toISOString().slice(0, 10); // value of a @db.Date column
export const PERIODS = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };

/** period=7d, or from/to ISO dates. Returns { from, to, days, hourly, prevFrom, prevTo }. */
export function parsePeriod({ period = '7d', from, to } = {}) {
  let start, end = new Date();
  if (from || to) {
    const dateOnly = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v));
    start = !from ? new Date(Date.now() - 7 * DAY) : dateOnly(from) ? startOfDay(from, TZ) : new Date(from);
    end = !to ? new Date() : dateOnly(to) ? new Date(startOfDay(addDays(to, 1), TZ).getTime() - 1) : new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) throw badRequest('Invalid date range.');
    if (end - start > 366 * DAY) throw badRequest('Ranges are limited to one year.');
  } else {
    const days = PERIODS[period];
    if (!days) throw badRequest('period must be one of 24h, 7d, 30d, 90d.');
    start = days === 1 ? new Date(end.getTime() - DAY) : startOfDay(addDays(localDay(end), -(days - 1)), TZ);
  }
  const span = end - start;
  return { from: start, to: end, hourly: span <= 2 * DAY, prevFrom: new Date(start.getTime() - span), prevTo: start };
}

/** Zero-filled series: [{ t, clicks, uniques, bots }] by day, or by hour for ranges up to 48 h. */
export async function timeseries(linkIds, p) {
  if (!linkIds.length) return [];
  if (p.hourly) {
    const rows = await prisma.$queryRaw`
      SELECT date_trunc('hour', "ts") AS t,
             COUNT(*) FILTER (WHERE NOT "isBot")::int AS clicks,
             COUNT(*) FILTER (WHERE "isUnique")::int AS uniques,
             COUNT(*) FILTER (WHERE "isBot")::int AS bots
      FROM "ClickEvent" WHERE "linkId" IN (${Prisma.join(linkIds)}) AND "ts" >= ${p.from} AND "ts" <= ${p.to}
      GROUP BY 1 ORDER BY 1`;
    const map = new Map(rows.map(r => [new Date(r.t).toISOString(), r]));
    const out = [];
    for (let t = new Date(Math.floor(p.from.getTime() / 3600000) * 3600000); t <= p.to; t = new Date(t.getTime() + 3600000)) {
      const r = map.get(t.toISOString());
      out.push({ t: t.toISOString(), clicks: r?.clicks ?? 0, uniques: r?.uniques ?? 0, bots: r?.bots ?? 0 });
    }
    return out;
  }
  const first = localDay(p.from), last = localDay(p.to);
  const rows = await prisma.clickDaily.groupBy({
    by: ['day'], where: { linkId: { in: linkIds }, day: { gte: new Date(first), lte: new Date(last) } },
    _sum: { clicks: true, uniques: true, bots: true, qr: true },
  });
  const map = new Map(rows.map(r => [dateKey(r.day), r._sum]));
  const out = [];
  for (let day = first; day <= last; day = addDays(day, 1)) {
    const s = map.get(day);
    out.push({ t: day, clicks: s?.clicks ?? 0, uniques: s?.uniques ?? 0, bots: s?.bots ?? 0, qr: s?.qr ?? 0 });
  }
  return out;
}

export async function totals(linkIds, from, to) {
  if (!linkIds.length) return { clicks: 0, uniques: 0, bots: 0, qr: 0 };
  const where = { linkId: { in: linkIds }, ts: { gte: from, lte: to } };
  const [clicks, uniques, bots, qr] = await Promise.all([
    prisma.clickEvent.count({ where: { ...where, isBot: false } }),
    prisma.clickEvent.count({ where: { ...where, isUnique: true } }),
    prisma.clickEvent.count({ where: { ...where, isBot: true } }),
    prisma.clickEvent.count({ where: { ...where, isBot: false, viaQr: true } }),
  ]);
  return { clicks, uniques, bots, qr };
}

/** Human clicks grouped by one column, largest first. */
export async function breakdown(linkIds, p, field, take = 8) {
  if (!linkIds.length) return [];
  const rows = await prisma.clickEvent.groupBy({
    by: [field], where: { linkId: { in: linkIds }, ts: { gte: p.from, lte: p.to }, isBot: false },
    _count: { _all: true }, orderBy: { _count: { [field]: 'desc' } }, take,
  });
  return rows.map(r => ({ key: r[field] ?? 'Unknown', clicks: r._count._all }));
}

export const change = (now, before) => (before === 0 ? (now > 0 ? null : 0) : Math.round(((now - before) / before) * 100));
