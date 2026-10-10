var LIVE_ACTION_FIELDS = Object.freeze({
  getEvent: [], list: [], getAttention: [],
  admit: ['qrValue','expectedAssignmentHash','expectedRosterRevision','operationId','actorSecret','undoSecret'],
  publishCorrections: ['edits','operationId','expectedRosterRevision'],
  getOperation: ['operationId','actorSecret','undoSecret'],
  undoLatest: ['receipt','actorSecret','undoSecret','operationId'],
  previewReset: ['scope','ticketId','reviewedAssignmentHash'],
  resetTicket: ['scope','ticketId','confirmationToken','expectedAttendanceRevision','operationId','reviewedAssignmentHash'],
  resetAll: ['scope','confirmationToken','expectedAttendanceRevision','operationId'],
  reviewOperation: ['operationId','decision','intentHash','confirmationToken'],
  setTestMode: ['testMode','operationId'], saveEvent: ['eventName','operationId']
});
var LIVE_ADMIN_ACTIONS = ['getAttention','publishCorrections','previewReset','resetTicket','resetAll','reviewOperation','setTestMode','saveEvent'];
var LIVE_MUTATIONS = ['admit','publishCorrections','undoLatest','resetTicket','resetAll','reviewOperation','setTestMode','saveEvent'];
function liveError_(message) { throw new Error(message); }
function liveJson_(value) { return JSON.stringify(value); }
function hashLive_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text)
    .map(function(n) { return ('0' + ((n + 256) % 256).toString(16)).slice(-2); }).join('');
}
function liveHex_(v) { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }
function liveId_(v) { return typeof v === 'string' && /^[A-Za-z0-9_-]{3,100}$/.test(v); }
function liveExactKeys_(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(function(k) { return keys.indexOf(k) < 0; })) liveError_('Invalid request fields.');
}
function liveProperty_(key) {
  try { var value = JSON.parse(PropertiesService.getScriptProperties().getProperty(key));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value;
  } catch (e) { liveError_('Live binding/event is not configured or is corrupt.'); }
}
function readLiveBinding_() { return liveProperty_('studentQrLiveBinding'); }
function readLiveEvent_() { return liveProperty_('studentQrLiveEvent'); }
function assertLiveBinding_(binding, event) {
  var keys = Object.keys(LIVE_DEPLOYMENT);
  if (binding.stage !== 'ready' || keys.some(function(k) { return binding[k] !== LIVE_DEPLOYMENT[k]; }) ||
      binding.spreadsheetId === '1830rSf7hcYX2NUUMG5GByGqTT2626PS4gnJuYf9TjdI' ||
      !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(binding.apiUrl || '') ||
      binding.apiUrl !== PropertiesService.getScriptProperties().getProperty('studentQrLiveDeploymentUrl')) {
    liveError_('Live deployment binding/target mismatch.');
  }
  if (event.version !== 2 || !liveId_(event.eventId) || !Number.isSafeInteger(event.authRevision) || event.authRevision < 1 ||
      !liveHex_(event.adminHash) || !liveHex_(event.helperHash) || event.adminHash === event.helperHash ||
      !liveHex_(event.helperToken) || hashLive_(event.helperToken) !== event.helperHash || !event.config ||
      event.config.apiVersion !== 2 || event.config.rosterMode !== 'homecoming-2026' ||
      event.config.environment !== binding.environment || event.config.apiUrl !== binding.apiUrl ||
      event.config.sheetUrl !== 'https://docs.google.com/spreadsheets/d/' + binding.spreadsheetId + '/edit' ||
      event.config.sheetName !== binding.sourceSheetName || typeof event.config.testMode !== 'boolean') {
    liveError_('Live event binding is corrupt.');
  }
  return binding;
}
function authorizeLive_(event, request) {
  if (request.eventId !== event.eventId || !liveHex_(request.token)) liveError_('Private dance link not found.');
  var hash = hashLive_(request.token), role = hash === event.adminHash ? 'admin' : hash === event.helperHash ? 'helper' : '';
  if (!role) liveError_('Private dance link not found.');
  if (LIVE_ADMIN_ACTIONS.indexOf(request.action) >= 0 && role !== 'admin') liveError_('Admin access required.');
  return role;
}
function parseLiveRequest_(e, method) {
  if (method !== 'POST' || !e || !e.postData || typeof e.postData.contents !== 'string' || e.postData.contents.length > 200000) liveError_('Private POST required.');
  var r; try { r = JSON.parse(e.postData.contents); } catch (err) { liveError_('Invalid JSON request.'); }
  if (!r || !Object.prototype.hasOwnProperty.call(LIVE_ACTION_FIELDS, r.action)) liveError_('Unsupported live action.');
  liveExactKeys_(r, ['action','eventId','token','revision'].concat(LIVE_ACTION_FIELDS[r.action]));
  if (!Number.isSafeInteger(r.revision) || r.revision < 1) liveError_('Invalid revision.');
  return r;
}
function withLiveLock_(request, actionName, callback) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) liveError_('Busy; no operation was dispatched.');
  try {
    var binding = readLiveBinding_(), event = readLiveEvent_(); assertLiveBinding_(binding,event);
    var role = authorizeLive_(event,request);
    return callback(binding,event,role);
  } finally { lock.releaseLock(); }
}
