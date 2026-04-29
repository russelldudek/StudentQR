# Prom Check-In System (Scaffold)

This repository contains a starter scaffold for a prom check-in system.

## GitHub Pages + Google Sheets

The static frontend in [index.html](./index.html) expects a Google Apps Script Web App as its sheet middleware.

- Apps Script backend: [apps-script/Code.gs](./apps-script/Code.gs)
- Setup guide: [apps-script/README.md](./apps-script/README.md)

## Goals
- Scan or enter student identifiers at the door.
- Validate eligibility and ticket/check-in status.
- Prevent duplicate check-ins.
- Provide basic event attendance visibility.

## Current Scaffold
- `src/server.ts` – Express API bootstrap.
- `src/routes/health.ts` – Health endpoint.
- `src/routes/checkins.ts` – In-memory check-in endpoints.
- `src/models/types.ts` – Core data types.
- `.env.example` – Environment config template.

## Quick Start
```bash
npm install
npm run dev
```

Then open `http://localhost:3000/health`.

## API Endpoints (Scaffold)
- `GET /health`
- `GET /api/checkins`
- `POST /api/checkins`

### Example `POST /api/checkins` body
```json
{
  "studentId": "S-1001",
  "eventId": "prom-2026",
  "checkedInBy": "front-desk-01"
}
```

## Next Steps
- Add database persistence (PostgreSQL/Supabase/Firebase).
- Add QR scanner UI + operator authentication.
- Add student roster import.
- Add reporting export.
