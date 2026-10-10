# Homecoming Live Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release the shared live Homecoming scanner with Eve's globally published ticket corrections, automatic check-in, receipt-bound helper undo, and audited Eve-only resets.

**Architecture:** Build a separate sealed Apps Script backend that reads the original intake and derives the app roster from committed correction operations. Use one lock and a verified operation journal for attendance, correction publishing, undo, resets and mode changes. Extend the existing static frontend by protocol version, preserving the accepted mirror backend and its existing links.

**Tech Stack:** Apps Script V8 and SpreadsheetApp/PropertiesService/LockService; existing static HTML/JavaScript; same-origin, pinned zxing-wasm 3.1.5 reader; Node test runner/VM fixtures; native CUA provider/browser verification; GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-10-homecoming-live-admin-design.md`, approved by Russ on 2026-10-10.

**Execution:** Preserve Russ's selected **Native** method: this owning chat implements tasks in order, then a fresh independent reviewer checks the frozen whole candidate. No new user-owned implementation chat or competing provider writer. This plan awaits review; its checkboxes are not completed work.

## Global Constraints

- Production source: `1hlWdxxzlP2Zbl9m4_MN49XBgBrL7YiG67ur2p2tEueU`, `Ticket Checklist`, header row 5. Original intake values/formulas/formatting remain unchanged.
- State tabs: `Homecoming Check-ins`, `Homecoming Audit`, `Homecoming Corrections`; no incompatible-tab reuse, attendance clearing or row deletion.
- Keep school form-sync, Prom and accepted mirror projects/workbooks/keys untouched. A mirror URL never becomes a production URL.
- Numeric student tickets 0-999 become three-digit strings; literal student/guest strings retain exact characters and leading zeros. No guessed guest suffix, generated ticket, name matching or eligibility inference.
- All owners of conflicting/incomplete assignments and their linked guests remain blocked. Eve alone can publish validated corrections; helpers receive only generic blocked-ticket results and counts.
- Helpers load Scanner without Setup/password/sign-in; Eve's private bearer grants admin. Never claim bearer access proves a human identity.
- Helper undo requires its own latest successful new admission receipt; duplicate scans do not grant ownership. Eve alone resets one/all tickets with exact `ARE YOU SURE!?` and Cancel as the safe default.
- Each guest/host has independent attendance and a bidirectional name/ticket/status/time relationship. A scan/reset/undo of one does not modify the other.
- Server timezone: `America/New_York`; visible-view refresh: eight seconds; successive-scan cooldown: at least one second after processing. Polling is not instantaneous push.
- No Confirm button for a valid single-ticket live camera/photo scan. Multiple distinct tickets, decoder errors and unresolved ambiguity must produce no attendance request.
- Missing/corrupt/erased binding, stale assignment, pending operation, uncertain readback and unauthorized direct API calls fail closed. Recheck authorization, target, revisions and mode under the same mutation lock.
- Global read-only mode makes zero attendance writes and yields no undo capability. Initial provisioning uses read-only mode; LIVE requires verified production activation.
- No real roster rows, student names/IDs, private keys, actor/undo secrets or credentials in Git, public assets, logs or frozen review evidence. Only fictional fixtures may perform write-capable smoke tests.
- Public access/security changes require their concrete action-time confirmation. Source tests, native saved source, deployed version, persisted target, hosted bytes and physical-phone observations remain distinct gates.

## Review Focus

- Source rows move or change while Eve's correction form is open: reject stale publication and block stale overrides, never edit a different person (Task 2).
- Two browser tabs share a device actor and one tab retains an old undo: the backend rejects the older receipt, including after undoing the newer receipt (Task 4).
- A check-in commits after Eve previews Reset All: invalidate her preview; never silently reset that new check-in (Task 4).
- WASM initialization fails or a stopped/backgrounded camera returns late: no first-result fallback or late submission; an already dispatched request is reconciled to server truth (Task 5).
- A committed mutation loses its HTTP response: reconcile that operation without duplicate writes, stale green success or a recovered capability belonging to another device (Tasks 3, 4 and 6).

## File Map

| File | Responsibility |
| --- | --- |
| `apps-script/live/Deployment.gs` | Immutable deployment environment and exact workbook/tabs; rejects accepted mirror ID. |
| `apps-script/live/Intake.gs` | Byte-identical copy of the existing pure intake projection/helpers, without legacy routes. |
| `apps-script/live/Auth.gs` | Private-event authorization, sealed binding, request schemas and hash utilities. |
| `apps-script/live/State.gs` | Canonical journal parsing, replay, verified state writes and idempotency. |
| `apps-script/live/Roster.gs` | Effective roster, quarantine diagnostics, exact associations and correction validation. |
| `apps-script/live/Actions.gs` | Locked admission/correction/mode/name/undo/reset/reconciliation operations. |
| `apps-script/live/Api.gs` | `doGet`/`doPost`, exact action allowlists and public/private response filtering. |
| `apps-script/live/Provision.gs` | Owner-only retry-safe preparation/initialization and private link recovery. |
| `apps-script/live/manifest.json` | Explicit live module allowlist; no legacy/mirror modules or secrets. |
| `assets/ticket-decoder.js` | Multi-result live decoder adapter and ambiguity/late-result guard. |
| `assets/homecoming-live.js` | Version-2 receipts, admin editor/reset UI and operation recovery controller. |
| `assets/vendor/zxing-wasm-3.1.5/` | Pinned reader JS/WASM, notices and hash/provenance manifest. |
| `assets/vendor/jsqr-1.4.0.js`, `assets/vendor/qrcodejs-1.0.0.js`, `assets/vendor/legacy-decoder-notices.txt` | Self-host the existing pinned fallback/access-QR dependencies; no production-page CDN scripts. |
| `index.html` | Existing UI integration, LIVE/practice labels and one-ticket camera framing. |
| `tests/helpers/homecoming-live-fixtures.cjs` | Fake Sheets/properties/lock/faults; refuses all real network calls. |
| `tests/helpers/homecoming-live-ui.cjs` | Real frontend plus fake live API/DOM/clock/storage. |
| `scripts/homecoming-live-preview.cjs` | Loopback-only fictional version-2 preview; no provider requests. |
| `docs/homecoming-live-runbook.md` | Exact release/module/role/reset/correction/phone operating instructions. |

Do not restructure `apps-script/Code.gs`, `Homecoming.gs` or `MirrorTest.gs`.
The deployment manifest must never include their `doPost` or mirror seal.
Preserve the inline `loadSavedConfig();` test-extraction marker in `index.html`.

## Shared Contracts

- Protocol: config adds `apiVersion: 2`, `rosterMode: 'homecoming-2026'`, `environment: 'production'` or isolated `live-test`. Version-1 mirror/generic behavior stays on its existing path.
- `Binding = {version:2,stage:'preparing'|'ready',environment,spreadsheetId,sourceSheetName,sourceHeaderRow,attendanceSheetName,auditSheetName,correctionsSheetName,apiUrl}`; all target fields must equal the immutable deployment constants. `Event = {version:2,eventId,authRevision,adminHash,helperHash,helperToken,config}` is centrally stored; mode/name/revision responses derive from the validated journal.
- All private HTTP requests use POST `text/plain;charset=utf-8` with `action`, `eventId`, `token`, numeric `revision`. Configured target/columns never come from the caller.
- `getEvent` retains `{eventId,role,revision,config,helperToken?}`; only admin receives helperToken. `list` adds `rosterRevision`, `attendanceRevision` and quarantine counts to existing `rows`/`testMode`.
- Rows retain `First Name`, `Last Name`, `QR_ID`, `Status`, `Admitted At`, `Bringing Guest`, `personType`, `assignmentHash` and `linkedPersonType/Name/TicketId/Status/AdmittedAt`. Optional `admissionId` identifies current committed attendance, not undo authority.
- `AttentionRecord = {recordId,sourceRow,baseHash,correctionVersion,fields,issues,conflictGroupId}`. `fields` has exactly `studentName`, `studentId`, `studentTicket`, `bringingGuest`, `guestName`, `guestTicket`; this payload is admin-only.
- `CorrectionEdit = {recordId,sourceRow,baseHash,correctionVersion,fields}`. Publishing accepts a complete validated record or atomic conflict-group batch; unknown fields are errors.
- `MutationResult = {operationId,state:'Committed',rosterRevision,attendanceRevision,row?,alreadyAdmitted?,testMode?,receipt?}`. Failed/pending/cancelled operations never masquerade as committed success.
- `Receipt = {admissionId,operationId,ticketId,assignmentHash}`; the initiating device retains its separately generated 256-bit `actorSecret` and `undoSecret`. API/audit stores their hashes, not raw secrets.
- `ResetPreview = {scope:'ticket'|'all',ticketId?,count,attendanceRevision,rosterRevision,confirmationToken,expiresAt,requiresReview}`. Confirmation expires after 120 seconds and is bound to admin/scope/snapshot. Replay only reconciles an already existing identical operation.
- Read actions: `getEvent`, `list`, `getOperation`; admin-only `getAttention`, `previewReset`. Mutations: `admit`, `undoLatest`; admin-only `publishCorrections`, `resetTicket`, `resetAll`, `reviewOperation`, `setTestMode`, `saveEvent` (name only).
- `getOperation` requires admin or proof of ownership of that operation using actor/undo secrets; ordinary helper bearer alone reveals no receipt. `reviewOperation` is explicit Eve-only completion/cancellation of an existing Pending operation, with a fresh pending-intent hash and confirmation, never blind retry.

### State Schema Decisions

All state cells are literal strings with canonical JSON for structured values;
formulas, unknown headers, duplicate IDs and invalid timestamps are refused.

- Check-ins columns: Admission ID; Operation ID; Event ID; Person Type; Ticket ID (JSON); Source Student ID (JSON); Assignment SHA256; Actor Hash; Undo SHA256; Admitted At.
- Audit columns: Operation ID; Kind; Actor Hash; Intent JSON; Intent SHA256; Created At; State. State is `Pending`, `Committed` or `Cancelled`; only this final status cell changes after reservation.
- Corrections columns: Correction ID; Operation ID; Source Row; Base SHA256; Previous Correction ID; Fields JSON.
- Audit kinds: `Admit`, `Correct`, `Undo`, `ResetTicket`, `ResetAll`, `Mode`, `Rename`. Attendance intents carry exact ticket/assignment/admission IDs; correction intents reference hashed correction rows. No raw credential is stored in any intent.
- The Audit sequence is authoritative; Check-ins/Corrections rows are staged immutable payloads applied only through their committed audit operation. No mutable status cache is authoritative.
- Logical undo/reset revokes captured admission IDs. Reset All captures only the confirmed active snapshot; it does not discard assignment history. Pending operations block their affected tickets, and pending All/Mode operations block admission globally.
- A stale correction retains its old/new ticket reservations until Eve reviews it. A revoked older assignment never grants a new holder inherited attendance. Current active assignment drift is Needs Review; all-ticket reset cannot bypass it.
- `revision` is the stored auth revision plus the latest committed Correct/Mode/Rename audit sequence (initial sequence 0). `rosterRevision` hashes current raw source plus committed corrections; `attendanceRevision` hashes the validated audit head. Check safe-integer/hash types and derive these from fresh context.

---

### Task 1: Sealed Live API And Fictional Test Boundary

**Files:** Create `apps-script/live/{Deployment,Intake,Auth,Api}.gs`, `apps-script/live/manifest.json`, `tests/helpers/homecoming-live-fixtures.cjs`, `tests/scanner-live-auth.test.cjs`.

**Interfaces:** `readLiveBinding_() -> Binding`; `readLiveEvent_() -> Event`; `assertLiveBinding_(binding,event) -> Binding`; `authorizeLive_(event,request) -> 'admin'|'helper'`; `withLiveLock_(request,actionName,callback) -> result`; `hashLive_(text) -> sha256`; `parseLiveRequest_(e,method) -> Request`; `handleLiveRequest_(e,method) -> JSON output`; `liveFixture(options) -> {request,ready,books,properties,trace,fault,writes}`.

- [ ] Write `sealed live refuses missing/corrupt/erased properties before Sheet access`, role-forgery, caller-target, unsupported-action, malformed-revision and public-bootstrap tests. Pin assertions: `assert.equal(f.trace.filter(x => x[0] === 'open').length, 0)` and `assert.equal(f.writes().length, 0)` on every unauthorized route.
- [ ] Run `node --test tests/scanner-live-auth.test.cjs`; observe meaningful RED failures for absent live routes/seal, not fixture syntax errors.
- [ ] Implement the exact production constants, fixed tab names and strict allowlists. Keep `Api.gs` dispatch bounded: authenticate before IO; missing next-task handlers return an explicit unavailable error, never legacy admission.
- [ ] Copy only the pure section from `function combinedProjectionError_` through the end of `projectCombinedIntake_` into `Intake.gs`. Add a byte-parity assertion against `apps-script/Code.gs`; do not copy or alter its routes.
- [ ] Implement fictional state-tab writes with explicit write traces and injections for lock/property/write/flush/readback failures. Existing mirror fixtures keep their production-write refusal. Network access throws `REAL NETWORK REFUSED` in all new fixtures.
- [ ] Run the new auth suite and `node --test tests/scanner-*.test.cjs`; all tests pass, zero skipped; baseline mirror/generic suites remain intact. Commit only Task 1 files: `feat: seal separate live Homecoming API`.

### Task 2: Effective Roster, Quarantine And Correction Model

**Files:** Create `apps-script/live/State.gs`, `apps-script/live/Roster.gs`, `tests/scanner-live-roster.test.cjs`, `tests/scanner-live-corrections.test.cjs`; extend live fixture.

**Interfaces:** `parseLiveState_(grids,eventId) -> JournalState`; `readLiveContext_(binding,event) -> Context`; `buildLiveRoster_(rawValues,state) -> {subjects,rows,attention,blockedTickets,rosterRevision}`; `prepareLiveCorrections_(context,edits) -> CorrectIntent`; `livePublicRows_(context) -> Row[]`. Context contains binding/book/state/source/roster, both revision hashes and config revision.

- [ ] Write exact-ticket/association tests using numeric `83`, literal `'001'`, guest `'001B'`, duplicate names, conflicting ticket/ID owners, missing fields and computed errors. Assert `083` is preserved, all conflict owners are blocked, and public JSON contains no `studentId`, source rows or eligibility fields.
- [ ] Add `moved source invalidates correction and reserves old/new tickets`, `changed base rejects stale editor`, `atomic conflict-group edit`, `unrelated quarantine does not prevent safe correction`, and `corrected ticket still conflicts -> reject` tests. Assert zero Sheet writes for this pure task.
- [ ] Run `node --test tests/scanner-live-roster.test.cjs tests/scanner-live-corrections.test.cjs`; observe RED assertions, then implement the schema parser and projection in the named files.
- [ ] Bind record IDs to workbook/tab/source row/base fingerprint; validate the exact six correction fields. Normalize only approved numeric student tickets, preserve literal guest strings and reserve conservative blocked-code candidates. Use shared internal identities for guest/host links.
- [ ] Implement audit replay: ignore staged payloads not referenced by a verified committed operation; mark Pending scopes blocked; refuse tampered/malformed/duplicate/formula rows. Keep incomplete source diagnostics admin-only and escape presentation later.
- [ ] Run both new suites and the full scanner suite; all pass. Commit only Task 2 files: `feat: project live roster with audited correction model`.

### Task 3: Verified Admission And Global Correction Publishing

**Files:** Create `apps-script/live/Actions.gs`, `tests/scanner-live-admission.test.cjs`; modify State/Roster/Api/Auth and correction tests.

**Interfaces:** `commitLiveOperation_(context,intent) -> MutationResult`; `admitLiveTicket_(context,request) -> MutationResult`; `publishLiveCorrections_(context,request) -> MutationResult`; `setLiveMode_(context,request) -> MutationResult`; `renameLiveEvent_(context,request) -> MutationResult`; `getLiveOperation_(context,request) -> {operationId,state,currentRow?,canUndo}`. Caller uses Task 1's same-lock fresh context/authorization before these handlers.

- [ ] Write `exact ticket commits once`, `second-device duplicate preserves timestamp and gets no receipt`, `guest admission leaves host untouched`, `under-lock guest replacement refuses stale hash`, and `read-only mode writes nothing` tests. Assert `result.row.Status === 'Admitted'`, an exact server timestamp, and one committed admission only.
- [ ] Write correction-publish tests for full-group readback, source change at lock time, revision propagation, malformed fields, formula-like values stored as literal JSON, and zero original-intake/mirror writes. Changing an admitted assignment never inherits/reset its attendance merely by publishing.
- [ ] Add failure probes at reservation, staged payload write, flush, status commit, final context read and lost response. Assert errors never return a success row; surviving Pending reservations block affected tickets; identical operation retries do not append new rows.
- [ ] Run `node --test tests/scanner-live-admission.test.cjs tests/scanner-live-corrections.test.cjs`; observe RED, then implement Pending -> payload write/readback -> Committed -> full projection verification. Reassert target before every write and serialize name/mode changes in the journal.
- [ ] Admission request requires `{qrValue,expectedAssignmentHash,expectedRosterRevision,operationId,actorSecret,undoSecret}`. Store only secret hashes; return the receipt only to its initiating operation. Bind idempotency to canonical intent plus actor and reject an operation ID reused with different intent.
- [ ] Implement owned `getOperation`: report current operation/attendance truth after a lost response, not an obsolete green result after a later reset. Test secret theft, request mismatch and role rotation after initial authorization.
- [ ] Run new and full suites with trace checks; all pass, no intake/mirror writes. Commit Task 3: `feat: verify live admissions and global ticket corrections`.

### Task 4: Latest-Receipt Undo And Eve-Only Reset/Reconciliation

**Files:** Modify Actions/Api/Auth/State; create `tests/scanner-live-undo.test.cjs`, `tests/scanner-live-reset.test.cjs`.

**Interfaces:** `undoLiveLatest_(context,request) -> MutationResult`; `previewLiveReset_(context,request) -> ResetPreview`; `resetLiveTickets_(context,request) -> MutationResult`; `reviewLiveOperation_(context,request) -> MutationResult`. Undo consumes `{receipt,actorSecret,undoSecret,operationId}`. Reset consumes `{scope,ticketId?,confirmationToken,expectedAttendanceRevision,operationId,reviewedAssignmentHash?}`.

- [ ] Write `shared helper key cannot steal undo`, `duplicate grants no ownership`, `newer admission invalidates older undo`, `undo does not reactivate older receipt`, and `reset/re-admission makes old receipt unusable` tests. Assert only the originating actor/receipt can revoke the latest active admission and history remains.
- [ ] Add the two-tab stale-undo test from Review Focus: tab A admits, tab B with the same actor admits a newer ticket, then A's undo fails even after B undoes its own admission. No raw receipt secrets appear in list/getEvent/attention/audit responses.
- [ ] Write admin reset tests for one/all, helper direct-call refusal, exact scope/count, 120-second expiry, stale attendance/source preview, token mismatch and cancelled warning. Resetting one guest leaves the host admitted; logical reset preserves original timestamps/history.
- [ ] Add the reset-preview/check-in race: a new admission commits after preview, so `assert.match(reset.error, /changed|stale/i)` and all existing admissions stay active. All-ticket reset refuses Pending/Needs Review scopes instead of clearing them.
- [ ] Add Eve's explicit single-record review for Pending/assignment drift and existing-operation completion/cancellation. Require fresh pending-intent/current-assignment hashes and confirmation; never accept helper reconciliation, silently retry or delete reservations. Cancellation retains audit evidence.
- [ ] Run `node --test tests/scanner-live-undo.test.cjs tests/scanner-live-reset.test.cjs`; observe RED, then implement all handlers through Task 3's verified journal commit and the same lock. Capture latest successful admission per actor even when it has been undone, not latest remaining active ticket.
- [ ] Inject failures throughout one/all undo/reset/review operations; a Pending Reset All globally blocks admission, partial state is not shown as reset, and identical committed-operation retries add no writes. Full scanner suite passes; commit Task 4: `feat: authorize receipt undo and audited Eve-only resets`.

### Task 5: Multi-Result Decoder And Automatic Live Scan

**Files:** Create `assets/ticket-decoder.js`, `assets/vendor/zxing-wasm-3.1.5/{reader.js,zxing_reader.wasm,LICENSES.txt,manifest.json}`, the three existing-dependency vendor files in File Map, and `tests/scanner-live-decoder.test.cjs`; modify `index.html` and new live UI fixture. Do not alter the old ZXing asset.

**Interfaces:** `StudentQrTicketDecoder.create({reader,wasmUrl}) -> {initialize,decode,selectSingle}`; `decode(input) -> Promise<ReadResult[]>`; `selectSingle(results) -> {kind:'single',ticket}|{kind:'none'|'ambiguous'|'invalid'}`. `processLiveDecodedTicket(ticket,source,scanGeneration) -> Promise<void>` is an index integration function, not a confirmation panel. Extend existing `stopScanning({invalidateDecode=true}={})` so internal single-scan camera cleanup preserves its already accepted decode, while the user's Stop invalidates future dispatch.

- [ ] Write leading-zero, checksum/error, unknown format, empty result, two-distinct-ticket, duplicate-same-value and initialization-failure tests. Assert two values or any reported decoder error causes zero admission calls; a single valid Code 128 `083` submits exactly once without clicking Confirm.
- [ ] Run `node --test tests/scanner-live-decoder.test.cjs`; observe RED. Acquire only the official registry package `zxing-wasm@3.1.5`, verify its integrity, vendor the reader-only matching JS/WASM/licenses and record hashes. Do not install the writer/runtime CDN or use unpinned latest.
- [ ] Vendor the already used `jsqr@1.4.0` and `qrcodejs@1.0.0` scripts from verified registry packages, with notices and source hashes. Replace their two CDN script tags with same-origin paths; preserve their public globals/version-1 behavior. Assert zero third-party script/WASM requests before or during private-link use.
- [ ] Configure `prepareZXingModule` with same-origin locateFile and reader options `{formats:['Code128','QRCode'],maxNumberOfSymbols:0,returnErrors:true,textMode:'Plain',tryHarder:true,tryRotate:true,tryInvert:true}`. Accept only valid, nonempty, unpadded exact text; never truncate at the first array item or let a native single result override software ambiguity.
- [ ] For version 2 use the unified multi-result reader on the complete captured frame/photo, with a visible single-ticket framing guide. Native detection may assist but cannot be a first-result bypass. Decoder unavailability leaves manual exact-ticket entry available, not unsafe automatic fallback.
- [ ] Add real bundled-library tests using generated fictional Code 128/QR pixels, including a corrupted checksum, rotated code and multiple-ticket image. Privately inspect the supplied ticket photograph through CUA and save only key-free barcode-count proof; do not commit the attachment or copyrighted ticket artwork.
- [ ] Integrate automatic dispatch through the existing camera loop/photo path. Capture a scan generation; the user's Stop, page hide, config switch or camera replacement invalidates late decoding before dispatch. Internal single-scan cleanup uses `stopScanning({invalidateDecode:false})` and must not cancel its accepted ticket. Once POST is dispatched, cancellation cannot promise server rollback: retain/reconcile the operation and never invent an undo or blindly retry. Keep one-second post-processing delay, continuous-camera option and version-1 compatibility.
- [ ] Run new decoder tests plus barcode/cooldown/admission/event-link suites, then full suite. Confirm missing/blocked WASM and orientation/resize cause no late submission; assert non-continuous mode still submits one accepted ticket, and Stop after dispatch does not misreport attendance as cancelled. Commit Task 5: `feat: auto-check-in unambiguous live ticket scans`.

### Task 6: Eve Corrections, Reset Warnings And Helper Undo UI

**Files:** Create `assets/homecoming-live.js`, `tests/helpers/homecoming-live-ui.cjs`, `tests/scanner-live-ui.test.cjs`; modify `index.html`.

**Interfaces:** `StudentQrLive.create({request,getSnapshot,refreshRoster,renderResult,renderRelationship,escapeHtml,elements,storage}) -> Controller`. Controller methods: `submitTicket(ticket,source)`, `undoLatest()`, `loadAttention()`, `publishCorrections(edits)`, `previewReset(scope,ticketId?)`, `confirmReset()`, `cancelReset()`, `reviewOperation(operationId,decision)`, `reconcileOperation(operationId)`. `request(action,payload) -> Promise<Response>` wraps existing trusted `eventRequest`; `getSnapshot()` returns config/access/rows/revision hashes.

- [ ] Write helper-no-Setup/attention/reset, Eve-only editor, exact reset-warning/Cancel, before/after correction and input escaping tests. Assertions include `assert.equal(helper.resetVisible,false)` and `assert.match(admin.warningText,/ARE YOU SURE!\?/ )`; cancel sends zero mutation requests.
- [ ] Write two-device correction propagation, stale-form refusal, guest/student name/status independence, duplicate red/original timestamp and stale relationship clearing tests. Use a controlled eight-second clock and focus refresh, not sleep-based tests or a claim of real-time push.
- [ ] Write actor/receipt persistence and two-tab synchronization tests. Generate secrets with `crypto.getRandomValues`, namespace by trusted event/endpoint, reconcile before re-enabling Undo after refresh, and fail safely when storage is unavailable. Never put receipts/actor secrets into URLs, share QR or console logs.
- [ ] Run `node --test tests/scanner-live-ui.test.cjs`; observe RED, then implement the standalone controller and existing-style UI sections. Show Needs Attention groups, six-field editor, validation/diff/publish result and Pending/Needs Review detail for Eve only. Freeze the edit snapshot; polling cannot overwrite a draft silently.
- [ ] Add Reset Ticket in admin detail and separate Reset All, both using server preview and exact warning before submission. Display affected ticket/count, expiry/stale error and safe Cancel; use explicit per-record review for uncertainty, not a helper backdoor.
- [ ] Integrate `validateSharedConfig`/`loadRoster`/`admitByQr` for the strict version-2 protocol and new revision hashes. Accept version 2 only from an authenticated trusted event response, not embedded setup/profile URLs. Keep version-1 tests valid; on new-module absence refuse version-2 operations rather than fall into the old writer. Clear or reconcile stale receipts after mode/config/reset changes and lost responses.
- [ ] Verify green/yellow/red results use server status/time and show both linked names; successful undo displays Not Checked In and clears its active timestamp without erasing history. Full suite passes; commit Task 6: `feat: add Eve ticket corrections and receipt/reset controls`.

### Task 7: Owner Provisioning, Isolated Live-Protocol Practice And Runbook

**Files:** Create `apps-script/live/Provision.gs`, `tests/scanner-live-provision.test.cjs`, `scripts/homecoming-live-preview.cjs`, `docs/homecoming-live-runbook.md`; modify live manifest, root/Apps Script READMEs and the static asset allowlist in `scripts/homecoming-preview.cjs` (no mirror fixture changes).

**Interfaces:** `prepareHomecomingLive() -> {stage,spreadsheetId}`; `initializeHomecomingLive() -> {created,eventId,adminUrl?,helperUrl?,testMode:true}`; `recoverHomecomingLiveAdminLink() -> {eventId,adminUrl,helperUrl}`; `prepareHomecomingLivePractice() -> {spreadsheetId,environment:'live-test'}`. These are owner-editor operations, never web actions. Practice emits a separately sealed Deployment.gs for its new fictional workbook; every other module is identical to the candidate.

- [ ] Write idempotent prepare/init/recovery tests, unrelated/incompatible state-tab refusal, malformed `/dev`/changed endpoint rejection and initialization failure recovery. Assert original intake and accepted mirror have zero writes and existing state/keys/attendance are retained on rerun.
- [ ] Run `node --test tests/scanner-live-provision.test.cjs`; observe RED, then implement staged ownership binding, header-only state provisioning, distinct random role keys and initial authoritative read-only mode. Verify every persisted source/target/tab/schema and exact `/exec` URL before issuing links.
- [ ] Implement explicit owner recovery that rotates only the lost admin credential and preserves helper access/history; never log a raw key or keep the raw admin key merely to regenerate it. Native credential changes follow tool handoff rules where applicable.
- [ ] Create a new small fictional version-2 practice fixture/workbook, not a rewrite of the accepted mirror. Include `083`, `085`, a `383`/`383B` pair, conflicting `084` owners and one incomplete record for Eve's editor. No source student data or copied formulas; new private workbook/project identity and persistent `Practice - Not Real Attendance` label.
- [ ] Serve the real frontend and live modules through `homecoming-live-preview.cjs` on `127.0.0.1:3895`; mock provider requests, serve self-hosted access-QR/decoder JS and WASM with correct MIME, and refuse outbound fetch. Maintain the old preview's explicit static asset allowlist for the same self-hosted dependencies, leaving its mirror fixtures unchanged. CUA verifies helper access QR, auto scan, latest-only undo, single/all reset Cancel/confirm, correction publishing and two-tab updates with fictional records.
- [ ] Document role links, correction-layer/source distinction, duplicate/guest handling, undo limits, reset warning, uncertainty/review workflow, eight-second polling, feature detection/manual fallback and rollback-to-read-only (not ledger clearing). Do not include raw keys or private roster records.
- [ ] Full suites and `git diff --check` pass. Commit Task 7: `feat: provision isolated live-protocol practice and release runbook`.

### Task 8: Independent Review And Verified Production Release

**Files:** Modify `assets/trusted-backends.json`, runbook, READMEs and `docs/homecoming-implementation-status.md`; create credential-free release receipts in the existing private execution-artifact area. Never overwrite the 319/323 mirror freezes.

**Interfaces:** release evidence identifies exact commit/module/asset hashes, practice/production Deployment.gs differences, Google saved/deployed versions, real binding/event/mode/role reads, hosted byte parity, private links and separately recorded physical observations. A stage's acceptance does not imply the next stage passed.

- [ ] Run `node --test --test-reporter=tap tests/scanner-*.test.cjs` and `git diff --check`; preserve exact zero-skip results and zero original-intake/mirror mutation traces. Scan staged public source for credentials/real roster data. Freeze all candidate files and hashes, not a moving worktree.
- [ ] Request a fresh bounded independent whole-candidate review of authorization/receipts, multi-ticket decode, correction drift/collisions, same-lock reset races, uncertainty/audit truth and immutable targets. Reviewer uses fictional fixtures, no provider writes. Repair findings with RED/GREEN regressions and create a new freeze; do not reuse historical 323 acceptance.
- [ ] At actual provider action points, confirm school-account web-app exposure with precise recipients/data/permissions. Deploy the new private fictional practice twin first; verify saved modules, persisted target/role/mode and readback. Use two iPhones to exercise new auto/duplicate/guest/undo/reset/correction behavior without real attendance writes.
- [ ] Create the separate **Homecoming 2026 - Live Check-In API** under Eve's school account, deploy the reviewed production manifest, provision only the three new state-tab headers, and initialize in read-only mode. Reject unexpected existing state, sharing changes or target mismatch; do not reuse the practice target or old mirror credentials.
- [ ] Read the actual live source/current quarantine privately; validate real names/associations, admin attention diagnostics and helper data minimization. Verify all saved/deployed modules byte-exact, binding readiness, private Sheet permissions, helper refusal of admin actions and unauthenticated refusal. No real admission/undo/reset smoke-test calls.
- [ ] Add only the verified new production/practice `/exec` URLs to the same-origin registry, preserving the accepted mirror entry. Publish an authorized fast-forward to `russelldudek/StudentQR` main; no force push. Verify Pages build commit and served index/controller/decoder/JS/WASM/registry hashes, fresh admin/helper roles, access QR and persistent environment labels.
- [ ] Activate authoritative production mode under Eve's admin role only after source, independent review, practice provider/phone, live binding/role and hosted-byte gates pass. Verify persisted mode and fresh helper/admin reads say LIVE and point to the real target. Do not claim activation from a local checkbox.
- [ ] Deliver private production links/QR directly to Russ/Eve. Store secrets outside Git at `/Users/russelldudek/.codex/private/studentqr/homecoming-live-links.json` (0600; parent 0700). Deliver the runbook with exact unproved physical observations, any remaining quarantines and a reversible read-only pause procedure. Close temporary preview tabs/processes; retain deliverables.

## Decoder Provenance And Plan Checks

Primary sources checked on 2026-10-10: [zxing-wasm README](https://github.com/Sec-ant/zxing-wasm/blob/main/README.md), [reader options](https://sec-ant.github.io/zxing-wasm/docs/interfaces/full.ReaderOptions.html), [read results](https://sec-ant.github.io/zxing-wasm/docs/interfaces/full.ReadResult.html), and official registry metadata for `zxing-wasm@3.1.5`. The package provides array results, checksum/error reporting, configurable symbol limits and same-origin WASM loading. These are API capabilities, not physical-phone proof.

Official registry integrity: `sha512-jmxXvTCR/qZxMz2XwR6V+nL2BlDTD1aux7ZWSH9BV77TG9u4k0VyHba/NCCHBHJ60Wg6VV0QL/SMlJczKhJI4w==`. Fetch only `https://registry.npmjs.org/zxing-wasm/-/zxing-wasm-3.1.5.tgz` at implementation time; verify JS/WASM pairing and all applicable notices. No package was installed for this plan.

Self-review coverage: source/roles and immutable targets -> Task 1; exact canonical roster/admin corrections -> Tasks 2/3; admission truth/mode/name -> Task 3; receipts/resets/reconciliation -> Task 4; automatic iPhone/multi-ticket guard -> Task 5; names/admin/helper/global UI -> Task 6; idempotent preparation/practice/operator instructions -> Task 7; independent/provider/hosted/physical release -> Task 8. All five Review Focus conditions have named task tests above.

Planning baseline: 323/323 existing tests passed with zero skipped on 2026-10-10;
that baseline covered no new live behavior.

## Execution Checkpoint

Tasks 1-6 and Task 7 local preparation/browser checks are complete. The final
immutable `7d7eeff` candidate passed 434/434 tests with zero skipped and received
independent acceptance after all reproduced findings were repaired. Task 8's
authorized production deployment, owner preparation/initialization, private role
checks, hosted-byte verification, activation and chat/Slack delivery are complete.
Pages published the approved fast-forward `0763b9d`; authoritative revision 2 is
LIVE. The real source and mirror were not edited, and no real ticket was admitted
for testing. 346 usable ticket holders and 233 quarantined source records remain.
The human explicitly waived additional practice-provider and physical-phone
acceptance under the urgent release order; neither is claimed as completed proof.

Review rulings extend only the existing recovery/correction contracts:
`cancelUncommitted` verifies the original action/payload and actor, then either
returns its current journal truth or reserves a durable Cancelled `Noop` marker.
Helpers cannot reconcile admin mutations; no-op markers never grant undo or
complete into attendance. This avoids treating a transient NotFound as proof
that a delayed original POST cannot commit.
Admin-only `retireCorrection` with preview scope `correction` retires an override
whose source row was removed. It requires fresh roster/attendance hashes and
confirmation, refuses active/Pending attendance and retains all physical history.
It is not a source edit, automatic rebinding or attendance transfer.

The unused practice project was explicitly repurposed as the distinct production
project, with its fictional preparation workbook preserved separately. All eight
production backend modules were saved/reloaded byte-exact before the approved
version-1 deployment. Private target/roles, served bytes and activation were
verified; physical phone observations remain an operator field check. See
`docs/homecoming-implementation-status.md` for the release evidence and limits.

## Execution Handoff

Please review this plan and confirm it captures the approved behavior. Preserve
the already selected Native method; after plan approval use
`superpowers:executing-plans` in this same owning chat. Deployment/access gates
remain concrete action-time decisions, not a request to approve the design again.
