import type { ReactNode } from 'react';

/** A pale tint of a frequency colour on the page background: never a dark fill (STYLE.md), as on About. */
export const featureTint = (color: string) => `color-mix(in srgb, ${color} 11%, var(--bg-app))`;

/**
 * A feature card: a tinted card, its heading and text beside its pictures (stacked on phones). Made for the For Transit
 * Planners page (CIV-1320) and shared so the Request a demo card (CIV-1706) is the same card wherever it goes.
 */
export default function FeatureCard({ title, color, pictures, children }: { title: string; color: string; pictures: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-8 rounded-2xl p-6 sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-10" style={{ background: featureTint(color) }}>
      <div>
        <h2 className="text-2xl font-black tracking-tight">{title}</h2>
        <div className="mt-3 space-y-3 text-base leading-7 text-[var(--text-muted)]">{children}</div>
      </div>
      <div>{pictures}</div>
    </section>
  );
}
