/** Owner-editor operations only. None is a public web action. */
function homecomingDigest_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text).map(function(byte) {
    return ('0' + ((byte + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function buildMirrorIntake_(rawValues) {
  var subjects = projectCombinedIntake_(rawValues).subjects;
  if (!subjects.length) throw new Error('Homecoming source contains no assigned tickets.');
  var students = subjects.filter(function(s) { return s.personType === 'Student'; });
  var result = [[], [], [], []].map(function() { return Array(10).fill(''); });
  result.push(rawValues[4].slice(0, 10));
  var links = homecomingLinks_(subjects);
  students.forEach(function(s, i) {
    var guest = links.get(s.ticketId), source = rawValues[s.sourceRow - 1];
    result.push(['Practice Student ' + (i + 1), 'MIRROR-' + ('0000' + (i + 1)).slice(-4), s.ticketId, '',
      source[4] == null ? '' : source[4], guest ? 'Practice Guest ' + (i + 1) : '', '', '', '', guest ? guest.ticketId : '']);
  });
  projectCombinedIntake_(result);
  return result;
}

function saveMirrorBinding_(binding) {
  var props = PropertiesService.getScriptProperties(), serialized = JSON.stringify(binding);
  props.setProperty(HOMECOMING_BINDING_KEY_, serialized);
  if (props.getProperty(HOMECOMING_BINDING_KEY_) !== serialized) throw new Error('Mirror binding persistence not confirmed. Owner inspection required.');
}

function mirrorTarget_(binding) {
  if (binding.version !== 1 || binding.environment !== 'mirror-test' || !binding.spreadsheetId ||
      binding.spreadsheetId === HOMECOMING_PRODUCTION_ID_ || binding.sourceSheetName !== 'Ticket Checklist' ||
      binding.sourceHeaderRow !== 5 || binding.attendanceSheetName !== 'Check-ins') {
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
    var mirrorValues = buildMirrorIntake_(sourceSheet.getDataRange().getValues());
    var digest = homecomingDigest_(JSON.stringify(mirrorValues));
    if (binding && binding.snapshotHash !== digest) throw new Error('Source ticket snapshot changed during interrupted setup. Owner inspection required.');
    if (!binding) {
      binding = { version: 1, stage: 'preparing', environment: 'mirror-test', spreadsheetId: '',
        sourceSheetName: 'Ticket Checklist', sourceHeaderRow: 5, attendanceSheetName: 'Check-ins', snapshotHash: digest, creationAttempted: true };
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
      var savedSheet = book.getSheetByName(binding.sourceSheetName);
      if (!savedSheet || homecomingDigest_(JSON.stringify(savedSheet.getDataRange().getValues())) !== digest) throw new Error('Prepared mirror changed. Owner review required.');
      return { spreadsheetId: binding.spreadsheetId, sourceSubjectCount: projectCombinedIntake_(mirrorValues).subjects.length, stage: 'preparing' };
    }
    var intakeSheet = book.getSheetByName(binding.sourceSheetName) || book.insertSheet(binding.sourceSheetName);
    ledger = ledger || book.insertSheet(binding.attendanceSheetName);
    writeMirrorText_(book, binding, intakeSheet, mirrorValues);
    writeMirrorText_(book, binding, ledger, [HOMECOMING_LEDGER_HEADERS_.slice()]);
    binding.prepared = true;
    saveMirrorBinding_(binding);
    return { spreadsheetId: binding.spreadsheetId, sourceSubjectCount: projectCombinedIntake_(mirrorValues).subjects.length, stage: 'preparing' };
  } finally { lock.releaseLock(); }
}

function newMirrorLinkKey_() {
  // Three UUIDs supply more than 256 bits of random entropy before hashing.
  return homecomingDigest_([Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid()].join(':'));
}

function initializeHomecomingMirrorTest() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Mirror initialization busy.');
  try {
    var binding = readHomecomingBinding_();
    if (!binding || !binding.prepared || !['preparing', 'ready'].includes(binding.stage)) throw new Error('Prepare the private mirror first.');
    var book = mirrorTarget_(binding);
    var apiUrl = ScriptApp.getService().getUrl();
    if (typeof apiUrl !== 'string' || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(apiUrl)) throw new Error('A deployed Apps Script /exec URL is required; /dev is not accepted.');
    var existing = readSharedEvent_();
    if (existing) {
      var readyBinding = cloneObject_(binding); readyBinding.stage = 'ready'; assertHomecomingBinding_(readyBinding, existing);
      if (existing.config.apiUrl !== apiUrl) throw new Error('Deployment URL changed. Keep the original private links; owner review required.');
      getGlobalTestMode_(existing.config, existing.config.testMode);
      readHomecomingContext_(readyBinding, existing.eventId);
      if (binding.stage !== 'ready') saveMirrorBinding_(readyBinding);
      return { created: false, eventId: existing.eventId, testMode: existing.config.testMode, message: 'Use the original private admin URL. Existing keys and attendance are retained.' };
    }
    if (binding.stage === 'ready') throw new Error('Ready mirror event was erased. Owner review required.');
    assertEmptyMirrorLedger_(book.getSheetByName(binding.attendanceSheetName));
    var intakeSheet = book.getSheetByName(binding.sourceSheetName);
    if (!intakeSheet || homecomingDigest_(JSON.stringify(intakeSheet.getDataRange().getValues())) !== binding.snapshotHash) throw new Error('Prepared mirror snapshot does not match.');
    var admin = newMirrorLinkKey_(), helper = newMirrorLinkKey_();
    if (admin === helper) throw new Error('Private keys must differ.');
    var event = { version: 1, eventId: Utilities.getUuid(), revision: 1,
      adminHash: sharedTokenHash_(admin), helperHash: sharedTokenHash_(helper), helperToken: helper,
      config: { sheetUrl: 'https://docs.google.com/spreadsheets/d/' + binding.spreadsheetId + '/edit', apiUrl: apiUrl,
        sheetName: 'Ticket Checklist', firstNameCol: 'First Name', lastNameCol: 'Last Name', qrCol: 'QR_ID', statusCol: 'Status',
        admittedAtCol: 'Admitted At', guestCol: 'Bringing Guest', eventName: 'Homecoming 2026 - Mirror Test', admittedValue: 'Admitted',
        allowedStatuses: [], timeZone: 'America/New_York', testMode: true, rosterMode: 'homecoming-2026', environment: 'mirror-test' } };
    var props = PropertiesService.getScriptProperties(), serialized = JSON.stringify(event), modeKey = getTestModePropertyKey_(event.config);
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
