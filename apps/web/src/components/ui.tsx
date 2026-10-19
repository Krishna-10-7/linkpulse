'use client';
import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, forwardRef } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'mark'; size?: 'sm' | 'md' };
export function Button({ variant = 'primary', size = 'md', className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl border-2 border-ink font-mono font-bold tracking-wide transition active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-11 px-4 text-sm',
        variant === 'primary' && 'bg-ink text-mark shadow-mark hover:bg-ink-2',
        variant === 'ghost' && 'bg-white text-ink hover:bg-paper',
        variant === 'mark' && 'bg-mark text-ink shadow-ink hover:brightness-95',
        variant === 'danger' && 'bg-coral text-white shadow-ink hover:brightness-95',
        className,
      )}
    />
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cx('input', className)} />;
});

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-sm font-semibold text-coral-ink">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('card', className)}>{children}</div>;
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cx('inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider', className)}>{children}</span>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'bad' }) {
  return (
    <div className="soft p-4">
      <div className="label">{label}</div>
      <div className={cx('mt-1 font-display text-4xl font-semibold tabular-nums tracking-tight', tone === 'bad' && 'text-coral-ink')}>{value}</div>
      {sub ? <div className="mt-1 font-mono text-xs font-bold text-teal">{sub}</div> : null}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl2 border-2 border-dashed border-ink/25 p-10 text-center">
      <div className="font-display text-2xl font-semibold">{title}</div>
      {children ? <div className="mt-2 text-muted">{children}</div> : null}
    </div>
  );
}

export function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-ink border-t-transparent" aria-label="Loading" />;
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-4xl font-semibold md:text-5xl">{title}</h1>
        {sub ? <p className="mt-2 max-w-2xl font-display text-lg italic text-ink-2">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; children: ReactNode }) {
  const t = { info: 'bg-white border-line', warn: 'bg-[#fff5dc] border-[#f3d48a] text-[#8a5a00]', bad: 'bg-coral-soft border-coral/40 text-coral-ink', ok: 'bg-[#e3f6ef] border-[#a9e1cd] text-[#0b6e53]' }[tone];
  return <div className={cx('rounded-xl border px-4 py-3 text-sm font-medium', t)}>{children}</div>;
}
