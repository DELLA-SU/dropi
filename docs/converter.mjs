import { PDFDocument } from './vendor/pdf-lib.mjs';
import { zipSync } from './vendor/fflate.mjs';

export const LIMITS = { file: 100 * 1024 * 1024, total: 200 * 1024 * 1024, pixels: 16_000_000, pages: 200, files: 100 };
const levels = { quality: { q: .86, pixels: 4000 }, balanced: { q: .72, pixels: 2400 }, small: { q: .5, pixels: 1440 } };
const pdfModes = new Set(['merge', 'split', 'extract', 'compress-pdf']);
const imageExt = /\.(png|jpe?g|webp|bmp|avif|heic|heif|tiff?)$/i;
const stem = name => name.replace(/\.[^.]*$/, '') || 'file';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function check(signal) { if (signal?.aborted) throw new DOMException('작업을 취소했어요.', 'AbortError'); }
export function validateFiles(files, mode) {
  if (!files.length) throw new Error('파일을 선택해 주세요.');
  if (files.length > LIMITS.files) throw new Error('한 번에 100개까지 처리할 수 있어요.');
  if (files.some(f => f.size > LIMITS.file) || files.reduce((n, f) => n + f.size, 0) > LIMITS.total) throw new Error('웹에서는 파일당 100MB, 한 번에 총 200MB까지 처리할 수 있어요. 큰 파일은 Mac 앱을 이용해 주세요.');
  for (const f of files) {
    if (pdfModes.has(mode) ? !/\.pdf$/i.test(f.name) : !imageExt.test(f.name)) throw new Error(`${f.name}: ${pdfModes.has(mode) ? 'PDF' : 'PNG·JPG·WebP·BMP·AVIF·HEIC·TIFF 이미지'} 파일을 선택해 주세요.`);
    if (!f.size) throw new Error(`${f.name}: 비어 있는 파일이에요.`);
  }
  if (mode === 'merge' && files.length < 2) throw new Error('합칠 PDF를 2개 이상 선택해 주세요.');
}
function canvas(w, h) {
  if (!w || !h || w * h > LIMITS.pixels || w > 16384 || h > 16384) throw new Error('이 이미지는 웹 처리 한도(1,600만 픽셀)를 넘어가요. Mac 앱을 이용해 주세요.');
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
function blob(c, type = 'image/png', quality = .95) {
  return new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error('이미지 저장에 실패했어요.')), type, quality));
}
const scripts = new Map();
function script(path) {
  if (!scripts.has(path)) scripts.set(path, new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = new URL(path, import.meta.url).href; s.onload = resolve; s.onerror = () => { scripts.delete(path); reject(new Error('변환 도구를 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')); }; document.head.append(s);
  }));
  return scripts.get(path);
}
async function nativeDecode(file) {
  if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {} }
  const url = URL.createObjectURL(file);
  try { return await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = url; }); }
  finally { URL.revokeObjectURL(url); }
}
async function decode(file) {
  if (/\.tiff?$/i.test(file.name)) {
    await script('./vendor/pako.js'); await script('./vendor/utif.js');
    const bytes = await file.arrayBuffer(), pages = globalThis.UTIF.decode(bytes);
    if (pages.length !== 1) throw new Error('여러 페이지 TIFF는 웹에서 지원하지 않아요. Mac 앱을 이용해 주세요.');
    const page = pages[0];
    if ((page.t256?.[0] || 0) * (page.t257?.[0] || 0) > LIMITS.pixels) throw new Error('이 TIFF는 웹 이미지 크기 한도를 넘어가요.');
    globalThis.UTIF.decodeImage(bytes, page); const c = canvas(page.width, page.height);
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(globalThis.UTIF.toRGBA8(page)), page.width, page.height), 0, 0); return c;
  }
  try { return await nativeDecode(file); }
  catch {
    if (/\.hei[cf]$/i.test(file.name)) {
      try { const { heicTo } = await import('./vendor/heic-to.mjs'); return await nativeDecode(await heicTo({ blob: file, type: 'image/png' })); }
      catch { throw new Error(`${file.name}: 이 HEIC 사진을 읽지 못했어요. 손상 여부를 확인하거나 Mac 앱을 이용해 주세요.`); }
    }
    throw new Error(`${file.name}: 이미지를 읽지 못했어요. 손상되었거나 이 브라우저에서 지원하지 않는 형식이에요.`);
  }
}
async function imageCanvas(file, maxPixels = Infinity) {
  const image = await decode(file);
  try {
    const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
    const scale = Math.min(1, maxPixels / Math.max(w, h));
    const c = canvas(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
    c.getContext('2d').drawImage(image, 0, 0, c.width, c.height); return c;
  } finally { image.close?.(); }
}
function alpha(c) {
  const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) return true;
  return false;
}
function white(c) {
  const out = canvas(c.width, c.height), ctx = out.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height); ctx.drawImage(c, 0, 0); return out;
}
async function targetJPEG(c, limit, q, signal) {
  if (!limit) return blob(c, 'image/jpeg', q);
  let low = .03, high = .98, best, smallest;
  for (let i = 0; i < 10; i++) {
    check(signal); const quality = i === 0 ? .03 : i === 1 ? .98 : (low + high) / 2;
    const b = await blob(c, 'image/jpeg', quality);
    if (!smallest || b.size < smallest.size) smallest = b;
    if (b.size <= limit) { if (!best || b.size > best.size) best = b; low = quality; if (i === 1) break; } else high = quality;
    if (!i) high = .98;
    await tick();
  }
  return best || smallest;
}
export function encodeTIFF(rgba, w, h) {
  const n = 14, bits = 8 + 2 + n * 12 + 4, xres = bits + 8, yres = xres + 8, offset = yres + 8;
  const bytes = new Uint8Array(offset + rgba.length), view = new DataView(bytes.buffer);
  bytes.set([73, 73, 42, 0, 8, 0, 0, 0]); view.setUint16(8, n, true);
  const tags = [[256,4,1,w],[257,4,1,h],[258,3,4,bits],[259,3,1,1],[262,3,1,2],[273,4,1,offset],[274,3,1,1],[277,3,1,4],[278,4,1,h],[279,4,1,rgba.length],[282,5,1,xres],[283,5,1,yres],[296,3,1,2],[338,3,1,2]];
  tags.forEach(([tag, type, count, value], i) => { const p = 10 + i * 12; view.setUint16(p, tag, true); view.setUint16(p+2, type, true); view.setUint32(p+4, count, true); if (type === 3 && count === 1) view.setUint16(p+8, value, true); else view.setUint32(p+8, value, true); });
  for (let i=0;i<4;i++) view.setUint16(bits+i*2,8,true);
  for (const p of [xres,yres]) { view.setUint32(p,72,true); view.setUint32(p+4,1,true); }
  bytes.set(rgba,offset); return new Blob([bytes],{type:'image/tiff'});
}
async function loadPDF(file) {
  try {
    const d = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
    if (!d.getPageCount() || d.getPageCount() > LIMITS.pages) throw new Error('PDF는 1~200페이지까지 처리할 수 있어요.'); return d;
  } catch (e) { if (/encrypt|password/i.test(String(e))) throw new Error('암호로 잠긴 PDF는 웹에서 처리할 수 없어요. 잠금을 해제한 사본을 선택해 주세요.'); if (/200페이지/.test(e.message)) throw e; throw new Error(`${file.name}: PDF를 읽지 못했어요. 손상 여부를 확인해 주세요.`); }
}
async function renderer(file) {
  const lib = await import('./vendor/pdf.mjs'); lib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
  const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, cMapUrl: new URL('./vendor/cmaps/', import.meta.url).href, cMapPacked: true, standardFontDataUrl: new URL('./vendor/standard_fonts/', import.meta.url).href, wasmUrl: new URL('./vendor/wasm/', import.meta.url).href });
  task.onPassword = () => task.destroy();
  try { const pdf = await task.promise; if (pdf.numPages > LIMITS.pages) { await pdf.destroy(); throw new Error('PDF는 200페이지까지 처리할 수 있어요.'); } return pdf; }
  catch (e) { await task.destroy(); throw new Error(`PDF를 렌더링하지 못했어요. 암호 잠금·손상 여부를 확인해 주세요. ${/200페이지/.test(e.message)?e.message:''}`); }
}
async function renderPage(pdf, index, scale, signal) {
  check(signal); const page = await pdf.getPage(index), base = page.getViewport({scale:1});
  const max = Math.min(scale, Math.sqrt(LIMITS.pixels/(base.width*base.height)), 16384/Math.max(base.width,base.height));
  const vp = page.getViewport({scale:max}); const c = canvas(Math.ceil(vp.width),Math.ceil(vp.height));
  const task = page.render({ canvasContext:c.getContext('2d'), viewport:vp, background:'#fff' });
  const cancel = () => task.cancel(); signal?.addEventListener('abort',cancel,{once:true});
  try { await task.promise; return {c,base}; } finally { signal?.removeEventListener('abort',cancel); page.cleanup(); }
}
export async function convertFiles(files, mode, options = {}, progress = () => {}) {
  validateFiles(files,mode); const {signal} = options; check(signal);
  const setting = levels[options.targetBytes ? 'balanced' : options.level || 'balanced']; const keep = options.keepResolution !== false;
  const results = [], used = new Set(); let outputBytes = 0;
  function add(name, b, original) {
    if (outputBytes + b.size > LIMITS.total) throw new Error('웹 결과 용량 한도(200MB)를 넘어가요. 파일을 나눠 처리해 주세요.'); outputBytes += b.size;
    let unique = name, i=2; while(used.has(unique)) { const p=name.lastIndexOf('.'); unique=`${name.slice(0,p)} (${i++})${name.slice(p)}`; } used.add(unique);
    results.push({name:unique,blob:b,inputSize:original?.size,missed:!!options.targetBytes && b.size>options.targetBytes});
  }
  if (mode === 'pdf' || mode === 'merge') {
    const out = await PDFDocument.create();
    for (const [index,file] of files.entries()) {
      check(signal); progress(index,files.length,file.name); await tick();
      if (mode === 'merge') { const d=await loadPDF(file); if(out.getPageCount()+d.getPageCount()>LIMITS.pages)throw new Error('합친 PDF는 200페이지까지 만들 수 있어요.'); const pages=await out.copyPages(d,d.getPageIndices()); pages.forEach(p=>out.addPage(p)); }
      else { const c=await imageCanvas(file), bytes=new Uint8Array(await (await blob(c)).arrayBuffer()); const image=await out.embedPng(bytes); const page=out.addPage([c.width*.75,c.height*.75]);page.drawImage(image,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});c.width=c.height=1; }
    }
    check(signal);add(files.length===1?`${stem(files[0].name)}.pdf`:mode==='merge'?'합친 문서.pdf':'이미지 모음.pdf',new Blob([await out.save()],{type:'application/pdf'}));
  } else for (const [index,file] of files.entries()) {
    check(signal); progress(index,files.length,file.name); await tick(); const name=stem(file.name);
    if (['jpg','png','tiff','compress-image'].includes(mode)) {
      const c=await imageCanvas(file,mode==='compress-image'&&!keep?setting.pixels:Infinity); let b,ext;
      if(mode==='tiff'){b=encodeTIFF(c.getContext('2d').getImageData(0,0,c.width,c.height).data,c.width,c.height);ext='tiff';}
      else if(mode==='jpg'){b=await blob(white(c),'image/jpeg',.95);ext='jpg';}
      else if(mode==='png'){b=await blob(c);ext='png';}
      else { const transparent=alpha(c);ext=transparent?'png':'jpg';b=transparent?await blob(c):await targetJPEG(c,options.targetBytes,setting.q,signal);if(b.size>=file.size){b=file;ext=file.name.split('.').pop();} }
      add(`${name}${mode==='compress-image'?'_압축':''}.${ext}`,b,file);c.width=c.height=1;
    } else if(mode==='split') {
      const d=await loadPDF(file); if(results.length+d.getPageCount()>300)throw new Error('출력은 한 번에 300개까지 만들 수 있어요.');
      for(let i=0;i<d.getPageCount();i++){check(signal);const out=await PDFDocument.create();out.addPage((await out.copyPages(d,[i]))[0]);add(`${name}_${String(i+1).padStart(3,'0')}.pdf`,new Blob([await out.save()],{type:'application/pdf'}));await tick();}
    } else if(mode==='extract'||mode==='compress-pdf') {
      if(mode==='compress-pdf'&&keep){const d=await loadPDF(file);const b=new Blob([await d.save({useObjectStreams:true})],{type:'application/pdf'});add(`${name}_압축.pdf`,b.size<file.size?b:file,file);continue;}
      const pdf=await renderer(file);
      try {
        if(mode==='extract'&&results.length+pdf.numPages>300)throw new Error('출력은 한 번에 300개까지 만들 수 있어요.');
        const out=mode==='compress-pdf'?await PDFDocument.create():null;
        for(let i=1;i<=pdf.numPages;i++){check(signal);progress(index,files.length,`${file.name} · ${i}/${pdf.numPages}페이지`);const {c,base}=await renderPage(pdf,i,mode==='extract'?2:({quality:2,balanced:1.5,small:1}[options.targetBytes?'balanced':options.level||'balanced']),signal);
          if(out){const im=await out.embedJpg(new Uint8Array(await (await blob(c,'image/jpeg',setting.q)).arrayBuffer()));const p=out.addPage([base.width,base.height]);p.drawImage(im,{x:0,y:0,width:base.width,height:base.height});}
          else {const ext=options.extractFormat==='jpg'?'jpg':'png';add(`${name}_${String(i).padStart(3,'0')}.${ext}`,await blob(c,ext==='jpg'?'image/jpeg':'image/png',.95));} c.width=c.height=1;await tick();}
        if(out){const b=new Blob([await out.save()],{type:'application/pdf'});add(`${name}_압축.pdf`,b.size<file.size?b:file,file);}
      } finally {await pdf.destroy();}
    } else throw new Error('지원하지 않는 작업이에요.');
  }
  check(signal);progress(files.length,files.length,'완료');return results;
}
export async function zipResults(results) {
  const entries=Object.create(null);
  for(const r of results)entries[r.name.replace(/[\\/]/g,'_')]=new Uint8Array(await r.blob.arrayBuffer());
  return new Blob([zipSync(entries,{level:0})],{type:'application/zip'});
}
