import DocsPageLayout from '../components/ui/DocsPageLayout';
import ArrowLink from '../components/ui/ArrowLink';
import Tag from '../components/ui/Tag';
import Card from '../components/ui/Card';
import AppLink from '../components/ui/AppLink';
import ResearchTile from '../components/ResearchTile';
import { PageTitle, SectionTitle } from '../components/ui/PageTitle';
import { RESEARCH } from '../data/research';
import { RESEARCH_DRAFTS } from './researchDrafts';
import { PAGE_NAMES } from '../../shared/pageNames';
import { DRAFT_TAG } from '../content/noticeCopy';

/** Published research, then stories still being built where they will go once published (dev server only; CIV-1550). */
const DRAFT_CARDS: ReadonlyArray<{ href: string; Icon: (typeof RESEARCH)[number]['Icon']; kind: string; title: string; body?: string; linkText?: string; draft?: boolean }> =
  RESEARCH_DRAFTS.map(({ href, Icon, kind, title }) => ({ href, Icon, kind, title, draft: true }));

export default function ResearchPage() {
  return (
    <DocsPageLayout articleClassName="text-sm leading-relaxed text-[var(--text-dim)]">
            <header>
              <PageTitle className="text-[var(--text-primary)]">{PAGE_NAMES.research}</PageTitle>
              <p className="mt-3">Maps, stories and data that look closer at transit service.</p>
            </header>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* CIV-1789 (Ryan's pick): published research shows About's tile, picture on top, kept straight. A draft has no
                  picture yet and keeps the plain card. */}
              {RESEARCH.map(entry => <ResearchTile key={entry.href} entry={entry} />)}
              {DRAFT_CARDS.map(({ href, Icon, kind, title, body, linkText, draft }) => (
                <Card as={AppLink} key={href} to={href} tone="surface" padding="compact" className="group flex flex-col transition-colors hover:border-[var(--accent-border)]">
                  <div className="flex items-center justify-between gap-3">
                    <Icon className="h-4 w-4 text-[var(--text-dim)]" aria-hidden="true" />
                    <span className="flex items-center gap-2">
                      {import.meta.env.DEV && draft && <Tag tone="accent" className="text-xs">{DRAFT_TAG}</Tag>}
                      <Tag>{kind}</Tag>
                    </span>
                  </div>
                  <SectionTitle level="item" className="mt-4">{title}</SectionTitle>
                  {body && <p className="mt-2">{body}</p>}
                  {/* Pinned to the bottom so the links line up across a row. */}
                  {linkText && <ArrowLink as="span" tone="inline" size="xs" nudge className="mt-auto self-start pt-4">{linkText}</ArrowLink>}
                </Card>
              ))}
            </div>
    </DocsPageLayout>
  );
}
