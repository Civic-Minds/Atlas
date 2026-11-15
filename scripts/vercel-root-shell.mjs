/**
 * Last build step on Vercel: move the app shell from dist/index.html to dist/app.html, so no file sits at "/".
 *
 * Vercel serves a real file before it looks at rewrites, so while dist/index.html existed the preview-bot rewrite
 * on "/" (vercel.json, CIV-1175) never fired and shared map links always previewed with the default picture
 * (checked on the PR #1438 preview deploy). With no file at "/", vercel.json's rewrites decide: preview bots on a
 * link with a place go to api/share-preview, and everyone else gets /app.html, the same page as before.
 *
 * Only on Vercel (VERCEL=1, which Vercel sets for every build, and scripts/check-vercel.sh sets too): local
 * `vite preview` still needs dist/index.html.
 */
import { existsSync, renameSync } from 'node:fs';

export const ROOT_SHELL = 'app.html';

if (process.env.VERCEL === '1') {
  if (!existsSync('dist/index.html')) throw new Error('vercel-root-shell: dist/index.html is missing; run after the build');
  renameSync('dist/index.html', `dist/${ROOT_SHELL}`);
  console.log(`vercel-root-shell: dist/index.html moved to dist/${ROOT_SHELL}, so vercel.json's rewrites answer "/"`);
}
