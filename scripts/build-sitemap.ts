/** Writes public/sitemap.xml from the route table in shared/seo.ts. Runs before every build. */
import { writeFileSync } from 'node:fs';
import { buildSitemapXml } from '../shared/seo';

writeFileSync('public/sitemap.xml', buildSitemapXml());
console.log('Wrote public/sitemap.xml');
