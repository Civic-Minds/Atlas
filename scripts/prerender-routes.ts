/**
 * Post-build step: writes dist/<route>/index.html for the static pages, with the page's real
 * text inside #root and its own title, canonical and robots tags. The app still mounts over it.
 * Run after `vite build` and `vite build --ssr src/prerender.tsx --outDir .prerender`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITE_URL, applySeoToHtml, injectRootHtml, prerenderRoutes, resolveSeo } from '../shared/seo';

const dist = resolve('dist');
const mod = await import(pathToFileURL(resolve('.prerender/prerender.js')).href);
const shell = readFileSync(join(dist, 'index.html'), 'utf8');
// Staging builds are never canonical to production; describe the host they are served from.
const origin = mod.BUILD_MODE === 'public' ? SITE_URL : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : SITE_URL;

for (const route of prerenderRoutes(mod.BUILD_FLAGS)) {
  if (!mod.PRERENDER_PATHS.includes(route.path)) throw new Error(`${route.path} is in the route table but has no prerender page`);
  const seo = resolveSeo(route.path, { mode: mod.BUILD_MODE, flags: mod.BUILD_FLAGS, origin });
  const html = injectRootHtml(applySeoToHtml(shell, seo), mod.renderPage(route.path));
  const file = join(dist, route.path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  console.log(`Prerendered ${route.path}`);
}
