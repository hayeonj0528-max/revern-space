import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/playwright-report/**', '**/test-results/**'] }, proxy: { '/ws': { target: `ws://127.0.0.1:${process.env.REVERN_SERVER_PORT || 2567}`, ws: true }, '/api': `http://127.0.0.1:${process.env.REVERN_SERVER_PORT || 2567}` } },
  build: { chunkSizeWarningLimit: 1100, rollupOptions: { output: { manualChunks: { three: ['three', '@react-three/fiber'] } } } }
});
