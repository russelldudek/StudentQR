const {test}=require('node:test'),assert=require('node:assert/strict');
const {liveFixture,admin,actor,undo}=require('./helpers/homecoming-live-fixtures.cjs');
const {liveUi}=require('./helpers/homecoming-live-ui.cjs');
test('read-only removes undo authority and refuses latest helper undo without writes',()=>{
  const f=liveFixture();f.ready();const a=f.admit('083');
  const mode=f.request({action:'setTestMode',token:admin,testMode:true,operationId:'pause-undo'});
  const proof=f.request({action:'getOperation',operationId:a.operationId,actorSecret:actor,undoSecret:undo});
  assert.equal(proof.canUndo,false);assert.equal(proof.receipt,undefined);const writes=f.writes().length;
  assert.ok(f.request({action:'undoLatest',revision:mode.revision,receipt:a.receipt,actorSecret:actor,undoSecret:undo,operationId:'paused-undo'}).error);
  assert.equal(f.writes().length,writes);assert.equal(f.list().rows.find(r=>r.QR_ID==='083').Status,'Admitted');
});
test('changed source ticket blocks replacement admission until original attendance is reset',()=>{
  const f=liveFixture();f.ready();f.admit('083');
  f.books.get('live-test').getSheetByName('Ticket Checklist').values[6][2]='085';
  const attention=f.request({action:'getAttention',token:admin});assert.ok(attention.records.length);
  assert.ok(f.admit('085').error);assert.equal(f.run('readLiveContext_(readLiveBinding_(),readLiveEvent_()).state.active.length'),1);
});
test('rename cannot replace an unresolved admission pointer',async()=>{
  const f=liveUi({role:'admin'});await f.run('loadEventFromUrl()');f.backend.fault.at='status';f.backend.fault.hit=1;
  await f.run('admitByQr("001")');f.backend.fault.at='';
  const key=[...f.storage.keys()].find(k=>k.endsWith(':pending')),id=f.storage.get(key);
  await assert.rejects(f.run('state.liveController.rename("Changed Name")'),/reconcile|previous/i);
  assert.equal(f.storage.get(key),id);assert.equal(f.el('reconcileLastOperation').disabled,false);
});
test('remote reset refresh replaces green card with current not-checked-in truth',async()=>{
  const f=liveUi();await f.run('loadEventFromUrl()');await f.run('admitByQr("083")');
  const p=f.backend.request({action:'previewReset',token:admin,scope:'all'});
  f.backend.request({action:'resetAll',token:admin,scope:'all',confirmationToken:p.confirmationToken,expectedAttendanceRevision:p.attendanceRevision,operationId:'remote-reset-final'});
  await f.run('loadRoster({silent:true})');assert.match(f.el('scanResult').innerHTML,/scan-kicker">Not Checked In/);assert.doesNotMatch(f.el('scanResult').className,/scan-state-success/);
});
test('multi-ticket refusal cannot be repainted as the previous green scan by polling',async()=>{
  const f=liveUi();await f.run('loadEventFromUrl()');await f.run('admitByQr("083")');
  f.run('document.getElementById("keepScannerOpen").checked=true;initializeCodeDetector=async()=>{};waitForVideoReady=async()=>{};readQrFromVideo=async()=>{throw Error("Multiple tickets visible. Scan one ticket.");};');
  await f.run('startScanning()');await f.frames.shift()();assert.match(f.el('scanResult').innerHTML,/Cannot Read Ticket/);
  const n=f.calls.filter(c=>c.action==='admit').length;await f.run('loadRoster({silent:true})');
  assert.equal(f.calls.filter(c=>c.action==='admit').length,n);assert.match(f.el('scanResult').innerHTML,/Cannot Read Ticket/);assert.match(f.el('scanResult').className,/scan-state-blocked/);
});
