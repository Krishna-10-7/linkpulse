import os from 'node:os';
import { prisma } from '@linkpulse/db';
import { createRedis, keys, CLICK_GROUP } from '@linkpulse/runtime';
import { enrich, fieldsOf } from './enrich.js';
import { startHealthMonitor } from './health.js';

// Click worker: reads the "clicks" stream through a consumer group, so if this
// process stops, events wait in Redis and are picked up again on restart.

const r = createRedis();
const consumer = `${os.hostname()}-${process.pid}`;
const BATCH = 200;
let running = true;

async function ensureGroup() {
  try { await r.xgroup('CREATE', keys.clickStream, CLICK_GROUP, '0', 'MKSTREAM'); }
  catch (err) { if (!String(err.message).includes('BUSYGROUP')) throw err; }
}

function countBy(list, key) {
  const m = new Map();
  for (const x of list) m.set(key(x), (m.get(key(x)) || 0) + 1);
  return m;
}

const dayOf = d => d.toISOString().slice(0, 10);

/** A visitor counts once per link per day: SET NX on a hashed key that expires after two days. */
async function markUniques(rows) {
  const pipe = r.pipeline();
  for (const c of rows) pipe.set(keys.unique(c.linkId, dayOf(c.ts), c.visitorHash), '1', 'EX', 172800, 'NX');
  const res = await pipe.exec();
  rows.forEach((c, i) => { c.isUnique = !c.isBot && res[i][1] === 'OK'; });
}

function rollups(rows) {
  const m = new Map();
  for (const c of rows) {
    const k = `${c.linkId}|${dayOf(c.ts)}`;
    const d = m.get(k) || { linkId: c.linkId, day: dayOf(c.ts), clicks: 0, uniques: 0, bots: 0, qr: 0 };
    if (c.isBot) d.bots++; else { d.clicks++; if (c.isUnique) d.uniques++; if (c.viaQr) d.qr++; }
    m.set(k, d);
  }
  return [...m.values()];
}

/** The API relays these to dashboards over server-sent events. */
function publishLive(rows, owners) {
  for (const c of rows) {
    r.publish(keys.liveChannel, JSON.stringify({
      linkId: c.linkId, ownerId: owners.get(c.linkId), ts: c.ts, isBot: c.isBot, isUnique: c.isUnique,
      deviceType: c.deviceType, country: c.country, source: c.source, browser: c.browser,
    })).catch(() => {});
  }
}

async function processBatch(entries) {
  if (!entries.length) return;
  const rows = [], ids = [], owners = new Map();
  for (const [id, arr] of entries) {
    ids.push(id);
    const f = fieldsOf(arr);
    if (!f.linkId) continue;
    owners.set(f.linkId, f.ownerId);
    rows.push(enrich(f));
  }
  if (rows.length) {
    await markUniques(rows);
    // Links can be archived but are never deleted, so the foreign key holds.
    await prisma.$transaction(async tx => {
      await tx.clickEvent.createMany({ data: rows });
      for (const [linkId, n] of countBy(rows.filter(c => !c.isBot), c => c.linkId)) {
        await tx.link.update({ where: { id: linkId }, data: { clickCount: { increment: n } } });
      }
      for (const d of rollups(rows)) {
        await tx.$executeRaw`
          INSERT INTO "ClickDaily" ("linkId", "day", "clicks", "uniques", "bots", "qr")
          VALUES (${d.linkId}, ${d.day}::date, ${d.clicks}, ${d.uniques}, ${d.bots}, ${d.qr})
          ON CONFLICT ("linkId", "day") DO UPDATE SET
            "clicks" = "ClickDaily"."clicks" + EXCLUDED."clicks", "uniques" = "ClickDaily"."uniques" + EXCLUDED."uniques",
            "bots" = "ClickDaily"."bots" + EXCLUDED."bots", "qr" = "ClickDaily"."qr" + EXCLUDED."qr"`;
      }
    });
    publishLive(rows, owners);
  }
  await r.xack(keys.clickStream, CLICK_GROUP, ...ids);
}

async function loop() {
  await ensureGroup();
  // First drain anything this consumer read but never acknowledged.
  let start = '0';
  while (running) {
    const res = await r.xreadgroup('GROUP', CLICK_GROUP, consumer, 'COUNT', BATCH, 'BLOCK', 5000, 'STREAMS', keys.clickStream, start);
    const entries = res?.[0]?.[1] ?? [];
    if (start === '0' && entries.length === 0) { start = '>'; continue; }
    try { await processBatch(entries); }
    catch (err) { console.error('[worker] batch failed, will retry', err.message); start = '0'; await new Promise(s => setTimeout(s, 2000)); }
  }
}

process.on('SIGTERM', () => { running = false; });
process.on('SIGINT', () => { running = false; });
console.log(`[worker] ${consumer} reading ${keys.clickStream}`);
const health = startHealthMonitor();
process.on('SIGTERM', () => clearInterval(health));
loop().catch(err => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect().then(() => r.quit()));
