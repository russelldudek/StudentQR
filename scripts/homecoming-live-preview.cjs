'use strict';
// Loopback-only integration fixture. No provider requests or real student data.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {liveFixture,headers,admin,helper}=require('../tests/helpers/homecoming-live-fixtures.cjs');
const rows=[...Array.from({length:4},()=>Array(10).fill('')),headers,
 ['Practice Student 83','P-083','083','','No','','','','',''],['Practice Student 85','P-085','085','','No','','','','',''],
 ['Practice Student 383','P-383','383','','Yes','Practice Guest 383','','','','383B'],
 ['Practice Conflict A','P-A','084','','No','','','','',''],['Practice Conflict B','P-B','084','','No','','','','',''],['','P-FIX','089','','No','','','','','']];
const f=liveFixture({source:rows});f.ready(false);
const endpoint='https://script.google.com/macros/s/FICTIONAL_LIVE/exec',root=path.resolve(__dirname,'..');
const assets=new Set(['assets/zxing-0.21.3.min.js','assets/homecoming-live.js','assets/ticket-decoder.js','assets/vendor/jsqr-1.4.0.js','assets/vendor/qrcodejs-1.0.0.js','assets/vendor/zxing-wasm-3.1.5/reader.js','assets/vendor/zxing-wasm-3.1.5/zxing_reader.wasm']);
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:3895');
 if(url.pathname==='/api'&&req.method==='POST'){let body='';req.on('data',c=>{body+=c;if(body.length>200000)req.destroy();});req.on('end',()=>{try{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(f.request(JSON.parse(body))));}catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));}});return;}
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 if(url.pathname==='/assets/trusted-backends.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({version:1,endpoints:[endpoint]}));return;}
 if(url.pathname==='/preview-harness.js'){res.setHeader('Content-Type','application/javascript');res.end(`const localFetch=window.fetch.bind(window);window.fetch=(url,init)=>{if(url===${JSON.stringify(endpoint)})return localFetch('/api',init);const target=new URL(url,location.href);if(target.origin!==location.origin)throw Error('EXTERNAL NETWORK REFUSED');return localFetch(url,init);};`);return;}
 const file=url.pathname==='/'?'index.html':assets.has(url.pathname.slice(1))?url.pathname.slice(1):null;
 if(!file){res.writeHead(404);res.end();return;}
 let data=fs.readFileSync(path.join(root,file));if(file==='index.html')data=data.toString().replace('<script>', '<script src="/preview-harness.js"></script><script>');
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.wasm')?'application/wasm':'application/javascript');res.end(data);
});
server.listen(3895,'127.0.0.1',()=>{const base='http://127.0.0.1:3895/?event=live-event&api='+encodeURIComponent(endpoint);console.log('FICTIONAL ONLY. Admin: '+base+'&tab=dashboard#key='+admin);console.log('Helper: '+base+'&tab=scanner#key='+helper);});
