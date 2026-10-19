'use client';
import { useState } from 'react';
import { Button } from './ui';

export function CopyButton({ text, label = 'Copy', size = 'sm' as 'sm' | 'md' }: { text: string; label?: string; size?: 'sm' | 'md' }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); } catch {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }
  return <Button variant="ghost" size={size} onClick={copy} aria-label={`Copy ${text}`}>{done ? 'Copied' : label}</Button>;
}
