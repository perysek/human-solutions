import type { Config } from 'tailwindcss';

// Mirrors the reference project's tailwind.config.js (root of the repo) so
// utility classes like `bg-primary-600` / `text-brand-500` / `bg-slate-100`
// resolve to the same values the GUI-GOLDEN-BOOK / GUI-COMPONENTS-GOLDEN-BOOK
// documents were written against. Do not rename these scales — components
// copy literal class names from the reference templates.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist Variable', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        accent: {
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
        brand: {
          50: '#fdf8ec',
          100: '#f9eecc',
          200: '#f2d98a',
          300: '#e8c050',
          400: '#d9a82e',
          500: '#c9a227',
          600: '#a8851f',
          700: '#866817',
          800: '#644e11',
          900: '#42330b',
        },
        slate: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          850: '#162032',
          900: '#0f172a',
        },
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
        '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
      },
    },
  },
  plugins: [],
} satisfies Config;
