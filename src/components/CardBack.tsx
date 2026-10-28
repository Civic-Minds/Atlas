import React from 'react';

// Every card's back control lives here, so cards can't drift apart (CIV-832, CIV-837).
// The rule: "← " + where it goes, medium weight, above the card title.

/** Text link above a card title that goes back one level: "← " + where it goes (CIV-832, CIV-837). */
export function CardBackLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block max-w-full truncate text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors leading-snug mb-0.5"
    >
      ← {children}
    </button>
  );
}
