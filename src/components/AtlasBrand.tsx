/** Wordmark only; use AtlasLogo for the logo. Same look at every width. page: the larger wordmark used in the content-page header, sized against its nav links. */
export default function AtlasBrand({ size = 'compact', hideByline = false }: { size?: 'compact' | 'page'; hideByline?: boolean }) {
  const page = size === 'page';
  return (
    <span className="inline-flex items-center gap-2">
      {/* items-start + text-left: inside the map header's home <button> the lines were centred to each other. */}
      <span className="flex flex-col items-start gap-px text-left">
        <span className={`${page ? 'text-lg' : 'text-sm'} leading-none font-black text-[var(--text-primary)]`}>Atlas</span>
        <span className={`${page ? 'text-[13px] leading-none text-[var(--text-muted)]' : 'text-2xs leading-none text-[var(--text-dim)]'} ${hideByline ? 'hidden sm:block' : ''}`}>by Civic Minds</span>
      </span>
    </span>
  );
}
