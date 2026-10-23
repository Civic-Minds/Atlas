/**
 * Parser for the small markdown subset used by docs/legal/TERMS.md and docs/legal/PRIVACY.md, which are the
 * source of the /terms and /privacy pages. Supported: one `# Title`, a `Last updated …` line, paragraphs,
 * `## Heading {#id}` sections, `*emphasis*` and `[label](href)` links. Anything else throws, so an edit that
 * uses unsupported syntax fails the tests instead of rendering wrong.
 */

export type LegalInline = { type: 'text'; text: string } | { type: 'em'; text: string } | { type: 'link'; text: string; href: string };
export type LegalParagraph = LegalInline[];
export type LegalSection = { id: string; title: string; paragraphs: LegalParagraph[] };
export type LegalDoc = { title: string; updated: string; intro: LegalParagraph[]; sections: LegalSection[] };

const INLINE = /\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(text: string): LegalParagraph {
  const out: LegalParagraph = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) out.push({ type: 'text', text: text.slice(last, match.index) });
    if (match[1] !== undefined) out.push({ type: 'em', text: match[1] });
    else out.push({ type: 'link', text: match[2], href: match[3] });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  for (const part of out) {
    if (part.type === 'text' && /[*[\]_`<>]/.test(part.text)) throw new Error(`Unsupported markdown in legal text: ${part.text}`);
  }
  return out;
}

export function parseLegalMarkdown(source: string): LegalDoc {
  const blocks = source.replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  const titleMatch = /^# (.+)$/.exec(blocks[0] ?? '');
  if (!titleMatch) throw new Error('Legal markdown must start with a "# Title" line');
  const updated = blocks[1] ?? '';
  if (!/^Last updated .+\.$/.test(updated)) throw new Error('Legal markdown needs a "Last updated …." line after the title');
  const doc: LegalDoc = { title: titleMatch[1], updated, intro: [], sections: [] };
  for (const block of blocks.slice(2)) {
    if (block.includes('\n')) throw new Error(`Legal markdown blocks must be one line: ${block.slice(0, 60)}`);
    const heading = /^## (.+) \{#([a-z0-9-]+)\}$/.exec(block);
    if (heading) {
      doc.sections.push({ id: heading[2], title: heading[1], paragraphs: [] });
      continue;
    }
    if (/^(#|[-+>]|\d+\.)/.test(block)) throw new Error(`Unsupported markdown block in legal text: ${block.slice(0, 60)}`);
    const paragraph = parseInline(block);
    const section = doc.sections[doc.sections.length - 1];
    (section ? section.paragraphs : doc.intro).push(paragraph);
  }
  return doc;
}
