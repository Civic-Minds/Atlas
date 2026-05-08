import React, { useState, useEffect } from 'react';
import {
  Ghost, Gauge, Scale, Zap, Timer, Eye, GitCompareArrows, Target
} from 'lucide-react';
import { ModuleIntro } from '../../components/ModuleIntro';
import { ModuleSubNav } from '../../components/ModuleSubNav';
import { useAuthStore } from '../../hooks/useAuthStore';
import { useViewAs } from '../../hooks/useViewAs';

// Modular Components
import { OverviewTab } from './components/OverviewTab';
import { ReliabilityAuditTab } from './components/ReliabilityAuditTab';
import { BottlenecksTab } from './components/BottlenecksTab';
import { GhostsTab } from './components/GhostsTab';
import { DwellsTab } from './components/DwellsTab';
import { CorridorsTab } from './components/CorridorsTab';
import { ServiceAuditTab } from './components/ServiceAuditTab';
import { StopAdherenceTab } from './components/StopAdherenceTab';

export default function PerformanceView() {
  const { role, agencyId: userAgencyId } = useAuthStore();
  const { viewAsAgency } = useViewAs();
  const isAdmin = role === 'admin' || role === 'researcher';
  const defaultAgency = isAdmin ? (viewAsAgency?.slug ?? '') : (userAgencyId ?? '');
  const [agency, setAgency] = useState(defaultAgency);
  const [activeTab, setActiveTab] = useState<string>('performance-overview');

  useEffect(() => {
    if (isAdmin) setAgency(viewAsAgency?.slug ?? '');
  }, [viewAsAgency, isAdmin]);

  const sections = [
    { id: 'performance-overview', label: 'Overview', icon: Gauge, description: 'Feed quality, live reporting volume, and immediate issues.' },
    { id: 'performance-reliability', label: 'Reliability', icon: Scale, description: 'Compare scheduled headways with observed service to see where the published promise is holding or breaking.' },
    { id: 'performance-delay', label: 'Delay', icon: Zap, description: 'Inspect where delay is accumulating and which segments are dragging the network down.' },
    { id: 'performance-ghosts', label: 'Ghosts', icon: Ghost, description: 'Find routes with scheduled service but missing or inconsistent realtime presence.' },
    { id: 'performance-dwells', label: 'Dwells', icon: Timer, description: 'Review stop-level dwell behaviour and where boarding friction is slowing service.' },
    { id: 'performance-corridors', label: 'Corridors', icon: Eye, description: 'Track shared trunk corridors and see where combined service is holding or collapsing.' },
    { id: 'performance-audit', label: 'Audit', icon: GitCompareArrows, description: 'Run before-and-after analysis against imported feed history to measure the impact of schedule changes.' },
    { id: 'performance-adherence', label: 'Adherence', icon: Target, description: 'Pick a route to see stop-by-stop on-time performance, delay trends, and which stops accumulate the most lateness.' },
  ] as const;

  const activeSection = sections.find(s => s.id === activeTab);

  return (
    <div className="module-container">
      <div className="print:hidden">
        <ModuleIntro
          subtitle="Inspect feed quality, delay build-up, ghost trips, dwell friction, and corridor reliability."
        />
      </div>

      {!agency ? (
        <div className="flex items-center justify-center py-24 text-[var(--text-muted)] text-sm">
          Select an agency above to load performance data.
        </div>
      ) : (
        <div className="space-y-6">
          <ModuleSubNav
            tabs={sections as any}
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id)}
          />

          <div className="pt-2">
            <div className="mb-6">
              <h2 className="text-sm font-black text-[var(--text-primary)]">{activeSection?.label}</h2>
              <p className="text-[11px] text-[var(--text-muted)]">{activeSection?.description}</p>
            </div>

            {activeTab === 'performance-overview' && <OverviewTab agency={agency} />}
            {activeTab === 'performance-reliability' && <ReliabilityAuditTab agency={agency} />}
            {activeTab === 'performance-delay' && <BottlenecksTab agency={agency} />}
            {activeTab === 'performance-ghosts' && <GhostsTab agency={agency} />}
            {activeTab === 'performance-dwells' && <DwellsTab agency={agency} />}
            {activeTab === 'performance-corridors' && <CorridorsTab agency={agency} />}
            {activeTab === 'performance-audit' && <ServiceAuditTab agency={agency} />}
            {activeTab === 'performance-adherence' && <StopAdherenceTab agency={agency} />}
          </div>
        </div>
      )}
    </div>
  );
}
