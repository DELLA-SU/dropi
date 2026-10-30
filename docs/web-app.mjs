import { convertFiles, zipResults, validateFiles } from './converter.mjs';
const tool=document.getElementById('web-tool'), tabs=[...tool.querySelectorAll('[data-tab]')];
const status=document.getElementById('web-status'), input=document.getElementById('file-input');
const titles={pdf:'PDF 만들기',jpg:'JPG 변환',png:'PNG 변환',merge:'PDF 합치기',split:'PDF 나누기',extract:'PDF → 이미지','compress-image':'이미지 압축','compress-pdf':'PDF 압축'};
let busy=false,mode='pdf',controller,results=[],urls=[],queue=[],queueMode,resultAction;
function track(event,detail={}){try{document.dispatchEvent(new CustomEvent('dropi:analytics',{detail:{event,...detail}}));}catch{}}
const fmt=n=>n<1e6?`${(n/1000).toFixed(1)}KB`:`${(n/1e6).toFixed(2)}MB`;
function message(text,error=false){status.hidden=false;status.textContent=text;status.classList.toggle('is-error',error);status.setAttribute('role',error?'alert':'status');}
function release(){urls.forEach(u=>URL.revokeObjectURL(u));urls=[];results=[];document.getElementById('web-results').hidden=true;document.getElementById('result-list').replaceChildren();}
function lock(value){busy=value;tool.querySelectorAll('button,input,select,summary').forEach(el=>{if(el.id!=='cancel-work'&&el.id!=='compression-help')el.disabled=value;});document.getElementById('cancel-work').hidden=!value;tool.setAttribute('aria-busy',String(value));}
function options(){
 const raw=document.getElementById('target-size').value.trim(),unit=document.getElementById('target-unit').value;
 const targetBytes=raw?Number(raw)*(unit==='MB'?1e6:1e3):undefined;
 if(raw&&(!Number.isFinite(targetBytes)||targetBytes<1||targetBytes>200e6))throw new Error('목표 용량은 1바이트~200MB 범위의 양수로 입력해 주세요.');
 return {level:document.getElementById('compression-level').value,keepResolution:document.getElementById('keep-resolution').checked,targetBytes,signal:controller.signal};
}
function updateOptions(){
 const compress=tabs[1].getAttribute('aria-selected')==='true',target=document.getElementById('target-size').value.trim()!=='';
 document.getElementById('compression-control').hidden=!compress||target;
 document.getElementById('auto-compression').hidden=!compress||!target;
 document.getElementById('pdf-web-note').textContent=document.getElementById('keep-resolution').checked?'PDF는 구조를 유지하며 최적화해요. 이미 압축된 파일은 더 줄지 않을 수 있어요.':'PDF는 페이지를 이미지로 저장해요. 텍스트 선택·검색, 링크·양식이 사라져요.';
}
function selectTab(name,focus=false){if(busy)return;tabs.forEach(t=>{const on=t.dataset.tab===name;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1;if(on&&focus)t.focus();});tool.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==name);document.getElementById('compression-settings').hidden=name!=='compress';document.getElementById('drop-label').hidden=name==='compress';document.getElementById('pdf-web-note').hidden=name!=='compress';closeHelp();updateOptions();}
tabs.forEach((tab,i)=>{tab.addEventListener('click',()=>selectTab(tab.dataset.tab));tab.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();selectTab(tabs[e.key==='Home'?0:e.key==='End'?1:1-i].dataset.tab,true);}});});tabs[1].tabIndex=-1;
function closeHelp(){document.getElementById('compression-help-info').hidden=true;document.getElementById('compression-help').setAttribute('aria-expanded','false');}
document.getElementById('compression-help').addEventListener('click',()=>{const info=document.getElementById('compression-help-info');info.hidden=!info.hidden;document.getElementById('compression-help').setAttribute('aria-expanded',String(!info.hidden));});
tool.addEventListener('keydown',e=>{if(e.key==='Escape')closeHelp();});
['target-size','keep-resolution'].forEach(id=>document.getElementById(id).addEventListener('input',updateOptions));
document.querySelectorAll('a[href="#compression-guide"]').forEach(a=>a.addEventListener('click',()=>{document.getElementById('compression-guide').open=true;closeHelp();}));
document.getElementById('cancel-work').addEventListener('click',()=>{controller?.abort();message('현재 파일 처리를 마친 뒤 취소해요…');});
function renderResults(){
 const list=document.getElementById('result-list');list.replaceChildren();
 for(const r of results){const row=document.createElement('li'),label=document.createElement('span'),a=document.createElement('a');label.textContent=r.name;const small=document.createElement('small');small.textContent=`${fmt(r.blob.size)}${r.missed?' · 목표 초과':''}`;label.append(small);a.textContent='받기';a.download=r.name;a.href=URL.createObjectURL(r.blob);a.addEventListener('click',()=>track('result_download',{action:resultAction,download_kind:'single',output_count:1}));urls.push(a.href);row.append(label,a);list.append(row);}
 document.getElementById('web-results').hidden=false;document.getElementById('zip-results').hidden=results.length<2;
}
document.getElementById('zip-results').addEventListener('click',async()=>{const b=document.getElementById('zip-results');b.disabled=true;b.textContent='ZIP 만드는 중…';try{const zip=await zipResults(results),url=URL.createObjectURL(zip);urls.push(url);const a=document.createElement('a');a.href=url;a.download='Dropi-results.zip';document.body.append(a);a.click();a.remove();track('result_download',{action:resultAction,download_kind:'zip',output_count:results.length});}catch{message('ZIP 파일을 만들지 못했어요. 개별 받기를 이용해 주세요.',true);}finally{b.disabled=false;b.textContent='모두 ZIP으로 받기';}});
document.getElementById('clear-results').addEventListener('click',()=>{release();status.hidden=true;});
async function run(files,action){
 if(busy)return;controller=new AbortController();
 let opts;try{validateFiles(files,action);opts=action.startsWith('compress')?options():{signal:controller.signal};}catch(e){release();message(e.message,true);return;}
 release();closeHelp();lock(true);track('conversion_start',{action,file_count:files.length});message(`${titles[action]} 준비 중…`);const progress=document.getElementById('web-progress');progress.hidden=false;progress.value=0;
 try{results=await convertFiles(files,action,opts,(done,total,name)=>{progress.value=done/total;message(`${titles[action]} · ${name}`);});
  const before=files.reduce((n,f)=>n+f.size,0),after=results.reduce((n,r)=>n+r.blob.size,0),missed=results.filter(r=>r.missed).length;
  let text=`완료 · ${results.length}개 파일`;
  if(action.startsWith('compress'))text+=after<before?` · ${fmt(before)} → ${fmt(after)}`:' · 원본 크기로 저장';
  if(opts.targetBytes)text+=missed?` · 목표 초과 ${missed}개`:' · 목표 달성';
  resultAction=action;track('conversion_complete',{action,file_count:files.length,output_count:results.length});message(text);renderResults();
 }catch(e){track(e.name==='AbortError'?'conversion_cancel':'conversion_error',{action,file_count:files.length});release();message(e.name==='AbortError'?'취소했어요. 원본 파일은 그대로예요.':e.message||'변환하지 못했어요. 파일을 확인해 주세요.',e.name!=='AbortError');}
 finally{lock(false);progress.hidden=true;}
}
const dialog=document.getElementById('order-dialog');
function renderQueue(){const list=document.getElementById('order-list');list.replaceChildren();queue.forEach((f,i)=>{const row=document.createElement('li'),name=document.createElement('span');name.textContent=`${i+1}. ${f.name}`;row.append(name);for(const [delta,title] of [[-1,'위로'],[1,'아래로']]){const b=document.createElement('button');b.type='button';b.textContent=delta===-1?'↑':'↓';b.setAttribute('aria-label',`${f.name} ${title} 이동`);b.disabled=i+delta<0||i+delta>=queue.length;b.addEventListener('click',()=>{[queue[i],queue[i+delta]]=[queue[i+delta],queue[i]];renderQueue();});row.append(b);}list.append(row);});}
function choose(files,action){if(busy||!files.length)return;try{validateFiles(files,action);}catch(e){release();message(e.message,true);return;}if(['pdf','merge'].includes(action)&&files.length>1){queue=[...files];queueMode=action;renderQueue();dialog.showModal();}else run(files,action);}
document.getElementById('cancel-order').addEventListener('click',()=>dialog.close());
 document.getElementById('start-order').addEventListener('click',()=>{const files=[...queue],action=queueMode;dialog.close();run(files,action);});
 dialog.addEventListener('close',()=>{queue=[];});
tool.querySelectorAll('[data-action]').forEach(button=>{
 button.addEventListener('click',()=>{if(busy)return;mode=button.dataset.action;input.accept=['merge','split','extract','compress-pdf'].includes(mode)?'.pdf,application/pdf':'.png,.jpg,.jpeg,.webp,.bmp,.avif,.heic,.heif,.tif,.tiff';input.value='';input.click();});
 button.addEventListener('dragover',e=>{e.preventDefault();if(!busy){e.dataTransfer.dropEffect='copy';button.classList.add('drop-active');}});
 button.addEventListener('dragleave',e=>{if(!button.contains(e.relatedTarget))button.classList.remove('drop-active');});
 button.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();button.classList.remove('drop-active');choose([...e.dataTransfer.files],button.dataset.action);});
});
input.addEventListener('change',()=>choose([...input.files],mode));
document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});document.addEventListener('drop',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();if(!e.target.closest('[data-action]'))message('원하는 작업 칸에 파일을 놓아 주세요.');}});
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});window.addEventListener('pagehide',e=>{if(!e.persisted)urls.forEach(u=>URL.revokeObjectURL(u));});
lock(false);status.hidden=true;updateOptions();
