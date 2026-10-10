'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

const sourcePath = process.env.STUDENTQR_CONFIG_SOURCE || path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(sourcePath, 'utf8');
const inline = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const code = inline.slice(0, inline.lastIndexOf('\n    loadSavedConfig();'));
const cfg = {
  sheetUrl: 'https://fictional.invalid/sheet', apiUrl: 'https://fictional.invalid/api',
  sheetName: 'Fictional', firstNameCol: 'First Name', lastNameCol: 'Last Name', qrCol: 'QR_ID',
  statusCol: 'Status', guestCol: 'Bringing Guest', admittedAtCol: 'Admitted At',
  eventName: 'Fictional Dance', admittedValue: 'Admitted', timeZone: 'UTC', testMode: false,
};
const student = { 'First Name': 'Fictional', 'Last Name': 'Student', QR_ID: '001', Status: '', 'Admitted At': '', 'Bringing Guest': 'No' };
// Historical 14-field layout is evidenced by completed source-patch/read observations
// in this chat's 2026-04-29 transcript, not inferred from token values.
const legacy14 = [cfg.sheetUrl, cfg.apiUrl, cfg.sheetName, cfg.firstNameCol, cfg.lastNameCol,
  cfg.qrCol, cfg.statusCol, cfg.guestCol, cfg.admittedAtCol, cfg.eventName, ['Registered'], 'Admitted', 'UTC', 0];
const legacy13 = [cfg.sheetUrl, cfg.apiUrl, cfg.sheetName, cfg.firstNameCol, cfg.lastNameCol,
  cfg.qrCol, cfg.statusCol, cfg.guestCol, cfg.admittedAtCol, cfg.eventName, 'Admitted', 'UTC', 0];
const token = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

function element(id) {
  const classes = new Set();
  return { type: id === 'testMode' || id === 'keepScannerOpen' ? 'checkbox' : 'text',
    value: '', checked: false, innerHTML: '', textContent: '', style: {}, className: '', disabled: false,
    classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)),
      contains: n => classes.has(n), toggle: (n, on) => on ? classes.add(n) : classes.delete(n) },
    addEventListener() {}, remove() {} };
}

function frontend({ testMode = false, loaded = true, url = 'https://fictional.invalid/scanner', api } = {}) {
  const elements = new Map(), storage = new Map(), requests = [], toasts = [], writes = [];
  const el = id => { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); };
  const context = vm.createContext({
    document: { getElementById: el, createElement: () => element(''), querySelectorAll: () => [], addEventListener() {},
      body: { classList: element('').classList, appendChild() {} } },
    window: { location: { href: url, protocol: 'https:' }, addEventListener() {} },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    navigator: { mediaDevices: { getUserMedia() { throw Error('CAMERA_REFUSED'); } } },
    fetch() { throw Error('NETWORK_REFUSED'); }, XMLHttpRequest() { throw Error('NETWORK_REFUSED'); }, WebSocket() { throw Error('NETWORK_REFUSED'); },
    URL, console: { log() {}, warn() {}, error() {} },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    btoa: value => Buffer.from(value, 'binary').toString('base64'), atob: value => Buffer.from(value, 'base64').toString('binary'),
  }, { codeGeneration: { strings: false, wasm: false } });
  const run = text => vm.runInContext(text, context, { timeout: 1500 });
  run(code);
  context.fixture = { ...cfg, testMode };
  context.student = { ...student };
  context.fakeApi = async (action, payload, method, config) => {
    requests.push({ action, payload, method, config });
    if (api) return api(action, payload, method, config);
    if (action === 'list') return { rows: [{ ...student }], testMode: false };
    if (action === 'setTestMode') return { testMode: payload.testMode };
    // A stored global false overrides request flags in the unchanged backend.
    // Model that write-capable behavior: any admit action changes attendance.
    writes.push({ column: 'Status', value: 'Admitted' }, { column: 'Admitted At', value: '2026-10-10T12:00:00' });
    return { row: { ...student, Status: 'Admitted', 'Admitted At': '2026-10-10T12:00:00' }, matchedQrValue: '001', testMode: false };
  };
  context.fakeToast = (message, ok) => toasts.push({ message, ok });
  run('state.config=fixture;fillInputsFromConfig(fixture);state.rows=normalizeRows([student]);callApi=fakeApi;toast=fakeToast;');
  context.loaded = loaded;
  run('state.rosterLoaded=loaded;');
  return { run, context, storage, requests, toasts, writes, el, decode(value) { context.input = token(value); return run('decodeConfigFromUrl(input)'); } };
}

test('legacy 14-field array keeps admitted value, timezone and false test flag', () => {
  const f = frontend(); const result = f.decode(legacy14);
  assert.equal(result.admittedValue, 'Admitted'); assert.equal(result.timeZone, 'UTC'); assert.equal(result.testMode, false);
  assert.equal(result.qrCol, 'QR_ID');
});
test('legacy 13-field array remains supported without shifting fields', () => {
  const result = frontend().decode(legacy13);
  assert.equal(result.admittedValue, 'Admitted'); assert.equal(result.timeZone, 'UTC'); assert.equal(result.testMode, false);
});
test('legacy full-object link remains supported', () => {
  const result = frontend().decode({ ...cfg, allowedStatuses: ['Registered'], testMode: true });
  assert.equal(result.testMode, true); assert.equal(result.eventName, 'Fictional Dance');
});
for (const payload of [legacy13.slice(0, 12), [...legacy14, 'unexpected'], ['unknown'], null, 7, { v: 77, c: legacy13 }]) {
  test(`unsupported shared payload fails closed: ${Array.isArray(payload) ? 'array length ' + payload.length : JSON.stringify(payload).slice(0, 55)}`, () => {
    assert.throws(() => frontend().decode(payload), /setup|config|version|format|payload/i);
  });
}
test('ambiguous 14-field layout with non-array status slot is refused', () => {
  const bad = legacy14.slice(); bad[10] = 'Admitted';
  assert.throws(() => frontend().decode(bad), /setup|config|format|status/i);
});
test('string false is not treated as true in compact links', () => {
  const bad = legacy13.slice(); bad[12] = 'false';
  assert.throws(() => frontend().decode(bad), /test|flag|config/i);
});
test('new shares carry a schema version and round-trip explicit mode and Unicode', () => {
  const f = frontend(); f.context.fixture = { ...cfg, eventName: 'Fictional Caf\u00e9 Dance', testMode: true };
  const encoded = f.run('encodeConfigForUrl(fixture)');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  assert.equal(payload.v, 2); assert.equal(payload.c.length, 13);
  f.context.input = encoded; const decoded = f.run('decodeConfigFromUrl(input)');
  assert.equal(decoded.testMode, true); assert.equal(decoded.eventName, 'Fictional Caf\u00e9 Dance');
  assert.equal(decoded.admittedValue, 'Admitted');
});
test('invalid shared link never falls back to a saved local dance', () => {
  const f = frontend({ url: `https://fictional.invalid/scanner?setup=${token({ v: 77, c: legacy13 })}` });
  f.storage.set('studentQrConfig', JSON.stringify(cfg));
  f.run('loadSavedConfig()');
  assert.equal(f.run('state.config'), null); assert.match(f.el('scannerRosterStatus').textContent, /shared|setup|version|invalid/i);
  assert.equal(JSON.parse(f.storage.get('studentQrConfig')).eventName, 'Fictional Dance');
});
test('empty setup query never falls back to local configuration', () => {
  const f = frontend({ url: 'https://fictional.invalid/scanner?setup=' });
  f.storage.set('studentQrConfig', JSON.stringify(cfg)); f.run('loadSavedConfig()');
  assert.equal(f.run('state.config'), null);
});
test('explicit test mode survives profile save and apply', () => {
  const f = frontend({ testMode: true }); f.run('rememberProfile(fixture);applyConfig(fixture)');
  assert.equal(f.run('state.config.testMode'), true); assert.equal(f.el('testMode').checked, true);
  assert.equal(JSON.parse(f.storage.get('studentQrProfiles'))['Fictional Dance'].testMode, true);
  assert.equal(JSON.parse(f.storage.get('studentQrConfig')).testMode, true);
  assert.equal(f.el('manualSubmit').textContent, 'Test scan only');
});
test('saving checkbox selection does not silently switch test mode off', () => {
  const f = frontend({ testMode: true }); f.run('saveConfig({silent:true})');
  assert.equal(f.run('state.config.testMode'), true); assert.equal(f.el('testMode').checked, true);
});
test('stored explicit test choice survives reload before global reconciliation', () => {
  const f = frontend(); f.storage.set('studentQrConfig', JSON.stringify({ ...cfg, testMode: true }));
  f.run('loadSavedConfig()'); assert.equal(f.run('state.config.testMode'), true);
});
test('explicit test scan never calls write-capable admission action', async () => {
  const f = frontend({ testMode: true }); await f.run('admitByQr("001")');
  assert.equal(f.requests.filter(r => r.action === 'admit').length, 0);
  assert.equal(f.writes.length, 0);
  assert.match(f.el('scanResult').innerHTML, /Test Scan Only/); assert.doesNotMatch(f.el('scanResult').className, /scan-state-success/);
});
test('test scan stays read-only when roster refresh reports global live mode', async () => {
  const f = frontend({ testMode: true, loaded: false }); await f.run('admitByQr("001")');
  assert.ok(f.requests.some(r => r.action === 'list')); assert.equal(f.requests.filter(r => r.action === 'admit').length, 0);
  assert.equal(f.writes.length, 0);
  assert.match(f.el('scanResult').innerHTML, /Test Scan Only/);
});
test('live selection still sends a write admission request with false test flag', async () => {
  const f = frontend(); await f.run('admitByQr("001")');
  const request = f.requests.find(r => r.action === 'admit'); assert.ok(request); assert.equal(request.config.testMode, false);
  assert.equal(f.writes.length, 2);
  assert.match(f.el('scanResult').innerHTML, /Checked In/);
});
test('unsupported global test toggle preserves local read-only selection and exposes failure', async () => {
  const f = frontend({ api: async action => action === 'setTestMode' ? { error: 'Unsupported action: settestmode' } : { rows: [student], testMode: false } });
  await f.run('setGlobalTestMode(true)');
  assert.equal(f.run('state.config.testMode'), true); assert.equal(f.el('testMode').checked, true);
  assert.ok(f.toasts.some(t => t.ok === false && /Unsupported action/i.test(t.message)));
  await f.run('admitByQr("001")'); assert.equal(f.requests.filter(r => r.action === 'admit').length, 0);
});
test('missing global toggle confirmation does not imply success', async () => {
  const f = frontend({ api: async () => ({ ok: true }) }); await f.run('setGlobalTestMode(true)');
  assert.equal(f.run('state.config.testMode'), true); assert.ok(f.toasts.some(t => t.ok === false));
});
test('mismatched global toggle confirmation is reported rather than discarding explicit choice', async () => {
  const f = frontend({ api: async () => ({ testMode: false }) }); await f.run('setGlobalTestMode(true)');
  assert.equal(f.run('state.config.testMode'), true); assert.ok(f.toasts.some(t => t.ok === false));
});
test('scanning is paused while global mode change is awaiting confirmation', async () => {
  let finish; const f = frontend({ api: async action => action === 'setTestMode' ? new Promise(r => { finish = r; }) : { row: { ...student, Status: 'Admitted', 'Admitted At': '2026-10-10T12:00:00' }, testMode: false } });
  const pending = f.run('setGlobalTestMode(true)'); await f.run('admitByQr("001")');
  assert.equal(f.requests.filter(r => r.action === 'admit').length, 0);
  finish({ testMode: true }); await pending;
});
test('confirmed global mode change persists to all local views and profiles', async () => {
  const f = frontend({ api: async () => ({ testMode: true, ok: true }) }); await f.run('setGlobalTestMode(true)');
  assert.equal(f.run('state.config.testMode'), true); assert.equal(f.el('manualSubmit').textContent, 'Test scan only');
  assert.equal(JSON.parse(f.storage.get('studentQrProfiles'))['Fictional Dance'].testMode, true);
});
test('provider and camera calls are refused by the synthetic harness', () => {
  const f = frontend(); assert.throws(() => f.run('fetch("https://fictional.invalid")'), /NETWORK_REFUSED/);
  assert.throws(() => f.run('navigator.mediaDevices.getUserMedia({})'), /CAMERA_REFUSED/);
});

test('unknown URL version is refused even with a known 13-field payload', () => {
  const f = frontend({ url: `https://fictional.invalid/scanner?setup=${token(legacy13)}&v=future` });
  f.storage.set('studentQrConfig', JSON.stringify(cfg)); f.run('loadSavedConfig()');
  assert.equal(f.run('state.config'), null); assert.match(f.el('scannerRosterStatus').textContent, /version/i);
});
test('new URL version does not accept an unversioned old payload', () => {
  const f = frontend({ url: `https://fictional.invalid/scanner?setup=${token(legacy13)}&v=2026-10-10-2` });
  f.run('loadSavedConfig()'); assert.equal(f.run('state.config'), null);
});
test('new share URL opens the same dance and explicit mode', () => {
  const sender = frontend({ testMode: true }); const link = sender.run('buildShareUrl(fixture)');
  const receiver = frontend({ url: link }); receiver.run('loadSavedConfig()');
  assert.equal(receiver.run('state.config.eventName'), 'Fictional Dance'); assert.equal(receiver.run('state.config.testMode'), true);
});
test('historical URL version accepts its source-observed compact layout', () => {
  const f = frontend({ url: `https://fictional.invalid/scanner?setup=${token(legacy14)}&v=2026-04-29-1` });
  f.run('loadSavedConfig()'); assert.equal(f.run('state.config.admittedValue'), 'Admitted'); assert.equal(f.run('state.config.testMode'), false);
});
test('failed enable remains read-only after a false-mode polling response', async () => {
  const f = frontend({ api: async action => action === 'setTestMode' ? { error: 'Unsupported action: settestmode' } : { rows: [student], testMode: false } });
  await f.run('setGlobalTestMode(true)'); await f.run('loadRoster({silent:true})');
  assert.equal(f.run('state.config.testMode'), true); assert.match(f.el('testModeBanner').innerHTML, /not confirmed/i);
  await f.run('admitByQr("001")'); assert.equal(f.requests.filter(r => r.action === 'admit').length, 0); assert.equal(f.writes.length, 0);
});
test('failed disable does not silently enter live admission', async () => {
  const f = frontend({ testMode: true, api: async action => action === 'setTestMode' ? { error: 'SYNTHETIC rejected' } : { rows: [student], testMode: false } });
  await f.run('setGlobalTestMode(false)'); assert.equal(f.run('state.config.testMode'), true);
  await f.run('admitByQr("001")'); assert.equal(f.requests.filter(r => r.action === 'admit').length, 0);
});
test('confirmed disable restores a live scan intentionally', async () => {
  const f = frontend({ testMode: true }); await f.run('setGlobalTestMode(false)'); await f.run('admitByQr("001")');
  assert.equal(f.run('state.config.testMode'), false); assert.equal(f.writes.length, 2);
});
test('second mode change waits until the first is confirmed', async () => {
  const finishes = [];
  const f = frontend({ api: async (action, payload) => new Promise(resolve => { finishes.push(() => resolve({ testMode: payload.testMode })); }) });
  const first = f.run('setGlobalTestMode(true)'); const second = f.run('setGlobalTestMode(false)');
  const requestCount = f.requests.filter(r => r.action === 'setTestMode').length;
  finishes.forEach(finish => finish()); await Promise.all([first, second]);
  assert.equal(requestCount, 1);
  assert.equal(f.run('state.config.testMode'), true);
});
test('mode cannot change while a live admission is processing', async () => {
  const f = frontend(); f.run('state.admissionInFlight=true'); await f.run('setGlobalTestMode(true)');
  assert.equal(f.requests.length, 0); assert.equal(f.run('state.config.testMode'), false); assert.equal(f.el('testMode').checked, false);
});
test('late mode acknowledgement for another dance cannot alter the new dance', async () => {
  let finish; const f = frontend({ api: async () => new Promise(resolve => { finish = resolve; }) });
  const pending = f.run('setGlobalTestMode(true)');
  f.context.other = { ...cfg, eventName: 'Other fictional dance', testMode: false };
  f.run('applyConfig(other)'); finish({ testMode: true }); await pending;
  assert.equal(f.run('state.config.eventName'), 'Other fictional dance'); assert.equal(f.run('state.config.testMode'), false);
  assert.equal(f.run('state.testModePending'), false);
});

for (const origin of ['reload', 'profile', 'shared link']) {
  test(`read-only scan from ${origin} writes no attendance despite stored global false`, async () => {
    const selected = { ...cfg, testMode: true };
    const f = frontend({ url: origin === 'shared link' ? `https://fictional.invalid/scanner?setup=${token(selected)}` : undefined });
    if (origin === 'profile') {
      f.storage.set('studentQrProfiles', JSON.stringify({ 'Fictional Dance': selected }));
      f.storage.set('studentQrActiveProfile', 'Fictional Dance');
    } else if (origin === 'reload') {
      f.storage.set('studentQrConfig', JSON.stringify(selected));
    }
    f.run('loadSavedConfig()'); assert.equal(f.el('manualSubmit').textContent, 'Test scan only');
    await f.run('admitByQr("001")');
    assert.equal(f.requests.filter(r => r.action === 'admit').length, 0); assert.equal(f.writes.length, 0);
    assert.match(f.el('scanResult').innerHTML, /Test Scan Only/);
  });
}
