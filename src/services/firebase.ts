import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

/**
 * Firebase configuration for Atlas by Civic Minds.
 *
 * To set up:
 * 1. Go to https://console.firebase.google.com and create a project called "Atlas"
 * 2. Add a Web app — copy the config object here
 * 3. In Authentication → Sign-in methods, enable: Email/Password and GitHub
 * 4. For GitHub OAuth: create an OAuth App at https://github.com/settings/developers
 *    - Homepage URL: https://civic-minds.github.io/Atlas/
 *    - Callback URL: copy from Firebase console (Authentication → GitHub → setup)
 * 5. Add your domain to Firebase → Authentication → Settings → Authorized domains
 *
 * Replace the placeholder values below with your real config.
 */
const firebaseConfig = {
    apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// Prevent re-initializing on hot module reloads
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
