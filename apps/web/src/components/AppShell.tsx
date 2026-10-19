'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { api, APP } from '@/lib/api';
import { Logo } from './Logo';
import { Spinner, cx } from './ui';

export type Me = { id: string; email: string; name: string; role: 'USER' | 'ADMIN'; workspaceId: string };
const MeContext = createContext<Me | null>(null);
export const useMe = () => useContext(MeContext);

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/links/', label: 'Links' },
  { href: '/links/new/', label: 'New link' },
  { href: '/campaigns/', label: 'Campaigns' },
  { href: '/import/', label: 'Bulk import' },
  { href: '/settings/', label: 'Settings' },
];

/** Signed-in layout: loads the current user, shows navigation, guards every page. */
export function AppShell({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const path = usePathname();

  useEffect(() => { api<{ user: Me }>('/auth/me').then(r => setMe(r.user)).catch(() => {}); }, []);
  useEffect(() => setOpen(false), [path]);

  if (!me) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  const nav = me.role === 'ADMIN' ? [...NAV, { href: '/admin/', label: 'Admin' }] : NAV;
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href) && !(href === '/links/' && path.startsWith('/links/new')));

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    location.href = `${APP}/login/`;
  }

  return (
    <MeContext.Provider value={me}>
      <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
        <aside className="border-b-2 border-ink bg-card md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r-2">
          <div className="flex items-center justify-between px-5 py-4">
            <Link href="/" className="flex items-center gap-2.5 font-mono text-sm font-bold uppercase tracking-[0.18em]"><Logo size={30} />LinkPulse</Link>
            <button className="md:hidden font-mono text-sm font-bold" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'Close' : 'Menu'}</button>
          </div>
          <nav className={cx('flex-col gap-1 px-3 pb-4 md:flex', open ? 'flex' : 'hidden')}>
            {nav.map(n => (
              <Link key={n.href} href={n.href} className={cx('rounded-xl px-3 py-2.5 text-[15px] font-semibold transition', active(n.href) ? 'bg-mark border-2 border-ink shadow-ink' : 'hover:bg-paper border-2 border-transparent')}>
                {n.label}
              </Link>
            ))}
            <div className="mt-4 border-t border-line px-3 pt-4 md:absolute md:bottom-4 md:left-3 md:right-3">
              <div className="truncate text-sm font-semibold">{me.name}</div>
              <div className="truncate font-mono text-xs text-muted">{me.email}{me.role === 'ADMIN' ? ' · admin' : ''}</div>
              <button onClick={logout} className="mt-2 font-mono text-xs font-bold underline underline-offset-4">Sign out</button>
            </div>
          </nav>
        </aside>
        <main className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-8 md:py-10">{children}</main>
      </div>
    </MeContext.Provider>
  );
}
