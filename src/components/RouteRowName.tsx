/** The name part's look: light weight, muted colour. Exported for a list that lays the two parts out itself (Near You). */
export const ROUTE_ROW_NAME = 'font-normal text-[var(--text-muted)]';

/**
 * A route's name in a list and in a title (CIV-928, CIV-1128): the number in bold, then the name in a light weight with
 * no dash ("**504** King"). A route with no number shows its name in bold alone. Plain text keeps "504 — King".
 * Get the parts from `routeLabels(...)`: `shortName` is its `primary`, `name` its `secondary`.
 */
export default function RouteRowName({ shortName, name, nameClassName = '' }: {
  shortName: string;
  name?: string | null;
  /** Extra classes on the name, for a list that keeps its own line height (search's `text-xs`). */
  nameClassName?: string;
}) {
  return (
    <>
      <span className="font-black">{shortName}</span>
      {name && name !== shortName && <span className={`${ROUTE_ROW_NAME} ml-1.5 ${nameClassName}`.trim()}>{name}</span>}
    </>
  );
}

/**
 * A route title on screen (card titles, the chart window, Live page titles; CIV-1128): drawn as RouteRowName, while
 * screen readers get the plain text with its dash ("504 — King"). Pass `routeLabels(...)`.
 */
export function RouteTitleName({ label }: { label: { primary: string; secondary?: string; text: string } }) {
  return (
    <>
      <span className="sr-only">{label.text}</span>
      <span aria-hidden="true"><RouteRowName shortName={label.primary} name={label.secondary} /></span>
    </>
  );
}
