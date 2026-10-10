(function(root) {
  'use strict';
  const fields = ['studentName','studentId','studentTicket','bringingGuest','guestName','guestTicket'];
  const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  root.StudentQrLive = {
    create({request,getSnapshot,refreshRoster,renderResult,renderRelationship,escapeHtml,elements,storage}) {
      const initial = getSnapshot(), namespace = 'studentQrLive:'+JSON.stringify([initial.access.apiUrl,initial.access.eventId])+':';
      let busy = false, resetPreview = null, attention = null, draft = false;
      const el = elements;
      const get = k => { try { const s = storage.getItem(namespace+k); return s ? JSON.parse(s) : null; } catch { return null; } };
      function put(k,value) { const json = JSON.stringify(value); storage.setItem(namespace+k,json); if (storage.getItem(namespace+k) !== json) throw Error('Device storage unavailable. No new operation dispatched.'); }
      function admin() { if (getSnapshot().access.role !== 'admin') throw Error('Eve admin access required.'); }
      function actor() { let value = get('actor'); if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) { value = secret(); put('actor',value); } return value; }
      function current() { const s = getSnapshot(); if (s.config?.apiVersion !== 2 || s.access?.apiUrl !== initial.access.apiUrl || s.access?.eventId !== initial.access.eventId) throw Error('Dance changed. Reload before continuing.'); return s; }
      function message(text) { el('liveMessage').textContent = text; }
      function failure(err,ticket='') { renderRelationship(null); renderResult({kind:'error',ticket,detail:err.message||'Operation not confirmed.'}); message(err.message||'Operation not confirmed.'); }
      function showResult(response,kind) {
        const row = response.row || response.currentRow;
        if (!row && kind !== 'reset') throw Error('Server did not verify the ticket result.');
        renderRelationship(row||null); renderResult({kind:response.alreadyAdmitted?'duplicate':response.testMode?'test':kind,row});
      }
      async function mutate(action,payload) {
        const record = {action,payload};
        if (action !== 'reviewOperation' || !get('operation:'+payload.operationId)) put('operation:'+payload.operationId,record);
        put('pending',payload.operationId);
        el('reconcileLastOperation').disabled = false;
        let response;
        try { response = await request(action,payload); current(); }
        catch (err) { message('Operation not confirmed. Reconcile this operation before retrying.'); throw err; }
        if (['Committed','Cancelled'].includes(response.state) || response.alreadyAdmitted || response.testMode) {
          if (get('pending') === payload.operationId) storage.removeItem(namespace+'pending');
          el('reconcileLastOperation').disabled = !get('pending');
        }
        return response;
      }
      async function reconcileOperation(operationId) {
        current(); const saved = get('operation:'+operationId); if (!saved) throw Error('Local operation proof is unavailable; ask Eve.');
        let response = await request('getOperation',{operationId,...(saved.payload.actorSecret?{actorSecret:saved.payload.actorSecret,undoSecret:saved.payload.undoSecret}:{})});
        if (response.state === 'NotFound' && saved.action !== 'reviewOperation') response = await request('cancelUncommitted',{originalAction:saved.action,originalPayload:saved.payload});
        if (response.state === 'Committed') {
          if (get('pending') === operationId) storage.removeItem(namespace+'pending');
          if (response.receipt && response.canUndo) put('latest',{...saved,receipt:response.receipt});
          // Current server truth may now be reset; an old Committed operation is not a new admission.
          if (response.currentRow) showResult(response,response.currentRow.Status==='Admitted'?'admitted':'undo');
          message('Original operation reconciled against current attendance.');
        } else if (response.state === 'Cancelled') {
          if (get('pending') === operationId) storage.removeItem(namespace+'pending');
          if (get('latest')?.receipt?.operationId === operationId) storage.removeItem(namespace+'latest');
          renderRelationship(null); renderResult({kind:'error',ticket:saved.payload.qrValue||'',detail:'Operation cancellation verified. No check-in was committed by this operation.'});
          el('reconcileLastOperation').disabled = !get('pending');
          message('Cancellation verified. You can scan again.'); await refreshRoster();
        } else message(response.state==='NotFound'?'No verified commit found yet. Keep the original operation ID; ask Eve before retrying.':'Operation '+response.state+'. Eve review required.');
        await reconcileLatest(); return response;
      }
      async function reconcileLatest() {
        el('undoLatestCheckIn').disabled = true;
        const latest = get('latest'); if (!latest?.receipt || getSnapshot().config.testMode) return;
        try {
          current();
          const response = await request('getOperation',{operationId:latest.receipt.operationId,actorSecret:latest.payload.actorSecret,undoSecret:latest.payload.undoSecret});
          if (response.canUndo && response.state==='Committed') {
            el('undoLatestCheckIn').textContent = 'Undo Last Check-In: '+latest.receipt.ticketId;
            el('undoLatestCheckIn').disabled = busy;
          }
        } catch { /* An unverified receipt never enables Undo. */ }
      }
      async function submitTicket(ticket,source,generation) {
        if (busy) return; busy = true; el('undoLatestCheckIn').disabled = true;
        try {
          current(); if (get('pending')) throw Error('A previous operation is unconfirmed. Reconcile it before scanning again.');
          if (typeof ticket !== 'string' || !ticket || ticket.trim() !== ticket) throw Error('Enter the exact printed ticket value.');
          if (generation !== undefined && generation !== getSnapshot().scanGeneration) return;
          const before = getSnapshot().scanGeneration;
          if (!await refreshRoster()) throw Error('Current roster unavailable. No check-in requested.');
          const s = current(); if (generation !== undefined && (generation !== s.scanGeneration || before !== s.scanGeneration || s.hidden)) return;
          const matches = s.rows.filter(r=>r.QR_ID===ticket);
          if (matches.length !== 1 || matches[0].quarantined || !matches[0].assignmentHash) throw Error(matches.length?'Ticket needs Eve review.':'Ticket not on list.');
          const row = matches[0];
          if (s.config.testMode) { showResult({row,testMode:true,alreadyAdmitted:row.Status==='Admitted'},'test'); return; }
          const payload = {qrValue:ticket,expectedAssignmentHash:row.assignmentHash,expectedRosterRevision:s.rosterRevision,operationId:crypto.randomUUID(),actorSecret:actor(),undoSecret:secret()};
          if (generation !== undefined && (generation !== getSnapshot().scanGeneration || getSnapshot().hidden)) return;
          const response = await mutate('admit',payload);
          if (!response.testMode && (!response.row || response.row.Status !== 'Admitted' || !/^\d{4}-\d{2}-\d{2}T/.test(response.row['Admitted At']))) throw Error('Server admission is not verified. Reconcile the original operation.');
          if (response.receipt && !response.alreadyAdmitted) put('latest',{action:'admit',payload,receipt:response.receipt});
          showResult(response,'admitted'); await refreshRoster();
        } catch (err) { failure(err,ticket); }
        finally { busy = false; await reconcileLatest(); }
      }
      async function undoLatest() {
        if (busy) return; busy = true;
        try {
          current(); if (get('pending')) throw Error('Reconcile the previous operation first.');
          const latest = get('latest'); if (!latest?.receipt) throw Error('No owned undo receipt. Ask Eve.');
          const truth = await request('getOperation',{operationId:latest.receipt.operationId,actorSecret:latest.payload.actorSecret,undoSecret:latest.payload.undoSecret});
          if (!truth.canUndo) throw Error('This is no longer your latest active check-in. Ask Eve.');
          const response = await mutate('undoLatest',{receipt:latest.receipt,actorSecret:latest.payload.actorSecret,undoSecret:latest.payload.undoSecret,operationId:crypto.randomUUID()});
          showResult(response,'undo'); storage.removeItem(namespace+'latest'); await refreshRoster();
        } catch (err) { failure(err); }
        finally { busy = false; await reconcileLatest(); }
      }
      function renderAttention() {
        const records = attention.records;
        el('liveAttention').innerHTML = records.length ? '<p>Edit the records you want to fix. Edited records are selected automatically. Publish up to 100 selected records together.</p>'+records.map(r=>r.removedSource?`<div class="live-record"><h3>Removed source record ${r.sourceRow}: ${escapeHtml(r.fields.studentName||'Missing student name')}</h3><p>Retiring this override releases its old ticket reservations. It does not restore or edit the intake, transfer attendance, or erase history.</p><button type="button" data-retire="${escapeHtml(r.correctionVersion)}">Review And Retire Removed Override</button></div>`:`<form class="live-record" data-record-id="${escapeHtml(r.recordId)}"><h3>Record ${r.sourceRow}: ${escapeHtml(r.fields.studentName||'Missing student name')}</h3><p>${r.issues.map(escapeHtml).join('<br>')}</p><label><input type="checkbox" name="includeRecord"> Include this record in publication</label><div class="live-fields">${fields.map(k=>`<label>${escapeHtml(k)}<input name="${k}" value="${escapeHtml(r.fields[k]??'')}" autocomplete="off"></label>`).join('')}</div></form>`).join('') : '<p>No conflicting or incomplete tickets.</p>';
        el('publishLiveCorrections').disabled = !records.length;
        el('livePending').innerHTML = attention.pending.map(p=>`<div class="live-record"><strong>${escapeHtml(p.kind)} Pending</strong><p>${escapeHtml(p.tickets.join(', '))}</p><button type="button" data-review="${escapeHtml(p.operationId)}" data-decision="cancel">Review / Cancel Pending</button>${p.kind==='Noop'?'':`<button type="button" data-review="${escapeHtml(p.operationId)}" data-decision="complete">Review / Complete Pending</button>`}</div>`).join('') + attention.attendanceReview.map(a=>`<div class="live-record"><strong>Attendance assignment changed: ${escapeHtml(a.ticketId)}</strong><p>Review the current student/guest record before resetting this ticket. Reset All cannot bypass this.</p><button type="button" data-drift="${escapeHtml(a.ticketId)}" data-hash="${escapeHtml(a.currentAssignmentHash)}">Review Current Assignment And Reset</button></div>`).join('');
      }
      async function loadAttention({discardDraft=false}={}) {
        admin(); current(); if (draft && !discardDraft) { message('Draft retained. Reload / Discard Draft explicitly to get fresh records.'); return attention; }
        attention = await request('getAttention',{}); draft = false; renderAttention(); el('liveCorrectionDiff').textContent = ''; return attention;
      }
      function collectEdits() {
        if (!attention) throw Error('Load Needs Attention first.');
        const forms = Array.from(el('liveAttention').querySelectorAll('form')).filter(form=>form.querySelector('[name="includeRecord"]').checked);
        if (!forms.length) throw Error('Select at least one record to publish.');
        if (forms.length > 100) throw Error('Select no more than 100 records per atomic publication.');
        return forms.map(form=>{
          const record = attention.records.find(r=>r.recordId===form.dataset.recordId);
          const values = {}; fields.forEach(k=>{values[k]=form.querySelector('[name="'+k+'"]').value;});
          return {recordId:record.recordId,sourceRow:record.sourceRow,baseHash:record.baseHash,correctionVersion:record.correctionVersion,fields:values};
        });
      }
      async function publishCorrections(edits) {
        admin(); if (busy) return; busy = true;
        try {
          current(); if (get('pending')) throw Error('Reconcile previous operation first.');
          const response = await mutate('publishCorrections',{edits:edits||collectEdits(),expectedRosterRevision:attention.rosterRevision,operationId:crypto.randomUUID()});
          if (response.state !== 'Committed') throw Error('Correction publication not verified.');
          draft = false; message('Corrections published globally. Other visible devices refresh within eight seconds.'); await refreshRoster(); await loadAttention(); return response;
        } catch (err) { message(err.message); throw err; } finally { busy = false; }
      }
      function cancelReset() { resetPreview = null; el('liveResetDialog').classList.add('hidden'); }
      async function previewReset(scope,ticketId,reviewedAssignmentHash) {
        admin(); if (busy) return; current(); cancelReset();
        resetPreview = await request('previewReset',{scope,...(ticketId?{ticketId}:{}),...(reviewedAssignmentHash?{reviewedAssignmentHash}:{})});
        if (resetPreview.requiresReview || !resetPreview.confirmationToken) { resetPreview=null; throw Error('Pending / changed assignments need individual Eve review first.'); }
        el('liveResetWarning').textContent = 'ARE YOU SURE!? '+(scope==='ticket'?'Reset ticket '+ticketId:scope==='operation'?'Review Pending operation':scope==='correction'?'Retire removed override and release '+resetPreview.count+' ticket reservations':'Reset all '+resetPreview.count+' checked-in tickets')+'? History is retained.';
        el('liveResetDialog').classList.remove('hidden'); el('cancelLiveReset').focus?.(); return resetPreview;
      }
      async function confirmReset() {
        admin(); if (busy || !resetPreview) return; busy = true; const p = resetPreview; cancelReset();
        try {
          current(); if (get('pending') && !(p.scope === 'operation' && get('pending') === p.ticketId)) throw Error('Reconcile previous operation first.');
          const response = p.scope === 'correction' ? await mutate('retireCorrection',{correctionId:p.ticketId,expectedRosterRevision:p.rosterRevision,confirmationToken:p.confirmationToken,operationId:crypto.randomUUID()}) : p.scope === 'operation' ? await mutate('reviewOperation',{operationId:p.ticketId,decision:p.decision,intentHash:p.intentHash,confirmationToken:p.confirmationToken}) : await mutate(p.scope==='all'?'resetAll':'resetTicket',{scope:p.scope,...(p.ticketId?{ticketId:p.ticketId}:{}),confirmationToken:p.confirmationToken,expectedAttendanceRevision:p.attendanceRevision,operationId:crypto.randomUUID(),...(p.reviewedAssignmentHash?{reviewedAssignmentHash:p.reviewedAssignmentHash}:{})});
          if (!['Committed','Cancelled'].includes(response.state)) throw Error('Reset/review not verified.');
          if (response.row || response.currentRow) showResult(response,(response.row||response.currentRow).Status==='Admitted'?'admitted':'undo');
          else if (response.state === 'Cancelled') { renderRelationship(null); renderResult({kind:'error',detail:'Operation Cancelled by Eve. No attendance change committed by this operation.'}); }
          message('Reset/review verified. History retained.'); await refreshRoster(); await loadAttention({discardDraft:false}); return response;
        } catch (err) { message(err.message); throw err; } finally { busy = false; await reconcileLatest(); }
      }
      async function reviewOperation(operationId,decision) {
        admin(); if (!attention) await loadAttention(); const op = attention.pending.find(o=>o.operationId===operationId); if (!op) throw Error('Reload Pending operations.');
        await previewReset('operation',operationId); resetPreview.decision = decision;
        el('liveResetWarning').textContent = 'ARE YOU SURE!? '+decision.toUpperCase()+' '+op.kind+' Pending for '+op.tickets.join(', ')+'?';
      }
      async function setMode(enabled) {
        admin(); if (busy) throw Error('Finish the current operation first.'); busy = true;
        try { const response = await mutate('setTestMode',{testMode:enabled,operationId:crypto.randomUUID()}); await refreshRoster(); return response; } finally { busy=false; }
      }
      async function rename(eventName) { admin(); const response = await mutate('saveEvent',{eventName,operationId:crypto.randomUUID()}); await refreshRoster(); return response; }
      async function refreshAttention() { if (getSnapshot().access.role === 'admin' && !draft) { try { await loadAttention(); } catch (err) { message(err.message); } } }
      function updateUi() {
        const s = getSnapshot(), isAdmin = s.access.role==='admin'; el('liveAdminControls').classList.toggle('hidden',!isAdmin); el('liveScanControls').classList.remove('hidden');
        el('reconcileLastOperation').disabled = !get('pending');
        if (!isAdmin) { el('liveAttention').innerHTML=''; el('livePending').innerHTML=''; cancelReset(); }
      }
      el('liveAttention').addEventListener('input',event=>{draft=true;const form=event.target.closest('form');if(form&&event.target.name!=='includeRecord')form.querySelector('[name="includeRecord"]').checked=true;try{el('liveCorrectionDiff').textContent='Review selected changes before publishing:\n'+JSON.stringify(collectEdits().map(e=>({before:attention.records.find(r=>r.recordId===e.recordId).fields,after:e.fields})),null,2);}catch(err){el('liveCorrectionDiff').textContent=err.message;}});
      el('liveAttention').addEventListener('click',event=>{if(event.target.dataset.retire)previewReset('correction',event.target.dataset.retire).catch(err=>message(err.message));});
      el('livePending').addEventListener('click',event=>{const target=event.target;if(target.dataset.review)reviewOperation(target.dataset.review,target.dataset.decision).catch(err=>message(err.message));if(target.dataset.drift)previewReset('ticket',target.dataset.drift,target.dataset.hash).catch(err=>message(err.message));});
      root.addEventListener?.('storage',()=>{el('undoLatestCheckIn').disabled=true;reconcileLatest();});
      updateUi(); return {submitTicket,undoLatest,loadAttention,publishCorrections,previewReset,confirmReset,cancelReset,reviewOperation,reconcileOperation,reconcileLatest,setMode,rename,updateUi,refreshAttention,
        reconcilePending:()=>reconcileOperation(get('pending'))};
    }
  };
})(window);
