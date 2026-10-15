import type { HTMLAttributes } from 'react';

const TONES = {
  /** Grey label next to a name ("Live", "History", "Vehicles"). */
  quiet: {
    sm: 'rounded-full border bg-[var(--control-inactive-bg)] border-[var(--control-inactive-border)] text-[var(--text-muted)] px-1.5 py-0.5 text-xs font-medium',
    md: 'rounded-full border bg-[var(--control-inactive-bg)] border-[var(--control-inactive-border)] text-[var(--control-inactive-fg)] px-2.5 py-0.5 text-xs font-bold',
  },
  /** Accent outline that sits in running text ("New", "Beta"). The text size comes from the caller. */
  accent: {
    sm: 'inline-block rounded-full border border-[var(--accent-border)] px-1.5 py-px font-bold leading-tight text-[var(--accent)] align-middle',
    md: 'inline-block rounded-full border border-[var(--accent-border)] px-1.5 py-px font-bold leading-tight text-[var(--accent)] align-middle',
  },
} as const;

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: keyof typeof TONES;
  /** sm: the small label beside a name. md: the roomier static chip (Live vehicle lists). */
  size?: 'sm' | 'md';
}

/** Small rounded label. The one component for every tag, so "Live" and "New" look the same on every screen. */
export default function Tag({ tone = 'quiet', size = 'sm', className = '', ...rest }: TagProps) {
  return <span className={`${TONES[tone][size]} ${className}`.trim()} {...rest} />;
}
