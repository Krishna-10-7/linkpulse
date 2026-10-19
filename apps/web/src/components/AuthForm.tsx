'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { api, ApiError, APP } from '@/lib/api';
import { Logo } from './Logo';
import { Button, Field, Input, Notice } from './ui';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const isLogin = mode === 'login';

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null); setFields({});
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(`/auth/${mode}`, { method: 'POST', json: data });
      const next = new URLSearchParams(location.search).get('next');
      location.href = next && next.startsWith(APP) ? next : `${APP}/`;
    } catch (err) {
      if (err instanceof ApiError) { setError(err.message); setFields(err.data.fields || {}); }
      else setError('Could not reach the server.');
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3 font-mono text-sm font-bold uppercase tracking-[0.18em]"><Logo size={34} />LinkPulse</div>
        <div className="card p-7">
          <h1 className="text-3xl font-semibold">{isLogin ? 'Welcome back.' : <>Start with <span className="hl">one</span> link.</>}</h1>
          <p className="mt-1 text-muted">{isLogin ? 'Sign in to your links and analytics.' : 'Create an account — it takes ten seconds.'}</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            {!isLogin && <Field label="Name" error={fields.name}><Input name="name" autoComplete="name" required /></Field>}
            <Field label="Email" error={fields.email}><Input name="email" type="email" autoComplete="email" required /></Field>
            <Field label="Password" error={fields.password} hint={isLogin ? undefined : 'At least 8 characters.'}>
              <Input name="password" type="password" autoComplete={isLogin ? 'current-password' : 'new-password'} required minLength={isLogin ? 1 : 8} />
            </Field>
            {error && <Notice tone="bad">{error}</Notice>}
            <Button type="submit" className="w-full" disabled={busy}>{busy ? 'One moment…' : isLogin ? 'Sign in' : 'Create account'}</Button>
          </form>
        </div>
        <p className="mt-5 text-center text-sm text-muted">
          {isLogin ? <>New here? <Link href="/register/" className="font-semibold text-ink underline underline-offset-4">Create an account</Link></>
            : <>Already have an account? <Link href="/login/" className="font-semibold text-ink underline underline-offset-4">Sign in</Link></>}
        </p>
      </div>
    </main>
  );
}
