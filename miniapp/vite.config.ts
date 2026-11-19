import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

export default defineConfig({
  plugins: [uni()],
  // H5 预览用：开发时 /api 转发到本机后端，小程序端不用这段（小程序请求必须走绝对地址）
  server: {
    port: 5180,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7001',
        changeOrigin: true,
      },
    },
  },
});
