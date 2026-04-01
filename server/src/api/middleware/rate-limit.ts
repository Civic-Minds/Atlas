import rateLimit from 'express-rate-limit';

/**
 * Limit expensive analytical queries to 60 requests per 1 minute per IP address.
 */
export const diagnosticsLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // Limit each IP to 60 requests per `window`
    message: { error: 'Too many queries requested from this IP, please wait a minute' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
