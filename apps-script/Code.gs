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
    var config = buildConfig_(request);

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
      return jsonResponse_(setTestMode_(config, request.testMode));
    }

    if (action === 'admit') {
      if (!request.qrValue) {
        throw new Error('Missing qrValue for admit action.');
      }
      return jsonResponse_(admitRow_(config, request.qrValue));
    }

    throw new Error('Unsupported action: ' + action);
  } catch (err) {
    return jsonResponse_({
      error: err && err.message ? err.message : String(err),
    });
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

function admitRow_(config, qrValue) {
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
    };
  }

  if (config.allowedStatuses.length) {
    var allowed = false;
    for (var i = 0; i < config.allowedStatuses.length; i += 1) {
      if (normalizeKey_(config.allowedStatuses[i]) === normalizeKey_(statusValue)) {
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
  context.sheet.getRange(sheetRowNumber, context.headerMap[config.statusCol]).setValue(config.admittedValue);
  context.sheet.getRange(sheetRowNumber, context.headerMap[config.admittedAtCol]).setValue(timestamp);

  var updatedValues = context.sheet.getRange(sheetRowNumber, 1, 1, context.headers.length).getDisplayValues()[0];
  var updatedRow = rowFromHeaders_(context.headers, updatedValues);

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

function setTestMode_(config, value) {
  var enabled = normalizeBoolean_(value);
  PropertiesService.getScriptProperties().setProperty(getTestModePropertyKey_(config), enabled ? 'true' : 'false');
  return {
    ok: true,
    testMode: enabled,
    message: 'Test mode ' + (enabled ? 'enabled' : 'disabled') + ' globally.',
  };
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
    headerMap[headers[i]] = i + 1;
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
  var normalizedTarget = normalizeKey_(qrValue);

  for (var i = 1; i < values.length; i += 1) {
    var currentQrValue = String(values[i][qrColumnIndex - 1] || '').trim();
    if (normalizeKey_(currentQrValue) === normalizedTarget) {
      return {
        row: rowFromHeaders_(context.headers, values[i], i + 1),
        rowNumber: i + 1,
        qrValue: currentQrValue,
      };
    }
  }

  return null;
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
