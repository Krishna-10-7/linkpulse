import os from 'node:os';
import { prisma } from '@linkpulse/db';
import { createRedis, keys, CLICK_GROUP } from '@linkpulse/runtime';
import { enrich, fieldsOf } from './enrich.js';

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

async function processBatch(entries) {
  if (!entries.length) return;
  const rows = [], ids = [];
  for (const [id, arr] of entries) {
    ids.push(id);
    const f = fieldsOf(arr);
    if (!f.linkId) continue;
    rows.push(enrich(f));
  }
  if (rows.length) {
    // Links can be archived but are never deleted, so the foreign key holds.
    await prisma.clickEvent.createMany({ data: rows });
    const humans = new Map();
    for (const c of rows) if (!c.isBot) humans.set(c.linkId, (humans.get(c.linkId) || 0) + 1);
    for (const [linkId, n] of humans) await prisma.link.update({ where: { id: linkId }, data: { clickCount: { increment: n } } });
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
loop().catch(err => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect().then(() => r.quit()));
