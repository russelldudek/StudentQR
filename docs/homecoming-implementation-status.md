# Homecoming Implementation Evidence

## Local Source

Implemented on `codex/homecoming-mirror-backend` in the original project folder.
The earlier accepted scanner/private-event baseline was preserved in `ef07ed5`.
There was no GitHub push, Google deployment, private-link publication, production
activation, or production attendance write.

New backend modules supply exact bidirectional student/guest joins, strict
assignment-aware attendance validation, locked Pending-to-Admitted writes with
readback, mirror-only target guards and owner-only retry-safe preparation.
Missing/corrupt/erased binding or event properties fail closed in the dedicated
three-module mirror deployment. Legacy Students compatibility is limited to the
separate Code.gs-only deployment.

The frontend adds exact same-origin endpoint registry trust before bearer key
transmission, software camera/photo candidate confirmation, immutable ticket
mapping, separate student/guest statuses, and persistent Mirror Test labels.
The registry is intentionally empty until a real mirror endpoint is verified.

## Synthetic Runtime

`node --test --test-reporter=tap tests/scanner-*.test.cjs`: 300 passing tests at
the initial Task 5 checkpoint, up from the historical 255 baseline. Final counts
and independent review are recorded separately after any review fixes.

The local-only `scripts/homecoming-preview.cjs` serves the real frontend and all
three actual backend modules through fictional Sheet/property/lock fixtures.
Its fetch harness rejects external provider calls; all attendance is in memory.
CUA browser checks verified:

- Fresh helper link loads the fictional mirror roster and hides Setup.
- Student and Guest names/tickets/statuses join independently.
- Admin mode changes propagate; the Mirror Test label persists in practice mode.
- Ticket 084 is admitted once; a second tab sees Already Scanned with the same timestamp.
- Guest ticket 083B admission leaves Student 083 Not checked in.
- The supplied multi-ticket photo decodes candidate 083 via the real local ZXing library and requires selection before any admission. This does not prove exhaustive multiple-barcode enumeration.
- Preview mode was restored to read-only after practice, without clearing its ledger.

No physical iPhone camera or permission check is established by these results.
The synthetic preview excludes CDN scripts, so access-QR generation was not
claimed as rendered proof.

## Real Source Checkpoint

The school Google Drive connector confirmed the source spreadsheet ID
`1hlWdxxzlP2Zbl9m4_MN49XBgBrL7YiG67ur2p2tEueU`, `Ticket Checklist`, gid
1348645014, with frozen header row 5 and the expected ten-column headers.
Read-only effective-value inspection of rows 6-12 found **numeric** student
tickets (examples 47, 170, 28). Their visible strings are 47, 170, 28 rather than
fixed three-character text. Student IDs in that sample are strings.

Russ subsequently authorized adapting the backend to the already printed
tickets. The mirror-only importer maps numeric student tickets 0-999 to
three-character strings while preserving existing literal guest strings, rather
than assuming their suffix format. The strict production projection is unchanged.

A complete bounded read of A1:AB1000 returned 541 rows. Inspection found 29
duplicate student ticket assignments belonging to different student identities,
ambiguous ticket text at C32, 69 blank student tickets, nonstandard guest
declarations and a guest-ticket formula error at J427. Three assigned rows lack
string Student IDs. Russ explicitly chose `Build mirror with conflicts quarantined`.
The mirror importer now validates each assigned row and all ticket/identity
collisions, anonymizes safe rows, and records conflicting/incomplete pairs in
the private Quarantine tab. Blocked tickets cannot be admitted in either mode;
helper responses expose only generic blocked rows and counts, not source row
numbers or identities. The strict pure projection remains unchanged.

A fresh bounded source read and ephemeral anonymized validation through the
actual module produced **302 safe Student tickets, 44 linked Guest tickets,
233 quarantined source records and 144 blocked printed-ticket identifiers**.
The private quarantine has 146 diagnostic entries, including numeric annotations
and the aggregate missing-ticket entry; only validated numeric ticket IDs are
published to helpers. Misplaced personal text and computed ticket errors are
never mirrored or exposed as identities. The
anonymized validation preserved raw ticket/declaration/identity-conflict types,
without persisting real names or IDs. No source formatting, values, formulas or
attendance were changed. No real mirror workbook has yet been created.

Provision the private mirror through the owner-only preparation function, then
obtain the specific Google access/deployment/publication approvals in the phone
test runbook. Do not substitute the synthetic preview for that real mirror.

## Final Local Gate

The current full scanner suite passes **315/315** tests. Independent review's
five original findings and two quarantine findings received regression tests
observed failing before their fixes and passing afterward. The quarantine
checks cover duplicate pairs, ambiguous/padded codes, spreadsheet ticket errors,
non-ticket personal text, missing/malformed quarantine and blocking in both
modes. `git diff --check` passes. Browser checks additionally confirmed visible
quarantine notices and rejection in both modes, separate guest admission and
same-timestamp duplicate rejection across tabs. Physical iPhone validation and
hosted/provider proof remain outstanding.
