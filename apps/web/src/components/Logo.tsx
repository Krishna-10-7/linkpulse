export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#15161c" />
      <polyline points="8,34 20,34 26,20 34,48 42,12 48,34 56,34" fill="none" stroke="#ddf75b" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
