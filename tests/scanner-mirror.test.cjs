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
test('invalid numeric source tickets fail before create or target writes', () => {
  const source = intake(); source[6][2] = 83; const f = fixture({ source });
  assert.throws(() => f.run('prepareHomecomingMirrorTest()'), /Combined intake/);
  assert.equal(f.books.size, 2); assert.equal(f.writes().length, 0);
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
test('production binding tampering cannot provision or initialize', () => {
  const f = fixture(); f.run('prepareHomecomingMirrorTest()');
  const b = JSON.parse(f.properties.get('studentQrHomecomingBinding')); b.spreadsheetId = production;
  f.properties.set('studentQrHomecomingBinding', JSON.stringify(b)); const writes = f.writes().length;
  assert.throws(() => f.run('prepareHomecomingMirrorTest()'), /Production|target|safe/i);
  assert.throws(() => f.run('initializeHomecomingMirrorTest()'), /Production|target|safe/i); assert.equal(f.writes().length, writes);
});
