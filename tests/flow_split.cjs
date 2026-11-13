const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements=new Map(),windowEvents=new Map(),storage=new Map(),classes=new Set();
function element(key){if(!elements.has(key))elements.set(key,{value:'',style:{},events:new Map(),addEventListener(type,fn){const callbacks=this.events.get(type)||[];callbacks.push(fn);this.events.set(type,callbacks)},setAttribute(){},focus(){}});return elements.get(key)}
const context=vm.createContext({document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){},body:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}}},window:{addEventListener(type,fn){windowEvents.set(type,fn)}},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},console});
vm.runInContext(fs.readFileSync('static/app.js','utf8').replace('start();\n',''),context);
let layoutWidth=1000,leftWidth=400,captured=false;
const attributes=new Map(),properties=new Map();
const canvas={getBoundingClientRect:()=>({width:leftWidth})};
const splitter={dataset:{},getClientRects:()=>[{}],setAttribute:(k,v)=>attributes.set(k,v),focus(){},setPointerCapture(){captured=true},hasPointerCapture:()=>captured,releasePointerCapture(){captured=false}};
const layout={getBoundingClientRect:()=>({width:layoutWidth}),querySelector:()=>canvas,style:{setProperty(k,v){properties.set(k,v);const percent=Number(v.match(/calc\(([\d.]+)%/)[1])/100;leftWidth=percent*(layoutWidth-12)},removeProperty(k){properties.delete(k);leftWidth=400}}};
splitter.parentElement=layout;
element('#flowPane').querySelector=selector=>selector==='.flow-layout'?layout:selector==='[data-flow-resizer]'?splitter:null;
const target={closest:()=>splitter};
function dispatch(type,values={}){const event={target,button:0,pointerId:1,clientX:400,preventDefault(){},...values};for(const fn of element('#flowPane').events.get(type)||[])fn(event)}
vm.runInContext('syncFlowSplitter()',context);
assert.equal(attributes.get('aria-valuenow'),'40');
dispatch('pointerdown');assert.equal(captured,true);assert.ok(classes.has('flow-resizing'));
windowEvents.get('pointermove')({pointerId:1,clientX:550});assert.equal(Math.round(leftWidth),550);
windowEvents.get('pointerup')({pointerId:1});assert.equal(captured,false);assert.equal(classes.has('flow-resizing'),false);
assert.ok(Math.abs(Number(storage.get('playbookFlowSplit'))-550/988)<.001);
assert.match(attributes.get('aria-valuetext'),/流程图 56%，节点参数 44%/);
dispatch('keydown',{key:'Home'});assert.equal(Math.round(leftWidth),280);
dispatch('keydown',{key:'End'});assert.equal(Math.round(leftWidth),708);
dispatch('keydown',{key:'ArrowLeft',shiftKey:true});assert.equal(Math.round(leftWidth),668);
dispatch('keydown',{key:'ArrowRight',shiftKey:false});assert.equal(Math.round(leftWidth),678);
assert.equal(vm.runInContext('flowSplitRatio(1000,-100)',context),280/988);
assert.equal(vm.runInContext('flowSplitRatio(1000,2000)',context),708/988);
assert.match(vm.runInContext('flowSplitStyle()',context),/--flow-left-width:calc/);
dispatch('dblclick');assert.equal(storage.has('playbookFlowSplit'),false);assert.equal(properties.has('--flow-left-width'),false);
dispatch('pointerdown');windowEvents.get('pointercancel')({pointerId:1});assert.equal(classes.has('flow-resizing'),false);
dispatch('pointerdown');windowEvents.get('blur')();assert.equal(classes.has('flow-resizing'),false);
// Pointer events from another pointer must not change the active drag.
dispatch('pointerdown');const current=leftWidth;windowEvents.get('pointermove')({pointerId:2,clientX:999});assert.equal(leftWidth,current);windowEvents.get('pointerup')({pointerId:1});
console.log('Flow splitter passed: pointer dragging, min widths, keyboard, persistence, reset and cancellation');
