import { defineConfig } from 'vite';

// Relative assets also work on /sora/, a custom domain, or another static host.
export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5182, strictPort: true },
  preview: { host: '127.0.0.1', port: 5182, strictPort: true },
});
