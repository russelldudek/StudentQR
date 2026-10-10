'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const inline = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const code = inline.slice(0, inline.lastIndexOf('\n    loadSavedConfig();'));
function scanner(options = {}) {
  const elements = new Map(), admitted = [], revoked = [];
  const pixels = { width: 32, height: 16, data: new Uint8ClampedArray(32 * 16 * 4).fill(255) };
  const canvas = { width: 32, height: 16, getContext: () => ({ drawImage() {}, getImageData: () => pixels }) };
  const el = id => {
    if (!elements.has(id)) elements.set(id, { value: '', checked: false, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: {}, innerHTML: '', textContent: '' });
    return elements.get(id);
  };
  const ctx = vm.createContext({ URL: { createObjectURL: () => 'blob:fictional', revokeObjectURL: value => revoked.push(value) },
    window: { jsQR: () => options.qr ? { data: options.qr } : null, ...options.window },
    document: { getElementById: el, createElement: () => canvas, querySelectorAll: () => [], body: { classList: { toggle() {}, remove() {}, add() {} } } },
    Image: class { constructor() { this.naturalWidth = 32; this.naturalHeight = 16; } set src(value) { this.onload(); } },
    navigator: {}, localStorage: { getItem: () => null }, console: { warn() {}, error() {} },
    setTimeout() {}, clearTimeout() {}, Map, Uint8ClampedArray,
    fetch() { throw Error('NETWORK_REFUSED'); } });
  vm.runInContext(code, ctx); ctx.pixels = pixels;
  ctx.admission = async value => admitted.push(value);
  vm.runInContext('admitByQr=admission; toast=()=>{};', ctx);
  return { ctx, admitted, revoked, el, run: code => vm.runInContext(code, ctx) };
}
function software(value = '083', failure) {
  class NotFoundException extends Error {}
  class ChecksumException extends Error {}
  class FormatException extends Error {}
  return { BarcodeFormat: { QR_CODE: 11, CODE_128: 4 }, DecodeHintType: { POSSIBLE_FORMATS: 2, TRY_HARDER: 3 },
    NotFoundException, ChecksumException, FormatException,
    RGBLuminanceSource: class {}, HybridBinarizer: class {}, BinaryBitmap: class {},
    MultiFormatReader: class { setHints() {} reset() {} decodeWithState() { if (failure) throw failure; return { getText: () => value }; } } };
}
test('iPhone software path reads a Code 128 camera frame with leading zeros', async () => {
  const f = scanner({ window: { ZXing: software() } });
  f.ctx.video = { readyState: 2, videoWidth: 32, videoHeight: 16 };
  assert.equal(await f.run('readQrFromVideo(video)'), '083');
});
test('photo barcode preserves the exact ticket for explicit confirmation, never auto-admits', async () => {
  const f = scanner({ window: { ZXing: software('001B') } });
  await f.run('scanFromPhotoFile({name:"fictional.png"})');
  assert.deepEqual(f.admitted, []); assert.equal(f.run('state.decodedCandidate.ticket'), '001B');
  assert.match(f.el('decodedCandidate').innerHTML, /001B/); assert.deepEqual(f.revoked, ['blob:fictional']);
});
test('native detector requests both supported QR and Code 128 formats', async () => {
  let formats;
  class BarcodeDetector { static async getSupportedFormats() { return ['qr_code', 'code_128']; } constructor(options) { formats = options.formats; } }
  const f = scanner({ window: { BarcodeDetector } });
  await f.run('initializeCodeDetector()'); assert.deepEqual(Array.from(formats), ['qr_code', 'code_128']);
});
test('unsupported native format initialization falls back rather than blocking iPhone', async () => {
  class BarcodeDetector { constructor() { throw Error('unsupported'); } }
  const f = scanner({ window: { BarcodeDetector, ZXing: software() } });
  await f.run('initializeCodeDetector()'); assert.equal(f.run('state.detector'), null);
  assert.equal(f.run('decodeCodePixels(pixels)'), '083');
});
test('a QR-only native implementation still falls back for Code 128', async () => {
  class BarcodeDetector { static async getSupportedFormats() { return ['qr_code']; } async detect() { return []; } }
  const f = scanner({ window: { BarcodeDetector, ZXing: software('084') } });
  await f.run('initializeCodeDetector()'); f.ctx.video = { readyState: 2, videoWidth: 32, videoHeight: 16 };
  assert.equal(await f.run('readQrFromVideo(video)'), '084');
});
test('native detection failures do not prevent software ticket reading', async () => {
  const f = scanner({ window: { ZXing: software('085') } });
  f.ctx.badDetector = { async detect() { throw Error('native failure'); } };
  f.run('state.detector=badDetector'); f.ctx.video = { readyState: 2, videoWidth: 32, videoHeight: 16 };
  assert.equal(await f.run('readQrFromVideo(video)'), '085');
});
test('native frame with two different tickets refuses arbitrary first admission', async () => {
  const f = scanner(); f.ctx.video = { readyState: 2, videoWidth: 32, videoHeight: 16 };
  f.ctx.detector = { detect: async () => [{ rawValue: '083' }, { rawValue: '084' }] };
  f.run('state.detector=detector'); await assert.rejects(f.run('readQrFromVideo(video)'), /one ticket/i);
});
test('existing QR fallback continues working without the barcode library', async () => {
  const f = scanner({ qr: 'PROM-001' }); assert.equal(await f.run('decodeQrFromImageFile({})'), 'PROM-001');
});
test('barcode photo fallback works when jsQR is missing', async () => {
  const f = scanner({ window: { jsQR: undefined, ZXing: software('086') } });
  assert.equal(await f.run('decodeQrFromImageFile({})'), '086');
});
test('no-code software result does not request admission', async () => {
  const z = software(); const f = scanner({ window: { ZXing: software('', new z.NotFoundException()) } });
  await f.run('scanFromPhotoFile({})'); assert.deepEqual(f.admitted, []);
});
test('unreadable photo replaces the previous admitted card and clears its ticket', async () => {
  const f = scanner();
  f.el('scanResult').innerHTML = 'Previously admitted';
  await f.run('scanFromPhotoFile({})');
  assert.match(f.el('scanResult').innerHTML, /Cannot Read Ticket/);
  assert.doesNotMatch(f.el('scanResult').innerHTML, /Previously admitted/);
  assert.deepEqual(f.admitted, []);
});
test('photo decoder failure shows a blocked card rather than leaving old success', async () => {
  const f = scanner({ window: { jsQR: undefined } });
  f.el('scanResult').innerHTML = 'Previously admitted';
  await f.run('scanFromPhotoFile({})');
  assert.match(f.el('scanResult').innerHTML, /Cannot Scan Ticket/);
  assert.equal(f.el('scanResult').className, 'stat scan-feedback scan-state-blocked');
  assert.deepEqual(f.admitted, []);
});
test('missing all decoders gives a visible photo error and never admits', async () => {
  const f = scanner({ window: { jsQR: undefined } });
  await assert.rejects(f.run('decodeQrFromImageFile({})'), /decoder|scanning.*unavailable/i);
  assert.deepEqual(f.admitted, []);
});

// Code 128-B: start 104, data 16/24/19 (083), checksum 19, stop 106.
// The expected string is literal; fixture creation never calls the decoder.
function barcodePixels({ sideways = false, invalidChecksum = false } = {}) {
  const symbols = [[2,1,1,2,1,4], [1,2,3,1,2,2], [3,1,1,2,2,2], [2,2,1,1,3,2],
    invalidChecksum ? [1,2,3,1,2,2] : [2,2,1,1,3,2], [2,3,3,1,1,1,2]];
  const width = 324, height = 90, data = new Uint8ClampedArray(width * height * 4).fill(255);
  let x = 60;
  for (const symbol of symbols) {
    let dark = true;
    for (const modules of symbol) {
      if (dark) for (let y = 0; y < height; y++) for (let dx = 0; dx < modules * 3; dx++) {
        const p = (y * width + x + dx) * 4; data[p] = data[p+1] = data[p+2] = 0;
      }
      x += modules * 3; dark = !dark;
    }
  }
  if (!sideways) return { width, height, data };
  const rotated = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const destination = (x * height + height - 1 - y) * 4;
    rotated.set(data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4), destination);
  }
  return { width: height, height: width, data: rotated };
}
for (const sideways of [false, true]) {
  test(`real pinned decoder reads 083 from ${sideways ? 'sideways' : 'upright'} Code 128 pixels`, () => {
    const f = scanner({ window: { ZXing: require('../assets/zxing-0.21.3.min.js') } });
    f.ctx.actual = barcodePixels({ sideways }); assert.equal(f.run('decodeCodePixels(actual)'), '083');
  });
}
test('real decoder rejects an invalid barcode checksum instead of admitting guessed digits', async () => {
  const f = scanner({ window: { ZXing: require('../assets/zxing-0.21.3.min.js') } });
  f.ctx.actual = barcodePixels({ invalidChecksum: true }); assert.equal(f.run('decodeCodePixels(actual)'), '');
});
