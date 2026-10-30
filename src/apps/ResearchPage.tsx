import DocsPageLayout from '../components/ui/DocsPageLayout';
import ArrowLink from '../components/ui/ArrowLink';
import Tag from '../components/ui/Tag';
import { SURFACE } from '../styles';
import { PageTitle, SectionTitle } from '../components/ui/PageTitle';
import { RESEARCH } from '../data/research';

export default function ResearchPage() {
  return (
    <DocsPageLayout articleClassName="text-sm leading-relaxed text-[var(--text-dim)]">
            <header>
              <PageTitle className="text-[var(--text-primary)]">Research</PageTitle>
              <p className="mt-3">Views of transit service that the main map does not show.</p>
            </header>
            <div className="grid gap-4 sm:grid-cols-2">
              {RESEARCH.map(({ href, Icon, kind, title, body, linkText }) => (
                <a key={href} href={href} className={`${SURFACE} group flex flex-col rounded-2xl p-5 transition-colors hover:border-[var(--accent-border)]`}>
                  <div className="flex items-center justify-between gap-3">
                    <Icon className="h-4 w-4 text-[var(--text-dim)]" aria-hidden="true" />
                    <Tag>{kind}</Tag>
                  </div>
                  <SectionTitle level="item" className="mt-4">{title}</SectionTitle>
                  <p className="mt-2">{body}</p>
                  {/* Pinned to the bottom so the links line up across a row. */}
                  <ArrowLink as="span" tone="inline" size="xs" nudge className="mt-auto self-start pt-4">{linkText}</ArrowLink>
                </a>
              ))}
            </div>
    </DocsPageLayout>
  );
}
