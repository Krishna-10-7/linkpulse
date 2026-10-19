'use client';
import Link from 'next/link';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Badge, Button, Card, Empty, Notice, PageHeader, Spinner, cx } from '@/components/ui';
import { api, ApiError, BASE } from '@/lib/api';
import { dateTime, num } from '@/lib/format';

type Row = { rowNumber: number; status: 'valid' | 'invalid' | 'duplicate' | 'imported'; messages: string[]; warnings: string[]; data: { destination: string | null; alias: string | null; title: string | null; campaign: string | null } };
type Preview = { summary: { total: number; valid: number; invalid: number; duplicate: number }; truncated: boolean; rows: Row[] };
type Job = { id: string; filename: string; status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED'; total: number; valid: number; invalid: number; duplicates: number; imported: number; createdAt: string };

const STATUS: Record<string, string> = {
  valid: 'border-ink bg-mark', imported: 'border-ink bg-mark', invalid: 'border-coral/50 bg-coral-soft text-coral-ink', duplicate: 'border-[#f3d48a] bg-[#fff5dc] text-[#8a5a00]',
};

function Import() {
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [filter, setFilter] = useState<'all' | 'problems'>('all');
  const [job, setJob] = useState<Job | null>(null);
  const [history, setHistory] = useState<Job[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const loadHistory = () => api<{ items: Job[] }>('/imports').then(r => setHistory(r.items)).catch(() => {});
  useEffect(() => { loadHistory(); }, []);

  // Poll the running job until it finishes.
  useEffect(() => {
    if (!job || job.status === 'DONE' || job.status === 'FAILED') return;
    const t = setInterval(() => api<{ job: Job }>(`/imports/${job.id}`).then(r => { setJob(r.job); if (r.job.status === 'DONE' || r.job.status === 'FAILED') loadHistory(); }).catch(() => {}), 1500);
    return () => clearInterval(t);
  }, [job]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(null); setPreview(null); setJob(null);
    if (f.size > 2_000_000) { setErr('Files are limited to 2 MB (about 1,000 rows).'); return; }
    const csv = await f.text();
    setFile({ name: f.name, csv });
    setBusy(true);
    try { setPreview(await api<Preview>('/imports/preview', { method: 'POST', json: { csv, filename: f.name } })); }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Could not read the file.'); }
    finally { setBusy(false); }
  }

  async function runImport() {
    if (!file) return;
    setBusy(true); setErr(null);
    try { setJob((await api<{ job: Job }>('/imports', { method: 'POST', json: { csv: file.csv, filename: file.name } })).job); }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Import failed.'); }
    finally { setBusy(false); }
  }

  const s = preview?.summary;
  const rows = preview ? (filter === 'all' ? preview.rows : preview.rows.filter(r => r.status !== 'valid')) : [];
  const progress = job && job.valid ? Math.round((job.imported / job.valid) * 100) : 0;

  return (
    <>
      <PageHeader title={<>Bulk <span className="hl">import</span></>} sub="Upload a CSV. Every row is checked with the same rules as the wizard before anything is created."
        actions={<a href={`${BASE}/api/imports/template.csv`}><Button variant="ghost">Download template</Button></a>} />

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="label">Columns</div>
            <p className="mt-1 font-mono text-sm">destination_url, alias, title, campaign, tags, expires_at, click_limit</p>
            <p className="mt-1 text-xs text-muted">Only destination_url is required. Separate tags with ; — dates as YYYY-MM-DD.</p>
          </div>
          <div className="flex items-center gap-3">
            {file && <span className="font-mono text-sm">{file.name}</span>}
            <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            <Button onClick={() => input.current?.click()} disabled={busy}>{file ? 'Choose another file' : 'Choose CSV file'}</Button>
          </div>
        </div>
        {busy && !preview && <div className="mt-6 flex items-center gap-3 text-sm text-muted"><Spinner />Checking every row…</div>}
        {err && <div className="mt-4"><Notice tone="bad">{err}</Notice></div>}
      </Card>

      {preview && s && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="soft p-4"><div className="label">Rows</div><div className="font-display text-4xl font-semibold">{num(s.total)}</div></div>
            <div className="soft p-4"><div className="label">Valid</div><div className="font-display text-4xl font-semibold text-teal">{num(s.valid)}</div></div>
            <div className="soft p-4"><div className="label">Invalid</div><div className="font-display text-4xl font-semibold text-coral-ink">{num(s.invalid)}</div></div>
            <div className="soft p-4"><div className="label">Duplicates</div><div className="font-display text-4xl font-semibold text-[#8a5a00]">{num(s.duplicate)}</div></div>
          </div>
          {preview.truncated && <div className="mt-4"><Notice tone="warn">Only the first 1,000 rows are imported in one go.</Notice></div>}

          {job ? (
            <Card className="mt-6 p-5">
              <div className="mb-2 flex justify-between text-sm font-semibold"><span>{job.status === 'DONE' ? 'Import finished' : job.status === 'FAILED' ? 'Import stopped' : 'Importing…'}</span><span className="font-mono">{num(job.imported)} / {num(job.valid)}</span></div>
              <div className="h-3 overflow-hidden rounded-full border-2 border-ink bg-white"><div className="h-full bg-ink transition-all" style={{ width: `${job.status === 'DONE' ? 100 : progress}%` }} /></div>
              {job.status === 'DONE' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href="/links/"><Button>See your links</Button></Link>
                  {job.total > job.imported && <a href={`${BASE}/api/imports/${job.id}/errors.csv`}><Button variant="ghost">Download skipped rows</Button></a>}
                </div>
              )}
            </Card>
          ) : (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-xl border-2 border-ink bg-white p-0.5">
                {(['all', 'problems'] as const).map(f => <button key={f} onClick={() => setFilter(f)} className={cx('h-8 rounded-lg px-3 font-mono text-xs font-bold', filter === f ? 'bg-ink text-mark' : '')}>{f === 'all' ? 'All rows' : 'Only problems'}</button>)}
              </div>
              <Button onClick={runImport} disabled={busy || s.valid === 0}>Import {num(s.valid)} valid {s.valid === 1 ? 'row' : 'rows'}</Button>
            </div>
          )}

          <Card className="mt-4 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="border-b border-line text-left"><th className="label px-4 py-2">Row</th><th className="label py-2">Status</th><th className="label py-2">Destination</th><th className="label py-2">Alias</th><th className="label py-2 pr-4">Notes</th></tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.rowNumber} className="border-b border-line align-top last:border-0">
                      <td className="px-4 py-2 font-mono text-xs">{r.rowNumber}</td>
                      <td className="py-2"><Badge className={STATUS[r.status]}>{r.status}</Badge></td>
                      <td className="max-w-[320px] truncate py-2 font-mono text-xs">{r.data.destination || '—'}</td>
                      <td className="py-2 font-mono text-xs">{r.data.alias || <span className="text-muted">random</span>}</td>
                      <td className="py-2 pr-4 text-xs">{[...r.messages, ...r.warnings].join(' ') || <span className="text-muted">{r.data.campaign ? `Campaign: ${r.data.campaign}` : 'Ready'}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <div className="mt-10">
        <div className="label mb-3">Recent imports</div>
        {history.length === 0 ? <Empty title="No imports yet" /> : (
          <Card className="overflow-hidden">
            <ul>{history.map(h => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 text-sm last:border-0">
                <span className="font-mono font-bold">{h.filename}</span>
                <span className="text-muted">{dateTime(h.createdAt)}</span>
                <span className="ml-auto font-mono text-xs">{num(h.imported)} imported · {num(h.invalid)} invalid · {num(h.duplicates)} duplicate</span>
                <Badge className={h.status === 'DONE' ? 'border-ink bg-mark' : 'border-line bg-white'}>{h.status.toLowerCase()}</Badge>
                {h.total > h.imported && h.status === 'DONE' && <a className="font-mono text-xs font-bold underline" href={`${BASE}/api/imports/${h.id}/errors.csv`}>skipped rows</a>}
              </li>
            ))}</ul>
          </Card>
        )}
      </div>
    </>
  );
}

export default function ImportPage() {
  return <AppShell><Import /></AppShell>;
}
