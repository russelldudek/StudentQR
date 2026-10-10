'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, intake, ledgerHeaders, admin, production } = require('./helpers/homecoming-fixtures.cjs');
test('exact bidirectional guest joins, duplicate names do not link, no internal identifiers exposed', () => {
  const f = fixture(); f.ready();
  const rows = f.run('homecomingRows_(readHomecomingContext_(readHomecomingBinding_(), "event-1").subjects, new Map())');
  assert.equal(rows[0].linkedTicketId, '001B'); assert.equal(rows[1].linkedTicketId, '001');
  assert.equal(rows[2].linkedTicketId, ''); assert.equal(rows[2].QR_ID, '083');
  assert(!JSON.stringify(rows).includes('SID-')); assert.equal(f.writes().length, 0);
});
test('raw numeric ticket and incomplete guest fail instead of rewriting', () => {
  for (const mutate of [r => { r[6][2] = 83; }, r => { r[5][9] = ''; }, r => { r[6][2] = '001B'; }]) {
    const f = fixture(); f.ready(); mutate(f.books.get('mirror').getSheetByName('Ticket Checklist').values);
    assert.throws(() => f.run('readHomecomingContext_(readHomecomingBinding_(), "event-1")'), /Combined intake/);
    assert.equal(f.writes().length, 0);
  }
});
test('assignment hash is row independent but changes when guest or host name changes', () => {
  const f = fixture(); f.ctx.raw = intake();
  const hash = f.run('var people=projectCombinedIntake_(raw).subjects;subjectAssignmentHash_(people[0],people[1])');
  f.ctx.raw[5][5] = 'Replacement Guest';
  assert.notEqual(f.run('var people=projectCombinedIntake_(raw).subjects;subjectAssignmentHash_(people[0],people[1])'), hash);
  assert.match(hash, /^[a-f0-9]{64}$/);
});
test('strict ledger validates headers, formulas, statuses, timestamps and duplicate exact tickets', () => {
  const f = fixture(); f.ready();
  f.ctx.subjects = f.run('projectCombinedIntake_(SpreadsheetApp.openById("mirror").getSheetByName("Ticket Checklist").getDataRange().getValues()).subjects');
  const hash = f.run('subjectAssignmentHash_(subjects[0],subjects[1])');
  const row = ['event-1', 'Student', '"001"', '"SID-001"', hash, 'Admitted', '2026-10-10T18:00:00'];
  for (const mutate of [r => r[0][0] = 'Wrong', r => r[1][2] = 1, r => r[1][5] = 'No', r => r[1][6] = 'bad', r => r.push(r[1].slice())]) {
    f.ctx.ledger = [ledgerHeaders.slice(), row.slice()]; mutate(f.ctx.ledger);
    assert.throws(() => f.run('parseHomecomingLedger_(ledger, ledger.map(r=>r.map(()=>"")), "event-1", subjects)'), /ledger/i);
  }
  f.ctx.ledger = [ledgerHeaders.slice(), row]; f.ctx.formulas = f.ctx.ledger.map(r => r.map(() => '')); f.ctx.formulas[1][2] = '=1';
  assert.throws(() => f.run('parseHomecomingLedger_(ledger, formulas, "event-1", subjects)'), /formula/i);
});
test('changed assignment quarantines, original reappearing assignment retains admission', () => {
  const f = fixture(); f.ready();
  const subjects = f.run('readHomecomingContext_(readHomecomingBinding_(), "event-1").subjects');
  f.ctx.people = subjects; const hash = f.run('subjectAssignmentHash_(people[0],people[1])');
  f.books.get('mirror').getSheetByName('Check-ins').values.push(['event-1', 'Student', '"001"', '"SID-001"', hash, 'Admitted', '2026-10-10T18:00:00']);
  const rows = () => f.run('var c=readHomecomingContext_(readHomecomingBinding_(), "event-1");homecomingRows_(c.subjects,c.attendance)');
  assert.equal(rows()[0].Status, 'Admitted');
  const source = f.books.get('mirror').getSheetByName('Ticket Checklist').values; source[5][5] = 'Replacement';
  assert.equal(rows()[0].Status, 'Needs Review'); source[5][5] = 'Practice Guest A';
  [source[5], source[6]] = [source[6], source[5]]; assert.equal(rows()[1].Status, 'Admitted'); assert.equal(f.writes().length, 0);
});
test('routed mirror list ignores caller target and helpers cannot alter binding or IDs', () => {
  const f = fixture(); f.ready();
  const result = f.request({ action: 'list', config: { sheetUrl: 'https://docs.google.com/spreadsheets/d/' + production } });
  assert.equal(result.rows[0].linkedTicketId, '001B');
  assert(!f.trace.some(t => t[1] === production));
  for (const action of ['saveEvent', 'assignQrIds', 'setTestMode', 'prepareHomecomingMirrorTest']) assert.match(f.request({ action }).error, /admin|Unsupported/i);
});
test('preparing or missing event guard refuses public bootstrap and legacy requests before Sheet access', () => {
  const f = fixture(); f.ready(); f.properties.delete('studentQrSharedDance');
  for (const action of ['list', 'admit', 'saveEvent']) assert.match(f.request({ action, eventId: undefined, token: undefined }).error, /Homecoming|ready/i);
  assert.equal(f.trace.length, 0);
});
test('dedicated mirror cannot fall back to generic after binding or event erasure or corruption', () => {
  for (const key of ['studentQrHomecomingBinding', 'studentQrSharedDance']) for (const value of [null, '{broken', '{}']) {
    const f = fixture(); f.ready(); if (value === null) f.properties.delete(key); else f.properties.set(key, value);
    for (const action of ['list', 'admit', 'saveEvent', 'setTestMode']) assert(f.request({ action, eventId: undefined, token: undefined }).error);
    assert.equal(f.trace.length, 0);
  }
});
test('first practice admission verified once; duplicate on second device retains original timestamp', () => {
  const f = fixture(); f.ready();
  const first = f.request({ action: 'admit', qrValue: '001B' }); assert.equal(first.row.Status, 'Admitted');
  assert.equal(first.row.linkedStatus, 'Not checked in'); const writes = f.writes().length;
  const second = f.request({ action: 'admit', qrValue: '001B' }); assert.equal(second.alreadyAdmitted, true);
  assert.equal(second.row['Admitted At'], first.row['Admitted At']); assert.equal(f.writes().length, writes);
  assert.equal(f.books.get('mirror').getSheetByName('Check-ins').values.length, 2);
});
test('global read-only mode and unknown tickets cannot write', () => {
  const f = fixture(); f.ready(true);
  assert.equal(f.request({ action: 'admit', qrValue: '083' }).testMode, true);
  assert.match(f.request({ action: 'admit', qrValue: '83' }).error, /not found/i); assert.equal(f.writes().length, 0);
});
test('fresh lock authorization and mode checks fail closed', () => {
  for (const effect of ['lock', 'revision', 'mode', 'target']) {
    const f = fixture(); f.ready();
    if (effect === 'lock') f.fault.locked = true;
    else f.fault.onLock = () => {
      if (effect === 'revision') { const e = JSON.parse(f.properties.get('studentQrSharedDance')); e.revision++; f.properties.set('studentQrSharedDance', JSON.stringify(e)); }
      if (effect === 'mode') f.properties.set('testMode:mirror:Ticket Checklist', 'true');
      if (effect === 'target') { const b = JSON.parse(f.properties.get('studentQrHomecomingBinding')); b.spreadsheetId = production; f.properties.set('studentQrHomecomingBinding', JSON.stringify(b)); }
    };
    const res = f.request({ action: 'admit', qrValue: '083' }); assert(res.error || res.testMode === true); assert.equal(f.writes().length, 0);
  }
});
test('Pending reservation surviving flush failure blocks all retries and changed identities', () => {
  const f = fixture(); f.ready(); f.fault.fail = 'flush';
  assert.match(f.request({ action: 'admit', qrValue: '001' }).error, /uncertain/i);
  f.fault.fail = ''; const writes = f.writes().length;
  assert.match(f.request({ action: 'admit', qrValue: '001' }).error, /Pending/i); assert.equal(f.writes().length, writes);
  f.books.get('mirror').getSheetByName('Ticket Checklist').values[5][5] = 'Replacement Guest';
  assert.match(f.request({ action: 'admit', qrValue: '001' }).error, /Needs Review/i);
});
test('managed mode change takes admission lock and updates both authoritative stores', () => {
  const f = fixture(); f.ready(); f.fault.locked = true;
  assert.match(f.request({ action: 'setTestMode', token: admin, testMode: true }).error, /busy|processed/i);
  f.fault.locked = false;
  assert.equal(f.request({ action: 'setTestMode', token: admin, testMode: true }).testMode, true);
  assert.equal(JSON.parse(f.properties.get('studentQrSharedDance')).config.testMode, true);
});
