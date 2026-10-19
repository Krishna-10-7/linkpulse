export const num = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-IN');

export const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n > 0 ? '▲' : n < 0 ? '▼' : ''} ${Math.abs(n)}%`);

export function date(d?: string | Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dateTime(d?: string | Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ago(d?: string | Date | null) {
  if (!d) return '—';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

/** For <input type="datetime-local"> values. */
export function toLocalInput(d?: string | null) {
  if (!d) return '';
  const x = new Date(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

export const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-mark border-ink',
  PAUSED: 'bg-amber/15 border-amber/60 text-[#8a5a00]',
  ARCHIVED: 'bg-ink/5 border-line text-muted',
  DISABLED: 'bg-coral-soft border-coral/50 text-coral-ink',
};
