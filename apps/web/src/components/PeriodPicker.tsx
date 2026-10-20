'use client';
import { useState } from 'react';
import { cx } from './ui';

export const PERIODS = [
  { id: '24h', label: '24 h' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
];

// A period is either a preset id ("7d") or "custom:YYYY-MM-DD:YYYY-MM-DD".
const CUSTOM = 'custom:';
const local = (d: Date) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD in the viewer's time zone
const today = () => local(new Date());
const daysAgo = (n: number) => local(new Date(Date.now() - n * 86400000));

/** Query parameters for the analytics endpoints: { period } or { from, to }. */
export function periodQuery(value: string): Record<string, string> {
  if (value.startsWith(CUSTOM)) {
    const [from, to] = value.slice(CUSTOM.length).split(':');
    return { from, to };
  }
  return { period: value };
}

export function PeriodPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const custom = value.startsWith(CUSTOM);
  const [from, to] = custom ? value.slice(CUSTOM.length).split(':') : [daysAgo(13), today()];
  const [open, setOpen] = useState(custom);
  const setRange = (f: string, t: string) => { if (f && t && f <= t) onChange(`${CUSTOM}${f}:${t}`); };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-xl border-2 border-ink bg-white p-0.5" role="radiogroup" aria-label="Period">
        {PERIODS.map(p => (
          <button key={p.id} role="radio" aria-checked={value === p.id} onClick={() => { setOpen(false); onChange(p.id); }}
            className={cx('h-8 rounded-lg px-3 font-mono text-xs font-bold', value === p.id ? 'bg-ink text-mark' : 'hover:bg-paper')}>
            {p.label}
          </button>
        ))}
        <button role="radio" aria-checked={custom} onClick={() => { setOpen(true); setRange(from, to); }}
          className={cx('h-8 rounded-lg px-3 font-mono text-xs font-bold', custom ? 'bg-ink text-mark' : 'hover:bg-paper')}>
          Custom
        </button>
      </div>
      {open && (
        <div className="inline-flex items-center gap-1.5 rounded-xl border-2 border-ink bg-white px-2 py-1">
          <input type="date" aria-label="From" value={from} max={to} onChange={e => setRange(e.target.value, to)} className="h-7 bg-transparent font-mono text-xs outline-none" />
          <span className="font-mono text-xs text-muted">→</span>
          <input type="date" aria-label="To" value={to} min={from} max={today()} onChange={e => setRange(from, e.target.value)} className="h-7 bg-transparent font-mono text-xs outline-none" />
        </div>
      )}
    </div>
  );
}
