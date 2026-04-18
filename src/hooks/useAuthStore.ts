import { create } from 'zustand';
import { User } from 'firebase/auth';
import { subscribeToAuthState, signOut, completeMagicLinkSignIn } from '../services/authService';

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;       // true while Firebase resolves the initial session
    agencyId: string | null;  // Current tenant agency ID
    role: 'admin' | 'researcher' | 'planner' | 'viewer' | null;
    globalMode: boolean;      // If true, shows all agencies (for admins/researchers)
    _unsubscribe: (() => void) | null;

    /** Called once at app startup — subscribes to Firebase auth state */
    initAuth: () => void;
    logout: () => Promise<void>;
    toggleGlobalMode: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    agencyId: null,
    role: null,
    globalMode: true,
    _unsubscribe: null,

    initAuth: async () => {
        // Prevent double-subscription on HMR
        const existing = get()._unsubscribe;
        if (existing) return;

        // Check for magic link sign-in
        try {
            await completeMagicLinkSignIn();
        } catch (err) {
            console.error('Magic link sign-in failed:', err);
        }

        const unsubscribe = subscribeToAuthState(async (user) => {
            if (user) {
                // Fetch tenant info from our pro-grade backend
                try {
                    const idToken = await user.getIdToken();
                    const res = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/me`, {
                        headers: { 'Authorization': `Bearer ${idToken}` }
                    });
                    const data = await res.json();
                    
                    set({
                        user,
                        isAuthenticated: true,
                        isLoading: false,
                        agencyId: data.agencyId,
                        role: data.role,
                        globalMode: data.role === 'admin' || data.role === 'researcher'
                    });
                } catch (err) {
                    console.error('Failed to fetch user tenancy:', err);
                    set({ user, isAuthenticated: true, isLoading: false, agencyId: null, role: 'admin', globalMode: true });
                }
            } else {
                set({
                    user: null,
                    isAuthenticated: false,
                    isLoading: false,
                    agencyId: null,
                    role: null,
                    globalMode: true
                });
            }
        });

        set({ _unsubscribe: unsubscribe });
    },

    logout: async () => {
        await signOut();
        // Firebase's onAuthStateChanged will fire and set user → null
    },

    toggleGlobalMode: () => {
        const { role, globalMode } = get();
        if (role === 'admin' || role === 'researcher') {
            set({ globalMode: !globalMode });
        }
    },
}));
