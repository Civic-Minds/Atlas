/**
 * CIV-3197: the MCP's explain_method tool gives the Docs page's own words. This renders the Docs page
 * (src/pages/AboutDocsPage.tsx) and turns its method sections into plain text for docsMethods.generated.ts, which both servers
 * bundle. The text is never typed by hand: docsMethods.test.ts renders the page as the public site builds it and fails
 * when the file differs (ATLAS_WRITE_DOCS_METHODS=1 rewrites it).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AboutDocsPage from '../../src/pages/AboutDocsPage';
import { LIVE_GLOSSARY } from '../../shared/liveGlossary';
import { DOCS_METHOD_TOPICS } from './docsMethodTopics';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ' };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
  e.startsWith('#x') || e.startsWith('#X') ? String.fromCodePoint(parseInt(e.slice(2), 16))
    : e.startsWith('#') ? String.fromCodePoint(Number(e.slice(1)))
      : ENTITIES[e.toLowerCase()] ?? m);

/** One section's HTML as plain text: a line per heading, paragraph, list item, definition and table row. */
export function sectionText(html: string): string {
  return decode(html
    .replace(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/g, '\n## $2\n')
    .replace(/<li[^>]*>/g, '\n- ')
    .replace(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>/g, '\n$1: ')
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/g, ' | ')
    .replace(/<(p|tr|div|ul|dl|section)[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, ''))
    .split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
}

function section(html: string, id: string): string {
  const start = html.indexOf(`<section id="${id}"`);
  if (start < 0) throw new Error(`The Docs page has no section "${id}".`);
  return html.slice(start, html.indexOf('</section>', start));
}

/** The generated file's contents. */
export function docsMethodsFile(): string {
  const html = renderToStaticMarkup(createElement(AboutDocsPage));
  const texts: Record<string, string> = {};
  for (const t of DOCS_METHOD_TOPICS) {
    // The Live terms render in the browser only (#1524), so they come from the Docs glossary's own source.
    texts[t.key] = t.key === 'live'
      ? LIVE_GLOSSARY.map(g => `${g.term}${g.legend ? ': ' : ' '}${g.text}`).join('\n')
      : t.sections.map(id => sectionText(section(html, id))).join('\n');
  }
  return `// Generated from the Docs page by scripts/mcp/docsMethodsRender.ts (CIV-3197). Do not edit: run\n// ATLAS_WRITE_DOCS_METHODS=1 npx vitest run scripts/mcp/docsMethods.test.ts\nexport const DOCS_METHOD_TEXT: Record<string, string> = ${JSON.stringify(texts, null, 2)};\n`;
}
