import type { ReactNode } from 'react';
import SiteContact from './components/SiteContact';
import DocsPageLayout from './components/ui/DocsPageLayout';
import { PageTitle, SectionTitle } from './components/ui/PageTitle';
import { parseLegalMarkdown, type LegalDoc, type LegalParagraph } from './lib/legalMarkdown';
import privacySource from '../docs/legal/PRIVACY.md?raw';
import termsSource from '../docs/legal/TERMS.md?raw';

type LegalDocument = 'terms' | 'privacy';

/** The page text has one source: docs/legal/TERMS.md and docs/legal/PRIVACY.md, bundled at build time. */
export const LEGAL_DOCS: Record<LegalDocument, LegalDoc> = {
  privacy: parseLegalMarkdown(privacySource),
  terms: parseLegalMarkdown(termsSource),
};

const CONTACT_PREFIX = 'mailto:hey@ryanisnota.pro?subject=';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className="scroll-mt-24"><SectionTitle level="item" className="mb-2">{title}</SectionTitle><div className="space-y-2">{children}</div></section>;
}

function Inline({ paragraph }: { paragraph: LegalParagraph }) {
  return <>{paragraph.map((part, i) => {
    if (part.type === 'em') return <em key={i}>{part.text}</em>;
    if (part.type === 'link') return <a key={i} className="text-[var(--accent)] hover:underline" href={part.href}>{part.text}</a>;
    return part.text;
  })}</>;
}

/** The Contact section keeps the shared site contact block: its sentence, then the email link on its own line. */
function Contact({ id, title, paragraphs }: { id: string; title: string; paragraphs: LegalParagraph[] }) {
  const [sentence, linkLine] = paragraphs;
  const link = linkLine?.length === 1 && linkLine[0].type === 'link' ? linkLine[0] : null;
  if (paragraphs.length !== 2 || sentence.some(part => part.type !== 'text') || !link || !link.href.startsWith(CONTACT_PREFIX)) {
    throw new Error('The legal Contact section must be one plain sentence, then one line with only the contact email link');
  }
  return (
    <SiteContact id={id} title={title} subject={decodeURIComponent(link.href.slice(CONTACT_PREFIX.length))} linkLabel={link.text}>
      {sentence.map(part => part.text).join('')}
    </SiteContact>
  );
}

export default function LegalPage({ document }: { document: LegalDocument }) {
  const doc = LEGAL_DOCS[document];
  return (
    <DocsPageLayout
      contents={{ title: doc.title, items: doc.sections.map(({ id, title }) => ({ id, label: title })) }}
      articleClassName="text-sm leading-relaxed text-[var(--text-dim)]"
    >
      <header><PageTitle className="text-[var(--text-primary)]">{doc.title}</PageTitle><p className="mt-3">{doc.updated}</p></header>
      {doc.intro.map((paragraph, i) => <p key={i}><Inline paragraph={paragraph} /></p>)}
      {doc.sections.map(section => section.id === 'contact'
        ? <Contact key={section.id} {...section} />
        : <Section key={section.id} id={section.id} title={section.title}>{section.paragraphs.map((paragraph, i) => <p key={i}><Inline paragraph={paragraph} /></p>)}</Section>)}
    </DocsPageLayout>
  );
}
