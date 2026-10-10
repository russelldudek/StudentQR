'use strict';
const fs = require('node:fs'), vm = require('node:vm');
const { fixture, helper } = require('./homecoming-fixtures.cjs');
const endpoint = 'https://script.google.com/macros/s/FICTIONAL/exec';
function ui(options = {}) {
  const backend = fixture(); backend.ready(options.testMode ?? true);
  const elements = new Map(), calls = [], storage = new Map();
  const el = id => { if (!elements.has(id)) { const classes = new Set(); elements.set(id, { type: id === 'testMode' ? 'checkbox' : 'text', innerHTML: '', textContent: '', value: '', checked: false, style: {}, dataset: {},
    classList: { add: v => classes.add(v), remove: v => classes.delete(v), contains: v => classes.has(v), toggle: (v,on) => on ? classes.add(v) : classes.delete(v) }, addEventListener() {}, remove() {} }); } return elements.get(id); };
  const url = options.url || 'https://fictional.invalid/?event=event-1&api=' + encodeURIComponent(endpoint) + '#key=' + helper;
  const ctx = vm.createContext({ URL, URLSearchParams, console, Date, Set, Map, crypto: require('node:crypto').webcrypto, Uint8Array,
    window: { location: { href: url, protocol: 'https:' }, addEventListener() {} }, document: { getElementById: el, querySelectorAll: () => [], createElement: () => el('toast'), body: { classList: el('body').classList, appendChild() {} } }, navigator: {},
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    fetch: async (url, init = {}) => {
      if (!init.body) { if (options.registryFail) throw Error('Registry unavailable'); return { ok: true, redirected: !!options.redirected, json: async () => ({ version: 1, endpoints: options.endpoints || [endpoint] }) }; }
      calls.push({ url, body: JSON.parse(init.body) }); if (url !== endpoint) throw Error('REAL NETWORK REFUSED');
      if (JSON.parse(init.body).action === 'admit') options.onAdmit?.(backend, JSON.parse(init.body));
      return { ok: true, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(backend.request(JSON.parse(init.body))) };
    } });
  const html = fs.readFileSync(require.resolve('../../index.html'), 'utf8');
  const source = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('\n    loadSavedConfig();'));
  vm.runInContext(source, ctx); const run = code => vm.runInContext(code, ctx);
  return { ctx, run, backend, el, calls };
}
module.exports = { ui, endpoint };
