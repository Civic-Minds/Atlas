import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
// base: '/' for local dev, '/Atlas/' for GitHub Pages (CI=true on GitHub Actions)
export default defineConfig({
  base: process.env.CI ? '/Atlas/' : '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
});
