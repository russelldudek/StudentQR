# Homecoming Live Check-In And Admin Corrections

Status: The live behavior was approved by Russ on 2026-10-10, with the added
requirement that Eve fix conflicting/incomplete records in her admin app and
publish those corrections globally. Russ approved this written specification
and requested its implementation plan on 2026-10-10. It is not deployed source.

## Intent And Scope

Configure Homecoming once. Eve's private URL opens the admin dashboard; helpers
scan Eve's access QR to open Scanner with the same current roster and no Setup,
password or sign-in. Student tickets are barcodes, not app-access QR codes.

Automatically check in one unambiguous scanned ticket, show the person's name,
linked guest or host, status and server timestamp, and reject duplicate entry.
Helpers can undo only their own latest check-in. Eve can reset one ticket or
all tickets after the exact warning `ARE YOU SURE!?`.

Eve also needs a Needs Attention view showing conflicting/incomplete records,
their ticket assignments and actionable reasons. She can correct them in the
app, without opening a Google Sheet, and publish to every scanner. An unresolved
record remains blocked. Guest/host attendance is always independent.

This extends the approved shared-backend design. The accepted mirror source,
deployment, workbook, keys and attendance remain separate historical evidence.
Prior mirror acceptance does not certify the new live behavior.

## Production Binding And Source Protection

Create a separate school-owned live API project with an immutable production
deployment identity. It reads the existing Homecoming spreadsheet
`1hlWdxxzlP2Zbl9m4_MN49XBgBrL7YiG67ur2p2tEueU`, tab `Ticket Checklist`,
header row 5. Do not modify the form-sync project, its triggers, Prom projects,
the mirror project or the original intake values/formulas/formatting.

Use new, explicitly bound state tabs in the same private production workbook:
`Homecoming Check-ins`, `Homecoming Audit`, and `Homecoming Corrections`.
Owner initialization must refuse an incompatible existing tab or unrelated
binding, retain existing state on rerun, and never clear attendance. It must
verify the exact source and state targets before any state write.

Missing/corrupt/erased configuration must fail before Sheet access and again
under the mutation lock. No public bootstrap, legacy fallback, caller-selected
target, ticket generation, or public ownership recovery is allowed. The mirror
must remain sealed to its own non-production target.

The published frontend trusts only locally registered, owner-verified `/exec`
URLs before sending bearer credentials. Production gets new event credentials;
mirror URLs are not silently repointed to real attendance.

## Canonical Roster And Exact Printed Tickets

At each server read, combine current raw intake with committed, current admin
corrections, then validate the effective roster. This effective roster is the
canonical app roster, not a modified copy of the intake tab.

Use the printed-ticket adaptation already exercised by the mirror: numeric
student tickets 0-999 map to three-digit strings; existing string tickets keep
their exact leading zeros and characters. Guest ticket strings remain literal;
never infer a guest suffix, name association or zero-padding rule. Unsupported
numeric values and ambiguous annotations remain blocked until explicitly
corrected. Decoder output is compared to the resulting exact string, never to
a first name, substring, case-folded alias or integer.

Validate every nonempty source record and all ticket/identity owners across
both person types. Quarantine every affected record and associated guest when
assignments conflict or required data is incomplete. Preserve conservative
blocked-code reservations for ambiguous/padded source tickets. Do not silently
admit one owner of a conflict or make up a missing ticket/identity.

Build guest/host links from the validated shared internal student identity,
never names, adjacent rows or ticket suffixes. Check-in is not an eligibility
decision: grade, uploaded ID, forms and email flags do not automatically approve
or deny entry and are not exposed to helpers.

## Eve's Needs Attention Editor

Only an authenticated admin can retrieve private diagnostic records or submit
corrections. Helpers see generic blocked-ticket results and aggregate counts,
not source IDs, row numbers, private diagnostics or correction history.

Eve sees student/guest names where available, existing ticket strings, the
affected field, and reasons such as duplicate ticket, missing ticket/name,
inconsistent guest declaration, missing identity or computed ticket error.
Conflict groups show all affected owners rather than arbitrarily selecting one.

The correction form supports student name, student ticket, Bringing Guest,
guest name, guest ticket and the internal student identifier when needed to
resolve an identity error. That identifier is admin-only. It does not expose or
edit school emails, grade, form evidence, uploaded documents or eligibility.
Existing literal ticket text is visible; no random replacement is generated.

Each edit is bound to the exact source record, source row location, base-value
fingerprint and current correction version returned to Eve. Source movement or
change invalidates that edit instead of applying it to another person. Unknown
record IDs, extra fields, invalid types and stale versions are refused.

Before publishing, show the before/after assignments and validate the edited
record or conflict group against the entire effective roster, including reserved
blocked codes. Allow unrelated quarantined records to remain, but do not publish
a corrected assignment that still conflicts. Publishing a conflict-group edit
must be atomic from the reader's perspective; partial saves remain blocked.

Persist an audit-backed correction operation with idempotency and verified
readback under the same lock as admission. Do not put user-supplied strings into
executable formulas. A committed correction becomes authoritative for all
devices; an uncertain operation is not reported as published.

If the intake later changes beneath a correction, surface Needs Attention and
block affected assignments until Eve explicitly reviews the new base. Never
silently erase the correction, revert to the intake or inherit attendance for a
replacement person. Already recorded assignments require explicit attendance
reconciliation; editing a name/association does not itself reset admission.

## Auto-Check-In And Name Presentation

All supported camera paths, including iPhone software decoding, automatically
submit one valid, unambiguous ticket without a Confirm button. Manual fallback
still has a submit button. Keep the one-second successive-scan cooldown and
the optional continuous-camera mode.

Use a clearly marked single-ticket scan region. Multiple distinct decoded
tickets or unresolved ambiguity produce a neutral/red instruction to present
one ticket, with no attendance request. A first-result-only decoder is not
proof that a multi-ticket frame/photo is unambiguous: the chosen decoder/guard
must demonstrate multi-ticket refusal with the supplied printed-ticket sample.
If uniqueness cannot be established, fail closed rather than select the first
result or quietly reintroduce a confirmation tap. Preserve Code 128 checksum
validation and exact decoded leading zeros.

Before mutation, revalidate configuration, mode, exact ticket and assignment
fingerprint on the server under the lock. Source/correction changes after a
device loaded the roster must never admit a different person under a stale name.

Show the scanned Student or Guest name prominently with their own verified
status/time. For a student bringing a guest, show that guest's name, ticket and
independent status/time. For a guest, show Associated Student with the host's
name, ticket and independent status/time. Scanning either does not check in the
other. Clear stale relationship information on errors and unrelated scans.

Keep green for a verified admitted student without a guest, yellow for an
admitted student-with-guest or guest ticket, and red for duplicate, unknown,
quarantined or unconfirmed results. Linked attendance is informational only.

## Receipt-Bound Helper Undo

The shared helper bearer establishes the helper role, not a person's identity.
A random per-device actor secret and an admission-specific undo capability bind
undo to the initiating browser/device. Store only hashes server-side. Never
return either secret, another device's receipt or its undo capability in list,
getEvent, diagnostics, audit views or ordinary duplicate responses.

Issue/retain an undo receipt only for a newly committed admission. Bind it to
event, actor, operation/admission ID, exact ticket, assignment fingerprint and
current attendance generation. The backend authorizes undo only when this is
the actor's latest successful new admission and that same admission is still
active. Caller-supplied actor/ticket fields alone never grant undo authority.

A duplicate scan does not acquire ownership or a new undo capability. A newer
successful check-in invalidates the older helper undo; undoing the latest does
not make older receipts eligible again. Reset or re-admission invalidates stale
receipts. Another helper cannot undo that admission with the shared link alone.

Show Undo Last Check-In on the initiating device only while its receipt is
eligible. Label the affected name/ticket. On undo success show Not Checked In
and clear the old admitted timestamp; retain the original admission in history.
Undo permits a later valid scan but never changes the linked person's state.
Lost local credentials cannot be recovered through a helper role; ask Eve.

## Eve-Only Resets And Recoverable History

Eve can reset a ticket from its admin detail and reset all tickets from a
distinct admin-only control. Preview the exact ticket or current affected count
and show `ARE YOU SURE!?` prominently before submission, with Cancel as the safe
default. The backend requires admin authorization and a fresh scope-bound
confirmation; hiding buttons is not the permission check.

Use idempotent, audited logical revocations, not row deletion or ledger clearing.
Preserve original admissions, timestamps, actor hashes and each undo/reset
operation. An all-ticket reset applies to the confirmed attendance snapshot;
concurrent changes invalidate that preview and require fresh confirmation.
It must not silently reset a check-in that happened after Eve's preview.

Admissions, corrections, helper undo, admin resets and mode changes share one
script lock and fresh authorization/revision checks. Persist a Pending
operation, flush/verify it, then commit and verify the resulting projection.
Readers apply only verified committed state. Pending or uncertain mutations
block affected tickets; never show success, remove evidence or blindly retry
with a new operation. A pending all-ticket reset blocks admissions globally
until the original operation is reconciled. Lost responses can be reconciled
idempotently using their existing operation ID, not by inventing a second reset.

Resetting does not clear quarantine, approve eligibility, undo a correction,
erase assignment history or transfer a ticket to a new person. For uncertain or
changed-assignment records, Eve's view must show the issue and require explicit
record-level review before release; Reset All cannot bypass that safeguard.

Eve-only means possession of the private admin credential, not verified human
identity without sign-in. Do not include that credential in helpers' access QR.
An admin link given to another person grants admin authority to that holder.

## Global Updates And Mode

Helpers still have no setup. Refresh the canonical effective roster on load,
focus/return to the app, and every eight seconds while a roster view is visible.
Successful corrections/undo/resets update the initiating view immediately.
Other visible devices update at their next refresh; do not describe polling as
instantaneous push. Every admission independently checks current server state,
so a stale screen cannot bypass a correction, reset or duplicate check.

Central mode remains admin-only. Read-only test mode never writes attendance or
issues a usable undo receipt. The mirror remains clearly labeled practice.
Production displays LIVE only after its exact target, role restrictions,
persisted mode, source version and served frontend have been verified.

## Review, Tests And Release

Implement only after written-spec review and the written implementation-plan
gate. Preserve legacy Students and accepted mirror behavior; no mirror source
or provider acceptance is reused to certify live changes.

Use fictional fixtures to test exact leading zeros/checksums, software/native
single-ticket auto-submit and multi-ticket refusal, guest/host names and
independent admission, fresh-device autoload, stale corrections, conflicting
owners, invalid edits, row movement and identity/guest replacement races.

Test helper undo theft/replay, latest-operation enforcement, duplicate receipt
refusal, new-admission/reset races, admin single/all reset, stale previews,
cancelled warnings, missing/erased configuration, unauthorized direct API calls,
mode races, lost responses and injected write/flush/readback failures. Verify
all mutation paths make zero original-intake or mirror writes and retain history.

Freeze the new source/version for an independent review and fresh regression
suite. Verify actual saved/deployed modules, private real target/state tabs,
persisted roles/mode, corrections and quarantine behavior, then exact served
GitHub Pages files. Never publish real roster data or private keys in Git.

Confirm new real-data access/security exposure at the provider action point:
Eve's school account executes a bearer-protected API for authorized door teams;
helpers receive names, tickets, associations and attendance, not internal IDs
or eligibility metadata. The public Sheet remains private. Owner initialization
and deployment must not themselves admit or reset students.

Keep physical-phone evidence separate. Russ reported that the scanner works;
that is not detailed duplicate, guest, cross-device or multi-ticket proof.
Validate new write/undo/reset flows using isolated fixtures, not real attendees
as smoke-test data, and retain a clear production-versus-mirror handoff.

## Next Gate

Review the implementation plan at
`docs/superpowers/plans/2026-10-10-homecoming-live-admin.md` before product edits.
The written specification is approved; preserve the previously selected native
execution method. No production activation is claimed by this document.
