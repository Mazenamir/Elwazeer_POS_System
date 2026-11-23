import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

const currentDir = import.meta.dirname;
const pkg = JSON.parse(fs.readFileSync(path.resolve(currentDir, 'package.json'), 'utf8'));

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || '1.0.0'),
  },
  root: path.resolve(currentDir, 'src/renderer'),
  publicDir: path.resolve(currentDir, 'src/renderer/public'),
  build: {
    outDir: path.resolve(currentDir, 'dist/renderer'),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:6253',
        changeOrigin: true,
        secure: false,
        bypass: (req) => {
          // Never proxy frontend JS/JSX modules or Vite internal assets
          if (
            req.url.endsWith('.js') ||
            req.url.endsWith('.jsx') ||
            req.url.endsWith('.mjs') ||
            req.url.includes('?import') ||
            req.url.includes('@fs') ||
            req.url.includes('@vite')
          ) {
            return req.url;
          }
        },
      },
      '/uploads': {
        target: 'http://127.0.0.1:6253',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(currentDir, 'src/renderer'),
    },
  },
});
