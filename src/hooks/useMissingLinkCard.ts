import { useEffect, useMemo, useState } from 'react';
import { linkValueUnknown } from '../utils/linkSelection';

/**
 * A stop or on-demand card a link asked for that can never open (#1191): its value isn't in the agency::id form, or
 * its agency (or on-demand service) isn't one Atlas has. The value is cleared, so it leaves the address bar, and the
 * card's place says why until something else opens. A well-formed on-demand value waits for the on-demand list:
 * some services are only in that list, not in the agency catalog (grande-prairie-on-demand).
 */
export function useMissingLinkCard({
  selectedStop,
  onDemandSelection,
  catalog,
  onDemandSlugs,
  onDemandEnabled,
  clearSelection,
  clearOnDemand,
  otherSelectionOpen,
}: {
  selectedStop: string | null;
  onDemandSelection: string | null;
  catalog: ReadonlyArray<{ slug: string }>;
  /** Every on-demand service's slug once the on-demand list has loaded, else null. */
  onDemandSlugs: ReadonlySet<string> | null;
  onDemandEnabled: boolean;
  clearSelection: () => void;
  clearOnDemand: () => void;
  /** A route, agency or search is open: the note gives way to it. */
  otherSelectionOpen: boolean;
}): { missing: 'stop' | 'onDemand' | null; dismiss: () => void } {
  const [missing, setMissing] = useState<'stop' | 'onDemand' | null>(null);
  const onDemandCatalog = useMemo(
    () => (onDemandSlugs ? [...catalog, ...[...onDemandSlugs].map(slug => ({ slug }))] : []),
    [catalog, onDemandSlugs],
  );
  useEffect(() => {
    if (selectedStop && linkValueUnknown(selectedStop, catalog, 'stop')) {
      clearSelection();
      setMissing('stop');
    } else if (onDemandEnabled && onDemandSelection && linkValueUnknown(onDemandSelection, onDemandCatalog, 'onDemand')) {
      clearOnDemand();
      setMissing('onDemand');
    }
  }, [selectedStop, onDemandSelection, catalog, onDemandCatalog, onDemandEnabled, clearSelection, clearOnDemand]);
  useEffect(() => {
    if (missing && (selectedStop || onDemandSelection || otherSelectionOpen)) setMissing(null);
  }, [missing, selectedStop, onDemandSelection, otherSelectionOpen]);
  return { missing, dismiss: () => setMissing(null) };
}
