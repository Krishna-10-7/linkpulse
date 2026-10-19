'use client';
import { FormEvent, useEffect, useState } from 'react';
import { AppShell, useMe } from '@/components/AppShell';
import { CopyButton } from '@/components/CopyButton';
import { Button, Card, Field, Input, Notice, PageHeader } from '@/components/ui';
import { api, ApiError, APP, BASE } from '@/lib/api';
import { ago, date } from '@/lib/format';

type Token = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };

function Settings() {
  const me = useMe();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api<{ items: Token[] }>('/tokens').then(r => setTokens(r.items)).catch(() => {});
  useEffect(() => { load(); }, []);
  const server = typeof window === 'undefined' ? '' : `${location.origin}${BASE}`;

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') || '');
    setErr(null);
    try {
      const r = await api<{ token: string }>('/tokens', { method: 'POST', json: { name } });
      setFresh(r.token);
      (e.target as HTMLFormElement).reset();
      load();
    } catch (x) { setErr(x instanceof ApiError ? x.message : 'Could not create the token.'); }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this token? Anything using it will stop working.')) return;
    await api(`/tokens/${id}`, { method: 'DELETE' }).catch(() => {});
    load();
  }

  return (
    <>
      <PageHeader title="Settings" sub="Your account, and access tokens for the browser extension." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="label mb-3">Account</div>
          <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Name</dt><dd className="font-semibold">{me?.name}</dd>
            <dt className="text-muted">Email</dt><dd className="font-mono">{me?.email}</dd>
            <dt className="text-muted">Role</dt><dd className="font-mono">{me?.role === 'ADMIN' ? 'Admin' : 'User'}</dd>
          </dl>
        </Card>

        <Card className="p-6">
          <div className="label mb-3">Browser extension</div>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-2">
            <li><a className="font-semibold underline" href={`${APP}/linkpulse-extension.zip`}>Download the extension</a> and unzip it.</li>
            <li>Open <span className="font-mono">chrome://extensions</span>, turn on Developer mode, choose <strong>Load unpacked</strong> and pick the folder.</li>
            <li>Create a token below and paste it, with this server address, into the extension's options.</li>
          </ol>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2"><span className="min-w-0 flex-1 truncate font-mono text-sm">{server}</span><CopyButton text={server} /></div>
          <p className="mt-3 text-xs text-muted">Then right-click any link or page and choose “Shorten with LinkPulse”, or press Alt+Shift+S.</p>
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <div className="label mb-3">Access tokens</div>
        {fresh && (
          <div className="mb-4">
            <Notice tone="ok">
              <div className="mb-2 font-semibold">Copy your new token now — it will not be shown again.</div>
              <div className="flex items-center gap-2"><code className="min-w-0 flex-1 break-all rounded-lg bg-white px-3 py-2 font-mono text-sm text-ink">{fresh}</code><CopyButton text={fresh} /></div>
            </Notice>
          </div>
        )}
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1"><Field label="Token name"><Input name="name" required maxLength={60} placeholder="Chrome on my laptop" /></Field></div>
          <Button type="submit">Create token</Button>
        </form>
        {err && <div className="mt-3"><Notice tone="bad">{err}</Notice></div>}
        <ul className="mt-5 divide-y divide-line">
          {tokens.length === 0 ? <li className="py-4 text-sm text-muted">No tokens yet.</li> : tokens.map(t => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <span className="font-semibold">{t.name}</span>
              <span className="font-mono text-xs text-muted">{t.prefix}…</span>
              <span className="text-xs text-muted">created {date(t.createdAt)} · {t.lastUsedAt ? `last used ${ago(t.lastUsedAt)}` : 'never used'}</span>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => revoke(t.id)}>Revoke</Button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

export default function SettingsPage() {
  return <AppShell><Settings /></AppShell>;
}
