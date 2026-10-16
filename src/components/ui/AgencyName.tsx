/**
 * An agency's name as the lists show it: the main name, then its place in a lighter colour after a dot
 * ("Toronto Transit Commission · Toronto"). Get `primary` and `secondary` from `agencyDisplayParts`.
 * `tone="inherit"` is for a name inside a coloured button: the place keeps the button's colour, faded.
 */
export default function AgencyName({ primary, secondary, tone = 'dim', children }: { primary: string; secondary?: string; tone?: 'dim' | 'inherit'; children?: React.ReactNode }) {
  return (
    <>
      {primary}
      {secondary && <span className={tone === 'inherit' ? 'opacity-60 font-semibold' : 'font-normal text-[var(--text-dim)]'}> · {secondary}</span>}
      {children}
    </>
  );
}
