# VisitVault-Secure-Digital-Visitor-Management-System
VisitVault is a zero-trust, cryptographically verifiable visitor management platform designed to replace insecure paper-based logs at hostels, corporate offices, and gated communities. It ensures only pre-registered or emergency-verified visitors gain entry, while maintaining an immutable, tamper-evident audit trail.

## Technology stack

- Frontend: React single-page application (Vite for local development and production builds)
- Backend: Node.js with Express
- Database: PostgreSQL

## Local development

Requirements: Node.js and npm, plus a local PostgreSQL instance.

1. Install frontend dependencies: `cd client` then `npm install`.
2. Start the frontend: `npm run dev`.
3. In another terminal, create a local PostgreSQL database named `visitvault`.
4. Copy `server/.env.example` to `server/.env` and set `DATABASE_URL` to match your local PostgreSQL username, password, host, and database.
5. Install backend dependencies: `cd server` then `npm install`.
6. Start the backend: `npm run dev`.
7. Open `http://localhost:5173` for the frontend. The API health endpoint is `http://localhost:3000/api/health`.

Do not commit `server/.env`; it contains local configuration and may contain credentials. Database tables and authentication routes will be added in coordination with the team.
