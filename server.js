const express=require('express');
const fs=require('fs');
const path=require('path');
const os=require('os');
const {execFile,spawn}=require('child_process');
const http=require('http');

const APP_ROOT=__dirname;
const RESOURCE_ROOT=process.env.WP_LAB_RESOURCE_ROOT || APP_ROOT;
const DATA_ROOT=process.env.WP_LAB_DATA_ROOT || path.join(os.homedir(),'.local','share','wp-lab');
const DATA_DIR=path.join(DATA_ROOT,'data');
const INSTANCES_DIR=path.join(DATA_DIR,'instances');
const LEGACY_PROJECT=path.join(DATA_DIR,'projects','sandbox');
const INSTANCES_FILE=path.join(DATA_ROOT,'instances.json');
const THUMB_DIR=path.join(DATA_DIR,'thumbnails');

for(const d of [DATA_ROOT,DATA_DIR,INSTANCES_DIR,THUMB_DIR]) fs.mkdirSync(d,{recursive:true});

const app=express();
app.use(express.json());
app.use(express.static(path.join(APP_ROOT,'public')));

const shares=new Map();

function resource(rel){return path.join(RESOURCE_ROOT,rel)}
function run(cmd,args=[],cwd=DATA_ROOT,env={}){
  if(!cwd || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) cwd=DATA_ROOT;
  return new Promise((res,rej)=>execFile(cmd,args,{cwd,env:{...process.env,...env},maxBuffer:20e6},(e,stdout,stderr)=>e?rej(new Error(stderr||e.message)):res(stdout.trim())));
}
function copyFileSafe(src,dst,mode=0o644){
  fs.mkdirSync(path.dirname(dst),{recursive:true});
  fs.copyFileSync(src,dst);
  try{fs.chmodSync(dst,mode)}catch{}
}
function slugify(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,36)||'instance'}
function normalizePhp(v){return ['8.2','8.3','8.4'].includes(String(v))?String(v):'8.3'}
function mailPort(inst){return 9085 + Math.max(0, Number(inst.port)-8085)}

function defaultRegistry(){
  return [{id:'default',name:'Instance 1',port:8085,projectName:'wp-lab',dir:LEGACY_PROJECT,phpVersion:'8.3'}];
}
function loadRegistry(){
  try{
    const arr=JSON.parse(fs.readFileSync(INSTANCES_FILE,'utf8'));
    if(Array.isArray(arr)&&arr.length) return arr.map(x=>({...x,phpVersion:normalizePhp(x.phpVersion)}));
  }catch{}
  const arr=defaultRegistry(); saveRegistry(arr); return arr;
}
function saveRegistry(arr){fs.writeFileSync(INSTANCES_FILE,JSON.stringify(arr,null,2))}
function instances(){return loadRegistry()}
function getInstance(id){
  const inst=instances().find(x=>x.id===id);
  if(!inst) throw new Error('Instance not found.');
  return inst;
}
function nextPort(arr){
  const used=new Set(arr.map(x=>Number(x.port)));
  for(let p=8085;p<8185;p++) if(!used.has(p)) return p;
  throw new Error('No free WP Lab port available.');
}
function instanceDir(inst){return inst.dir || path.join(INSTANCES_DIR,inst.id)}
function composeArgs(inst,args=[]){return ['compose','-p',inst.projectName,...args]}
function composeEnv(inst){return {WP_LAB_HTTP_PORT:String(inst.port),WP_LAB_MAIL_PORT:String(mailPort(inst)),WP_LAB_PHP_VERSION:normalizePhp(inst.phpVersion)}}

function syncHelper(inst){
  const dir=instanceDir(inst);
  const dest=path.join(dir,'wp-lab-helper');
  fs.mkdirSync(dest,{recursive:true});
  for(const ent of fs.readdirSync(resource('wp-lab-helper'),{withFileTypes:true})){
    if(ent.isFile()) copyFileSafe(path.join(resource('wp-lab-helper'),ent.name),path.join(dest,ent.name),0o644);
  }
  try{fs.chmodSync(dest,0o755)}catch{}
}
function syncInstanceFiles(inst){
  const dir=instanceDir(inst);
  fs.mkdirSync(dir,{recursive:true});
  fs.mkdirSync(path.join(dir,'wp-content'),{recursive:true});
  copyFileSafe(resource('templates/docker-compose.yml'),path.join(dir,'docker-compose.yml'),0o644);
  copyFileSafe(resource('templates/php/wp-lab.ini'),path.join(dir,'php','wp-lab.ini'),0o644);
  syncHelper(inst);
}
async function migrateLegacyWpContent(){
  const inst=getInstance('default');
  const dir=instanceDir(inst);
  const dest=path.join(dir,'wp-content');
  if(fs.existsSync(dest) && fs.readdirSync(dest).length) return;
  fs.mkdirSync(dest,{recursive:true});
  try{
    await run('docker',composeArgs(inst,['cp','wordpress:/var/www/html/wp-content/.',dest]),dir,composeEnv(inst));
  }catch{}
}
async function dockerAvailable(){
  try{await run('docker',['info']);await run('docker',['compose','version']);return true}catch{return false}
}
async function isRunning(inst){
  try{
    syncInstanceFiles(inst);
    const out=await run('docker',composeArgs(inst,['ps','--status','running','--services']),instanceDir(inst),composeEnv(inst));
    return out.includes('wordpress')&&out.includes('db');
  }catch{return false}
}
async function ensureHelper(inst){
  syncInstanceFiles(inst);
  if(!(await isRunning(inst))){
    await startInstance(inst);
    return;
  }
  try{await run('docker',composeArgs(inst,['exec','-T','wpcli','wp','plugin','activate','wp-lab-helper']),instanceDir(inst),composeEnv(inst))}catch{}
}
async function bootstrap(inst){
  await run('/usr/bin/bash',[resource('scripts/bootstrap.sh'),instanceDir(inst),String(inst.port),inst.projectName],instanceDir(inst),composeEnv(inst));
}
async function startInstance(inst){
  syncInstanceFiles(inst);
  await run('docker',composeArgs(inst,['up','-d']),instanceDir(inst),composeEnv(inst));
  await bootstrap(inst);
}
async function stopInstance(inst){
  stopShare(inst.id);
  try{await run('docker',composeArgs(inst,['stop']),instanceDir(inst),composeEnv(inst))}catch{}
}
async function restartInstance(inst){
  const restoreShare=!!shares.get(inst.id)?.url;
  stopShare(inst.id);
  syncInstanceFiles(inst);
  await run('docker',composeArgs(inst,['restart']),instanceDir(inst),composeEnv(inst));
  for(let i=0;i<40;i++){
    try{
      await run('docker',composeArgs(inst,['exec','-T','wpcli','wp','core','is-installed']),instanceDir(inst),composeEnv(inst));
      break;
    }catch{await new Promise(r=>setTimeout(r,500))}
  }
  let shareUrl=null;
  if(restoreShare) shareUrl=await startShare(inst);
  return shareUrl;
}
async function removeInstanceDocker(inst){
  stopShare(inst.id);
  try{await run('docker',composeArgs(inst,['down','-v','--remove-orphans']),instanceDir(inst),composeEnv(inst))}catch{}
}
async function resetThemePlugins(inst){
  await startInstance(inst);
  await ensureHelper(inst);
  const dir=instanceDir(inst);
  const pluginList=await run('docker',composeArgs(inst,['exec','-T','wpcli','wp','plugin','list','--field=name']),dir,composeEnv(inst));
  const keep=new Set(['woocommerce','wp-lab-helper']);
  for(const slug of pluginList.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)){
    if(keep.has(slug)) continue;
    try{await run('docker',composeArgs(inst,['exec','-T','wpcli','wp','plugin','deactivate',slug]),dir,composeEnv(inst))}catch{}
    try{await run('docker',composeArgs(inst,['exec','-T','wpcli','wp','plugin','delete',slug]),dir,composeEnv(inst))}catch{}
  }
  const themeList=await run('docker',composeArgs(inst,['exec','-T','wpcli','wp','theme','list','--field=name']),dir,composeEnv(inst));
  const themes=themeList.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const defaults=themes.filter(s=>/^twentytwenty/.test(s));
  const fallback=defaults.includes('twentytwentyfive')?'twentytwentyfive':defaults[0];
  if(fallback) try{await run('docker',composeArgs(inst,['exec','-T','wpcli','wp','theme','activate',fallback]),dir,composeEnv(inst))}catch{}
  for(const slug of themes){
    if(/^twentytwenty/.test(slug)) continue;
    try{await run('docker',composeArgs(inst,['exec','-T','wpcli','wp','theme','delete',slug]),dir,composeEnv(inst))}catch{}
  }
  return 'Test theme and plugins removed. WooCommerce, payments, shipping and content were preserved.';
}



function findBrowser(){
  const candidates=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'];
  return candidates.find(p=>fs.existsSync(p))||null;
}
function thumbPath(inst){return path.join(THUMB_DIR,inst.id+'.png')}
async function captureThumbnail(inst,force=false){
  if(!(await isRunning(inst))) return null;
  const file=thumbPath(inst);
  if(!force && fs.existsSync(file)){
    try{if(Date.now()-fs.statSync(file).mtimeMs < 60000) return file}catch{}
  }
  const browser=findBrowser();
  if(!browser) throw new Error('Google Chrome or Chromium is required for preview snapshots.');
  const tmp=file+'.tmp.png';
  try{fs.rmSync(tmp,{force:true})}catch{}
  await run(browser,['--headless=new','--disable-gpu','--hide-scrollbars','--window-size=1440,1000','--virtual-time-budget=2500',`--screenshot=${tmp}`,`http://127.0.0.1:${inst.port}/`],DATA_ROOT);
  if(!fs.existsSync(tmp)) throw new Error('Preview screenshot was not created.');
  fs.renameSync(tmp,file);
  return file;
}
async function ensureMailpit(inst){
  syncInstanceFiles(inst);
  await run('docker',composeArgs(inst,['up','-d','mailpit']),instanceDir(inst),composeEnv(inst));
}
async function mailpitFetch(inst,apiPath,opts={}){
  await ensureMailpit(inst);
  const r=await fetch(`http://127.0.0.1:${mailPort(inst)}${apiPath}`,opts);
  const text=await r.text();
  if(!r.ok) throw new Error(`Email catcher request failed (${r.status}). ${text}`);
  const ct=r.headers.get('content-type')||'';
  return ct.includes('json') ? JSON.parse(text) : text;
}

async function clearInstanceCache(inst){
  await startInstance(inst);
  const dir=instanceDir(inst);
  try{await run('docker',composeArgs(inst,['exec','-T','wpcli','wp','cache','flush']),dir,composeEnv(inst))}catch{}
  try{await run('docker',composeArgs(inst,['exec','-T','wpcli','wp','transient','delete','--all']),dir,composeEnv(inst))}catch{}
  try{await run('docker',composeArgs(inst,['exec','-T','wpcli','wp','eval','if(class_exists("WC_Cache_Helper")){WC_Cache_Helper::get_transient_version("product",true);} if(function_exists("wc_delete_shop_order_transients")){wc_delete_shop_order_transients();}']),dir,composeEnv(inst))}catch{}
  const cacheDir=path.join(dir,'wp-content','cache');
  try{fs.rmSync(cacheDir,{recursive:true,force:true})}catch{}
  fs.mkdirSync(cacheDir,{recursive:true});
  return 'WordPress, WooCommerce and filesystem caches cleared.';
}

async function instanceLogs(inst,type='wordpress'){
  const dir=instanceDir(inst);
  const env=composeEnv(inst);
  if(type==='debug'){
    const debug=path.join(dir,'wp-content','debug.log');
    if(!fs.existsSync(debug)) return 'No WordPress debug.log exists yet.';
    const txt=fs.readFileSync(debug,'utf8');
    return txt.slice(-120000);
  }
  const service=type==='database'?'db':type==='email'?'mailpit':'wordpress';
  try{return await run('docker',composeArgs(inst,['logs','--tail','300',service]),dir,env)}
  catch(e){return e.message||'No logs available.'}
}

function findCloudflared(){
  const c=[resource('vendor/cloudflared'),path.join(APP_ROOT,'vendor/cloudflared'),'/usr/local/bin/cloudflared','/usr/bin/cloudflared'];
  return c.find(p=>fs.existsSync(p))||'cloudflared';
}
function shareProxyPort(inst){
  return 4188 + Math.max(0, Number(inst.port)-8085);
}
function stopShare(id){
  const s=shares.get(id); if(!s) return;
  if(s.proc) try{s.proc.kill('SIGTERM')}catch{}
  if(s.proxy) try{s.proxy.close()}catch{}
  shares.delete(id);
}
async function startShare(inst){
  if(shares.get(inst.id)?.url) return shares.get(inst.id).url;
  await startInstance(inst);
  const state={proc:null,proxy:null,url:null,log:'',starting:true};
  shares.set(inst.id,state);
  const proxyPort=shareProxyPort(inst);
  state.proxy=http.createServer((req,res)=>{
    const publicHost=state.url ? new URL(state.url).host : (req.headers.host||'');
    const headers={...req.headers,host:publicHost||('localhost:'+inst.port),'x-forwarded-host':publicHost||'','x-forwarded-proto':'https','accept-encoding':'identity'};
    delete headers['content-length'];
    const pr=http.request({hostname:'127.0.0.1',port:inst.port,path:req.url,method:req.method,headers},pres=>{
      const outHeaders={...pres.headers};
      if(outHeaders.location && state.url) outHeaders.location=outHeaders.location.replace(new RegExp('^https?://(localhost|127\\.0\\.0\\.1):'+inst.port,'i'),state.url);
      const ct=String(outHeaders['content-type']||'');
      const textual=/text\/html|text\/css|javascript|json|xml/i.test(ct);
      if(!textual){res.writeHead(pres.statusCode||200,outHeaders);pres.pipe(res);return}
      const chunks=[]; pres.on('data',c=>chunks.push(c)); pres.on('end',()=>{
        let body=Buffer.concat(chunks).toString('utf8');
        if(state.url){
          const normal=new RegExp('https?://(?:localhost|127\\.0\\.0\\.1):'+inst.port,'g');
          body=body.replace(normal,state.url);
          delete outHeaders['content-length']; delete outHeaders['content-encoding'];
          outHeaders['content-length']=Buffer.byteLength(body);
        }
        res.writeHead(pres.statusCode||200,outHeaders);res.end(body);
      });
    });
    pr.on('error',e=>{if(!res.headersSent)res.writeHead(502,{'content-type':'text/plain'});res.end('WP Lab preview proxy error: '+e.message)});
    req.pipe(pr);
  });
  await new Promise((resolve,reject)=>{state.proxy.once('error',reject);state.proxy.listen(proxyPort,'127.0.0.1',resolve)});
  const bin=findCloudflared(); try{fs.chmodSync(bin,0o755)}catch{}
  state.proc=spawn(bin,['tunnel','--url',`http://127.0.0.1:${proxyPort}`,'--no-autoupdate'],{stdio:['ignore','pipe','pipe']});
  const consume=d=>{const s=d.toString();state.log+=s;const m=s.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);if(m){state.url=m[0];state.starting=false}};
  state.proc.stdout.on('data',consume); state.proc.stderr.on('data',consume);
  state.proc.on('exit',()=>{if(shares.get(inst.id)===state){state.proc=null;state.starting=false}});
  const started=Date.now();
  while(!state.url && state.proc && Date.now()-started<15000) await new Promise(r=>setTimeout(r,300));
  if(!state.url){stopShare(inst.id);throw new Error('Cloudflare Tunnel started but no public URL was returned.')}
  return state.url;
}

app.get('/api/status',async(_req,res)=>{
  let docker=false,compose=false,daemon=false;
  try{await run('docker',['--version']);docker=true;await run('docker',['compose','version']);compose=true;daemon=await dockerAvailable()}catch{}
  res.json({docker,compose,daemon,node:process.version});
});

app.get('/api/instances',async(_req,res)=>{
  const arr=instances();
  const out=[];
  for(const inst of arr){
    const running=await isRunning(inst);
    const sh=shares.get(inst.id);
    out.push({...inst,phpVersion:normalizePhp(inst.phpVersion),mailPort:mailPort(inst),mailUrl:`http://localhost:${mailPort(inst)}`,dir:instanceDir(inst),running,frontend:`http://localhost:${inst.port}`,admin:`http://localhost:${inst.port}/wp-admin/`,share:{active:!!sh?.url,url:sh?.url||null,starting:!!sh?.starting}});
  }
  res.json({ok:true,instances:out});
});

app.post('/api/instances',async(req,res)=>{
  try{
    const arr=instances();
    if(arr.length>=8) throw new Error('WP Lab currently supports up to 8 instances.');
    const n=arr.length+1;
    let id=slugify(req.body?.name||('instance-'+n));
    if(arr.some(x=>x.id===id)) id=id+'-'+Date.now().toString().slice(-4);
    const inst={id,name:String(req.body?.name||('Instance '+n)).slice(0,60),port:nextPort(arr),projectName:'wp-lab-'+id,dir:path.join(INSTANCES_DIR,id),phpVersion:'8.3'};
    arr.push(inst); saveRegistry(arr); syncInstanceFiles(inst);
    res.json({ok:true,instance:inst});
  }catch(e){res.status(500).json({ok:false,error:e.message})}
});

app.patch('/api/instances/:id',async(req,res)=>{
  try{
    const arr=instances();
    const idx=arr.findIndex(x=>x.id===req.params.id);
    if(idx<0) throw new Error('Instance not found.');
    const inst=arr[idx];
    const previous={...inst};
    let phpChanged=false;
    if(typeof req.body?.name==='string' && req.body.name.trim()) inst.name=req.body.name.trim().slice(0,60);
    if(req.body?.phpVersion!==undefined){
      const next=normalizePhp(req.body.phpVersion);
      if(next!==normalizePhp(inst.phpVersion)){inst.phpVersion=next;phpChanged=true;}
    }
    arr[idx]=inst; saveRegistry(arr);
    try{
      if(phpChanged && await isRunning(inst)){
        syncInstanceFiles(inst);
        await run('docker',composeArgs(inst,['up','-d','--force-recreate','wordpress']),instanceDir(inst),composeEnv(inst));
        await bootstrap(inst);
      }
    }catch(e){
      arr[idx]=previous; saveRegistry(arr);
      throw new Error('PHP switch failed; the previous PHP version was kept. '+e.message);
    }
    res.json({ok:true,instance:{...inst,phpVersion:normalizePhp(inst.phpVersion),mailPort:mailPort(inst),mailUrl:`http://localhost:${mailPort(inst)}`},phpChanged});
  }catch(e){res.status(500).json({ok:false,error:e.message})}
});

app.delete('/api/instances/:id',async(req,res)=>{
  try{
    const arr=instances(); const inst=arr.find(x=>x.id===req.params.id);
    if(!inst) throw new Error('Instance not found.');
    if(inst.id==='default') throw new Error('Instance 1 can be reset or stopped, but not deleted.');
    await removeInstanceDocker(inst);
    try{fs.rmSync(instanceDir(inst),{recursive:true,force:true})}catch{}
    saveRegistry(arr.filter(x=>x.id!==inst.id));
    res.json({ok:true});
  }catch(e){res.status(500).json({ok:false,error:e.message})}
});
app.post('/api/instances/:id/start',async(req,res)=>{
  try{const inst=getInstance(req.params.id);await startInstance(inst);res.json({ok:true,url:`http://localhost:${inst.port}`,admin:`http://localhost:${inst.port}/wp-admin/`})}
  catch(e){res.status(500).json({ok:false,error:e.message})}
});
app.post('/api/instances/:id/stop',async(req,res)=>{
  try{const inst=getInstance(req.params.id);await stopInstance(inst);res.json({ok:true})}
  catch(e){res.status(500).json({ok:false,error:e.message})}
});
app.post('/api/instances/:id/restart',async(req,res)=>{
  try{
    const inst=getInstance(req.params.id);
    const url=await restartInstance(inst);
    res.json({ok:true,message:url?'Instance restarted. Client preview was recreated with a new link.':'Instance restarted. No WordPress data was changed.',url});
  }catch(e){res.status(500).json({ok:false,error:e.message})}
});
app.post('/api/instances/:id/reset',async(req,res)=>{
  try{const inst=getInstance(req.params.id);const message=await resetThemePlugins(inst);res.json({ok:true,message})}
  catch(e){res.status(500).json({ok:false,error:e.message})}
});
app.post('/api/instances/:id/demo',async(req,res)=>{
  try{
    const inst=getInstance(req.params.id); await ensureHelper(inst);
    const b=String(Math.max(0,Math.min(100,Number(req.body?.blogs??10)||10)));
    const p=String(Math.max(0,Math.min(100,Number(req.body?.products??18)||18)));
    const o=String(Math.max(0,Math.min(100,Number(req.body?.orders??8)||8)));
    const out=await run('docker',composeArgs(inst,['exec','-T','wpcli','wp','wp-lab','demo',`--blogs=${b}`,`--products=${p}`,`--orders=${o}`]),instanceDir(inst),composeEnv(inst));
    res.json({ok:true,message:out});
  }catch(e){res.status(500).json({ok:false,error:e.message})}
});
app.post('/api/instances/:id/configure-wc',async(req,res)=>{
  try{const inst=getInstance(req.params.id);await ensureHelper(inst);const out=await run('docker',composeArgs(inst,['exec','-T','wpcli','wp','wp-lab','configure-woocommerce']),instanceDir(inst),composeEnv(inst));res.json({ok:true,message:out})}
  catch(e){res.status(500).json({ok:false,error:e.message})}
});



app.get('/api/instances/:id/thumbnail',async(req,res)=>{
  try{
    const inst=getInstance(req.params.id);
    const file=await captureThumbnail(inst,req.query.refresh==='1');
    if(!file) return res.status(404).end();
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','image/png');
    fs.createReadStream(file).pipe(res);
  }catch(e){res.status(500).json({ok:false,error:e.message})}
});
app.post('/api/instances/:id/thumbnail/refresh',async(req,res)=>{
  try{const inst=getInstance(req.params.id);const file=await captureThumbnail(inst,true);res.json({ok:true,available:!!file})}
  catch(e){res.status(500).json({ok:false,error:e.message})}
});
app.get('/api/instances/:id/mail/messages',async(req,res)=>{
  try{const inst=getInstance(req.params.id);const data=await mailpitFetch(inst,'/api/v1/messages');res.json({ok:true,...data})}
  catch(e){res.status(500).json({ok:false,error:e.message})}
});
app.get('/api/instances/:id/mail/message/:messageId',async(req,res)=>{
  try{const inst=getInstance(req.params.id);const data=await mailpitFetch(inst,'/api/v1/message/'+encodeURIComponent(req.params.messageId));res.json({ok:true,message:data})}
  catch(e){res.status(500).json({ok:false,error:e.message})}
});
app.delete('/api/instances/:id/mail/messages',async(req,res)=>{
  try{const inst=getInstance(req.params.id);await mailpitFetch(inst,'/api/v1/messages',{method:'DELETE'});res.json({ok:true})}
  catch(e){res.status(500).json({ok:false,error:e.message})}
});

app.post('/api/instances/:id/mail/start',async(req,res)=>{
  try{
    const inst=getInstance(req.params.id); syncInstanceFiles(inst);
    await run('docker',composeArgs(inst,['up','-d','mailpit']),instanceDir(inst),composeEnv(inst));
    res.json({ok:true,url:`http://localhost:${mailPort(inst)}`});
  }catch(e){res.status(500).json({ok:false,error:e.message})}
});

app.post('/api/instances/:id/clear-cache',async(req,res)=>{
  try{const inst=getInstance(req.params.id);res.json({ok:true,message:await clearInstanceCache(inst)})}
  catch(e){res.status(500).json({ok:false,error:e.message})}
});
app.get('/api/instances/:id/logs',async(req,res)=>{
  try{const inst=getInstance(req.params.id);const type=String(req.query.type||'wordpress');res.json({ok:true,type,logs:await instanceLogs(inst,type)})}
  catch(e){res.status(500).json({ok:false,error:e.message})}
});

app.post('/api/instances/:id/open-files',async(req,res)=>{
  try{
    const inst=getInstance(req.params.id); const target=path.join(instanceDir(inst),'wp-content'); fs.mkdirSync(target,{recursive:true});
    const opener=process.platform==='linux'?'/usr/bin/xdg-open':'xdg-open';
    spawn(opener,[target],{detached:true,stdio:'ignore'}).unref();
    res.json({ok:true,path:target});
  }catch(e){res.status(500).json({ok:false,error:e.message})}
});
app.post('/api/instances/:id/share/start',async(req,res)=>{
  try{const inst=getInstance(req.params.id);const url=await startShare(inst);res.json({ok:true,url})}
  catch(e){res.status(500).json({ok:false,error:e.message})}
});
app.post('/api/instances/:id/share/stop',async(req,res)=>{stopShare(req.params.id);res.json({ok:true})});

// Compatibility aliases for Instance 1.
app.post('/api/create',async(req,res)=>{try{const i=getInstance('default');await startInstance(i);res.json({ok:true,url:`http://localhost:${i.port}`,admin:`http://localhost:${i.port}/wp-admin/`})}catch(e){res.status(500).json({ok:false,error:e.message})}});
app.post('/api/reset',async(req,res)=>{try{res.json({ok:true,message:await resetThemePlugins(getInstance('default'))})}catch(e){res.status(500).json({ok:false,error:e.message})}});

async function init(){
  try{await migrateLegacyWpContent()}catch{}
  for(const inst of instances()) syncInstanceFiles(inst);
}
init();

function startServer(port=4173){return app.listen(port,'127.0.0.1',()=>console.log('WP Lab: http://127.0.0.1:'+port))}
if(require.main===module) startServer(Number(process.env.WP_LAB_PORT||4173));
module.exports={app,startServer};
