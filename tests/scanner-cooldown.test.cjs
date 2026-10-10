const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const functions = [
  html.slice(html.indexOf('    function isLiveProtocol()'), html.indexOf('    async function processLiveDecodedTicket')),
  html.slice(html.indexOf('    function shouldKeepScannerOpen()'), html.indexOf('    function isLegacyBlankStatusAdmitError')),
  html.slice(html.indexOf('    async function startScanning()'), html.indexOf('    function ensureScanCanvas()')),
].join('\n');

// Run the real camera loop with synthetic frames, clock and admission results.
// No camera, Sheet requests or external scripts are used by these tests.
function scanner({ continuous = true, processingMs = 0, qr = '001' } = {}) {
  let now = 10000;
  let frameId = 0;
  let reads = 0;
  let stopped = 0;
  const frames = new Map();
  const admissions = [];
  const video = { setAttribute() {}, async play() {}, srcObject: null };
  const stream = { getTracks: () => [{ stop: () => stopped++ }] };
  const state = { scanning: false, isProcessingScan: false, scanLoopId: null, scanGeneration: 0 };
  const context = vm.createContext({
    state,
    console,
    Date: { now: () => now },
    window: { jsQR() {} },
    document: { hidden: false },
    navigator: { mediaDevices: { getUserMedia: async () => stream } },
    ids: id => id === 'video' ? video : { checked: continuous },
    setScreenAlert() {},
    toast(message) { throw new Error(message); },
    waitForVideoReady: async () => {},
    readQrFromVideo: async () => { reads++; return qr; },
    admitByQr: async value => { admissions.push(value); now += processingMs; },
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  vm.runInContext(functions, context);
  return {
    state, admissions,
    get reads() { return reads; },
    get stopped() { return stopped; },
    setQr(value) { qr = value; },
    advance(ms) { now += ms; },
    start: () => context.startScanning(),
    stop: () => context.stopScanning(),
    async frame() {
      const [id, callback] = frames.entries().next().value || [];
      assert.ok(callback, 'camera loop must have a scheduled frame');
      frames.delete(id);
      await callback();
    },
  };
}

for (const nextQr of ['001', '001B']) {
  test(`continuous scanning waits a full second before accepting ${nextQr}`, async () => {
    const camera = scanner({ processingMs: 2500 });
    await camera.start();
    await camera.frame();
    assert.deepEqual(camera.admissions, ['001']);
    assert.equal(camera.stopped, 0, 'continuous mode keeps camera open');
    camera.setQr(nextQr);
    camera.advance(999);
    await camera.frame();
    assert.deepEqual(camera.admissions, ['001'], 'no admission during cooldown');
    assert.equal(camera.reads, 1, 'do not decode frames during cooldown');
    camera.advance(1);
    await camera.frame();
    assert.deepEqual(camera.admissions, ['001', nextQr]);
  });
}

test('stopping and restarting clears the previous session cooldown', async () => {
  const camera = scanner();
  await camera.start();
  await camera.frame();
  camera.stop();
  camera.setQr('001B');
  await camera.start();
  await camera.frame();
  assert.deepEqual(camera.admissions, ['001', '001B']);
});

test('single-scan mode still stops the camera after the first code', async () => {
  const camera = scanner({ continuous: false });
  await camera.start();
  await camera.frame();
  assert.deepEqual(camera.admissions, ['001']);
  assert.equal(camera.state.scanning, false);
  assert.equal(camera.stopped, 1);
});
