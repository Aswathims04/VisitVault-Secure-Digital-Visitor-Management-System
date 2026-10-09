# VisitVault-Secure-Digital-Visitor-Management-System
VisitVault is a zero-trust, cryptographically verifiable visitor management platform designed to replace insecure paper-based logs at hostels, corporate offices, and gated communities. It ensures only pre-registered or emergency-verified visitors gain entry, while maintaining an immutable, tamper-evident audit trail.

## Visitor pass email

When a resident issues a pass, VisitVault sends the visitor an email with the QR pass embedded in the message and attached as a PNG. The visitor's email address is stored encrypted in PostgreSQL. Delivery status is shown in the pass confirmation; if SMTP is not configured or delivery fails, the pass still appears in the resident's confirmation as a backup and the email failure is reported.

Configure these settings in the local `.env` file before starting the application:

```dotenv
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
SMTP_FROM=VisitVault <no-reply@example.com>
```

Use credentials from your chosen email provider (often an app password), not your normal account password. Keep `.env` private and never commit real SMTP credentials. Port `587` uses STARTTLS; port `465` uses implicit TLS. Restart the server after changing SMTP settings.
