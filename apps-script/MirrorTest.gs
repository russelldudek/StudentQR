/** Owner-editor operations only. None is a public web action. */
function homecomingDigest_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text).map(function(byte) {
    return ('0' + ((byte + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function buildMirrorIntake_(rawValues) {
  return buildMirrorSnapshot_(rawValues).intakeValues;
}

function buildMirrorSnapshot_(rawValues) {
  if (!Array.isArray(rawValues)) throw new Error('Expected raw source rows.');
  projectCombinedIntake_(rawValues.slice(0, 5));
  var records = [], ticketOwners = new Map(), identityOwners = new Map();
  function own(map, key, record) {
    if (!key) return;
    var owners = map.get(key) || [];
    if (!owners.includes(record)) owners.push(record);
    map.set(key, owners);
  }
  rawValues.slice(5).forEach(function(source, offset) {
    if (!Array.isArray(source)) throw new Error('Source rows must be raw arrays.');
    if (source.every(combinedEmptyCell_)) return;
    var row = source.slice(), record = { row: row, sourceRow: offset + 6, blocked: false, tickets: [] };
    // Only the approved mirror import pads numeric student tickets. Guest literals stay exact.
    if (typeof row[2] === 'number' && Number.isInteger(row[2]) && row[2] >= 0 && row[2] <= 999) row[2] = ('000' + row[2]).slice(-3);
    [row[2], row[9]].forEach(function(value) {
      if (typeof value === 'string' && /^#(?:ERROR!|N\/A|REF!|DIV\/0!|VALUE!|NAME\?|NUM!|NULL!|SPILL!|CALC!)$/.test(value)) record.blocked = true;
      if (typeof value !== 'string' && typeof value !== 'number') return;
      var ticket = String(value);
      if (!ticket) return;
      if (!record.tickets.includes(ticket)) record.tickets.push(ticket);
      if (ticket.trim() && ticket.trim() !== ticket && !record.tickets.includes(ticket.trim())) record.tickets.push(ticket.trim());
      // Ambiguous numeric annotations reserve potential printed codes only; never admission aliases.
      if (/^[\d\s(),/]+$/.test(ticket) && (ticket.match(/\d+/g) || []).length > 1) {
        record.blocked = true;
        ticket.match(/\d+/g).forEach(function(token) {
          if (token.length <= 3) {
            var candidate = ('000' + token).slice(-3);
            if (!record.tickets.includes(candidate)) record.tickets.push(candidate);
          }
        });
      }
    });
    try { projectCombinedIntake_(rawValues.slice(0, 5).concat([row])); } catch (err) { record.blocked = true; }
    records.push(record);
    record.tickets.forEach(function(ticket) { own(ticketOwners, ticket, record); });
    if (typeof row[1] === 'string') own(identityOwners, row[1], record);
  });
  [ticketOwners, identityOwners].forEach(function(map) {
    map.forEach(function(owners) { if (owners.length > 1) owners.forEach(function(record) { record.blocked = true; }); });
  });
  var result = [[], [], [], []].map(function() { return Array(10).fill(''); });
  result.push(rawValues[4].slice(0, 10));
  var blocked = new Map();
  records.forEach(function(record, i) {
    if (record.blocked) {
      var diagnosticTickets = record.tickets.filter(mirrorQuarantineDiagnosticTicket_);
      (diagnosticTickets.length ? diagnosticTickets : ['']).forEach(function(ticket) {
        var rows = blocked.get(ticket) || [];
        rows.push(record.sourceRow); blocked.set(ticket, rows);
      });
      return;
    }
    var row = record.row, guest = row[4] === 'Yes';
    result.push(['Practice Student ' + (i + 1), 'MIRROR-' + ('0000' + (i + 1)).slice(-4), row[2], '',
      row[4] == null ? '' : row[4], guest ? 'Practice Guest ' + (i + 1) : '', '', '', '', guest ? row[9] : '']);
  });
  if (!projectCombinedIntake_(result).subjects.length) throw new Error('No unambiguous assigned tickets remain. Owner review required.');
  var quarantine = [HOMECOMING_QUARANTINE_HEADERS_.slice()];
  blocked.forEach(function(rows, ticket) { quarantine.push([JSON.stringify(ticket), 'Conflict or incomplete source record', JSON.stringify(rows)]); });
  return { intakeValues: result, quarantineValues: quarantine,
    quarantinedRecordCount: records.filter(function(record) { return record.blocked; }).length };
}

function mirrorSnapshotHash_(intake, quarantine) {
  return homecomingDigest_(JSON.stringify([intake, quarantine]));
}

function storedMirrorSnapshotHash_(book, binding) {
  var intake = book.getSheetByName(binding.sourceSheetName), quarantine = book.getSheetByName(binding.quarantineSheetName);
  if (!intake || !quarantine) throw new Error('Mirror snapshot sheets are missing.');
  return mirrorSnapshotHash_(intake.getDataRange().getValues(), quarantine.getDataRange().getValues());
}

function saveMirrorBinding_(binding) {
  var props = PropertiesService.getScriptProperties(), serialized = JSON.stringify(binding);
  props.setProperty(HOMECOMING_BINDING_KEY_, serialized);
  if (props.getProperty(HOMECOMING_BINDING_KEY_) !== serialized) throw new Error('Mirror binding persistence not confirmed. Owner inspection required.');
}

function mirrorTarget_(binding) {
  if (binding.version !== 1 || binding.environment !== 'mirror-test' || !binding.spreadsheetId ||
      binding.spreadsheetId === HOMECOMING_PRODUCTION_ID_ || binding.sourceSheetName !== 'Ticket Checklist' ||
      binding.sourceHeaderRow !== 5 || binding.attendanceSheetName !== 'Check-ins' || binding.quarantineSheetName !== 'Quarantine') {
    throw new Error('Mirror target is unsafe. Production writes refused.');
  }
  var book = SpreadsheetApp.openById(binding.spreadsheetId);
  if (book.getId() !== binding.spreadsheetId || book.getId() === HOMECOMING_PRODUCTION_ID_) throw new Error('Mirror target mismatch.');
  return book;
}

function assertEmptyMirrorLedger_(sheet) {
  if (!sheet) return;
  var range = sheet.getDataRange(), values = range.getValues(), formulas = range.getFormulas();
  if (formulas.some(function(row) { return row.some(function(cell) { return cell !== ''; }); })) throw new Error('Mirror ledger contains formulas.');
  if (values.some(function(row) { return row.some(function(cell) { return cell !== ''; }); })) {
    if (values.length !== 1 || JSON.stringify(values[0]) !== JSON.stringify(HOMECOMING_LEDGER_HEADERS_)) {
      throw new Error('Existing mirror ledger is incompatible or contains attendance. It will not be reset.');
    }
  }
}

function writeMirrorText_(book, binding, sheet, values) {
  if (book.getId() !== binding.spreadsheetId || book.getId() === HOMECOMING_PRODUCTION_ID_) throw new Error('Production writes refused.');
  var range = sheet.getRange(1, 1, values.length, values[0].length);
  var rich = values.map(function(row) { return row.map(function(text) {
    if (typeof text !== 'string') throw new Error('Mirror cells must be literal strings.');
    return SpreadsheetApp.newRichTextValue().setText(text).build();
  }); });
  range.setNumberFormat('@');
  range.setRichTextValues(rich);
  SpreadsheetApp.flush();
  if (JSON.stringify(range.getValues()) !== JSON.stringify(values) ||
      range.getFormulas().some(function(row) { return row.some(function(cell) { return cell !== ''; }); })) {
    throw new Error('Mirror raw-string readback was not confirmed.');
  }
}

function prepareHomecomingMirrorTest() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Mirror preparation busy.');
  try {
    var binding = readHomecomingBinding_();
    if (binding && binding.stage === 'ready') {
      var existingEvent = readSharedEvent_(); assertHomecomingBinding_(binding, existingEvent);
      if (!existingEvent) throw new Error('Ready mirror has no event. Owner review required.');
      var existing = readHomecomingContext_(binding, existingEvent.eventId);
      return { spreadsheetId: binding.spreadsheetId, sourceSubjectCount: existing.subjects.length, stage: 'ready' };
    }
    if (binding && binding.creationAttempted && !binding.spreadsheetId) throw new Error('Mirror creation outcome unknown. Inspect Drive before any retry; no second workbook will be created.');
    var sourceBook = SpreadsheetApp.openById(HOMECOMING_PRODUCTION_ID_);
    if (sourceBook.getId() !== HOMECOMING_PRODUCTION_ID_) throw new Error('Source spreadsheet mismatch.');
    var sourceSheet = sourceBook.getSheetByName('Ticket Checklist');
    if (!sourceSheet) throw new Error('Production Ticket Checklist tab not found.');
    var snapshot = buildMirrorSnapshot_(sourceSheet.getDataRange().getValues()), mirrorValues = snapshot.intakeValues;
    var digest = mirrorSnapshotHash_(mirrorValues, snapshot.quarantineValues);
    if (binding && binding.snapshotHash !== digest) throw new Error('Source ticket snapshot changed during interrupted setup. Owner inspection required.');
    if (!binding) {
      binding = { version: 1, stage: 'preparing', environment: 'mirror-test', spreadsheetId: '',
        sourceSheetName: 'Ticket Checklist', sourceHeaderRow: 5, attendanceSheetName: 'Check-ins', quarantineSheetName: 'Quarantine', snapshotHash: digest, creationAttempted: true };
      saveMirrorBinding_(binding);
      var created = SpreadsheetApp.create('Homecoming 2026 - Mirror Test');
      binding.spreadsheetId = created.getId();
      saveMirrorBinding_(binding);
    }
    if (binding.stage !== 'preparing') throw new Error('Unexpected mirror preparation stage.');
    var book = mirrorTarget_(binding);
    var ledger = book.getSheetByName(binding.attendanceSheetName);
    assertEmptyMirrorLedger_(ledger);
    if (binding.prepared) {
      if (storedMirrorSnapshotHash_(book, binding) !== digest) throw new Error('Prepared mirror changed. Owner review required.');
      return { spreadsheetId: binding.spreadsheetId, sourceSubjectCount: projectCombinedIntake_(mirrorValues).subjects.length, quarantinedRecordCount: snapshot.quarantinedRecordCount, stage: 'preparing' };
    }
    var intakeSheet = book.getSheetByName(binding.sourceSheetName) || book.insertSheet(binding.sourceSheetName);
    ledger = ledger || book.insertSheet(binding.attendanceSheetName);
    var quarantineSheet = book.getSheetByName(binding.quarantineSheetName) || book.insertSheet(binding.quarantineSheetName);
    writeMirrorText_(book, binding, intakeSheet, mirrorValues);
    writeMirrorText_(book, binding, quarantineSheet, snapshot.quarantineValues);
    writeMirrorText_(book, binding, ledger, [HOMECOMING_LEDGER_HEADERS_.slice()]);
    binding.prepared = true;
    saveMirrorBinding_(binding);
    return { spreadsheetId: binding.spreadsheetId, sourceSubjectCount: projectCombinedIntake_(mirrorValues).subjects.length, quarantinedRecordCount: snapshot.quarantinedRecordCount, stage: 'preparing' };
  } finally { lock.releaseLock(); }
}

function newMirrorLinkKey_() {
  // Three UUIDs supply more than 256 bits of random entropy before hashing.
  return homecomingDigest_([Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid()].join(':'));
}

function mirrorDeploymentUrl_() {
  // Editor executions may report /dev. The owner can pin the verified deployment in Script Properties.
  var configured = PropertiesService.getScriptProperties().getProperty('studentQrMirrorDeploymentUrl');
  var url = configured === null ? ScriptApp.getService().getUrl() : configured;
  if (typeof url !== 'string' || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) {
    throw new Error('A verified Apps Script /exec deployment URL is required; configure studentQrMirrorDeploymentUrl in the owner editor.');
  }
  return url;
}

function initializeHomecomingMirrorTest() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Mirror initialization busy.');
  try {
    var binding = readHomecomingBinding_();
    if (!binding || !binding.prepared || !['preparing', 'initializing', 'ready'].includes(binding.stage)) throw new Error('Prepare the private mirror first.');
    var book = mirrorTarget_(binding);
    var apiUrl = mirrorDeploymentUrl_();
    var existing = readSharedEvent_();
    if (existing) {
      if (binding.stage !== 'ready') throw new Error('Initialization interrupted before links were delivered. Run recoverHomecomingMirrorAdminLink explicitly in the owner editor.');
      var readyBinding = cloneObject_(binding); readyBinding.stage = 'ready'; assertHomecomingBinding_(readyBinding, existing);
      if (existing.config.apiUrl !== apiUrl) throw new Error('Deployment URL changed. Keep the original private links; owner review required.');
      getGlobalTestMode_(existing.config, existing.config.testMode);
      readHomecomingContext_(readyBinding, existing.eventId);
      if (binding.stage !== 'ready') saveMirrorBinding_(readyBinding);
      return { created: false, eventId: existing.eventId, testMode: existing.config.testMode, message: 'Use the original private admin URL. Existing keys and attendance are retained.' };
    }
    if (binding.stage === 'ready') throw new Error('Ready mirror event was erased. Owner review required.');
    assertEmptyMirrorLedger_(book.getSheetByName(binding.attendanceSheetName));
    if (storedMirrorSnapshotHash_(book, binding) !== binding.snapshotHash) throw new Error('Prepared mirror snapshot does not match.');
    var admin = newMirrorLinkKey_(), helper = newMirrorLinkKey_();
    if (admin === helper) throw new Error('Private keys must differ.');
    var event = { version: 1, eventId: Utilities.getUuid(), revision: 1,
      adminHash: sharedTokenHash_(admin), helperHash: sharedTokenHash_(helper), helperToken: helper,
      config: { sheetUrl: 'https://docs.google.com/spreadsheets/d/' + binding.spreadsheetId + '/edit', apiUrl: apiUrl,
        sheetName: 'Ticket Checklist', firstNameCol: 'First Name', lastNameCol: 'Last Name', qrCol: 'QR_ID', statusCol: 'Status',
        admittedAtCol: 'Admitted At', guestCol: 'Bringing Guest', eventName: 'Homecoming 2026 - Mirror Test', admittedValue: 'Admitted',
        allowedStatuses: [], timeZone: 'America/New_York', testMode: true, rosterMode: 'homecoming-2026', environment: 'mirror-test' } };
    var props = PropertiesService.getScriptProperties(), serialized = JSON.stringify(event), modeKey = getTestModePropertyKey_(event.config);
    binding.stage = 'initializing';
    saveMirrorBinding_(binding);
    props.setProperty(modeKey, 'true');
    props.setProperty('studentQrSharedDance', serialized);
    if (props.getProperty(modeKey) !== 'true' || props.getProperty('studentQrSharedDance') !== serialized) throw new Error('Mirror initialization could not be confirmed.');
    var ready = cloneObject_(binding); ready.stage = 'ready';
    readHomecomingContext_(ready, event.eventId);
    saveMirrorBinding_(ready);
    var base = 'https://russelldudek.github.io/StudentQR/?event=' + encodeURIComponent(event.eventId) + '&api=' + encodeURIComponent(apiUrl);
    return { created: true, eventId: event.eventId, testMode: true,
      adminUrl: base + '&tab=dashboard#key=' + admin, helperUrl: base + '&tab=scanner#key=' + helper };
  } finally { lock.releaseLock(); }
}

function recoverHomecomingMirrorAdminLink() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Mirror recovery busy.');
  try {
    var binding = readHomecomingBinding_(), event = readSharedEvent_();
    if (!binding || !binding.prepared || !['initializing', 'ready'].includes(binding.stage) || !event) throw new Error('No recoverable mirror initialization found. Owner inspection required.');
    var ready = cloneObject_(binding); ready.stage = 'ready';
    assertHomecomingBinding_(ready, event);
    var apiUrl = mirrorDeploymentUrl_();
    if (event.config.apiUrl !== apiUrl) throw new Error('Recovery requires the original /exec deployment.');
    getGlobalTestMode_(event.config, event.config.testMode);
    readHomecomingContext_(ready, event.eventId);
    var admin = newMirrorLinkKey_();
    if (sharedTokenHash_(admin) === event.helperHash) throw new Error('Recovery keys must differ.');
    event.adminHash = sharedTokenHash_(admin); event.revision += 1;
    var serialized = JSON.stringify(event), props = PropertiesService.getScriptProperties();
    props.setProperty('studentQrSharedDance', serialized);
    if (props.getProperty('studentQrSharedDance') !== serialized) throw new Error('Admin recovery was not confirmed. Retry owner recovery; attendance is retained.');
    saveMirrorBinding_(ready);
    var base = 'https://russelldudek.github.io/StudentQR/?event=' + encodeURIComponent(event.eventId) + '&api=' + encodeURIComponent(apiUrl);
    return { created: false, recovered: true, eventId: event.eventId, testMode: event.config.testMode,
      adminUrl: base + '&tab=dashboard#key=' + admin, helperUrl: base + '&tab=scanner#key=' + event.helperToken,
      message: 'Previous admin link is revoked. Helper link and attendance are retained.' };
  } finally { lock.releaseLock(); }
}
