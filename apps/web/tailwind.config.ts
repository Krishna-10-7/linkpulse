import type { Config } from 'tailwindcss';

// "Paper & Ink": paper background, ink text, highlighter lime, hard ink shadows.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#f4f2ea', deep: '#ebe8dc' },
        card: '#fffefb',
        ink: { DEFAULT: '#15161c', 2: '#3f3e39' },
        muted: '#6f6c62',
        faint: '#a19d90',
        mark: { DEFAULT: '#ddf75b', soft: '#f1fcc0' },
        coral: { DEFAULT: '#ff5b3a', ink: '#c63b20', soft: '#fff0ec' },
        teal: '#0f9d77',
        indigo: '#3d44f0',
        violet: '#8a4dff',
        amber: '#e39b0b',
        sky: '#1e8de0',
        line: 'rgba(21,22,28,.12)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-body)', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'Consolas', 'monospace'],
      },
      boxShadow: { ink: '4px 4px 0 #15161c', 'ink-lg': '6px 6px 0 #15161c', mark: '3px 3px 0 #ddf75b' },
      borderRadius: { xl2: '18px' },
    },
  },
  plugins: [],
};
export default config;
