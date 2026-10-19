import { z } from 'zod';
import { prisma } from '@linkpulse/db';
import { parseCsv, validateRows, summarize, errorReportCsv, CSV_TEMPLATE } from '@linkpulse/core';
import { config } from '@linkpulse/runtime';
import { requireUser } from '../plugins/auth.js';
import { parse, badRequest, notFound } from '../lib/http.js';
import { enforce } from '../lib/limit.js';
import { blockedDomains } from '../lib/validation.js';
import { createLink } from '../lib/links.js';

// Bulk import: upload CSV text, preview every row with the wizard's rules,
// then import the valid rows in the background while the page shows progress.

const Upload = z.object({ csv: z.string().min(1, 'The file is empty.').max(2_000_000), filename: z.string().max(200).default('import.csv') });

async function check(csv) {
  const parsed = parseCsv(csv);
  if (parsed.headerError) throw badRequest(parsed.headerError);
  if (!parsed.rows.length) throw badRequest('No rows found under the header.');
  const aliases = parsed.rows.map(r => String(r.alias || '').trim().toLowerCase()).filter(Boolean);
  const taken = aliases.length ? await prisma.link.findMany({ where: { codeLower: { in: aliases } }, select: { codeLower: true } }) : [];
  const results = validateRows(parsed.rows, {
    takenAliases: new Set(taken.map(t => t.codeLower)), blockedDomains: await blockedDomains(),
    ownHost: config.publicHost, ownPath: config.basePath,
  });
  return { results, truncated: parsed.truncated, parseErrors: parsed.parseErrors };
}

async function runJob(jobId, user, results, log) {
  await prisma.importJob.update({ where: { id: jobId }, data: { status: 'RUNNING' } });
  let imported = 0;
  try {
    for (const r of results) {
      if (r.status !== 'valid') continue;
      const row = await prisma.importRow.findFirst({ where: { jobId, rowNumber: r.rowNumber } });
      try {
        const { campaign, ...data } = r.data;
        const link = await createLink(user, { ...data, campaignName: campaign });
        imported++;
        await prisma.importRow.update({ where: { id: row.id }, data: { status: 'imported', linkId: link.id } });
      } catch (err) {
        const msg = err.code === 'P2002' ? 'Alias was taken while importing.' : 'Could not create this link.';
        await prisma.importRow.update({ where: { id: row.id }, data: { status: 'invalid', message: msg } });
      }
      if (imported % 10 === 0) await prisma.importJob.update({ where: { id: jobId }, data: { imported } });
    }
    await prisma.importJob.update({ where: { id: jobId }, data: { status: 'DONE', imported, finishedAt: new Date() } });
  } catch (err) {
    log.error({ err }, 'import job failed');
    await prisma.importJob.update({ where: { id: jobId }, data: { status: 'FAILED', imported, finishedAt: new Date() } });
  }
}

export async function importRoutes(app) {
  app.addHook('preHandler', requireUser);

  // A job that was running when the process stopped will never finish; mark it so the page does not wait forever.
  await prisma.importJob.updateMany({ where: { status: { in: ['QUEUED', 'RUNNING'] }, createdAt: { lt: new Date(Date.now() - 60_000) } }, data: { status: 'FAILED', finishedAt: new Date() } }).catch(() => {});

  app.get('/api/imports/template.csv', async (req, reply) =>
    reply.type('text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="linkpulse-import-template.csv"').send(CSV_TEMPLATE));

  app.post('/api/imports/preview', async req => {
    const body = parse(Upload, req.body);
    const { results, truncated, parseErrors } = await check(body.csv);
    return { summary: summarize(results), truncated, parseErrors, rows: results.map(({ raw, ...r }) => r) };
  });

  app.post('/api/imports', async (req, reply) => {
    await enforce('importJob', req.user.id);
    const body = parse(Upload, req.body);
    const { results } = await check(body.csv);
    const s = summarize(results);
    if (!s.valid) throw badRequest('There are no valid rows to import.');
    const job = await prisma.importJob.create({
      data: {
        userId: req.user.id, filename: body.filename, total: s.total, valid: s.valid, invalid: s.invalid, duplicates: s.duplicate,
        rows: { create: results.map(r => ({ rowNumber: r.rowNumber, raw: r.raw, status: r.status, message: r.messages.join(' ') || null })) },
      },
    });
    setImmediate(() => runJob(job.id, req.user, results, app.log));
    return reply.code(202).send({ job });
  });

  app.get('/api/imports', async req => ({
    items: await prisma.importJob.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
  }));

  app.get('/api/imports/:id', async req => {
    const job = await prisma.importJob.findFirst({ where: { id: req.params.id, userId: req.user.id }, include: { rows: { orderBy: { rowNumber: 'asc' } } } });
    if (!job) throw notFound('Import not found.');
    return { job };
  });

  app.get('/api/imports/:id/errors.csv', async (req, reply) => {
    const job = await prisma.importJob.findFirst({ where: { id: req.params.id, userId: req.user.id }, include: { rows: { orderBy: { rowNumber: 'asc' } } } });
    if (!job) throw notFound('Import not found.');
    const csv = errorReportCsv(job.rows.map(r => ({ rowNumber: r.rowNumber, status: r.status, messages: [r.message || ''], raw: r.raw })));
    return reply.type('text/csv; charset=utf-8').header('content-disposition', `attachment; filename="import-errors-${job.id}.csv"`).send(csv);
  });
}
