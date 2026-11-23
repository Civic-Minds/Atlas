const TAG_CLASS = 'font-medium text-[var(--text-muted)]';

/**
 * The word beside the Atlas name that says which Atlas this is (CIV-1692): Beta, or Internal on the dev server. Plain text
 * inside the logo's link, so the whole logo goes to the same place (#1737: Ryan, "When I click the word Internal here it
 * brings me to the http://localhost:5182/internal page instead of to the about page, like clicking on any other word here
 * would"). The local-only home page opens from the header's internal links (More).
 */
export default function ModeTag({ word }: { word: string }) {
  return <span className={TAG_CLASS}> {word}</span>;
}
