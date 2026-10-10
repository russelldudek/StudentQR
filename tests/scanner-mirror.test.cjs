'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, intake, production } = require('./helpers/homecoming-fixtures.cjs');
test('pure mirror copies exact tickets and guest pairings, strips real names and identifiers', () => {
  const f = fixture(); f.ctx.raw = intake();
  const result = f.run('buildMirrorIntake_(raw)');
  assert.equal(result[5][2], '001'); assert.equal(result[5][9], '001B'); assert.equal(result[6][2], '083');
  assert.equal(result[5][4], 'Yes'); assert.equal(result[5][1], 'MIRROR-0001');
  assert.equal(result[5][0], 'Practice Student 1'); assert.equal(result[5][5], 'Practice Guest 1');
  assert.deepEqual(Array.from(result[5].slice(6, 9)), ['', '', '']); assert.equal(result[5][3], '');
  assert.equal(f.trace.length, 0);
});
test('prepare reads source only and writes only distinct mirror; repeat does not reset attendance', () => {
  const f = fixture(); const prepared = f.run('prepareHomecomingMirrorTest()');
  assert.equal(prepared.stage, 'preparing'); assert.notEqual(prepared.spreadsheetId, production);
  assert(f.writes().every(t => t[1] === prepared.spreadsheetId));
  const writes = f.writes().length; assert.equal(f.run('prepareHomecomingMirrorTest()').spreadsheetId, prepared.spreadsheetId);
  f.run('initializeHomecomingMirrorTest()'); f.run('prepareHomecomingMirrorTest()');
  assert.equal(f.writes().length, writes);
});
test('approved mirror-only student number formatting preserves explicit guest strings and source', () => {
  const source = intake(); source[5][2] = 47; source[5][9] = '47B'; const f = fixture({ source });
  f.ctx.raw = source;
  const values = f.run('buildMirrorIntake_(raw)'); assert.equal(values[5][2], '047'); assert.equal(values[5][9], '47B');
  assert.equal(source[5][2], 47); assert.equal(values[5][4], 'Yes');
});
test('out-of-format numeric source tickets are quarantined without editing source', () => {
  const source = intake(); source[6][2] = 1000; const f = fixture({ source });
  f.ctx.raw = source; const snapshot = f.run('buildMirrorSnapshot_(raw)');
  assert.equal(snapshot.intakeValues.length, 6); assert(snapshot.quarantineValues.some(r => r[0] === '"1000"'));
  assert.equal(source[6][2], 1000);
});
test('failed target population retries stored ID, never creates a second workbook', () => {
  const f = fixture(); f.fault.fail = 'write'; assert.throws(() => f.run('prepareHomecomingMirrorTest()'), /Injected/);
  const id = JSON.parse(f.properties.get('studentQrHomecomingBinding')).spreadsheetId;
  f.fault.fail = ''; assert.equal(f.run('prepareHomecomingMirrorTest()').spreadsheetId, id); assert.equal(f.books.size, 3);
});
test('unknown create result without ID halts retry for owner inspection', () => {
  const f = fixture(); f.fault.fail = 'create'; assert.throws(() => f.run('prepareHomecomingMirrorTest()'), /Injected/);
  f.fault.fail = ''; assert.throws(() => f.run('prepareHomecomingMirrorTest()'), /inspect/i); assert.equal(f.books.size, 2);
});
test('initialization issues distinct private keys, global read-only mode and helper-safe responses', () => {
  const f = fixture(); f.run('prepareHomecomingMirrorTest()'); const initialized = f.run('initializeHomecomingMirrorTest()');
  const adminUrl = new URL(initialized.adminUrl), helperUrl = new URL(initialized.helperUrl);
  assert.notEqual(adminUrl.hash, helperUrl.hash); assert.match(adminUrl.hash, /^#key=[a-f0-9]{64}$/);
  const helperKey = helperUrl.hash.slice(5), adminKey = adminUrl.hash.slice(5);
  const eventId = helperUrl.searchParams.get('event');
  const response = f.request({ action: 'getEvent', eventId, token: helperKey });
  assert.equal(response.config.environment, 'mirror-test'); assert.equal(response.config.testMode, true);
  assert(!JSON.stringify(response).includes(adminKey)); assert(![...f.properties.values()].join('').includes(adminKey));
  const repeat = f.run('initializeHomecomingMirrorTest()'); assert.equal(repeat.created, false); assert.equal(repeat.adminUrl, undefined);
  assert.equal(repeat.eventId, initialized.eventId);
});
for (const url of [null, 'https://script.google.com/macros/s/FICTIONAL/dev', 'https://evil.invalid/exec']) {
  test('initialization requires real exec deployment URL: ' + url, () => {
    const f = fixture({ url }); f.run('prepareHomecomingMirrorTest()');
    assert.throws(() => f.run('initializeHomecomingMirrorTest()'), /exec/i); assert.equal(f.properties.has('studentQrSharedDance'), false);
  });
}
test('owner-configured exec URL supports editor initialization when service returns dev', () => {
  const f = fixture({ url: 'https://script.google.com/a/gatewayk12.org/macros/s/EDITOR/dev' });
  f.properties.set('studentQrMirrorDeploymentUrl', 'https://script.google.com/macros/s/VERIFIED/exec');
  f.run('prepareHomecomingMirrorTest()');
  const links = f.run('initializeHomecomingMirrorTest()');
  assert.equal(new URL(links.adminUrl).searchParams.get('api'), 'https://script.google.com/macros/s/VERIFIED/exec');
  assert.equal(f.run('initializeHomecomingMirrorTest()').created, false);
  assert.equal(f.run('recoverHomecomingMirrorAdminLink()').eventId, links.eventId);
  f.properties.set('studentQrMirrorDeploymentUrl', 'https://script.google.com/macros/s/CHANGED/exec');
  assert.throws(() => f.run('initializeHomecomingMirrorTest()'), /changed/i);
  assert.throws(() => f.run('recoverHomecomingMirrorAdminLink()'), /original/i);
});
for (const invalid of ['https://evil.invalid/exec', 'https://script.google.com/macros/s/VERIFIED/dev', 'https://script.google.com/macros/s/VERIFIED/exec?token=wrong']) {
  test('invalid owner deployment override fails closed: ' + invalid, () => {
    const f = fixture(); f.properties.set('studentQrMirrorDeploymentUrl', invalid);
    f.run('prepareHomecomingMirrorTest()');
    assert.throws(() => f.run('initializeHomecomingMirrorTest()'), /exec/i);
    assert.equal(f.properties.has('studentQrSharedDance'), false);
  });
}
test('production binding tampering cannot provision or initialize', () => {
  const f = fixture(); f.run('prepareHomecomingMirrorTest()');
  const b = JSON.parse(f.properties.get('studentQrHomecomingBinding')); b.spreadsheetId = production;
  f.properties.set('studentQrHomecomingBinding', JSON.stringify(b)); const writes = f.writes().length;
  assert.throws(() => f.run('prepareHomecomingMirrorTest()'), /Production|target|safe/i);
  assert.throws(() => f.run('initializeHomecomingMirrorTest()'), /Production|target|safe/i); assert.equal(f.writes().length, writes);
});
for (const failure of ['property', 'flush', 'readback']) {
  test('prepare ' + failure + ' failure never issues working event or resets a workbook', () => {
    const f = fixture(); f.fault.fail = failure;
    assert.throws(() => f.run('prepareHomecomingMirrorTest()'), /Injected/);
    assert.equal(f.properties.has('studentQrSharedDance'), false);
    assert(f.writes().every(t => t[1] !== production));
  });
}
test('existing ledger attendance prevents interrupted preparation from resetting history', () => {
  const f = fixture(); const b = f.run('prepareHomecomingMirrorTest()');
  f.books.get(b.spreadsheetId).getSheetByName('Check-ins').values.push(['existing', '', '', '', '', '', '']);
  const writes = f.writes().length;
  assert.throws(() => f.run('prepareHomecomingMirrorTest()'), /attendance|reset/); assert.equal(f.writes().length, writes);
});
test('formula-like literal tickets survive RichText mirror copying without becoming formulas', () => {
  const source = intake(); source[6][2] = '=1+1'; const f = fixture({ source });
  const b = f.run('prepareHomecomingMirrorTest()');
  assert.equal(f.books.get(b.spreadsheetId).getSheetByName('Ticket Checklist').values[6][2], '=1+1');
});
test('interrupted initialization requires explicit owner recovery and retains event/helper/attendance', () => {
  const f = fixture(); f.run('prepareHomecomingMirrorTest()');
  f.fault.onProperty = (key,value) => { if (key === 'studentQrHomecomingBinding' && JSON.parse(value).stage === 'ready') throw Error('Injected final ready save'); };
  assert.throws(() => f.run('initializeHomecomingMirrorTest()'), /Injected/);
  const event = JSON.parse(f.properties.get('studentQrSharedDance'));
  f.fault.onProperty = null;
  assert.throws(() => f.run('initializeHomecomingMirrorTest()'), /recoverHomecomingMirrorAdminLink/);
  const recovered = f.run('recoverHomecomingMirrorAdminLink()'); const latest = JSON.parse(f.properties.get('studentQrSharedDance'));
  assert.equal(recovered.eventId, event.eventId); assert.equal(latest.helperToken, event.helperToken); assert.notEqual(latest.adminHash, event.adminHash);
  assert.match(recovered.adminUrl, /#key=[a-f0-9]{64}$/); assert.equal(latest.revision, event.revision + 1);
  assert.equal(f.books.get(JSON.parse(f.properties.get('studentQrHomecomingBinding')).spreadsheetId).getSheetByName('Check-ins').values.length, 1);
});
test('duplicate host ticket quarantines both owners and linked guests; safe ticket remains', () => {
  const source = intake(); source.push(['Other Student', 'SID-003', '001', '', 'Yes', 'Other Guest', '', '', '', '099B']);
  const f = fixture({ source }); f.ctx.raw = source;
  const snapshot = f.run('buildMirrorSnapshot_(raw)');
  assert.equal(snapshot.intakeValues.length, 6); assert.equal(snapshot.intakeValues[5][2], '083');
  const tickets = snapshot.quarantineValues.slice(1).map(r => JSON.parse(r[0]));
  assert(tickets.includes('001')); assert(tickets.includes('001B')); assert(tickets.includes('099B'));
  assert.equal(snapshot.quarantinedRecordCount, 2);
});
test('ambiguous ticket text blocks potential printed numbers conservatively, not as admission aliases', () => {
  const source = intake(); source[6][2] = '(083) 084'; source.push(['Safe Student', 'SID-003', '083', '', 'No', '', '', '', '', '']);
  const f = fixture({ source }); f.ctx.raw = source;
  const snapshot = f.run('buildMirrorSnapshot_(raw)');
  const tickets = snapshot.quarantineValues.slice(1).map(r => JSON.parse(r[0]));
  assert(tickets.includes('083')); assert(tickets.includes('084')); assert(tickets.includes('(083) 084'));
  assert.equal(snapshot.intakeValues[5][2], '001');
});
test('padded source ticket reserves its printed candidate and quarantines any conflicting literal owner', () => {
  const source = intake(); source.push(['Other Student', 'SID-003', ' 083 ', '', 'No', '', '', '', '', '']);
  const f = fixture({ source }); f.ctx.raw = source;
  const snapshot = f.run('buildMirrorSnapshot_(raw)');
  assert.equal(snapshot.intakeValues.length, 6); assert.equal(snapshot.quarantinedRecordCount, 2);
  assert(snapshot.quarantineValues.some(r => r[0] === '"083"'));
});
test('computed ticket errors quarantine the whole pair and never admit in practice', () => {
  for (const error of ['#ERROR!', '#N/A', '#REF!', '#DIV/0!']) {
    const source = intake(); source[5][9] = error;
    const f = fixture({ source }); f.ctx.raw = source;
    const snapshot = f.run('buildMirrorSnapshot_(raw)');
    assert.equal(snapshot.intakeValues.length, 6); assert.equal(snapshot.intakeValues[5][2], '083');
    assert.equal(snapshot.quarantinedRecordCount, 1);
    f.run('prepareHomecomingMirrorTest()'); const links = f.run('initializeHomecomingMirrorTest()');
    const credentials = { eventId: links.eventId, revision: 1, token: new URL(links.adminUrl).hash.slice(5) };
    f.request({ action: 'setTestMode', testMode: false, ...credentials });
    const writes = f.writes().length;
    assert(f.request({ action: 'admit', qrValue: error, ...credentials }).error);
    assert.equal(f.writes().length, writes);
  }
});
test('non-ticket personal text is omitted from mirror diagnostics and public quarantine', () => {
  const source = intake(); source[6][1] = ''; source[6][2] = 'Sensitive Real Name';
  const f = fixture({ source }); f.ctx.raw = source;
  const snapshot = f.run('buildMirrorSnapshot_(raw)');
  assert(!JSON.stringify(snapshot).includes('Sensitive Real Name'));
  f.run('prepareHomecomingMirrorTest()'); const links = f.run('initializeHomecomingMirrorTest()');
  const listed = f.request({ action: 'list', eventId: links.eventId, token: new URL(links.helperUrl).hash.slice(5) });
  assert.equal(listed.quarantinedRecordCount, 1); assert.equal(listed.quarantinedTicketCount, 0);
  assert(!JSON.stringify(listed).includes('Sensitive Real Name'));
});
test('quarantined ticket is visible and blocked in both modes, never exposed with real identity', () => {
  const source = intake(); source.push(['Other Student', 'SID-003', '001', '', 'No', '', '', '', '', '']);
  const f = fixture({ source }); const prepared = f.run('prepareHomecomingMirrorTest()'); const initialized = f.run('initializeHomecomingMirrorTest()');
  const u = new URL(initialized.helperUrl); const credentials = { eventId: initialized.eventId, token: u.hash.slice(5), revision: 1 };
  const listed = f.request({ action: 'list', ...credentials });
  assert.equal(listed.rows.find(r => r.QR_ID === '001').Status, 'Quarantined'); assert.equal(listed.quarantinedRecordCount, 2);
  assert(!JSON.stringify(listed).includes('Other Student')); assert(!JSON.stringify(listed).includes('SID-'));
  const writes = f.writes().length;
  assert.match(f.request({ action: 'admit', qrValue: '001', ...credentials }).error, /quarantined/i); assert.equal(f.writes().length, writes);
  const adminKey = new URL(initialized.adminUrl).hash.slice(5);
  assert.equal(f.request({ action: 'setTestMode', testMode: false, ...credentials, token: adminKey }).testMode, false);
  assert.match(f.request({ action: 'admit', qrValue: '001', ...credentials }).error, /quarantined/i); assert.equal(f.writes().length, writes);
  assert.notEqual(prepared.spreadsheetId, production);
});
test('missing, malformed, or overlapping quarantine fails closed before any admission writes', () => {
  for (const bad of [['"001"','Conflict or incomplete source record','[8]'], ['"099"','Conflict or incomplete source record','[8,8]'], ['"099"','Other reason','[8]']]) {
    const f = fixture(); f.ready(); f.books.get('mirror').getSheetByName('Quarantine').values.push(bad);
    assert.match(f.request({ action: 'admit', qrValue: '083' }).error, /Quarantine/i); assert.equal(f.writes().length, 0);
  }
  const f = fixture(); f.ready();
  const book = f.books.get('mirror'), get = book.getSheetByName;
  book.getSheetByName = name => name === 'Quarantine' ? null : get(name);
  assert.match(f.request({ action: 'admit', qrValue: '083' }).error, /quarantine/i); assert.equal(f.writes().length, 0);
});
