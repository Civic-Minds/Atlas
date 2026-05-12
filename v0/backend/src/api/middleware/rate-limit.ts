import rateLimit from 'express-rate-limit';

/**
 * Limit expensive analytical queries to 60 requests per 1 minute per IP address.
 */
export const diagnosticsLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // Limit each IP to 60 requests per `window`
    message: { error: 'Too many queries requested from this IP, please wait a minute' },
    standardHeaders: true, 
    legacyHeaders: false,
});

/**
 * Standard API rate limit: 100 requests per 15 minutes.
 */
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Too many requests from this IP, please try again after 15 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
});

