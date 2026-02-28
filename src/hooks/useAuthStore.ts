import { create } from 'zustand';

interface AuthState {
    isAuthenticated: boolean;
    login: () => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    isAuthenticated: false, // Default to logged out
    login: () => set({ isAuthenticated: true }),
    logout: () => set({ isAuthenticated: false }),
}));
