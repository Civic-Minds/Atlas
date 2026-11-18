import type { CSSProperties } from 'react';
import AppLink from './ui/AppLink';
import Card from './ui/Card';
import ThemedPicture from './ui/ThemedPicture';
import Tag from './ui/Tag';
import ArrowLink from './ui/ArrowLink';
import { SectionTitle } from './ui/PageTitle';
import type { ResearchEntry } from '../data/research';

/**
 * A research tile: its share picture on top, then its kind, title, sentence and link. About's research row shows the
 * newest ones, each tilted a little (`tilt`, straightened on hover); the /research list shows every one straight
 * (CIV-1789, Ryan's pick: "the homepage card look").
 */
export default function ResearchTile({ entry, tilt }: { entry: ResearchEntry; tilt?: number }) {
  const tilted = tilt != null;
  return (
    <Card
      as={AppLink}
      tone="surface"
      to={entry.href}
      className={`group flex w-full flex-col overflow-hidden${tilted ? ' transition-[rotate] [rotate:var(--tilt)] hover:rotate-0 focus-visible:rotate-0' : ' transition-colors hover:border-[var(--accent-border)]'}`}
      style={tilted ? ({ '--tilt': `${tilt}deg` } as CSSProperties) : undefined}
    >
      <ThemedPicture base={entry.picture} ext={entry.pictureExt ?? 'svg'} className="block aspect-[1200/630] w-full object-cover" />
      <div className="flex flex-1 flex-col p-5">
        <Tag className="self-start">{entry.kind}</Tag>
        <SectionTitle level="item" className="mt-3">{entry.title}</SectionTitle>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{entry.body}</p>
        {/* Pinned to the bottom so the links line up across the row. */}
        <ArrowLink as="span" tone="inline" size="xs" nudge className="mt-auto self-start pt-4">{entry.linkText}</ArrowLink>
      </div>
    </Card>
  );
}
