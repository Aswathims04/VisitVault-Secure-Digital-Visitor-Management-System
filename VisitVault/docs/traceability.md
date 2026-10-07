# Traceability

| SRS/worksheet | File and function | Verification |
|---|---|---|
| 1.2, 1.4, 1.5 | `backend/src/services/crypto.ts`, frontend | manual flow |
| 1.3 QA | `backend` test configuration | security checks requested; integration DB required |
| 2.1 zero-trust | `/gate/verify`, `/gate/verify-otp` | server verifies credentials |
| 2.2 feature set | route handlers, `AuditLedger`, cron job | UC flows |
| 2.3 RBAC | `middleware/auth.ts` | role route guards |
| 2.4 stack | backend/frontend package manifests | compose build |
| 2.5 DB roles | `migrations/001_initial.sql` | SQL privilege inspection |
| 2.6 TLS/NTP | `nginx.conf`, `.env.example`, README | deployment review |
| 3.2 UI/interfaces | React app, Node API, PostgreSQL, Nodemailer | browser demo |
| 3.3 indexes/latency | migration indexes; no measured timing yet | DB timing test required |
| 3.4 controls | crypto, auth, zod, helmet, rate limit | backend build |
| 3.5 integrity | `AuditLedger.appendEntry/verifyChain` | chain tamper test required |
| 3.6 consent/privacy/time/a11y | consent fields, AES-GCM, UTC DB, high-contrast UI | UI/schema review |
| UC-01 | POST `/resident/visitors`, `GenerateSignedJWT`, notification service | registration flow |
| UC-02 | POST `/gate/verify`, `validateSignature`, spent state | replay check required |
| UC-03 | POST `/gate/verify-otp`, TOTP validation | OTP check required |
| UC-04 | POST `/gate/override`, `sendAlert` | server requires justification |
| UC-05 | admin ledger endpoints, `verifyChain` | chain verification |
| DFD 1.0 | `modules/1.0-token-provisioning` | UC-01 |
| DFD 2.0 | `modules/2.0-gate-verification` and gate route | UC-02/03 |
| DFD 3.0 | `modules/3.0-emergency-override` | UC-04 |
| DFD 4.0 | `modules/4.0-audit-management` | UC-05 |
| Sequence names | gate route, ledger domain | validate/markSpent/appendEntry/approvalVerdict/denialVerdict/sendAlert identifiers |
