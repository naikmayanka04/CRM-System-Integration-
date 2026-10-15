import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: API calls to /api are proxied to the Express/Node server on :3001.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
});
