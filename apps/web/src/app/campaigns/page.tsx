'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { PeriodPicker } from '@/components/PeriodPicker';
import { Button, Card, Empty, Field, Input, Notice, PageHeader, Spinner } from '@/components/ui';
import { api, ApiError, qs } from '@/lib/api';
import { date, num } from '@/lib/format';

type Campaign = { id: string; name: string; description: string | null; startsAt: string | null; endsAt: string | null; goalClicks: number | null;
  links: number; activeLinks: number; clicks: number; uniques: number; allTimeClicks: number; topLink: { id: string; code: string; clicks: number } | null };

function NewCampaign({ onCreated }: { onCreated: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true); setErr(null);
    try {
      await api('/campaigns', { method: 'POST', json: {
        name: fd.get('name'), description: fd.get('description') || null,
        startsAt: fd.get('startsAt') ? new Date(String(fd.get('startsAt'))).toISOString() : null,
        endsAt: fd.get('endsAt') ? new Date(String(fd.get('endsAt'))).toISOString() : null,
        goalClicks: fd.get('goalClicks') ? Number(fd.get('goalClicks')) : null,
      } });
      (e.target as HTMLFormElement).reset();
      onCreated();
    } catch (x) { setErr(x instanceof ApiError ? x.message : 'Could not create the campaign.'); } finally { setBusy(false); }
  }
  return (
    <Card className="p-5">
      <div className="label mb-4">New campaign</div>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name"><Input name="name" required minLength={2} placeholder="Diwali Festive Sale" /></Field>
        <Field label="Description"><Input name="description" placeholder="optional" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts"><Input name="startsAt" type="date" /></Field>
          <Field label="Ends"><Input name="endsAt" type="date" /></Field>
        </div>
        <Field label="Goal (clicks)"><Input name="goalClicks" type="number" min={1} placeholder="e.g. 3000" /></Field>
        {err && <Notice tone="bad">{err}</Notice>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Creating…' : 'Create campaign'}</Button>
      </form>
    </Card>
  );
}

function Campaigns() {
  const [period, setPeriod] = useState('30d');
  const [items, setItems] = useState<Campaign[] | null>(null);
  const load = useCallback(() => { api<{ items: Campaign[] }>(`/campaigns${qs({ period })}`).then(r => setItems(r.items)).catch(() => {}); }, [period]);
  useEffect(load, [load]);

  return (
    <>
      <PageHeader title="Campaigns" sub="Group links by campaign and compare how they perform." actions={<PeriodPicker value={period} onChange={setPeriod} />} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {!items ? <div className="grid h-40 place-items-center"><Spinner /></div> : items.length === 0 ? <Empty title="No campaigns yet">Create one here, or name a campaign when you make a link.</Empty> : (
            <div className="grid gap-4 md:grid-cols-2">
              {items.map(c => {
                const goal = c.goalClicks ? Math.min(100, Math.round((c.allTimeClicks / c.goalClicks) * 100)) : null;
                return (
                  <Link key={c.id} href={`/campaign/?id=${c.id}`} className="card block p-5 transition hover:-translate-y-0.5">
                    <div className="font-display text-2xl font-semibold">{c.name}</div>
                    <div className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-muted">{c.description || `${c.links} links`}</div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="soft p-2"><div className="font-display text-2xl font-semibold">{num(c.clicks)}</div><div className="label">clicks</div></div>
                      <div className="soft p-2"><div className="font-display text-2xl font-semibold">{num(c.uniques)}</div><div className="label">unique</div></div>
                      <div className="soft p-2"><div className="font-display text-2xl font-semibold">{c.activeLinks}/{c.links}</div><div className="label">active</div></div>
                    </div>
                    {goal !== null && (
                      <div className="mt-4">
                        <div className="mb-1 flex justify-between font-mono text-xs"><span>Goal {num(c.goalClicks)}</span><span>{goal}%</span></div>
                        <div className="h-2.5 overflow-hidden rounded-full border border-ink bg-white"><div className="h-full bg-mark" style={{ width: `${goal}%` }} /></div>
                      </div>
                    )}
                    <div className="mt-3 flex justify-between font-mono text-xs text-muted">
                      <span>{c.topLink ? `Top: ${c.topLink.code}` : 'No clicks yet'}</span>
                      <span>{c.startsAt ? date(c.startsAt) : ''}{c.endsAt ? ` → ${date(c.endsAt)}` : ''}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
        <NewCampaign onCreated={load} />
      </div>
    </>
  );
}

export default function CampaignsPage() {
  return <AppShell><Campaigns /></AppShell>;
}
