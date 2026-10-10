function liveCanonical_(value) {
  if (Array.isArray(value)) return value.map(liveCanonical_);
  if (value && typeof value === 'object') { var result = {}; Object.keys(value).sort().forEach(function(k) { result[k] = liveCanonical_(value[k]); }); return result; }
  return value;
}
function liveRequestHash_(request) {
  var safe = {}; Object.keys(request).forEach(function(k) { if (['token','revision'].indexOf(k) < 0) safe[k] = request[k]; });
  return hashLive_(liveJson_(liveCanonical_(safe)));
}
function liveMutationActor_(context,request) {
  if (['admit','undoLatest'].indexOf(request.action) >= 0) {
    if (!liveHex_(request.actorSecret) || !liveHex_(request.undoSecret)) liveError_('Device operation proof required.');
    return hashLive_(request.actorSecret);
  }
  return context.event.adminHash;
}
function liveIntent_(context,request,kind,tickets) {
  if (!liveId_(request.operationId)) liveError_('Invalid operation ID.');
  return {operationId:request.operationId,kind:kind,actorHash:liveMutationActor_(context,request),requestHash:liveRequestHash_(request),tickets:tickets || [],admissions:[],corrections:[],revoke:[]};
}
function liveGuardWrite_(context) {
  var binding = readLiveBinding_(), event = readLiveEvent_(); assertLiveBinding_(binding,event);
  if (liveJson_(binding) !== liveJson_(context.binding) || event.adminHash !== context.event.adminHash || event.helperHash !== context.event.helperHash || event.authRevision !== context.event.authRevision) liveError_('Authorization/target changed before write.');
  if (context.request) authorizeLive_(event,context.request);
}
function liveWriteRows_(context,key,rows) {
  if (!rows.length) return;
  liveGuardWrite_(context); var sheet = context.sheets[key], start = sheet.getLastRow()+1;
  var range = sheet.getRange(start,1,rows.length,rows[0].length); range.setNumberFormat('@');
  range.setRichTextValues(rows.map(function(row) { return row.map(function(v) { return SpreadsheetApp.newRichTextValue().setText(v).build(); }); }));
  SpreadsheetApp.flush();
  if (liveJson_(range.getValues()) !== liveJson_(rows) || range.getFormulas().some(function(r) { return r.some(function(v) { return v !== ''; }); })) liveError_('Uncertain staged payload; Eve review required.');
}
function liveFinishOperation_(context,operationId,status) {
  var current = readLiveContext_(context.binding,context.event), op = current.state.operations.find(function(o) { return o.operationId === operationId; });
  if (!op || op.state !== 'Pending') liveError_('Operation is not Pending.');
  if (current.rosterRevision !== context.rosterRevision) liveError_('Source/correction changed during operation; pending review required.');
  // Validate replay with a synthetic status before allowing the irreversible commit marker.
  var candidate = JSON.parse(liveJson_(current.grids)); candidate.audit[op.row-1][6] = status;
  parseLiveState_(candidate,context.event.eventId);
  liveGuardWrite_(context); current.sheets.audit.getRange(op.row,7).setValue(status); SpreadsheetApp.flush();
  var finalContext = readLiveContext_(context.binding,context.event), finalOp = finalContext.state.operations.find(function(o) { return o.operationId === operationId; });
  if (!finalOp || finalOp.state !== status) liveError_('Uncertain operation readback; reconcile original ID.');
  return finalContext;
}
function commitLiveOperation_(context,intent) {
  if (context.state.operations.some(function(o) { return o.operationId === intent.operationId; })) liveError_('Existing operation must be reconciled.');
  var timestamp = new Date().toISOString(), json = liveJson_(intent);
  liveWriteRows_(context,'audit',[[intent.operationId,intent.kind,intent.actorHash,json,hashLive_(json),timestamp,'Pending']]);
  liveWriteRows_(context,'attendance',intent.admissions); liveWriteRows_(context,'corrections',intent.corrections);
  return liveFinishOperation_(context,intent.operationId,'Committed');
}
function liveCanUndo_(context,admission) {
  var latest = context.state.latestActors[admission.actorHash];
  return !!latest && latest.admissionId === admission.admissionId && context.state.active.some(function(a) { return a.admissionId === admission.admissionId; }) &&
    context.roster.subjects.some(function(s) { return s.ticketId === admission.ticketId && s.assignmentHash === admission.assignmentHash; }) && !context.roster.globallyPending;
}
function liveOwnedAdmission_(context,request,op) {
  var payload = op.intent.admissions[0];
  if (!payload && op.intent.revoke.length === 1) {
    context.state.operations.some(function(o) { payload = o.intent.admissions.find(function(p) { return p[0] === op.intent.revoke[0]; }); return !!payload; });
  }
  if (!payload || !liveHex_(request.actorSecret) || !liveHex_(request.undoSecret) || hashLive_(request.actorSecret) !== payload[7] || hashLive_(request.undoSecret) !== payload[8] || op.actorHash !== payload[7]) liveError_('Operation ownership proof refused.');
  return payload;
}
function liveOperationResult_(context,op,request) {
  var result = {operationId:op.operationId,state:op.state,revision:context.revision,rosterRevision:context.rosterRevision,attendanceRevision:context.attendanceRevision,canUndo:false};
  if (op.state !== 'Committed') return result;
  if (op.intent.tickets.length) { var row = context.roster.rows.find(function(r) { return r.QR_ID === op.intent.tickets[0]; }); if (row) result.currentRow = row; }
  var payload = op.intent.admissions[0];
  if (payload) {
    var active = context.state.active.find(function(a) { return a.admissionId === payload[0]; });
    result.canUndo = !!active && liveCanUndo_(context,active);
    if (request && liveHex_(request.actorSecret) && liveHex_(request.undoSecret) && hashLive_(request.actorSecret) === payload[7] && hashLive_(request.undoSecret) === payload[8] && result.canUndo) {
      result.receipt = {admissionId:payload[0],operationId:op.operationId,ticketId:liveParseJson_(payload[4]),assignmentHash:payload[6]};
    }
  }
  return result;
}
function getLiveOperation_(context,request) {
  var op = context.state.operations.find(function(o) { return o.operationId === request.operationId; });
  if (!op) return {operationId:request.operationId,state:'NotFound',canUndo:false};
  if (context.role !== 'admin') liveOwnedAdmission_(context,request,op);
  return liveOperationResult_(context,op,request);
}
function liveReplayRequest_(context,request) {
  var op = context.state.operations.find(function(o) { return o.operationId === request.operationId; }); if (!op) return null;
  if (op.intent.requestHash !== liveRequestHash_(request) || op.actorHash !== liveMutationActor_(context,request)) liveError_('Operation ID reused with a different intent/actor.');
  var result = getLiveOperation_(context,request);
  if (result.state !== 'Committed') liveError_('Existing operation '+result.state+'; explicit Eve review required.');
  if (result.currentRow) result.row = result.currentRow; return result;
}
function liveMutationFresh_(context,request) {
  if (request.revision !== context.revision) liveError_('Stale configuration revision; refresh.');
  if (context.roster.globallyPending) liveError_('Global Pending operation requires Eve review.');
}
function admitLiveTicket_(context,request) {
  combinedLiteralIdentity_(request.qrValue,'Ticket');
  if (!liveHex_(request.expectedAssignmentHash) || !liveHex_(request.expectedRosterRevision)) liveError_('Fresh assignment/roster proof required.');
  var intent = liveIntent_(context,request,'Admit',[request.qrValue]);
  var row = context.roster.rows.find(function(r) { return r.QR_ID === request.qrValue; });
  if (context.roster.blockedTickets.indexOf(request.qrValue) >= 0) liveError_('Ticket needs Eve review; no admission.');
  var subject = context.roster.subjects.find(function(s) { return s.ticketId === request.qrValue; });
  if (!subject || !row) liveError_('Ticket not on list.');
  if (context.rosterRevision !== request.expectedRosterRevision || subject.assignmentHash !== request.expectedAssignmentHash) liveError_('Stale assignment/roster changed; refresh.');
  if (row.Status === 'Admitted') return {alreadyAdmitted:true,row:row,revision:context.revision,rosterRevision:context.rosterRevision,attendanceRevision:context.attendanceRevision};
  if (context.config.testMode) return {testMode:true,row:row,revision:context.revision,rosterRevision:context.rosterRevision,attendanceRevision:context.attendanceRevision};
  var timestamp = new Date().toISOString();
  intent.admissions = [[Utilities.getUuid(),request.operationId,context.event.eventId,subject.personType,liveJson_(subject.ticketId),liveJson_(subject.sourceStudentId),subject.assignmentHash,intent.actorHash,hashLive_(request.undoSecret),timestamp]];
  var finalContext = commitLiveOperation_(context,intent), op = finalContext.state.operations.find(function(o) { return o.operationId === request.operationId; });
  var result = liveOperationResult_(finalContext,op,request); result.row = result.currentRow;
  if (!result.row || result.row.admissionId !== intent.admissions[0][0] || result.row.Status !== 'Admitted' || result.row['Admitted At'] !== timestamp) liveError_('Admission not verified; reconcile original operation.');
  return result;
}
function publishLiveCorrections_(context,request) {
  if (request.expectedRosterRevision !== context.rosterRevision) liveError_('Stale correction roster changed; reload.');
  var prepared = prepareLiveCorrections_(context,request.edits), intent = liveIntent_(context,request,'Correct',prepared.tickets);
  intent.corrections = prepared.corrections.map(function(c) { return [c.correctionId,request.operationId,String(c.sourceRow),c.baseHash,c.previousCorrectionId,liveJson_(c.fields)]; });
  var finalContext = commitLiveOperation_(context,intent);
  if (finalContext.roster.attention.some(function(r) { return prepared.corrections.some(function(c) { return c.sourceRow === r.sourceRow; }); })) liveError_('Correction readback not verified.');
  return liveOperationResult_(finalContext,finalContext.state.operations.find(function(o) { return o.operationId === request.operationId; }));
}
function setLiveMode_(context,request) {
  if (typeof request.testMode !== 'boolean') liveError_('Boolean test mode required.');
  var intent = liveIntent_(context,request,'Mode',[]); intent.testMode = request.testMode;
  var finalContext = commitLiveOperation_(context,intent);
  return Object.assign(liveOperationResult_(finalContext,finalContext.state.operations.find(function(o) { return o.operationId === request.operationId; })),{testMode:finalContext.config.testMode});
}
function renameLiveEvent_(context,request) {
  if (typeof request.eventName !== 'string' || !request.eventName.trim() || request.eventName.length > 120 || /[\u0000-\u001f]/.test(request.eventName)) liveError_('Invalid dance name.');
  var intent = liveIntent_(context,request,'Rename',[]); intent.eventName = request.eventName;
  var finalContext = commitLiveOperation_(context,intent);
  return liveOperationResult_(finalContext,finalContext.state.operations.find(function(o) { return o.operationId === request.operationId; }));
}
function dispatchLiveAction_(binding,event,role,request) {
  var context = readLiveContext_(binding,event); context.role = role; context.request = request;
  if (request.action === 'getEvent') {
    var response = {eventId:event.eventId,role:role,revision:context.revision,config:context.config}; if (role === 'admin') response.helperToken = event.helperToken; return response;
  }
  if (request.action === 'list') return {rows:livePublicRows_(context),testMode:context.config.testMode,revision:context.revision,rosterRevision:context.rosterRevision,attendanceRevision:context.attendanceRevision,quarantineCount:context.roster.attention.length};
  if (request.action === 'getAttention') return {records:context.roster.attention,revision:context.revision,rosterRevision:context.rosterRevision,attendanceRevision:context.attendanceRevision,
    pending:context.state.pending.map(function(op) { return {operationId:op.operationId,kind:op.kind,intentHash:op.intentHash,tickets:op.intent.tickets}; })};
  if (request.action === 'getOperation') return getLiveOperation_(context,request);
  if (LIVE_MUTATIONS.indexOf(request.action) >= 0 && request.action !== 'reviewOperation') {
    var replay = liveReplayRequest_(context,request); if (replay) return replay; liveMutationFresh_(context,request);
  }
  var handlers = {admit:admitLiveTicket_,publishCorrections:publishLiveCorrections_,setTestMode:setLiveMode_,saveEvent:renameLiveEvent_};
  if (typeof undoLiveLatest_ === 'function') handlers.undoLatest = undoLiveLatest_;
  if (typeof previewLiveReset_ === 'function') handlers.previewReset = previewLiveReset_;
  if (typeof resetLiveTickets_ === 'function') { handlers.resetTicket = resetLiveTickets_; handlers.resetAll = resetLiveTickets_; }
  if (typeof reviewLiveOperation_ === 'function') handlers.reviewOperation = reviewLiveOperation_;
  if (!handlers[request.action]) liveError_('Live handler unavailable; no operation performed.');
  return handlers[request.action](context,request);
}
