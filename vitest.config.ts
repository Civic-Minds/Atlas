import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Only the React app needs a DOM. Running pipeline, shared, scripts, api and worker tests
// under plain Node instead of jsdom cuts their run time by about three quarters.
export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        projects: [
            {
                extends: true,
                test: {
                    name: 'dom',
                    environment: 'jsdom',
                    include: ['src/**/*.test.{ts,tsx}'],
                    setupFiles: ['./src/test/setup.ts'],
                },
            },
            {
                extends: true,
                test: {
                    name: 'node',
                    environment: 'node',
                    include: [
                        'pipeline/**/*.test.ts',
                        'shared/**/*.test.ts',
                        'scripts/**/*.test.ts',
                        'api/**/*.test.ts',
                        'workers/**/*.test.ts',
                    ],
                },
            },
        ],
    },
});
