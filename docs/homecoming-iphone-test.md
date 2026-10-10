# Homecoming Mirror Phone Test

## Current Delivery Boundary

Local implementation and synthetic checks are not an Apps Script deployment,
published GitHub Pages update, or physical-iPhone validation. Never use a
fictional preview URL as Eve's real test link. Production attendance is excluded.

## Owner Setup

1. In Eve's school Google account, create a separate private Apps Script project named `Homecoming 2026 - Mirror Test API`. Leave `Homecoming 2026 — Student Form Sync` and the old Prom endpoint untouched.
2. Add exactly `Code.gs`, `Homecoming.gs`, and `MirrorTest.gs` from this repository. `Homecoming.gs` contains the immutable dedicated-mirror deployment guard. Generic Students deployments use only `Code.gs`, never this mirror module.
3. Run `prepareHomecomingMirrorTest` in the editor. Review the requested Google permissions before granting them. This reads only the real `Ticket Checklist` and creates a distinct private `Homecoming 2026 - Mirror Test` workbook. It preserves literal ticket strings and guest pairings, replaces names/IDs, and omits eligibility metadata.
4. Russ authorized adapting to printed three-digit student barcodes and explicitly chose conflicts quarantined. Numeric student tickets 0-999 become three-character text in the mirror only; guest literals are preserved without guessing padding. Duplicate tickets, missing IDs/tickets and inconsistent declarations quarantine the entire student/guest pair, not just one owner. The private `Quarantine` tab contains only JSON ticket strings, generic reasons and source row numbers. Potential codes in ambiguous annotations/padded text are blocked conservatively, never used as admission aliases. Helpers see counts and red Quarantined results, not real names or IDs. The strict projection and real source remain unchanged. Header/structural incompatibility or no safe tickets still stops preparation. Computed source ticket strings are copied as literal text, never formulas.
5. Keep the workbook private. A dedicated mirror web app executes as its owner; anyone holding a bearer link can read its fictional roster and exercise the permitted mirror actions. Obtain specific authorization before enabling anonymous web-app access. Do not share the Google Sheet publicly.
6. Deploy as Web App and keep its `/exec` URL. Run `initializeHomecomingMirrorTest` from the editor. Its returned private admin/helper URLs are shown only on first initialization. Store Eve's admin link privately, not in Git or public screenshots. Reruns retain attendance and keys; they cannot recover the raw admin key.
7. Add only that verified `/exec` URL to `assets/trusted-backends.json`. Publish the reviewed frontend/assets only after specific publication approval. An empty or unavailable registry deliberately blocks all private key transmission.
8. Verify Eve's admin link shows Mirror Test and loads the roster. Her helper access QR opens Scanner with no Setup on a fresh phone. The backend is fixed to the mirror regardless of a modified URL/client configuration.

If initialization is interrupted after saving the event but before delivering
links, public access remains closed. Run `recoverHomecomingMirrorAdminLink`
explicitly in the owner editor. It issues a new admin key, revokes the previous
admin link, and retains the helper link, event and attendance. It never resets
the ledger and does not store the raw admin key. Inspect the returned object in
the editor debugger; do not publish private links or copy them into Git/logs.

## Read-Only Scans

On Eve's and Russ's physical iPhones, verify `Mirror Test - Read-only scans`.
Allow camera permission themselves. Scan a single printed ticket at a time,
including leading zeros. On software/iPhone decoding, confirm the displayed
ticket and fictional name before proceeding. Confirmation selects a decoded
candidate; it does not claim the decoder can enumerate all codes in a frame.

- A student with a guest shows the linked guest's name, exact ticket and independent status.
- A guest shows the associated student's name/ticket/status. Neither scan checks in the linked person.
- Unknown tickets, Quarantined, Pending and Needs Review show red; no attendance update occurs. Test one known quarantined number in both read-only and practice mode.
- Test upright and rotated barcodes, low light, camera denial, photo fallback, Cancel, continuous scanning with a one-second delay, lock/resume, and offline failure.
- Check `Check-ins` still contains headers only before starting practice admissions.

## Duplicate And Shared-Status Practice

Eve deliberately turns test mode off **only in the mirror**. Confirm both phones
show `Mirror Test - Practice check-ins (mirror records only)` before scanning.
The banner remains even if Eve renames the dance.

1. Phone A scans and confirms one printed ticket. Expect Admitted plus timestamp, yellow for a guest/guest reminder or green for an unlinked student.
2. Phone B scans the same ticket. Expect red Already Scanned and the original timestamp. Exactly one ledger row exists.
3. Leave both dashboards visible: status should refresh within eight seconds (subject to network latency). Also use Refresh after returning from background.
4. Try simultaneous scans of one ticket. At most one succeeds as a new admission; the other sees duplicate or a retryable busy result. Retry a lost response: it must not create another admission.
5. Admit student and guest separately. One person's scan must not mark the other admitted.
6. If a write is uncertain, stop and have the owner inspect the mirror ledger. Pending records and changed assignment hashes must never be deleted/reset automatically or treated as successful.
7. Restore mirror test mode on. Retain practice attendance for evidence. Do not activate or mutate production.

Record physical-phone observations separately from automated evidence, including
browser/version, exact ticket, observed result, timestamp and mirror ledger row
count. Keep names, keys, credentials and private roster rows out of public proof.
