# Google Apps Script Setup

Use [Code.gs](./Code.gs) as the backend for the Student QR page.

## Sheet headers

Your `Students` tab should have a first row with these exact column names:

- `First Name`
- `Last Name`
- `QR_ID`
- `Status`
- `Admitted At`

Optional but supported:

- `Bringing Guest`

## Deploy

1. Open [script.new](https://script.new/) while signed into the Google account that can edit the sheet.
2. Replace the default script with the contents of [Code.gs](./Code.gs).
3. Save the project.
4. Click `Deploy` -> `New deployment`.
5. Choose type `Web app`.
6. Set `Execute as` to `Me`.
7. Set access to `Anyone` or `Anyone with the link`.
8. Copy the `/exec` URL into the app's `Apps Script Web App URL` field.

## Expected behavior

- `GET ?action=list` returns `{ rows: [...] }`
- `POST { action: "list", config }` also returns `{ rows: [...] }`
- `POST { action: "assignQrIds", config }` fills blank `QR_ID` cells without overwriting existing ones
- `POST { action: "admit", qrValue, config }` updates `Status` and `Admitted At`

## Notes

- The frontend sends the full sheet configuration with both `GET` and `POST`.
- New QR IDs are generated with an event-based prefix plus a random suffix, and existing `QR_ID` values are left untouched.
- If the roster still fails to load, redeploy the script after changes and make sure the copied URL ends in `/exec`, not `/dev`.
