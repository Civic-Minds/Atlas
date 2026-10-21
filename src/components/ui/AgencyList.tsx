import type { ReactNode } from 'react';
import ListRow from './ListRow';
import AgencyName from './AgencyName';
import { AGENCY_LIST_PRIMARY, LIST_REGION_HEAD } from '../../styles';

/**
 * The agency browser list: region sections of agency rows. The About panel's agency list and
 * History's agency chooser both draw it with these, so the two lists can't drift apart.
 */
export function AgencyList({ children }: { children: ReactNode }) {
  return <div className="py-2">{children}</div>;
}

/** One region's heading and its agency rows. */
export function AgencyRegionSection({ region, children }: { region: string; children: ReactNode }) {
  return (
    <div>
      <p className={LIST_REGION_HEAD}>{region}</p>
      {children}
    </div>
  );
}

/**
 * One agency row: its name (and place), an optional second line (`detail`, e.g. History's route
 * count) and optional tags on the right (`tags`).
 */
export function AgencyListRow({ primary, secondary, title, detail, tags, onClick }: {
  primary: string;
  secondary?: string;
  title?: string;
  detail?: ReactNode;
  tags?: ReactNode;
  onClick: () => void;
}) {
  const name = (
    <span className={AGENCY_LIST_PRIMARY} title={title}>
      <AgencyName primary={primary} secondary={secondary} />
    </span>
  );
  return (
    <ListRow variant="agency" onClick={onClick}>
      {detail != null ? (
        <span className="min-w-0">
          {name}
          <span className="block text-xs text-[var(--text-muted)]">{detail}</span>
        </span>
      ) : name}
      {tags && <div className="flex items-center gap-1.5 shrink-0 ml-2">{tags}</div>}
    </ListRow>
  );
}
