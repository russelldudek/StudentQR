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

