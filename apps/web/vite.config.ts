import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Dev/preview: browser calls same-origin `/api/*`; proxy forwards to Nest (no CORS needed). */
const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:3000',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, '') || '/',
  },
} as const;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    port: 5173,
    proxy: apiProxy,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ['recharts'],
        },
      },
    },
  },
});
