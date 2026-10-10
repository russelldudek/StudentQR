function doGet(e) { return handleLiveRequest_(e, 'GET'); }
function doPost(e) { return handleLiveRequest_(e, 'POST'); }
function handleLiveRequest_(e, method) {
  var result;
  try {
    var request = parseLiveRequest_(e,method), binding = readLiveBinding_(), event = readLiveEvent_();
    assertLiveBinding_(binding,event); var role = authorizeLive_(event,request);
    function dispatch(b, ev, currentRole) {
      if (request.action === 'getEvent' && typeof readLiveContext_ !== 'function') {
        var response = {eventId:ev.eventId,role:currentRole,revision:ev.authRevision,config:ev.config};
        if (currentRole === 'admin') response.helperToken = ev.helperToken; return response;
      }
      if (typeof dispatchLiveAction_ !== 'function') liveError_('Live handler unavailable; no operation performed.');
      return dispatchLiveAction_(b,ev,currentRole,request);
    }
    result = LIVE_MUTATIONS.indexOf(request.action) >= 0 ? withLiveLock_(request,request.action,dispatch) : dispatch(binding,event,role);
  } catch (err) { result = {error: String(err && err.message || 'Live request refused.')}; }
  return ContentService.createTextOutput(liveJson_(result)).setMimeType(ContentService.MimeType.JSON);
}
