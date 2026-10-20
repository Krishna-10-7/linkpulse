'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { BarList, ClicksChart, Legend, Point } from '@/components/charts';
import { CopyButton } from '@/components/CopyButton';
import { LiveBadge } from '@/components/LiveBadge';
import { PeriodPicker, periodQuery } from '@/components/PeriodPicker';
import { Badge, Button, Card, Field, Input, Notice, Spinner, Stat } from '@/components/ui';
import { api, ApiError, qs } from '@/lib/api';
import { ago, date, dateTime, num, pct, STATUS_STYLE, toLocalInput } from '@/lib/format';
import type { LinkItem } from '@/lib/types';
import { useDebounced, useLive } from '@/lib/useLive';

type B = { key: string; clicks: number }[];
type Analytics = {
  period: { hourly: boolean };
  totals: { clicks: number; uniques: number; bots: number; qr: number; change: { clicks: number | null; uniques: number | null } };
  series: Point[]; sources: B; devices: B; browsers: B; os: B; countries: B; referrers: B;
  recent: { ts: string; country: string | null; city: string | null; deviceType: string; browser: string | null; os: string | null; source: string; isBot: boolean; isUnique: boolean }[];
};

function EditPanel({ link, onSaved, onClose }: { link: LinkItem; onSaved: (l: LinkItem) => void; onClose: () => void }) {
  const [f, setF] = useState({
    destination: link.destination, title: link.title || '', expiresAt: toLocalInput(link.expiresAt), startsAt: toLocalInput(link.startsAt),
    clickLimit: link.clickLimit ? String(link.clickLimit) : '', password: '', tags: link.tags.map(t => t.name).join(', '), campaignName: link.campaign?.name || '',
  });
  const [removePassword, setRemovePassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ link: LinkItem }>(`/links/${link.id}`, {
        method: 'PATCH', json: {
          destination: f.destination !== link.destination ? f.destination : undefined, title: f.title || null,
          expiresAt: f.expiresAt ? new Date(f.expiresAt).toISOString() : null, startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null,
          clickLimit: f.clickLimit ? Number(f.clickLimit) : null, password: f.password || undefined, removePassword: removePassword || undefined,
          tags: f.tags.split(',').map(t => t.trim()).filter(Boolean), campaignName: f.campaignName || null,
        },
      });
      onSaved(r.link);
    } catch (e) {
      setErr(e instanceof ApiError ? [e.message, ...(e.data.errors || []).map((x: any) => x.message)].join(' ') : 'Could not save.');
    } finally { setBusy(false); }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Card className="mb-6 p-6">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-2xl font-semibold">Edit link</h2><button onClick={onClose} className="font-mono text-sm font-bold underline">Close</button></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Destination"><Input value={f.destination} onChange={set('destination')} /></Field>
        <Field label="Title"><Input value={f.title} onChange={set('title')} /></Field>
        <Field label="Campaign" hint="Type a name; new campaigns are created for you."><Input value={f.campaignName} onChange={set('campaignName')} /></Field>
        <Field label="Tags" hint="Comma separated"><Input value={f.tags} onChange={set('tags')} /></Field>
        <Field label="Goes live at"><Input type="datetime-local" value={f.startsAt} onChange={set('startsAt')} /></Field>
        <Field label="Expires at"><Input type="datetime-local" value={f.expiresAt} onChange={set('expiresAt')} /></Field>
        <Field label="Click limit"><Input type="number" min={1} value={f.clickLimit} onChange={set('clickLimit')} /></Field>
        <Field label={link.hasPassword ? 'New password' : 'Password'} hint={link.hasPassword ? 'Leave empty to keep the current one.' : undefined}>
          <Input value={f.password} onChange={set('password')} autoComplete="off" />
        </Field>
      </div>
      {link.hasPassword && <label className="mt-3 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={removePassword} onChange={e => setRemovePassword(e.target.checked)} className="h-4 w-4 accent-ink" />Remove password protection</label>}
      {err && <div className="mt-4"><Notice tone="bad">{err}</Notice></div>}
      <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button></div>
    </Card>
  );
}

function Detail() {
  const [id, setId] = useState<string | null>(null);
  const [link, setLink] = useState<LinkItem | null>(null);
  const [a, setA] = useState<Analytics | null>(null);
  const [period, setPeriod] = useState('30d');
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setId(new URLSearchParams(location.search).get('id')); }, []);
  const loadLink = useCallback(() => { if (id) api<{ link: LinkItem }>(`/links/${id}`).then(r => setLink(r.link)).catch(e => setErr(e.message)); }, [id]);
  const loadStats = useCallback(() => { if (id) api<Analytics>(`/links/${id}/analytics${qs(periodQuery(period))}`).then(setA).catch(() => {}); }, [id, period]);
  useEffect(loadLink, [loadLink]);
  useEffect(loadStats, [loadStats]);
  const refresh = useDebounced(() => { loadStats(); loadLink(); }, 1200);
  const live = useLive(c => { if (c.linkId === id) refresh(); }, { enabled: !!id });

  async function setStatus(status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED') {
    try {
      const r = status === 'ARCHIVED' ? await api<{ link: LinkItem }>(`/links/${id}`, { method: 'DELETE' }) : await api<{ link: LinkItem }>(`/links/${id}`, { method: 'PATCH', json: { status } });
      setLink(r.link);
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not update.'); }
  }

  if (err && !link) return <Notice tone="bad">{err}</Notice>;
  if (!link) return <div className="grid h-64 place-items-center"><Spinner /></div>;
  const locked = link.status === 'DISABLED' || link.flagged;
  const t = a?.totals;

  return (
    <>
      <div className="mb-2"><Link href="/links/" className="font-mono text-xs font-bold text-muted hover:text-ink">← All links</Link></div>
      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={STATUS_STYLE[link.status]}>{link.flagged ? 'under review' : link.status.toLowerCase()}</Badge>
            {link.hasPassword && <Badge className="border-line bg-white">password</Badge>}
            {link.campaign && <Link href={`/campaign/?id=${link.campaign.id}`} className="chip hover:bg-mark">{link.campaign.name}</Link>}
            {link.tags.map(tg => <Link key={tg.id} href={`/links/?tag=${tg.name}`} className="chip hover:bg-mark">#{tg.name}</Link>)}
          </div>
          <h1 className="mt-3 break-all font-display text-4xl font-semibold md:text-5xl">{link.shortUrl.replace(/^https?:\/\//, '')}</h1>
          <p className="mt-2 break-all text-ink-2">{link.title ? <strong>{link.title} · </strong> : null}<a href={link.destination} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4">{link.destination}</a></p>
          <p className="mt-1 font-mono text-xs text-muted">Created {date(link.createdAt)}{link.expiresAt ? ` · expires ${dateTime(link.expiresAt)}` : ''}{link.startsAt ? ` · live from ${dateTime(link.startsAt)}` : ''}{link.healthStatus ? ` · destination HTTP ${link.healthStatus}` : ''}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <CopyButton text={link.shortUrl} label="Copy link" size="md" />
            <a href={link.previewUrl} target="_blank" rel="noreferrer"><Button variant="ghost">Safe preview</Button></a>
            {!locked && <Button variant="ghost" onClick={() => setEditing(e => !e)}>Edit</Button>}
            {!locked && link.status === 'ACTIVE' && <Button variant="ghost" onClick={() => setStatus('PAUSED')}>Pause</Button>}
            {!locked && link.status === 'PAUSED' && <Button variant="mark" onClick={() => setStatus('ACTIVE')}>Resume</Button>}
            {!locked && link.status !== 'ARCHIVED' && <Button variant="ghost" onClick={() => confirm('Archive this link? It stops redirecting but keeps its analytics.') && setStatus('ARCHIVED')}>Archive</Button>}
            {link.status === 'ARCHIVED' && <Button variant="mark" onClick={() => setStatus('ACTIVE')}>Restore</Button>}
          </div>
          {link.status === 'DISABLED' && <div className="mt-4"><Notice tone="bad">An admin disabled this link{link.disabledReason ? `: ${link.disabledReason}` : ''}. Visitors see a safety page. Its analytics stay here.</Notice></div>}
          {link.flagged && link.status !== 'DISABLED' && <div className="mt-4"><Notice tone="warn">Paused for review{link.disabledReason ? ` — ${link.disabledReason}` : ''}. An admin will restore or disable it.</Notice></div>}
          {err && <div className="mt-4"><Notice tone="bad">{err}</Notice></div>}
        </div>
        <div className="card p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={link.qrUrl} alt={`QR code for ${link.shortUrl}`} className="w-full" />
          <div className="mt-2 flex justify-center gap-3 font-mono text-xs font-bold">
            <a className="underline" href={`${link.qrUrl.replace('.svg', '.png')}?download=1&size=1024`}>PNG</a>
            <a className="underline" href={`${link.qrUrl}?download=1`}>SVG</a>
          </div>
        </div>
      </div>

      {editing && <EditPanel link={link} onClose={() => setEditing(false)} onSaved={l => { setLink(l); setEditing(false); }} />}

      {link.clickLimit && (
        <Card className="mb-6 p-5">
          <div className="mb-2 flex justify-between text-sm font-semibold"><span>Click limit</span><span className="font-mono">{num(link.clickCount)} / {num(link.clickLimit)}</span></div>
          <div className="h-3 overflow-hidden rounded-full border-2 border-ink bg-white"><div className={link.clickCount >= link.clickLimit ? 'h-full bg-coral' : 'h-full bg-ink'} style={{ width: `${Math.min(100, (link.clickCount / link.clickLimit) * 100)}%` }} /></div>
        </Card>
      )}

      {link.rules.length > 0 && (
        <Card className="mb-6 p-5">
          <div className="label mb-3">Targeting rules · first match wins</div>
          <ul className="space-y-1.5 text-sm">{link.rules.map((r, i) => <li key={i}><span className="chip mr-2 capitalize">{r.type}: {r.value}</span>→ <span className="break-all font-mono text-xs">{r.destination}</span></li>)}</ul>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3"><PeriodPicker value={period} onChange={setPeriod} /><LiveBadge connected={live.connected} last={live.last && live.last.linkId === id ? live.last : null} /></div>
      {!a || !t ? <div className="grid h-40 place-items-center"><Spinner /></div> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Clicks" value={num(t.clicks)} sub={`${pct(t.change.clicks)} vs previous`} />
            <Stat label="Unique visitors" value={num(t.uniques)} sub={`${pct(t.change.uniques)} vs previous`} />
            <Stat label="QR scans" value={num(t.qr)} />
            <Stat label="Bots filtered" value={num(t.bots)} tone="bad" />
          </div>
          <Card className="mt-6 p-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="label">Clicks over time</span><Legend /></div><ClicksChart data={a.series} hourly={a.period.hourly} /></Card>
          <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <Card className="p-5"><div className="label mb-4">Traffic sources</div><BarList items={a.sources} format={s => (s === 'qr' ? 'QR scan' : s)} /></Card>
            <Card className="p-5"><div className="label mb-4">Referrers</div><BarList items={a.referrers} raw empty="No referrers — mostly direct traffic." /></Card>
            <Card className="p-5"><div className="label mb-4">Countries</div><BarList items={a.countries} /></Card>
            <Card className="p-5"><div className="label mb-4">Devices</div><BarList items={a.devices} /></Card>
            <Card className="p-5"><div className="label mb-4">Browsers</div><BarList items={a.browsers} raw /></Card>
            <Card className="p-5"><div className="label mb-4">Operating systems</div><BarList items={a.os} raw /></Card>
          </div>
          <Card className="mt-6 overflow-hidden">
            <div className="label px-5 pt-5">Recent clicks</div>
            {a.recent.length === 0 ? <p className="p-8 text-center text-sm text-muted">No clicks yet.</p> : (
              <div className="overflow-x-auto">
                <table className="mt-3 w-full min-w-[640px] text-sm">
                  <thead><tr className="border-b border-line text-left"><th className="label px-5 py-2">When</th><th className="label py-2">Where</th><th className="label py-2">Device</th><th className="label py-2">Source</th><th className="label py-2 pr-5">Counted</th></tr></thead>
                  <tbody>{a.recent.map((c, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-5 py-2 font-mono text-xs">{ago(c.ts)}</td>
                      <td className="py-2">{[c.city, c.country].filter(Boolean).join(', ') || '—'}</td>
                      <td className="py-2"><span className="capitalize">{c.deviceType}</span>{c.browser ? ` · ${c.browser}` : ''}{c.os ? ` · ${c.os}` : ''}</td>
                      <td className="py-2 capitalize">{c.source === 'qr' ? 'QR scan' : c.source}</td>
                      <td className="py-2 pr-5">{c.isBot ? <Badge className="border-coral/50 bg-coral-soft text-coral-ink">bot · filtered</Badge> : c.isUnique ? <Badge className="border-ink bg-mark">unique</Badge> : <Badge className="border-line bg-white">repeat</Badge>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}

export default function LinkPage() {
  return <AppShell><Detail /></AppShell>;
}
