'use strict';
// Depends on app.js (S, projectMeta, App, uid, esc, mkTask, PALETTE, DEFAULT_PHASES, closeModal)

// ── LOCAL STATE ──
let _autoSaveTimer = null;
const _undoStack = [];
const UNDO_MAX = 50;
let pendingJobTask = null; // for "Add to Job Board" modal

// ── INIT ──
(function init() {
  // Load from draft (set by estimate.html navigation or previous visit)
  const draft = App.getDraft();
  if (draft && draft.S) {
    Object.assign(S, draft.S);
    Object.assign(projectMeta, draft.meta || {});
  } else {
    // No draft — check autosave, else blank state
    const autosave = (() => { try { return JSON.parse(localStorage.getItem(App._pfx('thelab_autosave')) || 'null'); } catch(e) { return null; } })();
    if (autosave && autosave.S) {
      Object.assign(S, autosave.S);
      Object.assign(projectMeta, {name:autosave.name||'',client:autosave.client||'',version:autosave.version||'V1',date:autosave.date||'',currency:autosave.currency||'DKK'});
    } else {
      loadDemoData();
    }
  }

  applyMetaToDOM();
  renderAssignOpts();
  renderProcess();
  renderSavedList();
})();

function loadDemoData() {
  projectMeta.name   = 'Flagship Store — Fit-Out';
  projectMeta.client = 'Aesop Nordic';
  projectMeta.date   = new Date().toISOString().slice(0, 10);

  S.assignOpts = ['Team A', 'Team B', 'Both teams', 'External'];
  S.jobTasks   = [];
  S.overrides  = {};
  S.process = { phases: [
    {id:uid(),key:'prep',label:'Preparation',bg:'#0c447c',text:'#b5d4f4',tasks:[
      {id:uid(),name:'Site survey & measurements',spec:'Full floor plan verification',crew:2,hrs:4,hold:'Team A',note:'Bring laser measure'},
      {id:uid(),name:'Material order & procurement',spec:'Steel, panels, lighting',crew:1,hrs:6,hold:'Team A',note:'8-day lead time on panels'},
      {id:uid(),name:'Team briefing & drawings',spec:'Review install drawings',crew:4,hrs:2,hold:'Both teams',note:''},
    ]},
    {id:uid(),key:'ext',label:'External',bg:'#633806',text:'#fac775',tasks:[
      {id:uid(),name:'Electrical first-fix',spec:'Conduit & cable runs',crew:2,hrs:8,hold:'External',note:'Sparks ApS — confirm booking'},
      {id:uid(),name:'Panel delivery to site',spec:'Acoustic + steel',crew:1,hrs:3,hold:'External',note:'Coordinate with site manager'},
    ]},
    {id:uid(),key:'d1',label:'Day 1',bg:'#085041',text:'#9fe1cb',tasks:[
      {id:uid(),name:'Site protection & setup',spec:'Floor covering, hoarding',crew:2,hrs:3,hold:'Team A',note:''},
      {id:uid(),name:'Steel framing install',spec:'Wall A + B',crew:2,hrs:7,hold:'Team A',note:'Check plumb on every section'},
      {id:uid(),name:'Cable pulling',spec:'LED circuits',crew:2,hrs:5,hold:'Team B',note:'Follow electrical drawing rev.3'},
    ]},
    {id:uid(),key:'d2',label:'Day 2',bg:'#3c3489',text:'#cecbf6',tasks:[
      {id:uid(),name:'Acoustic panel installation',spec:'Adhesive + mechanical fix',crew:2,hrs:8,hold:'Team A',note:'Leave 2mm shadow gap'},
      {id:uid(),name:'LED strip & driver fit-off',spec:'Test each zone',crew:2,hrs:6,hold:'Team B',note:''},
      {id:uid(),name:'Joinery painting — first coat',spec:'Brush apply',crew:1,hrs:5,hold:'Team B',note:'Allow 4h dry time'},
    ]},
    {id:uid(),key:'d3',label:'Day 3',bg:'#712b13',text:'#f5c4b3',tasks:[
      {id:uid(),name:'Painting — second coat & touch-up',spec:'',crew:1,hrs:4,hold:'Team B',note:''},
      {id:uid(),name:'Final lighting commissioning',spec:'Scene programming',crew:2,hrs:3,hold:'Team A',note:'Client present for sign-off'},
      {id:uid(),name:'Snagging & de-rig protection',spec:'Full walkthrough',crew:4,hrs:3,hold:'Both teams',note:''},
      {id:uid(),name:'Site clean & handover',spec:'',crew:2,hrs:2,hold:'Both teams',note:'Hand keys to store manager'},
    ]},
  ]};

  // Also ensure estimate sections exist (needed for push-to-estimate)
  if (!S.estimate || !S.estimate.sections || !S.estimate.sections.length) {
    S.estimate = { sections: [
      {id:uid(),name:'Labour',rows:[]},
      {id:uid(),name:'Materials',rows:[]},
      {id:uid(),name:'Technical',rows:[]},
    ]};
  }
}

function applyMetaToDOM() {
  document.getElementById('proj-name').value   = projectMeta.name    || '';
  document.getElementById('proj-client').value = projectMeta.client  || '';
  document.getElementById('sel-ver').value     = projectMeta.version || 'V1';
  document.getElementById('proj-date').value   = projectMeta.date    || '';
}
function readMetaFromDOM() {
  projectMeta.name    = document.getElementById('proj-name').value;
  projectMeta.client  = document.getElementById('proj-client').value;
  projectMeta.version = document.getElementById('sel-ver').value;
  projectMeta.date    = document.getElementById('proj-date').value;
}

// ── SWITCH TO ESTIMATE ──
function switchToEstimate() {
  saveDraftState();
  window.location.href = '/estimate.html';
}
function saveDraftState() {
  readMetaFromDOM();
  App.saveDraft(projectMeta, S);
}

// ── UNDO ──
function pushUndo() { _undoStack.push(JSON.stringify(S)); if (_undoStack.length > UNDO_MAX) _undoStack.shift(); }
function undo() {
  if (!_undoStack.length) return;
  S = JSON.parse(_undoStack.pop());
  renderAssignOpts(); renderProcess();
  document.getElementById('dirty-ind').style.display = 'inline';
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
});

// ── DIRTY / AUTOSAVE ──
function dirty() {
  document.getElementById('dirty-ind').style.display = 'inline';
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => { readMetaFromDOM(); App.saveDraft(projectMeta, S); }, 2000);
}

// ── ASSIGNMENT OPTIONS ──
function renderAssignOpts() {
  const wrap = document.getElementById('assign-wrap');
  wrap.innerHTML = (S.assignOpts || []).map((opt, i) =>
    `<span class="assign-tag">${esc(opt)}<span class="rm" onclick="removeAssignOpt(${i})">✕</span></span>`
  ).join('');
}
function addAssignOpt() {
  const inp = document.getElementById('assign-new');
  const val = inp.value.trim(); if (!val) return;
  if (!S.assignOpts) S.assignOpts = [];
  if (!S.assignOpts.includes(val)) S.assignOpts.push(val);
  inp.value = '';
  renderAssignOpts(); dirty(); renderProcess();
}
function removeAssignOpt(i) {
  S.assignOpts.splice(i, 1);
  renderAssignOpts(); dirty(); renderProcess();
}

// ── PROCESS ──
function getPhase(pid)      { return S.process.phases.find(p => p.id === pid); }
function getPTask(pid, tid)  { return getPhase(pid).tasks.find(t => t.id === tid); }

function renderProcess() {
  const area = document.getElementById('main');
  area.innerHTML = '';

  const sumDiv = document.createElement('div'); sumDiv.className = 'proc-sum';
  sumDiv.innerHTML = `<div class="proc-card"><div class="proc-num" id="ps-days">0</div><div class="proc-lbl">On-site days</div></div><div class="proc-card"><div class="proc-num" id="ps-mh">0</div><div class="proc-lbl">Man-hours total</div></div><div class="proc-card"><div class="proc-num" id="ps-tasks">0</div><div class="proc-lbl">Tasks</div></div>`;
  area.appendChild(sumDiv);

  const xfer = document.createElement('div');
  xfer.style.cssText = 'margin-bottom:18px;display:flex;align-items:center;gap:10px';
  xfer.innerHTML = `<button class="btn" onclick="pushAllToEstimate()">↗ Push all labour to Estimate</button><span style="font-size:11px;color:var(--text2)">Pushes non-external tasks as man-hours</span>`;
  area.appendChild(xfer);

  S.process.phases.forEach(phase => {
    const phaseMH = phase.tasks.reduce((s,t) => s + (parseFloat(t.crew)||0)*(parseFloat(t.hrs)||0), 0);
    const wrap = document.createElement('div'); wrap.className = 'section-block';
    wrap.innerHTML = `
      <div class="section-hdr" style="position:relative">
        <div style="position:relative;display:inline-block">
          <span class="phase-pill" id="pp-${phase.id}" style="background:${phase.bg};color:${phase.text}"
            onclick="toggleColorPicker('${phase.id}')" title="Click to change colour">${esc(phase.label)}</span>
          <div class="color-palette" id="cp-${phase.id}">
            ${PALETTE.map(c=>`<div class="cp-swatch" style="background:${c.bg}" title="${c.label}" onclick="setPhaseColor('${phase.id}','${c.bg}','${c.text}')"></div>`).join('')}
          </div>
        </div>
        <input class="section-name" value="${esc(phase.label)}"
          oninput="getPhase('${phase.id}').label=this.value;document.getElementById('pp-${phase.id}').textContent=this.value;dirty()">
        <span id="phase-mh-${phase.id}" style="font-size:11px;color:var(--text2);margin-left:4px">${phaseMH?phaseMH+' mh':''}</span>
        <button class="del-section-btn" style="margin-left:auto" onclick="delPhase('${phase.id}')">✕</button>
      </div>
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr>
            <th style="width:22px"></th>
            <th style="width:20%">Task</th><th style="width:12%">Spec</th>
            <th class="r" style="width:6%">Crew</th><th class="r" style="width:6%">Hours</th>
            <th class="r" style="width:8%">Man-hrs</th>
            <th style="width:12%">Allocation</th>
            <th>Note</th>
            <th style="width:140px"></th>
            <th style="width:24px"></th>
          </tr></thead>
          <tbody id="ptb-${phase.id}"></tbody>
          <tfoot><tr><td colspan="99" class="tbl-footer">
            <button class="add-row-btn" onclick="addPTask('${phase.id}')">+ Add task</button>
          </td></tr></tfoot>
        </table>
      </div>`;
    area.appendChild(wrap);
    renderPRows(phase);
    setupPDragDrop(phase.id);
  });

  const addPhaseBtn = document.createElement('button');
  addPhaseBtn.className = 'add-section-btn'; addPhaseBtn.textContent = '+ Add day phase';
  addPhaseBtn.onclick = addPhase;
  area.appendChild(addPhaseBtn);
  calcProcess();
}

function renderPRows(phase) {
  const tb = document.getElementById('ptb-' + phase.id); if (!tb) return;
  tb.innerHTML = '';
  phase.tasks.forEach(task => tb.appendChild(buildPRow(phase.id, task)));
}

function buildPRow(pid, task) {
  const mh = (parseFloat(task.crew)||0) * (parseFloat(task.hrs)||0);
  const tr = document.createElement('tr');
  tr.draggable = true; tr.dataset.tid = task.id; tr.dataset.pid = pid; tr.id = 'ptr-' + task.id;
  const _empNames = (App.getGlobal().employees || []).map(e => e.name);
  const _allOpts  = [...new Set([...(S.assignOpts || []), ..._empNames])];
  const assignOpts = _allOpts.map(h => `<option${h===task.hold?' selected':''}>${esc(h)}</option>`).join('');
  const isOnJobBoard = (S.jobTasks || []).some(jt => jt.taskId === task.id);
  tr.innerHTML = `
    <td><div class="move-btns">
      <button class="mb" onclick="movePTask('${pid}','${task.id}',-1)">▲</button>
      <button class="mb" onclick="movePTask('${pid}','${task.id}',1)">▼</button>
    </div></td>
    <td><input class="ei" placeholder="Task name..." value="${esc(task.name)}" oninput="getPTask('${pid}','${task.id}').name=this.value;dirty()"></td>
    <td><input class="ei" placeholder="Spec..." value="${esc(task.spec)}" oninput="getPTask('${pid}','${task.id}').spec=this.value;dirty()"></td>
    <td><input class="ei r" value="${task.crew}" style="width:48px" oninput="getPTask('${pid}','${task.id}').crew=this.value;updateMH('${task.id}','${pid}')"></td>
    <td><input class="ei r" value="${task.hrs}" style="width:48px"
      oninput="getPTask('${pid}','${task.id}').hrs=this.value;updateMH('${task.id}','${pid}')"
      onkeydown="onProcRowLastFieldTab(event,'${pid}','${task.id}')"></td>
    <td class="cc" id="pmh-${task.id}">${mh||'—'}</td>
    <td><select class="esel" onchange="getPTask('${pid}','${task.id}').hold=this.value;dirty()">
      ${assignOpts}
    </select></td>
    <td>${noteCell(pid, task.id, task.note)}</td>
    <td style="white-space:nowrap">
      <button class="push-btn" onclick="openPushModal('${pid}','${task.id}')">→ Estimate</button>
      <button class="job-btn${isOnJobBoard?' active':''}" id="jb-btn-${task.id}" onclick="openJobBoardModal('${pid}','${task.id}')" title="${isOnJobBoard?'On job board — click to edit':'Add to Job Board'}">${isOnJobBoard?'✓ Job Board':'+ Job Board'}</button>
      <button class="dup-btn" title="Duplicate" onclick="dupPTask('${pid}','${task.id}')">⧉</button>
    </td>
    <td><button class="rd" onclick="delPTask('${pid}','${task.id}')">×</button></td>`;
  return tr;
}

function updateMH(tid, pid) {
  const task = getPTask(pid, tid);
  const mh = (parseFloat(task.crew)||0) * (parseFloat(task.hrs)||0);
  const el = document.getElementById('pmh-' + tid); if (el) el.textContent = mh || '—';
  calcProcess(); dirty();
}
function addPTask(pid) {
  pushUndo();
  const task = mkTask();
  if (S.assignOpts && S.assignOpts.length) task.hold = S.assignOpts[0];
  getPhase(pid).tasks.push(task);
  const tb = document.getElementById('ptb-' + pid); if (tb) tb.appendChild(buildPRow(pid, task));
  setupPDragDrop(pid); calcProcess(); dirty();
}
function delPTask(pid, tid) {
  pushUndo();
  getPhase(pid).tasks = getPhase(pid).tasks.filter(t => t.id !== tid);
  // Also remove from job board if present
  if (S.jobTasks) S.jobTasks = S.jobTasks.filter(jt => jt.taskId !== tid);
  document.getElementById('ptr-' + tid)?.remove();
  calcProcess(); dirty();
}
function movePTask(pid, tid, dir) {
  pushUndo();
  const tasks = getPhase(pid).tasks;
  const i = tasks.findIndex(t => t.id === tid), ni = i + dir;
  if (ni < 0 || ni >= tasks.length) return;
  [tasks[i], tasks[ni]] = [tasks[ni], tasks[i]];
  renderPRows(getPhase(pid)); setupPDragDrop(pid); dirty();
}
function dupPTask(pid, tid) {
  pushUndo();
  const phase = getPhase(pid);
  const i = phase.tasks.findIndex(t => t.id === tid);
  const clone = Object.assign({}, phase.tasks[i], {id: uid()});
  phase.tasks.splice(i + 1, 0, clone);
  renderPRows(phase); setupPDragDrop(pid); calcProcess(); dirty();
}
function onProcRowLastFieldTab(e, pid, tid) {
  if (e.key !== 'Tab' || e.shiftKey) return;
  const phase = getPhase(pid);
  if (phase.tasks[phase.tasks.length-1].id !== tid) return;
  e.preventDefault(); pushUndo();
  const task = mkTask();
  if (S.assignOpts && S.assignOpts.length) task.hold = S.assignOpts[0];
  phase.tasks.push(task);
  const tb = document.getElementById('ptb-' + pid);
  if (tb) tb.appendChild(buildPRow(pid, task));
  setupPDragDrop(pid); calcProcess(); dirty();
  requestAnimationFrame(() => { document.getElementById('ptr-' + task.id)?.querySelector('.ei')?.focus(); });
}
function addPhase() {
  pushUndo();
  const dayNums = S.process.phases.map(p => p.key.match(/^d(\d+)$/)).filter(Boolean).map(m => parseInt(m[1]));
  const n = dayNums.length ? Math.max(...dayNums) + 1 : 1;
  const colors = PALETTE[n % PALETTE.length];
  S.process.phases.push({id:uid(),key:'d'+n,label:'Day '+n,bg:colors.bg,text:colors.text,tasks:[]});
  renderProcess(); dirty();
}
function delPhase(pid) {
  if (S.process.phases.length <= 1) return;
  if (!confirm('Delete this phase and all its tasks?')) return;
  pushUndo();
  // Remove any job board tasks linked to this phase's tasks
  const taskIds = getPhase(pid).tasks.map(t => t.id);
  if (S.jobTasks) S.jobTasks = S.jobTasks.filter(jt => !taskIds.includes(jt.taskId));
  S.process.phases = S.process.phases.filter(p => p.id !== pid);
  renderProcess(); dirty();
}

// ── PROCESS DRAG DROP ──
let pDragTid = null, pDragPid = null;
function setupPDragDrop(pid) {
  const tb = document.getElementById('ptb-' + pid); if (!tb) return;
  tb.querySelectorAll('tr[draggable]').forEach(tr => {
    tr.addEventListener('dragstart', () => { pDragTid=tr.dataset.tid; pDragPid=tr.dataset.pid; setTimeout(()=>tr.classList.add('dragging'),0); });
    tr.addEventListener('dragend', () => { tr.classList.remove('dragging'); document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over')); });
    tr.addEventListener('dragover', e => { e.preventDefault(); tr.classList.add('drag-over'); });
    tr.addEventListener('dragleave', () => tr.classList.remove('drag-over'));
    tr.addEventListener('drop', e => {
      e.preventDefault(); tr.classList.remove('drag-over');
      const targetTid=tr.dataset.tid, targetPid=tr.dataset.pid;
      if (!pDragTid||pDragTid===targetTid) return;
      pushUndo();
      const srcPhase=getPhase(pDragPid), tgtPhase=getPhase(targetPid);
      const srcIdx=srcPhase.tasks.findIndex(t=>t.id===pDragTid);
      const task=srcPhase.tasks.splice(srcIdx,1)[0];
      const tgtIdx=tgtPhase.tasks.findIndex(t=>t.id===targetTid);
      tgtPhase.tasks.splice(tgtIdx,0,task);
      renderPRows(srcPhase); setupPDragDrop(pDragPid);
      if (pDragPid!==targetPid) { renderPRows(tgtPhase); setupPDragDrop(targetPid); }
      calcProcess(); dirty();
    });
  });
  tb.addEventListener('dragover', e => e.preventDefault());
  tb.addEventListener('drop', e => {
    e.preventDefault(); if (!pDragTid) return;
    const tgtPhase=getPhase(pid), srcPhase=getPhase(pDragPid);
    if (pDragPid===pid) return;
    pushUndo();
    const srcIdx=srcPhase.tasks.findIndex(t=>t.id===pDragTid);
    const task=srcPhase.tasks.splice(srcIdx,1)[0];
    tgtPhase.tasks.push(task);
    renderPRows(srcPhase); setupPDragDrop(pDragPid);
    renderPRows(tgtPhase); setupPDragDrop(pid);
    calcProcess(); dirty();
  });
}

function calcProcess() {
  let totalMH=0, totalTasks=0, onSiteDays=0;
  S.process.phases.forEach(phase => {
    if (phase.key.startsWith('d') && /^d\d+$/.test(phase.key) && phase.tasks.length) onSiteDays++;
    let phaseMH = 0;
    phase.tasks.forEach(t => {
      const mh = (parseFloat(t.crew)||0)*(parseFloat(t.hrs)||0);
      phaseMH += mh; totalMH += mh; totalTasks++;
    });
    const el = document.getElementById('phase-mh-' + phase.id);
    if (el) el.textContent = phaseMH ? phaseMH + ' mh' : '';
  });
  const d=document.getElementById('ps-days'); if(d) d.textContent=onSiteDays;
  const m=document.getElementById('ps-mh');   if(m) m.textContent=totalMH;
  const t=document.getElementById('ps-tasks'); if(t) t.textContent=totalTasks;
}

// ── COLOR PICKER ──
function toggleColorPicker(pid) {
  const cp = document.getElementById('cp-' + pid);
  document.querySelectorAll('.color-palette').forEach(el => { if (el !== cp) el.classList.remove('open'); });
  cp.classList.toggle('open');
}
function setPhaseColor(pid, bg, text) {
  const phase = getPhase(pid); phase.bg = bg; phase.text = text;
  const pill = document.getElementById('pp-' + pid);
  if (pill) { pill.style.background = bg; pill.style.color = text; }
  document.getElementById('cp-' + pid)?.classList.remove('open');
  dirty();
}

// ── NOTE ──
function noteCell(pid, tid, note) {
  const saveF = `getPTask('${pid}','${tid}').note=this.value;dirty()`;
  const hasNote = note && note.trim();
  return `<div class="note-wrap">${hasNote
    ? `<div class="note-short" onclick="openNote('${tid}')" title="${esc(note)}">${esc(note)}</div>`
    : `<div class="note-add" onclick="openNote('${tid}')">+ note</div>`
  }<div class="note-pop" id="np-${tid}"><span class="note-cls" onclick="closeNote('${tid}')">Close ✕</span><textarea oninput="${saveF};syncNoteShort('${tid}',this.value)" placeholder="Note...">${esc(note)}</textarea></div></div>`;
}
function openNote(rid)  { document.querySelectorAll('.note-pop').forEach(e=>e.style.display='none'); const el=document.getElementById('np-'+rid); if(el){el.style.display='block';el.querySelector('textarea').focus();} }
function closeNote(rid) { const el=document.getElementById('np-'+rid); if(el) el.style.display='none'; }
function syncNoteShort(rid, val) { const el=document.getElementById('np-'+rid); const s=el?.parentElement?.querySelector('.note-short,.note-add'); if(!s) return; if(val?.trim()){s.className='note-short';s.textContent=val;s.onclick=()=>openNote(rid);}else{s.className='note-add';s.textContent='+ note';s.onclick=()=>openNote(rid);} }

document.addEventListener('click', e => {
  if (!e.target.closest('.note-wrap')) document.querySelectorAll('.note-pop').forEach(el=>el.style.display='none');
  if (!e.target.closest('.color-palette') && !e.target.closest('.phase-pill')) document.querySelectorAll('.color-palette').forEach(el=>el.classList.remove('open'));
  if (!e.target.closest('[onclick="toggleExportMenu()"]') && !e.target.closest('#exp-menu')) { const m=document.getElementById('exp-menu'); if(m) m.style.display='none'; }
});

// ── PUSH TO ESTIMATE MODAL ──
function openPushModal(pid, tid) {
  const task = getPTask(pid, tid);
  if (!task.name) { alert('Add a task name first.'); return; }
  const opts = document.getElementById('push-opts');
  opts.innerHTML = S.estimate.sections.map((sec, i) => `
    <div class="push-opt${i===0?' selected':''}" id="popt-${sec.id}" onclick="selectPushOpt('${sec.id}')">
      <div style="font-size:12px;font-weight:500;color:var(--hi)">${esc(sec.name)}</div>
      <div style="font-size:11px;color:var(--text2)">${sec.rows.length} rows</div>
    </div>`).join('');
  document.getElementById('push-modal').dataset.pid = pid;
  document.getElementById('push-modal').dataset.tid = tid;
  document.getElementById('push-modal').classList.add('open');
}
function selectPushOpt(sid) { document.querySelectorAll('.push-opt').forEach(el=>el.classList.remove('selected')); document.getElementById('popt-'+sid)?.classList.add('selected'); }
function confirmPush() {
  const modal = document.getElementById('push-modal');
  const pid = modal.dataset.pid, tid = modal.dataset.tid;
  const selEl = document.querySelector('#push-opts .push-opt.selected'); if (!selEl) return;
  const sid = selEl.id.replace('popt-','');
  const sec = S.estimate.sections.find(s => s.id === sid); if (!sec) return;
  const task = getPTask(pid, tid);
  const settings = App.getSettings();
  const mh = (parseFloat(task.crew)||0)*(parseFloat(task.hrs)||0);
  pushUndo();
  sec.rows.push({id:uid(),what:task.name,spec:task.spec||'',qty:String(mh||task.crew||1),unit:'hrs',sale:settings.defaultSaleRate?String(settings.defaultSaleRate):'',cost:settings.defaultCostRate?String(settings.defaultCostRate):'',note:`From process: ${task.note||''}`});
  closeModal('push-modal');
  dirty();
}
function pushAllToEstimate() {
  const settings = App.getSettings();
  const labSec = S.estimate.sections.find(s=>s.name.toLowerCase().includes('labour'))||S.estimate.sections[0];
  let count=0; pushUndo();
  S.process.phases.forEach(phase=>{phase.tasks.forEach(task=>{if(!task.name||task.hold==='External')return;const mh=(parseFloat(task.crew)||0)*(parseFloat(task.hrs)||0);labSec.rows.push({id:uid(),what:task.name,spec:task.spec||'',qty:String(mh||task.crew||1),unit:'hrs',sale:settings.defaultSaleRate?String(settings.defaultSaleRate):'',cost:settings.defaultCostRate?String(settings.defaultCostRate):'',note:`[${phase.label}] ${task.note||''}`});count++;});});
  if(count>0){dirty();alert(`${count} tasks pushed to Estimate → ${labSec.name}. Switch to Estimate to see them.`);}
  else alert('No tasks to push.');
}

// ── JOB BOARD MODAL ──
function openJobBoardModal(pid, tid) {
  const task = getPTask(pid, tid);
  if (!task.name) { alert('Add a task name first.'); return; }
  pendingJobTask = {pid, tid};

  // Find existing job task entry if any
  if (!S.jobTasks) S.jobTasks = [];
  const existing = S.jobTasks.find(jt => jt.taskId === tid) || null;

  const global = App.getGlobal();
  const stages = global.jobStages || DEFAULT_JOB_STAGES;
  const defStages = existing ? existing.stages : {};

  const stagesHTML = stages.map(stage => {
    const stageData = defStages[stage.id] || {enabled:true};
    const checked = stageData.enabled !== false ? 'checked' : '';
    let dateFields = '';
    if (stage.hasDateRange) {
      dateFields = `
        <label><span style="font-size:10px;color:var(--text3)">Start</span><input type="date" id="jb-${stage.id}-start" value="${stageData.startDate||''}" class="modal-in" style="width:130px"></label>
        <label><span style="font-size:10px;color:var(--text3)">End</span><input type="date" id="jb-${stage.id}-end" value="${stageData.endDate||''}" class="modal-in" style="width:130px"></label>`;
    } else if (stage.id !== 'ongoing') {
      dateFields = `<label><span style="font-size:10px;color:var(--text3)">Date</span><input type="date" id="jb-${stage.id}-date" value="${stageData.date||''}" class="modal-in" style="width:130px"></label>`;
    }
    return `<div class="stage-row">
      <input type="checkbox" id="jb-stage-${stage.id}" ${checked} style="accent-color:var(--teal);width:14px;height:14px;flex-shrink:0">
      <span class="stage-name">${esc(stage.name)}</span>
      <div class="stage-dates">${dateFields}</div>
    </div>`;
  }).join('');

  // Crew assignment: roster picker + free-text
  const global2 = App.getGlobal();
  const employees = global2.employees || [];
  const existingAssigned = existing ? (existing.assignedTo || []) : [];
  const assignedIds = existingAssigned.map(a => a.employeeId).filter(Boolean);
  const rosterOptions = employees.length
    ? `<select class="modal-in" id="jb-crew-picker" style="margin-bottom:6px"><option value="">— Pick from roster —</option>${employees.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select><button type="button" class="add-inline-btn" onclick="addCrewFromPicker()" style="display:block;margin-bottom:8px">+ Add from roster</button>`
    : '';

  const existingCrewHTML = existingAssigned.map((a,i) =>
    `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
      <input class="modal-in jb-crew-entry" style="flex:1" value="${esc(a.name)}" placeholder="Name...">
      <button type="button" onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px">×</button>
    </div>`
  ).join('');

  document.getElementById('jb-task-name').textContent = task.name;
  document.getElementById('jb-ready-by').value    = existing ? (existing.readyByDate  || projectMeta.date || '') : (projectMeta.date || '');
  document.getElementById('jb-ready-time').value  = existing ? (existing.readyByTime  || '') : '';
  document.getElementById('jb-strike-date').value = existing ? (existing.strikeDate   || '') : '';
  document.getElementById('jb-strike-time').value = existing ? (existing.strikeTime   || '') : '';
  document.getElementById('jb-contact').value     = existing ? (existing.contactName  || '') : '';

  // Location
  const loc = existing ? (existing.location || {}) : {};
  document.getElementById('jb-loc-type').value    = loc.type || '';
  document.getElementById('jb-studio-num').value  = loc.studioNum || '';
  document.getElementById('jb-loc-addr').value    = loc.address   || '';
  onJbLocChange();

  // Job type chips
  const activeTypes = existing ? (existing.jobTypes || []) : [];
  document.querySelectorAll('#jb-type-chips .type-chip').forEach(btn => {
    btn.classList.toggle('active', activeTypes.includes(btn.dataset.type));
  });

  document.getElementById('jb-stages-list').innerHTML = stagesHTML;
  document.getElementById('jb-crew-section').innerHTML = `${rosterOptions}<div id="jb-crew-list">${existingCrewHTML}</div><button type="button" class="add-inline-btn" onclick="addCrewFreetext()">+ Add name</button>`;

  document.getElementById('jb-modal').classList.add('open');
}

function onJbLocChange() {
  const type = document.getElementById('jb-loc-type').value;
  document.getElementById('jb-studio-num').style.display = type === 'studio'     ? '' : 'none';
  document.getElementById('jb-loc-addr').style.display   = type === 'onlocation' ? '' : 'none';
}

function addCrewFromPicker() {
  const picker = document.getElementById('jb-crew-picker');
  const val = picker.value; if (!val) return;
  const employees = App.getGlobal().employees || [];
  const emp = employees.find(e => e.id === val); if (!emp) return;
  addCrewEntryDOM(emp.id, emp.name);
  picker.value = '';
}
function addCrewFreetext() { addCrewEntryDOM(null, ''); }
function addCrewEntryDOM(empId, name) {
  const list = document.getElementById('jb-crew-list');
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px';
  div.innerHTML = `<input class="modal-in jb-crew-entry" data-emp-id="${empId||''}" style="flex:1" value="${esc(name)}" placeholder="Name..."><button type="button" onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px">×</button>`;
  list.appendChild(div);
  if (!name) div.querySelector('input').focus();
}

function confirmJobBoard() {
  if (!pendingJobTask) return;
  const {pid, tid} = pendingJobTask;
  const task = getPTask(pid, tid);
  if (!S.jobTasks) S.jobTasks = [];

  const global = App.getGlobal();
  const stages = global.jobStages || DEFAULT_JOB_STAGES;

  const stagesData = {};
  stages.forEach(stage => {
    const enabled = document.getElementById('jb-stage-' + stage.id)?.checked ?? true;
    const entry = {enabled};
    if (stage.hasDateRange) {
      entry.startDate = document.getElementById('jb-' + stage.id + '-start')?.value || '';
      entry.endDate   = document.getElementById('jb-' + stage.id + '-end')?.value || '';
    } else if (stage.id !== 'ongoing') {
      entry.date = document.getElementById('jb-' + stage.id + '-date')?.value || '';
    }
    stagesData[stage.id] = entry;
  });

  const crewEntries = [...document.querySelectorAll('.jb-crew-entry')].map(inp => ({
    employeeId: inp.dataset.empId || null,
    name: inp.value.trim(),
  })).filter(a => a.name);

  const readyByDate  = document.getElementById('jb-ready-by').value;
  const readyByTime  = document.getElementById('jb-ready-time').value;
  const strikeDate   = document.getElementById('jb-strike-date').value;
  const strikeTime   = document.getElementById('jb-strike-time').value;
  const contactName  = document.getElementById('jb-contact').value.trim();
  const jobTypes     = [...document.querySelectorAll('#jb-type-chips .type-chip.active')].map(b => b.dataset.type);
  const locType      = document.getElementById('jb-loc-type').value;
  const location     = locType ? {
    type:      locType,
    studioNum: locType === 'studio'     ? document.getElementById('jb-studio-num').value : '',
    address:   locType === 'onlocation' ? document.getElementById('jb-loc-addr').value   : '',
  } : null;

  const existingIdx = S.jobTasks.findIndex(jt => jt.taskId === tid);
  const entry = {
    id:          existingIdx >= 0 ? S.jobTasks[existingIdx].id : uid(),
    taskId:      tid,
    phaseId:     pid,
    name:        task.name,
    spec:        task.spec || '',
    crew:        task.crew,
    hrs:         task.hrs,
    assignedTo:  crewEntries,
    readyByDate,
    readyByTime,
    strikeDate,
    strikeTime,
    location,
    jobTypes,
    contactName,
    stages:      stagesData,
    status:      existingIdx >= 0 ? S.jobTasks[existingIdx].status : 'upcoming',
  };

  if (existingIdx >= 0) S.jobTasks[existingIdx] = entry;
  else S.jobTasks.push(entry);

  closeModal('jb-modal');
  // Refresh the button state in the row
  const btn = document.getElementById('jb-btn-' + tid);
  if (btn) { btn.className = 'job-btn active'; btn.textContent = '✓ Job Board'; btn.title = 'On job board — click to edit'; }
  dirty();
}

function removeFromJobBoard(tid) {
  if (!S.jobTasks) return;
  S.jobTasks = S.jobTasks.filter(jt => jt.taskId !== tid);
  const btn = document.getElementById('jb-btn-' + tid);
  if (btn) { btn.className = 'job-btn'; btn.textContent = '+ Job Board'; btn.title = 'Add to Job Board'; }
  closeModal('jb-modal');
  dirty();
}

// ── EXPORT ──
function toggleExportMenu() {
  const m = document.getElementById('exp-menu'), items = document.getElementById('exp-items');
  items.innerHTML = `
    <div class="export-item" onclick="openWin(buildProcessHTML())">HTML — Process overview</div>
    <div class="export-item" onclick="callPDF(buildProcessHTML(),'process')">PDF — Process overview</div>
    <div class="exp-div"></div>
    <div class="export-item" onclick="openWin(buildCombined())">HTML — Combined report</div>
    <div class="export-item" onclick="callPDF(buildCombined(),'full-report')">PDF — Combined report</div>`;
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
function openWin(html) { const w=window.open('','_blank'); if(w){w.document.write(html);w.document.close();} }
async function callPDF(html, suffix) {
  readMetaFromDOM();
  const name=(projectMeta.name||'project').replace(/\s+/g,'-').toLowerCase();
  const filename=`thelab-${name}-${suffix}`;
  try {
    const res=await fetch('/api/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({html,filename})});
    if(!res.ok) throw new Error((await res.json()).error);
    const blob=await res.blob();
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename+'.pdf';a.click();
  } catch(err) { alert('PDF error: '+err.message); }
}
function buildCoverPage(name, client, ver, date) {
  const s=App.getSettings(); const logo=s.logoText||'THE/LAB'; const footer=s.footerText||'All prices are estimates and exclude VAT';
  return `<div style="page-break-after:always;min-height:100vh;display:flex;flex-direction:column;justify-content:space-between;padding:60px 50px;background:#1a1a18"><div style="font-size:14px;font-weight:700;letter-spacing:2px;color:#f1efe8">${esc(logo)}</div><div><h1 style="font-size:44px;font-weight:700;color:#f1efe8;line-height:1.1;margin-bottom:14px">${esc(name)}</h1><p style="font-size:16px;color:#888780">${[esc(client),esc(ver),esc(date)].filter(Boolean).join(' · ')}</p></div><div style="font-size:11px;color:#5f5e5a">Generated ${new Date().toLocaleDateString('en-GB')} · ${esc(footer)}</div></div>`;
}
function buildProcessBody() {
  let totalMH=0,totalTasks=0,onSiteDays=0;
  S.process.phases.forEach(phase=>{if(phase.key.startsWith('d')&&/^d\d+$/.test(phase.key)&&phase.tasks.length)onSiteDays++;phase.tasks.forEach(t=>{totalMH+=(parseFloat(t.crew)||0)*(parseFloat(t.hrs)||0);totalTasks++;});});
  const phasesHTML=S.process.phases.map(phase=>{if(!phase.tasks.length)return'';const rowsHTML=phase.tasks.map(task=>{const mh=(parseFloat(task.crew)||0)*(parseFloat(task.hrs)||0);return`<tr><td>${esc(task.name)||'—'}${task.spec?`<br><span style="font-size:11px;color:#888780">${esc(task.spec)}</span>`:''}</td><td style="text-align:right">${task.crew||'—'}</td><td style="text-align:right">${task.hrs||'—'}</td><td style="text-align:right;font-weight:500">${mh||'—'}</td><td style="color:#888780">${esc(task.hold)||'—'}</td><td style="font-size:11px;color:#888780">${esc(task.note)||''}</td></tr>`;}).join('');return`<div style="margin-bottom:20px"><div style="margin-bottom:8px"><span style="display:inline-block;font-size:10px;font-weight:600;padding:3px 10px;border-radius:20px;background:${phase.bg};color:${phase.text}">${esc(phase.label)}</span></div><table><thead><tr><th style="width:32%">Task</th><th class="r" style="width:8%">Crew</th><th class="r" style="width:8%">Hours</th><th class="r" style="width:10%">Man-hrs</th><th style="width:14%">Allocation</th><th>Note</th></tr></thead><tbody>${rowsHTML}</tbody></table></div>`;}).join('');
  const settings=App.getSettings(); const footerText=settings.footerText||'All prices are estimates and exclude VAT';
  return `<div class="grid"><div class="sc"><div class="sn">${onSiteDays}</div><div class="sl">On-site days</div></div><div class="sc"><div class="sn">${totalMH}</div><div class="sl">Man-hours total</div></div><div class="sc"><div class="sn">${totalTasks}</div><div class="sl">Tasks</div></div></div>${phasesHTML}<div class="footer"><span>The/Lab · ${esc(projectMeta.name||'')}${projectMeta.client?' / '+esc(projectMeta.client):''}</span><span>${esc(projectMeta.version||'')} · ${esc(footerText)}</span></div>`;
}
function buildEstimateBody(internal, cur, rate) {
  // Minimal version for combined report — reads from S.estimate
  const showFX=cur!=='DKK'; let totSale=0,totCost=0;
  const catHTML=S.estimate.sections.map(sec=>{const rowsHTML=sec.rows.map(row=>{const q=parseFloat(row.qty)||0,s=parseFloat(row.sale)||0,c=parseFloat(row.cost)||0;const st=q*s,ct=q*c;totSale+=st;totCost+=ct;const pct=st&&ct?(st-ct)/st*100:null;const fxCell=showFX?`<td style="text-align:right;color:#888780">${st?fmtFX(st,cur,rate):'—'}</td>`:'';return`<tr><td>${esc(row.what)||'—'}</td><td style="color:#888780">${row.qty?esc(row.qty)+' '+esc(row.unit):'—'}</td><td style="text-align:right">${s?Math.round(s).toLocaleString('en-GB')+' DKK':'—'}</td><td style="text-align:right;font-weight:500">${st?Math.round(st).toLocaleString('en-GB')+' DKK':'—'}</td>${fxCell}</tr>`;}).join('');return`<tr class="cat-row"><td colspan="99">${esc(sec.name)}</td></tr>${rowsHTML}`;}).join('');
  const cols=showFX?5:4;
  return `<table><thead><tr><th>Description</th><th>Qty / unit</th><th class="r">Price/unit</th><th class="r">Price (DKK)</th>${showFX?`<th class="r">Price (${cur})</th>`:''}</tr></thead><tbody>${catHTML}</tbody><tfoot><tr class="tr"><td colspan="${cols-1}">Total DKK</td><td>${Math.round(totSale).toLocaleString('en-GB')} DKK</td></tr></tfoot></table>`;
}
function buildProcessHTML() {
  readMetaFromDOM(); const {name,client,version:ver,date}=projectMeta; const cover=buildCoverPage(name,client,ver,date); const body=buildProcessBody();
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(name)} — Process</title><style>${App.exportCSS}.wrap{max-width:900px}.grid{grid-template-columns:repeat(3,1fr)}</style></head><body>${cover}<div class="wrap"><div class="hdr"><div><h1>${esc(name)} — Process Overview</h1><p class="sub">${[esc(client),ver,date].filter(Boolean).join(' · ')}</p></div><div class="logo">THE/LAB</div></div>${body}</div></body></html>`;
}
function buildCombined() {
  readMetaFromDOM(); const {name,client,version:ver,date,currency:cur}=projectMeta; const cover=buildCoverPage(name,client,ver,date);
  const eB=buildEstimateBody(true,cur,1); const pB=buildProcessBody();
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(name)} — Full Report</title><style>${App.exportCSS}.wrap{max-width:1100px}.grid{grid-template-columns:repeat(4,1fr)}</style></head><body>${cover}<div class="wrap"><div class="hdr"><div><h1>${esc(name)} — Full Report</h1><p class="sub">${[esc(client),ver,date].filter(Boolean).join(' · ')}</p></div><div class="logo">THE/LAB</div></div><div class="section-title">Estimate</div>${eB}<div class="section-title">Process Overview</div>${pB}</div></body></html>`;
}
function fmtFX(n, cur, rate) { return (cur==='EUR'?'€':'$')+(n/rate).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2}); }

// ── SAVE / LOAD ──
function saveProject() {
  readMetaFromDOM();
  const name = projectMeta.name || 'Untitled';
  const projects = App.getSavedProjects();
  const existing = projects.find(p => p.name === name);
  const key = (existing && existing._key) || App.newProjectKey();
  if (!projectMeta.key) projectMeta.key = key;
  App.saveProjectData(key, projectMeta, S);
  document.getElementById('dirty-ind').style.display = 'none';
  App.clearDraft();
  renderSavedList();
}
function renderSavedList() {
  const el = document.getElementById('saved-list');
  const projects = App.getSavedProjects();
  if (!projects.length) { el.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:3px">No saved projects</div>'; return; }
  el.innerHTML = projects.map(p => {
    return `<div class="sv-item" onclick="loadProject('${p._key}')">
      <div class="sv-name">${esc(p.name||'Untitled')}${p.client?` <span style="color:var(--text3)">/ ${esc(p.client)}</span>`:''}</div>
      <span class="sv-dup" onclick="dupSaved('${p._key}',event)">⧉</span>
      <span class="sv-del" onclick="delSaved('${p._key}',event)">✕</span>
    </div>`;
  }).join('');
}
function loadProject(key) {
  const d = App.loadProjectByKey(key); if (!d) { alert('Could not load project'); return; }
  Object.assign(S, d.S);
  Object.assign(projectMeta, {key, name:d.name||'', client:d.client||'', version:d.version||'V1', date:d.date||'', currency:d.currency||'DKK', status:d.status||'active'});
  applyMetaToDOM();
  renderAssignOpts(); renderProcess(); renderSavedList();
  document.getElementById('dirty-ind').style.display = 'none';
}
function delSaved(key, e) { e.stopPropagation(); if(confirm('Delete this project?')) { App.deleteProject(key); renderSavedList(); } }
function dupSaved(key, e) { e.stopPropagation(); App.duplicateProject(key); renderSavedList(); }
function newProject() {
  const settings = App.getSettings();
  const defaultOpts = settings.allocationOptions && settings.allocationOptions.length ? settings.allocationOptions : ['Team A','Team B','Both teams','External'];
  projectMeta = {key:null,name:'',client:'',version:'V1',date:new Date().toISOString().slice(0,10),currency:'DKK',status:'active'};
  S = {
    estimate:{sections:[{id:uid(),name:'Labour',rows:[]},{id:uid(),name:'Materials',rows:[]},{id:uid(),name:'Technical',rows:[]}]},
    process:{phases:DEFAULT_PHASES.map(p=>({id:uid(),key:p.key,label:p.label,bg:p.bg,text:p.text,tasks:[]}))},
    assignOpts:[...defaultOpts], jobTasks:[], overrides:{},
  };
  applyMetaToDOM(); renderAssignOpts(); renderProcess(); dirty();
}
