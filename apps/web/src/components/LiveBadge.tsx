'use client';
import { useEffect, useState } from 'react';
import type { LiveClick } from '@/lib/useLive';
import { cx } from './ui';

/** "Live" indicator that flashes and shows the latest click when one arrives. */
export function LiveBadge({ connected, last }: { connected: boolean; last: LiveClick | null }) {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!last) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1200);
    return () => clearTimeout(t);
  }, [last]);

  return (
    <div className={cx('inline-flex items-center gap-2 rounded-xl border-2 border-ink px-3 py-1.5 font-mono text-xs font-bold transition', flash ? 'bg-mark' : 'bg-white')} aria-live="polite">
      <span className={cx('h-2.5 w-2.5 rounded-full', connected ? 'bg-teal' : 'bg-faint', connected && 'animate-pulse')} />
      {connected ? 'LIVE' : 'OFFLINE'}
      {last && (
        <span className="font-medium text-muted">
          · last click {last.isBot ? 'bot (filtered)' : `${last.deviceType}${last.country ? ` · ${last.country}` : ''} · ${last.source}`}
        </span>
      )}
    </div>
  );
}
