import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: {
    alias: {
      '@gitgudnow99/hud-ini/terrain': new URL('./src/terrain.ts', import.meta.url).pathname,
      '@gitgudnow99/hud-ini': new URL('./src/index.ts', import.meta.url).pathname,
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
