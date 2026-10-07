# Permitted additions (section K)

1. Entry/Exit `direction` on UC-02/UC-03: one ENTRY spends token; one EXIT requires completed ENTRY and no prior EXIT.
2. OTP is per-token encrypted TOTP secret; pass page gives current OTP, default 5-minute period and one-step tolerance; ambiguous matches reject.
3. Retention checkpoint stores last purged seq/hash and signature; verification resumes at checkpoint. Schema is present.
4. Email/password authentication with short-lived JWT access cookie.
5. OTP brute-force lockout and alert after configured N failures (`OTP_MAX_FAILURES`).
6. `alerts` table stores AdminNotification records for dashboard.
