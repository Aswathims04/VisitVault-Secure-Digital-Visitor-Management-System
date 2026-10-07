# VisitVault

20CYS401 Secure Software Engineering visitor access platform.

## Start
A unique random development `.env` is included for this checkout. For a fresh clone, copy `.env.example` to `.env`, replace JWT_SECRET with at least 32 random characters, PII_KEY with a base64 32-byte random key, and set a strong PostgreSQL password. Then run `docker compose up --build`; the API is port 4000, React/Vite port 5173. Seed users using `docker compose exec backend npm run seed`. Demo password: `VisitVault-Demo-2026!` for resident@visitvault.local, guard@visitvault.local and admin@visitvault.local.

## Security design
Gate terminal is untrusted. Backend verifies JWT algorithm, issuer, audience, time and token record. PII fields use AES-256-GCM with random IVs. DB timestamps are UTC; configure NTP and CLOCK_SKEW_SECONDS. Cookies are HttpOnly/SameSite Strict; set COOKIE_SECURE=true behind the TLS 1.3 nginx configuration with HSTS. Use separate runtime DB credentials/roles in deployment. Parameterized SQL, zod input validation, Helmet, CORS and rate limiting are enabled.

Ledger appends lock the chain head row and SHA-256 hash canonical sorted-key JSON; genesis prevHash is 64 zeroes. Trigger and grants prohibit modifications. Tables include checkpoint storage for retention. See docs/ADDITIONS.md and docs/traceability.md.
