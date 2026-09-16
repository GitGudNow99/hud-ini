import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import macros from 'unplugin-parcel-macros';
export default defineConfig({
  plugins: [macros.vite(), react()],
  css: { transformer: 'lightningcss' },
  optimizeDeps: { exclude: ['@react-spectrum/s2/style'] },
  resolve: {
    alias: {
      '@': new URL('./demo', import.meta.url).pathname,
      'hud-ini/terrain': new URL('./src/terrain.ts', import.meta.url).pathname,
      'hud-ini': new URL('./src/index.ts', import.meta.url).pathname,
    },
  },
  root: 'demo',
  base: './',
  server: { port: 5198, strictPort: true },
  build: {
    outDir: '../demo-dist',
    emptyOutDir: true,
    cssMinify: 'lightningcss',
    cssCodeSplit: false,
  },
});
