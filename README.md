# Prom Check-In System (Scaffold)

## Homecoming Live Candidate

The separate version-2 backend in `apps-script/live/` adds automatic single-ticket
check-in, Eve's audited correction layer, receipt-bound helper undo and Eve-only
reset previews. It does not replace or modify the accepted mirror backend.
See [Live Operations](docs/homecoming-live-runbook.md) for native provisioning,
practice, release gates and phone tests. New local tests do not establish that
the real backend has been deployed or activated.

This repository contains a starter scaffold for a prom check-in system.

## GitHub Pages + Google Sheets

The static frontend in [index.html](./index.html) expects a Google Apps Script Web App as its sheet middleware.

- Apps Script backend: [apps-script/Code.gs](./apps-script/Code.gs)
- Setup guide: [apps-script/README.md](./apps-script/README.md)

The local frontend now supports a server-saved dance with separate private
admin and helper-scanner links. See the setup guide for one-time initialization,
link privacy, deployment prerequisites, and the Homecoming draft's currently
disabled combined-intake integration. Local implementation is not proof that
GitHub Pages or Apps Script has been updated.

Run the synthetic scanner regression tests without camera or Google access:

```bash
node --test tests/scanner-*.test.cjs
```

## Access QR Versus Ticket Barcodes

Eve opens her private admin link and displays the helper-access QR on her phone.
Helpers scan that QR with their iPhone Camera to open the configured scanner,
without setup. Inside the app, they scan the Code 128 barcode printed on each
student ticket. The access QR opens the app; it is not a student ticket.

The camera and photo paths support Code 128 and QR codes. A pinned local copy of
ZXing 0.21.3 (`assets/zxing-0.21.3.min.js`, Apache-2.0 license alongside it)
provides software decoding when the native browser detector is missing or cannot
read Code 128. Images are decoded on the device, not sent to a decoding service.
Keep the entire barcode visible and scan one ticket at a time; for photo scanning,
select a clear image of a single ticket. Software decoding does not reliably
detect multiple tickets in one image. Ticket values stay exact strings, including
leading zeros (for example, `083`) and suffixes, and use the existing admission
and duplicate-check workflow. Continuous mode retains its one-second minimum
delay after each completed scan.

This frontend change does not enable the currently disabled Homecoming
combined-intake adapter or change the Sheet schema. The live Homecoming endpoint,
ticket-column mapping, attendance integration, and deployment still need to be
completed before helpers can use the real roster. Physical iPhone camera operation
must also be tested; local decoder tests are not an on-device verification.

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

## Homecoming Mirror Backend

The dedicated Homecoming mirror implementation is described in
[the iPhone test runbook](docs/homecoming-iphone-test.md). It uses exact printed
ticket strings, bidirectional guest associations, a separate verified attendance
ledger, and fictional identities. Production is never a permitted mirror write
target. Deployment and physical-phone testing remain separate gates.
