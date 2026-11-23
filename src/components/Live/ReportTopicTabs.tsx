/**
 * CIV-2156 (Ryan: "We need to simplify it obviously but I'm worried about losing information"; his pick, 2026-11-23:
 * "I think D"): the Live Full report's topics as one row of topic pills, one topic showing at a time. Every topic keeps
 * every part it had; only how many show at once changes. The pills stay pinned under the page header while the topic
 * scrolls.
 */
import type { ReactNode } from 'react';
import { STICK_UNDER_HEADER } from '../../styles';
import PillGroup from '../ui/PillGroup';

export type ReportTopic<K extends string = string> = { key: K; title: string; body: ReactNode };

export default function ReportTopicTabs<K extends string>({ topics, open, setOpen, label }: {
  topics: ReadonlyArray<ReportTopic<K>>;
  /** The topic showing; the first one when it isn't one of `topics`. */
  open: K;
  setOpen: (key: K) => void;
  /** The pills' name for screen readers (the route's name). */
  label: string;
}) {
  const current = topics.find(t => t.key === open) ?? topics[0];
  return (
    <div className="mt-8">
      <div className={`sticky ${STICK_UNDER_HEADER} z-10 bg-[var(--bg-app)] py-2`}>
        <PillGroup label={label} value={current.key} onChange={setOpen} options={topics.map(t => [t.key, t.title] as const)} />
      </div>
      <div key={current.key}>{current.body}</div>
    </div>
  );
}
