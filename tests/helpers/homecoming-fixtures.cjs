'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const headers = ['Gateway student name', 'Student ID', 'Student ticket #', 'Grade', 'Bringing guest?', 'Guest name', 'Guest form submitted?', 'Guest ID uploaded?', 'School email received?', 'Guest ticket #'];
const ledgerHeaders = ['Event ID', 'Person Type', 'Ticket ID (JSON)', 'Source Student ID (JSON)', 'Subject Assignment SHA256', 'Status', 'Admitted At'];
const intake = () => [...Array.from({ length: 4 }, () => Array(10).fill('')), headers.slice(),
  ['Practice Student A', 'SID-001', '001', '', 'Yes', 'Practice Guest A', '', '', '', '001B'],
  ['Practice Student A', 'SID-002', '083', '', 'No', '', '', '', '', '']];
const admin = 'a'.repeat(64), helper = 'b'.repeat(64);
const production = '1hlWdxxzlP2Zbl9m4_MN49XBgBrL7YiG67ur2p2tEueU';
function fixture(options = {}) {
  const properties = new Map(), books = new Map(), trace = []; let locked = false, serial = 0;
  const fault = { fail: '', onLock: null, locked: false };
  function check(label) { if (fault.fail === label) throw Error('Injected ' + label); }
  function book(id, rows = intake()) {
    const sheets = new Map();
    const b = { getId: () => id, getSheets: () => [...sheets.values()], getSheetByName: n => sheets.get(n) || null,
      insertSheet(n) { check('insert'); return sheet(n, []); } };
    function sheet(name, initial) {
      const values = initial.map(r => r.slice()), formulas = [];
      const s = { values, formulas, getName: () => name, getLastRow: () => values.length,
        getDataRange: () => range(1, 1, Math.max(1, values.length), Math.max(1, ...values.map(r => r.length))),
        getRange: range, setName(n) { sheets.delete(name); name = n; sheets.set(n, s); return s; } };
      function range(r, c, nr = 1, nc = 1) {
        function read(source) { check('readback'); trace.push(['read', id, name]); return Array.from({ length: nr }, (_, a) => Array.from({ length: nc }, (_, z) => source[r - 1 + a]?.[c - 1 + z] ?? '')); }
        function write(data) { check('write'); if (id === production) throw Error('PRODUCTION WRITE REFUSED'); trace.push(['write', id, name, r, c, data]);
          data.forEach((row, a) => row.forEach((v, z) => { values[r - 1 + a] ||= []; values[r - 1 + a][c - 1 + z] = v; })); return api; }
        const api = { getValues: () => read(values), getDisplayValues: () => read(values), getFormulas: () => read(formulas),
          setNumberFormat() { return api; }, setValues: write, setValue: v => { check('status'); return write([[v]]); },
          setRichTextValues: data => write(data.map(row => row.map(v => v.text))) };
        return api;
      }
      sheets.set(name, s); return s;
    }
    sheet('Ticket Checklist', rows); sheet('Check-ins', [ledgerHeaders.slice()]); books.set(id, b); return b;
  }
  book('mirror'); book(production, options.source || intake());
  const ctx = vm.createContext({ console, Date, Map, Set, JSON, Object, String, Array, Number, Error,
    fetch() { throw Error('NETWORK REFUSED'); },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => properties.get(k) ?? null, setProperty(k, v) { check('property'); properties.set(k, v); } }) },
    LockService: { getScriptLock: () => ({ tryLock() { fault.onLock?.(); if (locked || fault.locked) return false; locked = true; return true; }, releaseLock() { locked = false; } }) },
    Session: { getScriptTimeZone: () => 'America/New_York' },
    Utilities: { getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' }, computeDigest: (_, s) => [...crypto.createHash('sha256').update(s).digest()], formatDate: () => '2026-10-10T18:00:00' },
    ScriptApp: { getService: () => ({ getUrl: () => options.url === undefined ? 'https://script.google.com/macros/s/FICTIONAL/exec' : options.url }) },
    SpreadsheetApp: { openById(id) { trace.push(['open', id]); if (!books.has(id)) throw Error('Unknown book'); return books.get(id); },
      openByUrl(url) { return this.openById(url.match(/\/d\/([^/]+)/)[1]); },
      create() { check('create'); return book('created-' + ++serial, []); }, flush() { check('flush'); },
      newRichTextValue: () => ({ setText(text) { this.text = text; return this; }, build() { return { text: this.text }; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: value => ({ value, setMimeType() { return this; } }) } });
  for (const name of ['Code.gs', 'Homecoming.gs', 'MirrorTest.gs']) {
    const file = path.join(__dirname, '../../apps-script', name); if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  }
  const run = code => vm.runInContext(code, ctx);
  function ready(testMode = false) {
    properties.set('studentQrHomecomingBinding', JSON.stringify({ version: 1, stage: 'ready', environment: 'mirror-test', spreadsheetId: 'mirror', sourceSheetName: 'Ticket Checklist', sourceHeaderRow: 5, attendanceSheetName: 'Check-ins' }));
    const config = { sheetUrl: 'https://docs.google.com/spreadsheets/d/mirror/edit', apiUrl: 'https://script.google.com/macros/s/FICTIONAL/exec', sheetName: 'Ticket Checklist', firstNameCol: 'First Name', lastNameCol: 'Last Name', qrCol: 'QR_ID', statusCol: 'Status', admittedAtCol: 'Admitted At', guestCol: 'Bringing Guest', eventName: 'Homecoming 2026 - Mirror Test', admittedValue: 'Admitted', timeZone: 'America/New_York', testMode, rosterMode: 'homecoming-2026', environment: 'mirror-test' };
    ctx.testConfig = config;
    properties.set('studentQrSharedDance', JSON.stringify({ version: 1, eventId: 'event-1', revision: 1, config, adminHash: run(`sharedTokenHash_('${admin}')`), helperHash: run(`sharedTokenHash_('${helper}')`), helperToken: helper }));
    properties.set('testMode:mirror:Ticket Checklist', String(testMode));
  }
  function request(body) { ctx.req = { postData: { contents: JSON.stringify({ eventId: 'event-1', revision: 1, token: helper, ...body }) } }; return JSON.parse(run('doPost(req).value')); }
  return { ctx, run, book, books, properties, fault, trace, ready, request, writes: () => trace.filter(t => t[0] === 'write') };
}
module.exports = { fixture, intake, headers, ledgerHeaders, admin, helper, production };
