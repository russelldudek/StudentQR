const fs=require('node:fs'),vm=require('node:vm');
const {liveFixture,helper,admin}=require('./homecoming-live-fixtures.cjs');
const endpoint='https://script.google.com/macros/s/FICTIONAL_LIVE/exec';
function liveUi(options={}){
  const backend=options.backend||liveFixture(options);if(!options.backend)backend.ready(options.testMode??false);
  const elements=new Map(),calls=[],storage=options.storage||new Map(),frames=[];
  const el=id=>{if(!elements.has(id)){const classes=new Set();elements.set(id,{type:id==='testMode'?'checkbox':'text',innerHTML:'',textContent:'',value:'',checked:false,hidden:false,disabled:false,style:{},dataset:{},
    classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v),toggle:(v,on)=>on?classes.add(v):classes.delete(v)},addEventListener(){},removeEventListener(){},remove(){},setAttribute(){},getTracks:()=>[],play:async()=>{},readyState:2,videoWidth:324,videoHeight:90});}return elements.get(id);};
  const pixels={width:324,height:90,data:new Uint8ClampedArray(324*90*4).fill(255)};
  const canvas={getContext:()=>({drawImage(){},getImageData:()=>pixels})};
  const listeners={};const key=options.role==='admin'?admin:helper;
  const ctx=vm.createContext({URL,URLSearchParams,console,Date,Set,Map,crypto:require('node:crypto').webcrypto,Uint8Array,Uint8ClampedArray,Blob,
    window:{location:{href:'https://fictional.invalid/?event=live-event&api='+encodeURIComponent(endpoint)+'#key='+key,protocol:'https:'},addEventListener:(n,fn)=>{listeners[n]=fn;},...options.window},
    document:{hidden:false,getElementById:el,querySelectorAll:()=>[],createElement:n=>n==='canvas'?canvas:el('toast'),body:{classList:el('body').classList,appendChild(){}},addEventListener:(n,fn)=>{listeners[n]=fn;}},
    navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}},
    localStorage:{getItem:k=>storage.get(k)||null,setItem(k,v){if(options.storageFail)throw Error('Storage unavailable');storage.set(k,v);},removeItem:k=>storage.delete(k)},
    setTimeout(){},clearTimeout(){},setInterval(fn){listeners.interval=fn;},clearInterval(){},requestAnimationFrame(fn){frames.push(fn);return frames.length;},cancelAnimationFrame(){},
    fetch:async(url,init={})=>{if(!init.body)return{ok:true,json:async()=>({version:1,endpoints:[endpoint]})};if(url!==endpoint)throw Error('REAL NETWORK REFUSED');const body=JSON.parse(init.body);calls.push(body);if(options.failResponse?.(body))throw Error('Lost response');return{ok:true,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify(backend.request(body))};}
  });
  for(const name of ['ticket-decoder','homecoming-live']){const p='assets/'+name+'.js';if(fs.existsSync(p))vm.runInContext(fs.readFileSync(p,'utf8'),ctx);}
  const html=fs.readFileSync('index.html','utf8'),inline=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('\n    loadSavedConfig();'));vm.runInContext(inline,ctx);
  return{backend,ctx,el,calls,storage,listeners,frames,run:code=>vm.runInContext(code,ctx)};
}
module.exports={liveUi,endpoint};
