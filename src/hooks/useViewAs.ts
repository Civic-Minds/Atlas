import { create } from 'zustand';
import type { AgencyMeta } from '../services/atlasApi';

interface ViewAsState {
    viewAsAgency: AgencyMeta | null;
    setViewAsAgency: (agency: AgencyMeta | null) => void;
}

export const useViewAs = create<ViewAsState>((set) => ({
    viewAsAgency: null,
    setViewAsAgency: (agency) => set({ viewAsAgency: agency }),
}));
