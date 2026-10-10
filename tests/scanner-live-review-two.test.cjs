const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {liveFixture,source,admin,helper,actor,undo,sha}=require('./helpers/homecoming-live-fixtures.cjs');
const {liveUi}=require('./helpers/homecoming-live-ui.cjs');
function preview(f,scope='all',ticketId){return f.request({action:'previewReset',token:admin,scope,...(ticketId?{ticketId}:{})});}
test('journal replay rejects revocations naming another ticket or actor',()=>{for(const changed of ['ticket','actor','older']){const f=liveFixture();f.ready();const a=f.admit('001');if(changed==='older')f.admit('083');const intent={operationId:'forged-undo',kind:'Undo',actorHash:changed==='actor'?sha('e'.repeat(64)):sha(actor),requestHash:'a'.repeat(64),tickets:[changed==='ticket'?'083':'001'],admissions:[],corrections:[],revoke:[a.receipt.admissionId]};const json=JSON.stringify(intent);f.books.get('live-test').getSheetByName('Homecoming Audit').values.push([intent.operationId,intent.kind,intent.actorHash,json,sha(json),new Date().toISOString(),'Committed']);assert.match(f.list().error||'',/undo|revocation|ticket|actor|latest/i,changed);}});
test('lost duplicate response reconciles original ID without stranding device or admitting it later',async()=>{const f=liveUi({failResponse:b=>b.action==='admit'&&b.qrValue==='001'});await f.run('loadEventFromUrl()');f.backend.admit('001');await f.run('admitByQr("001")');const original=f.calls.find(c=>c.action==='admit');await f.run('state.liveController.reconcilePending()');await f.run('admitByQr("083")');assert.equal(f.backend.list().rows.find(r=>r.QR_ID==='083').Status,'Admitted');const n=f.backend.writes().length;assert.ok(f.backend.rawRequest(original).error);assert.equal(f.backend.writes().length,n);assert.equal(f.backend.list().rows.find(r=>r.QR_ID==='001').Status,'Admitted');});
test('large Reset All confirmation fits a 9KiB property and derives IDs under lock',()=>{const s=source().slice(0,5);for(let i=0;i<240;i++)s.push(['Fiction '+i,'SID-'+i,('00'+i).slice(-3),'','No','','','','','']);const f=liveFixture({source:s,maxPropertyBytes:9216});f.ready();const rows=f.list().rows,book=f.books.get('live-test'),stamp=new Date().toISOString();for(const [i,row]of rows.entries()){const id=randomUUID(),payload=[randomUUID(),id,'live-event','Student',JSON.stringify(row.QR_ID),JSON.stringify('SID-'+i),row.assignmentHash,sha(actor),sha(undo),stamp],intent={operationId:id,kind:'Admit',actorHash:sha(actor),requestHash:'a'.repeat(64),tickets:[row.QR_ID],admissions:[payload],corrections:[],revoke:[]},json=JSON.stringify(intent);book.getSheetByName('Homecoming Check-ins').values.push(payload);book.getSheetByName('Homecoming Audit').values.push([id,'Admit',sha(actor),json,sha(json),stamp,'Committed']);}const p=preview(f);assert.ok(p.confirmationToken,p.error);assert.equal(p.count,240);assert.equal(f.request({action:'resetAll',token:admin,scope:'all',confirmationToken:p.confirmationToken,expectedAttendanceRevision:p.attendanceRevision,operationId:'all-240'}).state,'Committed');assert.equal(f.list().rows.filter(r=>r.Status==='Admitted').length,0);});
test('completing Pending Admit displays admitted current server truth, never undo',async()=>{const f=liveUi({role:'admin'});await f.run('loadEventFromUrl()');f.backend.fault.at='status';f.backend.fault.hit=1;await f.run('admitByQr("001")');f.backend.fault.at='';f.ctx.id=f.calls.find(c=>c.action==='admit').operationId;await f.run('state.liveController.loadAttention()');await f.run('state.liveController.reviewOperation(id,"complete")');await f.run('state.liveController.confirmReset()');assert.equal(f.backend.list().rows.find(r=>r.QR_ID==='001').Status,'Admitted');assert.doesNotMatch(f.el('scanResult').innerHTML,/scan-kicker">Not Checked In/);assert.match(f.el('scanResult').innerHTML,/scan-kicker">Admitted/);});
test('Eve can retire a removed correction with a fresh warning without touching intake or history',()=>{const s=source();s[6][0]='';const f=liveFixture({source:s});f.ready();const a=f.request({action:'getAttention',token:admin}),r=a.records.find(r=>r.sourceRow===7),edit={recordId:r.recordId,sourceRow:r.sourceRow,baseHash:r.baseHash,correctionVersion:r.correctionVersion,fields:{...r.fields,studentName:'Fixed Fiction'}};const corrected=f.request({action:'publishCorrections',token:admin,edits:[edit],expectedRosterRevision:a.rosterRevision,operationId:'correct-removed'});assert.equal(corrected.state,'Committed');f.books.get('live-test').getSheetByName('Ticket Checklist').values.pop();const before=f.request({action:'getAttention',token:admin}),removed=before.records[0],p=f.request({action:'previewReset',token:admin,revision:before.revision,scope:'correction',ticketId:removed.correctionVersion});assert.ok(p.confirmationToken,p.error);const result=f.request({action:'retireCorrection',token:admin,revision:before.revision,operationId:'retire-removed',correctionId:removed.correctionVersion,expectedRosterRevision:before.rosterRevision,confirmationToken:p.confirmationToken});assert.equal(result.state,'Committed',result.error);assert.equal(f.request({action:'getAttention',token:admin}).records.length,0);assert.equal(f.books.get('live-test').getSheetByName('Homecoming Corrections').values.length,2);assert.ok(f.writes().every(w=>w[2]!=='Ticket Checklist'));assert.match(f.request({action:'retireCorrection',token:helper}).error,/admin|fields/i);});

function originalAdmit(f,operationId='delayed-original') {
  const list=f.list(),row=list.rows.find(r=>r.QR_ID==='083');
  return {qrValue:'083',expectedAssignmentHash:row.assignmentHash,expectedRosterRevision:list.rosterRevision,operationId,actorSecret:actor,undoSecret:undo};
}
test('a committed original beats reconciliation and preserves its owned receipt',()=>{
  const f=liveFixture();f.ready();const payload=originalAdmit(f);
  const committed=f.request({action:'admit',...payload}),writes=f.writes().length;
  const result=f.request({action:'cancelUncommitted',originalAction:'admit',originalPayload:payload});
  assert.equal(result.state,'Committed');assert.equal(result.receipt.admissionId,committed.receipt.admissionId);assert.equal(f.writes().length,writes);
  assert.match(f.request({action:'cancelUncommitted',originalAction:'admit',originalPayload:{...payload,qrValue:'001'}}).error,/intent mismatch/i);
});
test('terminal no-op is owned, idempotent, and beats a late original request',()=>{
  const f=liveFixture();f.ready();const payload=originalAdmit(f);
  const cancelled=f.request({action:'cancelUncommitted',originalAction:'admit',originalPayload:payload}),writes=f.writes().length;
  assert.equal(cancelled.state,'Cancelled');assert.equal(cancelled.canUndo,false);
  assert.equal(f.request({action:'cancelUncommitted',originalAction:'admit',originalPayload:payload}).state,'Cancelled');
  assert.match(f.request({action:'admit',...payload}).error,/Cancelled/i);assert.equal(f.writes().length,writes);
  assert.equal(f.request({action:'getOperation',operationId:payload.operationId,actorSecret:actor,undoSecret:undo}).state,'Cancelled');
  assert.match(f.request({action:'getOperation',operationId:payload.operationId,actorSecret:actor,undoSecret:'e'.repeat(64)}).error,/ownership/i);
  assert.equal(f.list().rows.find(r=>r.QR_ID==='083').Status,'');
});
test('helper cannot cancel an admin mutation or inject original request fields before IO',()=>{
  const f=liveFixture();f.ready();
  for(const originalAction of ['publishCorrections','retireCorrection','setTestMode','resetAll','saveEvent']) {
    f.trace.length=0;
    assert.match(f.request({action:'cancelUncommitted',originalAction,originalPayload:{operationId:'forbidden-original'}}).error,/admin/i);
    assert.equal(f.trace.filter(t=>t[0]==='open'||t[0]==='write').length,0);
  }
  f.trace.length=0;
  assert.match(f.request({action:'cancelUncommitted',originalAction:'admit',originalPayload:{...originalAdmit(f),token:admin}}).error,/fields/i);
  assert.equal(f.writes().length,0);
});
test('a failed cancellation reservation stays Pending until explicit Eve cancellation',async()=>{
  const f=liveUi({role:'admin'});await f.run('loadEventFromUrl()');
  const payload=originalAdmit(f.backend);f.backend.fault.at='status';f.backend.fault.hit=1;
  assert.match(f.backend.request({action:'cancelUncommitted',originalAction:'admit',originalPayload:payload}).error,/Injected status/);
  f.backend.fault.at='';await f.run('state.liveController.loadAttention()');
  assert.doesNotMatch(f.el('livePending').innerHTML,/data-decision="complete"/);
  const p=preview(f.backend,'operation',payload.operationId);
  assert.match(f.backend.request({action:'reviewOperation',token:admin,operationId:payload.operationId,decision:'complete',intentHash:p.intentHash,confirmationToken:p.confirmationToken}).error,/never completed/);
  const result=f.backend.request({action:'reviewOperation',token:admin,operationId:payload.operationId,decision:'cancel',intentHash:p.intentHash,confirmationToken:p.confirmationToken});
  assert.equal(result.state,'Cancelled');assert.equal(f.backend.list().rows.find(r=>r.QR_ID==='083').Status,'');
});
test('admin pre-write uncertainty can be cancelled without executing its original mutation',()=>{
  const f=liveFixture();f.ready();const payload={testMode:true,operationId:'lost-before-mode'};
  const result=f.request({action:'cancelUncommitted',token:admin,originalAction:'setTestMode',originalPayload:payload});
  assert.equal(result.state,'Cancelled');assert.equal(f.request({action:'getEvent',token:admin}).config.testMode,false);
  assert.match(f.request({action:'setTestMode',token:admin,...payload}).error,/Cancelled/i);
});
test('removed override retirement refuses active attendance and stale previews',()=>{
  const s=source();s[6][0]='';const f=liveFixture({source:s});f.ready();
  const attention=f.request({action:'getAttention',token:admin}),r=attention.records[0];
  assert.equal(f.request({action:'publishCorrections',token:admin,expectedRosterRevision:attention.rosterRevision,operationId:'fix-for-retirement',edits:[{recordId:r.recordId,sourceRow:r.sourceRow,baseHash:r.baseHash,correctionVersion:r.correctionVersion,fields:{...r.fields,studentName:'Fixed Fiction'}}]}).state,'Committed');
  const revision=f.request({action:'getEvent',token:admin}).revision;
  const admitted=f.admit(r.fields.studentTicket,{revision});assert.equal(admitted.state,'Committed');
  f.books.get('live-test').getSheetByName('Ticket Checklist').values.pop();
  const current=f.request({action:'getAttention',token:admin}),removed=current.records[0];
  assert.match(f.request({action:'previewReset',token:admin,revision:current.revision,scope:'correction',ticketId:removed.correctionVersion}).error,/active/i);
  const reset=f.request({action:'previewReset',token:admin,revision:current.revision,scope:'ticket',ticketId:admitted.receipt.ticketId,reviewedAssignmentHash:current.attendanceReview[0].currentAssignmentHash});
  assert.equal(f.request({action:'resetTicket',token:admin,revision:current.revision,scope:'ticket',ticketId:admitted.receipt.ticketId,confirmationToken:reset.confirmationToken,expectedAttendanceRevision:reset.attendanceRevision,reviewedAssignmentHash:reset.reviewedAssignmentHash,operationId:'reset-before-retirement'}).state,'Committed');
  const p=f.request({action:'previewReset',token:admin,revision:current.revision,scope:'correction',ticketId:removed.correctionVersion});
  const fresh=f.list();f.admit('001',{revision:fresh.revision});const count=f.writes().length;
  assert.match(f.request({action:'retireCorrection',token:admin,revision:current.revision,correctionId:removed.correctionVersion,confirmationToken:p.confirmationToken,expectedRosterRevision:p.rosterRevision,operationId:'stale-retirement'}).error,/stale|changed/i);
  assert.equal(f.writes().length,count);
});
