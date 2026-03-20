import { create } from 'zustand';
import { User } from 'firebase/auth';
import { subscribeToAuthState, signOut, completeMagicLinkSignIn } from '../services/authService';

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;       // true while Firebase resolves the initial session
    _unsubscribe: (() => void) | null;

    /** Called once at app startup — subscribes to Firebase auth state */
    initAuth: () => void;
    logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true,
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

        const unsubscribe = subscribeToAuthState((user) => {
            set({
                user,
                isAuthenticated: !!user,
                isLoading: false,
            });
        });

        set({ _unsubscribe: unsubscribe });
    },

    logout: async () => {
        await signOut();
        // Firebase's onAuthStateChanged will fire and set user → null
    },
}));
