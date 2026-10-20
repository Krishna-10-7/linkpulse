'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { CopyButton } from '@/components/CopyButton';
import { RuleEditor } from '@/components/RuleEditor';
import { Button, Card, Field, Input, Notice, PageHeader, cx } from '@/components/ui';
import { api, ApiError, Issue } from '@/lib/api';
import type { LinkItem, Rule } from '@/lib/types';

type Validation = { ok: boolean; url: string | null; title: string | null; errors: Issue[]; warnings: Issue[]; suggestions: string[] };
type AliasState = { state: 'idle' | 'checking' | 'ok' | 'bad'; message?: string; suggestions: string[] };

const toIso = (v: string) => (v ? new Date(v).toISOString() : null);

function Steps({ step }: { step: 1 | 2 }) {
  const item = (n: 1 | 2, label: string) => (
    <div className={cx('flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.14em]', step === n ? 'text-ink' : 'text-muted')}>
      <span className={cx('grid h-7 w-7 place-items-center rounded-full border-2 border-ink', step >= n ? 'bg-mark' : 'bg-white')}>{n}</span>{label}
    </div>
  );
  return <div className="mb-6 flex items-center gap-3">{item(1, 'Destination')}<div className="h-0.5 w-10 bg-ink/30" />{item(2, 'Options & review')}</div>;
}

function Wizard() {
  const [step, setStep] = useState<1 | 2>(1);
  const [destination, setDestination] = useState('');
  const [alias, setAlias] = useState('');
  const [title, setTitle] = useState('');
  const [aliasState, setAliasState] = useState<AliasState>({ state: 'idle', suggestions: [] });
  const [check, setCheck] = useState<Validation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [campaign, setCampaign] = useState('');
  const [newCampaign, setNewCampaign] = useState('');
  const [tags, setTags] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [clickLimit, setClickLimit] = useState('');
  const [password, setPassword] = useState('');
  const [utm, setUtm] = useState({ utm_source: '', utm_medium: '', utm_campaign: '' });
  const [rules, setRules] = useState<Rule[]>([]);
  const [ack, setAck] = useState(false);
  const [created, setCreated] = useState<LinkItem | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get('url')) setDestination(p.get('url')!);
    api<{ items: { id: string; name: string }[] }>('/campaigns').then(r => setCampaigns(r.items)).catch(() => {});
  }, []);

  // Live alias availability, debounced.
  useEffect(() => {
    const a = alias.trim();
    if (!a) { setAliasState({ state: 'idle', suggestions: [] }); return; }
    setAliasState(s => ({ ...s, state: 'checking' }));
    const t = setTimeout(() => {
      api<{ available: boolean; errors: Issue[]; suggestions: string[] }>(`/aliases/${encodeURIComponent(a)}`)
        .then(r => setAliasState(r.available ? { state: 'ok', message: `“${a}” is available`, suggestions: [] }
          : { state: 'bad', message: r.errors[0]?.message || `“${a}” is already taken`, suggestions: r.suggestions }))
        .catch(() => setAliasState({ state: 'idle', suggestions: [] }));
    }, 350);
    return () => clearTimeout(t);
  }, [alias]);

  const payload = useMemo(() => ({
    destination, alias: alias.trim() || null, title: title.trim() || null,
    campaignId: campaign && campaign !== '__new' ? campaign : null, campaignName: campaign === '__new' ? newCampaign.trim() : null,
    tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    startsAt: toIso(startsAt), expiresAt: toIso(expiresAt),
    clickLimit: clickLimit ? Number(clickLimit) : null, password: password || null,
    utm: Object.values(utm).some(Boolean) ? utm : null,
    rules: rules.filter(r => r.value && r.destination),
  }), [destination, alias, title, campaign, newCampaign, tags, startsAt, expiresAt, clickLimit, password, utm, rules]);

  async function validate(full: boolean) {
    setBusy(true); setError(null);
    try {
      const body = full ? payload : { destination, alias: alias.trim() || null };
      const r = await api<Validation>('/links/validate', { method: 'POST', json: body });
      setCheck(r);
      if (!title && r.title) setTitle(r.title);
      return r;
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Validation failed.'); return null; } finally { setBusy(false); }
  }

  async function next() {
    const r = await validate(false);
    if (r && r.ok) { setStep(2); setAck(false); validate(true); }
  }

  async function publish() {
    setBusy(true); setError(null);
    try {
      const r = await api<{ link: LinkItem }>('/links', { method: 'POST', json: payload });
      setCreated(r.link);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        if (e.data.errors) setCheck({ ok: false, url: null, title: null, errors: e.data.errors, warnings: e.data.warnings || [], suggestions: e.data.suggestions || [] });
      } else setError('Could not publish the link.');
    } finally { setBusy(false); }
  }

  if (created) {
    return (
      <Card className="mx-auto max-w-3xl p-8">
        <div className="label">Published</div>
        <h2 className="mt-2 text-3xl font-semibold">Your link is <span className="hl">live.</span></h2>
        <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_200px]">
          <div className="min-w-0">
            <div className="rounded-xl border-2 border-ink bg-white p-4 font-display text-3xl font-semibold break-all">{created.shortUrl.replace(/^https?:\/\//, '')}</div>
            <p className="mt-2 truncate text-sm text-muted">→ {created.destination}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <CopyButton text={created.shortUrl} label="Copy link" size="md" />
              <a href={`${created.qrUrl.replace('.svg', '.png')}?download=1&size=1024`}><Button variant="ghost">QR · PNG</Button></a>
              <a href={`${created.qrUrl}?download=1`}><Button variant="ghost">QR · SVG</Button></a>
              <Link href={`/link/?id=${created.id}`}><Button>View analytics</Button></Link>
            </div>
            <button className="mt-6 font-mono text-sm font-bold underline underline-offset-4" onClick={() => location.reload()}>Create another link</button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={created.qrUrl} alt={`QR code for ${created.shortUrl}`} className="w-full rounded-xl border-2 border-ink bg-white p-2" />
        </div>
      </Card>
    );
  }

  const destErr = check?.errors.find(e => e.field === 'destination');
  return (
    <div className="mx-auto max-w-4xl">
      <Steps step={step} />
      {step === 1 ? (
        <Card className="p-6 md:p-8">
          <div className="space-y-5">
            <Field label="Destination URL" error={destErr?.message} hint="Where people should end up. We add https:// if you leave it out.">
              <Input autoFocus value={destination} onChange={e => setDestination(e.target.value)} placeholder="shop.example.com/festive/kurtas" inputMode="url" />
            </Field>
            <Field label="Custom alias (optional)" hint="3–30 letters, numbers, - or _. Leave empty for a random 7-character code.">
              <div className="flex h-11 items-center overflow-hidden rounded-xl border-2 border-ink bg-white">
                <span className="border-r border-line px-3 font-mono text-sm text-muted">/{(process.env.NEXT_PUBLIC_BASE_PATH || '/lk').replace(/^\//, '')}/</span>
                <input value={alias} onChange={e => setAlias(e.target.value.replace(/\s/g, '-'))} className="h-full flex-1 px-3 font-mono text-[15px] outline-none" placeholder="diwali-sale" aria-label="Custom alias" />
              </div>
            </Field>
            {aliasState.state !== 'idle' && (
              <div className={cx('-mt-2 text-sm font-semibold', aliasState.state === 'ok' ? 'text-teal' : aliasState.state === 'bad' ? 'text-coral-ink' : 'text-muted')}>
                {aliasState.state === 'checking' ? 'Checking…' : (aliasState.state === 'ok' ? '✓ ' : '✕ ') + aliasState.message}
                {aliasState.suggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 font-normal text-ink">
                    <span className="label">Try</span>
                    {aliasState.suggestions.map(s => <button key={s} onClick={() => setAlias(s)} className="chip font-mono hover:bg-mark">{s}</button>)}
                  </div>
                )}
              </div>
            )}
            <Field label="Title (optional)" hint="We read the page title for you when we can."><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Festive kurta sets" /></Field>
            {error && <Notice tone="bad">{error}</Notice>}
            {check && check.errors.filter(e => e.field !== 'destination').map(e => <Notice key={e.code + e.field} tone="bad">{e.message}</Notice>)}
            <div className="flex justify-end"><Button onClick={next} disabled={!destination || busy || aliasState.state === 'bad'}>{busy ? 'Checking…' : 'Next: options'}</Button></div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card className="space-y-6 p-6 md:p-8">
            <div>
              <div className="label mb-1">Destination</div>
              <div className="truncate font-mono text-sm">{check?.url || destination}</div>
              <button className="mt-1 font-mono text-xs font-bold underline" onClick={() => setStep(1)}>Change</button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Campaign">
                <select className="input" value={campaign} onChange={e => setCampaign(e.target.value)}>
                  <option value="">No campaign</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="__new">+ New campaign…</option>
                </select>
              </Field>
              {campaign === '__new' ? <Field label="New campaign name"><Input value={newCampaign} onChange={e => setNewCampaign(e.target.value)} placeholder="Diwali Festive Sale" /></Field>
                : <Field label="Tags" hint="Comma separated"><Input value={tags} onChange={e => setTags(e.target.value)} placeholder="festive, sale" /></Field>}
              {campaign === '__new' && <Field label="Tags" hint="Comma separated"><Input value={tags} onChange={e => setTags(e.target.value)} placeholder="festive, sale" /></Field>}
            </div>
            <div>
              <div className="label mb-3">Redirect rules</div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Goes live at" hint="Before this, visitors see “not live yet”."><Input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} /></Field>
                <Field label="Expires at" hint="After this, the link returns 410 Gone."><Input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></Field>
                <Field label="Click limit" hint="Human clicks only — bots never count."><Input type="number" min={1} value={clickLimit} onChange={e => setClickLimit(e.target.value)} placeholder="e.g. 500" /></Field>
                <Field label="Password" hint="Visitors must enter it before redirecting."><Input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="optional" autoComplete="off" /></Field>
              </div>
            </div>
            <div>
              <div className="label mb-3">UTM parameters</div>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Source"><Input value={utm.utm_source} onChange={e => setUtm({ ...utm, utm_source: e.target.value })} placeholder="instagram" /></Field>
                <Field label="Medium"><Input value={utm.utm_medium} onChange={e => setUtm({ ...utm, utm_medium: e.target.value })} placeholder="story" /></Field>
                <Field label="Campaign" hint="Defaults to the campaign name"><Input value={utm.utm_campaign} onChange={e => setUtm({ ...utm, utm_campaign: e.target.value })} placeholder="auto" /></Field>
              </div>
            </div>
            <RuleEditor rules={rules} onChange={setRules} />
          </Card>

          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between"><span className="label">Validation</span><Button size="sm" variant="ghost" onClick={() => validate(true)} disabled={busy}>Re-check</Button></div>
              {!check ? <p className="text-sm text-muted">Checking…</p> : (
                <ul className="space-y-2 text-sm">
                  {check.errors.map(e => <li key={'e' + e.code + e.field} className="flex gap-2 text-coral-ink"><span className="font-bold">✕</span>{e.message}</li>)}
                  {check.warnings.map(w => <li key={'w' + w.code} className="flex gap-2 text-[#8a5a00]"><span className="font-bold">!</span>{w.message}</li>)}
                  {check.errors.length === 0 && <li className="flex gap-2 text-teal"><span className="font-bold">✓</span>URL valid, not blocklisted, not a private address</li>}
                  {check.errors.length === 0 && check.warnings.length === 0 && <li className="flex gap-2 text-teal"><span className="font-bold">✓</span>No warnings</li>}
                </ul>
              )}
              {check && check.warnings.length > 0 && check.errors.length === 0 && (
                <label className="mt-4 flex items-start gap-2 text-sm font-semibold"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="mt-0.5 h-4 w-4 accent-ink" />I have reviewed the warnings</label>
              )}
            </Card>
            {error && <Notice tone="bad">{error}</Notice>}
            <Button className="w-full" onClick={publish} disabled={busy || !check || check.errors.length > 0 || (check.warnings.length > 0 && !ack)}>{busy ? 'Publishing…' : 'Publish link'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewLinkPage() {
  return (
    <AppShell>
      <PageHeader title={<>New <span className="hl">link</span></>} sub="Two steps: where it goes, then how it behaves." />
      <Wizard />
    </AppShell>
  );
}
