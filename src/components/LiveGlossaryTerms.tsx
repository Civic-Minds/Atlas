import { LIVE_GLOSSARY } from '../../shared/liveGlossary';

/** The Live terms for the Docs glossary. Lazy-loaded by AboutDocsPage only when Live is on, so the text stays out of the public bundle. */
export default function LiveGlossaryTerms() {
  return (
    <>
      {LIVE_GLOSSARY.map(g => <p key={g.term}><strong className="text-[var(--text-primary)]">{g.term}:</strong> {g.text.charAt(0).toUpperCase() + g.text.slice(1)}</p>)}
    </>
  );
}
