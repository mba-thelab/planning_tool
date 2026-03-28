'use strict';
// Depends on app.js: App, Jobs, uid, esc, fmtDKK, fmtDate, fmtDateRange, PALETTE, DEFAULT_PHASES, closeModal

// ── STATE ──
let currentJob = null;
let currentTab = 'plan';
let quoteView  = 'internal'; // 'internal' | 'client'
let _saveTimer = null;
let _pendingSchedId = null;  // null = new entry, string = editing existing

const DEPTS    = ['Set-build', 'Production', 'Booking', 'Rental', 'Assistants', 'Kitchen'];
const STATUSES = {
  inquiry:       { label: 'Inquiry',       color: 'var(--text2)' },
  active:        { label: 'Active',        color: '#b5d4f4' },
  'in-production':{ label: 'In Production', color: '#fac775' },
  delivered:     { label: 'Delivered',     color: '#9fe1cb' },
  invoiced:      { label: 'Invoiced',      color: '#cecbf6' },
};

// ── INIT ──
(function init() {
  const params = new URLSearchParams(window.location.search);
  const id     = params.get('id');

  if (id) currentJob = Jobs.load(id);
  if (!currentJob) {
    currentJob = Jobs.blank();
    history.replaceState(null, '', '/job.html?id=' + currentJob.id);
  }

  // Data integrity
  if (!currentJob.plan || !Array.isArray(currentJob.plan.phases))
    currentJob.plan = { phases: DEFAULT_PHASES.map(p => ({ id:uid(), key:p.key, label:p.label, bg:p.bg, text:p.text, tasks:[] })) };
  if (!currentJob.quote) currentJob.quote = { materials:[], externals:[], overrides:{} };
  if (!Array.isArray(currentJob.quote.materials))  currentJob.quote.materials  = [];
  if (!Array.isArray(currentJob.quote.externals))  currentJob.quote.externals  = [];
  if (!currentJob.quote.overrides)                  currentJob.quote.overrides  = {};
  if (!Array.isArray(currentJob.schedule))          currentJob.schedule         = [];

  document.getElementById('job-title').value  = currentJob.title  || '';
  document.getElementById('job-status').value = currentJob.status || 'inquiry';
  updateStatusStyle();
  updateBreadcrumb();

  renderSidebar();
  renderPlan();
  renderQuote();
  renderSchedule();
})();

// ── SAVE / DIRTY ──
function dirty() {
  document.getElementById('dirty-ind').style.display = 'inline';
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveJob, 2000);
}

function saveJob() {
  currentJob.title  = document.getElementById('job-title').value.trim();
  currentJob.status = document.getElementById('job-status').value;
  Jobs.save(currentJob);
  document.getElementById('dirty-ind').style.display = 'none';
}

// ── TOPBAR ──
function onTitleInput() {
  currentJob.title = document.getElementById('job-title').value.trim();
  updateBreadcrumb();
  dirty();
}

function onStatusChange() {
  currentJob.status = document.getElementById('job-status').value;
  updateStatusStyle();
  dirty();
}

function updateStatusStyle() {
  const sel = document.getElementById('job-status');
  sel.style.color = (STATUSES[sel.value] || STATUSES.inquiry).color;
}

function updateBreadcrumb() {
  const el     = document.getElementById('breadcrumb');
  const client = currentJob.client.name;
  const title  = currentJob.title;
  el.textContent = client && title ? client.toUpperCase() + ' — ' + title
                 : client          ? client.toUpperCase()
                 : title           ? title
                 :                   'New job';
  document.title = 'The/Lab — ' + (title || client || 'New job');
}

// ── TABS ──
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.job-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.job-tab-panel').forEach(p => p.style.display = p.id === 'tab-' + tab ? '' : 'none');

  const exportBtn = document.getElementById('export-btn');
  const viewBtn   = document.getElementById('q-view-toggle-btn');
  exportBtn.style.display = tab === 'quote' ? '' : 'none';
  viewBtn.style.display   = tab === 'quote' ? '' : 'none';
}

// ── SIDEBAR ──
function renderSidebar() {
  const j = currentJob;
  const deptChips = DEPTS.map(d =>
    `<button class="dept-chip${j.departments.includes(d) ? ' active' : ''}" onclick="toggleDept('${d}')">${d}</button>`
  ).join('');

  document.getElementById('sidebar').innerHTML = `
    <div>
      <div class="sb-lbl">Client</div>
      <input class="sb-in" placeholder="Client name..." value="${esc(j.client.name)}"
        oninput="currentJob.client.name=this.value;dirty();updateBreadcrumb()" style="margin-bottom:4px">
      <input class="sb-in" placeholder="Contact person..." value="${esc(j.client.contact)}"
        oninput="currentJob.client.contact=this.value;dirty()" style="margin-bottom:4px">
      <input class="sb-in" placeholder="Email..." value="${esc(j.client.email)}"
        oninput="currentJob.client.email=this.value;dirty()">
    </div>
    <div>
      <div class="sb-lbl">Dates</div>
      <input class="sb-in" type="date" value="${j.dateStart}"
        oninput="currentJob.dateStart=this.value;dirty()" style="margin-bottom:4px" title="Start date">
      <input class="sb-in" type="date" value="${j.dateEnd}"
        oninput="currentJob.dateEnd=this.value;dirty()" title="End date">
    </div>
    <div>
      <div class="sb-lbl">Departments</div>
      <div class="dept-chips" id="dept-chips">${deptChips}</div>
    </div>
    <div>
      <div class="sb-lbl">Currency</div>
      <select class="sb-in" onchange="currentJob.currency=this.value;dirty();renderQuote()">
        <option value="DKK"${j.currency==='DKK'?' selected':''}>DKK</option>
        <option value="EUR"${j.currency==='EUR'?' selected':''}>EUR</option>
        <option value="USD"${j.currency==='USD'?' selected':''}>USD</option>
      </select>
    </div>
    <div id="sb-stats"></div>
  `;
  updateSidebarStats();
}

function toggleDept(dept) {
  const idx = currentJob.departments.indexOf(dept);
  if (idx === -1) currentJob.departments.push(dept);
  else currentJob.departments.splice(idx, 1);
  dirty();
  document.getElementById('dept-chips').innerHTML = DEPTS.map(d =>
    `<button class="dept-chip${currentJob.departments.includes(d) ? ' active' : ''}" onclick="toggleDept('${d}')">${d}</button>`
  ).join('');
}

function updateSidebarStats() {
  let totalMH = 0;
  currentJob.plan.phases.forEach(ph =>
    ph.tasks.forEach(t => { totalMH += (parseFloat(t.crewCount)||0) * (parseFloat(t.hrs)||0); })
  );
  const manDays  = totalMH ? (totalMH / 8).toFixed(1).replace(/\.0$/, '') : '—';
  const { sale, cost } = calcQuoteTotals();
  const margin   = sale > 0 ? ((sale - cost) / sale * 100) : null;
  const target   = App.getGlobal().rates.targetMargin || 20;
  const mCol     = margin === null ? 'var(--text3)'
                 : margin >= target         ? '#9fe1cb'
                 : margin >= target - 10    ? '#fac775' : '#f09595';

  const el = document.getElementById('sb-stats');
  if (!el) return;
  el.innerHTML = `
    <div class="sb-lbl" style="margin-top:2px">Summary</div>
    <div class="sum-box">
      <div class="sum-row"><span class="sum-lbl">Man-days</span><span class="sum-val">${manDays}</span></div>
      <div class="sum-row"><span class="sum-lbl">Man-hours</span><span class="sum-val">${totalMH || '—'}</span></div>
      <hr class="sum-div">
      <div class="sum-row"><span class="sum-lbl">Revenue</span><span class="sum-val">${sale ? fmtDKK(sale) : '—'}</span></div>
      <div class="sum-row"><span class="sum-lbl">Cost</span><span class="sum-val">${cost ? fmtDKK(cost) : '—'}</span></div>
      ${margin !== null ? `<div class="sum-row"><span class="sum-lbl">Margin</span><span class="sum-val" style="color:${mCol}">${margin.toFixed(1)}%</span></div>` : ''}
    </div>
  `;
}

// ══════════════════════════════════════
// PLAN TAB
// ══════════════════════════════════════

function renderPlan() {
  const area = document.getElementById('tab-plan');
  area.innerHTML = '';

  // Summary cards
  let totalMH = 0, totalTasks = 0;
  currentJob.plan.phases.forEach(ph =>
    ph.tasks.forEach(t => { totalMH += (parseFloat(t.crewCount)||0) * (parseFloat(t.hrs)||0); totalTasks++; })
  );
  const g = App.getGlobal();
  const costPerDay = g.rates.defaultCostRate || 0;
  const estCost = costPerDay ? ((totalMH / 8) * costPerDay) : null;

  const summary = document.createElement('div');
  summary.className = 'plan-summary';
  summary.innerHTML = `
    <div class="plan-card"><div class="plan-num">${(totalMH/8).toFixed(1).replace(/\.0$/,'') || 0}</div><div class="plan-lbl">Man-days</div></div>
    <div class="plan-card"><div class="plan-num">${totalMH || 0}</div><div class="plan-lbl">Man-hours</div></div>
    <div class="plan-card"><div class="plan-num">${totalTasks}</div><div class="plan-lbl">Tasks</div></div>
    <div class="plan-card"><div class="plan-num" style="font-size:15px">${estCost ? fmtDKK(estCost) : '—'}</div><div class="plan-lbl">Est. labour cost</div></div>
  `;
  area.appendChild(summary);

  // Phase blocks
  currentJob.plan.phases.forEach(ph => area.appendChild(buildPhaseBlock(ph)));

  // Add phase
  const addBtn = document.createElement('button');
  addBtn.className = 'add-section-btn';
  addBtn.textContent = '+ Add phase';
  addBtn.onclick = addPhase;
  area.appendChild(addBtn);
}

function buildPhaseBlock(phase) {
  const phaseMH = phase.tasks.reduce((s,t) => s + (parseFloat(t.crewCount)||0)*(parseFloat(t.hrs)||0), 0);
  const wrap = document.createElement('div');
  wrap.className = 'section-block';
  wrap.id = 'phase-' + phase.id;

  wrap.innerHTML = `
    <div class="phase-hdr">
      <div class="phase-accent-bar" style="background:${phase.bg};cursor:pointer"
        onclick="openColorModal('${phase.id}')" title="Change colour"></div>
      <input class="phase-hdr-name" value="${esc(phase.label)}"
        oninput="getPhase('${phase.id}').label=this.value;dirty()">
      <span style="font-size:11px;color:var(--text2);margin-left:4px" id="phase-mh-${phase.id}">${phaseMH ? phaseMH + ' mh' : ''}</span>
      <button class="del-section-btn" style="margin-left:auto" onclick="deletePhase('${phase.id}')">✕</button>
    </div>
    <div style="overflow-x:auto">
      <table class="tbl">
        <thead><tr>
          <th style="width:22px"></th>
          <th style="width:22%">Task</th>
          <th style="width:14%">Spec</th>
          <th class="r" style="width:60px">Crew</th>
          <th class="r" style="width:60px">Hours</th>
          <th class="r" style="width:70px">Man-hrs</th>
          <th style="width:14%">Assigned</th>
          <th>Note</th>
          <th style="width:28px"></th>
        </tr></thead>
        <tbody id="ptb-${phase.id}"></tbody>
        <tfoot><tr><td colspan="99" class="tbl-footer">
          <button class="add-row-btn" onclick="addTask('${phase.id}')">+ Add task</button>
        </td></tr></tfoot>
      </table>
    </div>
  `;

  // Render existing tasks
  const tb = wrap.querySelector('tbody');
  phase.tasks.forEach(t => tb.appendChild(buildTaskRow(phase.id, t)));

  return wrap;
}

function buildTaskRow(phaseId, task) {
  const mh = (parseFloat(task.crewCount)||0) * (parseFloat(task.hrs)||0);
  const tr = document.createElement('tr');
  tr.id = 'tr-' + task.id;

  // Build assigned select
  const employees = (App.getGlobal().employees || []).map(e => e.name);
  const assignOpts = ['', ...employees].map(n =>
    `<option${n === task.assignedTo ? ' selected' : ''}>${esc(n)}</option>`
  ).join('');

  tr.innerHTML = `
    <td><div class="move-btns">
      <button class="mb" onclick="movePTask('${phaseId}','${task.id}',-1)">▲</button>
      <button class="mb" onclick="movePTask('${phaseId}','${task.id}',1)">▼</button>
    </div></td>
    <td><input class="ei" placeholder="Task name..." value="${esc(task.name)}"
      oninput="getTask('${phaseId}','${task.id}').name=this.value;dirty()"></td>
    <td><input class="ei" placeholder="Spec..." value="${esc(task.spec)}"
      oninput="getTask('${phaseId}','${task.id}').spec=this.value;dirty()"></td>
    <td><input class="ei r" value="${task.crewCount}" style="width:44px"
      oninput="getTask('${phaseId}','${task.id}').crewCount=this.value;updateTaskMH('${phaseId}','${task.id}')"></td>
    <td><input class="ei r" value="${task.hrs}" style="width:44px"
      oninput="getTask('${phaseId}','${task.id}').hrs=this.value;updateTaskMH('${phaseId}','${task.id}')"></td>
    <td class="cc" id="mh-${task.id}">${mh || '—'}</td>
    <td><select class="esel" onchange="getTask('${phaseId}','${task.id}').assignedTo=this.value;dirty()">
      ${assignOpts}
    </select></td>
    <td>${buildNoteCell(phaseId, task.id, task.note)}</td>
    <td><button class="rd" onclick="deleteTask('${phaseId}','${task.id}')">×</button></td>
  `;
  return tr;
}

function buildNoteCell(phaseId, tid, note) {
  return note
    ? `<div class="note-wrap"><span class="note-short" onclick="openNote('${phaseId}','${tid}')" title="${esc(note)}">${esc(note)}</span></div>`
    : `<div class="note-wrap"><span class="note-add" onclick="openNote('${phaseId}','${tid}')">+ note</span></div>`;
}

function openNote(phaseId, tid) {
  const task = getTask(phaseId, tid);
  const val  = prompt('Note:', task.note || '');
  if (val === null) return;
  task.note = val.trim();
  dirty();
  // Refresh just the note cell
  const tr = document.getElementById('tr-' + tid);
  if (tr) {
    const noteTd = tr.cells[7];
    noteTd.innerHTML = buildNoteCell(phaseId, tid, task.note);
  }
}

// ── PLAN HELPERS ──
function getPhase(id)            { return currentJob.plan.phases.find(p => p.id === id); }
function getTask(phaseId, tid)   { return getPhase(phaseId).tasks.find(t => t.id === tid); }

function addPhase() {
  const p = DEFAULT_PHASES[currentJob.plan.phases.length % DEFAULT_PHASES.length];
  const phase = { id:uid(), key:'custom', label:'New phase', bg:p.bg, text:p.text, tasks:[] };
  currentJob.plan.phases.push(phase);
  dirty();

  const area   = document.getElementById('tab-plan');
  const addBtn = area.querySelector('.add-section-btn');
  area.insertBefore(buildPhaseBlock(phase), addBtn);
  updateSidebarStats();
}

function deletePhase(id) {
  if (!confirm('Delete this phase and all its tasks?')) return;
  currentJob.plan.phases = currentJob.plan.phases.filter(p => p.id !== id);
  document.getElementById('phase-' + id)?.remove();
  dirty();
  renderPlan(); // re-render to update summary cards
}

function addTask(phaseId) {
  const task = { id:uid(), name:'', spec:'', crewCount:2, hrs:8, assignedTo:'', note:'' };
  getPhase(phaseId).tasks.push(task);
  document.getElementById('ptb-' + phaseId).appendChild(buildTaskRow(phaseId, task));
  updateTaskMH(phaseId, task.id);
  dirty();
}

function deleteTask(phaseId, tid) {
  getPhase(phaseId).tasks = getPhase(phaseId).tasks.filter(t => t.id !== tid);
  document.getElementById('tr-' + tid)?.remove();
  recalcPhaseMH(phaseId);
  dirty();
  updateSidebarStats();
}

function movePTask(phaseId, tid, dir) {
  const tasks = getPhase(phaseId).tasks;
  const idx   = tasks.findIndex(t => t.id === tid);
  const to    = idx + dir;
  if (to < 0 || to >= tasks.length) return;
  [tasks[idx], tasks[to]] = [tasks[to], tasks[idx]];
  dirty();
  // Re-render just that phase's rows
  const tb = document.getElementById('ptb-' + phaseId);
  tb.innerHTML = '';
  tasks.forEach(t => tb.appendChild(buildTaskRow(phaseId, t)));
}

function updateTaskMH(phaseId, tid) {
  const task = getTask(phaseId, tid);
  const mh   = (parseFloat(task.crewCount)||0) * (parseFloat(task.hrs)||0);
  const el   = document.getElementById('mh-' + tid);
  if (el) el.textContent = mh || '—';
  recalcPhaseMH(phaseId);
  updateSidebarStats();
  dirty();
}

function recalcPhaseMH(phaseId) {
  const phase  = getPhase(phaseId);
  const total  = phase.tasks.reduce((s,t) => s + (parseFloat(t.crewCount)||0)*(parseFloat(t.hrs)||0), 0);
  const el     = document.getElementById('phase-mh-' + phaseId);
  if (el) el.textContent = total ? total + ' mh' : '';
  // Also update summary cards
  const cards  = document.getElementById('tab-plan')?.querySelector('.plan-summary');
  if (!cards) return;
  let gTotal = 0, gTasks = 0;
  currentJob.plan.phases.forEach(ph =>
    ph.tasks.forEach(t => { gTotal += (parseFloat(t.crewCount)||0)*(parseFloat(t.hrs)||0); gTasks++; })
  );
  const g      = App.getGlobal();
  const cpd    = g.rates.defaultCostRate || 0;
  const est    = cpd ? fmtDKK((gTotal/8)*cpd) : '—';
  cards.children[0].querySelector('.plan-num').textContent = (gTotal/8).toFixed(1).replace(/\.0$/,'') || 0;
  cards.children[1].querySelector('.plan-num').textContent = gTotal || 0;
  cards.children[2].querySelector('.plan-num').textContent = gTasks;
  cards.children[3].querySelector('.plan-num').textContent = est;
}

// ── COLOR PICKER ──
let _colorPhaseId = null;
function openColorModal(phaseId) {
  _colorPhaseId = phaseId;
  document.getElementById('color-swatches').innerHTML = PALETTE.map(c =>
    `<div class="cp-swatch" style="background:${c.bg}" title="${c.label}"
      onclick="setPhaseColor('${c.bg}','${c.text}');closeModal('color-modal')"></div>`
  ).join('');
  document.getElementById('color-modal').classList.add('open');
}
function setPhaseColor(bg, text) {
  const phase = getPhase(_colorPhaseId);
  if (!phase) return;
  phase.bg = bg; phase.text = text;
  const bar = document.querySelector(`#phase-${_colorPhaseId} .phase-accent-bar`);
  if (bar) bar.style.background = bg;
  dirty();
}

// ══════════════════════════════════════
// QUOTE TAB
// ══════════════════════════════════════

function renderQuote() {
  const area  = document.getElementById('tab-quote');
  const g     = App.getGlobal();
  const cpd   = g.rates.defaultCostRate || 0;
  const spd   = g.rates.defaultSaleRate || 0;
  const isClient = quoteView === 'client';

  area.innerHTML = '';

  // ── LABOUR (auto from plan) ──
  const labourSection = document.createElement('div');
  labourSection.className = 'q-section';
  labourSection.innerHTML = `
    <div class="q-section-hdr">
      <span class="q-section-title">Labour <span style="color:var(--text3);font-size:10px;margin-left:6px;text-transform:none;letter-spacing:0">— from Plan</span></span>
    </div>
  `;

  const labourTable = document.createElement('table');
  labourTable.className = 'tbl';
  labourTable.innerHTML = `<thead><tr>
    <th style="width:4px"></th>
    <th>Phase</th>
    <th class="r">Man-hrs</th>
    <th class="r">Man-days</th>
    ${!isClient ? `<th class="r">Cost/day</th>` : ''}
    <th class="r">Sale/day</th>
    ${!isClient ? `<th class="r">Total cost</th>` : ''}
    <th class="r">Total sale</th>
  </tr></thead>`;

  const labourBody = document.createElement('tbody');
  currentJob.plan.phases.forEach(ph => {
    const mh   = ph.tasks.reduce((s,t) => s + (parseFloat(t.crewCount)||0)*(parseFloat(t.hrs)||0), 0);
    const days = mh / 8;
    const ov   = (currentJob.quote.overrides || {})[ph.id] || {};
    const cpd_ = ov.costPerDay !== undefined ? ov.costPerDay : cpd;
    const spd_ = ov.salePerDay !== undefined ? ov.salePerDay : spd;
    const tc   = days * cpd_;
    const ts   = days * spd_;
    const tr   = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding:0;width:4px"><div style="width:4px;height:100%;background:${ph.bg};min-height:32px"></div></td>
      <td style="color:var(--hi);font-weight:400">${esc(ph.label)}</td>
      <td class="cc">${mh || '—'}</td>
      <td class="cc">${days ? days.toFixed(1).replace(/\.0$/,'') : '—'}</td>
      ${!isClient ? `<td><input class="ei r" style="width:80px" value="${cpd_}"
        oninput="setLabourOverride('${ph.id}','costPerDay',this.value);updateQuoteTotals()"></td>` : ''}
      <td><input class="ei r" style="width:80px" value="${spd_}"
        oninput="setLabourOverride('${ph.id}','salePerDay',this.value);updateQuoteTotals()"></td>
      ${!isClient ? `<td class="cc" id="qtc-${ph.id}">${tc ? fmtDKK(tc) : '—'}</td>` : ''}
      <td class="cc" id="qts-${ph.id}">${ts ? fmtDKK(ts) : '—'}</td>
    `;
    labourBody.appendChild(tr);
  });
  labourTable.appendChild(labourBody);
  labourSection.appendChild(labourTable);
  area.appendChild(labourSection);

  // ── MATERIALS ──
  area.appendChild(buildLineSection('materials', 'Materials', isClient));

  // ── EXTERNALS / SUBCONTRACTORS ──
  area.appendChild(buildLineSection('externals', 'External & Subcontractors', isClient));

  // ── TOTALS ──
  const { sale, cost } = calcQuoteTotals();
  const margin = sale > 0 ? ((sale - cost) / sale * 100) : null;
  const target = g.rates.targetMargin || 20;
  const mCol   = margin === null ? 'var(--text3)'
               : margin >= target       ? '#9fe1cb'
               : margin >= target - 10  ? '#fac775' : '#f09595';

  const totBar = document.createElement('div');
  totBar.className = 'q-total-bar';
  totBar.id = 'q-total-bar';
  totBar.innerHTML = `
    ${!isClient ? `<div class="q-total-item"><div class="q-total-lbl">Total cost</div><div class="q-total-val" id="qt-cost">${cost ? fmtDKK(cost) : '—'}</div></div>` : ''}
    <div class="q-total-item"><div class="q-total-lbl">Total revenue</div><div class="q-total-val" id="qt-sale">${sale ? fmtDKK(sale) : '—'}</div></div>
    ${!isClient && margin !== null ? `<div class="q-total-item"><div class="q-total-lbl">Margin</div><div class="q-total-val q-margin-val" id="qt-margin" style="color:${mCol}">${margin.toFixed(1)}%</div></div>` : ''}
  `;
  area.appendChild(totBar);

  updateSidebarStats();
}

function buildLineSection(key, title, isClient) {
  const rows = currentJob.quote[key] || [];
  const sec  = document.createElement('div');
  sec.className = 'q-section';
  sec.innerHTML = `
    <div class="q-section-hdr">
      <span class="q-section-title">${title}</span>
    </div>
  `;

  const tbl  = document.createElement('table');
  tbl.className = 'tbl';
  tbl.innerHTML = `<thead><tr>
    <th style="width:22%">Description</th>
    <th style="width:12%">Spec</th>
    <th class="r" style="width:55px">Qty</th>
    <th style="width:60px">Unit</th>
    ${!isClient ? `<th class="r" style="width:90px">Cost/unit</th>
    <th class="r" style="width:65px">Markup %</th>` : ''}
    <th class="r" style="width:90px">Sale/unit</th>
    <th class="r" style="width:100px">Total</th>
    <th style="width:28px"></th>
  </tr></thead>`;

  const tbody = document.createElement('tbody');
  tbody.id = 'qtb-' + key;
  rows.forEach(row => tbody.appendChild(buildLineRow(key, row, isClient)));
  tbl.appendChild(tbody);
  sec.appendChild(tbl);

  // Add row button
  const addBtn = document.createElement('button');
  addBtn.className = 'add-row-btn';
  addBtn.style.cssText = 'display:block;margin-top:6px';
  addBtn.textContent = '+ Add row';
  addBtn.onclick = () => addLineRow(key);
  sec.appendChild(addBtn);

  return sec;
}

function buildLineRow(key, row, isClient) {
  const sale  = parseFloat(row.cost || 0) * (1 + (parseFloat(row.markup || 0) / 100));
  const total = (parseFloat(row.qty || 0)) * sale;
  const tr    = document.createElement('tr');
  tr.id       = 'qr-' + row.id;
  tr.innerHTML = `
    <td><input class="ei" placeholder="Description..." value="${esc(row.what)}"
      oninput="getLineRow('${key}','${row.id}').what=this.value;dirty()"></td>
    <td><input class="ei" placeholder="Spec..." value="${esc(row.spec)}"
      oninput="getLineRow('${key}','${row.id}').spec=this.value;dirty()"></td>
    <td><input class="ei r" value="${row.qty}" style="width:44px"
      oninput="getLineRow('${key}','${row.id}').qty=this.value;refreshLineRow('${key}','${row.id}');updateQuoteTotals()"></td>
    <td><select class="esel" onchange="getLineRow('${key}','${row.id}').unit=this.value;dirty()">
      ${['pcs','m','m²','lin.m','hrs','days','kg','l','—'].map(u =>
        `<option${u===row.unit?' selected':''}>${u}</option>`).join('')}
    </select></td>
    ${!isClient ? `
    <td><input class="ei r" value="${row.cost}" style="width:80px"
      oninput="getLineRow('${key}','${row.id}').cost=this.value;refreshLineRow('${key}','${row.id}');updateQuoteTotals()"></td>
    <td><input class="ei r" value="${row.markup}" style="width:52px" placeholder="20"
      oninput="getLineRow('${key}','${row.id}').markup=this.value;refreshLineRow('${key}','${row.id}');updateQuoteTotals()"></td>` : ''}
    <td class="cc" id="qsale-${row.id}">${sale ? fmtDKK(sale) : '—'}</td>
    <td class="cc" id="qtot-${row.id}">${total ? fmtDKK(total) : '—'}</td>
    <td><button class="rd" onclick="deleteLineRow('${key}','${row.id}')">×</button></td>
  `;
  return tr;
}

function getLineRow(key, id) { return (currentJob.quote[key] || []).find(r => r.id === id); }

function addLineRow(key) {
  const row = { id:uid(), what:'', spec:'', qty:1, unit:'pcs', cost:'', markup:20, note:'' };
  if (!currentJob.quote[key]) currentJob.quote[key] = [];
  currentJob.quote[key].push(row);
  const tbody = document.getElementById('qtb-' + key);
  if (tbody) tbody.appendChild(buildLineRow(key, row, quoteView === 'client'));
  dirty();
}

function deleteLineRow(key, id) {
  currentJob.quote[key] = (currentJob.quote[key] || []).filter(r => r.id !== id);
  document.getElementById('qr-' + id)?.remove();
  updateQuoteTotals();
  dirty();
}

function refreshLineRow(key, id) {
  const row  = getLineRow(key, id);
  const sale = parseFloat(row.cost || 0) * (1 + (parseFloat(row.markup || 0) / 100));
  const tot  = (parseFloat(row.qty || 0)) * sale;
  const sEl  = document.getElementById('qsale-' + id);
  const tEl  = document.getElementById('qtot-'  + id);
  if (sEl) sEl.textContent = sale ? fmtDKK(sale) : '—';
  if (tEl) tEl.textContent = tot  ? fmtDKK(tot)  : '—';
  dirty();
}

function setLabourOverride(phaseId, field, val) {
  if (!currentJob.quote.overrides) currentJob.quote.overrides = {};
  if (!currentJob.quote.overrides[phaseId]) currentJob.quote.overrides[phaseId] = {};
  currentJob.quote.overrides[phaseId][field] = parseFloat(val) || 0;
  // update cell
  const g   = App.getGlobal();
  const ov  = currentJob.quote.overrides[phaseId];
  const cpd = ov.costPerDay !== undefined ? ov.costPerDay : (g.rates.defaultCostRate || 0);
  const spd = ov.salePerDay !== undefined ? ov.salePerDay : (g.rates.defaultSaleRate || 0);
  const ph  = getPhase(phaseId);
  const days= ph ? ph.tasks.reduce((s,t) => s + (parseFloat(t.crewCount)||0)*(parseFloat(t.hrs)||0), 0) / 8 : 0;
  const tcEl = document.getElementById('qtc-' + phaseId);
  const tsEl = document.getElementById('qts-' + phaseId);
  if (tcEl) tcEl.textContent = days * cpd ? fmtDKK(days * cpd) : '—';
  if (tsEl) tsEl.textContent = days * spd ? fmtDKK(days * spd) : '—';
  dirty();
}

function calcQuoteTotals() {
  const g   = App.getGlobal();
  const cpd = g.rates.defaultCostRate || 0;
  const spd = g.rates.defaultSaleRate || 0;
  let sale  = 0, cost = 0;

  // Labour
  currentJob.plan.phases.forEach(ph => {
    const mh   = ph.tasks.reduce((s,t) => s + (parseFloat(t.crewCount)||0)*(parseFloat(t.hrs)||0), 0);
    const days = mh / 8;
    const ov   = (currentJob.quote.overrides || {})[ph.id] || {};
    cost += days * (ov.costPerDay !== undefined ? ov.costPerDay : cpd);
    sale += days * (ov.salePerDay !== undefined ? ov.salePerDay : spd);
  });

  // Materials + externals
  ['materials','externals'].forEach(key => {
    (currentJob.quote[key] || []).forEach(row => {
      const unitSale = parseFloat(row.cost||0) * (1 + (parseFloat(row.markup||0)/100));
      const qty      = parseFloat(row.qty || 0);
      cost += qty * parseFloat(row.cost  || 0);
      sale += qty * unitSale;
    });
  });

  return { sale, cost };
}

function updateQuoteTotals() {
  const { sale, cost } = calcQuoteTotals();
  const margin = sale > 0 ? ((sale - cost) / sale * 100) : null;
  const target = App.getGlobal().rates.targetMargin || 20;
  const mCol   = margin === null ? 'var(--text3)'
               : margin >= target       ? '#9fe1cb'
               : margin >= target - 10  ? '#fac775' : '#f09595';

  const costEl   = document.getElementById('qt-cost');
  const saleEl   = document.getElementById('qt-sale');
  const marginEl = document.getElementById('qt-margin');
  if (costEl)   costEl.textContent   = cost ? fmtDKK(cost) : '—';
  if (saleEl)   saleEl.textContent   = sale ? fmtDKK(sale) : '—';
  if (marginEl) { marginEl.textContent = margin !== null ? margin.toFixed(1) + '%' : '—'; marginEl.style.color = mCol; }
  updateSidebarStats();
}

function toggleQuoteView() {
  quoteView = quoteView === 'internal' ? 'client' : 'internal';
  document.getElementById('q-view-toggle-btn').textContent =
    quoteView === 'client' ? 'Internal view' : 'Client view';
  renderQuote();
}

// ── PDF EXPORT ──
function exportQuotePDF() {
  const j  = currentJob;
  const g  = App.getGlobal();
  const cpd= g.rates.defaultCostRate || 0;
  const spd= g.rates.defaultSaleRate || 0;
  const { sale, cost } = calcQuoteTotals();
  const margin = sale > 0 ? ((sale - cost) / sale * 100).toFixed(1) : null;

  // Build labour rows
  let labourRows = currentJob.plan.phases.map(ph => {
    const mh   = ph.tasks.reduce((s,t) => s + (parseFloat(t.crewCount)||0)*(parseFloat(t.hrs)||0), 0);
    if (!mh) return '';
    const days = mh / 8;
    const ov   = (currentJob.quote.overrides||{})[ph.id]||{};
    const spd_ = ov.salePerDay !== undefined ? ov.salePerDay : spd;
    return `<tr><td>${esc(ph.label)}</td><td class="r">${days.toFixed(1).replace(/\.0$/,'')} days</td><td class="r">${fmtDKK(days*spd_)}</td></tr>`;
  }).join('');

  const buildLineRows = (key) => (currentJob.quote[key]||[]).map(row => {
    const unitSale = parseFloat(row.cost||0)*(1+(parseFloat(row.markup||0)/100));
    const total    = parseFloat(row.qty||0)*unitSale;
    return `<tr><td>${esc(row.what)}${row.spec ? `<br><span style="font-size:11px;color:#888">${esc(row.spec)}</span>`:''}</td><td class="r">${row.qty} ${row.unit}</td><td class="r">${fmtDKK(total)}</td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#1a1a18;background:#fff;padding:48px}
    .logo{font-size:11px;font-weight:700;letter-spacing:3px;color:#1a1a18;text-transform:uppercase}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px}
    .job-title{font-size:24px;font-weight:300;color:#1a1a18;margin-bottom:4px}
    .job-meta{font-size:12px;color:#888;margin-bottom:2px}
    h2{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#888;margin:32px 0 10px;padding-bottom:6px;border-bottom:1px solid #e0e0e0}
    table{width:100%;border-collapse:collapse;margin-bottom:4px}
    td,th{padding:8px 10px;font-size:13px;text-align:left}
    th{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#888;border-bottom:1px solid #e0e0e0}
    td.r,th.r{text-align:right}
    tr:not(:last-child) td{border-bottom:1px solid #f0f0f0}
    .total-row{font-weight:600;font-size:15px;padding-top:16px;border-top:2px solid #1a1a18}
    .footer{margin-top:48px;font-size:11px;color:#aaa;border-top:1px solid #e0e0e0;padding-top:12px;display:flex;justify-content:space-between}
  </style></head><body>
    <div class="hdr">
      <div>
        <div class="job-title">${esc(j.title || 'Untitled job')}</div>
        <div class="job-meta">${esc(j.client.name || '')}</div>
        ${j.dateStart || j.dateEnd ? `<div class="job-meta">${fmtDateRange(j.dateStart, j.dateEnd)}</div>` : ''}
      </div>
      <div class="logo">THE/LAB</div>
    </div>

    ${labourRows ? `<h2>Labour</h2><table><thead><tr><th>Description</th><th class="r">Quantity</th><th class="r">Amount</th></tr></thead><tbody>${labourRows}</tbody></table>` : ''}
    ${(j.quote.materials||[]).length ? `<h2>Materials</h2><table><thead><tr><th>Description</th><th class="r">Quantity</th><th class="r">Amount</th></tr></thead><tbody>${buildLineRows('materials')}</tbody></table>` : ''}
    ${(j.quote.externals||[]).length ? `<h2>External & Subcontractors</h2><table><thead><tr><th>Description</th><th class="r">Quantity</th><th class="r">Amount</th></tr></thead><tbody>${buildLineRows('externals')}</tbody></table>` : ''}

    <table style="margin-top:24px"><tbody>
      <tr class="total-row"><td>Total</td><td class="r">${fmtDKK(sale)}</td></tr>
    </tbody></table>

    <div class="footer">
      <span>${g.exportDefaults?.footerText || 'All prices are estimates and exclude VAT'}</span>
      <span>${new Date().toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric'})}</span>
    </div>
  </body></html>`;

  const filename = (j.client.name || j.title || 'quote').replace(/[^a-z0-9]/gi, '_') + '_quote.pdf';
  fetch('/api/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, filename }),
  }).then(r => r.blob()).then(blob => {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }).catch(() => alert('PDF export failed. Make sure the server is running.'));
}

// ══════════════════════════════════════
// SCHEDULE TAB
// ══════════════════════════════════════

function renderSchedule() {
  const area = document.getElementById('tab-schedule');
  area.innerHTML = '';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn';
  addBtn.style.cssText = 'margin-bottom:16px';
  addBtn.textContent = '+ Add to Operations Board';
  addBtn.onclick = () => openSchedModal(null);
  area.appendChild(addBtn);

  if (!currentJob.schedule.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:var(--text3);font-size:12px;padding:20px 0';
    empty.textContent = 'No schedule entries yet. Add this job to the Operations Board.';
    area.appendChild(empty);
    return;
  }

  currentJob.schedule.forEach(entry => area.appendChild(buildSchedEntry(entry)));
}

function buildSchedEntry(entry) {
  const phase = currentJob.plan.phases.find(p => p.id === entry.phaseId);
  const bg    = phase ? phase.bg : 'var(--border)';
  const label = phase ? phase.label : 'Unlinked';
  const loc   = formatLocation(entry);
  const types = (entry.type || []).map(t => `<span class="job-type-badge ${t}">${t}</span>`).join(' ');

  const div = document.createElement('div');
  div.className = 'sched-entry';
  div.id = 'se-' + entry.id;
  div.innerHTML = `
    <div class="sched-phase-bar" style="background:${bg}"></div>
    <div class="sched-body">
      <div class="sched-info">
        <div class="sched-title">${esc(label)}${entry.note ? ` <span style="font-size:11px;color:var(--text2)">— ${esc(entry.note)}</span>` : ''}</div>
        <div class="sched-meta">${loc}${entry.dateStart || entry.dateEnd ? ` · ${fmtDateRange(entry.dateStart, entry.dateEnd)}` : ''}</div>
        ${types ? `<div style="margin-top:5px;display:flex;gap:4px">${types}</div>` : ''}
      </div>
      <div class="sched-actions">
        <span class="jb-chip" style="border-radius:20px">${entry.status || 'upcoming'}</span>
        <button class="btn ghost" style="font-size:11px;padding:3px 8px" onclick="openSchedModal('${entry.id}')">Edit</button>
        <button class="rd" onclick="deleteSchedEntry('${entry.id}')">×</button>
      </div>
    </div>
  `;
  return div;
}

function formatLocation(entry) {
  if (!entry.location) return '—';
  const loc = entry.location;
  if (loc.type === 'studio') return 'Studio ' + (loc.studioNum || '');
  const map = { floor4:'4th floor', forhallen:'Forhallen', equipment:'Equipment room', onlocation:'On location', other: loc.addr || 'Other' };
  return map[loc.type] || '—';
}

function openSchedModal(entryId) {
  _pendingSchedId = entryId;
  const entry = entryId ? currentJob.schedule.find(e => e.id === entryId) : null;

  // Populate phase dropdown
  const phSel = document.getElementById('sm-phase');
  phSel.innerHTML = `<option value="">— No specific phase —</option>` +
    currentJob.plan.phases.map(p => `<option value="${p.id}"${entry?.phaseId===p.id?' selected':''}>${esc(p.label)}</option>`).join('');

  // Dates
  document.getElementById('sm-date-start').value = entry?.dateStart || '';
  document.getElementById('sm-date-end').value   = entry?.dateEnd   || '';
  document.getElementById('sm-note').value        = entry?.note      || '';

  // Location
  const loc = entry?.location || {};
  document.getElementById('sm-loc').value = loc.type || '';
  document.getElementById('sm-studio-num').value = loc.studioNum || '';
  document.getElementById('sm-loc-addr').value   = loc.addr || '';
  onSmLocChange();

  // Type chips
  document.querySelectorAll('#sm-type-chips .type-chip').forEach(chip => {
    chip.classList.toggle('active', (entry?.type || []).includes(chip.dataset.type));
  });

  // Show/hide delete
  document.getElementById('sm-delete-btn').style.display = entryId ? '' : 'none';
  document.getElementById('sched-modal-title').textContent = entryId ? 'Edit schedule entry' : 'Add to Operations Board';
  document.getElementById('sched-modal').classList.add('open');
}

function onSmLocChange() {
  const val   = document.getElementById('sm-loc').value;
  const numEl = document.getElementById('sm-studio-num');
  const addrEl= document.getElementById('sm-loc-addr');
  numEl.style.display  = val === 'studio' ? '' : 'none';
  addrEl.style.display = (val === 'onlocation' || val === 'other') ? '' : 'none';
}

function confirmSchedEntry() {
  const phaseId = document.getElementById('sm-phase').value;
  const locType = document.getElementById('sm-loc').value;
  const entry = {
    id:        _pendingSchedId || uid(),
    phaseId:   phaseId || null,
    location: {
      type:      locType,
      studioNum: document.getElementById('sm-studio-num').value,
      addr:      document.getElementById('sm-loc-addr').value,
    },
    dateStart: document.getElementById('sm-date-start').value,
    dateEnd:   document.getElementById('sm-date-end').value,
    type:      [...document.querySelectorAll('#sm-type-chips .type-chip.active')].map(c => c.dataset.type),
    status:    'upcoming',
    note:      document.getElementById('sm-note').value.trim(),
  };

  if (_pendingSchedId) {
    const idx = currentJob.schedule.findIndex(e => e.id === _pendingSchedId);
    if (idx !== -1) currentJob.schedule[idx] = entry;
  } else {
    currentJob.schedule.push(entry);
  }

  closeModal('sched-modal');
  dirty();
  renderSchedule();
}

function deleteSchedEntry(id) {
  const targetId = id || _pendingSchedId;
  if (!targetId) return;
  currentJob.schedule = currentJob.schedule.filter(e => e.id !== targetId);
  closeModal('sched-modal');
  dirty();
  renderSchedule();
}
