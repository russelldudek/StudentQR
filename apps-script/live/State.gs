var LIVE_STATE_HEADERS = Object.freeze({
  attendance: ['Admission ID','Operation ID','Event ID','Person Type','Ticket ID (JSON)','Source Student ID (JSON)','Assignment SHA256','Actor Hash','Undo SHA256','Admitted At'],
  audit: ['Operation ID','Kind','Actor Hash','Intent JSON','Intent SHA256','Created At','State'],
  corrections: ['Correction ID','Operation ID','Source Row','Base SHA256','Previous Correction ID','Fields JSON']
});
function liveTimestamp_(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s) && new Date(s).toISOString() === s; }
function liveParseJson_(s) {
  var value; try { value = JSON.parse(s); } catch (e) { liveError_('Corrupt journal JSON.'); }
  if (liveJson_(value) !== s) liveError_('Noncanonical journal JSON.'); return value;
}
function liveGridRows_(grid, headers) {
  if (!Array.isArray(grid) || !grid.length || liveJson_(grid[0]) !== liveJson_(headers)) liveError_('State schema/header mismatch.');
  return grid.slice(1).map(function(row) {
    if (!Array.isArray(row) || row.length !== headers.length || row.some(function(v) { return typeof v !== 'string'; })) liveError_('Invalid journal row.');
    return row;
  });
}
function liveValidateIntentShape_(intent,eventId) {
  var kind = intent.kind, a = intent.admissions, c = intent.corrections, r = intent.revoke, t = intent.tickets;
  if (new Set(t).size !== t.length || new Set(r).size !== r.length || r.some(function(id) { return !liveId_(id); })) liveError_('Invalid operation intent identities.');
  var isAdmit = kind === 'Admit', isCorrect = kind === 'Correct', isReset = kind === 'ResetTicket' || kind === 'ResetAll', isUndo = kind === 'Undo';
  if ((isAdmit ? a.length !== 1 || t.length !== 1 : a.length !== 0) ||
      (isCorrect ? c.length < 1 || c.length > 100 : c.length !== 0) ||
      (isReset || isUndo ? !r.length || t.length !== r.length : r.length !== 0) ||
      ((isUndo || kind === 'ResetTicket') && (t.length !== 1 || r.length !== 1)) ||
      (['Mode','Rename'].indexOf(kind) >= 0 && t.length !== 0) ||
      (kind === 'Mode' ? typeof intent.testMode !== 'boolean' : intent.testMode !== undefined) ||
      (kind === 'Rename' ? typeof intent.eventName !== 'string' || !intent.eventName.trim() || intent.eventName.length > 120 || /[\u0000-\u001f]/.test(intent.eventName) : intent.eventName !== undefined) ||
      (intent.reviewedAssignmentHash !== undefined && (kind !== 'ResetTicket' || !liveHex_(intent.reviewedAssignmentHash)))) liveError_('Invalid operation kind/intent shape.');
  a.forEach(function(p) {
    if (!Array.isArray(p) || p.length !== 10 || p.some(function(v) { return typeof v !== 'string'; }) ||
        !liveId_(p[0]) || p[1] !== intent.operationId || p[2] !== eventId || ['Student','Guest'].indexOf(p[3]) < 0 ||
        !liveHex_(p[6]) || p[7] !== intent.actorHash || !liveHex_(p[8]) || !liveTimestamp_(p[9]) || liveParseJson_(p[4]) !== t[0]) liveError_('Invalid admission intent payload.');
    combinedLiteralIdentity_(liveParseJson_(p[4]),'Ticket'); combinedLiteralIdentity_(liveParseJson_(p[5]),'Student ID');
  });
  var ids = new Set(), sourceRows = new Set();
  c.forEach(function(p) {
    if (!Array.isArray(p) || p.length !== 6 || p.some(function(v) { return typeof v !== 'string'; }) ||
        !liveId_(p[0]) || ids.has(p[0]) || p[1] !== intent.operationId || !/^[1-9]\d*$/.test(p[2]) || Number(p[2]) < 6 || !Number.isSafeInteger(Number(p[2])) || sourceRows.has(p[2]) ||
        !liveHex_(p[3]) || (p[4] && !liveId_(p[4]))) liveError_('Invalid correction intent payload.');
    ids.add(p[0]); sourceRows.add(p[2]); liveCorrectionFields_(liveParseJson_(p[5]));
  });
}
function parseLiveState_(grids, eventId) {
  var admissions = liveGridRows_(grids.attendance,LIVE_STATE_HEADERS.attendance), corrections = liveGridRows_(grids.corrections,LIVE_STATE_HEADERS.corrections);
  var audit = liveGridRows_(grids.audit,LIVE_STATE_HEADERS.audit), seen = Object.create(null), payloadIds = Object.create(null);
  var state = {operations:[],active:[],pending:[],corrections:[],latestActors:Object.create(null),sequence:0,testMode:null,eventName:null};
  admissions.forEach(function(r) {
    if (!liveId_(r[0]) || payloadIds[r[0]] || !liveId_(r[1]) || r[2] !== eventId || ['Student','Guest'].indexOf(r[3]) < 0 ||
        !liveHex_(r[6]) || !liveHex_(r[7]) || !liveHex_(r[8]) || !liveTimestamp_(r[9])) liveError_('Corrupt admission payload.');
    combinedLiteralIdentity_(liveParseJson_(r[4]),'Ticket'); combinedLiteralIdentity_(liveParseJson_(r[5]),'Student ID'); payloadIds[r[0]] = true;
  });
  corrections.forEach(function(r) {
    if (!liveId_(r[0]) || payloadIds[r[0]] || !liveId_(r[1]) || !/^[1-9]\d*$/.test(r[2]) || Number(r[2]) < 6 || !Number.isSafeInteger(Number(r[2])) ||
        !liveHex_(r[3]) || (r[4] && !liveId_(r[4]))) liveError_('Corrupt correction payload.');
    liveCorrectionFields_(liveParseJson_(r[5])); payloadIds[r[0]] = true;
  });
  audit.forEach(function(r,index) {
    if (!liveId_(r[0]) || seen[r[0]] || ['Admit','Correct','Undo','ResetTicket','ResetAll','Mode','Rename'].indexOf(r[1]) < 0 ||
        !liveHex_(r[2]) || !liveHex_(r[4]) || hashLive_(r[3]) !== r[4] || !liveTimestamp_(r[5]) || ['Pending','Committed','Cancelled'].indexOf(r[6]) < 0) liveError_('Corrupt operation journal.');
    seen[r[0]] = true;
    var intent = liveParseJson_(r[3]);
    liveExactKeys_(intent,['operationId','kind','actorHash','requestHash','tickets','admissions','corrections','revoke','testMode','eventName','reviewedAssignmentHash']);
    if (intent.operationId !== r[0] || intent.kind !== r[1] || intent.actorHash !== r[2] || !liveHex_(intent.requestHash) ||
        !Array.isArray(intent.tickets) || intent.tickets.some(function(t) { return typeof t !== 'string' || !t; }) ||
        !Array.isArray(intent.admissions) || !Array.isArray(intent.corrections) || !Array.isArray(intent.revoke)) liveError_('Invalid operation intent.');
    liveValidateIntentShape_(intent,eventId);
    var op = {operationId:r[0],kind:r[1],actorHash:r[2],intent:intent,intentHash:r[4],state:r[6],row:index+2,createdAt:r[5]};
    state.operations.push(op);
    if (op.state === 'Pending') { state.pending.push(op); return; }
    if (op.state !== 'Committed') return;
    intent.admissions.forEach(function(payload) {
      if (payload[1] !== op.operationId || !admissions.some(function(a) { return liveJson_(a) === liveJson_(payload); })) liveError_('Committed admission payload missing or changed.');
      var ticket = liveParseJson_(payload[4]);
      if (state.active.some(function(a) { return a.ticketId === ticket; })) liveError_('Conflicting committed attendance.');
      var admission = {admissionId:payload[0],operationId:payload[1],personType:payload[3],ticketId:ticket,studentId:liveParseJson_(payload[5]),assignmentHash:payload[6],actorHash:payload[7],undoHash:payload[8],admittedAt:payload[9]};
      state.active.push(admission); state.latestActors[admission.actorHash] = admission;
    });
    intent.corrections.forEach(function(payload) {
      if (payload[1] !== op.operationId || !corrections.some(function(c) { return liveJson_(c) === liveJson_(payload); })) liveError_('Committed correction payload missing or changed.');
      var previous = state.corrections.find(function(c) { return c.sourceRow === Number(payload[2]); });
      if ((previous ? previous.correctionId : '') !== payload[4]) liveError_('Correction chain mismatch.');
      state.corrections = state.corrections.filter(function(c) { return c.sourceRow !== Number(payload[2]); });
      state.corrections.push({correctionId:payload[0],sourceRow:Number(payload[2]),baseHash:payload[3],fields:liveParseJson_(payload[5]),reservedTickets:intent.tickets.slice()});
    });
    intent.revoke.forEach(function(id) {
      if (!liveId_(id) || !state.active.some(function(a) { return a.admissionId === id; })) liveError_('Invalid admission revocation.');
      state.active = state.active.filter(function(a) { return a.admissionId !== id; });
    });
    if (op.kind === 'Mode') { if (typeof intent.testMode !== 'boolean') liveError_('Invalid mode.'); state.testMode = intent.testMode; }
    if (op.kind === 'Rename') { if (typeof intent.eventName !== 'string' || !intent.eventName.trim()) liveError_('Invalid event name.'); state.eventName = intent.eventName; }
    if (['Correct','Mode','Rename'].indexOf(op.kind) >= 0) state.sequence = index+1;
  });
  [['admissions',admissions],['corrections',corrections]].forEach(function(pair) {
    pair[1].forEach(function(payload) {
      var op = state.operations.find(function(o) { return o.operationId === payload[1]; });
      if (!op || !op.intent[pair[0]].some(function(p) { return liveJson_(p) === liveJson_(payload); })) liveError_('Orphan payload / missing or changed journal evidence.');
    });
  });
  state.attendanceRevision = hashLive_(liveJson_(grids)); return state;
}
function readLiveContext_(binding,event) {
  assertLiveBinding_(binding,event);
  var book = SpreadsheetApp.openById(binding.spreadsheetId); if (book.getId() !== binding.spreadsheetId) liveError_('Wrong workbook.');
  var grids = {}, sheets = {};
  [['attendance',binding.attendanceSheetName],['audit',binding.auditSheetName],['corrections',binding.correctionsSheetName]].forEach(function(pair) {
    var sheet = book.getSheetByName(pair[1]); if (!sheet) liveError_('Missing state sheet.'); var range = sheet.getDataRange();
    if (range.getFormulas().some(function(r) { return r.some(function(v) { return v !== ''; }); })) liveError_('State formulas refused.');
    grids[pair[0]] = range.getValues(); sheets[pair[0]] = sheet;
  });
  var sourceSheet = book.getSheetByName(binding.sourceSheetName); if (!sourceSheet) liveError_('Missing source sheet.');
  var source = sourceSheet.getDataRange().getValues(), state = parseLiveState_(grids,event.eventId), roster = buildLiveRoster_(source,state);
  var config = JSON.parse(liveJson_(event.config));
  if (state.testMode !== null) config.testMode = state.testMode;
  if (state.eventName !== null) config.eventName = state.eventName;
  return {binding:binding,event:event,book:book,sheets:sheets,grids:grids,source:source,state:state,roster:roster,config:config,
    revision:event.authRevision+state.sequence,rosterRevision:roster.rosterRevision,attendanceRevision:state.attendanceRevision};
}
