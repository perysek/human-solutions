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
      '/skills/api': { target: 'http://127.0.0.1:5001', changeOrigin: true },
      '/workers/api': { target: 'http://127.0.0.1:5001', changeOrigin: true },
    },
  },
});
