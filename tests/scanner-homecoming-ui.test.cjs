'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { ui, endpoint } = require('./helpers/homecoming-ui.cjs');
const { admin } = require('./helpers/homecoming-fixtures.cjs');
test('admin name edit retains sealed mapping and mode; ID assignment remains disabled', async () => {
  const f = ui({ url: 'https://fictional.invalid/?event=event-1&api=' + encodeURIComponent(endpoint) + '#key=' + admin });
  await f.run('loadEventFromUrl()'); f.el('eventName').value = 'Practice Dance';
  await f.run('publishSharedEvent()');
  assert.equal(f.run('state.config.eventName'), 'Practice Dance');
  assert.equal(f.run('state.config.environment'), 'mirror-test'); assert.equal(f.el('assignQrIds').disabled, true);
});
test('fresh helper loads sealed mirror and bidirectional associations without Setup', async () => {
  const f = ui(); await f.run('loadEventFromUrl()');
  assert.equal(f.run('state.config.environment'), 'mirror-test');
  assert.equal(f.el('setupTabButton').classList.contains('hidden'), true);
  assert.match(f.el('testModeBanner').innerHTML, /Mirror Test - Read-only scans/);
  assert.match(f.el('environmentBanner').textContent, /Mirror Test - Read-only scans/);
  assert.match(f.el('stats').innerHTML, /Students.*2.*Guests.*1/s);
  assert.equal(f.run('state.rows[1].linkedTicketId'), '001');
});
test('quarantined tickets are visibly counted, red in read-only and practice modes, and never posted for admission', async () => {
  for (const testMode of [true, false]) {
    const f = ui({ testMode });
    f.backend.books.get('mirror').getSheetByName('Quarantine').values.push(['"099"', 'Conflict or incomplete source record', '[9,12]']);
    await f.run('loadEventFromUrl()');
    assert.match(f.el('scannerRosterStatus').textContent, /2 source records quarantined/);
    assert.match(f.el('stats').innerHTML, /Quarantined.*1/s);
    await f.run('admitByQr("099")');
    assert.match(f.el('scanResult').innerHTML, /Quarantined/i);
    assert.doesNotMatch(f.el('scanResult').innerHTML, /Checked In|Test Passed/);
    assert.equal(f.calls.filter(c => c.body.action === 'admit').length, 0);
    assert.equal(f.backend.writes().length, 0);
  }
});
test('guest scan displays associated host but does not check in host', async () => {
  const f = ui({ testMode: false }); await f.run('loadEventFromUrl()'); await f.run('admitByQr("001B")');
  assert.match(f.el('scannerGuestFlag').innerHTML, /Associated student.*Practice Student A.*001.*Not checked in/s);
  assert.match(f.el('testModeBanner').innerHTML, /Practice check-ins \(mirror records only\)/);
  assert.match(f.el('scanResult').innerHTML, /Admitted/);
  assert.match(f.el('scanResult').innerHTML, /Guest admitted successfully/);
  assert.equal(f.backend.books.get('mirror').getSheetByName('Check-ins').values.length, 2);
  await f.run('admitByQr("UNKNOWN")'); assert.equal(f.el('scannerGuestFlag').innerHTML, '');
});
test('software candidate cannot admit before explicit selection; cancellation clears relationship', async () => {
  const f = ui({ testMode: false }); await f.run('loadEventFromUrl()');
  f.run('presentDecodedCandidate("001B", "photo")'); assert.equal(f.calls.filter(c => c.body.action === 'admit').length, 0);
  assert.match(f.el('decodedCandidate').innerHTML, /001B.*Practice Guest A/s);
  f.run('cancelDecodedCandidate()'); assert.equal(f.el('scannerGuestFlag').innerHTML, '');
  f.run('presentDecodedCandidate("001B", "photo")'); await f.run('confirmDecodedCandidate()');
  assert.equal(f.calls.filter(c => c.body.action === 'admit').length, 1);
  await f.run('confirmDecodedCandidate()'); assert.equal(f.calls.filter(c => c.body.action === 'admit').length, 1);
});
test('changed roster while candidate is displayed requires fresh selection', async () => {
  const f = ui({ testMode: false }); await f.run('loadEventFromUrl()'); f.run('presentDecodedCandidate("001B", "camera")');
  f.backend.books.get('mirror').getSheetByName('Ticket Checklist').values[5][5] = 'Replacement Guest';
  await f.run('confirmDecodedCandidate()'); assert.equal(f.calls.filter(c => c.body.action === 'admit').length, 0);
  assert.match(f.el('scanResult').innerHTML, /changed/i);
});
test('replacement immediately before admission POST is rejected, never shown as stale-name Checked In', async () => {
  const f = ui({ testMode: false, onAdmit: b => { b.books.get('mirror').getSheetByName('Ticket Checklist').values[5][5] = 'Replacement Guest'; } });
  await f.run('loadEventFromUrl()'); f.run('presentDecodedCandidate("001B", "photo")'); await f.run('confirmDecodedCandidate()');
  assert.match(f.el('scanResult').innerHTML, /assignment changed/i); assert.doesNotMatch(f.el('scanResult').innerHTML, /Checked In/);
  assert.equal(f.backend.writes().length, 0);
});
for (const hostile of ['https://evil.invalid/exec', endpoint.replace('FICTIONAL', 'OTHER'), 'https://evil@script.google.com/macros/s/FICTIONAL/exec', endpoint + '?extra=1']) {
  test('untrusted endpoint never receives a bearer key: ' + hostile, async () => {
    const f = ui({ url: 'https://fictional.invalid/?event=event-1&api=' + encodeURIComponent(hostile) + '#key=' + 'b'.repeat(64) });
    await f.run('loadEventFromUrl()'); assert.equal(f.calls.length, 0); assert.equal(f.run('state.config'), null);
  });
}
for (const options of [{ registryFail: true }, { redirected: true }, { endpoints: [] }]) {
  test('missing or redirected endpoint registry fails closed: ' + JSON.stringify(options), async () => {
    const f = ui(options); await f.run('loadEventFromUrl()'); assert.equal(f.calls.length, 0);
  });
}
