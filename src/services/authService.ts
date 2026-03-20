import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
    sendPasswordResetEmail,
    onAuthStateChanged,
    sendSignInLinkToEmail,
    isSignInWithEmailLink,
    signInWithEmailLink,
    User,
    AuthError,
} from 'firebase/auth';
import { auth } from './firebase';

export type { User };

/** Human-readable Firebase error messages */
export function getAuthErrorMessage(error: AuthError): string {
    switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return 'Invalid email or password.';
        case 'auth/email-already-in-use':
            return 'An account with this email already exists.';
        case 'auth/weak-password':
            return 'Password must be at least 6 characters.';
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        case 'auth/popup-closed-by-user':
            return 'Sign-in window was closed. Please try again.';
        case 'auth/popup-blocked':
            return 'Pop-up was blocked by your browser. Please allow pop-ups for this site.';
        case 'auth/network-request-failed':
            return 'Network error. Check your connection and try again.';
        case 'auth/too-many-requests':
            return 'Too many failed attempts. Please wait a moment before trying again.';
        default:
            return error.message || 'Authentication failed. Please try again.';
    }
}

export const signInWithEmail = (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email, password);

export const signUpWithEmail = (email: string, password: string) =>
    createUserWithEmailAndPassword(auth, email, password);

export const signOut = () =>
    firebaseSignOut(auth);

export const resetPassword = (email: string) =>
    sendPasswordResetEmail(auth, email);

export const sendMagicLink = async (email: string) => {
    const actionCodeSettings = {
        // URL you want to redirect back to. The domain (www.example.com) for this
        // URL must be whitelisted in the Firebase Console.
        url: window.location.origin + (import.meta.env.BASE_URL || '/'),
        // This must be true.
        handleCodeInApp: true,
    };
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    // Save the email locally so you don't need to ask the user for it again
    // if they open the link on the same device.
    window.localStorage.setItem('emailForSignIn', email);
};

export const completeMagicLinkSignIn = async () => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
        let email = window.localStorage.getItem('emailForSignIn');
        if (!email) {
            // User opened the link on a different device. To prevent session fixation
            // attacks, ask the user to provide the associated email again.
            email = window.prompt('Please provide your email for confirmation');
        }
        if (email) {
            await signInWithEmailLink(auth, email, window.location.href);
            window.localStorage.removeItem('emailForSignIn');
            return true;
        }
    }
    return false;
};


/** Subscribe to auth state — call in your top-level store init */
export const subscribeToAuthState = (callback: (user: User | null) => void) =>
    onAuthStateChanged(auth, callback);
