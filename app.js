
const $ = s => document.querySelector(s);
import { predictMolecule } from './client.js';
import { adaptResponse } from './adapter.js';
const HC = 1239.841984;
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let LAST = null, XYZ = null, FNAME = null, chargeTouched = false;
let SPEC_LO = 150, SPEC_HI = 1200, NST = 30, VIEW = 'spec', UNITS = 'nm';

/* ---------- theme ---------- */
const SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.4"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/></svg>';
const MOON = '<svg viewBox="0 0 24 24"><path d="M20.4 14.2A8.6 8.6 0 0 1 9.8 3.6a8.6 8.6 0 1 0 10.6 10.6z"/></svg>';
function applyTheme(t){
  document.documentElement.dataset.theme = t;
  $('#themebtn').innerHTML = t === 'dark' ? SUN : MOON;
  try{ localStorage.setItem('tmc_theme', t); }catch(_){}
  if (LAST){ drawPlot(LAST); renderTiles(LAST); }
}
applyTheme((() => {
  try{ const s = localStorage.getItem('tmc_theme'); if (s) return s; }catch(_){}
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
})());
$('#themebtn').addEventListener('click', () =>
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
function chrome(){
  const dark = document.documentElement.dataset.theme === 'dark';
  return dark
    ? {surface:'#1a1a19', ink:'#ffffff', ink2:'#c3c2b7', muted:'#898781',
       grid:'#2c2c2a', axis:'#383835', s1:'#3987e5', s2:'#199e70',
       s1rgb:'57,135,229', s2rgb:'25,158,112', shade:.08}
    : {surface:'#fcfcfb', ink:'#0b0b0b', ink2:'#52514e', muted:'#898781',
       grid:'#e1e0d9', axis:'#c3c2b7', s1:'#2a78d6', s2:'#1baf7a',
       s1rgb:'42,120,214', s2rgb:'27,175,122', shade:.045};
}

/* Input is staged locally; a single explicit Predict submits it. */
const drop = $('#drop'), fileIn = $('#file');
let busy = false;
drop.addEventListener('click', () => { if (!busy) fileIn.click(); });
drop.addEventListener('keydown', e => {if (e.key==='Enter'||e.key===' ') {e.preventDefault(); if(!busy) fileIn.click();}});
['dragover','dragenter'].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.add('hover');}));
['dragleave','drop'].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.remove('hover');}));
drop.addEventListener('drop', e=>{if(!busy&&e.dataTransfer.files[0])loadFile(e.dataTransfer.files[0]);});
fileIn.addEventListener('change',()=>{if(!busy&&fileIn.files[0])loadFile(fileIn.files[0]);});
function stage(text,name){
  if (busy) return;
  XYZ=text; FNAME=name; LAST=null;
  $('#xyz-input').value=text; $('#results').classList.add('hidden');
  $('#rerun').disabled=false; $('#banners').innerHTML='';
  setStatus(name+' loaded. Set its formal charge, then press Predict.');
}
async function loadFile(f){
  if(f.size>100000){banner('error','Please use one XYZ file smaller than 100 kB.');return;}
  stage(await f.text(),f.name);
}
$('#use-xyz').addEventListener('click',()=>stage($('#xyz-input').value,'pasted.xyz'));
$('#example').addEventListener('click',async()=>{
  try{const r=await fetch('./example.xyz');if(!r.ok)throw Error('Example unavailable');stage(await r.text(),'example.xyz');$('#charge').value='0';}
  catch(e){banner('error',e.message);}
});
function invalidate(){LAST=null;$('#results').classList.add('hidden');setStatus('Inputs changed. Press Predict to update results.');}
$('#charge').addEventListener('change',invalidate);
$('#model').addEventListener('change',()=>{invalidate();$('#geometry-note').textContent=$('#model').value==='xtb'?'Supply GFN2-xTB-optimized coordinates. This choice does not optimize the structure.':'Supply a DFT-optimized geometry. This choice does not optimize the structure.';});
$('#rerun').addEventListener('click',predict);
function setStatus(t){$('#status').textContent=t;}
async function predict(){
  if(!XYZ||busy)return;
  busy=true; $('#banners').innerHTML=''; $('#results').classList.add('hidden');
  for(const id of ['rerun','model','charge','example','use-xyz','file','xyz-input'])$('#'+id).disabled=true;
  try{
    const charge=Number($('#charge').value);
    if(![-1,0,1].includes(charge))throw Error('Formal charge must be −1, 0 or +1.');
    const raw=await predictMolecule({xyz:XYZ,id:FNAME.slice(0,128),charge,model:$('#model').value==='xtb'?'tmqmg-painn-3d-xtb':'tmqmg-painn-3d'},setStatus);
    const d=adaptResponse(raw,XYZ,FNAME); LAST=d; render(d);
    $('#api-provenance').textContent=JSON.stringify({model:raw.model,version:raw.model_version,ensemble:raw.ensemble,provenance:raw.provenance},null,2);
    setStatus('Done — '+FNAME);
  }catch(e){LAST=null;banner('error',e.message);setStatus('Prediction unavailable.');}
  finally{busy=false;for(const id of ['rerun','model','charge','example','use-xyz','file','xyz-input'])$('#'+id).disabled=false;}
}

function banner(level, text){
  const b = document.createElement('div');
  b.className = 'banner ' + level; b.textContent = text;
  $('#banners').appendChild(b);
}

/* ---------- render ---------- */
function render(d){
  $('#results').classList.remove('hidden');
  d.warnings.forEach(w => banner(w.level === 'error' ? 'error' : 'warn', w.text));

  const m = d.molecule;
  $('#molbar').innerHTML = [
    ['File', esc(m.filename)], ['Formula', esc(m.formula)], ['Atoms', m.n_atoms],
    ['Metal', m.metal ?? '—'], ['Charge', (m.charge>0?'+':'')+m.charge],
    ['Elements', esc(m.elements.join(' '))]
  ].map(([k,v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');

  renderTiles(d);
  drawStructure(XYZ, m);
  drawPlot(d);
  renderPeaks(d); renderCT(d); renderNTO(d); renderShift(d); renderConf(d);
  renderStates(d);
  $('#modelcard').innerHTML =
    `<b>Model:</b> ${esc(d.model.name)} &middot; ${esc(d.model.inputs)} &middot; ` +
    `reference: ${esc(d.model.reference)}.<br>${esc(d.model.note)} ` +
    `${esc(d.model.calibration)}`;
}

const fmt = (x, n=2) => (x==null || !isFinite(x)) ? '—' : Number(x).toFixed(n);
const SOLV_LABEL = {gasphase:'Gas-Phase', acetone:'Acetone'};

/* ---------- stat tiles ---------- */
function renderTiles(d){
  const gv = d.gasphase.peaks.vis, av = d.acetone.peaks.vis;
  const t1 = gv.exists
    ? `<div class="tv">${fmt(gv.lambda_max_nm,0)} <small>nm</small></div>
       <div class="ts">${fmt(gv.E_max_eV)} eV &middot; f<sub>max</sub> ${fmt(gv.f_max,3)}</div>`
    : `<div class="tv">—</div><div class="ts">visible band not predicted present</div>`;

  const s = d.shift;
  const t3 = s.lambda_delta_nm == null
    ? `<div class="tv">—</div><div class="ts">requires a predicted visible band in both environments</div>`
    : `<div class="tv">${s.lambda_delta_nm>0?'+':''}${fmt(s.lambda_delta_nm,1)} <small>nm</small></div>
       <div class="ts">${esc(s.direction)} &middot; &Delta;f ${s.f_delta>0?'+':''}${fmt(s.f_delta,3)}</div>`;

  const meanStd = d.gasphase.E_std_eV.reduce((a,b)=>a+b,0)/30;
  const pct = d.ood.percentile_vs_test;
  const lvl = pct==null ? ['—','var(--muted)'] :
    pct>=99 ? ['very high disagreement','var(--critical)'] :
    pct>=90 ? ['elevated uncertainty','var(--warning)'] : ['within reference range','var(--good)'];
  const t4 = `<div class="tv">&plusmn;${fmt(meanStd,3)} <small>eV</small></div>
    <div><span class="statuschip"><i style="background:${lvl[1]}"></i>${lvl[0]}</span></div>
    <div class="ts">${pct==null ? 'No matched disagreement reference' : `Percentile ${fmt(pct,0)} of historical DFT-model disagreement`}</div>`;

  $('#tiles').innerHTML =
    `<div class="tile"><div class="tl">Visible &lambda;<sub>max</sub> — Gas-Phase</div>${t1}</div>` +
    `<div class="tile"><div class="tl">Solvatochromic shift &Delta;&lambda;<sub>max</sub></div>${t3}</div>` +
    `<div class="tile"><div class="tl">Mean state uncertainty</div>${t4}</div>`;
}

/* ---------- 3D structure viewer (custom canvas ball-and-stick) ---------- */
const ELEMS = {  // [color, covalent radius / Å]
  H:['#eef1f4',.31], B:['#f4b8b8',.84], C:['#575c63',.76], N:['#3457d5',.71],
  O:['#e5382c',.66], F:['#7fd13b',.57], Si:['#e8c9a4',1.11], P:['#ef8733',1.07],
  S:['#efd033',1.05], Cl:['#3fc13f',1.02], Br:['#a1443a',1.2], I:['#8f3f97',1.39],
  Se:['#e79a38',1.2], As:['#bd80e3',1.19],
  Sc:['#e6e6e6',1.7], Ti:['#bfc2c7',1.6], V:['#a6a6ab',1.53], Cr:['#8a99c7',1.39],
  Mn:['#9c7ac7',1.5], Fe:['#e06633',1.42], Co:['#f08fa1',1.38], Ni:['#50c964',1.24],
  Cu:['#c87f33',1.32], Zn:['#7d80b0',1.22],
  Y:['#7fe6e6',1.9], Zr:['#94e0e0',1.75], Nb:['#73c2c9',1.64], Mo:['#54b5b5',1.54],
  Tc:['#3b9e9e',1.47], Ru:['#248f8f',1.46], Rh:['#0a7d8c',1.42], Pd:['#0a6985',1.39],
  Ag:['#bfbfc9',1.45], Cd:['#f2c98f',1.44],
  La:['#70d4ff',2.07], Hf:['#4dc2ff',1.75], Ta:['#4da6ff',1.7], W:['#2194d6',1.62],
  Re:['#267dab',1.51], Os:['#266696',1.44], Ir:['#1a5d99',1.41], Pt:['#c9cdd6',1.36],
  Au:['#f7c62e',1.36], Hg:['#b8b8d0',1.32]
};
const EFALL = ['#e06fa4', 1.55];
const hex2rgb = h => [1,3,5].map(i => parseInt(h.slice(i,i+2),16));
const mixc = (a,b,t) => a.map((v,i) => Math.round(v+(b[i]-v)*t));
const css3 = c => `rgb(${c[0]},${c[1]},${c[2]})`;
const rotXm = a => [[1,0,0],[0,Math.cos(a),-Math.sin(a)],[0,Math.sin(a),Math.cos(a)]];
const rotYm = a => [[Math.cos(a),0,Math.sin(a)],[0,1,0],[-Math.sin(a),0,Math.cos(a)]];
const matmul = (A,B) => A.map((r,i) => r.map((_,j) =>
  A[i][0]*B[0][j] + A[i][1]*B[1][j] + A[i][2]*B[2][j]));
const I3 = () => [[1,0,0],[0,1,0],[0,0,1]];

const V = {atoms:null, bonds:null, metal:-1, R:I3(), zoom:1, panX:0, panY:0,
           extent:1, canvas:null, ctx:null, w:0, h:0, proj:null};

function parseXYZ(text){
  const lines = text.trim().split(/\r?\n/);
  const n = parseInt(lines[0]) || 0, atoms = [];
  for (let i = 2; i < lines.length && atoms.length < n; i++){
    const t = lines[i].trim().split(/\s+/);
    if (t.length < 4 || !isFinite(+t[1])) continue;
    const el = t[0][0].toUpperCase() + t[0].slice(1).toLowerCase();
    atoms.push({el, x:+t[1], y:+t[2], z:+t[3]});
  }
  return atoms;
}

function drawStructure(xyz, m){
  if (!V.canvas) initViewer();
  const atoms = parseXYZ(xyz);
  if (!atoms.length) return;
  const n = atoms.length;
  let cx=0, cy=0, cz=0;
  atoms.forEach(a => {cx += a.x; cy += a.y; cz += a.z;});
  atoms.forEach(a => {
    a.x -= cx/n; a.y -= cy/n; a.z -= cz/n;
    const e = ELEMS[a.el] || EFALL;
    a.rgb = hex2rgb(e[0]); a.rc = e[1]; a.rd = 0.3 + 0.22*e[1];
  });
  V.metal = m.metal ? atoms.findIndex(a => a.el === m.metal) : -1;
  if (V.metal >= 0) atoms[V.metal].rd *= 1.3;
  const bonds = [];
  for (let i = 0; i < n; i++) for (let j = i+1; j < n; j++){
    const d = Math.hypot(atoms[i].x-atoms[j].x, atoms[i].y-atoms[j].y, atoms[i].z-atoms[j].z);
    if (d > 0.4 && d < 1.25*(atoms[i].rc + atoms[j].rc)) bonds.push([i,j]);
  }
  if (V.metal >= 0){
    const M = atoms[V.metal];
    atoms.forEach(a => { a.dM = Math.hypot(a.x-M.x, a.y-M.y, a.z-M.z); });
  }
  V.atoms = atoms; V.bonds = bonds;
  V.extent = Math.max(...atoms.map(a => Math.hypot(a.x,a.y,a.z) + a.rd));
  V.R = I3(); V.zoom = 1; V.panX = 0; V.panY = 0;
  fitCanvas(); draw();
}

function initViewer(){
  const box = $('#viewer');
  V.canvas = document.createElement('canvas');
  V.canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:grab';
  box.appendChild(V.canvas);
  V.ctx = V.canvas.getContext('2d');
  let drag = null;
  const hb = $('#hoverbox');
  V.canvas.addEventListener('mousedown', e => {
    drag = {x:e.clientX, y:e.clientY, pan:e.shiftKey || e.button === 2};
    V.canvas.style.cursor = 'grabbing'; hb.style.display = 'none'; e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.pan){ V.panX += dx; V.panY += dy; }
    else V.R = matmul(matmul(rotYm(dx*0.011), rotXm(dy*0.011)), V.R);
    draw();
  });
  window.addEventListener('mouseup', () => { drag = null; if (V.canvas) V.canvas.style.cursor = 'grab'; });
  V.canvas.addEventListener('mousemove', e => {
    if (drag || !V.proj) return;
    const r = V.canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let hit = -1, best = 1e9;
    for (const [x, y, rad, i] of V.proj){
      const d2 = (x-mx)**2 + (y-my)**2;
      if (d2 < (rad+4)**2 && d2 < best){ best = d2; hit = i; }
    }
    if (hit < 0){ hb.style.display = 'none'; return; }
    const a = V.atoms[hit];
    hb.innerHTML = hit === V.metal
      ? `<b>${esc(a.el)}${hit+1}</b> — metal centre`
      : `<b>${esc(a.el)}${hit+1}</b>` + (a.dM != null ? ` — ${a.dM.toFixed(2)} &Aring; from ${esc(V.atoms[V.metal]?.el ?? 'M')}` : '');
    hb.style.display = 'block';
    hb.style.left = (e.clientX+14)+'px'; hb.style.top = (e.clientY+12)+'px';
  });
  V.canvas.addEventListener('mouseleave', () => { if (!drag) hb.style.display = 'none'; });
  V.canvas.addEventListener('wheel', e => {
    e.preventDefault();
    V.zoom = Math.min(20, Math.max(0.1, V.zoom*Math.exp(-e.deltaY*0.0012)));
    draw();
  }, {passive:false});
  V.canvas.addEventListener('dblclick', () => {V.R = I3(); V.zoom = 1; V.panX = 0; V.panY = 0; draw();});
  V.canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('resize', () => { fitCanvas(); draw(); });
}

function fitCanvas(){
  const box = $('#viewer');
  if (!box.clientWidth) return;
  const dpr = window.devicePixelRatio || 1;
  V.w = box.clientWidth; V.h = box.clientHeight;
  V.canvas.width = V.w*dpr; V.canvas.height = V.h*dpr;
  V.ctx.setTransform(dpr,0,0,dpr,0,0);
}

const FOG = [255,255,255];
function sphere(ctx, x, y, r, rgb, t){
  t = Math.min(1, Math.max(0, t));
  const base = mixc(rgb, FOG, t*0.30);
  const g = ctx.createRadialGradient(x-0.38*r, y-0.40*r, r*0.05, x, y, r);
  g.addColorStop(0,    css3(mixc(base, [255,255,255], 0.72)));
  g.addColorStop(0.32, css3(mixc(base, [255,255,255], 0.30)));
  g.addColorStop(0.75, css3(base));
  g.addColorStop(1,    css3(mixc(base, [25,30,45], 0.38)));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 2*Math.PI); ctx.fill();
  ctx.strokeStyle = css3(mixc(base, [25,30,45], 0.55));
  ctx.lineWidth = Math.max(0.75, r*0.05);
  ctx.stroke();
  const sp = ctx.createRadialGradient(x-0.42*r, y-0.46*r, 0, x-0.42*r, y-0.46*r, r*0.3);
  sp.addColorStop(0, `rgba(255,255,255,${0.9 - 0.5*t})`);
  sp.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sp;
  ctx.beginPath(); ctx.arc(x-0.42*r, y-0.46*r, r*0.3, 0, 2*Math.PI); ctx.fill();
}

function bondHalf(ctx, x1, y1, x2, y2, hw, rgb, t){
  const dx = x2-x1, dy = y2-y1, L = Math.hypot(dx,dy);
  if (L < 1e-3) return;
  t = Math.min(1, Math.max(0, t));
  const nx = -dy/L, ny = dx/L;
  const base = mixc(rgb, FOG, t*0.15);
  ctx.lineCap = 'round';
  ctx.strokeStyle = css3(mixc(base, [25,30,45], 0.55));
  ctx.lineWidth = 2*hw + Math.max(1.2, hw*0.35);
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const g = ctx.createLinearGradient(x1+nx*hw, y1+ny*hw, x1-nx*hw, y1-ny*hw);
  g.addColorStop(0,    css3(mixc(base, [255,255,255], 0.22)));
  g.addColorStop(0.35, css3(mixc(base, [255,255,255], 0.45)));
  g.addColorStop(0.7,  css3(base));
  g.addColorStop(1,    css3(mixc(base, [25,30,45], 0.18)));
  ctx.strokeStyle = g; ctx.lineWidth = 2*hw;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
}

function glowHalo(ctx, x, y, r, rgb){
  const g = ctx.createRadialGradient(x, y, r*0.8, x, y, r*2);
  g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.3)`);
  g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r*2, 0, 2*Math.PI); ctx.fill();
}

function drawScene(ctx, w, h, capture){
  if (!V.atoms || !w) return;
  const R = V.R;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  const P = V.atoms.map(a => [
    R[0][0]*a.x + R[0][1]*a.y + R[0][2]*a.z,
    R[1][0]*a.x + R[1][1]*a.y + R[1][2]*a.z,
    R[2][0]*a.x + R[2][1]*a.y + R[2][2]*a.z]);
  const s = V.zoom * 0.46 * Math.min(w,h) / V.extent;
  const X = i => w/2 + V.panX + s*P[i][0];
  const Y = i => h/2 + V.panY - s*P[i][1];
  const zs = P.map(p => p[2]);
  const zmin = Math.min(...zs), zr = Math.max(...zs) - zmin + 1e-6;
  const depth = z => 1 - (z - zmin)/zr;
  const items = [];
  V.atoms.forEach((a,i) => items.push({z:zs[i], a:i}));
  V.bonds.forEach(([i,j]) => {
    const mx = (X(i)+X(j))/2, my = (Y(i)+Y(j))/2, mz = (zs[i]+zs[j])/2;
    items.push({z:(zs[i]+mz)/2 - 0.05, b:[i, mx, my]});
    items.push({z:(zs[j]+mz)/2 - 0.05, b:[j, mx, my]});
  });
  items.sort((p,q) => p.z - q.z);
  for (const it of items){
    if (it.a !== undefined){
      const i = it.a, a = V.atoms[i];
      if (i === V.metal) glowHalo(ctx, X(i), Y(i), s*a.rd, a.rgb);
      sphere(ctx, X(i), Y(i), s*a.rd, a.rgb, depth(zs[i]));
    } else {
      const [i, mx, my] = it.b, a = V.atoms[i];
      const dx = mx - X(i), dy = my - Y(i), L = Math.hypot(dx,dy) || 1;
      const off = Math.min(0.6*s*a.rd, L);
      bondHalf(ctx, X(i)+dx/L*off, Y(i)+dy/L*off, mx, my, s*0.13,
               a.rgb, depth(it.z));
    }
  }
  if (capture) V.proj = V.atoms.map((a,i) => [X(i), Y(i), s*a.rd, i])
                               .sort((p,q) => zs[q[3]] - zs[p[3]]);
}

function draw(){ drawScene(V.ctx, V.w, V.h, true); }

/* ---------- structure image export (PNG / JPEG / PDF) ---------- */
function structureCanvas(scale = 3){
  if (!V.atoms || !V.w) return null;
  const c = document.createElement('canvas');
  c.width = Math.round(V.w*scale); c.height = Math.round(V.h*scale);
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  drawScene(ctx, V.w, V.h, false);
  return c;
}

function dlURL(href, name){
  const a = document.createElement('a');
  a.href = href; a.download = name; a.click();
}

function canvasPDF(c){
  const jpg = atob(c.toDataURL('image/jpeg', 0.95).split(',')[1]);
  const Wpx = c.width, Hpx = c.height;
  const pw = (Wpx*0.75).toFixed(2), ph = (Hpx*0.75).toFixed(2);
  const chunks = []; let pos = 0; const off = [0];
  const put = s => { chunks.push(s); pos += s.length; };
  put('%PDF-1.4\n');
  off[1] = pos; put('1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n');
  off[2] = pos; put('2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n');
  off[3] = pos; put(`3 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${pw} ${ph}]` +
                    `/Resources<</XObject<</Im0 5 0 R>>>>/Contents 4 0 R>>\nendobj\n`);
  const cs = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  off[4] = pos; put(`4 0 obj\n<</Length ${cs.length}>>\nstream\n${cs}\nendstream\nendobj\n`);
  off[5] = pos; put(`5 0 obj\n<</Type/XObject/Subtype/Image/Width ${Wpx}/Height ${Hpx}` +
                    `/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode` +
                    `/Length ${jpg.length}>>\nstream\n`);
  put(jpg); put('\nendstream\nendobj\n');
  const xref = pos;
  put('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) put(String(off[i]).padStart(10,'0') + ' 00000 n \n');
  put(`trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`);
  const bytes = new Uint8Array(pos); let k = 0;
  for (const ch of chunks) for (let i = 0; i < ch.length; i++) bytes[k++] = ch.charCodeAt(i) & 255;
  return new Blob([bytes], {type:'application/pdf'});
}

function saveStructure(fmt){
  const c = structureCanvas(3);
  if (!c) return;
  const base = (FNAME || 'structure').replace(/\.xyz$/i, '') + '_structure';
  if (fmt === 'png') dlURL(c.toDataURL('image/png'), base + '.png');
  else if (fmt === 'jpeg') dlURL(c.toDataURL('image/jpeg', 0.95), base + '.jpg');
  else { const u = URL.createObjectURL(canvasPDF(c)); dlURL(u, base + '.pdf');
         setTimeout(() => URL.revokeObjectURL(u), 5000); }
}
$('#save-png').addEventListener('click', () => saveStructure('png'));
$('#save-jpg').addEventListener('click', () => saveStructure('jpeg'));
$('#save-pdf').addEventListener('click', () => saveStructure('pdf'));

/* ---------- detail cards ---------- */
function renderPeaks(d){
  const rows = ['uv','vis','nir'].map(r => {
    const names = {uv:'UV (<350 nm)', vis:'Visible (350–825 nm)', nir:'nIR (>825 nm)'};
    const cells = ['gasphase','acetone'].map(s => {
      const p = d[s].peaks[r];
      return p.exists
        ? `<td><b>${fmt(p.lambda_max_nm,0)} nm</b> (${fmt(p.E_max_eV)} eV)</td><td>${fmt(p.f_max,3)}</td><td>${fmt(p.broadness_sigma,2)}</td>`
        : `<td colspan="3" style="color:var(--muted);text-align:center">band not predicted present (p = ${fmt(p.presence_probability,2)})</td>`;
    });
    return `<tr><td>${names[r]}</td>${cells[0]}${cells[1]}</tr>`;
  }).join('');
  $('#peaks').innerHTML =
    `<tr><th></th><th colspan="3" class="grp">Gas-Phase</th><th colspan="3" class="grp">Acetone</th></tr>
     <tr><th>region</th><th class="sym">&lambda;<sub>max</sub></th><th class="sym">f<sub>max</sub></th><th class="sym">&sigma;</th>
     <th class="sym">&lambda;<sub>max</sub></th><th class="sym">f<sub>max</sub></th><th class="sym">&sigma;</th></tr>` + rows;
}

function renderCT(d){
  const html = ['gasphase','acetone'].map(s => {
    const c = d[s].ct;
    const note = c.valid ? '' :
      `<div class="muted">no visible band predicted — class not applicable</div>`;
    const rows = Object.entries(c.probs).map(([k,v]) =>
      `<div class="ctrow"><span class="lbl">${esc(k)}</span>
       <span class="bar"><i style="width:${(v*100).toFixed(1)}%;${k===c.top?'':'opacity:.4'}"></i></span>
       <span class="pct">${(v*100).toFixed(0)}%</span></div>`).join('');
    return `<div style="margin-bottom:10px"><b style="font-size:.84rem">${SOLV_LABEL[s]}:
      ${c.valid ? esc(c.top) : '—'}</b>${c.valid ? rows : ''}${note}</div>`;
  }).join('');
  $('#ct').innerHTML = html + `<div class="muted">ddT = metal-centered d–d, LLCT = ligand→ligand,
    MLCT = metal→ligand, LMCT = ligand→metal.</div>`;
}

function renderNTO(d){
  $('#nto').innerHTML = ['gasphase','acetone'].map(s => {
    const n = d[s].nto;
    const mk = (lbl,v) => `<div class="ctrow"><span class="lbl" style="width:120px">${lbl}</span>
      <span class="bar"><i style="width:${(v*100).toFixed(1)}%"></i></span>
      <span class="pct">${(v*100).toFixed(0)}%</span></div>`;
    return `<b style="font-size:.84rem">${SOLV_LABEL[s]}</b>
      ${n.valid ? mk('occupied NTO', n.M_frac_occ)+mk('virtual NTO', n.M_frac_virt) : ''}
      ${n.valid?'':'<div class="muted">no visible band predicted — NTO character not reported</div>'}`;
  }).join('') + `<div class="muted" style="margin-top:6px">Metal fraction of the natural transition orbitals.</div>`;
}

function renderShift(d){
  const s = d.shift;
  if (s.lambda_delta_nm == null){
    $('#shift').innerHTML =
      `<div class="kpi">— <small>&Delta;&lambda;<sub>max</sub></small></div>
       <div class="muted" style="margin-top:6px">Not defined because a visible band was not predicted present in both environments.</div>`;
    return;
  }
  const arrow = s.lambda_delta_nm > 5 ? '&#8600; red' : s.lambda_delta_nm < -5 ? '&#8599; blue' : '&#8596;';
  $('#shift').innerHTML =
    `<div class="kpi">${s.lambda_delta_nm>0?'+':''}${fmt(s.lambda_delta_nm,1)} nm <small>&Delta;&lambda;<sub>max</sub> ${arrow}</small></div>
     <div style="margin-top:6px"><b>${esc(s.direction)}</b></div>
     <div class="muted" style="margin-top:6px">&Delta;f = ${fmt(s.f_delta,3)} (${s.f_delta>0?'hyperchromic':'hypochromic'}) &middot; Gas-Phase &rarr; Acetone, visible-region &lambda;<sub>max</sub></div>`;
}

function renderConf(d){
  const o = d.ood;
  const meanStd = d.gasphase.E_std_eV.reduce((a,b)=>a+b,0)/30;
  const pct = o.percentile_vs_test;
  const level = pct==null ? '' : pct>=99 ? 'very high disagreement' : pct>=90 ? 'elevated' : 'within test-reference range';
  $('#conf').innerHTML =
    `<div class="kpi">&plusmn;${fmt(meanStd,3)} eV <small>mean state uncertainty (recalibrated)</small></div>
     <div style="margin-top:8px"><b>${level || '—'}</b></div>
     <div class="muted" style="margin-top:6px">${pct == null ? 'No matched disagreement reference is supplied for this model.' : `Ensemble disagreement is at percentile ${fmt(pct,0)} of the historical DFT-model test reference, not a validated out-of-domain classification.`}</div>`;
}

function renderStates(d){
  const g = d.gasphase, a = d.acetone;
  let rows = '';
  for (let i=0;i<NST;i++){
    rows += `<tr><td>S${i+1}</td>
      <td>${fmt(g.E_eV[i])} &plusmn; ${fmt(g.E_std_eV[i])}</td><td>${fmt(g.lambda_nm[i],0)}</td><td>${fmt(g.f[i],3)}</td>
      <td>${fmt(a.E_eV[i])} &plusmn; ${fmt(a.E_std_eV[i])}</td><td>${fmt(a.lambda_nm[i],0)}</td><td>${fmt(a.f[i],3)}</td></tr>`;
  }
  $('#stsum').textContent = `— showing S1–S${NST} of 30 (energy-ordered)`;
  $('#states').innerHTML =
    `<tr><th></th><th colspan="3" class="grp">Gas-Phase</th><th colspan="3" class="grp">Acetone</th></tr>
     <tr><th>state</th><th class="sym">E (eV)</th><th class="sym">&lambda; (nm)</th><th class="sym">f</th>
     <th class="sym">E (eV)</th><th class="sym">&lambda; (nm)</th><th class="sym">f</th></tr>` + rows;
}

/* ---------- uncertainty sampling (seeded, cached per prediction) ---------- */
function mulberry32(seed){
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const NSAMP = 36;
function ensureSamples(d){
  if (d._samples) return d._samples;
  const rng = mulberry32(42);
  const gauss = () => {
    const u = Math.max(rng(), 1e-9), v = rng();
    return Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v);
  };
  const out = {};
  for (const s of ['gasphase','acetone']){
    const E = d[s].E_eV, sd = d[s].E_std_eV, S = [];
    for (let k = 0; k < NSAMP; k++)
      S.push(E.map((e,i) => e + sd[i]*gauss()));
    out[s] = S;
  }
  d._samples = out;
  return out;
}

/* ---------- plot dispatch ---------- */
function drawPlot(d){
  if (VIEW === 'spec') drawSpectrum(d); else drawLadder(d);
  $('#speconly').classList.toggle('specdim', VIEW !== 'spec');
  $('#speclegend').style.display = VIEW === 'spec' ? 'flex' : 'none';
  $('#speccap').innerHTML = VIEW === 'spec'
    ? `Drag across the plot to zoom into a custom window &middot; double-click to reset &middot;
       shaded band = illustrative 5th–95th percentile envelope from ${NSAMP} spectra resampled within the recalibrated
       per-state ensemble uncertainty, assuming independent Gaussian errors (not calibrated spectral coverage) &middot; the state slider keeps the lowest N
       energy-ordered states in the curves, sticks, table and CSV.`
    : `Each level is one excited state (thickness &prop; oscillator strength); faint connectors
       track how each state moves from Gas-Phase to Acetone. The strongest visible transition is
       labeled with its &plusmn;&sigma; band; hover any level for E &plusmn;&sigma;, &lambda; and f
       &middot; the state slider applies here too.`;
}

function tickStepNm(range){
  for (const s of [2,5,10,20,25,50,100,200,250]) if (range/s <= 9) return s;
  return 500;
}
function tickStepEv(range){
  for (const s of [0.05,0.1,0.2,0.25,0.5,1,2]) if (range/s <= 9) return s;
  return 2;
}

/* ---------- spectrum ---------- */
function drawSpectrum(d){
  const C = chrome();
  const W=880,H=320,L=56,Rm=16,T=16,B=42, pw=W-L-Rm, ph=H-T-B;
  const lo=SPEC_LO, hi=SPEC_HI;
  const Elo=HC/hi, Ehi=HC/lo;
  const x = UNITS === 'nm'
    ? nm => L + (nm-lo)/(hi-lo)*pw
    : E  => L + (E-Elo)/(Ehi-Elo)*pw;
  const xOf = p => UNITS === 'nm' ? x(p[0]) : x(HC/p[0]);   // p = [nm, I]
  const showG=$('#cb-gas').checked, showA=$('#cb-ace').checked,
        showS=$('#cb-sticks').checked, showB=$('#cb-band').checked;

  const NG = 460;
  const curveOf = E => { // Gaussian-broadened curve for one set of state energies
    const f = curveOf._f, pts = [];
    for (let k=0;k<=NG;k++){
      const Ek = Elo + (Ehi-Elo)*k/NG;
      let I = 0;
      for (let i=0;i<NST;i++) I += f[i]*Math.exp(-((Ek-E[i])**2)/0.08);
      pts.push(I);
    }
    return pts;
  };
  const gridNm = [];
  for (let k=0;k<=NG;k++) gridNm.push(HC/(Elo + (Ehi-Elo)*k/NG));

  const mean = {}, band = {};
  for (const s of ['gasphase','acetone']){
    curveOf._f = d[s].f;
    mean[s] = curveOf(d[s].E_eV);
    if (showB){
      const S = ensureSamples(d)[s].map(E => curveOf(E));
      const p5 = [], p95 = [];
      for (let k=0;k<=NG;k++){
        const col = S.map(c => c[k]).sort((a,b)=>a-b);
        p5.push(col[Math.floor(0.05*NSAMP)]); p95.push(col[Math.ceil(0.95*NSAMP)-1]);
      }
      band[s] = [p5, p95];
    }
  }
  let ymax = 1e-6;
  if (showG) ymax = Math.max(ymax, ...mean.gasphase, ...(showB ? band.gasphase[1] : []));
  if (showA) ymax = Math.max(ymax, ...mean.acetone, ...(showB ? band.acetone[1] : []));
  const y = v => T + ph - (Math.min(v,ymax)/ymax)*ph*0.96;
  // grid point k lives at energy Ek — place it on the axis in the active units
  const pxOf = k => { const Ek = Elo + (Ehi-Elo)*k/NG;
                      return UNITS === 'nm' ? x(HC/Ek) : x(Ek); };
  const path = c => 'M' + c.map((v,k)=>`${pxOf(k).toFixed(1)},${y(v).toFixed(1)}`).join('L');
  const bandPath = ([p5,p95]) => {
    let s2 = 'M';
    p95.forEach((v,k)=>{ s2 += `${pxOf(k).toFixed(1)},${y(v).toFixed(1)}L`; });
    for (let k=NG;k>=0;k--) s2 += `${pxOf(k).toFixed(1)},${y(p5[k]).toFixed(1)}${k?'L':''}`;
    return s2 + 'Z';
  };

  const fmax = Math.max(...d.gasphase.f.slice(0,NST), ...d.acetone.f.slice(0,NST), 1e-6);
  const stick = (s, color) => d[s].lambda_nm.slice(0,NST).map((nm,i)=>{
    if (nm<lo||nm>hi) return '';
    const px = UNITS === 'nm' ? x(nm) : x(d[s].E_eV[i]);
    const h = (d[s].f[i]/fmax)*ph*0.92;
    const E=d[s].E_eV[i], sd=d[s].E_std_eV[i];
    return `<line x1="${px.toFixed(1)}" x2="${px.toFixed(1)}" y1="${T+ph}" y2="${(T+ph-h).toFixed(1)}"
      stroke="${color}" stroke-width="1.5" opacity=".45">
      <title>S${i+1} ${SOLV_LABEL[s]}: ${nm.toFixed(0)} nm (${E.toFixed(2)} ± ${sd.toFixed(2)} eV), f = ${d[s].f[i].toFixed(3)}</title></line>`;
  }).join('');

  let ticks='';
  if (UNITS === 'nm'){
    const step = tickStepNm(hi-lo);
    for (let nm=Math.ceil(lo/step)*step; nm<=hi+1e-6; nm+=step)
      ticks += `<line x1="${x(nm).toFixed(1)}" x2="${x(nm).toFixed(1)}" y1="${T+ph}" y2="${T+ph+4}" stroke="${C.axis}"/>
                <text x="${x(nm).toFixed(1)}" y="${T+ph+17}" text-anchor="middle">${nm}</text>`;
  } else {
    const step = tickStepEv(Ehi-Elo);
    for (let E=Math.ceil(Elo/step)*step; E<=Ehi+1e-9; E+=step)
      ticks += `<line x1="${x(E).toFixed(1)}" x2="${x(E).toFixed(1)}" y1="${T+ph}" y2="${T+ph+4}" stroke="${C.axis}"/>
                <text x="${x(E).toFixed(1)}" y="${T+ph+17}" text-anchor="middle">${(Math.round(E*100)/100)}</text>`;
  }

  const regions = [[150,350,'UV'],[350,825,'Visible'],[825,1653,'nIR']];
  let shade='', rlabels='';
  for (const [r0,r1,name] of regions){
    const a=Math.max(lo,r0), b=Math.min(hi,r1);
    if (b-a<=0) continue;
    const xa = UNITS==='nm' ? x(a) : x(HC/b), xb = UNITS==='nm' ? x(b) : x(HC/a);
    shade += `<rect x="${xa.toFixed(1)}" y="${T}" width="${(xb-xa).toFixed(1)}" height="${ph}"
              fill="${name==='Visible' ? 'url(#visg)' : name==='UV' ? '#6d28d9' : '#7f1d1d'}"
              opacity="${name==='Visible' ? C.shade+0.03 : C.shade}"/>`;
    if (xb-xa > 46)
      rlabels += `<text x="${((xa+xb)/2).toFixed(1)}" y="${T+14}" text-anchor="middle">${name}</text>`;
  }

  const svg = `
  <svg id="specsvg" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;cursor:crosshair" xmlns="http://www.w3.org/2000/svg">
    <style>text{font:11px system-ui,'Segoe UI',Helvetica,sans-serif;fill:${C.muted}}</style>
    <defs>
      <linearGradient id="visg" x1="${UNITS==='nm'?0:1}" x2="${UNITS==='nm'?1:0}">
        <stop offset="0%" stop-color="#8b5cf6"/><stop offset="18%" stop-color="#3b82f6"/>
        <stop offset="38%" stop-color="#22c55e"/><stop offset="58%" stop-color="#eab308"/>
        <stop offset="78%" stop-color="#f97316"/><stop offset="100%" stop-color="#ef4444"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${W}" height="${H}" fill="${C.surface}"/>
    ${shade}${rlabels}
    <line x1="${L}" x2="${W-Rm}" y1="${T+ph}" y2="${T+ph}" stroke="${C.axis}"/>
    ${ticks}
    <text x="${L+pw/2}" y="${H-6}" text-anchor="middle">${UNITS==='nm'?'wavelength / nm':'energy / eV'}</text>
    <text transform="rotate(-90 14 ${T+ph/2})" x="14" y="${T+ph/2}" text-anchor="middle">relative intensity</text>
    ${showB && showG ? `<path d="${bandPath(band.gasphase)}" fill="rgba(${C.s1rgb},0.12)" stroke="none"/>` : ''}
    ${showB && showA ? `<path d="${bandPath(band.acetone)}" fill="rgba(${C.s2rgb},0.12)" stroke="none"/>` : ''}
    ${showS ? stick('gasphase',C.s1)+stick('acetone',C.s2) : ''}
    ${showG ? `<path d="${path(mean.gasphase)}" fill="none" stroke="${C.s1}" stroke-width="2"/>` : ''}
    ${showA ? `<path d="${path(mean.acetone)}" fill="none" stroke="${C.s2}" stroke-width="2" stroke-dasharray="6 4"/>` : ''}
    <rect id="selrect" x="0" y="${T}" width="0" height="${ph}" fill="${C.s1}" opacity="0"/>
    <line id="cross" x1="0" x2="0" y1="${T}" y2="${T+ph}" stroke="${C.ink}" stroke-width="1" opacity="0" stroke-dasharray="3 3"/>
  </svg>`;
  $('#spec').innerHTML = svg;

  const el = $('#specsvg'), hb = $('#hoverbox'),
        cross = el.querySelector('#cross'), selrect = el.querySelector('#selrect');
  const nmAt = ev => {   // pointer position -> wavelength, in either axis mode
    const r = el.getBoundingClientRect();
    const u = ((ev.clientX-r.left)/r.width*W - L)/pw;
    return UNITS === 'nm' ? lo + u*(hi-lo) : HC/(Elo + u*(Ehi-Elo));
  };
  let sel = null;

  el.addEventListener('mousedown', ev => {
    ev.preventDefault();
    sel = {from: Math.min(hi, Math.max(lo, nmAt(ev)))};
    hb.style.display='none'; cross.setAttribute('opacity',0);
  });
  el.addEventListener('mousemove', ev => {
    const nm = nmAt(ev);
    if (sel){
      sel.to = Math.min(hi, Math.max(lo, nm));
      const a = Math.min(sel.from, sel.to), b = Math.max(sel.from, sel.to);
      const xa = UNITS==='nm' ? x(a) : x(HC/b), xb = UNITS==='nm' ? x(b) : x(HC/a);
      selrect.setAttribute('x', xa); selrect.setAttribute('width', xb-xa);
      selrect.setAttribute('opacity', 0.12);
      return;
    }
    if (nm<lo||nm>hi){ hb.style.display='none'; cross.setAttribute('opacity',0); return; }
    const px = UNITS==='nm' ? x(nm) : x(HC/nm);
    cross.setAttribute('x1', px); cross.setAttribute('x2', px);
    cross.setAttribute('opacity', .35);
    const k = Math.round((HC/nm - Elo)/(Ehi-Elo)*NG);
    const iv = c => (k>=0 && k<=NG) ? c[k]/ymax : 0;
    hb.innerHTML = `&lambda; = ${nm.toFixed(0)} nm &nbsp; (${(HC/nm).toFixed(2)} eV)<br>` +
      `Gas-Phase: ${(iv(mean.gasphase)*100).toFixed(0)}% &nbsp; Acetone: ${(iv(mean.acetone)*100).toFixed(0)}%`;
    hb.style.display='block';
    hb.style.left=(ev.clientX+14)+'px'; hb.style.top=(ev.clientY+12)+'px';
  });
  if (window._specUp) window.removeEventListener('mouseup', window._specUp);
  window._specUp = () => {
    if (!sel) return;
    const a = Math.min(sel.from, sel.to ?? sel.from), b = Math.max(sel.from, sel.to ?? sel.from);
    sel = null; selrect.setAttribute('opacity', 0);
    if (b - a >= 15 && LAST){
      SPEC_LO = Math.round(a); SPEC_HI = Math.round(b);
      segMark('#regionseg', null);
      drawPlot(LAST);
    }
  };
  window.addEventListener('mouseup', window._specUp);
  el.addEventListener('dblclick', () => {
    SPEC_LO = 150; SPEC_HI = 1200;
    segMark('#regionseg', document.querySelector('#regionseg button'));
    if (LAST) drawPlot(LAST);
  });
  el.addEventListener('mouseleave', ()=>{ hb.style.display='none'; cross.setAttribute('opacity',0); });
}

/* ---------- energy ladder ---------- */
function drawLadder(d){
  const C = chrome();
  const W=880,H=440,L=62,Rm=20,T=34,B=16, pw=W-L-Rm, ph=H-T-B;
  const Es = [...d.gasphase.E_eV.slice(0,NST), ...d.acetone.E_eV.slice(0,NST)];
  const Emin = Math.min(...Es)-0.18, Emax = Math.max(...Es)+0.18;
  const y = E => T + (Emax-E)/(Emax-Emin)*ph;
  const half = Math.min(95, pw*0.13);
  const cxs = {gasphase: L + pw*0.28, acetone: L + pw*0.72};
  const fmax = Math.max(...d.gasphase.f.slice(0,NST), ...d.acetone.f.slice(0,NST), 1e-6);

  let grid='', gl='';
  const step = tickStepEv(Emax-Emin);
  for (let E=Math.ceil(Emin/step)*step; E<=Emax+1e-9; E+=step){
    grid += `<line x1="${L}" x2="${W-Rm}" y1="${y(E).toFixed(1)}" y2="${y(E).toFixed(1)}" stroke="${C.grid}" stroke-width="1"/>`;
    gl   += `<text x="${L-8}" y="${(y(E)+3.5).toFixed(1)}" text-anchor="end">${(Math.round(E*100)/100)}</text>`;
  }

  // connectors first (recessive), then levels
  let conn='', levels='', hits='';
  for (let i=0;i<NST;i++){
    const yg = y(d.gasphase.E_eV[i]), ya = y(d.acetone.E_eV[i]);
    conn += `<line x1="${(cxs.gasphase+half).toFixed(1)}" y1="${yg.toFixed(1)}"
             x2="${(cxs.acetone-half).toFixed(1)}" y2="${ya.toFixed(1)}"
             stroke="${C.grid}" stroke-width="1"/>`;
  }
  for (const s of ['gasphase','acetone']){
    const col = s==='gasphase' ? C.s1 : C.s2, cx = cxs[s];
    let bi = -1, bf = 0.01;   // strongest visible state -> direct label
    for (let i=0;i<NST;i++){
      const nm = d[s].lambda_nm[i];
      if (nm>=350 && nm<=825 && d[s].f[i]>bf){ bf=d[s].f[i]; bi=i; }
    }
    const rgb = s==='gasphase' ? C.s1rgb : C.s2rgb;
    for (let i=0;i<NST;i++){
      const E=d[s].E_eV[i], sd=d[s].E_std_eV[i], f=d[s].f[i], yy=y(E);
      const wgt = 1 + 3*Math.min(1, f/fmax);
      // sigma band only on the labeled state — 30 overlapping bands would stack
      // into a solid wash; every state's ±sigma stays in the tooltip
      if (i===bi)
        levels += `<rect x="${(cx-half).toFixed(1)}" y="${y(E+sd).toFixed(1)}" width="${(2*half).toFixed(1)}"
          height="${Math.max(0.5, y(E-sd)-y(E+sd)).toFixed(1)}" fill="rgba(${rgb},0.12)"/>`;
      levels += `<line x1="${(cx-half).toFixed(1)}" x2="${(cx+half).toFixed(1)}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"
        stroke="${col}" stroke-width="${wgt.toFixed(1)}" opacity="${f>0.005?0.95:0.4}" stroke-linecap="round"/>`;
      if (i===bi)
        levels += `<text x="${(cx-half-8).toFixed(1)}" y="${(yy+3.5).toFixed(1)}" text-anchor="end"
          style="fill:${C.ink2};font-weight:600">S${i+1} &middot; ${d[s].lambda_nm[i].toFixed(0)} nm &plusmn;${sd.toFixed(2)} eV</text>`;
      hits += `<rect x="${(cx-half-4).toFixed(1)}" y="${(yy-5).toFixed(1)}" width="${(2*half+18).toFixed(1)}" height="10"
        fill="transparent" data-s="${s}" data-i="${i}"/>`;
    }
  }

  const key = (s, xx) => `<g><line x1="${xx-34}" x2="${xx-14}" y1="${T-16}" y2="${T-16}"
      stroke="${s==='gasphase'?C.s1:C.s2}" stroke-width="3"/>
      <text x="${xx-8}" y="${T-12}" style="fill:${C.ink2};font-weight:600">${SOLV_LABEL[s]}</text></g>`;

  $('#spec').innerHTML = `
  <svg id="specsvg" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" xmlns="http://www.w3.org/2000/svg">
    <style>text{font:11px system-ui,'Segoe UI',Helvetica,sans-serif;fill:${C.muted}}</style>
    <rect x="0" y="0" width="${W}" height="${H}" fill="${C.surface}"/>
    ${grid}${gl}
    <text transform="rotate(-90 14 ${T+ph/2})" x="14" y="${T+ph/2}" text-anchor="middle">excitation energy / eV</text>
    ${key('gasphase', cxs.gasphase)}${key('acetone', cxs.acetone)}
    ${conn}${levels}${hits}
  </svg>`;

  const el = $('#specsvg'), hb = $('#hoverbox');
  el.addEventListener('mousemove', ev => {
    const t = ev.target;
    if (!(t.tagName === 'rect' && t.dataset.s)){ hb.style.display='none'; return; }
    const s = t.dataset.s, i = +t.dataset.i;
    hb.innerHTML = `<b>S${i+1}</b> ${SOLV_LABEL[s]}<br>` +
      `${d[s].E_eV[i].toFixed(2)} &plusmn; ${d[s].E_std_eV[i].toFixed(2)} eV &nbsp; ` +
      `(${d[s].lambda_nm[i].toFixed(0)} nm)<br>f = ${d[s].f[i].toFixed(3)}`;
    hb.style.display='block';
    hb.style.left=(ev.clientX+14)+'px'; hb.style.top=(ev.clientY+12)+'px';
  });
  el.addEventListener('mouseleave', ()=>{ hb.style.display='none'; });
}

/* ---------- toolbar wiring ---------- */
function segMark(sel, btn){
  document.querySelectorAll(sel + ' button').forEach(b => b.classList.toggle('on', b===btn));
}
$('#viewseg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  VIEW = b.dataset.v; segMark('#viewseg', b);
  if (LAST) drawPlot(LAST);
});
$('#regionseg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  SPEC_LO = +b.dataset.lo; SPEC_HI = +b.dataset.hi;
  segMark('#regionseg', b);
  if (LAST) drawPlot(LAST);
});
$('#unitseg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  UNITS = b.dataset.u; segMark('#unitseg', b);
  if (LAST) drawPlot(LAST);
});
$('#nstates').addEventListener('input', () => {
  NST = +$('#nstates').value;
  $('#nstlbl').textContent = NST;
  if (LAST){ drawPlot(LAST); renderStates(LAST); }
});
['cb-gas','cb-ace','cb-sticks','cb-band'].forEach(id =>
  document.addEventListener('change', e => { if (e.target.id===id && LAST) drawPlot(LAST); }));

$('#save-spec').addEventListener('click', () => {
  const el = $('#specsvg');
  if (!el) return;
  const src = 'data:image/svg+xml;base64,' +
              btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(el))));
  const img = new Image();
  const vb = el.viewBox.baseVal;
  img.onload = () => {
    const scale = 3, c = document.createElement('canvas');
    c.width = vb.width*scale; c.height = vb.height*scale;
    const ctx = c.getContext('2d');
    ctx.fillStyle = chrome().surface; ctx.fillRect(0,0,c.width,c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    dlURL(c.toDataURL('image/png'),
          (FNAME || 'prediction').replace(/\.xyz$/i,'') + (VIEW==='spec'?'_spectrum':'_ladder') + '.png');
  };
  img.src = src;
});

/* ---------- downloads ---------- */
function dl(name, text, type){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type}));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
$('#dl-json').addEventListener('click', () => {
  if (!LAST) return;
  const {_samples, ...clean} = LAST;
  dl((LAST.molecule.filename||'prediction').replace(/\.xyz$/,'') + '_' + LAST.model.key + '_prediction.json',
     JSON.stringify(LAST.raw, null, 2), 'application/json');
});
$('#dl-csv').addEventListener('click', () => {
  if (!LAST) return;
  const g=LAST.gasphase, a=LAST.acetone;
  let csv = 'model,state,E_gasphase_eV,E_gasphase_std_eV,lambda_gasphase_nm,f_gasphase,E_acetone_eV,E_acetone_std_eV,lambda_acetone_nm,f_acetone\n';
  for (let i=0;i<NST;i++)
    csv += LAST.model.key + ',' + [i+1,g.E_eV[i],g.E_std_eV[i],g.lambda_nm[i],g.f[i],a.E_eV[i],a.E_std_eV[i],a.lambda_nm[i],a.f[i]]
           .map(v=>Number(v).toPrecision(6)).join(',')+'\n';
  dl((LAST.molecule.filename||'prediction').replace(/\.xyz$/,'') + '_' + LAST.model.key + '_states.csv', csv, 'text/csv');
});
