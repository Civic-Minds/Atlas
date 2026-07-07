import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
// base: '/' for local dev and Vercel, '/Atlas/' for GitHub Pages
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const r2Target = (env.R2_PUBLIC_URL || 'https://pub-85dc05d357954b6399c9a44018a3221e.r2.dev').replace(/\/$/, '');

  return {
    base: process.env.GITHUB_ACTIONS ? '/Atlas/' : '/',
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3010',
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

