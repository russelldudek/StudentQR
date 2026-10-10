'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const cfg = { sheetUrl: 'https://fictional.invalid/sheet', apiUrl: 'https://script.google.com/macros/s/FICTIONAL/exec',
  sheetName: 'Students', firstNameCol: 'First Name', lastNameCol: 'Last Name', qrCol: 'QR_ID',
  statusCol: 'Status', admittedAtCol: 'Admitted At', guestCol: 'Bringing Guest',
  eventName: 'Fictional Dance', admittedValue: 'Admitted', timeZone: 'UTC', testMode: false };
const admin = 'a'.repeat(64), helper = 'b'.repeat(64);
function backend(options = {}) {
  const properties = new Map(); let sheetReads = 0, failWrite = false;
  const ctx = vm.createContext({ JSON, Object, Error, String, Array, Number, RegExp,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => properties.get(k) || null,
      setProperty(k, v) { if (failWrite) throw Error('SYNTHETIC persistence failure'); properties.set(k, v); } }) },
    LockService: { getScriptLock: () => ({ tryLock() { options.onLock?.(properties); return true; }, releaseLock() {} }) },
    Session: { getScriptTimeZone: () => 'UTC' },
    Utilities: { getUuid: () => 'fictional-event', DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (_, text) => Array.from(crypto.createHash('sha256').update(text).digest()) },
    SpreadsheetApp: { openByUrl() { sheetReads++; return { getSheetByName: () => ({
      getDataRange: () => ({ getDisplayValues: () => [ options.headers || ['First Name', 'Last Name', 'QR_ID', 'Status', 'Admitted At'], ['Fictional', 'Student', '001', '', ''] ] }) }) }; } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: value => ({ value, setMimeType() { return this; } }) }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../apps-script/Code.gs'), 'utf8'), ctx);
  function request(body) { ctx.event = { postData: { contents: JSON.stringify(body) } }; return JSON.parse(vm.runInContext('doPost(event).value', ctx)); }
  return { request, properties, reads: () => sheetReads, fail: () => { failWrite = true; } };
}
function create(b) { return b.request({ action: 'saveEvent', config: cfg, adminToken: admin, helperToken: helper }); }
test('shared dance persists once, returns distinct role-specific credentials', () => {
  const b = backend(), saved = create(b); assert.equal(saved.role, 'admin'); assert.equal(saved.revision, 1);
  const staff = b.request({ action: 'getEvent', eventId: saved.eventId, token: helper });
  assert.equal(staff.role, 'helper'); assert.equal(staff.config.eventName, cfg.eventName);
  assert(!JSON.stringify(staff).includes(admin)); assert(!('helperToken' in staff));
  const eve = b.request({ action: 'getEvent', eventId: saved.eventId, token: admin });
  assert.equal(eve.helperToken, helper); assert.equal(eve.role, 'admin');
  assert(!Array.from(b.properties.values()).join('').includes(admin));
});
test('invalid key and event fail without reading students', () => {
  const b = backend(), saved = create(b), reads = b.reads();
  for (const token of ['', 'c'.repeat(64), 'false']) assert.match(b.request({ action: 'getEvent', eventId: saved.eventId, token }).error, /link|key/i);
  assert.match(b.request({ action: 'getEvent', eventId: 'other', token: admin }).error, /link|dance/i);
  assert.equal(b.reads(), reads);
});
test('helper cannot update setup, assign IDs, or change global mode', () => {
  const b = backend(), saved = create(b);
  for (const action of ['saveEvent', 'assignQrIds', 'setTestMode']) {
    assert.match(b.request({ action, eventId: saved.eventId, token: helper, revision: 1, config: cfg }).error, /admin/i);
  }
});
test('admin updates same dance centrally, stale revision cannot overwrite it', () => {
  const b = backend(), saved = create(b);
  const updated = b.request({ action: 'saveEvent', eventId: saved.eventId, token: admin, revision: 1, config: { ...cfg, eventName: 'Updated Fictional Dance' } });
  assert.equal(updated.revision, 2);
  assert.match(b.request({ action: 'saveEvent', eventId: saved.eventId, token: admin, revision: 1, config: cfg }).error, /changed|reload/i);
  assert.equal(b.request({ action: 'getEvent', eventId: saved.eventId, token: helper }).config.eventName, 'Updated Fictional Dance');
});
test('managed deployment refuses legacy bypass and second unauthenticated bootstrap', () => {
  const b = backend(); create(b);
  assert.match(b.request({ action: 'list', config: cfg }).error, /private|link/i);
  assert.match(b.request({ action: 'saveEvent', config: cfg, adminToken: 'c'.repeat(64), helperToken: 'd'.repeat(64) }).error, /admin|link/i);
});
test('event list ignores helper-supplied sheet configuration', () => {
  const b = backend(), saved = create(b);
  const result = b.request({ action: 'list', eventId: saved.eventId, token: helper, revision: 1, config: { sheetUrl: 'https://other.invalid', sheetName: 'Wrong' } });
  assert.equal(result.sheetName, 'Students'); assert.equal(result.rows[0].QR_ID, '001');
});
test('failed persistence never acknowledges successful shared setup', () => {
  const b = backend(); b.fail(); assert.match(create(b).error, /persistence failure/);
});
function frontend(url, options = {}) {
  const elements = new Map(), storage = new Map(), requests = [];
  const el = id => {
    if (!elements.has(id)) { const classes = new Set(); elements.set(id, { value: '', checked: false,
      type: id === 'testMode' ? 'checkbox' : 'text', style: {}, innerHTML: '', textContent: '',
      classList: { contains: n => classes.has(n), toggle: (n, on) => on ? classes.add(n) : classes.delete(n), add: n => classes.add(n), remove: n => classes.delete(n) },
      addEventListener() {}, remove() {} }); }
    return elements.get(id);
  };
  const ctx = vm.createContext({ URL, URLSearchParams, console, Uint8Array, crypto: crypto.webcrypto,
    window: { location: { href: url, protocol: 'https:' }, addEventListener() {} },
    document: { getElementById: el, querySelectorAll: () => [], createElement: () => el('toast'), body: { appendChild() {}, classList: el('body').classList } },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    navigator: {}, setTimeout() {}, clearTimeout() {},
    fetch: async (url, fetchOptions) => {
      if (!fetchOptions.body) return { ok: true, json: async () => ({ version: 1, endpoints: [cfg.apiUrl] }) };
      const body = JSON.parse(fetchOptions.body); requests.push(body);
      const data = options.api ? options.api(body) : body.action === 'getEvent' ? { eventId: 'fictional-event', role: 'helper', revision: 1, config: cfg } : { rows: [{ 'First Name': 'Fictional', 'Last Name': 'Student', QR_ID: '001', Status: '' }], testMode: false };
      return { ok: true, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(data) }; },
    btoa: v => Buffer.from(v, 'binary').toString('base64'), atob: v => Buffer.from(v, 'base64').toString('binary') });
  const inline = fs.readFileSync(require.resolve('../index.html'), 'utf8').match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  vm.runInContext(inline.slice(0, inline.lastIndexOf('\n    loadSavedConfig();')), ctx);
  const run = code => vm.runInContext(code, ctx); ctx.fixture = cfg;
  return { run, el, ctx, requests, storage };
}
const eventUrl = `https://fictional.invalid/scanner?event=fictional-event&api=${encodeURIComponent(cfg.apiUrl)}#key=${helper}`;
test('fresh helper device loads server dance and roster without local setup', async () => {
  const f = frontend(eventUrl); f.run('loadSavedConfig()'); assert.equal(f.run('state.config'), null);
  await f.run('loadEventFromUrl()'); assert.equal(f.run('state.config.eventName'), cfg.eventName);
  assert.equal(f.run('state.rosterLoaded'), true); assert.equal(f.el('setupTabButton').classList.contains('hidden'), true);
  assert(f.requests.every(r => r.token === helper)); assert.equal(f.requests[0].action, 'getEvent');
  assert.equal(f.requests.at(-1).action, 'list');
});
test('bad event link does not fall back to previously saved local dance', async () => {
  const f = frontend(eventUrl.replace(/#key=.*/, '#key=bad')); f.storage.set('studentQrConfig', JSON.stringify(cfg));
  f.run('loadSavedConfig()'); await f.run('loadEventFromUrl()');
  assert.equal(f.run('state.config'), null); assert.equal(f.requests.length, 0);
  assert.match(f.el('scannerRosterStatus').textContent, /link|key/i);
});
test('two URL outputs use different keys; helpers never receive admin key or setup', () => {
  const f = frontend('https://fictional.invalid/scanner?setup=old&role=admin');
  f.ctx.access = { eventId: 'fictional-event', apiUrl: cfg.apiUrl, token: admin, helperToken: helper, role: 'admin', revision: 1 };
  f.run('state.eventAccess=access;state.config=fixture;updateShareLinkOutput(fixture)');
  const eve = new URL(f.el('adminLinkOutput').value), staff = new URL(f.el('shareLinkOutput').value);
  assert.equal(eve.hash, '#key=' + admin); assert.equal(staff.hash, '#key=' + helper);
  assert(!staff.href.includes(admin)); assert(!staff.searchParams.has('setup')); assert(!staff.searchParams.has('role'));
  assert.equal(f.run('isSharedLinkMode()'), false);
});
test('lost bootstrap response is recoverable with the same private keys', () => {
  const b = backend(), first = create(b), retry = create(b);
  assert.equal(retry.eventId, first.eventId); assert.equal(retry.revision, 1); assert.equal(retry.role, 'admin');
  assert.match(b.request({ action: 'saveEvent', adminToken: admin, helperToken: helper, config: { ...cfg, eventName: 'Wrong' } }).error, /link/i);
});
test('stale event revisions cannot admit against an outdated dance', () => {
  const b = backend(), saved = create(b), reads = b.reads();
  assert.match(b.request({ action: 'admit', eventId: saved.eventId, token: helper, revision: 0, qrValue: '001' }).error, /changed|refresh/i);
  assert.equal(b.reads(), reads);
});
test('fresh admin device opens the dance dashboard and can regenerate helper QR', async () => {
  const f = frontend(eventUrl.replace(helper, admin), { api: body => body.action === 'getEvent' ?
    { eventId: 'fictional-event', role: 'admin', helperToken: helper, revision: 1, config: cfg } : { rows: [], testMode: false } });
  const qrPayloads = []; f.ctx.window.QRCode = Object.assign(function(_el, opts) { qrPayloads.push(opts.text); }, { CorrectLevel: { M: 0 } });
  f.run('loadSavedConfig()'); await f.run('loadEventFromUrl()');
  assert.equal(f.el('setupTabButton').classList.contains('hidden'), false);
  assert.equal(f.run('state.config.eventName'), cfg.eventName); assert.equal(f.run('state.rosterLoaded'), true);
  assert(qrPayloads.length); assert(qrPayloads.every(value => value.includes(helper) && !value.includes(admin)));
});
test('unsupported deployment never issues an admin link or claims shared setup saved', async () => {
  const f = frontend('https://fictional.invalid/scanner', { api: () => ({ error: 'Unsupported action: saveevent' }) });
  f.run('fillInputsFromConfig(fixture)'); await f.run('publishSharedEvent()');
  assert.equal(f.run('state.eventAccess'), null); assert.equal(f.el('adminLinkOutput').value, '');
  assert.match(f.el('eventLinkStatus').textContent, /not confirmed.*Unsupported/);
});
test('invalid link endpoint fails without contacting a provider', async () => {
  const f = frontend(eventUrl.replace(encodeURIComponent(cfg.apiUrl), encodeURIComponent('http://fictional.invalid/api')));
  f.run('loadSavedConfig()'); await f.run('loadEventFromUrl()'); assert.equal(f.requests.length, 0);
  assert.match(f.el('scannerRosterStatus').textContent, /endpoint/i);
});
test('incompatible intake headers do not issue private links or persist a dance', () => {
  const b = backend({ headers: ['Gateway student name', 'Student ID', 'Student ticket #'] });
  assert.match(create(b).error, /Missing required column header/);
  assert.equal(b.properties.has('studentQrSharedDance'), false);
});
test('admin global mode change reaches the helper configuration', () => {
  const b = backend(), saved = create(b);
  for (const testMode of [true, false]) {
    assert.equal(b.request({ action: 'setTestMode', eventId: saved.eventId, token: admin, revision: 1, testMode }).testMode, testMode);
    assert.equal(b.request({ action: 'getEvent', eventId: saved.eventId, token: helper }).config.testMode, testMode);
  }
});
test('configuration change between authorization and admission lock prevents writes', () => {
  let change = false;
  const b = backend({ onLock(properties) {
    if (change) { const event = JSON.parse(properties.get('studentQrSharedDance')); event.revision++; properties.set('studentQrSharedDance', JSON.stringify(event)); }
  } });
  const saved = create(b), reads = b.reads(); change = true;
  assert.match(b.request({ action: 'admit', eventId: saved.eventId, token: helper, revision: 1, qrValue: '001' }).error, /changed|refresh/i);
  assert.equal(b.reads(), reads);
});
test('failed shared configuration refresh visibly pauses scanning and retains snapshot', async () => {
  let failed = false;
  const f = frontend(eventUrl, { api: body => failed ? { error: 'SYNTHETIC shared endpoint unavailable' } :
    body.action === 'getEvent' ? { eventId: 'fictional-event', role: 'helper', revision: 1, config: cfg } :
      { rows: [{ 'First Name': 'Fictional', 'Last Name': 'Student', QR_ID: '001', Status: '' }], testMode: false } });
  f.run('loadSavedConfig()'); await f.run('loadEventFromUrl()'); failed = true;
  await f.run('loadRoster({silent:true})'); assert.equal(f.run('state.rows.length'), 1);
  assert.match(f.run('state.rosterError'), /shared endpoint unavailable/);
  assert.match(f.el('scannerRosterStatus').textContent, /Admissions paused/);
});
