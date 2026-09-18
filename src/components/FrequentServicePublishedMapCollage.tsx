import { publishedMapFrames } from './FrequentServicePublishedMapMontage';

export default function FrequentServicePublishedMapCollage() {
  return (
    <figure className="mt-5 w-full overflow-hidden rounded-[1.5rem] border border-[var(--border-primary)] bg-[#f4f3ef] shadow-sm">
      <div className="grid auto-rows-[6.5rem] grid-cols-2 gap-1 bg-[var(--border-primary)] sm:auto-rows-[8rem] sm:grid-cols-4">
        {publishedMapFrames.map((frame, index) => (
          <a
            key={frame.image}
            href={frame.source}
            target="_blank"
            rel="noreferrer"
            className={`group relative overflow-hidden bg-[#f4f3ef] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-border)] ${index === 0 ? 'col-span-2 row-span-2' : index === 5 ? 'col-span-2' : ''}`}
            aria-label={`Open the published system map from ${frame.agency}`}
          >
            <img src={frame.image} alt={`Published system map from ${frame.agency}.`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-7 text-[0.6rem] font-bold text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
              {frame.agency}
            </span>
          </a>
        ))}
      </div>
      <figcaption className="px-4 py-3 text-xs text-[var(--text-muted)] sm:px-6">
        The same published map excerpts as a single visual field.
      </figcaption>
    </figure>
  );
}
