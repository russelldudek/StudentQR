'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {headers, intake} = require('./homecoming-fixtures.cjs');
const admin = 'a'.repeat(64), helper = 'b'.repeat(64);
const actor = 'c'.repeat(64), undo = 'd'.repeat(64);
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const source = () => intake();
function liveFixture(options = {}) {
  const properties = new Map(), books = new Map(), trace = [];
  const fault = {onLock:null, at:'', hit:0, afterWrite:null};
  let locked = false;
  function check(at) { trace.push(['step',at]); if (fault.at === at && --fault.hit <= 0) throw Error('Injected '+at); }
  function book(id, rows = source()) {
    const sheets = new Map();
    function sheet(name, initial) {
      const values = initial.map(r=>r.slice()), formulas = [];
      function range(r,c,nr=1,nc=1) {
        const read = data => {check('read'); trace.push(['read',id,name]);return Array.from({length:nr},(_,a)=>Array.from({length:nc},(_,b)=>data[r+a-1]?.[c+b-1]??''));};
        const api = {getValues:()=>read(values),getFormulas:()=>read(formulas),setNumberFormat(){return api;},
          setValues(data){check('write'); if(!id.startsWith('practice-created-')&&(id!=='live-test'||name==='Ticket Checklist'))throw Error('REAL/SOURCE WRITE REFUSED');trace.push(['write',id,name,r,c,data]);data.forEach((row,a)=>row.forEach((v,b)=>{values[r+a-1]||=[];values[r+a-1][c+b-1]=v;}));fault.afterWrite?.(name,r,c);return api;},
          setValue(v){check('status');return api.setValues([[v]]);},
          setRichTextValues(data){return api.setValues(data.map(row=>row.map(v=>v.text)));}};
        return api;
      }
      const s={values,formulas,getName:()=>name,getLastRow:()=>values.length,getRange:range,getDataRange:()=>range(1,1,Math.max(1,values.length),Math.max(1,...values.map(r=>r.length)))};
      sheets.set(name,s);return s;
    }
    const b={getId:()=>id,sheets,getSheets:()=>[...sheets.values()],getSheetByName:n=>sheets.get(n)||null,insertSheet(n){check('insert');trace.push(['insert',id,n]);return sheet(n,[]);}};
    sheet('Ticket Checklist',rows);books.set(id,b);return b;
  }
  book('live-test',options.source||source());
  const ctx = vm.createContext({console,Date,JSON,Object,Array,String,Number,Map,Set,Error,Math,
    fetch(){throw Error('REAL NETWORK REFUSED');},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k)??null,getProperties:()=>Object.fromEntries(properties),deleteProperty:k=>properties.delete(k),setProperty(k,v){check('property');if(options.maxPropertyBytes&&Buffer.byteLength(v)>options.maxPropertyBytes)throw Error('Property value quota');properties.set(k,v);}})},
    LockService:{getScriptLock:()=>({tryLock(){fault.onLock?.();if(locked)return false;locked=true;return true;},releaseLock(){locked=false;}})},
    Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()]},
    Session:{getScriptTimeZone:()=> 'America/New_York'},
    ScriptApp:{getService:()=>({getUrl:()=> 'https://script.google.com/macros/s/FICTIONAL_LIVE/exec'})},
    SpreadsheetApp:{openById(id){trace.push(['open',id]);if(!books.has(id))throw Error('Unknown target');return books.get(id);},create(){check('create');return book('practice-created-'+books.size,[]);},flush(){check('flush');},newRichTextValue:()=>({setText(text){this.text=text;return this;},build(){return{text:this.text};}})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:value=>({value,setMimeType(){return this;}})}
  });
  const dir=path.join(__dirname,'../../apps-script/live');
  for(const name of ['Deployment','Intake','Auth','State','Roster','Actions','Api','Provision']){
    const p=path.join(dir,name+'.gs');if(!fs.existsSync(p))continue;
    let code=fs.readFileSync(p,'utf8');
    if(name==='Deployment')code=code.replace('1hlWdxxzlP2Zbl9m4_MN49XBgBrL7YiG67ur2p2tEueU','live-test').replace("environment: 'production'","environment: 'live-test'");
    vm.runInContext(code,ctx,{filename:name+'.gs'});
  }
  const run = code=>vm.runInContext(code,ctx);
  function ready(testMode=false){
    if(typeof ctx.prepareHomecomingLive==='function'){
      properties.set('studentQrLiveDeploymentUrl','https://script.google.com/macros/s/FICTIONAL_LIVE/exec');run('prepareHomecomingLive()');
    }else{
      const b=books.get('live-test');
      for(const [name,h] of [['Homecoming Check-ins',['Admission ID','Operation ID','Event ID','Person Type','Ticket ID (JSON)','Source Student ID (JSON)','Assignment SHA256','Actor Hash','Undo SHA256','Admitted At']],['Homecoming Audit',['Operation ID','Kind','Actor Hash','Intent JSON','Intent SHA256','Created At','State']],['Homecoming Corrections',['Correction ID','Operation ID','Source Row','Base SHA256','Previous Correction ID','Fields JSON']]]) b.insertSheet(name).values.push(h);
    }
    const binding={version:2,stage:'ready',environment:'live-test',spreadsheetId:'live-test',sourceSheetName:'Ticket Checklist',sourceHeaderRow:5,attendanceSheetName:'Homecoming Check-ins',auditSheetName:'Homecoming Audit',correctionsSheetName:'Homecoming Corrections',apiUrl:'https://script.google.com/macros/s/FICTIONAL_LIVE/exec'};
    const config={apiVersion:2,rosterMode:'homecoming-2026',environment:'live-test',sheetUrl:'https://docs.google.com/spreadsheets/d/live-test/edit',apiUrl:binding.apiUrl,sheetName:'Ticket Checklist',firstNameCol:'First Name',lastNameCol:'Last Name',qrCol:'QR_ID',statusCol:'Status',admittedAtCol:'Admitted At',guestCol:'Bringing Guest',eventName:'Practice - Not Real Attendance',admittedValue:'Admitted',timeZone:'America/New_York',testMode};
    properties.set('studentQrLiveDeploymentUrl',binding.apiUrl);properties.set('studentQrLiveBinding',JSON.stringify(binding));properties.set('studentQrLiveEvent',JSON.stringify({version:2,eventId:'live-event',authRevision:1,adminHash:sha(admin),helperHash:sha(helper),helperToken:helper,config}));trace.length=0;
  }
  function rawRequest(body){ctx.req={postData:{contents:JSON.stringify(body)}};return typeof ctx.doPost==='function'?JSON.parse(run('doPost(req).value')):{error:'Live routes unavailable'};}
  function request(body={}){return rawRequest({eventId:'live-event',token:helper,revision:1,...body});}
  function list(){return request({action:'list'});}
  function admit(ticket,extra={}){const l=list(),row=l.rows?.find(r=>r.QR_ID===ticket);return request({action:'admit',qrValue:ticket,expectedAssignmentHash:row?.assignmentHash,expectedRosterRevision:l.rosterRevision,operationId:crypto.randomUUID(),actorSecret:actor,undoSecret:undo,...extra});}
  return {ctx,run,book,books,properties,trace,fault,ready,request,rawRequest,list,admit,writes:()=>trace.filter(t=>t[0]==='write')};
}
module.exports={liveFixture,admin,helper,actor,undo,sha,source,headers};
