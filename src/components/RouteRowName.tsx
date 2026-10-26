/** The name part's look: light weight, muted colour. Exported for a list that lays the two parts out itself (Near You). */
export const ROUTE_ROW_NAME = 'font-normal text-[var(--text-muted)]';

/**
 * A route's name in a list (CIV-928): the number in bold, then the name in a light weight with no dash
 * ("**504** King"). A route with no number shows its name in bold alone. Card titles keep "504 — King".
 * Get the parts from `routeLabels(...)`: `shortName` is its `primary`, `name` its `secondary`.
 */
export default function RouteRowName({ shortName, name }: { shortName: string; name?: string | null }) {
  return (
    <>
      <span className="font-black">{shortName}</span>
      {name && name !== shortName && <span className={`${ROUTE_ROW_NAME} ml-1.5`}>{name}</span>}
    </>
  );
}
