'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell, useMe } from '@/components/AppShell';
import { Badge, Button, Card, Empty, Input, Notice, PageHeader, Spinner, Stat, cx } from '@/components/ui';
import { api, ApiError, qs } from '@/lib/api';
import { ago, dateTime, host, num, STATUS_STYLE } from '@/lib/format';
import type { LinkItem } from '@/lib/types';

type Stats = { users: number; links: number; active: number; disabled: number; flagged: number; openReports: number; blockedDomains: number; clicks: number; uniques: number; bots: number };
type ReportGroup = { link: { id: string; code: string; destination: string; status: string; flagged: boolean; owner: { email: string } }; count: number; reasons: Record<string, number>; latest: string };
type Blocked = { id: string; domain: string; reason: string | null; createdAt: string };
type User = { id: string; email: string; name: string; role: 'USER' | 'ADMIN'; createdAt: string; links: number };
type Audit = { id: string; action: string; entity: string; entityId: string | null; data: any; createdAt: string; actor: string };

const TABS = ['Abuse queue', 'All links', 'Blocklist', 'Users', 'Audit log'] as const;

/** Disable with a reason, or restore. Shared by the abuse queue and link search. */
function TakedownButtons({ link, onDone }: { link: { id: string; status: string; flagged: boolean; code: string }; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function disable() {
    const reason = prompt(`Why disable ${link.code}? This stops redirects immediately.`, 'Reported as phishing');
    if (!reason) return;
    setBusy(true);
    await api(`/admin/links/${link.id}/disable`, { method: 'POST', json: { reason } }).catch(e => alert(e.message));
    setBusy(false); onDone();
  }
  async function restore() {
    setBusy(true);
    await api(`/admin/links/${link.id}/restore`, { method: 'POST', json: {} }).catch(e => alert(e.message));
    setBusy(false); onDone();
  }
  return (
    <div className="flex gap-2">
      {link.status !== 'DISABLED' && <Button size="sm" variant="danger" disabled={busy} onClick={disable}>Disable</Button>}
      {(link.status === 'DISABLED' || link.flagged) && <Button size="sm" variant="ghost" disabled={busy} onClick={restore}>Restore</Button>}
    </div>
  );
}

function AbuseQueue({ reload }: { reload: () => void }) {
  const [items, setItems] = useState<ReportGroup[] | null>(null);
  const load = useCallback(() => { api<{ items: ReportGroup[] }>('/admin/reports').then(r => setItems(r.items)).catch(() => {}); reload(); }, [reload]);
  useEffect(() => { api<{ items: ReportGroup[] }>('/admin/reports').then(r => setItems(r.items)).catch(() => {}); }, []);
  if (!items) return <Spinner />;
  if (!items.length) return <Empty title="No open reports">Visitors can report links from the preview and safety pages.</Empty>;
  return (
    <Card className="overflow-hidden">
      <ul>{items.map(g => (
        <li key={g.link.id} className="flex flex-col gap-3 border-b border-line px-5 py-4 last:border-0 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><span className="font-mono font-bold">{g.link.code}</span><Badge className={STATUS_STYLE[g.link.status]}>{g.link.flagged ? 'auto-paused' : g.link.status.toLowerCase()}</Badge><span className="chip">{g.count} {g.count === 1 ? 'report' : 'reports'}</span>{Object.entries(g.reasons).map(([r, n]) => <span key={r} className="chip">{r} × {n}</span>)}</div>
            <div className="mt-1 truncate font-mono text-xs text-muted">{g.link.destination}</div>
            <div className="text-xs text-muted">Owner {g.link.owner.email} · latest {ago(g.latest)}</div>
          </div>
          <div className="flex gap-2">
            <TakedownButtons link={g.link} onDone={load} />
            <Button size="sm" variant="ghost" onClick={async () => { await api('/admin/reports/dismiss', { method: 'POST', json: { linkId: g.link.id } }); load(); }}>Dismiss</Button>
          </div>
        </li>
      ))}</ul>
    </Card>
  );
}

function AllLinks({ reload }: { reload: () => void }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState<{ items: LinkItem[]; total: number } | null>(null);
  const load = useCallback(() => { api<{ items: LinkItem[]; total: number }>(`/admin/links${qs({ q, status })}`).then(setData).catch(() => {}); }, [q, status]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  return (
    <>
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_200px]">
        <Input placeholder="Search code, destination, title or owner email" value={q} onChange={e => setQ(e.target.value)} aria-label="Search all links" />
        <select className="h-11 rounded-xl border-2 border-ink bg-white px-3 text-sm font-semibold" value={status} onChange={e => setStatus(e.target.value)} aria-label="Status">
          <option value="">Any status</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="DISABLED">Disabled</option><option value="ARCHIVED">Archived</option>
        </select>
      </div>
      {!data ? <Spinner /> : data.items.length === 0 ? <Empty title="No links match" /> : (
        <Card className="overflow-hidden"><ul>{data.items.map(l => (
          <li key={l.id} className="flex flex-col gap-3 border-b border-line px-5 py-3 last:border-0 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-bold">{l.code}</span><Badge className={STATUS_STYLE[l.status]}>{l.flagged ? 'review' : l.status.toLowerCase()}</Badge>{!!l.openReports && <span className="chip">{l.openReports} open reports</span>}</div>
              <div className="truncate text-xs text-muted">{host(l.destination)} · {l.owner?.email} · {num(l.clickCount)} clicks{l.disabledReason ? ` · ${l.disabledReason}` : ''}</div>
            </div>
            <TakedownButtons link={l} onDone={() => { load(); reload(); }} />
          </li>
        ))}</ul></Card>
      )}
    </>
  );
}

function Blocklist({ reload }: { reload: () => void }) {
  const [items, setItems] = useState<Blocked[]>([]);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const load = () => api<{ items: Blocked[] }>('/admin/blocklist').then(r => setItems(r.items)).catch(() => {});
  useEffect(() => { load(); }, []);
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const r = await api<{ pausedLinks: number; entry: Blocked }>('/admin/blocklist', { method: 'POST', json: { domain: fd.get('domain'), reason: fd.get('reason') || undefined } });
      setMsg({ tone: 'ok', text: `${r.entry.domain} blocked.${r.pausedLinks ? ` ${r.pausedLinks} active ${r.pausedLinks === 1 ? 'link was' : 'links were'} paused for review.` : ''}` });
      (e.target as HTMLFormElement).reset(); load(); reload();
    } catch (x) { setMsg({ tone: 'bad', text: x instanceof ApiError ? x.message : 'Could not add the domain.' }); }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card className="overflow-hidden">
        {items.length === 0 ? <div className="p-5"><Empty title="Nothing blocked" /></div> : (
          <ul>{items.map(b => (
            <li key={b.id} className="flex items-center gap-3 border-b border-line px-5 py-3 text-sm last:border-0">
              <span className="font-mono font-bold">{b.domain}</span><span className="text-muted">{b.reason}</span><span className="ml-auto text-xs text-muted">{dateTime(b.createdAt)}</span>
              <Button size="sm" variant="ghost" onClick={async () => { await api(`/admin/blocklist/${b.id}`, { method: 'DELETE' }); load(); }}>Remove</Button>
            </li>
          ))}</ul>
        )}
      </Card>
      <Card className="p-5">
        <div className="label mb-3">Block a domain</div>
        <form onSubmit={add} className="space-y-3">
          <Input name="domain" required placeholder="phish.example" />
          <Input name="reason" placeholder="Reason (optional)" />
          <Button type="submit" variant="danger" className="w-full">Add to blocklist</Button>
        </form>
        <p className="mt-3 text-xs text-muted">New links to this domain and its subdomains are refused. Existing active links are paused and flagged for review.</p>
        {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      </Card>
    </div>
  );
}

function Users() {
  const me = useMe();
  const [items, setItems] = useState<User[]>([]);
  const load = () => api<{ items: User[] }>('/admin/users').then(r => setItems(r.items)).catch(() => {});
  useEffect(() => { load(); }, []);
  return (
    <Card className="overflow-hidden"><ul>{items.map(u => (
      <li key={u.id} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 text-sm last:border-0">
        <span className="font-semibold">{u.name}</span><span className="font-mono text-xs text-muted">{u.email}</span>
        <Badge className={u.role === 'ADMIN' ? 'border-ink bg-ink text-mark' : 'border-line bg-white'}>{u.role.toLowerCase()}</Badge>
        <span className="ml-auto text-xs text-muted">{u.links} links · joined {dateTime(u.createdAt)}</span>
        {u.id !== me?.id && <Button size="sm" variant="ghost" onClick={async () => { await api(`/admin/users/${u.id}`, { method: 'PATCH', json: { role: u.role === 'ADMIN' ? 'USER' : 'ADMIN' } }); load(); }}>{u.role === 'ADMIN' ? 'Make user' : 'Make admin'}</Button>}
      </li>
    ))}</ul></Card>
  );
}

function AuditLog() {
  const [items, setItems] = useState<Audit[] | null>(null);
  useEffect(() => { api<{ items: Audit[] }>('/admin/audit').then(r => setItems(r.items)).catch(() => {}); }, []);
  if (!items) return <Spinner />;
  return (
    <Card className="overflow-hidden"><ul>{items.map(a => (
      <li key={a.id} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-2.5 text-sm last:border-0">
        <span className="w-28 font-mono text-xs text-muted">{ago(a.createdAt)}</span>
        <span className="chip font-mono">{a.action}</span>
        <span className="min-w-0 flex-1 truncate">{a.data?.code || a.data?.domain || a.entityId}{a.data?.reason ? ` — ${a.data.reason}` : ''}{a.data?.pausedLinks ? ` (${a.data.pausedLinks} links paused)` : ''}</span>
        <span className="font-mono text-xs text-muted">{a.actor}</span>
      </li>
    ))}</ul></Card>
  );
}

function Admin() {
  const me = useMe();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Abuse queue');
  const [stats, setStats] = useState<Stats | null>(null);
  const loadStats = useCallback(() => { api<Stats>('/admin/stats?period=30d').then(setStats).catch(() => {}); }, []);
  useEffect(loadStats, [loadStats]);
  if (me?.role !== 'ADMIN') return <Notice tone="bad">Admins only.</Notice>;
  return (
    <>
      <PageHeader title={<>Admin <span className="hl">console</span></>} sub="Platform-wide governance: abuse reports, takedowns, the domain blocklist and users." actions={<Link href="/"><Button variant="ghost">Platform dashboard</Button></Link>} />
      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <Stat label="Users" value={num(stats.users)} />
          <Stat label="Links" value={num(stats.links)} sub={<span className="text-muted">{num(stats.active)} active</span>} />
          <Stat label="Clicks · 30 d" value={num(stats.clicks)} />
          <Stat label="Disabled" value={num(stats.disabled)} tone="bad" />
          <Stat label="Open reports" value={num(stats.openReports)} tone={stats.openReports ? 'bad' : undefined} sub={<span className="text-muted">{num(stats.flagged)} auto-paused</span>} />
          <Stat label="Blocked domains" value={num(stats.blockedDomains)} />
        </div>
      )}
      <div className="my-6 flex flex-wrap gap-2" role="tablist">
        {TABS.map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx('rounded-xl border-2 px-4 py-2 text-sm font-semibold', tab === t ? 'border-ink bg-mark shadow-ink' : 'border-transparent hover:bg-card')}>{t}</button>)}
      </div>
      {tab === 'Abuse queue' && <AbuseQueue reload={loadStats} />}
      {tab === 'All links' && <AllLinks reload={loadStats} />}
      {tab === 'Blocklist' && <Blocklist reload={loadStats} />}
      {tab === 'Users' && <Users />}
      {tab === 'Audit log' && <AuditLog />}
    </>
  );
}

export default function AdminPage() {
  return <AppShell><Admin /></AppShell>;
}
