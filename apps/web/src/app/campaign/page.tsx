'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClicksChart, Legend, Point } from '@/components/charts';
import { PeriodPicker } from '@/components/PeriodPicker';
import { Badge, Button, Card, Empty, Notice, PageHeader, Spinner, Stat } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { date, host, num, STATUS_STYLE } from '@/lib/format';
import type { LinkItem } from '@/lib/types';

type Detail = {
  campaign: { id: string; name: string; description: string | null; startsAt: string | null; endsAt: string | null; goalClicks: number | null };
  totals: { clicks: number; uniques: number; bots: number; qr: number };
  series: Point[];
  allTimeClicks: number;
  links: LinkItem[];
};

function Campaign() {
  const [id, setId] = useState<string | null>(null);
  const [period, setPeriod] = useState('30d');
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setId(new URLSearchParams(location.search).get('id')), []);
  useEffect(() => { if (id) api<Detail>(`/campaigns/${id}${qs({ period })}`).then(setD).catch(e => setErr(e.message)); }, [id, period]);

  if (err) return <Notice tone="bad">{err}</Notice>;
  if (!d) return <div className="grid h-64 place-items-center"><Spinner /></div>;
  const c = d.campaign;
  const goal = c.goalClicks ? Math.min(100, Math.round((d.allTimeClicks / c.goalClicks) * 100)) : null;

  return (
    <>
      <div className="mb-2"><Link href="/campaigns/" className="font-mono text-xs font-bold text-muted hover:text-ink">← All campaigns</Link></div>
      <PageHeader title={c.name} sub={c.description || undefined} actions={<><PeriodPicker value={period} onChange={setPeriod} /><Link href="/links/new/"><Button>New link</Button></Link></>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Clicks" value={num(d.totals.clicks)} />
        <Stat label="Unique visitors" value={num(d.totals.uniques)} />
        <Stat label="QR scans" value={num(d.totals.qr)} />
        <Stat label="Links" value={num(d.links.length)} sub={<span className="text-muted">{c.startsAt ? date(c.startsAt) : ''}{c.endsAt ? ` → ${date(c.endsAt)}` : ''}</span>} />
      </div>
      {goal !== null && (
        <Card className="mt-6 p-5">
          <div className="mb-2 flex justify-between text-sm font-semibold"><span>Goal progress · all time</span><span className="font-mono">{num(d.allTimeClicks)} / {num(c.goalClicks)} · {goal}%</span></div>
          <div className="h-3 overflow-hidden rounded-full border-2 border-ink bg-white"><div className="h-full bg-mark" style={{ width: `${goal}%` }} /></div>
        </Card>
      )}
      <Card className="mt-6 p-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="label">Clicks over time</span><Legend /></div><ClicksChart data={d.series} /></Card>
      <Card className="mt-6 overflow-hidden">
        <div className="label px-5 pt-5">Links in this campaign · most clicked first</div>
        {d.links.length === 0 ? <div className="p-5"><Empty title="No links yet">Pick this campaign in the link wizard.</Empty></div> : (
          <ul className="mt-3">
            {d.links.map(l => (
              <li key={l.id} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
                <Link href={`/link/?id=${l.id}`} className="min-w-0 flex-1">
                  <div className="truncate font-mono text-sm font-bold">{l.shortUrl.replace(/^https?:\/\//, '')}</div>
                  <div className="truncate text-xs text-muted">{l.title || host(l.destination)}</div>
                </Link>
                <Badge className={STATUS_STYLE[l.status]}>{l.status.toLowerCase()}</Badge>
                <span className="w-20 text-right font-mono text-sm font-bold">{num(l.clickCount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

export default function CampaignPage() {
  return <AppShell><Campaign /></AppShell>;
}
