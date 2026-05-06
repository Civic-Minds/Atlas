"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireTenant = exports.requireAuth = void 0;
const admin = __importStar(require("firebase-admin"));
const db_1 = require("../../storage/db");
// Initialize the Firebase Admin SDK for JWT verification.
// Without GOOGLE_APPLICATION_CREDENTIALS, the projectId is sufficient for validating JWT signatures.
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID ?? 'atlas-78d9f',
    });
}
/**
 * Express middleware to ensure the request provides a valid Firebase JWT via Bearer token.
 */
const requireAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token' });
        return;
    }
    const token = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        // Attach decoded user to request in case downstream routes need role-checking
        req.user = decodedToken;
        next();
    }
    catch (error) {
        // Detailed error logs for the server, generic 403 for the client
        console.error('[Auth Middleware] Token Verification Failed:', error);
        res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
    }
};
exports.requireAuth = requireAuth;
/**
 * Middleware to enforce tenant scoping.
 * If the user has an assigned agencyId, it will:
 * 1. Overwrite req.query.agency with their assigned ID.
 * 2. Prevent them from viewing other agencies.
 * 3. Pass through for Global Admins (agencyId === null).
 */
const requireTenant = async (req, res, next) => {
    const user = req.user;
    if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const tenant = await (0, db_1.getTenantForUser)(user.uid);
    // Attach tenant info to request for downstream logging/filtering
    req.tenant = tenant;
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
exports.requireTenant = requireTenant;
