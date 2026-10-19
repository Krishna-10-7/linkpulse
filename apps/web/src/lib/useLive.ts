'use client';
import { useEffect, useRef, useState } from 'react';
import { BASE } from './api';

export type LiveClick = { linkId: string; ts: string; isBot: boolean; isUnique: boolean; deviceType: string; country: string | null; source: string; browser: string | null };

/**
 * Subscribes to the server-sent click stream. Calls onClick for every event and
 * reports whether the connection is open. EventSource reconnects on its own.
 */
export function useLive(onClick: (c: LiveClick) => void, { platform = false, enabled = true } = {}) {
  const [connected, setConnected] = useState(false);
  const [last, setLast] = useState<LiveClick | null>(null);
  const cb = useRef(onClick);
  cb.current = onClick;

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const es = new EventSource(`${BASE}/api/stream${platform ? '?scope=platform' : ''}`, { withCredentials: true });
    es.addEventListener('hello', () => setConnected(true));
    es.addEventListener('click', e => {
      try {
        const c = JSON.parse((e as MessageEvent).data) as LiveClick;
        setLast(c);
        cb.current(c);
      } catch { /* ignore malformed events */ }
    });
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [platform, enabled]);

  return { connected, last };
}

/** Collapse bursts of events into one refresh. */
export function useDebounced(fn: () => void, ms = 1500) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const f = useRef(fn);
  f.current = fn;
  return () => {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => f.current(), ms);
  };
}
