const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const html=fs.readFileSync('static/index.html','utf8');
const ids=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
const source=fs.readFileSync('static/app.js','utf8');
const python=spawnSync('python3',['-c',`import json,server
h=server.Handler.__new__(server.Handler)
h.path='/api/state'
h.reply=lambda data,status=200: data
print(json.dumps(h.do_GET()))`],{encoding:'utf8'});
assert.equal(python.status,0,python.stderr);
const payload=JSON.parse(python.stdout);
assert.ok(payload.workspace);
async function boot(responder,stored=null,storageBlocked=false){
 const elements=new Map();
 function query(selector){
  if(!selector.startsWith('#')||!ids.has(selector.slice(1).split(' ')[0]))throw Error('Selector missing in actual HTML: '+selector);
  if(!elements.has(selector))elements.set(selector,{value:'',textContent:'',innerHTML:'',style:{},hidden:false,dataset:{},addEventListener(){},setAttribute(){},focus(){},close(){this.open=false},showModal(){this.open=true}});
  return elements.get(selector);
 }
 const requests=[];
 const context=vm.createContext({document:{querySelector:query,querySelectorAll:()=>[],addEventListener(){}},window:{addEventListener(){}},localStorage:{getItem(){if(storageBlocked)throw Error('storage unavailable');return stored},setItem(){}},fetch:async(url,options)=>{requests.push(url);return responder(url,options)},setTimeout:()=>0,clearTimeout(){},console});
 await vm.runInContext(source,context);
 return {elements,context,requests};
}
const ok=data=>({ok:true,json:async()=>structuredClone(data)});
(async()=>{
 let app=await boot(()=>ok(payload));
 assert.equal(app.elements.get('#workspaceSelect').value,payload.workspace.id);
 assert.equal(app.elements.get('#loadError').hidden,true);
 assert.equal(app.elements.get('#settingsButton').disabled,false);
 assert.match(app.elements.get('#workspaceMenu').innerHTML,/role="option"/);
 assert.equal(app.elements.get('#currentWorkspaceName').textContent,payload.workspace.name);
 assert.ok(app.elements.get('#nav').innerHTML.includes('Playbooks'));
 app=await boot(()=>ok(payload),null,true);
 assert.equal(app.elements.get('#loadError').hidden,true);
 app=await boot(url=>url.includes('missing')?{ok:false,status:400,json:async()=>({error:'工作空间不存在'})}:ok(payload),'missing');
 assert.equal(app.requests.length,2);
 assert.equal(app.requests[1],'/api/state');
 assert.equal(app.elements.get('#workspaceSelect').value,payload.workspace.id);
 app=await boot(()=>ok({directory:'/repo',files:[],token:'old'}));
 assert.equal(app.elements.get('#loadError').hidden,false);
 assert.match(app.elements.get('#loadErrorMessage').textContent,/重新运行 python3 server.py/);
 assert.equal(app.elements.get('#settingsButton').disabled,true);
 app.context.fetch=async()=>ok(payload);
 await app.elements.get('#retryLoad').onclick();
 assert.equal(app.elements.get('#loadError').hidden,true);
 assert.equal(app.elements.get('#workspaceSelect').value,payload.workspace.id);
 app=await boot(()=>{throw Error('Failed to fetch')});
 assert.equal(app.elements.get('#loadError').hidden,false);
 assert.match(app.elements.get('#loadErrorMessage').textContent,/Failed to fetch/);
 app=await boot(()=>({ok:true,json:async()=>{throw Error('Unexpected token <')}}));
 assert.match(app.elements.get('#loadErrorMessage').textContent,/静态文件服务器/);
 console.log('Full startup passed: real backend data, HTML selectors, stale workspace, blocked storage, old server, retry, network and HTML response errors');
})().catch(e=>{console.error(e);process.exitCode=1});
