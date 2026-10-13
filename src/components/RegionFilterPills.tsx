import React from 'react';
import Pill from './ui/Pill';

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
        <Pill
          tone="glass"
          onClick={() => setSelectedRegions(new Set())}
          selected={selectedRegions.size === 0}
          title="Clear region filters"
          className="shrink-0"
        >
          All
        </Pill>
      )}
      {regions.map(region => (
        <Pill
          key={region}
          tone="glass"
          onClick={() => setSelectedRegions(previous => {
            const next = new Set(previous);
            if (next.has(region)) next.delete(region);
            else next.add(region);
            return next;
          })}
          selected={selectedRegions.has(region)}
          className="shrink-0"
        >
          {region}
        </Pill>
      ))}
    </>
  );
}
