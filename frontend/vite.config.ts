import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Proxied to the Flask backend (app.py, port 5001 — see BACKEND_SETUP.md
    // at the repo root). Deliberately scoped to the backend's actual route
    // prefixes rather than a single catch-all '/api': '/employees' is BOTH
    // a React Router page (this app's own employee list) AND, more
    // specifically, '/employees/api' is the backend's employees JSON API —
    // proxying bare '/employees' would swallow the frontend route on a hard
    // refresh. '/auth' and '/system' have no frontend-route collision, so
    // they're proxied whole.
    proxy: {
      '/auth': { target: 'http://127.0.0.1:5001', changeOrigin: true },
      '/system': { target: 'http://127.0.0.1:5001', changeOrigin: true },
      '/employees/api': { target: 'http://127.0.0.1:5001', changeOrigin: true },
      // Same '/prefix/api' scoping as '/employees/api' above — '/jobs' and
      // '/skills' are also React Router pages, so only the JSON API suffix
      // is proxied (IMPLEMENTATION_PLAN.md Phase 1).
      '/jobs/api': { target: 'http://127.0.0.1:5001', changeOrigin: true },
      // task1 — '/departments' is also a React Router page (Działy firmy),
      // same '/prefix/api' scoping as '/jobs' above.
      '/departments/api': { target: 'http://127.0.0.1:5001', changeOrigin: true },
      '/skills/api': { target: 'http://127.0.0.1:5001', changeOrigin: true },
      '/workers/api': { target: 'http://127.0.0.1:5001', changeOrigin: true },
      // Same '/prefix/api' scoping (Faza 4, IMPLEMENTATION_PLAN.md §9) —
      // '/medical' and '/bhp' are also React Router pages (the expiring
      // reports below), so only the JSON API suffix is proxied.
      '/medical/api': { target: 'http://127.0.0.1:5001', changeOrigin: true },
      '/bhp/api': { target: 'http://127.0.0.1:5001', changeOrigin: true },
      // Faza 5 (IMPLEMENTATION_PLAN.md §10) — same '/trainings' collision as
      // above ('/trainings' is also a React Router page), so only the JSON
      // API suffix is proxied. CSV export (TRN_11) rides this same proxy
      // entry as a plain browser navigation, not a fetch() call.
      '/trainings/api': { target: 'http://127.0.0.1:5001', changeOrigin: true },
      // Faza 6 (IMPLEMENTATION_PLAN.md §11) — same '/prefix/api' scoping.
      // No frontend-route collision today ('/' and '/alert-thresholds' are
      // the dashboard's own pages, not under '/dashboard'), but scoping to
      // '/api' keeps this consistent with every other module above instead
      // of being the one exception.
      '/dashboard/api': { target: 'http://127.0.0.1:5001', changeOrigin: true },
      // MOBILE_PRESENCE_CONFIRMATION_PLAN.md §5.1 — '/public' has no
      // frontend-route collision (the mobile page itself lives at
      // '/confirm/:token', not '/public'), so — same as '/auth'/'/system'
      // above — it's proxied whole, not scoped to a '/public/api' suffix.
      '/public': { target: 'http://127.0.0.1:5001', changeOrigin: true },
    },
  },
});
