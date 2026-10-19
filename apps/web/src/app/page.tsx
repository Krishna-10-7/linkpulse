'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppShell, useMe } from '@/components/AppShell';
import { BarList, ClicksChart, Legend, Point } from '@/components/charts';
import { PeriodPicker } from '@/components/PeriodPicker';
import { LiveBadge } from '@/components/LiveBadge';
import { useDebounced, useLive } from '@/lib/useLive';
import { Badge, Button, Card, Empty, PageHeader, Spinner, Stat, cx } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { num, pct, STATUS_STYLE } from '@/lib/format';

type Dash = {
  scope: string;
  period: { hourly: boolean };
  kpis: { links: number; activeLinks: number; clicks: number; uniques: number; bots: number; qr: number; change: { clicks: number | null; uniques: number | null } };
  series: Point[];
  sources: { key: string; clicks: number }[];
  devices: { key: string; clicks: number }[];
  browsers: { key: string; clicks: number }[];
  countries: { key: string; clicks: number }[];
  campaigns: { id: string; name: string; links: number; clicks: number; top: { code: string; clicks: number } | null }[];
  topLinks: { id: string; code: string; title: string | null; shortUrl: string; destination: string; clicks: number; status: string }[];
  alerts: { kind: string; level: 'bad' | 'warn' | 'info'; linkId: string; code: string; message: string }[];
};

const ALERT_STYLE = { bad: 'bg-coral-soft text-coral-ink', warn: 'bg-[#fff5dc] text-[#8a5a00]', info: 'bg-white text-ink' };
const flag = (cc: string) => (cc.length === 2 ? cc.toUpperCase() : cc);
const sourceName = (s: string) => (s === 'qr' ? 'QR scan' : s);

function Dashboard() {
  const me = useMe();
  const [period, setPeriod] = useState('7d');
  const [campaignId, setCampaignId] = useState('');
  const [platform, setPlatform] = useState(false);
  const [data, setData] = useState<Dash | null>(null);
  const [campaignList, setCampaignList] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(() => {
    api<Dash>(`/dashboard${qs({ period, campaignId, scope: platform ? 'platform' : undefined })}`).then(setData).catch(() => {});
  }, [period, campaignId, platform]);

  useEffect(() => { load(); }, [load]);
  const refresh = useDebounced(load, 1500);
  const live = useLive(() => refresh(), { platform });
  useEffect(() => { api<{ items: { id: string; name: string }[] }>('/campaigns').then(r => setCampaignList(r.items)).catch(() => {}); }, []);

  if (!data) return <div className="grid h-64 place-items-center"><Spinner /></div>;
  const k = data.kpis;

  return (
    <>
      <PageHeader
        title={<>Your links, with a <span className="hl">pulse.</span></>}
        sub={platform ? 'Platform-wide numbers across every workspace.' : 'Clicks, visitors and campaigns for the links you own.'}
        actions={<Link href="/links/new/"><Button>New link</Button></Link>}
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <PeriodPicker value={period} onChange={setPeriod} />
        <select value={campaignId} onChange={e => setCampaignId(e.target.value)} className="h-9 rounded-xl border-2 border-ink bg-white px-3 text-sm font-semibold" aria-label="Campaign">
          <option value="">All campaigns</option>
          {campaignList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <LiveBadge connected={live.connected} last={live.last} />
        {me?.role === 'ADMIN' && (
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={platform} onChange={e => setPlatform(e.target.checked)} className="h-4 w-4 accent-ink" />Platform-wide</label>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Clicks" value={num(k.clicks)} sub={`${pct(k.change.clicks)} vs previous`} />
        <Stat label="Unique visitors" value={num(k.uniques)} sub={`${pct(k.change.uniques)} vs previous`} />
        <Stat label="Bots filtered" value={num(k.bots)} tone="bad" sub={<span className="text-muted">kept out of totals</span>} />
        <Stat label="QR scans" value={num(k.qr)} sub={<span className="text-muted">of all clicks</span>} />
        <Stat label="Active links" value={num(k.activeLinks)} sub={<span className="text-muted">of {num(k.links)} links</span>} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="label">Clicks over time</span><Legend /></div>
          {k.clicks + k.bots === 0 ? <Empty title="No clicks in this period">Share a link and watch this fill up live.</Empty> : <ClicksChart data={data.series} hourly={data.period.hourly} />}
        </Card>
        <Card className="p-5">
          <div className="label mb-3">Link alerts</div>
          {data.alerts.length === 0 ? <p className="py-6 text-center text-sm text-muted">All clear — nothing needs your attention.</p> : (
            <ul className="space-y-2">
              {data.alerts.map((a, i) => (
                <li key={i}><Link href={`/link/?id=${a.linkId}`} className={cx('block rounded-xl border border-line px-3 py-2 text-sm font-medium hover:border-ink', ALERT_STYLE[a.level])}>{a.message}</Link></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="label px-5 pt-5">Campaign performance</div>
          {data.campaigns.length === 0 ? <div className="p-5"><Empty title="No campaigns yet">Group links into a campaign when you create them.</Empty></div> : (
            <table className="mt-3 w-full text-sm">
              <thead><tr className="border-b border-line text-left"><th className="label px-5 py-2">Campaign</th><th className="label py-2">Links</th><th className="label py-2">Clicks</th><th className="label py-2 pr-5">Top link</th></tr></thead>
              <tbody>
                {data.campaigns.map(c => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5 font-semibold"><Link href={`/campaign/?id=${c.id}`} className="hover:underline">{c.name}</Link></td>
                    <td className="py-2.5 font-mono">{c.links}</td>
                    <td className="py-2.5 font-mono font-bold">{num(c.clicks)}</td>
                    <td className="py-2.5 pr-5 font-mono text-xs">{c.top ? `${c.top.code} · ${num(c.top.clicks)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card className="overflow-hidden">
          <div className="label px-5 pt-5">Top links</div>
          {data.topLinks.length === 0 ? <p className="p-8 text-center text-sm text-muted">No clicks in this period.</p> : (
            <ul className="mt-3">
              {data.topLinks.map((l, i) => (
                <li key={l.id} className="flex items-center gap-3 border-b border-line px-5 py-2.5 last:border-0">
                  <span className="w-5 font-mono text-xs text-muted">{i + 1}</span>
                  <Link href={`/link/?id=${l.id}`} className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm font-bold">{l.shortUrl.replace(/^https?:\/\//, '')}</div>
                    <div className="truncate text-xs text-muted">{l.title || l.destination}</div>
                  </Link>
                  <Badge className={STATUS_STYLE[l.status]}>{l.status.toLowerCase()}</Badge>
                  <span className="w-16 text-right font-mono text-sm font-bold">{num(l.clicks)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5"><div className="label mb-4">Traffic sources</div><BarList items={data.sources} format={sourceName} /></Card>
        <Card className="p-5"><div className="label mb-4">Devices</div><BarList items={data.devices} /></Card>
        <Card className="p-5"><div className="label mb-4">Browsers</div><BarList items={data.browsers} /></Card>
        <Card className="p-5"><div className="label mb-4">Countries</div><BarList items={data.countries} format={flag} /></Card>
      </div>
    </>
  );
}

export default function Home() {
  return <AppShell><Dashboard /></AppShell>;
}
