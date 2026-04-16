import React from 'react';
import { useAuthStore } from '../../hooks/useAuthStore';
import { useViewAs } from '../../hooks/useViewAs';

import { AgencyDashboard } from './components/AgencyDashboard';
import { CommandCenter } from './components/CommandCenter';

const HomePage: React.FC = () => {
    const { agencyId } = useAuthStore();
    const { viewAsAgency } = useViewAs();

    // If user has a tenant agency or admin is viewing-as, show the agency dashboard
    const activeAgencyId = viewAsAgency?.slug ?? agencyId;
    const activeAgencyName = viewAsAgency?.display_name ?? agencyId ?? 'Your Network';
    if (activeAgencyId) {
        return <AgencyDashboard agencyId={activeAgencyId} agencyName={activeAgencyName} />;
    }

    // Default: show the operational command center (admin/researcher view)
    return <CommandCenter />;
};

export default HomePage;
