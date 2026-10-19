'use client';
import { cx } from './ui';

export const PERIODS = [
  { id: '24h', label: '24 h' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
];

export function PeriodPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-xl border-2 border-ink bg-white p-0.5" role="group" aria-label="Period">
      {PERIODS.map(p => (
        <button key={p.id} onClick={() => onChange(p.id)} aria-pressed={value === p.id}
          className={cx('h-8 rounded-lg px-3 font-mono text-xs font-bold', value === p.id ? 'bg-ink text-mark' : 'hover:bg-paper')}>
          {p.label}
        </button>
      ))}
    </div>
  );
}
