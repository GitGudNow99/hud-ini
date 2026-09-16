import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: {
    alias: {
      'hud-ini/terrain': new URL('./src/terrain.ts', import.meta.url).pathname,
      'hud-ini': new URL('./src/index.ts', import.meta.url).pathname,
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
