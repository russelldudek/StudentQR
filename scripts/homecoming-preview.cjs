'use strict';
// Local-only integration fixture: no Google/provider calls, no real roster data.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { fixture, intake, admin, helper } = require('../tests/helpers/homecoming-fixtures.cjs');
const f = fixture(), rows = intake(); rows[5][2] = '083'; rows[5][9] = '083B'; rows[6][2] = '084';
f.book('mirror', rows); f.ready(true);
f.books.get('mirror').getSheetByName('Quarantine').values.push(['"099"', 'Conflict or incomplete source record', '[9,12]']);
const endpoint = 'https://script.google.com/macros/s/FICTIONAL/exec';
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api' && req.method === 'POST') {
    let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
      try { const result = f.request(JSON.parse(body)); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result)); }
      catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
    }); return;
  }
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
  if (url.pathname === '/assets/trusted-backends.json') {
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ version: 1, endpoints: [endpoint] })); return;
  }
  if (url.pathname === '/preview-harness.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.end(`const previewFetch=window.fetch.bind(window);window.fetch=(url,init)=>{if(url===${JSON.stringify(endpoint)})return previewFetch('/api',init);const target=new URL(url,location.href);if(target.origin!==location.origin)throw Error('PREVIEW EXTERNAL NETWORK REFUSED');return previewFetch(url,init);};`); return;
  }
  const assets = new Set(['assets/zxing-0.21.3.min.js','assets/homecoming-live.js','assets/ticket-decoder.js','assets/vendor/jsqr-1.4.0.js','assets/vendor/qrcodejs-1.0.0.js','assets/vendor/zxing-wasm-3.1.5/reader.js','assets/vendor/zxing-wasm-3.1.5/zxing_reader.wasm']);
  const file = url.pathname === '/' ? 'index.html' : assets.has(url.pathname.slice(1)) ? url.pathname.slice(1) : null;
  if (!file) { res.writeHead(404); res.end(); return; }
  let data = fs.readFileSync(path.join(root, file));
  if (file === 'index.html') data = data.toString().replace(/<script src="https:[^"]+"><\/script>/g, '').replace('<script>', '<script src="/preview-harness.js"></script><script>');
  res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : file.endsWith('.wasm') ? 'application/wasm' : 'application/javascript'); res.end(data);
});
server.listen(3894, '127.0.0.1', () => {
  const base = 'http://127.0.0.1:3894/?event=event-1&api=' + encodeURIComponent(endpoint);
  console.log('Fictional preview only. Admin: ' + base + '&tab=dashboard#key=' + admin);
  console.log('Helper: ' + base + '&tab=scanner#key=' + helper);
});
