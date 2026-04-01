import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import { getTenantForUser } from '../../storage/db';

// Initialize the Firebase Admin SDK for JWT verification.
// Without GOOGLE_APPLICATION_CREDENTIALS, the projectId is sufficient for validating JWT signatures.
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'atlas-78d9f', // Sourced from your VITE_FIREBASE_PROJECT_ID
    });
}

/**
 * Express middleware to ensure the request provides a valid Firebase JWT via Bearer token.
 */
export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token' });
        return;
    }

    const token = authHeader.split('Bearer ')[1];

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        // Attach decoded user to request in case downstream routes need role-checking
        (req as any).user = decodedToken;
        next();
    } catch (error) {
        // Detailed error logs for the server, generic 403 for the client
        console.error('[Auth Middleware] Token Verification Failed:', error);
        res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
    }
};

/**
 * Middleware to enforce tenant scoping. 
 * If the user has an assigned agencyId, it will:
 * 1. Overwrite req.query.agency with their assigned ID.
 * 2. Prevent them from viewing other agencies.
 * 3. Pass through for Global Admins (agencyId === null).
 */
export const requireTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as any).user;
    if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const tenant = await getTenantForUser(user.uid);
    
    // Attach tenant info to request for downstream logging/filtering
    (req as any).tenant = tenant;

    if (tenant && tenant.agencyId) {
        // If the user is a tenant, they are locked to their agencyId.
        // If they tried to request a different agency, override it.
        if (req.query.agency && req.query.agency !== tenant.agencyId) {
            console.warn(`[Auth] Tenant ${user.uid} attempted to access cross-tenant data: ${req.query.agency}. Overriding to ${tenant.agencyId}.`);
        }
        req.query.agency = tenant.agencyId;
    }

    next();
};
