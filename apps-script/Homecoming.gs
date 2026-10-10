/** Server-bound mirror reader. The combined intake projection remains read-only. */
var HOMECOMING_PRODUCTION_ID_ = '1hlWdxxzlP2Zbl9m4_MN49XBgBrL7YiG67ur2p2tEueU';
var HOMECOMING_BINDING_KEY_ = 'studentQrHomecomingBinding';
var HOMECOMING_LEDGER_HEADERS_ = ['Event ID', 'Person Type', 'Ticket ID (JSON)',
  'Source Student ID (JSON)', 'Subject Assignment SHA256', 'Status', 'Admitted At'];

function readHomecomingBinding_() {
  var raw = PropertiesService.getScriptProperties().getProperty(HOMECOMING_BINDING_KEY_);
  return raw ? JSON.parse(raw) : null;
}

function assertHomecomingBinding_(binding, event) {
  if (!binding || binding.version !== 1 || binding.stage !== 'ready' ||
      binding.environment !== 'mirror-test' || typeof binding.spreadsheetId !== 'string' ||
      !binding.spreadsheetId || binding.spreadsheetId === HOMECOMING_PRODUCTION_ID_ ||
      binding.sourceSheetName !== 'Ticket Checklist' || binding.sourceHeaderRow !== 5 ||
      binding.attendanceSheetName !== 'Check-ins') throw new Error('Homecoming mirror binding is not ready or safe. Owner review required.');
  if (event && (event.config.rosterMode !== 'homecoming-2026' || event.config.environment !== binding.environment ||
      extractSpreadsheetId_(event.config.sheetUrl) !== binding.spreadsheetId || event.config.sheetName !== binding.sourceSheetName)) {
    throw new Error('Homecoming event does not match its sealed mirror binding.');
  }
  return binding;
}

function assertHomecomingTarget_(book, binding) {
  assertHomecomingBinding_(binding);
  if (book.getId() !== binding.spreadsheetId || book.getId() === HOMECOMING_PRODUCTION_ID_) {
    throw new Error('Homecoming target mismatch. Production writes refused.');
  }
}

function readHomecomingContext_(binding, eventId) {
  assertHomecomingBinding_(binding);
  var book = SpreadsheetApp.openById(binding.spreadsheetId);
  assertHomecomingTarget_(book, binding);
  var intakeSheet = book.getSheetByName(binding.sourceSheetName);
  var ledgerSheet = book.getSheetByName(binding.attendanceSheetName);
  if (!intakeSheet || !ledgerSheet) throw new Error('Homecoming mirror intake or attendance ledger is missing.');
  var subjects = projectCombinedIntake_(intakeSheet.getDataRange().getValues()).subjects;
  var ledgerRange = ledgerSheet.getDataRange();
  var attendance = parseHomecomingLedger_(ledgerRange.getValues(), ledgerRange.getFormulas(), eventId, subjects);
  return { book: book, intakeSheet: intakeSheet, ledgerSheet: ledgerSheet, subjects: subjects, attendance: attendance };
}

function homecomingLinks_(subjects) {
  var groups = new Map(), links = new Map();
  subjects.forEach(function(subject) {
    var pair = groups.get(subject.sourceStudentId) || {};
    if (pair[subject.personType]) throw new Error('Duplicate Homecoming person association.');
    pair[subject.personType] = subject;
    groups.set(subject.sourceStudentId, pair);
  });
  subjects.forEach(function(subject) {
    var pair = groups.get(subject.sourceStudentId);
    links.set(subject.ticketId, pair[subject.personType === 'Student' ? 'Guest' : 'Student'] || null);
  });
  return links;
}

function subjectAssignmentHash_(subject, linked) {
  var text = JSON.stringify([subject.personType, subject.ticketId, subject.sourceStudentId, subject.fullName,
    linked ? linked.personType : '', linked ? linked.ticketId : '', linked ? linked.fullName : '']);
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text).map(function(byte) {
    return ('0' + ((byte + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function parseHomecomingLedger_(values, formulas, eventId, subjects) {
  var records = new Map();
  if (!values.length || JSON.stringify(values[0]) !== JSON.stringify(HOMECOMING_LEDGER_HEADERS_)) {
    throw new Error('Homecoming ledger headers are incompatible.');
  }
  var links = homecomingLinks_(subjects), current = new Map();
  subjects.forEach(function(s) { current.set(s.ticketId, s); });
  for (var r = 0; r < values.length; r += 1) {
    if (!formulas[r] || formulas[r].some(function(cell) { return cell !== ''; })) throw new Error('Homecoming ledger contains formulas.');
    if (r === 0) continue;
    var row = values[r];
    if (row.every(function(cell) { return cell === ''; })) continue;
    if (row.length !== 7 || row[0] !== eventId || !['Student', 'Guest'].includes(row[1]) ||
        typeof row[4] !== 'string' || !/^[a-f0-9]{64}$/.test(row[4]) || !['Pending', 'Admitted'].includes(row[5]) ||
        typeof row[6] !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(row[6]) ||
        !isFinite(Date.parse(row[6] + 'Z'))) throw new Error('Homecoming ledger row ' + (r + 1) + ' is invalid.');
    var ticket, sourceId;
    try {
      ticket = combinedLiteralIdentity_(JSON.parse(row[2]), 'ledger ticket');
      sourceId = combinedLiteralIdentity_(JSON.parse(row[3]), 'ledger source ID');
      if (typeof row[2] !== 'string' || typeof row[3] !== 'string' ||
          JSON.stringify(ticket) !== row[2] || JSON.stringify(sourceId) !== row[3]) throw new Error('Noncanonical identity');
    } catch (err) { throw new Error('Homecoming ledger identity row ' + (r + 1) + ' is invalid.'); }
    if (records.has(ticket)) throw new Error('Duplicate Homecoming ledger ticket. Owner review required.');
    var subject = current.get(ticket);
    var drift = subject && (subject.personType !== row[1] || subject.sourceStudentId !== sourceId ||
      subjectAssignmentHash_(subject, links.get(ticket)) !== row[4]);
    records.set(ticket, { status: drift ? 'Needs Review' : row[5], timestamp: row[6], rowNumber: r + 1,
      assignmentHash: row[4], personType: row[1], sourceStudentId: sourceId });
  }
  return records;
}

function homecomingRows_(subjects, attendance) {
  var links = homecomingLinks_(subjects);
  return subjects.map(function(s) {
    var linked = links.get(s.ticketId), record = attendance.get(s.ticketId), linkedRecord = linked && attendance.get(linked.ticketId);
    return { 'First Name': s.fullName, 'Last Name': '', QR_ID: s.ticketId,
      Status: record ? record.status : 'Not checked in', 'Admitted At': record ? record.timestamp : '',
      'Bringing Guest': s.personType === 'Student' && linked ? 'Yes' : 'No', personType: s.personType,
      linkedPersonType: linked ? linked.personType : '', linkedName: linked ? linked.fullName : '',
      linkedTicketId: linked ? linked.ticketId : '', linkedStatus: linked ? (linkedRecord ? linkedRecord.status : 'Not checked in') : '',
      linkedAdmittedAt: linkedRecord ? linkedRecord.timestamp : '' };
  });
}

function admitHomecomingLocked_(config, binding, qrValue, eventId) {
  if (typeof qrValue !== 'string' || !qrValue || qrValue.trim() !== qrValue) throw new Error('An exact string ticket is required.');
  var context = readHomecomingContext_(binding, eventId);
  var rows = homecomingRows_(context.subjects, context.attendance);
  var index = context.subjects.findIndex(function(s) { return s.ticketId === qrValue; });
  if (index < 0) throw new Error('Ticket not found on the Homecoming roster.');
  var row = rows[index], record = context.attendance.get(qrValue);
  config.testMode = getGlobalTestMode_(config, config.testMode);
  if (record && record.status !== 'Admitted') throw new Error(record.status + ': admission uncertain or assignment changed. Owner review required.');
  if (record) return { row: row, matchedQrValue: qrValue, alreadyAdmitted: true, testMode: config.testMode };
  if (config.testMode) return { row: row, matchedQrValue: qrValue, testMode: true };
  var subject = context.subjects[index], links = homecomingLinks_(context.subjects);
  var timestamp = Utilities.formatDate(new Date(), 'America/New_York', "yyyy-MM-dd'T'HH:mm:ss");
  var pending = [eventId, subject.personType, JSON.stringify(qrValue), JSON.stringify(subject.sourceStudentId),
    subjectAssignmentHash_(subject, links.get(qrValue)), 'Pending', timestamp];
  var ledgerRow = context.ledgerSheet.getLastRow() + 1;
  function verify(expected) {
    var range = context.ledgerSheet.getRange(ledgerRow, 1, 1, 7);
    if (JSON.stringify(range.getValues()[0]) !== JSON.stringify(expected) ||
        range.getFormulas()[0].some(function(value) { return value !== ''; })) throw new Error('Attendance readback mismatch.');
  }
  try {
    assertHomecomingTarget_(context.book, binding);
    context.ledgerSheet.getRange(ledgerRow, 1, 1, 7).setNumberFormat('@').setValues([pending]);
    SpreadsheetApp.flush();
    verify(pending);
    assertHomecomingTarget_(context.book, binding);
    context.ledgerSheet.getRange(ledgerRow, 6).setValue('Admitted');
    SpreadsheetApp.flush();
    var final = pending.slice(); final[5] = 'Admitted'; verify(final);
    // Revalidate the whole ledger before returning a success, never an optimistic row.
    var latest = readHomecomingContext_(binding, eventId);
    var result = homecomingRows_(latest.subjects, latest.attendance).find(function(r) { return r.QR_ID === qrValue; });
    if (!result || result.Status !== 'Admitted' || result['Admitted At'] !== timestamp) throw new Error('Assignment changed during admission.');
    return { row: result, matchedQrValue: qrValue, testMode: false };
  } catch (err) {
    // Do not roll back or remove a reservation: a lost response must not admit twice.
    throw new Error('Admission uncertain. Owner must inspect the mirror ledger before retrying. ' + err.message);
  }
}
