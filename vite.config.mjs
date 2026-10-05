import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const currentDir = import.meta.dirname;

export default defineConfig({
  plugins: [react()],
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
      },
      '/logos': {
        target: 'http://127.0.0.1:6253',
        changeOrigin: true,
      },
      '/assets': {
        target: 'http://127.0.0.1:6253',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(currentDir, 'src/renderer'),
    },
  },
});
