import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // 前后端共用枚举 / 常量，只维护一份
      '@shared': fileURLToPath(new URL('../server/src/shared', import.meta.url)),
    },
  },
  server: {
    // 不加 host 时 vite 只监听 localhost(::1)，浏览器用 127.0.0.1 访问会 ERR_CONNECTION_REFUSED
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7001',
        changeOrigin: true,
      },
    },
  },
});
