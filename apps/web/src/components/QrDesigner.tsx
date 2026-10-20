'use client';
import { useMemo, useState } from 'react';
import { qs } from '@/lib/api';

// Relative luminance and contrast ratio (WCAG formula). Scanners need a clear
// difference between modules and background; below about 3:1 many phones fail.
function luminance(hex: string) {
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i + 1, i + 3), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const PRESETS = [
  { name: 'Ink', fg: '#15161c', bg: '#ffffff' },
  { name: 'Indigo', fg: '#3d44f0', bg: '#ffffff' },
  { name: 'Lime', fg: '#15161c', bg: '#ddf75b' },
  { name: 'Coral', fg: '#c63b20', bg: '#fff0ec' },
];

/** Live QR preview with colours, margin and download size. The API renders the image. */
export function QrDesigner({ qrUrl, code }: { qrUrl: string; code: string }) {
  const [fg, setFg] = useState('#15161c');
  const [bg, setBg] = useState('#ffffff');
  const [margin, setMargin] = useState(2);
  const [size, setSize] = useState(1024);
  const style = useMemo(() => ({ fg: fg.slice(1), bg: bg.slice(1), margin }), [fg, bg, margin]);
  const ratio = contrast(fg, bg);
  const svg = `${qrUrl}${qs(style)}`;
  const png = qrUrl.replace('.svg', '.png');

  return (
    <div className="card p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={svg} alt={`QR code for ${code}`} className="w-full rounded-lg" style={{ background: bg }} />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {PRESETS.map(p => (
          <button key={p.name} onClick={() => { setFg(p.fg); setBg(p.bg); }} title={p.name} aria-label={`${p.name} colours`}
            className="h-6 w-6 rounded-md border-2 border-ink" style={{ background: `linear-gradient(135deg, ${p.fg} 50%, ${p.bg} 50%)` }} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold">
        <label className="flex items-center gap-2">Dots<input type="color" value={fg} onChange={e => setFg(e.target.value)} className="h-7 w-full cursor-pointer rounded border border-line" /></label>
        <label className="flex items-center gap-2">Back<input type="color" value={bg} onChange={e => setBg(e.target.value)} className="h-7 w-full cursor-pointer rounded border border-line" /></label>
        <label className="col-span-2 flex items-center gap-2">Margin<input type="range" min={0} max={8} value={margin} onChange={e => setMargin(Number(e.target.value))} className="w-full accent-ink" /><span className="w-4 font-mono">{margin}</span></label>
      </div>
      {ratio < 3 && <p className="mt-2 text-xs font-semibold text-coral-ink">Contrast is {ratio.toFixed(1)}:1 — many phones will not scan this. Aim for 3:1 or more.</p>}
      <div className="mt-3 flex items-center gap-2">
        <select value={size} onChange={e => setSize(Number(e.target.value))} aria-label="PNG size" className="h-8 flex-1 rounded-lg border-2 border-ink bg-white px-1 font-mono text-xs">
          <option value={512}>512 px</option><option value={1024}>1024 px</option><option value={2048}>2048 px</option>
        </select>
        <a className="font-mono text-xs font-bold underline" href={`${png}${qs({ ...style, size, download: 1 })}`}>PNG</a>
        <a className="font-mono text-xs font-bold underline" href={`${svg}&download=1`}>SVG</a>
      </div>
      <p className="mt-2 text-[11px] text-muted">Scans are counted separately from clicks.</p>
    </div>
  );
}
