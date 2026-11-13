const $=s=>document.querySelector(s);
const categories={overview:['◫','仓库概览'],playbooks:['▷','Playbooks'],roles:['▧','Roles'],variables:['≡','Variables'],inventory:['▦','Inventory'],tasks:['☷','Tasks 任务'],handlers:['↳','Handlers 处理器'],templates:['⌘','Templates 模板'],files:['▱','Files 文件'],dependencies:['⊞','依赖声明'],config:['⚒','配置文件'],history:['◷','执行记录']};
const navGroups=[
 {name:'仓库',keys:['overview','history']},
 {name:'自动化',keys:['playbooks','roles','tasks','handlers']},
 {name:'资源',keys:['inventory','variables','templates','files']},
 {name:'配置',keys:['dependencies','config']}
];
function navIcon(key){
 const shapes={overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',history:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',playbooks:'<path d="m8 4 12 8-12 8Z"/>',roles:'<path d="m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>',tasks:'<path d="m3 6 1 1 2-3m-3 9 1 1 2-3m-3 9 1 1 2-3M10 6h11M10 13h11M10 20h11"/>',handlers:'<path d="M5 4v8a4 4 0 0 0 4 4h11m-5-5 5 5-5 5"/>',inventory:'<rect x="7" y="3" width="10" height="5" rx="1"/><path d="M12 8v5M5 16v-3h14v3"/><rect x="2" y="16" width="6" height="5" rx="1"/><rect x="16" y="16" width="6" height="5" rx="1"/>',variables:'<path d="M8 4H6v6l-3 2 3 2v6h2m8-16h2v6l3 2-3 2v6h-2M10 9h4m-4 6h4"/>',templates:'<path d="M14 3H5v18h14V8Zm0 0v5h5m-10 4-2 2 2 2m6-4 2 2-2 2"/>',files:'<path d="M3 6h7l2 3h9v12H3Zm0 0V3h7l2 3h9v3"/>',dependencies:'<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M15 6h3v9M6 9v9h9"/>',config:'<path d="M3 6h6m4 0h8M3 12h12m4 0h2M3 18h3m4 0h11"/><circle cx="11" cy="6" r="2"/><circle cx="17" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>'};
 return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${shapes[key]||''}</svg>`;
}
function renderNavigation(){return navGroups.map((group,i)=>`<div class="nav-group" role="group" aria-labelledby="nav-group-${i}"><p class="nav-group-title" id="nav-group-${i}">${group.name}</p>${group.keys.map(key=>`<button data-nav="${key}" class="${key===category?'active':''}" ${key===category?'aria-current="page"':''}><span class="nav-icon">${navIcon(key)}</span><span class="nav-text">${categories[key][1]}</span>${['overview','history'].includes(key)?'':`<b>${assetCount(key)}</b>`}</button>`).join('')}</div>`).join('')}
let state={files:[]}, category='overview', selected=null, polling;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',4000)}
async function api(path,data,workspaceId=state.workspace?.id){
 const scoped=workspaceId?path+(path.includes('?')?'&':'?')+'workspace='+encodeURIComponent(workspaceId):path;
 const response=await fetch('/api/'+(data?path:scoped),data?{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-App-Token':state.token},body:JSON.stringify({...data,workspace:workspaceId})}:{cache:'no-store'});
 let result;try{result=await response.json()}catch{throw Error('服务未返回 JSON，请确认访问的是 python3 server.py 提供的页面，而不是静态文件服务器。')}
 if(!response.ok){const error=Error(result.error||`请求失败（${response.status}）`);error.status=response.status;throw error}
 return result;
}
function validateState(next){
 if(!next||!next.workspace||!Array.isArray(next.workspaces)||!Array.isArray(next.files))throw Error('工作空间接口版本不匹配。请停止旧服务并重新运行 python3 server.py，然后刷新页面。');
 if(typeof next.workspace.id!=='string'||typeof next.workspace.name!=='string'||!next.workspaces.every(w=>typeof w.id==='string'&&typeof w.name==='string'))throw Error('工作空间数据格式错误，请检查 .settings.json 中的空间名称和 ID。');
 next.workspace.defaults={inventory:'',limit:'',tags:'',extra:'',check:true,...next.workspace.defaults};
 return next;
}
function protect(fn){return async(...a)=>{try{await fn(...a)}catch(e){toast(e.message)}}}
async function load(workspaceId=state.workspace?.id){const next=validateState(await api('state',undefined,workspaceId));state=next;$('#appVersion').textContent='Playbook UI / v'+(state.version||'0.1.0');try{localStorage.setItem('playbookWorkspace',state.workspace.id)}catch{}renderWorkspacePicker();$('#workspaceSelect').value=state.workspace.id;$('#workspaceAvatar').textContent=state.workspace.name.slice(0,1);$('#headerWorkspace').textContent=state.workspace.name;$('#repoName').textContent=state.workspace.name;$('#repoPath').textContent=state.directory;$('#environment').textContent=state.ansible?'● Ansible 已就绪':'○ Ansible 未安装';render();$('#loadError').hidden=true;$('#settingsButton').disabled=false;$('#newWorkspace').disabled=false;$('#workspaceSelect').disabled=false;}
function render(){ $('#nav').innerHTML=renderNavigation();$('#breadcrumb').textContent=categories[category][1];$('#title').textContent=categories[category][1];$('#subtitle').textContent=({overview:'让基础设施代码，井然有序。',playbooks:'按目标主机和执行流程浏览自动化编排。',roles:'按角色组织任务、处理器、默认变量和模板。',variables:'按作用域查找变量，查看键值与数据类型。',inventory:'查看静态主机组、主机声明和组间关系。',tasks:'查看可复用任务、模块参数和执行条件。',handlers:'查看处理器名称、监听事件与任务配置。',templates:'浏览 Jinja 模板和引用的表达式。',files:'浏览分发到目标主机的静态资源。',dependencies:'查看角色和集合的来源与版本声明。',config:'按格式查看配置节和其他配置文件。',history:'查看任务状态与 Ansible 输出日志。'})[category];$('#stats').hidden=category!=='overview';$('#stats').innerHTML=['playbooks','roles','variables','inventory'].map(k=>`<button class="stat" data-nav="${k}"><span class="stat-top">${categories[k][1]} <span class="stat-icon">${categories[k][0]}</span></span><strong>${assetCount(k).toString().padStart(2,'0')}</strong><small>${k==='roles'?'独立角色':k==='variables'?'变量配置文件':k==='inventory'?'主机清单文件':'可执行的自动化脚本'} <span style="float:right">↗</span></small></button>`).join('');$('#browser').hidden=category==='history';$('#history').hidden=category!=='history';$('#listTitle').textContent=category==='overview'?'仓库文件':categories[category][1];renderFiles();if(category==='history')refreshRuns() }
function renderFiles(){const q=$('#search').value.toLowerCase();const files=state.files.filter(f=>(category==='overview'||belongsTo(f,category))&&f.path.toLowerCase().includes(q));$('#fileCount').textContent=category==='roles'?`${new Set(files.map(roleRoot)).size} 个角色`:`${files.length} 个文件`;$('#fileTable').hidden=category!=='overview';$('#assetCollection').hidden=category==='overview';if(category!=='overview'){$('#assetCollection').innerHTML=collectionView(files);return}$('#files').innerHTML=files.map(f=>`<tr><td><button class="file-link" data-file="${esc(f.path)}"><span class="file-mark">${f.category==='playbooks'?'▷':'⌘'}</span>${esc(f.name)}</button></td><td><span class="tag ${fileType(f)}">${categories[fileType(f)][1]}</span></td><td>${esc(f.path)}</td><td style="color:#92a096">${f.size<1024?f.size+' B':(f.size/1024).toFixed(1)+' KB'}</td><td><button class="row-action" data-file="${esc(f.path)}">查看 ↗</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">没有匹配的文件。可在仓库设置中更换目录。</td></tr>'}
document.addEventListener('click',protect(async e=>{const nav=e.target.closest('[data-nav]');if(nav){category=nav.dataset.nav;render()}const close=e.target.closest('[data-close]');if(close){if(close.dataset.close!=='viewer'||await canLeave())$('#'+close.dataset.close).close();}const file=e.target.closest('[data-file]');if(file){await openAsset(file.dataset.file)}}));
$('#search').oninput=renderFiles;$('#refresh').onclick=protect(async()=>{await load();toast('仓库已刷新')});$('#settingsButton').onclick=()=>showWorkspaceSettings(false);$('#newWorkspace').onclick=()=>showWorkspaceSettings(true);$('#workspaceSelect').onclick=()=>toggleWorkspaceMenu();$('#settingsForm').onsubmit=protect(async e=>{e.preventDefault();const data={name:$('#workspaceName').value,directory:$('#directory').value,defaults:{inventory:$('#defaultInventory').value,limit:$('#defaultLimit').value,tags:$('#defaultTags').value,extra:$('#defaultExtra').value,check:$('#defaultCheck').checked}};if(!canLeave())return;const item=await api(creatingWorkspace?'workspaces':'settings',data);await switchWorkspace(item.id);$('#settings').close();toast('工作空间已保存')});$('#copy').onclick=protect(async()=>{await navigator.clipboard.writeText(mode==='edit'?$('#sourceEditor').value:$('#code').textContent);toast('已复制')});$('#prepareRun').onclick=async()=>{if(!await canLeave())return;$('#viewer').close();$('#runPath').textContent=selected.path;const defaults=state.workspace.defaults;for(const key of ['inventory','limit','tags','extra'])$('#runForm').elements[key].value=defaults[key]||'';$('#runForm').elements.inventory.value ||= state.files.find(f=>f.category==='inventory')?.path||'';$('#runForm').elements.check.checked=defaults.check;$('#execute').showModal()};$('#runForm').onsubmit=protect(async e=>{e.preventDefault();const form=$('#runForm');const data=Object.fromEntries(new FormData(form));data.check=form.elements.check.checked;data.path=selected.path;await api('run',data);$('#execute').close();category='history';render();toast('任务已启动')});
async function refreshRuns(){clearTimeout(polling);try{const workspaceId=state.workspace?.id;const runs=await api('runs');if(workspaceId!==state.workspace?.id)return;$('#runList').innerHTML=runs.length?runs.map(r=>`<article class="run"><div class="run-head"><strong>${esc(r.path)} <small>#${r.id}</small></strong><span class="status ${r.status}">${({running:'运行中',success:'执行成功',failed:'执行失败'})[r.status]}${r.code===undefined?'':' · 退出码 '+r.code}</span></div><p><code>${r.command.map(esc).join(' ')}</code></p><pre>${esc(r.output||'等待 Ansible 输出…')}</pre></article>`).join(''):'<div class="empty">还没有执行记录。打开一个 Playbook 开始执行。</div>';if(category==='history')polling=setTimeout(refreshRuns,1500)}catch(e){toast(e.message)}}


let asset=null, mode='overview', saving=false;
const dirty=()=>asset && $('#sourceEditor').value!==asset.content;
function canLeave(){if(saving){toast('正在保存，请稍候');return false}if(!dirty())return true;if(!window.confirm('有尚未保存的修改，确定放弃这些修改？'))return false;$('#sourceEditor').value=asset.content;updateEditor();return true}
async function openAsset(path){
  if(!await canLeave())return;
  const file=state.files.find(f=>f.path===path);
  const response=await api('file?path='+encodeURIComponent(path));
  selected=file;asset=response;for(const id of ['editTab','sourceTab','copy'])$('#'+id).disabled=asset.editable===false;
  $('#viewTitle').textContent=file.name;
  $('#viewPath').textContent=file.path;
  $('#viewer .eyebrow').textContent=categories[fileType(file)][1]+' / ASSET';
  $('#code').textContent=asset.content;
  $('#sourceEditor').value=asset.content;
  $('#editorLanguage').textContent=fileType(file)==='templates'?'Jinja2':/\.ya?ml$/.test(file.name)?'YAML':file.name.endsWith('.json')?'JSON':'INI / TEXT';
  $('#editorError').hidden=true;
  flowSelected=-1;flowGroupStates.clear();flowInspector=true;flowShowHandlers=true;$('#viewer').classList?.remove('flow-fullscreen');mode='overview';renderAsset();setMode(mode);updateEditor();
  if(!$('#viewer').open)$('#viewer').showModal();
}
function setMode(next){finishFlowResize();if(next!=='flow')$('#viewer').classList?.remove('flow-fullscreen');const canFlow=fileType(selected)==='playbooks'&&Array.isArray(asset.data)&&!asset.parseError&&asset.editable!==false;$('#flowTab').hidden=!canFlow;if(next==='flow'&&!canFlow)next='overview';if(asset.editable===false&&(next==='edit'||next==='source'))next='overview';mode=next;document.querySelectorAll('[data-mode]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.mode===mode))});$('#assetOverview').hidden=mode!=='overview';$('#flowPane').hidden=mode!=='flow';if(mode==='flow')renderPlaybookFlow();$('#code').hidden=mode!=='source';$('#editorPane').hidden=mode!=='edit';$('#saveEdit').hidden=mode!=='edit';$('#revertEdit').hidden=mode!=='edit';$('#prepareRun').hidden=selected.category!=='playbooks'||mode==='edit';if(mode==='edit')$('#sourceEditor').focus()}
function scalar(v){return v===null?'null':typeof v==='object'?JSON.stringify(v):String(v)}
function tree(value,depth=0){
  if(depth>12)return '<span class="muted">内容过深，请查看源码</span>';
  if(value===null||typeof value!=='object')return `<code class="value">${esc(scalar(value))}</code>`;
  const entries=Object.entries(value);
  if(!entries.length)return '<code class="muted">'+(Array.isArray(value)?'[]':'{}')+'</code>';
  return `<div class="value-tree">${entries.map(([k,v])=>`<div class="value-row"><span class="value-key">${esc(k)}</span><div>${typeof v==='object'&&v!==null?tree(v,depth+1):`<code class="value">${esc(scalar(v))}</code><small class="value-type">${v===null?'null':typeof v}</small>`}</div></div>`).join('')}</div>`;
}
function note(text){return `<div class="asset-note">${esc(text)}</div>`}
function taskCards(tasks){if(!Array.isArray(tasks))return tree(tasks);return `<div class="task-list">${tasks.map((t,i)=>`<div class="task-card"><span class="task-index">${String(i+1).padStart(2,'0')}</span><div><strong>${esc(t?.name||'未命名任务')}</strong><div class="task-modules">${esc(t&&typeof t==='object'?Object.keys(t).filter(k=>!['name','when','tags','register','become','loop','notify','listen','vars'].includes(k)).join(' · '):scalar(t))}</div>${t?.listen?`<div class="handler-listen">listen: ${esc(scalar(t.listen))}</div>`:''}${t?.notify?`<div class="handler-listen">notify: ${esc(scalar(t.notify))}</div>`:''}${t?.when?`<small>when: ${esc(scalar(t.when))}</small>`:''}<details><summary>任务参数</summary>${tree(t)}</details></div></div>`).join('')}</div>`}
function renderAsset(){
 const d=asset.data,k=fileType(selected);
 let html='';
 if(asset.editable===false){html=fileInformation(selected,asset.previewReason);}
 else if(asset.parseError){html=note('无法生成资产视图：'+asset.parseError)+note('原始内容仍可查看，可在配置编辑器中修复语法。');}
 else if(k==='playbooks'){
  if(!Array.isArray(d))html=note('此文件不是 Play 列表，可能是任务片段或其他 YAML 文件。请查看源码。')+tree(d);
  else html=`<div class="asset-heading"><h3>Play 流程</h3><span>${d.length} 个 Play / 片段</span></div>`+d.map((play,i)=>{
   if(!play||typeof play!=='object')return tree(play);
   return `<article class="play-card"><div class="play-heading"><span class="task-index">${String(i+1).padStart(2,'0')}</span><h3>${esc(play.name||play.import_playbook||play['ansible.builtin.import_playbook']||'未命名 Play')}</h3></div><div class="play-meta"><span>目标主机 <b>${esc(scalar(play.hosts??'—'))}</b></span><span>提权 <b>${esc(scalar(play.become??'未设置'))}</b></span><span>事实收集 <b>${esc(scalar(play.gather_facts??'默认'))}</b></span></div>${play.roles?`<h4>Roles</h4><div class="role-chips">${(Array.isArray(play.roles)?play.roles:[play.roles]).map(r=>`<span class="tag roles">${esc(typeof r==='string'?r:r.role||scalar(r))}</span>`).join('')}</div>`:''}${['pre_tasks','tasks','post_tasks','handlers'].filter(key=>play[key]).map(key=>`<h4>${esc(key)}</h4>${taskCards(play[key])}`).join('')}<details><summary>全部 Play 配置</summary>${tree(play)}</details></article>`;
  }).join('');
 } else if(k==='tasks'||k==='handlers'){
  html=`<div class="asset-heading"><h3>${k==='handlers'?'处理器与监听事件':'任务流程'}</h3><span>${Array.isArray(d)?d.length:0} 个条目</span></div>`+note(k==='handlers'?'由 notify 通知或 listen 事件触发，通过所属 Playbook 执行。':'可由 include_tasks、import_tasks 或 Role 引用，通过所属 Playbook 执行。')+taskCards(d);
 } else if(k==='templates'){
  const expressions=templateExpressions(asset.content);html='<div class="asset-heading"><h3>Jinja 模板</h3><span>保留原始表达式</span></div>'+note('静态展示模板，不注入变量、不渲染或执行模板代码。')+`<div class="config-outline">${expressions.map(x=>`<code>{{ ${esc(x)} }}</code>`).join('')}</div><pre>${esc(asset.content)}</pre>`;
 } else if(k==='files'){
  html=fileInformation(selected)+`<h4>文本预览</h4><pre>${esc(asset.content)}</pre>`;
 } else if(k==='dependencies'){
  html='<div class="asset-heading"><h3>依赖声明</h3><span>requirements.yml</span></div>'+note('展示角色与集合的声明来源及版本，不代表本机已安装，不会自动安装依赖。')+dependencyTable(dependenciesFrom(d));
 } else if(k==='variables'){
  const parts=selected.path.split('/');const scope=parts.includes('group_vars')?'主机组变量':parts.includes('host_vars')?'单主机变量':parts.includes('defaults')?'默认变量':'共享变量';
  html=`<div class="asset-heading"><h3>${scope}</h3><span>${d&&typeof d==='object'?Object.keys(d).length:0} 个顶层变量</span></div>`+note('按键名展示值及类型。包含 Jinja 表达式的值保留原文，实际合并值由 Ansible 决定。')+tree(d);
 } else if(k==='inventory'){
  html='<div class="asset-heading"><h3>主机清单</h3><span>静态文件视图</span></div>'+note('展示文件中声明的分组和配置，不连接目标主机，不展开动态插件及主机范围。');
  if(d?.sections)html+=d.sections.map(g=>`<article class="inventory-group"><h3>${esc(g.name)} <small>${g.lines.length} 条声明</small></h3>${g.lines.map(l=>`<div class="host-row"><span>${l.line}</span><code>${esc(l.text)}</code></div>`).join('')||'<p class="muted">此分组暂无主机或配置。</p>'}</article>`).join('');
  else html+=inventoryYamlView(d);
 } else {
  html='<div class="asset-heading"><h3>配置文件</h3><span>'+esc($('#editorLanguage').textContent)+'</span></div>';
  if(d?.sections)html+=d.sections.map(g=>`<article class="inventory-group"><h3>[${esc(g.name)}]</h3>${g.lines.map(l=>`<div class="host-row"><span>${l.line}</span><code>${esc(l.text)}</code></div>`).join('')}</article>`).join('');
  else if(d!==null)html+=tree(d);else html+=note('文本配置可在源码中查看，也可以切换到配置编辑器修改。')+`<pre>${esc(asset.content)}</pre>`;
 }
 $('#assetOverview').innerHTML=(selected.role||selected.category==='roles')?roleWorkspace(html):html;
}
function updateEditor(){
 const editor=$('#sourceEditor'),lines=editor.value.split('\n');
 $('#lineNumbers').textContent=lines.map((_,i)=>i+1).join('\n');
 $('#dirtyState').textContent=dirty()?'● 未保存':'已保存';
 $('#saveEdit').disabled=saving||!dirty();$('#revertEdit').disabled=saving||!dirty();
 const prefix=editor.value.slice(0,editor.selectionStart).split('\n');$('#cursorPosition').textContent=`行 ${prefix.length}，列 ${prefix.at(-1).length+1}`;
 if($('#diffPanel').open)renderDiff();
}
function renderDiff(){
 const before=asset.content.split('\n'),after=$('#sourceEditor').value.split('\n');let start=0,endA=before.length,endB=after.length;
 while(start<endA&&start<endB&&before[start]===after[start])start++;
 while(endA>start&&endB>start&&before[endA-1]===after[endB-1]){endA--;endB--}
 $('#diffOutput').innerHTML=!dirty()?'没有修改':`<span class="muted">@@ 从第 ${start+1} 行开始 @@</span>\n`+before.slice(start,endA).map(l=>`<span class="diff-remove">- ${esc(l)}</span>`).concat(after.slice(start,endB).map(l=>`<span class="diff-add">+ ${esc(l)}</span>`)).join('\n');
}
async function saveEditor(){
 if(saving||!dirty()||asset.editable===false)return;
 saving=true;$('#sourceEditor').readOnly=true;updateEditor();$('#editorError').hidden=true;
 try{
  const content=$('#sourceEditor').value;
  asset=await api('file',{path:selected.path,content,version:asset.version});
  $('#code').textContent=asset.content;await load();selected=state.files.find(f=>f.path===selected.path)||selected;renderAsset();setMode(mode);toast('配置已保存到仓库');
 }catch(e){$('#editorError').textContent=e.message;$('#editorError').hidden=false;}
 finally{saving=false;$('#sourceEditor').readOnly=false;updateEditor()}
}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
$('#sourceEditor').addEventListener('input',updateEditor);
$('#sourceEditor').addEventListener('click',updateEditor);
$('#sourceEditor').addEventListener('keyup',updateEditor);
$('#sourceEditor').addEventListener('scroll',()=>{$('#lineNumbers').scrollTop=$('#sourceEditor').scrollTop});
$('#sourceEditor').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveEditor()}if(e.key==='Tab'){e.preventDefault();const el=e.target;el.setRangeText('  ',el.selectionStart,el.selectionEnd,'end');updateEditor()}});
$('#saveEdit').onclick=saveEditor;
$('#revertEdit').onclick=()=>{if(!dirty()||confirm('撤销当前文件的所有未保存修改？')){$('#sourceEditor').value=asset.content;$('#editorError').hidden=true;updateEditor()}};
$('#diffPanel').ontoggle=()=>{if(asset)renderDiff()};
$('#viewer').addEventListener('cancel',e=>{if(!canLeave())e.preventDefault()});
window.addEventListener('beforeunload',e=>{if(dirty())e.preventDefault()});
function fileType(file){if(file.assetType)return file.assetType;if(file.category!=='roles')return file.category;const parts=file.path.split('/'),section=parts[parts.indexOf('roles')+2];return ({tasks:'tasks',handlers:'handlers',defaults:'variables',vars:'variables',templates:'templates',files:'files'})[section]||'config'}
function belongsTo(file,kind){return kind==='roles'?Boolean(file.role)||file.category==='roles':kind==='playbooks'?file.category==='playbooks':fileType(file)===kind}
function roleRoot(file){const parts=file.path.split('/'),i=parts.indexOf('roles');return parts.slice(0,i+2).join('/')}
function assetCount(kind){const files=state.files.filter(f=>belongsTo(f,kind));return kind==='roles'?new Set(files.map(roleRoot)).size:files.length}
function groupFiles(files,key){const groups=new Map();for(const file of files){const group=key(file);if(!groups.has(group))groups.set(group,[]);groups.get(group).push(file)}return [...groups]}
function assetAction(file,label='查看详情'){return `<button class="button asset-open" data-file="${esc(file.path)}">${label} ↗</button>`}
function collectionHeading(file,label){return `<div class="collection-card-heading"><div><span class="collection-kind">${label}</span><h3>${esc(file.name)}</h3></div>${assetAction(file)}</div><code class="collection-path">${esc(file.path)}</code>`}
function summaryNotice(file){return file.summary?.error?`<p class="collection-warning">无法解析摘要，请打开源码检查。</p>`:!file.summary?'<p class="collection-warning">摘要未加载，请重启服务后刷新。</p>':''}
function scopeOf(file){const p=file.path.split('/');if(p.includes('group_vars'))return '主机组变量';if(p.includes('host_vars'))return '主机变量';if(p.includes('defaults'))return '默认变量';return '共享变量'}
function collectionView(files){
 if(!files.length)return '<div class="empty">没有匹配的资产。可调整搜索词或检查仓库目录。</div>';
 if(category==='playbooks')return `<div class="playbook-collection">${files.map(f=>`<article class="collection-card playbook-asset">${collectionHeading(f,'PLAYBOOK')}${summaryNotice(f)}<ol class="play-pipeline">${(f.summary?.plays||[]).map((p,i)=>`<li><span class="pipeline-number">${i+1}</span><div><strong>${esc(p.imported?'导入 '+p.imported:p.name)}</strong>${p.imported?'':`<p>目标 <code>${esc(scalar(p.hosts))}</code></p><div class="pipeline-parts">${p.roles.map(r=>`<span class="tag roles">${esc(r)}</span>`).join('')}<span class="pipeline-task-count">${p.tasks} 个任务 / 处理器</span></div>`}</div></li>`).join('')}</ol><div class="collection-foot"><span>${f.summary?.plays?.length??'—'} 个 Play</span><span>查看流程后可执行或编辑</span></div></article>`).join('')}</div>`;
 if(category==='roles')return `<div class="role-collection">${groupFiles(files,roleRoot).map(([root,matched])=>{
  const all=state.files.filter(f=>f.category==='roles'&&roleRoot(f)===root),main=all.find(f=>/\/tasks\/main\.ya?ml$/.test(f.path))||matched[0];
  const groups=groupFiles(all,f=>f.path.slice(root.length+1).split('/')[0]);
  const labels={tasks:'任务',handlers:'处理器',defaults:'默认变量',vars:'变量',templates:'模板',meta:'元信息',files:'资源'};
  return `<article class="collection-card role-asset"><div class="collection-card-heading"><div><span class="collection-kind">ROLE</span><h3>${esc(root.split('/').at(-1))}</h3></div>${assetAction(main,'打开角色')}</div><code class="collection-path">${esc(root)}</code><div class="role-components">${groups.map(([key,items])=>`<div><span>${esc(labels[key]||key)}</span><strong>${items.length}</strong></div>`).join('')}</div><div class="role-file-list">${all.map(f=>`<button data-file="${esc(f.path)}"><span>${esc(f.path.slice(root.length+1))}</span><small>${f.summary?.tasks?f.summary.tasks+' 个条目':f.summary?.keys?.length?f.summary.keys.length+' 个键':'查看文件'} ↗</small></button>`).join('')}</div><div class="collection-foot"><span>${all.length} 个文件</span><span>通过引用它的 Playbook 执行</span></div></article>`;
 }).join('')}</div>`;
 if(category==='variables')return groupFiles(files,scopeOf).map(([scope,items])=>`<div class="scope-section"><div class="scope-title"><h3>${scope}</h3><span>${items.length} 个变量文件</span></div><div class="variable-collection">${items.map(f=>`<article class="collection-card variable-asset">${collectionHeading(f,scope)}${summaryNotice(f)}<div class="variable-key-list">${(f.summary?.keys||[]).slice(0,12).map(k=>`<div><code>${esc(k)}</code><span>查看值与类型 ↗</span></div>`).join('')||'<p class="muted">暂无可展示的顶层变量键</p>'}</div>${f.summary?.keys?.length>12?`<p class="muted">另有 ${f.summary.keys.length-12} 个变量</p>`:''}<div class="collection-foot"><span>${f.summary?.keys?.length??'—'} 个顶层变量</span><span>点击详情展开嵌套值</span></div></article>`).join('')}</div></div>`).join('');
 if(category==='inventory')return `<div class="inventory-collection">${files.map(f=>`<article class="collection-card inventory-asset">${collectionHeading(f,'INVENTORY')}${summaryNotice(f)}${f.summary?.dynamic?note('动态 Inventory 插件配置，仅展示文件，不执行插件。'):''}<div class="inventory-topology">${(f.summary?.groups||[]).map(g=>`<div class="inventory-node"><div class="inventory-node-title"><strong>${esc(g.name)}</strong><span>${g.kind==='vars'?'组变量':g.kind==='children'?'子组':g.entries.length+' 条主机声明'}</span></div><div class="host-chips">${g.entries.slice(0,8).map(h=>`<code>${esc(h)}</code>`).join('')||'<span class="muted">未声明条目</span>'}${g.entries.length>8?`<small>+${g.entries.length-8}</small>`:''}</div>${g.children?.length?`<p class="group-relation">子组 → ${g.children.map(esc).join(' · ')}</p>`:''}${g.variables?.length?`<p class="group-relation">组变量 · ${g.variables.map(esc).join(' · ')}</p>`:''}</div>`).join('')||'<p class="muted">暂无静态分组</p>'}</div><div class="collection-foot"><span>${f.summary?.groups?.length??'—'} 个组 / 配置节</span><span>静态声明，不代表在线状态</span></div></article>`).join('')}</div>`;
 if(['tasks','handlers','templates','files','dependencies'].includes(category))return typedCollection(files);
 if(category==='config')return groupFiles(files,f=>f.name.endsWith('.j2')?'Jinja 模板':/\.(cfg|ini)$/.test(f.name)?'INI 配置':f.name.endsWith('.json')?'JSON 配置':'其他 YAML').map(([format,items])=>`<div class="scope-section"><div class="scope-title"><h3>${format}</h3><span>${items.length} 个文件</span></div><div class="config-collection">${items.map(f=>`<article class="collection-card config-asset">${collectionHeading(f,format)}${summaryNotice(f)}<div class="config-outline">${(f.summary?.sections||[]).map(s=>`<code>[${esc(s)}]</code>`).join('')}${(f.summary?.expressions||[]).map(s=>`<code>{{ ${esc(s)} }}</code>`).join('')}${!f.summary?.sections?.length&&!f.summary?.expressions?.length?'<p class="muted">打开详情查看结构或编辑配置</p>':''}</div><div class="collection-foot"><span>${f.summary?.lines??'—'} 行</span><span>${format==='Jinja 模板'?'保留 Jinja 表达式':'保留文件格式与注释'}</span></div></article>`).join('')}</div></div>`).join('');
 return '';
}
function inventoryYamlView(data,depth=0){
 if(!data||typeof data!=='object'||depth>10)return tree(data);
 if(data.plugin)return note('动态 Inventory 插件：'+String(data.plugin))+tree(data);
 return Object.entries(data).map(([name,group])=>{
  if(!group||typeof group!=='object')return tree({[name]:group});
  return `<article class="inventory-group"><h3>${esc(name)}</h3>${group.hosts?`<h4>主机</h4>${Object.entries(group.hosts).map(([host,vars])=>`<details class="inventory-host-detail"><summary>${esc(host)}</summary>${tree(vars||{})}</details>`).join('')}`:''}${group.vars?`<h4>组变量</h4>${tree(group.vars)}`:''}${group.children?`<h4>子组</h4><div class="inventory-children">${inventoryYamlView(group.children,depth+1)}</div>`:''}${!group.hosts&&!group.vars&&!group.children?tree(group):''}</article>`;
 }).join('');
}

function templateExpressions(content){return [...new Set([...content.matchAll(/{{\s*([\s\S]*?)\s*}}/g)].map(m=>m[1]))].slice(0,20)}
function formatBytes(bytes){return bytes<1024?`${bytes} B`:bytes<1048576?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1048576).toFixed(1)} MB`}
function fileInformation(file,reason='UTF-8 文本，可以通过配置编辑器修改。'){return `<div class="asset-heading"><h3>静态文件</h3><span>${esc(file.name.split('.').length>1?file.name.split('.').at(-1).toUpperCase():'无扩展名')}</span></div><div class="file-facts"><div><span>文件名</span><strong>${esc(file.name)}</strong></div><div><span>大小</span><strong>${formatBytes(file.size||0)}</strong></div><div><span>所属角色</span><strong>${esc(file.role?.split('/').at(-1)||'仓库共享')}</strong></div></div>${note(reason)}`}
function roleWorkspace(content){
 const root=selected.role||roleRoot(selected),siblings=state.files.filter(f=>f.path.startsWith(root+'/'));
 const labels={tasks:'任务',handlers:'处理器',defaults:'默认变量',vars:'角色变量',meta:'元信息',templates:'模板',files:'文件'};
 return `<div class="role-layout"><div class="role-tree"><h3>${esc(root.split('/').at(-1))}</h3><p>${siblings.length} 个角色文件</p>${groupFiles(siblings,f=>f.path.slice(root.length+1).split('/')[0]).map(([key,files])=>`<h4>${esc(labels[key]||key)}</h4>${files.map(f=>`<button class="role-file ${f.path===selected.path?'current':''}" data-file="${esc(f.path)}">${esc(f.path.slice(root.length+1))}</button>`).join('')}`).join('')}</div><div class="role-content">${content}</div></div>`;
}
function dependenciesFrom(data){const result=[];const add=(list,kind)=>{if(!Array.isArray(list))return;for(const item of list){if(typeof item==='string')result.push({kind,name:item,source:item,version:'未指定'});else if(item&&typeof item==='object'){if(item.include)result.push({kind:'include',name:item.include,source:item.include,version:'—'});else result.push({kind,name:item.name||item.src||'未命名依赖',source:item.src||item.source||item.name||'Galaxy',version:item.version??'未指定',scm:item.scm||''})}}};if(Array.isArray(data))add(data,'role');else if(data&&typeof data==='object'){add(data.roles,'role');add(data.collections,'collection')}return result}
function dependencyTable(items){return items.length?`<div class="dependency-scroll"><table class="dependency-table"><thead><tr><th>类型</th><th>名称</th><th>来源</th><th>版本</th></tr></thead><tbody>${items.map(d=>`<tr><td><span class="tag">${esc(d.kind==='collection'?'Collection':d.kind==='include'?'引用文件':'Role')}</span></td><td>${esc(d.name)}</td><td>${esc(d.source)}${d.scm?`<small> · ${esc(d.scm)}</small>`:''}</td><td><code>${esc(d.version)}</code></td></tr>`).join('')}</tbody></table></div>`:note('没有可展示的依赖条目，请查看源码中的声明格式。')}
function ownerLabel(file){return file.role?`<span class="owner-label">Role / ${esc(file.role.split('/').at(-1))}</span>`:''}
function typedCollection(files){
 if(category==='tasks'||category==='handlers')return `<div class="task-collection">${files.map(f=>`<article class="collection-card">${collectionHeading(f,category==='handlers'?'HANDLERS':'TASKS')}${ownerLabel(f)}${summaryNotice(f)}<ol class="task-summary-list">${(f.summary?.items||[]).slice(0,6).map((t,i)=>`<li><span>${i+1}</span><div><strong>${esc(t.name)}</strong><code>${(t.modules||[]).map(esc).join(' · ')}</code>${t.listen?`<small>监听 · ${esc(scalar(t.listen))}</small>`:''}${t.notify?`<small>通知 → ${esc(scalar(t.notify))}</small>`:''}${t.when?`<small>条件 · ${esc(scalar(t.when))}</small>`:''}</div></li>`).join('')}</ol><div class="collection-foot"><span>${f.summary?.tasks??'—'} 个任务${(f.summary?.items?.length||0)>6?' · 详情查看全部':''}</span><span>${category==='handlers'?'由通知触发':'通过 Playbook 引用执行'}</span></div></article>`).join('')}</div>`;
 if(category==='templates')return `<div class="template-collection">${files.map(f=>`<article class="collection-card template-asset">${collectionHeading(f,'JINJA TEMPLATE')}${ownerLabel(f)}${summaryNotice(f)}<h4>引用表达式</h4><div class="template-expressions">${(f.summary?.expressions||[]).map(s=>`<code><span>{{</span> ${esc(s)} <span>}}</span></code>`).join('')||'<p class="muted">未发现输出表达式，可查看模板源码</p>'}</div><div class="collection-foot"><span>${f.summary?.lines??'—'} 行模板</span><span>静态查看 · 保留模板语法</span></div></article>`).join('')}</div>`;
 if(category==='files')return `<div class="static-file-list"><div class="static-file-header"><span>文件与所属目录</span><span>大小</span><span>查看方式</span></div>${files.map(f=>`<article class="static-file-row"><div><button class="file-link" data-file="${esc(f.path)}"><span class="file-extension">${esc(f.name.includes('.')?f.name.split('.').at(-1).slice(0,5).toUpperCase():'FILE')}</span><strong>${esc(f.name)}</strong></button><code class="collection-path">${esc(f.path)}</code>${ownerLabel(f)}</div><span>${formatBytes(f.size)}</span><div><span class="file-preview-kind">${f.summary?.editable===false?'文件信息':'文本预览 / 编辑'}</span>${assetAction(f,'查看')}</div></article>`).join('')}</div>`;
 if(category==='dependencies')return `<div class="dependency-collection">${files.map(f=>`<article class="collection-card">${collectionHeading(f,'REQUIREMENTS')}${ownerLabel(f)}${summaryNotice(f)}${dependencyTable(f.summary?.dependencies||[])}<div class="collection-foot"><span>${f.summary?.dependencies?.length??'—'} 条依赖声明</span><span>声明不代表已安装</span></div></article>`).join('')}</div>`;
 return '';
}

let flowNodes=[], flowSelected=-1, flowGroupStates=new Map(), flowGroupIndex=0, flowInspector=true, flowShowHandlers=true;
let flowSplit=null, flowDrag=null;
try{const stored=localStorage.getItem('playbookFlowSplit');const value=stored===null?null:Number(stored);if(value!==null&&Number.isFinite(value)&&value>0&&value<1)flowSplit=value}catch{}
const flowTaskKeywords=new Set('name when tags register become become_user become_method become_flags become_exe check_mode diff changed_when failed_when ignore_errors ignore_unreachable notify listen vars environment loop loop_control until retries delay run_once delegate_to delegate_facts throttle timeout no_log any_errors_fatal collections connection remote_user module_defaults args poll async debugger'.split(' '));
function flowModule(task){return Object.keys(task||{}).filter(k=>!flowTaskKeywords.has(k)&&!k.startsWith('with_')).join(' · ')}
function flowNode(kind,title,subtitle,data,extra=''){
 const index=flowNodes.push({kind,title,data})-1;
 const typeLabel=({play:'Play',task:'任务',role:'角色',import:'引用',block:'任务块',checkpoint:'Handler',facts:'事实收集'})[kind]||kind;
 return `<button class="flow-node flow-${kind}" data-flow-node="${index}" aria-pressed="${index===flowSelected}" aria-label="${esc(typeLabel+'：'+title)}"><span class="flow-node-heading"><span class="flow-node-kind">${typeLabel}</span><span class="flow-node-open" aria-hidden="true">↗</span></span><strong>${esc(title)}</strong>${subtitle?`<code title="${esc(subtitle)}">${esc(subtitle)}</code>`:''}${extra}</button>`;
}
function flowTask(task,depth=0){
 if(!task||typeof task!=='object')return `<div class="flow-note">${esc(scalar(task))}</div>`;
 if(depth>12)return '<div class="flow-note">嵌套较深，点击上级节点查看完整参数</div>';
 const flags=[task.when!==undefined?`条件 · ${scalar(task.when)}`:'',task.loop!==undefined||Object.keys(task).some(k=>k.startsWith('with_'))?'循环执行':'',task.notify?`通知 · ${scalar(task.notify)}`:''].filter(Boolean);
 const extra=flags.length?`<span class="flow-flags">${flags.map(f=>`<span title="${esc(f)}">${esc(f)}</span>`).join('')}</span>`:'';
 if(task.block||task.rescue||task.always){return `<div class="flow-block">${flowNode('block',task.name||'Block',task.when?'满足条件时进入':'',task,extra)}${['block','rescue','always'].filter(k=>Array.isArray(task[k])).map(k=>`<div class="flow-branch flow-branch-${k}"><span class="flow-branch-label">${({block:'主体任务',rescue:'rescue · 主体失败时尝试',always:'always · 正常或救援流程之后'})[k]}</span><div class="flow-chain">${task[k].map(t=>`<div class="flow-step">${flowTask(t,depth+1)}</div>`).join('')||'<div class="flow-note">无任务</div>'}</div></div>`).join('')}</div>`}
 const metaKey=Object.keys(task).find(k=>/^(ansible\.builtin\.)?meta$/.test(k));
 if(metaKey&&task[metaKey]==='flush_handlers')return flowNode('checkpoint',task.name||'立即处理 Handler','meta: flush_handlers · 仅执行已收到通知的处理器',task,extra);
 const includeKey=Object.keys(task).find(k=>/^(ansible\.builtin\.)?(include_tasks|import_tasks|include_role|import_role)$/.test(k));
 const target=includeKey?task[includeKey]:null;
 return flowNode(includeKey?'import':'task',task.name||includeKey||flowModule(task)||'未命名任务',includeKey?(typeof target==='string'?target:target?.file||target?.name||includeKey):flowModule(task),task,extra);
}
function flowStage(label,items,render){
 if(!Array.isArray(items)||!items.length)return '';
 const key=String(flowGroupIndex++),open=flowGroupStates.has(key)?flowGroupStates.get(key):items.length<=6;
 return `<details class="flow-step flow-stage" data-flow-group="${key}" ${open?'open':''}><summary><span class="flow-stage-toggle" aria-hidden="true">›</span><strong>${label}</strong><span class="flow-stage-count">${items.length} 项</span></summary><div class="flow-chain">${items.map(item=>`<div class="flow-step">${render(item)}</div>`).join('')}</div></details>`;
}
function flowCheckpoint(play,label){
 const handlers=Array.isArray(play.handlers)?play.handlers:[];
 if(!handlers.length&&!play.roles?.length)return '';
 const index=flowNodes.push({kind:'checkpoint',title:'通知处理器',data:{handlers,roles:play.roles||[]}})-1;
 return `<div class="flow-step flow-handler-checkpoint"><span class="flow-handler-connector" aria-hidden="true"></span><button data-flow-node="${index}" class="flow-handler-button" aria-pressed="${index===flowSelected}" title="仅处理已收到通知的 Handler"><span class="flow-handler-label">${label}</span><span class="flow-handler-name">Handler</span><span class="flow-handler-count">${handlers.length?handlers.length+' 个声明':'来自角色'}</span><span aria-hidden="true">↗</span></button><span class="flow-checkpoint-label">仅处理已收到通知的 Handler</span></div>`;
}
function renderPlaybookFlow(){
 finishFlowResize();
 const scrollTop=$('#flowPane').scrollTop||0;flowNodes=[];flowGroupIndex=0;
 if(dirty()){$('#flowPane').innerHTML=note('当前有未保存修改，流程图展示上次保存的内容。')+playbookFlowHtml();}else $('#flowPane').innerHTML=playbookFlowHtml();
 const entry=flowNodes[flowSelected];
 if(entry)showFlowDetails(flowSelected,false);else flowSelected=-1;
 $('#flowPane').scrollTop=scrollTop;syncFlowSplitter();
}
function playbookFlowHtml(){
 if(!Array.isArray(asset.data))return note('当前文件无法生成 Playbook 流程图。');
 const fullscreen=$('#viewer').classList?.contains('flow-fullscreen');
 return `<div class="flow-toolbar"><div class="flow-toolbar-legend"><span><i></i>声明顺序</span><span class="flow-legend-handler">┄ 通知触发</span></div><div class="flow-toolbar-actions"><button data-flow-action="expand">展开全部</button><button data-flow-action="collapse">收起阶段</button><button data-flow-action="handlers" aria-pressed="${flowShowHandlers}">${flowShowHandlers?'隐藏':'显示'} Handler</button><button data-flow-action="inspector" aria-pressed="${flowInspector}">${flowInspector?'隐藏':'显示'}参数</button><button data-flow-action="fullscreen" aria-pressed="${Boolean(fullscreen)}">${fullscreen?'退出全屏':'全屏查看'}</button></div></div><div class="flow-play-nav" aria-label="定位 Play">${asset.data.map((p,i)=>`<button data-flow-jump="${i}" title="${esc(p?.name||p?.import_playbook||p?.['ansible.builtin.import_playbook']||'Play '+(i+1))}"><span>${i+1}</span>${esc(p?.name||p?.import_playbook||p?.['ansible.builtin.import_playbook']||'Play '+(i+1))}</button>`).join('')}</div><p class="flow-disclaimer">静态结构 · 点击节点查看参数 · 超过 6 项的阶段默认折叠 · 角色及导入内容不展开</p><div style="${flowSplitStyle()}" class="flow-layout ${flowInspector?'':'flow-no-inspector'} ${flowShowHandlers?'':'flow-hide-handlers'}"><div id="flowCanvas" class="flow-canvas" aria-label="Playbook 执行结构"><div class="flow-chain flow-play-chain">${asset.data.map((play,i)=>{
 if(!play||typeof play!=='object')return '';
 const imported=play.import_playbook||play['ansible.builtin.import_playbook'];
 if(imported)return `<div class="flow-step flow-play" data-flow-play="${i}"><div class="flow-stage-index">${i+1} / Playbook 引用</div>${flowNode('import','导入 Playbook',scalar(imported),play)}</div>`;
 return `<article class="flow-step flow-play" data-flow-play="${i}"><div class="flow-stage-index">${i+1} / Play</div>${flowNode('play',play.name||'未命名 Play','hosts: '+scalar(play.hosts??'—'),play)}<div class="flow-chain flow-play-body">${play.gather_facts===false?'':`<div class="flow-step">${flowNode('facts','收集主机事实',play.gather_facts===undefined?'默认启用':'gather_facts: '+scalar(play.gather_facts),{gather_facts:play.gather_facts??true,gather_subset:play.gather_subset})}</div>`}${flowStage('前置任务 · pre_tasks',play.pre_tasks,t=>flowTask(t))}${Array.isArray(play.pre_tasks)&&play.pre_tasks.length?flowCheckpoint(play,'前置任务后'):''}${flowStage('角色 · roles',play.roles,r=>flowNode('role',typeof r==='string'?r:r?.role||'未命名角色','引用角色 · 未展开',r))}${flowStage('任务 · tasks',play.tasks,t=>flowTask(t))}${flowCheckpoint(play,'角色与任务后')}${flowStage('后置任务 · post_tasks',play.post_tasks,t=>flowTask(t))}${Array.isArray(play.post_tasks)&&play.post_tasks.length?flowCheckpoint(play,'后置任务后'):''}<div class="flow-step"><div class="flow-end">Play 结束</div></div></div></article>`;
 }).join('')}<div class="flow-step"><div class="flow-end flow-final">Playbook 结束</div></div></div></div><div class="flow-splitter" data-flow-resizer role="separator" tabindex="0" aria-orientation="vertical" aria-label="调整流程图与节点参数宽度" aria-controls="flowCanvas flowDetails" aria-valuemin="20" aria-valuemax="80" aria-valuenow="40" title="拖动调整宽度；方向键微调；双击恢复默认"><span aria-hidden="true"></span></div><div id="flowDetails" class="flow-details" aria-label="流程节点参数" aria-live="polite"><div class="flow-detail-empty"><span aria-hidden="true">↖</span><h3>选择一个节点</h3><p>查看任务参数、执行条件与角色配置</p></div></div></div>`;
}
function showFlowDetails(index,reveal=true){
 const entry=flowNodes[index];if(!entry)return;flowSelected=index;if(reveal){flowInspector=true;$('#flowPane').querySelector?.('.flow-layout')?.classList.remove('flow-no-inspector');const toggle=$('#flowPane').querySelector?.('[data-flow-action=inspector]');if(toggle){toggle.textContent='隐藏参数';toggle.setAttribute('aria-pressed','true')}}
 document.querySelectorAll('[data-flow-node]').forEach(node=>node.setAttribute('aria-pressed',String(Number(node.dataset.flowNode)===index)));
 $('#flowDetails').innerHTML=`<div class="flow-detail-heading"><span>${esc(({play:'Play',task:'任务',role:'角色',import:'导入 / 引用',block:'任务块',checkpoint:'处理器触发点',facts:'事实收集'})[entry.kind]||entry.kind)}</span><h3>${esc(entry.title)}</h3></div>${tree(entry.data)}${entry.kind==='checkpoint'?note('这里列出当前 Play 声明的处理器和角色引用。仅发生通知时才尝试运行，执行顺序由处理器定义顺序决定。'):''}`;
 syncFlowSplitter();
}
function handleFlowAction(action){
 const pane=$('#flowPane');
 if(action==='fullscreen'){$('#viewer').classList.toggle('flow-fullscreen');const button=pane.querySelector('[data-flow-action=fullscreen]');button.textContent=$('#viewer').classList.contains('flow-fullscreen')?'退出全屏':'全屏查看';button.setAttribute('aria-pressed',String($('#viewer').classList.contains('flow-fullscreen')));syncFlowSplitter();return}
 if(action==='expand'||action==='collapse'){pane.querySelectorAll('[data-flow-group]').forEach(group=>{group.open=action==='expand';flowGroupStates.set(group.dataset.flowGroup,group.open)});return}
 if(action==='handlers')flowShowHandlers=!flowShowHandlers;
 if(action==='inspector')flowInspector=!flowInspector;
 renderPlaybookFlow();
}
$('#flowPane').addEventListener('click',e=>{
 const action=e.target.closest('[data-flow-action]');if(action){handleFlowAction(action.dataset.flowAction);return}
 const jump=e.target.closest('[data-flow-jump]');if(jump){$('#flowPane').querySelector(`[data-flow-play="${jump.dataset.flowJump}"]`)?.scrollIntoView({block:'start',behavior:'instant'});return}
 const node=e.target.closest('[data-flow-node]');if(node)showFlowDetails(Number(node.dataset.flowNode));
});
$('#flowPane').addEventListener('toggle',e=>{if(e.target.matches?.('[data-flow-group]'))flowGroupStates.set(e.target.dataset.flowGroup,e.target.open)},true);

function flowSplitStyle(){return flowSplit===null?'':`--flow-left-width:calc(${(flowSplit*100).toFixed(4)}% - ${(flowSplit*12).toFixed(4)}px)`}
function flowSplitBounds(width){const available=Math.max(0,width-12),minimum=Math.min(280,available/2);return {available,min:minimum,max:available-minimum}}
function flowSplitRatio(width,left){const bounds=flowSplitBounds(width);return bounds.available?Math.max(bounds.min,Math.min(bounds.max,left))/bounds.available:0.5}
function flowSplitElements(){const pane=$('#flowPane');return {layout:pane.querySelector?.('.flow-layout'),splitter:pane.querySelector?.('[data-flow-resizer]')}}
function syncFlowSplitter(){
 const {layout,splitter}=flowSplitElements();if(!layout||!splitter||!splitter.getClientRects().length)return;
 const bounds=flowSplitBounds(layout.getBoundingClientRect().width),left=layout.querySelector('.flow-canvas').getBoundingClientRect().width;
 if(!bounds.available)return;
 splitter.setAttribute('aria-valuemin',String(Math.round(bounds.min/bounds.available*100)));
 splitter.setAttribute('aria-valuemax',String(Math.round(bounds.max/bounds.available*100)));
 splitter.setAttribute('aria-valuenow',String(Math.round(left/bounds.available*100)));
 splitter.setAttribute('aria-valuetext',`流程图 ${Math.round(left/bounds.available*100)}%，节点参数 ${Math.round((1-left/bounds.available)*100)}%`);
}
function applyFlowSplit(layout,left){
 flowSplit=flowSplitRatio(layout.getBoundingClientRect().width,left);
 layout.style.setProperty('--flow-left-width',`calc(${(flowSplit*100).toFixed(4)}% - ${(flowSplit*12).toFixed(4)}px)`);
 syncFlowSplitter();
}
function persistFlowSplit(){try{if(flowSplit===null)localStorage.removeItem('playbookFlowSplit');else localStorage.setItem('playbookFlowSplit',String(flowSplit))}catch{}}
function resetFlowSplit(){flowSplit=null;const {layout}=flowSplitElements();layout?.style.removeProperty('--flow-left-width');persistFlowSplit();syncFlowSplitter()}
function finishFlowResize(){
 if(!flowDrag)return;const drag=flowDrag;flowDrag=null;
 if(drag.splitter.hasPointerCapture?.(drag.pointerId))drag.splitter.releasePointerCapture(drag.pointerId);
 document.body.classList.remove('flow-resizing');persistFlowSplit();
}
$('#flowPane').addEventListener('pointerdown',e=>{
 const splitter=e.target.closest('[data-flow-resizer]');if(!splitter||e.button!==0||!splitter.getClientRects().length)return;
 const layout=splitter.parentElement;
 flowDrag={splitter,layout,pointerId:e.pointerId,startX:e.clientX,startLeft:layout.querySelector('.flow-canvas').getBoundingClientRect().width};
 e.preventDefault();splitter.focus();splitter.setPointerCapture(e.pointerId);document.body.classList.add('flow-resizing');
});
window.addEventListener('pointermove',e=>{if(!flowDrag||e.pointerId!==flowDrag.pointerId)return;applyFlowSplit(flowDrag.layout,flowDrag.startLeft+e.clientX-flowDrag.startX)});
window.addEventListener('pointerup',e=>{if(flowDrag&&e.pointerId===flowDrag.pointerId)finishFlowResize()});
window.addEventListener('pointercancel',e=>{if(flowDrag&&e.pointerId===flowDrag.pointerId)finishFlowResize()});
window.addEventListener('blur',finishFlowResize);
$('#viewer').addEventListener('close',finishFlowResize);
window.addEventListener('resize',syncFlowSplitter);
$('#flowPane').addEventListener('lostpointercapture',()=>finishFlowResize());
$('#flowPane').addEventListener('dblclick',e=>{if(e.target.closest('[data-flow-resizer]'))resetFlowSplit()});
$('#flowPane').addEventListener('keydown',e=>{
 const splitter=e.target.closest('[data-flow-resizer]');if(!splitter||!splitter.getClientRects().length)return;
 if(!['ArrowLeft','ArrowRight','Home','End','Enter'].includes(e.key))return;
 e.preventDefault();if(e.key==='Enter'){resetFlowSplit();return}
 const layout=splitter.parentElement,bounds=flowSplitBounds(layout.getBoundingClientRect().width),current=layout.querySelector('.flow-canvas').getBoundingClientRect().width;
 const left=e.key==='Home'?bounds.min:e.key==='End'?bounds.max:current+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?40:10);
 applyFlowSplit(layout,left);persistFlowSplit();
});

function renderWorkspacePicker(){
 $('#currentWorkspaceName').textContent=state.workspace.name;
 $('#workspaceMenu').innerHTML=state.workspaces.map(w=>`<button type="button" role="option" tabindex="-1" aria-selected="${w.id===state.workspace.id}" data-workspace="${esc(w.id)}"><span class="workspace-option-text"><strong>${esc(w.name)}</strong><small>${esc(w.directory)}</small></span><span class="workspace-check" aria-hidden="true">${w.id===state.workspace.id?'✓':''}</span></button>`).join('');
}
function closeWorkspaceMenu(restoreFocus=false){$('#workspaceMenu').hidden=true;$('#workspaceSelect').setAttribute('aria-expanded','false');if(restoreFocus)$('#workspaceSelect').focus()}
function toggleWorkspaceMenu(){if($('#workspaceSelect').disabled)return;const open=$('#workspaceMenu').hidden;$('#workspaceMenu').hidden=!open;$('#workspaceSelect').setAttribute('aria-expanded',String(open));if(open){const items=[...document.querySelectorAll('#workspaceMenu [role="option"]')];(items.find(b=>b.getAttribute('aria-selected')==='true')||items[0])?.focus()}}
$('#workspaceMenu').onclick=protect(async e=>{const option=e.target.closest('[data-workspace]');if(!option)return;closeWorkspaceMenu(true);await switchWorkspace(option.dataset.workspace)});
$('#workspaceSelect').addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if($('#workspaceMenu').hidden)toggleWorkspaceMenu()}if(e.key==='Escape')closeWorkspaceMenu(true)});
$('#workspaceMenu').addEventListener('keydown',e=>{const items=[...document.querySelectorAll('#workspaceMenu [role="option"]')],index=items.indexOf(document.activeElement);let next;if(e.key==='ArrowDown')next=(index+1)%items.length;if(e.key==='ArrowUp')next=(index-1+items.length)%items.length;if(e.key==='Home')next=0;if(e.key==='End')next=items.length-1;if(next!==undefined){e.preventDefault();items[next]?.focus()}if(e.key==='Escape'){e.preventDefault();closeWorkspaceMenu(true)}});
document.addEventListener('click',e=>{if(!e.target.closest('.workspace-picker'))closeWorkspaceMenu()});
document.addEventListener('focusin',e=>{if(!e.target.closest('.workspace-picker'))closeWorkspaceMenu()});
let creatingWorkspace=false;
function showWorkspaceSettings(create){creatingWorkspace=create;$('#settingsTitle').textContent=create?'新建工作空间':'工作空间设置';$('#workspaceName').value=create?'':state.workspace.name;$('#directory').value=create?'':state.directory;const defaults=create?{check:true}:state.workspace.defaults;for(const [key,id] of Object.entries({inventory:'Inventory',limit:'Limit',tags:'Tags',extra:'Extra'}))$('#default'+id).value=defaults[key]||'';$('#defaultCheck').checked=defaults.check;$('#settings').showModal()}
async function switchWorkspace(id){if(!canLeave())return;clearTimeout(polling);await load(id);for(const dialog of ['viewer','execute'])$('#'+dialog).close();asset=null;selected=null;$('#search').value='';renderFiles()}
async function start(){
 $('#loadError').hidden=true;$('#settingsButton').disabled=true;$('#newWorkspace').disabled=true;$('#workspaceSelect').disabled=true;
 try{
  let id;try{id=localStorage.getItem('playbookWorkspace')}catch{}
  try{await load(id||null)}catch(e){if(id&&e.status===400)await load(null);else throw e}
 }catch(e){$('#loadErrorMessage').textContent=e.message;$('#loadError').hidden=false;}
}
$('#retryLoad').onclick=start;
start();
