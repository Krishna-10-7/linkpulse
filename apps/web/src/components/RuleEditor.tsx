'use client';
import type { Rule } from '@/lib/types';
import { Button, Input } from './ui';

const DEFAULT_VALUE: Record<Rule['type'], string> = { device: 'mobile', os: 'iOS', country: 'IN' };

/** Device / OS / country targeting rules. Order is priority: the first match wins. */
export function RuleEditor({ rules, onChange }: { rules: Rule[]; onChange: (rules: Rule[]) => void }) {
  const update = (i: number, patch: Partial<Rule>) => onChange(rules.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, by: number) => {
    const next = [...rules];
    const [r] = next.splice(i, 1);
    next.splice(i + by, 0, r);
    onChange(next);
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="label">Device targeting</span>
        <Button size="sm" variant="ghost" onClick={() => onChange([...rules, { type: 'device', value: 'mobile', destination: '' }])}>Add rule</Button>
      </div>
      {rules.length === 0 ? <p className="text-sm text-muted">Send phones, an OS or a country to a different page — for example iOS users to the App Store.</p> : (
        <div className="space-y-2">
          {rules.map((r, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-[120px_140px_1fr_auto]">
              <select className="input" aria-label={`Rule ${i + 1} type`} value={r.type} onChange={e => update(i, { type: e.target.value as Rule['type'], value: DEFAULT_VALUE[e.target.value as Rule['type']] })}>
                <option value="device">Device</option><option value="os">OS</option><option value="country">Country</option>
              </select>
              {r.type === 'device' ? (
                <select className="input" aria-label={`Rule ${i + 1} device`} value={r.value} onChange={e => update(i, { value: e.target.value })}><option value="mobile">Mobile</option><option value="tablet">Tablet</option><option value="desktop">Desktop</option></select>
              ) : r.type === 'os' ? (
                <select className="input" aria-label={`Rule ${i + 1} operating system`} value={r.value} onChange={e => update(i, { value: e.target.value })}><option>iOS</option><option>Android</option><option>Windows</option><option value="Mac OS">macOS</option></select>
              ) : <Input aria-label={`Rule ${i + 1} country code`} value={r.value} maxLength={2} onChange={e => update(i, { value: e.target.value.toUpperCase() })} placeholder="IN" />}
              <Input aria-label={`Rule ${i + 1} destination`} value={r.destination} onChange={e => update(i, { destination: e.target.value })} placeholder="https://apps.apple.com/…" />
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-11 px-2" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move rule ${i + 1} up`}>↑</Button>
                <Button size="sm" variant="ghost" className="h-11 px-2" disabled={i === rules.length - 1} onClick={() => move(i, 1)} aria-label={`Move rule ${i + 1} down`}>↓</Button>
                <Button size="sm" variant="ghost" className="h-11" onClick={() => onChange(rules.filter((_, j) => j !== i))}>Remove</Button>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted">Rules are checked top to bottom; the first match wins.</p>
        </div>
      )}
    </div>
  );
}
