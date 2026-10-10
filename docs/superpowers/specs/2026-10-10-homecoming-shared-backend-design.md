# Homecoming 2026 Shared Backend

## Approved Mirror Import Amendment

Russ explicitly authorized `Build mirror with conflicts quarantined` after
reviewing the source conflicts. Printed tickets remain unchanged. Mirror-only
numeric student values 0-999 become three-character strings; explicit guest
ticket strings remain literal. Only safe assigned student/guest pairs enter the
fictional intake. A separate Quarantine sheet records blocked ticket strings,
generic reasons and source row numbers, without real names or student IDs.
Ambiguous numeric annotations and padded ticket text reserve conservative
printed-code candidates for blocking only, never admission aliases. All owners
of a conflicting ticket and their linked guests are quarantined. Unknown or
missing tickets remain excluded and visibly counted as quarantined records.
Both test modes refuse quarantined tickets. This amendment supersedes the
whole-source mirror import gate, not strict production projection validation.

Status: Design approved by Russ on 2026-10-10, including bidirectional guest
links. Implementation-plan review is the next gate. Russ additionally requested
an isolated mirror-test roster for two-iPhone testing; its provisioning and
isolation details are specified in the implementation plan. No production
attendance changes or live activation are authorized by this document itself.

## Approved Outcome

Russ approved modifying the backend so Eve's private admin link and every
helper's access QR use one centrally configured Homecoming roster. Eve must not
configure the app on her phone. Helpers open Scanner without Setup or sign-in.
Student tickets use Code 128 barcodes; the QR on Eve's phone is app access only.
Eve must see whether a student is bringing a guest, the guest's name/ticket,
and the associated student's name/ticket when viewing or scanning a guest.

Use the existing Ticket Checklist as the live source, leave intake unchanged,
and record admission in a separate Check-ins tab in the same spreadsheet.
This is a check-in integration, not an automatic eligibility decision system.

## Source And Current State

- Spreadsheet ID: `1hlWdxxzlP2Zbl9m4_MN49XBgBrL7YiG67ur2p2tEueU`.
- Source tab: `Ticket Checklist`; sheet ID: `1348645014`; headers on row 5.
- Exact headers: Gateway student name; Student ID; Student ticket #; Grade;
  Bringing guest?; Guest name; Guest form submitted?; Guest ID uploaded?;
  School email received?; Guest ticket #.
- Existing `projectCombinedIntake_` is a pure, strict student/guest projection.
  It is not a production reader or attendance writer.
- Existing shared-event code provides separate admin/helper bearer links,
  stored configuration, revision checks, and eight-second visible-page polling.
- The existing Homecoming Student Form Sync project populates intake. It had no
  deployments when inspected in Eve's account in the preceding turn. Preserve
  that project's source, triggers, and ownership; do not replace it with the API.
- Keep Prom deployments separate. Neither their URLs nor previous Prom settings
  are Homecoming configuration.

## Architecture And Boundaries

Create a dedicated Homecoming check-in Apps Script project using this repo's
backend, after implementation and separately approved live setup. One project
must be the sole automated writer of the Homecoming Check-ins ledger. Script
locks do not coordinate different Apps Script projects or manual Sheet edits.

An owner-only editor initializer will bind the deployment to the spreadsheet,
source tab, header row, event name `Homecoming 2026`, timezone
`America/New_York`, and ledger tab `Check-ins`. It will create distinct random
256-bit admin/helper keys and save configuration centrally. It is not a public
bootstrap API and is not callable by web requests. Deployment is needed to
obtain the real `/exec` URL; never substitute a fabricated URL.

The initializer is idempotent: rerunning it must retain the existing event,
keys, mode, and attendance. It must refuse unrelated existing configuration or
an incompatible Check-ins tab rather than overwrite either. Provisioning writes
only a new ledger's headers, never intake cells or attendance entries.

Homecoming selection is an owner-created, server-stored roster mode, not a
caller-controlled adapter flag. Keep declared `combined-intake-v1` requests
disabled, preserve unknown/conflicting-adapter refusals, and preserve generic
Students mode for other deployments. A Homecoming deployment refuses legacy,
unkeyed list/admit requests before accessing the spreadsheet. Helpers cannot
change setup, assign IDs, create sheets, or switch test mode.

The client may receive the read-only mode identifier for presentation. Never
let its requested Sheet URL, columns, source mode, event ID, or ledger location
override the server's binding. Eve can rename the dance and control test mode;
changing the source/ledger binding requires the owner, not an admin URL save.

## Live Roster Reader

Read computed raw Sheet values and pass them to the unchanged pure projection.
Also inspect identity-cell formatting/formulas for actionable diagnostics; do
not replace raw identities with display values or inferred zero padding.
The guest ticket formula may supply its computed string without being rewritten.

Student IDs and ticket IDs must remain literal strings. `083` is not `83`, and
`001B` is not `001`. Do not generate IDs, normalize punctuation/case, guess names,
or infer ticket padding from the photograph. Duplicate tickets across either
person type, malformed headers/identities, or incomplete guest records fail the
whole roster with a source-row diagnostic; do not silently omit people or
publish a partial roster. The strict projection's existing refusal semantics
remain unchanged. The operator must correct invalid source data separately.

Each student and declared guest with a complete name/ticket is a distinct
scan subject. Return only the name, ticket, person type, student guest flag,
linked student/guest name and ticket, and attendance needed by the door team.
Do not expose school emails, uploaded IDs,
grade, form-submission metadata, or source Student IDs to helpers. Internal
student identity is retained server-side for reconciliation.

Project results into the existing frontend response contract: `First Name`
contains the full name, `Last Name` is empty, `QR_ID` is the exact ticket,
`Status` and `Admitted At` come only from the ledger, and `Bringing Guest` is
Yes for a student with a guest. Add `personType` and a two-way relationship
containing `linkedPersonType`, `linkedName`, `linkedTicketId`, `linkedStatus`,
and `linkedAdmittedAt`. For a student, the link identifies their guest; for a
guest, it identifies their associated student. A student without a guest has
no relationship. Guest subjects are not themselves marked Bringing Guest.

Build both directions server-side from the strict projection's shared internal
`sourceStudentId` and person type. Never infer relationships from matching names,
ticket suffixes, scan order, or adjacent frontend rows. Preserve exact ticket
strings in both directions. The linked status and timestamp are read from the
same validated ledger snapshot as the scanned person's attendance. A missing,
contradictory, or ambiguous required association blocks the affected source
projection rather than returning an unassociated guest.

The relation is for human identification and coordination, not a new admission
rule: an associated student's check-in status does not automatically admit or
block their guest. Do not require simultaneous arrival or infer guest approval
from the host's attendance. Those policies require separate human direction.
Scanning a student does not check in their guest; the guest's ticket is separate.
Guest form/ID/email fields do not constitute automatic approval or admission
rules. Door-team human verification remains explicit.

## Attendance Ledger

Row-1 schema: Event ID; Person Type; Ticket ID (JSON); Source Student ID (JSON);
Subject Assignment SHA256; Status; Admitted At. The assignment fingerprint is
an implementation-plan refinement to protect against guest replacements under
the same host/ticket, not a new eligibility rule. Identity cells contain
JSON-encoded strings so Sheets
cannot treat a ticket as a number or formula; readers validate and decode them
back into exact strings. Never store names or raw access keys in the ledger.

Each record binds one event/ticket to its person type and source student ID.
Ledger validation refuses duplicate records, invalid identities, formulas,
unknown statuses, incomplete timestamps, and a previously recorded ticket now
assigned to a different identity. Compute the assignment fingerprint from the
exact person type, ticket, source student ID, full name, and paired person's
type/ticket/full name, omitting physical row number and admission state. Store
only the digest, not names. A valid historic record whose assignment changed
quarantines that current subject as Needs Review; it must neither inherit the
old admission nor reset it. Cosmetic corrections also require owner review,
because the source cannot distinguish them from replacement identities.
Identical names/attributes alone cannot establish that two guests are the same
person; the fingerprint protects detectable changes, not undetectable identity
substitution. Historical records for removed subjects are
retained; removing a source row must not reset attendance or allow ticket reuse.

Live admission acquires the shared script lock, then reauthorizes the key,
checks the current event revision and global test mode, and freshly reads intake
and ledger. Only one exact source match may proceed. No ledger entry means
not yet checked in; a matching Admitted entry returns alreadyAdmitted with its
original timestamp and performs no write. A Pending entry blocks retry and
requires human attendance review.

Sheets are not transactional. Write one complete Pending record, flush, and
verify exact readback with no formulas. Then change its Status to Admitted,
flush, and verify the final record before returning success. Any write/flush/
readback failure returns an explicit unconfirmed/uncertain admission, never
green. Keep any surviving Pending record rather than delete it or automatically
retry. If Admitted committed but the response was lost, a later scan returns
alreadyAdmitted without creating another entry. Operator reconciliation of
uncertain records is manual and outside this change; do not add a helper reset.

The ledger stores the timestamp produced by the server in the configured
timezone. Successful responses include the exact matched ticket, Admitted
status, and verified timestamp; the frontend must not synthesize success.

## Test Mode And Client Integration

Initialize Homecoming in test mode until separately approved live activation.
Mode changes are admin-only and serialized with admissions by the same lock.
A test request never creates a ledger or writes attendance. It returns current
lookup/duplicate status. The stored global mode controls every device, regardless
of a stale browser's requested mode. Retain the frontend's read-only test lookup
and fail-closed behavior when global configuration/roster refresh fails.

Preserve private admin and helper link separation and fresh-device autoload.
Show Student/Guest badges and attendee counts rather than labeling all subjects
students. Eve's dashboard and helpers' roster/scan results show the relationship
explicitly, not just a generic Guest badge:

- Student: Bringing guest Yes/No; if Yes, show guest name, exact guest ticket,
  and guest check-in status/time separately from the student's own attendance.
- Guest: clearly label Guest and Associated student; show the student's name,
  exact student ticket, and their independent check-in status/time.
- Scanning either ticket returns both the scanned subject and their linked
  person's current details, with no write to the linked person's attendance.
- In test mode, display the same relationship using the refreshed read-only
  roster. Clear prior relationship details on errors or unlinked student scans.
- Student-with-guest scan results keep the yellow guest reminder. Guest-ticket
  results also show a yellow Guest/Associated student reminder, while duplicate,
  unknown, and unconfirmed scans remain red. The scanned person's own verified
  admission status/time remain prominent; linked attendance is informational.

Disable random QR assignment for Homecoming in the UI and refuse it
server-side. Preserve Code 128/QR decoding and the one-second continuous-scan
cooldown. Helpers' visible dashboards refresh the shared roster every eight
seconds; this is polling, not instantaneous push.

## Verification And Release Gates

Use fictional fixtures only for local tests. Verify the unchanged pure
projection, generic admission, barcode, cooldown, private-link, and adapter
refusal suites. Add integration tests covering raw identity preservation,
student/guest independence, schema failures, ledger tampering/identity drift,
simultaneous duplicate scans, Pending records, lost responses, injected write/
flush/readback failures, unauthorized roles, stale revisions, global mode races,
idempotent owner initialization, and zero intake writes on every path. Verify
bidirectional association with duplicate names, reordered source rows, exact
leading-zero ticket values, independent student/guest attendance, and source
identity drift. Guest responses must identify the correct associated student
without exposing their internal Student ID or eligibility metadata.

A synthetic browser preview must demonstrate distinct Eve/helper links, no
helper Setup, automatic roster load, guest presentation, cross-device status
refresh, and no false green result after a failed admission. Local test counts
do not prove hosted Apps Script, GitHub Pages, or physical iPhone operation.

Separately authorize creation/deployment of the dedicated Google project,
ledger-header provisioning, bearer-link initialization, publication to GitHub
Pages, and distribution to helpers at the appropriate action points. Validate
the real source read-only and test on a physical iPhone before switching global
test mode off. Do not use actual students for write-capable smoke tests.

## References

- Google LockService: https://developers.google.com/apps-script/reference/lock/lock-service
- Google web apps and deployment: https://developers.google.com/apps-script/guides/web

## Next Gate

Review the implementation plan at
`docs/superpowers/plans/2026-10-10-homecoming-shared-backend.md` and select its
execution method before product edits. The design itself is already approved;
do not ask Russ to approve it again.
