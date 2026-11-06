/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // In development, /api calls go to the NestJS server.
  server: { port: 5173, proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' } },
  preview: { port: 4173, proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['test/setup.ts'] },
});
