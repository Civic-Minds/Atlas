import DocsPageLayout from '../components/ui/DocsPageLayout';
import ArrowLink from '../components/ui/ArrowLink';
import Tag from '../components/ui/Tag';
import { SURFACE } from '../styles';
import { PageTitle, SectionTitle } from '../components/ui/PageTitle';
import { RESEARCH } from '../data/research';
import { RESEARCH_DRAFTS } from './researchDrafts';
import { PAGE_NAMES } from '../../shared/pageNames';

/** Published research, then stories still being built where they will go once published (dev server only; CIV-1550). */
const CARDS: ReadonlyArray<{ href: string; Icon: (typeof RESEARCH)[number]['Icon']; kind: string; title: string; body?: string; linkText?: string; draft?: boolean }> = [
  ...RESEARCH,
  ...RESEARCH_DRAFTS.map(({ href, Icon, kind, title }) => ({ href, Icon, kind, title, draft: true })),
];

export default function ResearchPage() {
  return (
    <DocsPageLayout articleClassName="text-sm leading-relaxed text-[var(--text-dim)]">
            <header>
              <PageTitle className="text-[var(--text-primary)]">{PAGE_NAMES.research}</PageTitle>
              <p className="mt-3">Maps, stories and data that look closer at transit service.</p>
            </header>
            <div className="grid gap-4 sm:grid-cols-2">
              {CARDS.map(({ href, Icon, kind, title, body, linkText, draft }) => (
                <a key={href} href={href} className={`${SURFACE} group flex flex-col rounded-2xl p-5 transition-colors hover:border-[var(--accent-border)]`}>
                  <div className="flex items-center justify-between gap-3">
                    <Icon className="h-4 w-4 text-[var(--text-dim)]" aria-hidden="true" />
                    <span className="flex items-center gap-2">
                      {import.meta.env.DEV && draft && <Tag tone="accent" className="text-xs">Draft</Tag>}
                      <Tag>{kind}</Tag>
                    </span>
                  </div>
                  <SectionTitle level="item" className="mt-4">{title}</SectionTitle>
                  {body && <p className="mt-2">{body}</p>}
                  {/* Pinned to the bottom so the links line up across a row. */}
                  {linkText && <ArrowLink as="span" tone="inline" size="xs" nudge className="mt-auto self-start pt-4">{linkText}</ArrowLink>}
                </a>
              ))}
            </div>
    </DocsPageLayout>
  );
}
