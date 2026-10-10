# Homecoming Shared Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement one shared Homecoming backend with bidirectional student/guest ticket links, then provision an isolated mirror for Eve and Russ to test on their iPhones without altering real attendance.

**Architecture:** Keep the strict pure intake projection and generic Students backend. Add a server-bound Homecoming reader and separate attendance ledger, using the existing private-event protocol and script lock. The mirror uses a different private spreadsheet and dedicated Apps Script project; its write guard must reject the real spreadsheet even if a caller or saved configuration requests it.

**Tech Stack:** Apps Script V8, SpreadsheetApp/PropertiesService/LockService, existing static HTML/JavaScript, pinned ZXing 0.21.3, Node test runner and VM fixtures, CUA browser validation.

**Spec:** `docs/superpowers/specs/2026-10-10-homecoming-shared-backend-design.md`, approved by Russ on 2026-10-10.

## Global Constraints

- Production source: `1hlWdxxzlP2Zbl9m4_MN49XBgBrL7YiG67ur2p2tEueU`, tab `Ticket Checklist`, header row 5. No source or production attendance writes during this work.
- Preserve the exact ten-column schema, strict `projectCombinedIntake_`, literal tickets such as `083` and `001B`, and existing explicit-adapter refusals. Never infer padding, host identity, or admission eligibility.
- Attendance schema: Event ID; Person Type; Ticket ID (JSON); Source Student ID (JSON); Subject Assignment SHA256; Status; Admitted At. Valid stored statuses: Pending and Admitted; Needs Review is a derived quarantine state, never a reset of history.
- Preserve separate admin/helper 256-bit keys, private `#key=` links, fresh-phone roster load, server-side role authorization, and event revision checks.
- Before transmitting bearer keys, require an exact match in a same-origin trusted endpoint registry; HTTPS or a Google hostname alone is not endpoint trust. No arbitrary query-supplied backend or failed-registry fallback.
- Native multiple-code frames are refused. The existing software decoder returns a single candidate and cannot prove frame uniqueness, so software camera/photo results require deliberate ticket/name confirmation before admission, including mirror practice mode.
- Helpers cannot edit setup, assign IDs, change global mode, reset attendance, or select a different source/ledger.
- Server timezone: `America/New_York`; initial global test mode: true; visible-page polling: eight seconds; continuous scan delay: at least one second after processing.
- Mirror name: `Homecoming 2026 - Mirror Test`; environment identifier: `mirror-test`; roster mode identifier: `homecoming-2026`. Always show a Mirror Test banner on mirror devices.
- Mirror only ticket strings and guest relationships. Default to fictional names and internal IDs; omit real student names/IDs, emails, grades, uploaded documents, and eligibility metadata. This assumption is presented for plan review.
- A mirror snapshot is not production synchronization. Do not repeatedly recopy source or reset the mirror ledger on restart; create a new mirror only with a deliberate owner operation.
- No private keys, actual roster rows, or Google credentials in Git, screenshots, public HTML, test logs, or frozen review artifacts.
- Existing worktree changes belong to earlier work. Preserve them and capture exact preimages before implementation; never reset or bulk-stage unrelated files.
- Creation/provisioning of the mirror is within the requested scope. Browser OAuth, access grants, web-app exposure, and publishing require their specific action-time confirmation or handoff. Production provisioning/activation remains excluded.

## Review Focus

- Mirror/prod confusion: a renamed event or forged client config must never redirect mirror writes to production (Tasks 2 and 4).
- Leading zeros and formula-like ticket text: provisioning must not coerce or execute a ticket value (Tasks 1 and 4).
- Interrupted provisioning: retry must recover the same mirror or explicitly stop, not create another workbook or silently reset attendance (Task 4).
- Lost admission response: retry must report the original Admitted record, not write another row (Task 2).
- Stale guest display: source refresh, unknown scans, pending admission, and switching dances must not leave the previous person's association visible (Task 3).

## File Boundaries

- Modify `apps-script/Code.gs`: request routing, shared-event binding validation, locked dispatch and global-mode serialization. Leave the pure projection in place.
- Create `apps-script/Homecoming.gs`: raw intake reader, exact student/guest join, ledger validator, public row shaping, guarded admission writer.
- Create `apps-script/MirrorTest.gs`: owner-only mirror preparation and private-link initialization; no public provisioning/reset action.
- Modify `index.html`: optional server mode/environment metadata, relationship presentation, attendee counts and mirror banners; preserve scanner decoding and source bootstrap marker.
- Create `assets/trusted-backends.json`: version 1, initially empty `endpoints` array, later containing only the exact verified mirror /exec URL. No keys or roster data. It is deployed with the reviewed frontend, never trusted from query parameters.
- Create `tests/helpers/homecoming-fixtures.cjs`: fictional Sheet/property/lock fixtures, failure injection and per-spreadsheet read/write tracing. Real network and camera calls throw.
- Create `tests/scanner-homecoming.test.cjs`, `tests/scanner-homecoming-ui.test.cjs`, `tests/scanner-mirror.test.cjs`: unit, routed integration, UI and provisioning isolation tests.
- Update backend VM loaders in existing tests to include the new `.gs` files where needed, without weakening their assertions. Preserve the existing admission test's optional historic-before path.
- Update `README.md` and `apps-script/README.md`; create `docs/homecoming-iphone-test.md` for exact setup/runbook and expected outcomes.

### Task 1: Validated Homecoming Read Model And Guest Join

**Interfaces:** `readHomecomingBinding_() -> null|Binding`; Binding contains version 1, stage preparing/ready, environment, spreadsheetId, sourceSheetName, sourceHeaderRow, attendanceSheetName. `readHomecomingContext_(binding,eventId) -> {book,intakeSheet,ledgerSheet,subjects,attendance}`. `parseHomecomingLedger_(values,formulas,eventId,subjects) -> Map<string,Record>`; `homecomingRows_(subjects,attendance) -> PublicRow[]`. `subjectAssignmentHash_(subject,linkedSubject|null) -> string` returns a SHA256 digest of the JSON array of exact personType, ticketId, sourceStudentId, fullName, linked personType/ticketId/fullName (empty strings if absent), excluding row number and attendance.

PublicRow uses the existing First Name/Last Name/QR_ID/Status/Admitted At/Bringing Guest keys. It additionally returns personType and linkedPersonType/linkedName/linkedTicketId/linkedStatus/linkedAdmittedAt. A missing relationship is represented by empty strings. Never return sourceStudentId or sourceRow to the client.

- [ ] Write fixture tests in `tests/scanner-homecoming.test.cjs` for a Student ticket `001` and Guest ticket `001B` sharing internal `SID-001`; assert exact bidirectional ticket/name/type links, no internal ID exposure, and zero source writes.
- [ ] Add tests for two identical full names with different internal IDs, reordered rows, no guest, malformed/incomplete guest rows, numeric `83`, literal `083`, duplicate tickets across roles, and formula/format diagnostics that do not rewrite values.
- [ ] Add ledger tests for JSON string decoding, Pending versus Admitted, duplicate rows, unknown status, formulas, identity reuse, malformed timestamps, and retained removed-subject records. Validate duplicates by event plus exact ticket, not by person type or normalized text.
- [ ] Test same-host/same-ticket guest-name replacement, altered pairing, cosmetic name correction, and removal/reappearance. A changed assignment returns Needs Review and no write or inherited Admitted state; unchanged reordered or reappearing assignments retain the original record. Digests must not disclose names; do not claim they identify replacements with identical available attributes.
- [ ] Run `node --test tests/scanner-homecoming.test.cjs`; confirm meaningful failures for missing read-model functions.
- [ ] Implement the interfaces in `apps-script/Homecoming.gs`, consuming unchanged `projectCombinedIntake_(rawValues)`. Use exact raw strings and Maps; build relationships from internal sourceStudentId plus personType. Missing attendance is `Not checked in`.
- [ ] Run the new tests and the existing projection/refusal suite; all must pass without adding production adapter acceptance.
- [ ] Commit only reviewed Task 1 changes and retain their preimage/hash evidence.

### Task 2: Shared Routing And Verified Attendance

**Interfaces:** `assertHomecomingBinding_(binding,event) -> Binding`; `admitHomecomingLocked_(config,binding,qrValue,eventId) -> AdmissionResponse`. Code.gs invokes the latter only while holding its script lock, after fresh authorization/revision/mode checks. `setTestMode_(config,value,eventRequest)` must reauthorize and serialize managed mode changes with admissions.

- [ ] Write routed GET/POST tests for valid admin/helper keys, invalid keys, stale revisions, unkeyed callers, forbidden helper actions, caller-selected spreadsheets, and preparing bindings. Unauthenticated Homecoming requests must perform zero Sheet reads/writes.
- [ ] Write admission tests asserting first live scan creates one final Admitted row with a verified timestamp, second scan returns alreadyAdmitted with the same timestamp and no additional write, and a guest scan leaves the associated student's attendance unchanged.
- [ ] Inject an interleaved second scan, lock refusal, revision change, mode change, and lost first response. Assert exactly one event/ticket record and no optimistic success. Confirm source edits do not alias a previously admitted identity.
- [ ] Inject Pending-write, flush, final-status-write and readback failures. Assert no success response; surviving Pending blocks retry. Final Admitted with a lost response must remain recognizable as alreadyAdmitted.
- [ ] Run `node --test tests/scanner-homecoming.test.cjs`; observe the routed/admission tests fail before implementation.
- [ ] In `Code.gs`, dispatch Homecoming solely from the owner binding and stored event, never client mode/config. Preserve generic routes and explicit adapter refusal. In Homecoming mode reject assignQrIds and edits to fixed source/ledger/mapping; permit admin event-name changes without losing the binding.
- [ ] Implement Pending -> flush/readback -> Admitted -> flush/readback in `Homecoming.gs`. JSON-encode identity cells and persist subjectAssignmentHash_; require formula-free exact readback. Refuse admission for a different current assignment digest without altering the historic row. Before each write verify the opened spreadsheet ID equals the bound target. For mirror-test, also require that target differs from the production source ID.
- [ ] Make managed test mode authoritative inside the lock; test scans perform no writes or provisioning. Do not let event.config.testMode saves disagree with the centrally stored mode.
- [ ] Run `node --test tests/scanner-*.test.cjs`; all generic, shared-link, adapter, barcode and cooldown cases must still pass alongside the new tests.
- [ ] Commit only reviewed Task 2 changes.

### Task 3: Eve/Helper Guest Presentation And Mirror Labels

**Interfaces:** Extend `validateSharedConfig` with optional validated rosterMode/environment metadata; add those fields to `rosterConfigKey`, not to legacy compact setup payloads. `renderScannerRelationship(row|null)` presents or clears association details. `normalizeRows` retains the six person/relationship fields. `loadTrustedBackends() -> Promise<Set<string>>` loads the fixed same-origin registry; `assertTrustedBackend(apiUrl)` rejects before any key-bearing fetch. `presentDecodedCandidate(ticket,source)` creates a pending candidate without admitting; `confirmDecodedCandidate()` admits only the displayed ticket after user selection. Backend binding remains authoritative regardless of client metadata.

- [ ] Write tests in `tests/scanner-homecoming-ui.test.cjs` for a fresh admin link, fresh helper link without Setup, Mirror Test banners, Student/Guest counts, immutable Homecoming mapping and disabled ID assignment.
- [ ] Write rendering tests for Student Bringing guest Yes/No, Guest Associated student, exact linked tickets, independent status/time, escaped names, and both read-only-test and write-capable responses.
- [ ] Test hostile HTTPS endpoints, an unapproved Apps Script deployment, userinfo/encoded-host tricks, redirects to an unapproved registry, registry failure and tampered query config; assert zero key-bearing requests. Registry tests use invented /exec URLs and refuse real networking.
- [ ] Test a two-ticket software frame/photo, canceling a decoded candidate, and changing the roster during confirmation. Assert no admit request before selection and no arbitrary silent admission. Confirming a shown single candidate submits its exact ticket once; native multiple codes remain refused. Continuous software scanning pauses on the candidate and resumes with the existing cooldown after processing.
- [ ] Test unknown/failed scans, roster/environment changes, guest removal, Pending records and Needs Review assignments; assert the prior person's relationship is cleared and Pending/review/uncertain results are red, never green.
- [ ] Run `node --test tests/scanner-homecoming-ui.test.cjs`; confirm the new presentation assertions fail before implementation.
- [ ] Update `index.html` along existing patterns. Keep student-with-guest and guest reminders yellow, duplicate/error red, and verified non-guest admission green. Scanning a linked person does not submit another admission request.
- [ ] Add registry validation before private-link parsing/request dispatch and shared bootstrap key transmission. Registry entries must be exact credential-free `https://script.google.com/macros/s/<deployment-id>/exec` URLs without query/fragment; no broad Google-host allowlist. Use a fixed same-origin registry path and reject redirects. A missing approved deployment prevents link use rather than leaking a token.
- [ ] Add a candidate panel for software camera/photo decoding that prominently shows exact ticket, matched name and Confirm/Cancel. Do not call `admitByQr` until confirmed. Show lookup/association without a success claim before confirmation; clear it on cancel/errors. This is a deliberate selection safeguard, not a claim of exhaustive multi-barcode detection. Preserve native single-code scanning and the one-second post-processing delay.
- [ ] Label mirror mode unambiguously: `Mirror Test - Read-only scans` when global test mode is true; `Mirror Test - Practice check-ins (mirror records only)` when false. Do not describe test-mode-off on the mirror as live production.
- [ ] Run the whole scanner suite; preserve the `loadSavedConfig();` extraction marker and existing one-second cooldown tests.
- [ ] Commit only reviewed Task 3 changes.

### Task 4: Idempotent Owner-Only Mirror Provisioning

**Interfaces:** `buildMirrorIntake_(rawValues) -> rawValues` is pure and anonymizes names/internal IDs while preserving exact tickets and pairings. `prepareHomecomingMirrorTest() -> {spreadsheetId,sourceSubjectCount,stage}` is editor-only. `initializeHomecomingMirrorTest() -> {created,eventId,adminUrl?,helperUrl?,testMode:true}` is editor-only; adminUrl appears only on first initialization. Neither function is in doGet/doPost's action allowlist.

- [ ] Write `tests/scanner-mirror.test.cjs` cases asserting real source reads only, writes restricted to a new private target, exact `083`/`001B` preservation, fictional names/IDs, empty eligibility fields, no copied formulas, and no production attendance access.
- [ ] Add tests for source validation failure before creation, create/write/flush/readback/property failures, preparing-state refusal, retry with the same stored target, mismatched target, existing incompatible ledger, and target equal to production. No retry may auto-delete or reset a Sheet.
- [ ] Add initialization tests for distinct keys, helper responses without admin credentials, true global test mode, null or /dev deployment URL refusal, and reruns retaining keys/event/attendance. A rerun says to use the existing private admin URL; do not persist its raw admin key just to regenerate it.
- [ ] Run `node --test tests/scanner-mirror.test.cjs`; confirm missing provisioning functions cause meaningful failures.
- [ ] Implement `buildMirrorIntake_` and owner operations in `MirrorTest.gs`. Validate the complete source before creation. Save a preparing guard before any public deployment; persist a returned new spreadsheet ID before populating it, so failures can be retried against that same target.
- [ ] Write a row-5 `Ticket Checklist` mirror and row-1 empty `Check-ins` ledger. Use plain-text formats and RichText string writes for intake; verify raw readback and absence of formulas. Preserve only existing ticket strings and guest declaration/pairing; use `MIRROR-0001`, `Practice Student 1`, and `Practice Guest 1` identities/names by source row.
- [ ] If mirror creation's outcome is unknown and no ID was persisted, stop for owner inspection rather than create another workbook. Never reset/repopulate a mirror that already contains attendance.
- [ ] Require the real deployed /exec URL from ScriptApp.getService().getUrl() at initialization; save its bound shared event and global true test mode, then verify persistence before returning links. Keep the preparing guard fail-closed until complete. Use distinct 256-bit link tokens assembled from sufficient random UUID entropy; never Math.random.
- [ ] Run mirror plus whole scanner tests and verify per-spreadsheet write traces contain only the mirror ID.
- [ ] Commit only reviewed Task 4 changes and document all three .gs files required for a deployment.

### Task 5: Integration Preview, Independent Review And Runbook

**Interfaces:** Test-only HTTP preview serves actual frontend/assets and routes to all actual backend modules in a fictional VM. It must reject Google/provider requests and writes to any production ID. Preview addresses and fictional links are not production-ready phone links.

- [ ] Exercise admin/helper autoload, student/guest scan presentation, read-only global mode, mirror-only practice admission, duplicate scan on a second browser tab, and polling refresh. Verify the same behavior through real route functions rather than mocked success payloads.
- [ ] Use CUA for browser actions; retain a screenshot showing the Mirror Test banner, linked person and correct scan result without real student data or keys. Close only agent-owned tabs and stop only the owned preview process.
- [ ] Run `node --test --test-reporter=tap tests/scanner-*.test.cjs` and `git diff --check`. Retain exact current source/test/asset afterimages, file modes, SHA256 manifest and test output; historic 255 is baseline evidence, not the new result.
- [ ] Update README/setup instructions and `docs/homecoming-iphone-test.md`: code files, private mirror setup, direct Eve URL/helper access QR, expected ticket results, duplicate testing, uncertain-record handling and production exclusions.
- [ ] Have a fresh independent reviewer check the frozen candidate for authorization gaps, mirror/prod write escape, guest-link mixups, concurrency, false green, privacy leakage and generic-route regressions. Fix findings with regression tests and rerun the full suite before live setup.
- [ ] Commit reviewed source/docs only; no GitHub push or Google deployment as a side effect of source commits.

### Task 6: Real Mirror Setup And Two-iPhone Handoff

**Interfaces:** A private mirror spreadsheet and dedicated test Apps Script project under Eve's school account; its actual /exec deployment; the published reviewed static frontend; private Eve mirror admin URL and helper access QR. No production Homecoming initializer is run.

- [ ] Reconfirm Eve's signed-in account and exact source Sheet. Report raw source errors without rewriting real records or pretending a fictional fixture is a mirror. If the strict source is incompatible, pause mirror creation with actionable row diagnostics.
- [ ] Create only the named private mirror-test Apps Script project, upload the reviewed modules, and run prepareHomecomingMirrorTest in the editor after any required account/permission handoff. Confirm the stored preparing guard and destination differ from production before deployment.
- [ ] At deployment, explain the specific mirror-only access being enabled and obtain required action-time confirmation for the anonymous bearer-link web app. Never grant public spreadsheet access or reuse Prom/form-sync projects.
- [ ] Run initializeHomecomingMirrorTest; read-only verify the persisted event is mirror-test, target is the mirror, mode is true, roster count/pairing matches the validated snapshot, and Check-ins has headers only. Do not leak keys in public proof artifacts.
- [ ] Add only the verified mirror /exec URL to assets/trusted-backends.json. Obtain specific publication approval before pushing reviewed frontend/assets to GitHub Pages. Verify the hosted version has the exact trusted registry, local ZXing, candidate confirmation, private-event autoload, mirror labels and guest relationships; local tests alone do not satisfy this step.
- [ ] Give Eve her private mirror admin link in this chat, and display the helper-access QR through that admin view. Do not message Eve, helpers, or other chats without human authorization.
- [ ] On both physical iPhones: open the appropriate links, confirm Mirror Test and read-only mode, accept camera permission themselves, scan one printed ticket at a time, and verify exact numbers/associations. Test unknown ticket, rotation, lighting, photo fallback, continuous delay, permission denial, lock/resume and offline failure.
- [ ] To test a new duplicate admission and shared status, Eve deliberately switches only the mirror to practice check-ins after confirming the Mirror Test banner on both phones. Scan one ticket on phone A and rescan it on phone B: exactly one mirror entry, original timestamp, second result Already Scanned. Repeat simultaneous scans and student/guest independent check-ins. Production remains untouched.
- [ ] Record physical-phone results as user-observed evidence, not automated proof; compare production before/after read-only checks and report any limits. Restore mirror to read-only mode without clearing mirror attendance or changing production mode.

## Plan Review And Execution Choice

The product design is already approved. Review this implementation plan and its
fictional-name mirror assumption before code changes. Recommended execution:
Native in this session, followed by one fresh independent review of the frozen
candidate, because the six tasks share closely coupled authorization and ledger
interfaces. Subagent-driven execution is an alternative if task-level independent
review is preferred. Do not infer approval of this unwritten-before-now plan from
earlier design approval.

## Reference Checks

- RichText grid API: https://developers.google.com/apps-script/reference/spreadsheet/range#setRichTextValues(RichTextValue)
- Deployed URL/null behavior: https://developers.google.com/apps-script/reference/script/service#getUrl()
