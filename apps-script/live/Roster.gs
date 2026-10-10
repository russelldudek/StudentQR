var LIVE_CORRECTION_FIELDS = ['studentName','studentId','studentTicket','bringingGuest','guestName','guestTicket'];
function liveCorrectionFields_(fields) {
  liveExactKeys_(fields,LIVE_CORRECTION_FIELDS);
  if (Object.keys(fields).length !== 6 || LIVE_CORRECTION_FIELDS.some(function(k) { return typeof fields[k] !== 'string'; })) liveError_('Exactly six text fields required.');
  return fields;
}
function liveStudentTicket_(value) { return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 999 ? ('00'+value).slice(-3) : value; }
function liveTicketCandidates_(value) {
  var v = liveStudentTicket_(value), result = [];
  if (typeof value === 'number' && Number.isFinite(value)) {
    // An invalid numeric assignment still reserves its literal printed-code candidates.
    result.push(String(value));
    if (Number.isInteger(value) && value >= 0 && value <= 999) result.push(('00'+value).slice(-3));
    v = String(v);
  }
  if (typeof v === 'string' && v) {
    if (/^[A-Za-z0-9_-]+$/.test(v)) result.push(v);
    if (v.trim() !== v && /^[A-Za-z0-9_-]+$/.test(v.trim())) result.push(v.trim());
    if (!/^[A-Za-z0-9_-]+$/.test(v)) (v.match(/\d+[A-Za-z]?/g) || []).forEach(function(t) { result.push(t); if (/^\d{1,3}$/.test(t)) result.push(('00'+t).slice(-3)); });
  }
  return Array.from(new Set(result));
}
function liveFieldsFromRaw_(row) {
  return {studentName:row[0],studentId:row[1],studentTicket:liveStudentTicket_(row[2]),bringingGuest:row[4],guestName:row[5],guestTicket:row[9]};
}
function liveRecordHash_(row) { return hashLive_(liveJson_(row)); }
function liveRecordId_(sourceRow,baseHash) { return hashLive_(liveJson_([LIVE_DEPLOYMENT.spreadsheetId,LIVE_DEPLOYMENT.sourceSheetName,sourceRow,baseHash])); }
function buildLiveRoster_(rawValues,state) {
  var prefix = rawValues.slice(0,5); projectCombinedIntake_(prefix);
  var records = [], extraReservations = [];
  rawValues.slice(5).forEach(function(row,i) {
    if (row.every(combinedEmptyCell_)) return;
    var sourceRow = i+6, baseHash = liveRecordHash_(row), correction = state.corrections.find(function(c) { return c.sourceRow === sourceRow; });
    var fields = liveFieldsFromRaw_(row), issues = [], stale = correction && correction.baseHash !== baseHash;
    if (correction && !stale) fields = correction.fields;
    var reservations = liveTicketCandidates_(fields.studentTicket).concat(liveTicketCandidates_(fields.guestTicket));
    if (stale) { issues.push('Source changed beneath correction; review current record.'); reservations = reservations.concat(correction.reservedTickets || [],liveTicketCandidates_(correction.fields.studentTicket),liveTicketCandidates_(correction.fields.guestTicket)); }
    var subjects = [];
    try {
      if (row.length !== 10) liveError_('Unexpected populated source columns.');
      if (typeof fields.studentTicket !== 'string' || !/^[A-Za-z0-9_-]+$/.test(fields.studentTicket) ||
          (fields.guestTicket !== '' && (typeof fields.guestTicket !== 'string' || !/^[A-Za-z0-9_-]+$/.test(fields.guestTicket)))) liveError_('Ticket annotation/error requires an exact printed ticket correction.');
      var effective = [fields.studentName,fields.studentId,fields.studentTicket,'',fields.bringingGuest,fields.guestName,'','','',fields.guestTicket];
      subjects = projectCombinedIntake_(prefix.concat([effective])).subjects;
      subjects.forEach(function(s) { s.sourceRow = sourceRow; });
    } catch (e) { issues.push(e.message); }
    records.push({recordId:liveRecordId_(sourceRow,baseHash),sourceRow:sourceRow,baseHash:baseHash,correctionVersion:correction ? correction.correctionId : '',fields:fields,issues:issues,subjects:subjects,reservations:Array.from(new Set(reservations)),conflicts:[]});
  });
  state.corrections.filter(function(c) { return !records.some(function(r) { return r.sourceRow === c.sourceRow; }); }).forEach(function(c) {
    var reservations = Array.from(new Set((c.reservedTickets || []).concat(liveTicketCandidates_(c.fields.studentTicket),liveTicketCandidates_(c.fields.guestTicket))));
    extraReservations = extraReservations.concat(reservations);
    records.push({recordId:liveRecordId_(c.sourceRow,c.baseHash),sourceRow:c.sourceRow,baseHash:c.baseHash,correctionVersion:c.correctionId,fields:c.fields,issues:['Corrected source record removed; owner review required.'],subjects:[],reservations:reservations,conflicts:[],removedSource:true});
  });
  var owners = Object.create(null);
  records.forEach(function(r,index) {
    var keys = r.reservations.map(function(t) { return 'ticket:'+t; });
    if (typeof r.fields.studentId === 'string' && r.fields.studentId) keys.push('student:'+r.fields.studentId);
    keys.forEach(function(key) { (owners[key] || (owners[key] = [])).push(index); });
  });
  Object.keys(owners).forEach(function(key) { var group = owners[key]; if (group.length > 1) group.forEach(function(i) { records[i].issues.push('Conflicting '+key.split(':')[0]+' assignment.'); records[i].conflicts = records[i].conflicts.concat(group); }); });
  var pendingTickets = [], globallyPending = false;
  state.pending.forEach(function(op) { pendingTickets = pendingTickets.concat(op.intent.tickets); if (['ResetAll','Mode'].indexOf(op.kind) >= 0) globallyPending = true; });
  records.forEach(function(r) {
    if (r.reservations.some(function(t) { return pendingTickets.indexOf(t) >= 0; })) r.issues.push('Pending operation needs Eve review.');
    r.subjects.forEach(function(s) {
      s.assignmentHash = hashLive_(liveJson_([r.fields.studentId,r.fields.studentName,r.fields.studentTicket,r.fields.bringingGuest,r.fields.guestName,r.fields.guestTicket,s.personType,s.ticketId]));
      var active = state.active.find(function(a) { return a.ticketId === s.ticketId; });
      if (active && active.assignmentHash !== s.assignmentHash) r.issues.push('Attendance assignment changed; explicit ticket review/reset required.');
    });
    var drift = state.active.filter(function(a) {
      return (a.studentId === r.fields.studentId || r.reservations.indexOf(a.ticketId) >= 0) &&
        !r.subjects.some(function(s) { return s.ticketId === a.ticketId && s.assignmentHash === a.assignmentHash; });
    });
    if (drift.length) {
      r.issues.push('Attendance assignment changed; explicit ticket review/reset required.');
      r.reservations = Array.from(new Set(r.reservations.concat(drift.map(function(a) { return a.ticketId; }))));
    }
  });
  // An orphaned active assignment cannot be safely associated with any replacement person.
  var globallyNeedsReview = state.active.some(function(a) { return !records.some(function(r) { return r.subjects.some(function(s) { return s.ticketId === a.ticketId && s.assignmentHash === a.assignmentHash; }); }); });
  var blockedTickets = extraReservations.slice(), subjects = [], attention = [];
  records.forEach(function(r,index) {
    if (r.issues.length) {
      blockedTickets = blockedTickets.concat(r.reservations);
      var connected = new Set([index]), changed = true;
      while (changed) { changed = false; Array.from(connected).forEach(function(n) { records[n].conflicts.forEach(function(k) { if (!connected.has(k)) { connected.add(k); changed = true; } }); }); }
      attention.push({recordId:r.recordId,sourceRow:r.sourceRow,baseHash:r.baseHash,correctionVersion:r.correctionVersion,fields:r.fields,issues:Array.from(new Set(r.issues)),conflictGroupId:hashLive_(Array.from(connected).sort().join(',')),removedSource:!!r.removedSource});
    } else subjects = subjects.concat(r.subjects);
  });
  blockedTickets = Array.from(new Set(blockedTickets.concat(pendingTickets)));
  subjects = subjects.filter(function(s) { return blockedTickets.indexOf(s.ticketId) < 0; });
  var rows = subjects.map(function(s) {
    var other = subjects.find(function(o) { return o.sourceRow === s.sourceRow && o.personType !== s.personType; });
    var active = state.active.find(function(a) { return a.ticketId === s.ticketId && a.assignmentHash === s.assignmentHash; });
    var linkedActive = other && state.active.find(function(a) { return a.ticketId === other.ticketId && a.assignmentHash === other.assignmentHash; });
    return {'First Name':s.fullName,'Last Name':'',QR_ID:s.ticketId,Status:active?'Admitted':'','Admitted At':active?active.admittedAt:'',
      'Bringing Guest':s.personType === 'Student' && other?'Yes':'No',personType:s.personType,assignmentHash:s.assignmentHash,admissionId:active?active.admissionId:'',
      linkedPersonType:other?other.personType:'',linkedName:other?other.fullName:'',linkedTicketId:other?other.ticketId:'',linkedStatus:linkedActive?'Admitted':'',linkedAdmittedAt:linkedActive?linkedActive.admittedAt:''};
  });
  blockedTickets.forEach(function(t) { rows.push({'First Name':'Needs Attention','Last Name':'',QR_ID:t,Status:'Blocked','Admitted At':'','Bringing Guest':'No',quarantined:true,personType:'Blocked'}); });
  return {subjects:subjects,rows:rows,attention:attention,records:records,blockedTickets:blockedTickets,globallyPending:globallyPending,globallyNeedsReview:globallyNeedsReview,
    rosterRevision:hashLive_(liveJson_([rawValues,state.corrections]))};
}
function livePublicRows_(context) { return context.roster.rows; }
function prepareLiveCorrections_(context,edits) {
  if (!Array.isArray(edits) || !edits.length || edits.length > 100) liveError_('Select complete correction records.');
  var rows = new Set(), changes = [], tickets = [];
  edits.forEach(function(edit) {
    liveExactKeys_(edit,['recordId','sourceRow','baseHash','correctionVersion','fields']);
    liveCorrectionFields_(edit.fields);
    var record = context.roster.records.find(function(r) { return r.recordId === edit.recordId; });
    if (!record || rows.has(edit.sourceRow) || record.sourceRow !== edit.sourceRow || record.baseHash !== edit.baseHash || record.correctionVersion !== edit.correctionVersion || !context.source[edit.sourceRow-1]) liveError_('Stale correction; reload Needs Attention.');
    rows.add(edit.sourceRow);
    var reserved = record.reservations.concat(liveTicketCandidates_(edit.fields.studentTicket),liveTicketCandidates_(edit.fields.guestTicket));
    if (context.state.pending.some(function(op) { return op.intent.tickets.some(function(t) { return reserved.indexOf(t) >= 0; }); })) liveError_('Pending correction/attendance requires review.');
    if (context.state.active.some(function(a) { return reserved.indexOf(a.ticketId) >= 0 || a.studentId === record.fields.studentId; })) liveError_('Active attendance requires explicit ticket reset/review before correction.');
    tickets = tickets.concat(reserved);
    changes.push({correctionId:Utilities.getUuid(),sourceRow:edit.sourceRow,baseHash:edit.baseHash,fields:edit.fields,previousCorrectionId:record.correctionVersion,reservedTickets:reserved});
  });
  var candidate = Object.assign({},context.state,{corrections:context.state.corrections.filter(function(c) { return !rows.has(c.sourceRow); }).concat(changes)});
  var projected = buildLiveRoster_(context.source,candidate);
  if (projected.attention.some(function(a) { return rows.has(a.sourceRow); })) liveError_('Corrected assignment remains invalid, conflicting or blocked.');
  return {corrections:changes,tickets:Array.from(new Set(tickets))};
}
