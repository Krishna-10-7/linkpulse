'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { CopyButton } from '@/components/CopyButton';
import { Badge, Button, Empty, Input, PageHeader, Spinner } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { date, host, num, STATUS_STYLE } from '@/lib/format';
import type { LinkItem } from '@/lib/types';

function Links() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: LinkItem[]; total: number; pageSize: number } | null>(null);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get('tag')) setTag(p.get('tag')!);
    if (p.get('campaignId')) setCampaignId(p.get('campaignId')!);
    api<{ items: { id: string; name: string }[] }>('/campaigns').then(r => setCampaigns(r.items)).catch(() => {});
    api<{ items: { id: string; name: string }[] }>('/tags').then(r => setTags(r.items)).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ items: LinkItem[]; total: number; pageSize: number }>(`/links${qs({ q, status, campaignId, tag, page })}`).then(setData).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q, status, campaignId, tag, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const sel = 'h-11 rounded-xl border-2 border-ink bg-white px-3 text-sm font-semibold';

  return (
    <>
      <PageHeader title="Links" sub="Every short link you own. Archived links keep their analytics." actions={<><Link href="/import/"><Button variant="ghost">Bulk import</Button></Link><Link href="/links/new/"><Button>New link</Button></Link></>} />
      <div className="mb-5 grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
        <Input placeholder="Search code, destination or title" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} aria-label="Search links" />
        <select className={sel} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
          <option value="">Active, paused & disabled</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="DISABLED">Disabled</option><option value="ARCHIVED">Archived</option>
        </select>
        <select className={sel} value={campaignId} onChange={e => { setCampaignId(e.target.value); setPage(1); }} aria-label="Campaign">
          <option value="">All campaigns</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={sel} value={tag} onChange={e => { setTag(e.target.value); setPage(1); }} aria-label="Tag">
          <option value="">All tags</option>{tags.map(t => <option key={t.id} value={t.name}>#{t.name}</option>)}
        </select>
      </div>

      {!data ? <div className="grid h-40 place-items-center"><Spinner /></div> : data.items.length === 0 ? (
        <Empty title="No links match">Try another search, or <Link href="/links/new/" className="font-semibold underline">create a link</Link>.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <ul>
            {data.items.map(l => (
              <li key={l.id} className="flex flex-col gap-3 border-b border-line px-5 py-4 last:border-0 md:flex-row md:items-center">
                <Link href={`/link/?id=${l.id}`} className="min-w-0 flex-1 group">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-[15px] font-bold group-hover:underline">{l.shortUrl.replace(/^https?:\/\//, '')}</span>
                    <Badge className={STATUS_STYLE[l.status]}>{l.flagged ? 'review' : l.status.toLowerCase()}</Badge>
                    {l.startsAt && new Date(l.startsAt) > new Date() && <Badge className="border-line bg-white">starts {date(l.startsAt)}</Badge>}
                    {l.hasPassword && <Badge className="border-line bg-white">password</Badge>}
                    {l.clickLimit && <Badge className="border-line bg-white">cap {num(l.clickLimit)}</Badge>}
                    {l.expiresAt && <Badge className="border-line bg-white">{new Date(l.expiresAt) < new Date() ? 'expired' : `expires ${date(l.expiresAt)}`}</Badge>}
                  </div>
                  <div className="mt-1 truncate text-sm text-muted">{l.title ? `${l.title} · ` : ''}{host(l.destination)}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {l.campaign && <span className="chip">{l.campaign.name}</span>}
                    {l.tags.map(t => <span key={t.id} className="chip">#{t.name}</span>)}
                  </div>
                </Link>
                <div className="flex items-center gap-4">
                  <div className="text-right"><div className="font-display text-2xl font-semibold tabular-nums">{num(l.clickCount)}</div><div className="label">clicks</div></div>
                  <CopyButton text={l.shortUrl} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data && pages > 1 && (
        <div className="mt-4 flex items-center justify-between font-mono text-sm">
          <span className="text-muted">{num(data.total)} links</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <span className="px-2 py-1">{page} / {pages}</span>
            <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </>
  );
}

export default function LinksPage() {
  return <AppShell><Links /></AppShell>;
}
