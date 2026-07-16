import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { DEFAULT_R2_PUBLIC_URL } from './shared/config';

// https://vitejs.dev/config/
// base: '/' for local dev and Vercel, '/Atlas/' for GitHub Pages
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const r2Target = (env.R2_PUBLIC_URL || DEFAULT_R2_PUBLIC_URL).replace(/\/$/, '');

  return {
    base: process.env.GITHUB_ACTIONS ? '/Atlas/' : '/',
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      port: 5100,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
        },
        // R2 blocks browser CORS from localhost — proxy artifact fetches in dev.
        '/atlas-data': {
          target: r2Target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/atlas-data/, ''),
        },
      },
      historyApiFallback: true,
    },
  };
});
