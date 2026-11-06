import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC compiles NestJS decorators (with metadata) for the tests.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: { include: ['test/**/*.spec.ts'], testTimeout: 30000, hookTimeout: 60000 },
});
