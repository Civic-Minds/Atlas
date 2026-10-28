import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Only tests that use a page need a DOM. Running everything else under plain Node instead of
// jsdom cuts its run time by about three quarters (CIV-1017).
//
// The rule, by file name:
// - *.test.tsx (React components) and *.dom.test.ts (hooks and browser helpers that use
//   document, window, localStorage or testing-library) run under jsdom;
// - every other *.test.ts, in src too, runs under Node.
// A Node test that touches the page fails loudly (document or window is not defined): rename it
// to *.dom.test.ts.
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
                    include: ['src/**/*.test.tsx', 'src/**/*.dom.test.ts'],
                    setupFiles: ['./src/test/setup.ts'],
                },
            },
            {
                extends: true,
                test: {
                    name: 'node',
                    environment: 'node',
                    include: [
                        'src/**/*.test.ts',
                        'pipeline/**/*.test.ts',
                        'shared/**/*.test.ts',
                        'scripts/**/*.test.ts',
                        'api/**/*.test.ts',
                        'local-api/**/*.test.ts',
                        'workers/**/*.test.ts',
                    ],
                    exclude: [...configDefaults.exclude, '**/*.dom.test.ts'],
                },
            },
        ],
    },
});
