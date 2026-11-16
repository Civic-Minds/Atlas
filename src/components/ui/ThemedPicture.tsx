/**
 * A picture with a light and a dark version; CSS shows the current theme's (index.css, .theme-light-only). Decorative:
 * the text beside it says what it shows. One component for About and the For Transit Planners page (CIV-1754).
 */
export default function ThemedPicture({ base, ext, className }: { base: string; ext: string; className: string }) {
  return (
    <>
      <img src={`${base}-light.${ext}`} alt="" className={`theme-light-only ${className}`} />
      <img src={`${base}-dark.${ext}`} alt="" className={`theme-dark-only ${className}`} />
    </>
  );
}
