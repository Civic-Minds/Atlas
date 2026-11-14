import React from 'react';
import { BACK_ARROW, backLinkLabel } from '../content/backLinks';

// Every card's back control lives here, so cards can't drift apart (CIV-832, CIV-837).
// The rule: "← Back to " + where it goes, medium weight, above the card title. The words: src/content/backLinks.ts (CIV-1462).

/** Text link above a card title that goes back one level: "← " + where it goes (CIV-832, CIV-837). */
export function CardBackLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block max-w-full truncate text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors leading-snug mb-0.5"
    >
      {BACK_ARROW} {typeof children === 'string' ? backLinkLabel(children) : <>Back to {children}</>}
    </button>
  );
}
