import React from 'react';
import { APP_TAB_ACTIVE, APP_TAB_INACTIVE } from '../styles';

interface RegionFilterPillsProps {
  regions: string[];
  selectedRegions: Set<string>;
  setSelectedRegions: React.Dispatch<React.SetStateAction<Set<string>>>;
  includeAll?: boolean;
}

/** Shared state/province filter pills used by agency browsers. */
export default function RegionFilterPills({
  regions,
  selectedRegions,
  setSelectedRegions,
  includeAll = true,
}: RegionFilterPillsProps) {
  return (
    <>
      {includeAll && (
        <button
          type="button"
          onClick={() => setSelectedRegions(new Set())}
          aria-pressed={selectedRegions.size === 0}
          title="Clear region filters"
          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors whitespace-nowrap shrink-0 ${selectedRegions.size === 0 ? APP_TAB_ACTIVE : APP_TAB_INACTIVE}`}
        >
          All
        </button>
      )}
      {regions.map(region => (
        <button
          key={region}
          type="button"
          onClick={() => setSelectedRegions(previous => {
            const next = new Set(previous);
            if (next.has(region)) next.delete(region);
            else next.add(region);
            return next;
          })}
          aria-pressed={selectedRegions.has(region)}
          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors whitespace-nowrap shrink-0 ${selectedRegions.has(region) ? APP_TAB_ACTIVE : APP_TAB_INACTIVE}`}
        >
          {region}
        </button>
      ))}
    </>
  );
}
