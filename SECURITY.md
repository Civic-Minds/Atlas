# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Atlas, please report it privately by emailing **ryan@ryanisnota.pro** rather than opening a public issue.

Please include as much detail as possible:
- A description of the vulnerability
- Steps to reproduce
- Any potential impact

You can expect a response within **7 days**. If confirmed, a fix will be prioritized and you will be credited in the release notes.

## Scope

Atlas is a client-side web application consuming public transit data. All API routes function as proxies or read static data. Out-of-scope issues include standard public transit feed availability, standard CORS behaviors on public data endpoints, and DDoS/abuse vectors managed directly by Vercel/Cloudflare.
