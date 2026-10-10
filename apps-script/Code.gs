/**
 * StudentQR Google Apps Script Web App
 *
 * Deploy this file as a Web App and paste the /exec URL into the frontend's
 * "Apps Script Web App URL" field.
 *
 * Supported requests:
 * - GET  ?action=list&...configFields
 * - POST { action: "list",  config }
 * - POST { action: "assignQrIds", config }
 * - POST { action: "admit", qrValue, config }
 * - POST { action: "setTestMode", testMode, config }
 */

function doGet(e) {
  return handleRequest_(e, 'GET');
}

function doPost(e) {
  return handleRequest_(e, 'POST');
}

function handleRequest_(e, method) {
  try {
    var request = getRequestData_(e, method);
    var action = String(request.action || '').trim().toLowerCase();
    rejectDeclaredIntakeAdapter_(request, e, method);
    var homecomingRaw = PropertiesService.getScriptProperties().getProperty('studentQrHomecomingBinding');
    var homecomingBinding = homecomingRaw ? JSON.parse(homecomingRaw) : null;
    assertDedicatedHomecomingConfigured_(homecomingBinding, readSharedEvent_());
    if (homecomingBinding) assertHomecomingBinding_(homecomingBinding, readSharedEvent_());
    if (homecomingBinding && !readSharedEvent_()) throw new Error('Homecoming is not ready. Owner initialization required.');
    if (action === 'saveevent') return jsonResponse_(saveSharedEvent_(request));
    var legacyConfig = !request.eventId && action !== 'getevent' ? buildConfig_(request) : null;
    var sharedEvent = readSharedEvent_();
    if (action === 'getevent') return jsonResponse_(sharedEventResponse_(sharedEvent, request));
    if (sharedEvent) {
      var role = authorizeSharedEvent_(sharedEvent, request);
      if (role !== 'admin' && action !== 'list' && action !== 'admit') {
        throw new Error('This action requires Eve\'s private admin link.');
      }
      if (request.revision !== sharedEvent.revision) throw new Error('Dance setup changed. Refresh the roster before scanning.');
      // A link grants access to the stored dance, never a caller-selected sheet.
    } else if (request.eventId || request.token) {
      throw new Error('Private dance link not found.');
    }
    var config = sharedEvent ? buildConfig_({ config: sharedEvent.config }) : legacyConfig || buildConfig_(request);

    if (homecomingBinding && action === 'list') {
      var homecoming = readHomecomingContext_(homecomingBinding, sharedEvent.eventId);
      var blockedRows = homecomingQuarantineRows_(homecoming.quarantine);
      var publicRows = homecomingRows_(homecoming.subjects, homecoming.attendance).concat(blockedRows);
      return jsonResponse_({ rows: publicRows, count: publicRows.length, testMode: config.testMode,
        quarantinedTicketCount: blockedRows.length, quarantinedRecordCount: homecoming.quarantine.recordCount,
        sheetName: config.sheetName, environment: 'mirror-test', rosterMode: 'homecoming-2026' });
    }
    if (homecomingBinding && action === 'assignqrids') throw new Error('Homecoming ticket IDs are fixed. ID assignment is disabled.');

    if (!config.sheetUrl) {
      throw new Error('Missing sheetUrl in request config.');
    }

    if (!config.sheetName) {
      throw new Error('Missing sheetName in request config.');
    }

    if (!action) {
      throw new Error('Missing action. Expected "list" or "admit".');
    }

    if (action === 'list') {
      return jsonResponse_(listRows_(config));
    }

    if (action === 'assignqrids') {
      return jsonResponse_(assignQrIds_(config));
    }

    if (action === 'settestmode') {
      return jsonResponse_(setTestMode_(config, request.testMode, sharedEvent ? request : null));
    }

    if (action === 'admit') {
      if (typeof request.qrValue !== 'string' || !request.qrValue.trim()) {
        throw new Error('Missing qrValue for admit action.');
      }
      return jsonResponse_(admitRow_(config, request.qrValue, sharedEvent ? request : null));
    }

    throw new Error('Unsupported action: ' + action);
  } catch (err) {
    return jsonResponse_({
      error: err && err.message ? err.message : String(err),
    });
  }
}

function readSharedEvent_() {
  var value = PropertiesService.getScriptProperties().getProperty('studentQrSharedDance');
  if (!value) return null;
  var event = JSON.parse(value);
  if (event.version !== 1 || !event.eventId || !event.config) throw new Error('Stored dance configuration is invalid.');
  return event;
}

function assertDedicatedHomecomingConfigured_(binding, event) {
  if (typeof HOMECOMING_DEPLOYMENT_KIND_ !== 'undefined' && HOMECOMING_DEPLOYMENT_KIND_ === 'mirror-test') {
    if (!binding || !event) throw new Error('Dedicated Homecoming mirror binding or event is missing. Owner initialization required.');
    assertHomecomingBinding_(binding, event);
  }
}

function sharedTokenHash_(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid private link key.');
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token).map(function(byte) {
    return ('0' + ((byte + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function authorizeSharedEvent_(event, request) {
  if (!event || request.eventId !== event.eventId) throw new Error('Private dance link not found.');
  var hash = sharedTokenHash_(request.token);
  if (hash === event.adminHash) return 'admin';
  if (hash === event.helperHash) return 'helper';
  throw new Error('Invalid private link key.');
}

function sharedEventResponse_(event, request) {
  var role = authorizeSharedEvent_(event, request);
  var config = cloneObject_(event.config);
  config.testMode = getGlobalTestMode_(config, config.testMode);
  var response = { eventId: event.eventId, role: role, revision: event.revision, config: config };
  if (role === 'admin') response.helperToken = event.helperToken;
  return response;
}

function validateSharedEventConfig_(input) {
  var fields = ['sheetUrl', 'apiUrl', 'sheetName', 'firstNameCol', 'lastNameCol', 'qrCol',
    'statusCol', 'guestCol', 'admittedAtCol', 'eventName', 'admittedValue', 'timeZone'];
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Missing shared dance setup.');
  var config = {};
  fields.forEach(function(field) {
    if (typeof input[field] !== 'string' || (field !== 'guestCol' && !input[field].trim())) {
      throw new Error('Invalid shared dance field: ' + field);
    }
    config[field] = input[field].trim();
  });
  if (!/^https?:\/\//.test(config.sheetUrl) || !/^https?:\/\//.test(config.apiUrl)) throw new Error('Invalid dance URL.');
  if (typeof input.testMode !== 'boolean') throw new Error('Invalid shared test mode.');
  config.testMode = input.testMode;
  config.allowedStatuses = [];
  return config;
}

function saveSharedEvent_(request) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Dance setup is busy. Try again.');
  try {
    var previous = readSharedEvent_();
    var bindingRaw = PropertiesService.getScriptProperties().getProperty('studentQrHomecomingBinding');
    var binding = bindingRaw ? JSON.parse(bindingRaw) : null;
    assertDedicatedHomecomingConfigured_(binding, previous);
    if (binding) {
      assertHomecomingBinding_(binding, previous);
      if (!previous) throw new Error('Homecoming bootstrap is owner-only.');
      if (authorizeSharedEvent_(previous, request) !== 'admin') throw new Error('Requires the private admin link.');
      if (request.revision !== previous.revision) throw new Error('Dance setup changed. Reload the admin link.');
      var candidate = request.config;
      if (!candidate || typeof candidate.eventName !== 'string' || !candidate.eventName.trim()) throw new Error('Invalid dance name.');
      Object.keys(previous.config).forEach(function(key) {
        if (key !== 'eventName' && key !== 'testMode' && JSON.stringify(candidate[key]) !== JSON.stringify(previous.config[key])) {
          throw new Error('Homecoming source, ledger and ticket mapping are fixed.');
        }
      });
      previous.config.eventName = candidate.eventName.trim();
      previous.config.testMode = getGlobalTestMode_(previous.config, previous.config.testMode);
      previous.revision += 1;
      var boundSerialized = JSON.stringify(previous);
      var boundProps = PropertiesService.getScriptProperties();
      boundProps.setProperty('studentQrSharedDance', boundSerialized);
      if (boundProps.getProperty('studentQrSharedDance') !== boundSerialized) throw new Error('Dance save could not be confirmed.');
      return sharedEventResponse_(previous, request);
    }
    if (previous && !request.eventId && request.adminToken && request.helperToken &&
        sharedTokenHash_(request.adminToken) === previous.adminHash && sharedTokenHash_(request.helperToken) === previous.helperHash &&
        JSON.stringify(validateSharedEventConfig_(request.config)) === JSON.stringify(previous.config)) {
      return sharedEventResponse_(previous, { eventId: previous.eventId, token: request.adminToken });
    }
    if (previous) {
      if (authorizeSharedEvent_(previous, request) !== 'admin') throw new Error('Requires the private admin link.');
      if (request.revision !== previous.revision) throw new Error('Dance setup changed. Reload Eve\'s admin link before saving.');
    }
    var config = validateSharedEventConfig_(request.config);
    // Read-only readiness check: do not issue working links for an incompatible sheet.
    getSheetContext_(config);
    var event = previous || {
      version: 1, eventId: Utilities.getUuid(), revision: 0,
      adminHash: sharedTokenHash_(request.adminToken), helperHash: sharedTokenHash_(request.helperToken),
      helperToken: request.helperToken
    };
    if (event.adminHash === event.helperHash) throw new Error('Admin and helper link keys must differ.');
    event.config = config;
    event.revision += 1;
    var serialized = JSON.stringify(event);
    if (serialized.length > 8000) throw new Error('Dance setup is too large to save.');
    var properties = PropertiesService.getScriptProperties();
    properties.setProperty('studentQrSharedDance', serialized);
    if (properties.getProperty('studentQrSharedDance') !== serialized) throw new Error('Shared dance save could not be confirmed.');
    return sharedEventResponse_(event, { eventId: event.eventId, token: request.token || request.adminToken });
  } finally {
    lock.releaseLock();
  }
}

function getRequestData_(e, method) {
  var params = (e && e.parameter) || {};
  var request = cloneObject_(params);

  if (method === 'POST' && e && e.postData && e.postData.contents) {
    var bodyText = String(e.postData.contents || '').trim();
    if (bodyText) {
      try {
        var parsed = JSON.parse(bodyText);
        request = mergeObjects_(request, parsed);
      } catch (err) {
        throw new Error('POST body must be valid JSON.');
      }
    }
  }

  return request;
}

function rejectDeclaredIntakeAdapter_(request, e, method) {
  var declarations = [];
  function inspect(source) {
    if (!source || typeof source !== 'object') return;
    if (Object.prototype.hasOwnProperty.call(source, 'adapter')) {
      declarations.push(source.adapter);
    }
    var config = source.config;
    if (config && typeof config === 'string') {
      try {
        config = JSON.parse(config);
      } catch (err) {
        throw new Error('config must be valid JSON when provided as a string.');
      }
    }
    if (config && typeof config === 'object' && Object.prototype.hasOwnProperty.call(config, 'adapter')) {
      declarations.push(config.adapter);
    }
  }
  inspect(request);
  // Check the original inputs too; POST merging must not hide a declaration.
  inspect(e && e.parameter);
  if (method === 'POST' && e && e.postData && e.postData.contents) {
    var bodyText = String(e.postData.contents).trim();
    if (bodyText) inspect(JSON.parse(bodyText));
  }
  var multipleParams = e && e.parameters;
  if (multipleParams) {
    if (Object.prototype.hasOwnProperty.call(multipleParams, 'adapter')) {
      var adapters = multipleParams.adapter;
      if (!Array.isArray(adapters)) adapters = [adapters];
      if (!adapters.length) declarations.push(adapters);
      for (var p = 0; p < adapters.length; p += 1) declarations.push(adapters[p]);
    }
    if (Array.isArray(multipleParams.config)) {
      for (var q = 0; q < multipleParams.config.length; q += 1) inspect({ config: multipleParams.config[q] });
    }
  }
  if (!declarations.length) return;
  for (var i = 0; i < declarations.length; i += 1) {
    if (typeof declarations[i] !== 'string' || !declarations[i] ||
        declarations[i].trim() !== declarations[i] || /[\u0000-\u001f\u007f-\u009f]/.test(declarations[i])) {
      throw new Error('Invalid adapter declaration; combined intake is disabled.');
    }
  }
  for (var j = 1; j < declarations.length; j += 1) {
    if (declarations[j] !== declarations[0]) {
      throw new Error('Conflicting adapter declarations; combined intake is disabled.');
    }
  }
  if (declarations[0] === 'combined-intake-v1') {
    throw new Error('Combined intake adapter is disabled. The read-only projection is not an admission endpoint.');
  }
  throw new Error('Unsupported adapter; combined intake is disabled.');
}

function combinedProjectionError_(message) {
  throw new Error('Combined intake: ' + message);
}

function combinedEmptyCell_(value) {
  return value === '' || value === null;
}

function combinedLiteralIdentity_(value, label) {
  if (typeof value !== 'string' || !value || value.trim() !== value ||
      /[\u0000-\u001f\u007f-\u009f]/.test(value)) {
    combinedProjectionError_(label + ' must be a nonempty, unpadded raw string without control characters.');
  }
  return value;
}

function combinedFullName_(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    combinedProjectionError_(label + ' must be nonblank full-name text.');
  }
  return value;
}

// Pure input projection only: no Sheet reads, inferred approval or attendance writes.
function projectCombinedIntake_(values) {
  var headers = ['Gateway student name', 'Student ID', 'Student ticket #', 'Grade',
    'Bringing guest?', 'Guest name', 'Guest form submitted?', 'Guest ID uploaded?',
    'School email received?', 'Guest ticket #'];
  if (!Array.isArray(values) || values.length < 5) {
    combinedProjectionError_('Expected raw rows with the exact header at row 5.');
  }
  for (var r = 0; r < values.length; r += 1) {
    var rowDescriptor = Object.getOwnPropertyDescriptor(values, r);
    if (!rowDescriptor || !Object.prototype.hasOwnProperty.call(rowDescriptor, 'value') ||
        !Array.isArray(rowDescriptor.value)) {
      combinedProjectionError_('Every row must be a dense raw cell array.');
    }
    var cells = rowDescriptor.value;
    if (r >= 4 && cells.length < 10) combinedProjectionError_('Header/data rows require ten cells.');
    for (var c = 0; c < cells.length; c += 1) {
      var cellDescriptor = Object.getOwnPropertyDescriptor(cells, c);
      if (!cellDescriptor || !Object.prototype.hasOwnProperty.call(cellDescriptor, 'value')) {
        combinedProjectionError_('Sparse cells and accessors are not raw cell data.');
      }
      var cell = cellDescriptor.value;
      if (cell !== null && typeof cell !== 'string' && typeof cell !== 'boolean' &&
          !(typeof cell === 'number' && isFinite(cell))) {
        combinedProjectionError_('Cells must be raw scalar values, not containers or undefined.');
      }
      if (r >= 4 && c >= 10 && !combinedEmptyCell_(cell)) {
        combinedProjectionError_('Unknown populated extra header/data columns are not supported.');
      }
    }
  }
  for (var h = 0; h < headers.length; h += 1) {
    if (values[4][h] !== headers[h]) combinedProjectionError_('Row 5 headers must match the exact ten-column schema.');
  }
  var subjects = [], studentIds = Object.create(null), tickets = Object.create(null), trailingEmpty = false;
  function addSubject(personType, ticketId, sourceStudentId, fullName, sourceRow) {
    if (Object.prototype.hasOwnProperty.call(tickets, ticketId)) combinedProjectionError_('Duplicate ticket across subjects.');
    tickets[ticketId] = true;
    subjects.push({ personType: personType, ticketId: ticketId, sourceStudentId: sourceStudentId,
      fullName: fullName, sourceRow: sourceRow });
  }
  for (var rowIndex = 5; rowIndex < values.length; rowIndex += 1) {
    var row = values[rowIndex], empty = true;
    for (var column = 0; column < row.length; column += 1) {
      if (!combinedEmptyCell_(row[column])) { empty = false; break; }
    }
    if (empty) { trailingEmpty = true; continue; }
    if (trailingEmpty) combinedProjectionError_('An empty interior data row interrupts the intake.');
    var studentId = combinedLiteralIdentity_(row[1], 'Student ID');
    if (Object.prototype.hasOwnProperty.call(studentIds, studentId)) combinedProjectionError_('Duplicate student source ID.');
    studentIds[studentId] = true;
    var studentTicket = combinedLiteralIdentity_(row[2], 'Student ticket');
    var studentName = combinedFullName_(row[0], 'Student name');
    var guestDeclaration = row[4];
    if (guestDeclaration === 'Yes') {
      var guestName = combinedFullName_(row[5], 'Guest name');
      var guestTicket = combinedLiteralIdentity_(row[9], 'Guest ticket');
      addSubject('Student', studentTicket, studentId, studentName, rowIndex + 1);
      addSubject('Guest', guestTicket, studentId, guestName, rowIndex + 1);
    } else if (guestDeclaration === 'No' || combinedEmptyCell_(guestDeclaration)) {
      if (!combinedEmptyCell_(row[5]) || !combinedEmptyCell_(row[9])) {
        combinedProjectionError_('Guest name/ticket contradict the guest declaration.');
      }
      addSubject('Student', studentTicket, studentId, studentName, rowIndex + 1);
    } else {
      combinedProjectionError_('Guest declaration must be exact Yes, No or empty.');
    }
  }
  return { readOnly: true, admissionEnabled: false, subjects: subjects };
}

function buildConfig_(request) {
  var rawConfig = request.config;
  var parsedConfig = {};

  if (rawConfig && typeof rawConfig === 'string') {
    try {
      parsedConfig = JSON.parse(rawConfig);
    } catch (err) {
      throw new Error('config must be valid JSON when provided as a string.');
    }
  } else if (rawConfig && typeof rawConfig === 'object') {
    parsedConfig = rawConfig;
  }

  var merged = mergeObjects_(request, parsedConfig);

  merged.allowedStatuses = normalizeAllowedStatuses_(merged.allowedStatuses);
  merged.firstNameCol = merged.firstNameCol || 'First Name';
  merged.lastNameCol = merged.lastNameCol || 'Last Name';
  merged.qrCol = merged.qrCol || 'QR_ID';
  merged.statusCol = merged.statusCol || 'Status';
  merged.admittedAtCol = merged.admittedAtCol || 'Admitted At';
  merged.admittedValue = merged.admittedValue || 'Admitted';
  merged.timeZone = merged.timeZone || Session.getScriptTimeZone() || 'America/New_York';
  merged.testMode = getGlobalTestMode_(merged, normalizeBoolean_(merged.testMode));

  return merged;
}

function listRows_(config) {
  var context = getSheetContext_(config);
  var values = context.sheet.getDataRange().getDisplayValues();

  if (!values.length) {
    return {
      rows: [],
      message: 'The worksheet is empty.',
    };
  }

  if (values.length === 1) {
    return {
      rows: [],
      message: 'The worksheet only has a header row and no student records yet.',
    };
  }

  var rows = objectRowsFromValues_(values);

  return {
    rows: rows,
    count: rows.length,
    sheetName: config.sheetName,
    testMode: config.testMode,
  };
}

function admitRow_(config, qrValue, eventRequest) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error('Another admission is being processed. Please scan again.');
  }
  try {
    if (eventRequest) {
      var latest = readSharedEvent_();
      authorizeSharedEvent_(latest, eventRequest);
      if (latest.revision !== eventRequest.revision) throw new Error('Dance setup changed. Refresh the roster before scanning.');
      config = buildConfig_({ config: latest.config });
      var bindingRaw = PropertiesService.getScriptProperties().getProperty('studentQrHomecomingBinding');
      assertDedicatedHomecomingConfigured_(bindingRaw ? JSON.parse(bindingRaw) : null, latest);
      if (bindingRaw) {
        var binding = assertHomecomingBinding_(JSON.parse(bindingRaw), latest);
        return admitHomecomingLocked_(config, binding, qrValue, latest.eventId, eventRequest.expectedAssignmentHash);
      }
    }
    config.testMode = getGlobalTestMode_(config, config.testMode);
    return admitRowLocked_(config, qrValue);
  } finally {
    lock.releaseLock();
  }
}

function admitRowLocked_(config, qrValue) {
  var context = getSheetContext_(config);
  var values = context.sheet.getDataRange().getDisplayValues();

  if (values.length < 2) {
    throw new Error('The worksheet does not contain any student rows.');
  }

  var target = findRowByQrInValues_(values, context, qrValue, config.qrCol);

  if (!target) {
    return {
      error: 'Student not found for QR value: ' + qrValue,
      qrValue: qrValue,
    };
  }

  var statusValue = String(target.row[config.statusCol] || '').trim();
  if (statusValue && normalizeKey_(statusValue) === normalizeKey_(config.admittedValue)) {
    return {
      row: target.row,
      matchedQrValue: target.qrValue,
      message: 'Student was already marked as admitted.',
      alreadyAdmitted: true,
      testMode: config.testMode,
    };
  }

  if (config.allowedStatuses.length) {
    var normalizedStatusValue = normalizeKey_(statusValue);
    var allowed = !normalizedStatusValue || normalizedStatusValue === 'missing';
    for (var i = 0; i < config.allowedStatuses.length; i += 1) {
      if (normalizeKey_(config.allowedStatuses[i]) === normalizedStatusValue) {
        allowed = true;
        break;
      }
    }
    if (!allowed) {
      return {
        error: 'Student cannot be admitted from status "' + statusValue + '".',
        row: target.row,
        matchedQrValue: target.qrValue,
      };
    }
  }

  var timestamp = Utilities.formatDate(
    new Date(),
    config.timeZone,
    "yyyy-MM-dd'T'HH:mm:ss"
  );

  if (config.testMode) {
    return {
      row: target.row,
      matchedQrValue: target.qrValue,
      message: 'Test mode enabled. No attendance update was written.',
      testMode: true,
    };
  }

  var sheetRowNumber = target.rowNumber;
  var statusCell = context.sheet.getRange(sheetRowNumber, context.headerMap[config.statusCol]);
  var timestampCell = context.sheet.getRange(sheetRowNumber, context.headerMap[config.admittedAtCol]);
  var originalStatus = statusCell.getFormula() || statusCell.getValue();
  var originalTimestamp = timestampCell.getFormula() || timestampCell.getValue();
  var updatedRow;
  try {
    statusCell.setValue(config.admittedValue);
    timestampCell.setValue(timestamp);
    SpreadsheetApp.flush();
    var updatedValues = context.sheet.getRange(sheetRowNumber, 1, 1, context.headers.length).getDisplayValues()[0];
    updatedRow = rowFromHeaders_(context.headers, updatedValues);
    if (String(updatedRow[config.qrCol]).trim() !== target.qrValue ||
        normalizeKey_(updatedRow[config.statusCol]) !== normalizeKey_(config.admittedValue) ||
        String(updatedRow[config.admittedAtCol]).trim() !== timestamp) {
      throw new Error('Attendance readback did not match the requested update.');
    }
  } catch (err) {
    // Sheets writes are not transactional. Restore both cells before releasing the lock.
    var rollbackFailed = false;
    try { statusCell.setValue(originalStatus); } catch (statusError) { rollbackFailed = true; }
    try { timestampCell.setValue(originalTimestamp); } catch (timestampError) { rollbackFailed = true; }
    try { SpreadsheetApp.flush(); } catch (flushError) { rollbackFailed = true; }
    try {
      if (String(statusCell.getFormula() || statusCell.getValue()) !== String(originalStatus) ||
          String(timestampCell.getFormula() || timestampCell.getValue()) !== String(originalTimestamp)) {
        rollbackFailed = true;
      }
    } catch (readbackError) { rollbackFailed = true; }
    if (rollbackFailed) {
      throw new Error('Admission uncertain. Verify this student\'s attendance in the sheet before retrying. ' + err.message);
    }
    throw new Error('Admission could not be confirmed; previous attendance was restored. ' + err.message);
  }

  return {
    row: updatedRow,
    matchedQrValue: target.qrValue,
    message: 'Student admitted successfully.',
    testMode: false,
  };
}

function assignQrIds_(config) {
  var context = getSheetContext_(config);
  var values = context.sheet.getDataRange().getDisplayValues();

  if (values.length < 2) {
    return {
      rows: [],
      assignedCount: 0,
      skippedCount: 0,
      message: 'No student rows found to assign QR IDs.',
    };
  }

  var assignedCount = 0;
  var skippedCount = 0;
  var qrColumnIndex = context.headerMap[config.qrCol];
  var existingQrIds = {};

  for (var i = 1; i < values.length; i += 1) {
    var currentQr = String(values[i][qrColumnIndex - 1] || '').trim();
    if (!currentQr) continue;
    existingQrIds[normalizeKey_(currentQr)] = true;
  }

  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    var qrCellValue = String(values[rowIndex][qrColumnIndex - 1] || '').trim();
    if (qrCellValue) {
      skippedCount += 1;
      continue;
    }

    var generatedQrId = generateUniqueQrId_(config, existingQrIds);
    context.sheet.getRange(rowIndex + 1, qrColumnIndex).setValue(generatedQrId);
    values[rowIndex][qrColumnIndex - 1] = generatedQrId;
    existingQrIds[normalizeKey_(generatedQrId)] = true;
    assignedCount += 1;
  }

  return {
    rows: objectRowsFromValues_(values),
    assignedCount: assignedCount,
    skippedCount: skippedCount,
    message: 'Assigned ' + assignedCount + ' QR IDs. Skipped ' + skippedCount + ' existing values.',
    testMode: config.testMode,
  };
}

function setTestMode_(config, value, eventRequest) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Admission or mode change busy. Try again.');
  try {
    var latest = null;
    if (eventRequest) {
      latest = readSharedEvent_();
      if (authorizeSharedEvent_(latest, eventRequest) !== 'admin') throw new Error('Requires the private admin link.');
      if (latest.revision !== eventRequest.revision) throw new Error('Dance setup changed. Refresh before changing mode.');
      config = buildConfig_({ config: latest.config });
      var bindingRaw = PropertiesService.getScriptProperties().getProperty('studentQrHomecomingBinding');
      assertDedicatedHomecomingConfigured_(bindingRaw ? JSON.parse(bindingRaw) : null, latest);
      if (bindingRaw) assertHomecomingBinding_(JSON.parse(bindingRaw), latest);
      if (bindingRaw && typeof value !== 'boolean') throw new Error('Homecoming mode requires an explicit boolean.');
    }
    var enabled = normalizeBoolean_(value), properties = PropertiesService.getScriptProperties();
    var key = getTestModePropertyKey_(config), stored = enabled ? 'true' : 'false';
    // Both modes and admissions use this lock. An uncertain update fails closed.
    properties.setProperty(key, stored);
    if (latest) {
      latest.config.testMode = enabled;
      var serialized = JSON.stringify(latest);
      properties.setProperty('studentQrSharedDance', serialized);
      if (properties.getProperty('studentQrSharedDance') !== serialized) throw new Error('Global mode not confirmed.');
    }
    if (properties.getProperty(key) !== stored) throw new Error('Global mode not confirmed.');
    return { ok: true, testMode: enabled, message: 'Test mode ' + (enabled ? 'enabled' : 'disabled') + ' globally.' };
  } finally { lock.releaseLock(); }
}

function getSheetContext_(config) {
  var spreadsheet = SpreadsheetApp.openByUrl(config.sheetUrl);
  var sheet = spreadsheet.getSheetByName(config.sheetName);

  if (!sheet) {
    throw new Error('Worksheet tab not found: ' + config.sheetName);
  }

  var values = sheet.getDataRange().getDisplayValues();
  if (!values.length) {
    throw new Error('Worksheet is empty. Add a header row first.');
  }

  var headers = values[0].map(function(header) {
    return String(header || '').trim();
  });

  var requiredHeaders = [
    config.firstNameCol,
    config.lastNameCol,
    config.qrCol,
    config.statusCol,
    config.admittedAtCol,
  ];

  var headerMap = {};
  for (var i = 0; i < headers.length; i += 1) {
    if (!headers[i]) continue;
    if (headerMap[headers[i]]) throw new Error('Duplicate column header: ' + headers[i]);
    headerMap[headers[i]] = i + 1;
  }

  if (config.qrCol === config.statusCol || config.qrCol === config.admittedAtCol || config.statusCol === config.admittedAtCol) {
    throw new Error('QR, status and timestamp must use different columns.');
  }

  for (var j = 0; j < requiredHeaders.length; j += 1) {
    var requiredHeader = requiredHeaders[j];
    if (!headerMap[requiredHeader]) {
      throw new Error('Missing required column header: ' + requiredHeader);
    }
  }

  return {
    sheet: sheet,
    headers: headers,
    headerMap: headerMap,
  };
}

function objectRowsFromValues_(values) {
  var headers = values[0].map(function(header) {
    return String(header || '').trim();
  });

  var rows = [];
  for (var i = 1; i < values.length; i += 1) {
    rows.push(rowFromHeaders_(headers, values[i], i + 1));
  }
  return rows;
}

function rowFromHeaders_(headers, rowValues, rowNumber) {
  var row = {};
  for (var i = 0; i < headers.length; i += 1) {
    if (!headers[i]) continue;
    row[headers[i]] = rowValues[i] || '';
  }
  if (rowNumber) {
    row._rowNumber = rowNumber;
  }
  return row;
}

function findRowByQrInValues_(values, context, qrValue, qrColumnName) {
  var qrColumnIndex = context.headerMap[qrColumnName];
  var targetValue = typeof qrValue === 'string' ? qrValue.trim() : '';
  if (!targetValue) throw new Error('Missing string QR value.');
  var target = null;

  for (var i = 1; i < values.length; i += 1) {
    var currentQrValue = String(values[i][qrColumnIndex - 1] || '').trim();
    if (currentQrValue && currentQrValue === targetValue) {
      if (target) throw new Error('Duplicate QR_ID on the roster. Resolve the duplicate before admitting this student.');
      target = {
        row: rowFromHeaders_(context.headers, values[i], i + 1),
        rowNumber: i + 1,
        qrValue: currentQrValue,
      };
    }
  }

  return target;
}

function normalizeAllowedStatuses_(value) {
  if (Array.isArray(value)) {
    return value.map(function(item) {
      return String(item || '').trim();
    }).filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map(function(item) {
      return item.trim();
    })
    .filter(Boolean);
}

function normalizeBoolean_(value) {
  if (typeof value === 'boolean') return value;
  var normalized = String(value || '').toLowerCase().trim();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function getGlobalTestMode_(config, fallbackValue) {
  var stored = PropertiesService.getScriptProperties().getProperty(getTestModePropertyKey_(config));
  if (config.rosterMode === 'homecoming-2026' &&
      (!['true', 'false'].includes(stored) || typeof config.testMode !== 'boolean' || (stored === 'true') !== config.testMode)) {
    throw new Error('Homecoming global mode is unconfirmed. Owner review required.');
  }
  if (stored == null || stored === '') {
    return fallbackValue;
  }
  return normalizeBoolean_(stored);
}

function getTestModePropertyKey_(config) {
  return 'testMode:' + extractSpreadsheetId_(config.sheetUrl) + ':' + String(config.sheetName || '');
}

function extractSpreadsheetId_(sheetUrl) {
  var match = String(sheetUrl || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    return String(sheetUrl || '');
  }
  return match[1];
}

function generateUniqueQrId_(config, existingQrIds) {
  var prefix = buildQrPrefix_(config);

  while (true) {
    var candidate = prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
    if (!existingQrIds[normalizeKey_(candidate)]) {
      return candidate;
    }
  }
}

function buildQrPrefix_(config) {
  var source = String(config.eventName || config.sheetName || 'student').trim().toUpperCase();
  var cleaned = source.replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!cleaned) {
    return 'STUDENT';
  }
  return cleaned.slice(0, 24);
}

function normalizeKey_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function cloneObject_(value) {
  return mergeObjects_({}, value || {});
}

function mergeObjects_(base, extra) {
  var result = {};
  var key;

  for (key in base) {
    if (Object.prototype.hasOwnProperty.call(base, key)) {
      result[key] = base[key];
    }
  }

  for (key in extra) {
    if (Object.prototype.hasOwnProperty.call(extra, key)) {
      result[key] = extra[key];
    }
  }

  return result;
}
