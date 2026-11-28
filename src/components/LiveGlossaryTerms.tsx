import { LIVE_GLOSSARY } from '../../shared/liveGlossary';
import { GlossaryTerms, sortGlossary, type GlossaryEntry } from './GlossaryTerms';

/** Live's terms as glossary entries, wording as before. */
export const liveGlossaryEntries = (): GlossaryEntry[] =>
  LIVE_GLOSSARY.map(g => ({ term: g.term, node: <p key={g.term}><strong className="text-[var(--text-primary)]">{g.term}</strong>{g.legend ? ': ' : ' '}{g.text}</p> }));

/**
 * The Docs glossary with the Live terms sorted into place (CIV-3191: one A–Z list). Lazy-loaded by AboutDocsPage only when Live
 * is on, so the Live text stays out of the public bundle.
 */
export default function LiveGlossaryTerms({ core }: { core: readonly GlossaryEntry[] }) {
  return <GlossaryTerms entries={sortGlossary([...core, ...liveGlossaryEntries()])} />;
}
