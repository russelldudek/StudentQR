# Homecoming Live Operations

## Release Status

This is the new version-2 candidate, not a live deployment receipt. Production
activation requires fresh independent review, separate fictional practice
provider/phone checks, native saved/deployed module parity, real target/role
checks and hosted-byte verification. The accepted mirror is unchanged.

## Links And Roles

Eve's private admin URL opens Dashboard with the dance/roster already loaded.
Her access QR contains only the helper link. Helpers scan it with the iPhone
Camera, open the link, then use the app to scan printed ticket barcodes.
Helpers have no Setup or reset/correction controls. No password/sign-in is used;
possession of Eve's link grants admin access, not verified human identity.
Keep that URL private. Never post role keys or device receipts in Git/logs.

## Scan And Undo

Allow the camera when prompted. Keep one entire barcode in view; a valid single
live ticket automatically checks in without a Confirm tap. Multiple different
tickets, invalid checksums or missing decoder support cause no check-in.
Use exact manual entry if necessary, including printed leading zeros.
Continuous mode waits a full second after processing before the next scan.
Stop/background/orientation changes cancel late decoding, not a dispatched
server operation. Reconcile an uncertain operation before scanning again.
If the original ID has no journal record, reconciliation reserves a verified
Cancelled marker under the same backend lock. A delayed original request then
cannot check in that ticket. If that marker is itself Pending, Eve must cancel
it explicitly; it can never be completed into an admission.

Green means verified admitted student. Yellow means student with a guest or a
guest ticket. Red means duplicate/unknown/blocked/unconfirmed. The result shows
the name, exact ticket, server status/time and associated person's independent
name/ticket/status/time. Scanning the student never checks in the guest.

Undo Last Check-In requires this browser's latest successful new check-in.
A duplicate does not grant undo. A newer admission permanently invalidates the
older receipt. Undo/reset permits a later new check-in; history is retained.
Lost local storage/receipt: ask Eve. Reloaded/two-tab receipts are verified
against server truth before enabling Undo.

## Eve Corrections And Resets

Dashboard automatically loads Needs Attention. Edit the six student/guest
fields, inspect the before/after diff, then Publish Corrections. Resolve all
owners of a conflict together. Invalid/colliding tickets remain blocked.
Edits select their record automatically; include only the intended records.
Each publication allows at most 100 selected records, validated atomically.
The app-only correction layer is globally authoritative; the original intake
is not edited. Source movement/change makes an old override Needs Attention.
Drafts remain frozen during polling; Reload / Discard Draft is explicit.
If a corrected source row has been removed, Eve can review and retire the old
override with `ARE YOU SURE!?`. This releases its ticket reservations, retains
correction/audit history and never edits the intake or transfers attendance.
Active/Pending attendance must be reviewed/reset first. A changed snapshot
invalidates retirement just like a reset.
An active/changed attendance assignment needs individual review/reset before
publishing a replacement. Corrections never inherit another person's attendance.

Reset Ticket and Reset All preview the exact scope/count and show
`ARE YOU SURE!?`; Cancel is the default. Confirm expires after 120 seconds.
Any intervening source/check-in change invalidates the preview. Reset All cannot
bypass Pending or changed-assignment review. No ledger rows are cleared/deleted.
Reset previews retain revision hashes/counts, not a large list in one Script
Property; confirmation derives and journals the exact admission IDs under lock.

For Pending operations, review the displayed kind/tickets. Explicit Cancel
retains the journal evidence and releases its reservation; Complete requires
the original verified staged payload and a still-safe current assignment.
Never blindly resend an unconfirmed scan/reset with a new operation ID.

## Practice And Mode

The new live-protocol practice workbook/project is fictional and separate from
both real attendance and the accepted mirror. `083`, `085`, `383`/`383B`, two
conflicting `084` owners and incomplete `089` exercise printed-ticket flows.
The owner initializer starts read-only. For duplicate/undo/reset practice,
Eve turns read-only OFF in this fictional practice instance; labels always say
`Practice - Not Real Attendance`. Read-only mode makes no attendance writes,
so it cannot create a new duplicate entry. Do not test live mutations on real
students. Other visible devices refresh on focus and every eight seconds.

## Native Owner Deployment

Use only the eight modules in `apps-script/live/manifest.json`, never legacy
Code.gs/Homecoming.gs/MirrorTest.gs. Use a new school-owned Apps Script project.
For practice, run owner `prepareHomecomingLivePractice()` once, inspect private
ownership, then use its returned sealed Deployment source in that separate
project. All other modules must match the reviewed candidate exactly.

Deploy a Web App running as the school account only after action-time access
confirmation. Pin the actual `/exec` URL in script property
`studentQrLiveDeploymentUrl`, not `/dev` or an unverified browser/caller value.
Run owner `prepareHomecomingLive()`, then `initializeHomecomingLive()` through
the owner editor. Preparation adds only the three dedicated state-tab headers;
it rejects unknown existing tabs. Reruns preserve all existing state/keys.
Copy the returned private links to a restricted local handoff, never Logger.
Lost admin link: explicit owner `recoverHomecomingLiveAdminLink()` rotates only
admin access and preserves helper access, state and history.

Production Deployment is fixed to the original Homecoming workbook and
Ticket Checklist row 5. Verify exact persisted binding, private Sheet ownership,
live source projection, admin-only attention and helper API refusals while
read-only. Add verified endpoints to the trusted registry, publish fast-forward,
verify served JS/WASM/HTML hashes, then activate central production mode.

## Two-iPhone Acceptance

On the fictional practice backend, confirm both fresh devices autoload with no
Setup; Eve has admin controls/access QR. Scan 083 automatically, rescan on the
other phone for red duplicate with original timestamp. Scan 383/383B separately
and verify both names and independent attendance. Present multiple tickets:
no admission. Undo the latest admission, reject older/other-device receipts.
Eve previews reset one/all, cancels with no changes, then confirms; helpers have
no reset access. Correct 084/089 globally and verify the second device refresh.
Interrupt connectivity after a submit and reconcile without double admission.
Verify continuous cooldown and Stop/background with camera decoding underway.
Record actual physical observations separately; Node/browser tests are not
physical iPhone proof.

## Pause / Rollback

Set authoritative production read-only ON in Eve's admin Setup; verify a fresh
helper session also shows READ-ONLY. This pauses attendance writes without
clearing history. Keep the accepted mirror and private credentials unchanged.
Do not swap a mirror/practice URL into a production binding or erase properties.
