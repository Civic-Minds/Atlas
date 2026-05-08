import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AgencyMeta } from '../services/atlasApi';

interface ViewAsState {
    viewAsAgency: AgencyMeta | null;
    setViewAsAgency: (agency: AgencyMeta | null) => void;
}

export const useViewAs = create<ViewAsState>()(
    persist(
        (set) => ({
            viewAsAgency: null,
            setViewAsAgency: (agency) => set({ viewAsAgency: agency }),
        }),
        {
            name: 'atlas-view-as-storage',
        }
    )
);
