// Owner-editor operations only. No HTTP action exposes provisioning or credential recovery.
function liveOwnerLock_(callback) {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) liveError_('Owner preparation busy.');
  try { return callback(); } finally { lock.releaseLock(); }
}
function liveOwnerTarget_(binding) {
  var endpoint = PropertiesService.getScriptProperties().getProperty('studentQrLiveDeploymentUrl');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint || '')) liveError_('Owner must pin the actual /exec deployment URL.');
  if (binding && (Object.keys(LIVE_DEPLOYMENT).some(function(k) { return binding[k] !== LIVE_DEPLOYMENT[k]; }) || binding.apiUrl !== endpoint || ['preparing','ready'].indexOf(binding.stage) < 0)) liveError_('Existing owner binding/deployment target mismatch.');
  if (LIVE_DEPLOYMENT.spreadsheetId === '1830rSf7hcYX2NUUMG5GByGqTT2626PS4gnJuYf9TjdI') liveError_('Accepted mirror target refused.');
  return endpoint;
}
function liveStoreProperty_(key,value) {
  var properties = PropertiesService.getScriptProperties(), json = liveJson_(value); properties.setProperty(key,json);
  if (properties.getProperty(key) !== json) liveError_('Owner property readback failed.');
}
function prepareHomecomingLive() {
  return liveOwnerLock_(function() {
    var properties = PropertiesService.getScriptProperties(), saved = properties.getProperty('studentQrLiveBinding'), binding;
    if (saved) { try { binding = JSON.parse(saved); } catch (e) { liveError_('Corrupt existing owner binding; no repair performed.'); } }
    var apiUrl = liveOwnerTarget_(binding), book = SpreadsheetApp.openById(LIVE_DEPLOYMENT.spreadsheetId);
    if (book.getId() !== LIVE_DEPLOYMENT.spreadsheetId) liveError_('Wrong owner workbook.');
    if (binding && binding.stage === 'ready') {
      var event = properties.getProperty('studentQrLiveEvent');
      if (event) { readLiveContext_(binding,readLiveEvent_()); return {stage:'ready',spreadsheetId:binding.spreadsheetId}; }
    }
    var sourceSheet = book.getSheetByName(LIVE_DEPLOYMENT.sourceSheetName); if (!sourceSheet) liveError_('Missing original source.');
    buildLiveRoster_(sourceSheet.getDataRange().getValues(),{operations:[],active:[],pending:[],corrections:[]});
    var pairs = [['attendance',LIVE_DEPLOYMENT.attendanceSheetName],['audit',LIVE_DEPLOYMENT.auditSheetName],['corrections',LIVE_DEPLOYMENT.correctionsSheetName]];
    pairs.forEach(function(pair) {
      var s = book.getSheetByName(pair[1]);
      if (s && !binding) liveError_('Unrelated existing state tab refused; do not clear it.');
      if (s && s.getLastRow() > 0 && (s.getLastRow() !== 1 || liveJson_(s.getDataRange().getValues()) !== liveJson_([LIVE_STATE_HEADERS[pair[0]]]) || s.getDataRange().getFormulas().some(function(r) { return r.some(function(v) { return v !== ''; }); }))) liveError_('Incompatible existing state schema; no overwrite performed.');
    });
    binding = Object.assign({},LIVE_DEPLOYMENT,{stage:'preparing',apiUrl:apiUrl}); liveStoreProperty_('studentQrLiveBinding',binding);
    pairs.forEach(function(pair) {
      liveOwnerTarget_(binding); var sheet = book.getSheetByName(pair[1]) || book.insertSheet(pair[1]);
      if (sheet.getLastRow() === 0) {
        var header = LIVE_STATE_HEADERS[pair[0]], range = sheet.getRange(1,1,1,header.length); range.setNumberFormat('@');
        range.setRichTextValues([header.map(function(v) { return SpreadsheetApp.newRichTextValue().setText(v).build(); })]); SpreadsheetApp.flush();
      }
      if (liveJson_(sheet.getDataRange().getValues()) !== liveJson_([LIVE_STATE_HEADERS[pair[0]]])) liveError_('Owner header readback failed.');
    });
    binding.stage = 'ready'; liveStoreProperty_('studentQrLiveBinding',binding);
    return {stage:'ready',spreadsheetId:binding.spreadsheetId};
  });
}
function liveOwnerConfig_(binding) {
  return {apiVersion:2,rosterMode:'homecoming-2026',environment:binding.environment,
    sheetUrl:'https://docs.google.com/spreadsheets/d/'+binding.spreadsheetId+'/edit',apiUrl:binding.apiUrl,sheetName:binding.sourceSheetName,
    firstNameCol:'First Name',lastNameCol:'Last Name',qrCol:'QR_ID',statusCol:'Status',admittedAtCol:'Admitted At',guestCol:'Bringing Guest',
    eventName:binding.environment === 'live-test'?'Homecoming 2026 - Practice - Not Real Attendance':'Homecoming 2026',
    admittedValue:'Admitted',timeZone:'America/New_York',testMode:true};
}
function liveOwnerToken_() { return hashLive_(Utilities.getUuid()+Utilities.getUuid()+Utilities.getUuid()); }
function liveOwnerLinks_(event,binding,adminToken) {
  var base = 'https://russelldudek.github.io/StudentQR/?event='+encodeURIComponent(event.eventId)+'&api='+encodeURIComponent(binding.apiUrl);
  return {eventId:event.eventId,adminUrl:adminToken?base+'&tab=dashboard#key='+adminToken:undefined,helperUrl:base+'&tab=scanner#key='+event.helperToken};
}
function initializeHomecomingLive() {
  return liveOwnerLock_(function() {
    var binding = readLiveBinding_(); liveOwnerTarget_(binding); if (binding.stage !== 'ready') liveError_('Complete owner preparation first.');
    var existing = PropertiesService.getScriptProperties().getProperty('studentQrLiveEvent');
    if (existing) {
      var prior = readLiveEvent_(), current = readLiveContext_(binding,prior);
      return Object.assign({created:false,testMode:current.config.testMode},liveOwnerLinks_(prior,binding));
    }
    var adminToken = liveOwnerToken_(), helperToken = liveOwnerToken_();
    if (adminToken === helperToken) liveError_('Role credential collision.');
    var event = {version:2,eventId:Utilities.getUuid(),authRevision:1,adminHash:hashLive_(adminToken),helperHash:hashLive_(helperToken),helperToken:helperToken,config:liveOwnerConfig_(binding)};
    var context = readLiveContext_(binding,event);
    if (context.state.operations.length || context.grids.attendance.length !== 1 || context.grids.corrections.length !== 1) liveError_('Unexpected existing attendance/state prevents initialization.');
    liveStoreProperty_('studentQrLiveEvent',event); readLiveContext_(binding,readLiveEvent_());
    return Object.assign({created:true,testMode:true},liveOwnerLinks_(event,binding,adminToken));
  });
}
function recoverHomecomingLiveAdminLink() {
  return liveOwnerLock_(function() {
    var binding = readLiveBinding_(), event = readLiveEvent_(); readLiveContext_(binding,event);
    var adminToken = liveOwnerToken_(); event.adminHash = hashLive_(adminToken); event.authRevision += 1;
    if (!Number.isSafeInteger(event.authRevision)) liveError_('Invalid owner auth revision.');
    liveStoreProperty_('studentQrLiveEvent',event); readLiveContext_(binding,readLiveEvent_());
    return liveOwnerLinks_(event,binding,adminToken);
  });
}
function prepareHomecomingLivePractice() {
  return liveOwnerLock_(function() {
    var properties = PropertiesService.getScriptProperties(), id = properties.getProperty('studentQrLivePracticeBook');
    var book;
    if (!id) {
      book = SpreadsheetApp.create('Homecoming 2026 - Live Protocol Practice - Fictional Only'); id = book.getId();
      properties.setProperty('studentQrLivePracticeBook',id);
    } else book = SpreadsheetApp.openById(id);
    var sheet = book.getSheetByName('Ticket Checklist') || book.insertSheet('Ticket Checklist');
    if (!sheet.getLastRow()) {
      var headers = ['Gateway student name','Student ID','Student ticket #','Grade','Bringing guest?','Guest name','Guest form submitted?','Guest ID uploaded?','School email received?','Guest ticket #'];
      var values = [[],[],[],[],headers,
        ['Practice Student 83','P-083','083','','No','','','','',''],
        ['Practice Student 85','P-085','085','','No','','','','',''],
        ['Practice Student 383','P-383','383','','Yes','Practice Guest 383','','','','383B'],
        ['Practice Conflict A','P-A','084','','No','','','','',''],
        ['Practice Conflict B','P-B','084','','No','','','','',''],
        ['','P-FIX','089','','No','','','','','']];
      values = values.map(function(r) { return Array.from({length:10},function(_,i) { return r[i] || ''; }); });
      sheet.getRange(1,1,values.length,10).setNumberFormat('@').setRichTextValues(values.map(function(r) { return r.map(function(v) { return SpreadsheetApp.newRichTextValue().setText(v).build(); }); })); SpreadsheetApp.flush();
      if (liveJson_(sheet.getDataRange().getValues()) !== liveJson_(values)) liveError_('Practice source readback failed.');
    }
    var deployment = Object.assign({},LIVE_DEPLOYMENT,{environment:'live-test',spreadsheetId:id});
    return {spreadsheetId:id,environment:'live-test',deploymentSource:'var LIVE_DEPLOYMENT = Object.freeze('+liveJson_(deployment)+');\n'};
  });
}
