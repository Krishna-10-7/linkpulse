'use client';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { num } from '@/lib/format';

export type Point = { t: string; clicks: number; uniques: number; bots: number };

const tick = (t: string, hourly: boolean) => {
  const d = new Date(t.length <= 10 ? t + 'T00:00:00' : t);
  return hourly ? d.toLocaleTimeString('en-IN', { hour: '2-digit' }) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** Clicks over time: human clicks as the ink area, unique visitors as the lime line, bots dashed coral. */
export function ClicksChart({ data, hourly = false, height = 260 }: { data: Point[]; hourly?: boolean; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="ink" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#15161c" stopOpacity={0.22} /><stop offset="100%" stopColor="#15161c" stopOpacity={0.02} /></linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(21,22,28,.08)" vertical={false} />
          <XAxis dataKey="t" tickFormatter={t => tick(t, hourly)} tick={{ fontSize: 11, fill: '#6f6c62', fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={{ stroke: '#15161c' }} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6f6c62', fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            contentStyle={{ border: '2px solid #15161c', borderRadius: 12, boxShadow: '4px 4px 0 #15161c', fontSize: 13 }}
            labelFormatter={t => tick(String(t), hourly)}
            formatter={(v: number, name: string) => [num(v), name === 'clicks' ? 'Clicks' : name === 'uniques' ? 'Unique visitors' : 'Bots filtered']}
          />
          <Area type="monotone" dataKey="clicks" stroke="#15161c" strokeWidth={2.5} fill="url(#ink)" />
          <Area type="monotone" dataKey="uniques" stroke="#9db51a" strokeWidth={2} fill="none" />
          <Area type="monotone" dataKey="bots" stroke="#ff5b3a" strokeWidth={1.5} strokeDasharray="4 4" fill="none" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bars for a breakdown such as sources or countries. */
export function BarList({ items, empty = 'No clicks yet.', format, raw = false }: { items: { key: string; clicks: number }[]; empty?: string; format?: (k: string) => string; raw?: boolean }) {
  if (!items?.length) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  const max = Math.max(...items.map(i => i.clicks), 1);
  const total = items.reduce((s, i) => s + i.clicks, 0) || 1;
  return (
    <ul className="space-y-2.5">
      {items.map(i => (
        <li key={i.key}>
          <div className="mb-1 flex justify-between text-sm"><span className={raw ? 'font-semibold' : 'font-semibold capitalize'}>{format ? format(i.key) : i.key}</span><span className="font-mono text-xs text-muted">{num(i.clicks)} · {Math.round((i.clicks / total) * 100)}%</span></div>
          <div className="h-2.5 overflow-hidden rounded-full border border-ink bg-ink/5"><div className="h-full bg-mark" style={{ width: `${(i.clicks / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function Legend() {
  return (
    <div className="flex flex-wrap gap-4 font-mono text-[11px] text-muted">
      <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-ink" />Clicks</span>
      <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-[#9db51a]" />Unique visitors</span>
      <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-3 border-t-2 border-dashed border-coral" />Bots filtered</span>
    </div>
  );
}
