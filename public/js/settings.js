'use strict';
// Depends on app.js

// Page guard — admin only
guardPage('settings');

let _editingEmpId = null; // null = new, string = editing existing

// ── INIT ──
(function init() {
  renderOrgTab();
  renderDefaultsTab();
  renderStagesTab();
  renderAppearanceTab();
  renderExportTab();
})();

// ── TABS ──
function switchTab(id) {
  document.querySelectorAll('.stab').forEach((el, i) => {
    el.classList.toggle('active', ['org','defaults','stages','appearance','export'][i] === id);
  });
  document.querySelectorAll('.stab-panel').forEach(el => el.classList.remove('active'));
  document.getElementById('panel-' + id).classList.add('active');
}

// ══════════════════════════════════════════
// PEOPLE & ORG TAB
// ══════════════════════════════════════════

function renderOrgTab() {
  renderDeptList();
  renderEmpList();
}

// ── DEPARTMENTS ──
function renderDeptList() {
  const global = App.getGlobal();
  const depts = global.departments || [];
  const el = document.getElementById('dept-list');
  if (!depts.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:8px 0 12px">No departments yet.</div>';
    return;
  }
  el.innerHTML = depts.map((dept, di) => {
    const subDeptTags = (dept.subDepts || []).map((sd, si) => `
      <span class="subdept-tag">${esc(sd.name)}
        <span class="rm" onclick="deleteSubDept('${dept.id}','${sd.id}')">✕</span>
      </span>`).join('');
    const teamLeaderOptions = (global.employees || [])
      .filter(e => e.deptId === dept.id)
      .map(e => `<option value="${e.id}"${e.id===dept.teamLeaderId?' selected':''}>${esc(e.name)}</option>`)
      .join('');
    return `<div class="dept-block">
      <div class="dept-name-row">
        <input class="dept-name-in" value="${esc(dept.name)}" placeholder="Department name..."
          oninput="updateDeptName('${dept.id}',this.value)">
        ${teamLeaderOptions ? `<select class="set-in" style="min-width:140px;font-size:11px" onchange="setTeamLeader('${dept.id}',this.value)" title="Team leader">
          <option value="">— No TL —</option>${teamLeaderOptions}
        </select>` : ''}
        <button class="btn danger" style="font-size:11px;padding:4px 8px" onclick="deleteDept('${dept.id}')">Delete dept</button>
      </div>
      <div class="subdept-list" id="subdepts-${dept.id}">${subDeptTags}</div>
      <div style="display:flex;gap:6px;align-items:center">
        <input class="rc-in" id="new-subdept-${dept.id}" placeholder="New sub-department..." style="flex:1"
          onkeydown="if(event.key==='Enter')addSubDept('${dept.id}')">
        <button class="add-inline-btn" style="margin-top:0" onclick="addSubDept('${dept.id}')">+ Add</button>
      </div>
    </div>`;
  }).join('');
}

function addDept() {
  const global = App.getGlobal();
  if (!global.departments) global.departments = [];
  global.departments.push({id: uid(), name: 'New Department', subDepts: [], teamLeaderId: null, teamLeaderMessage: ''});
  App.saveGlobal(global);
  renderDeptList();
  // Focus the new dept name
  setTimeout(() => {
    const inputs = document.querySelectorAll('.dept-name-in');
    if (inputs.length) inputs[inputs.length-1].focus();
  }, 50);
}

function updateDeptName(deptId, name) {
  const global = App.getGlobal();
  const dept = global.departments.find(d => d.id === deptId);
  if (dept) { dept.name = name; App.saveGlobal(global); }
}

function deleteDept(deptId) {
  if (!confirm('Delete this department? Employees assigned to it will lose their department.')) return;
  const global = App.getGlobal();
  global.departments = global.departments.filter(d => d.id !== deptId);
  // Unassign employees
  (global.employees || []).forEach(e => { if (e.deptId === deptId) { e.deptId = null; e.subDeptId = null; } });
  App.saveGlobal(global);
  renderOrgTab();
}

function addSubDept(deptId) {
  const inp = document.getElementById('new-subdept-' + deptId);
  const name = inp.value.trim(); if (!name) return;
  const global = App.getGlobal();
  const dept = global.departments.find(d => d.id === deptId); if (!dept) return;
  if (!dept.subDepts) dept.subDepts = [];
  if (!dept.subDepts.find(s => s.name.toLowerCase() === name.toLowerCase())) {
    dept.subDepts.push({id: uid(), name});
    App.saveGlobal(global);
  }
  inp.value = '';
  renderDeptList();
}

function deleteSubDept(deptId, subId) {
  const global = App.getGlobal();
  const dept = global.departments.find(d => d.id === deptId); if (!dept) return;
  dept.subDepts = (dept.subDepts || []).filter(s => s.id !== subId);
  // Unassign employees with this sub-dept
  (global.employees || []).forEach(e => { if (e.subDeptId === subId) e.subDeptId = null; });
  App.saveGlobal(global);
  renderDeptList();
}

function setTeamLeader(deptId, empId) {
  const global = App.getGlobal();
  const dept = global.departments.find(d => d.id === deptId); if (!dept) return;
  dept.teamLeaderId = empId || null;
  App.saveGlobal(global);
}

// ── EMPLOYEES ──
function renderEmpList() {
  const global = App.getGlobal();
  const emps = global.employees || [];
  const depts = global.departments || [];
  const el = document.getElementById('emp-list');

  if (!emps.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:8px 0 12px">No employees yet.</div>';
    return;
  }

  // Group by department
  const byDept = {};
  emps.forEach(e => {
    const key = e.deptId || '__none__';
    if (!byDept[key]) byDept[key] = [];
    byDept[key].push(e);
  });

  let html = '';
  // Departments first
  depts.forEach(dept => {
    const list = byDept[dept.id] || [];
    if (!list.length) return;
    html += `<div style="margin-bottom:16px">
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text3);margin-bottom:6px">${esc(dept.name)}</div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:4px 12px">
        ${list.map(e => empRow(e, dept, global)).join('')}
      </div>
    </div>`;
  });
  // Unassigned
  if (byDept['__none__'] && byDept['__none__'].length) {
    html += `<div style="margin-bottom:16px">
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text3);margin-bottom:6px">Unassigned</div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:4px 12px">
        ${byDept['__none__'].map(e => empRow(e, null, global)).join('')}
      </div>
    </div>`;
  }
  el.innerHTML = html;
}

function empRow(emp, dept, global) {
  const subDept = dept ? (dept.subDepts || []).find(s => s.id === emp.subDeptId) : null;
  const isAdmin = emp.isAdmin || emp.role === 'admin';
  const baseRole = emp.role === 'admin' ? 'teamleader' : (emp.role || 'employee');
  const roleLabel = baseRole === 'teamleader' ? 'Team Leader' : 'Employee';
  const roleClass = baseRole === 'teamleader' ? 'teamleader' : '';
  const adminBadge = isAdmin ? `<span class="emp-role admin" style="margin-left:4px">Admin</span>` : '';
  return `<div class="emp-row">
    <div class="emp-name">${esc(emp.name)}</div>
    <div class="emp-dept">${subDept ? esc(subDept.name) : ''}</div>
    <div style="display:flex;align-items:center"><span class="emp-role ${roleClass}">${roleLabel}</span>${adminBadge}</div>
    <button class="btn ghost" style="font-size:11px;padding:3px 8px" onclick="openEmpModal('${emp.id}')">Edit</button>
  </div>`;
}

// ── EMPLOYEE MODAL ──
function openEmpModal(empId) {
  _editingEmpId = empId;
  const global = App.getGlobal();
  const emp = empId ? (global.employees || []).find(e => e.id === empId) : null;

  document.getElementById('emp-modal-title').textContent = empId ? 'Edit employee' : 'Add employee';
  document.getElementById('emp-name').value  = emp ? emp.name  : '';
  document.getElementById('emp-email').value = emp ? (emp.email || '') : '';
  document.getElementById('emp-role').value  = emp ? (emp.role === 'admin' ? 'teamleader' : (emp.role || 'employee')) : 'employee';
  document.getElementById('emp-is-admin').checked = emp ? (emp.isAdmin || emp.role === 'admin') : false;
  document.getElementById('emp-delete-btn').style.display = empId ? '' : 'none';

  // Populate dept dropdown
  const depts = global.departments || [];
  const deptSel = document.getElementById('emp-dept');
  deptSel.innerHTML = '<option value="">— Select department —</option>' +
    depts.map(d => `<option value="${d.id}"${emp && emp.deptId===d.id?' selected':''}>${esc(d.name)}</option>`).join('');

  // Populate sub-dept for selected dept
  populateSubDeptDropdown(emp ? emp.deptId : null, emp ? emp.subDeptId : null);

  document.getElementById('emp-modal').classList.add('open');
  document.getElementById('emp-name').focus();
}

function onEmpDeptChange() {
  const deptId = document.getElementById('emp-dept').value;
  populateSubDeptDropdown(deptId, null);
}

function populateSubDeptDropdown(deptId, selectedSubId) {
  const global = App.getGlobal();
  const dept = deptId ? (global.departments || []).find(d => d.id === deptId) : null;
  const subDepts = dept ? (dept.subDepts || []) : [];
  const sel = document.getElementById('emp-subdept');
  sel.innerHTML = '<option value="">— None —</option>' +
    subDepts.map(s => `<option value="${s.id}"${s.id===selectedSubId?' selected':''}>${esc(s.name)}</option>`).join('');
}

function saveEmployee() {
  const name  = document.getElementById('emp-name').value.trim();
  if (!name) { document.getElementById('emp-name').focus(); return; }
  const email    = document.getElementById('emp-email').value.trim().toLowerCase() || null;
  const deptId   = document.getElementById('emp-dept').value    || null;
  const subDeptId= document.getElementById('emp-subdept').value || null;
  const role     = document.getElementById('emp-role').value    || 'employee';
  const isAdmin  = document.getElementById('emp-is-admin').checked;

  const global = App.getGlobal();
  if (!global.employees) global.employees = [];

  if (_editingEmpId) {
    const emp = global.employees.find(e => e.id === _editingEmpId);
    if (emp) { emp.name = name; emp.email = email; emp.deptId = deptId; emp.subDeptId = subDeptId; emp.role = role; emp.isAdmin = isAdmin; }
  } else {
    global.employees.push({id: uid(), name, email, deptId, subDeptId, role, isAdmin});
  }

  App.saveGlobal(global);
  closeModal('emp-modal');
  renderOrgTab();
}

function deleteEmployee() {
  if (!_editingEmpId) return;
  if (!confirm('Delete this employee?')) return;
  const global = App.getGlobal();
  global.employees = (global.employees || []).filter(e => e.id !== _editingEmpId);
  // Unset team leader if this was one
  (global.departments || []).forEach(d => { if (d.teamLeaderId === _editingEmpId) d.teamLeaderId = null; });
  App.saveGlobal(global);
  closeModal('emp-modal');
  renderOrgTab();
}

// ══════════════════════════════════════════
// DEFAULTS TAB
// ══════════════════════════════════════════

function renderDefaultsTab() {
  const global = App.getGlobal();
  document.getElementById('def-sale-rate').value = global.rates.defaultSaleRate || '';
  document.getElementById('def-cost-rate').value = global.rates.defaultCostRate || '';
  document.getElementById('def-margin').value    = global.rates.targetMargin    || 20;
  renderRateCard();
}

function renderRateCard() {
  const global  = App.getGlobal();
  // Rate card lives in thelab_settings for backward compat — read from both
  let rc = [];
  try { rc = JSON.parse(localStorage.getItem('thelab_settings') || '{}').rateCard || []; } catch(e) {}
  if (!rc.length) { document.getElementById('rate-card-list').innerHTML = '<div style="font-size:12px;color:var(--text3);margin-bottom:8px">No items yet.</div>'; return; }
  document.getElementById('rate-card-list').innerHTML = rc.map(item => `
    <div class="rate-card-row" data-id="${item.id}">
      <input class="rc-in" style="flex:2" placeholder="Description" value="${esc(item.name||'')}" oninput="updateRCField('${item.id}','name',this.value)">
      <input class="rc-in" style="flex:1" placeholder="Spec" value="${esc(item.spec||'')}" oninput="updateRCField('${item.id}','spec',this.value)">
      <input class="rc-in" style="width:70px" placeholder="Unit" value="${esc(item.unit||'')}" oninput="updateRCField('${item.id}','unit',this.value)">
      <input class="rc-in" style="width:80px" placeholder="Sale" type="number" value="${item.sale||''}" oninput="updateRCField('${item.id}','sale',this.value)">
      <input class="rc-in" style="width:80px" placeholder="Cost" type="number" value="${item.cost||''}" oninput="updateRCField('${item.id}','cost',this.value)">
      <button class="rd" onclick="deleteRCRow('${item.id}')">×</button>
    </div>`).join('');
}

function getRateCard() {
  try { return JSON.parse(localStorage.getItem('thelab_settings') || '{}').rateCard || []; } catch(e) { return []; }
}
function saveRateCard(rc) {
  let settings = {};
  try { settings = JSON.parse(localStorage.getItem('thelab_settings') || '{}'); } catch(e) {}
  settings.rateCard = rc;
  localStorage.setItem('thelab_settings', JSON.stringify(settings));
}
function addRateCardRow() {
  const rc = getRateCard();
  rc.push({id: uid(), name:'', spec:'', unit:'hrs', sale:'', cost:''});
  saveRateCard(rc);
  renderRateCard();
  setTimeout(() => {
    const rows = document.querySelectorAll('.rate-card-row');
    if (rows.length) rows[rows.length-1].querySelector('input')?.focus();
  }, 50);
}
function updateRCField(id, field, value) {
  const rc = getRateCard();
  const item = rc.find(r => r.id === id); if (!item) return;
  item[field] = field === 'sale' || field === 'cost' ? parseFloat(value)||'' : value;
  saveRateCard(rc);
}
function deleteRCRow(id) {
  saveRateCard(getRateCard().filter(r => r.id !== id));
  renderRateCard();
}

function saveDefaults() {
  const global = App.getGlobal();
  global.rates.defaultSaleRate = parseFloat(document.getElementById('def-sale-rate').value) || 0;
  global.rates.defaultCostRate = parseFloat(document.getElementById('def-cost-rate').value) || 0;
  global.rates.targetMargin    = parseFloat(document.getElementById('def-margin').value)    || 20;
  App.saveGlobal(global);
  // Also mirror to old thelab_settings for backward compat
  let settings = {};
  try { settings = JSON.parse(localStorage.getItem('thelab_settings') || '{}'); } catch(e) {}
  settings.defaultSaleRate = global.rates.defaultSaleRate;
  settings.defaultCostRate = global.rates.defaultCostRate;
  localStorage.setItem('thelab_settings', JSON.stringify(settings));
  showSaved('Defaults saved');
}

// ══════════════════════════════════════════
// JOB STAGES TAB
// ══════════════════════════════════════════

function renderStagesTab() {
  const global = App.getGlobal();
  const stages = global.jobStages || DEFAULT_JOB_STAGES;
  const el = document.getElementById('stage-list');
  el.innerHTML = stages.map((stage, i) => `
    <div class="stage-row" data-id="${stage.id}" style="justify-content:space-between">
      <div style="display:flex;align-items:center;gap:8px;flex:1">
        <div class="move-btns">
          <button class="mb" onclick="moveStage('${stage.id}',-1)">▲</button>
          <button class="mb" onclick="moveStage('${stage.id}',1)">▼</button>
        </div>
        <input class="rc-in" style="width:120px;font-weight:500" value="${esc(stage.name)}" placeholder="Stage name"
          oninput="updateStageField('${stage.id}','name',this.value)">
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer">
          <input type="checkbox" ${stage.hasDateRange?'checked':''} style="accent-color:var(--accent)"
            onchange="updateStageField('${stage.id}','hasDateRange',this.checked)">
          Date range
        </label>
        <button class="rd" onclick="deleteStage('${stage.id}')">×</button>
      </div>
    </div>`).join('');
}

function moveStage(id, dir) {
  const global = App.getGlobal();
  const stages = global.jobStages || DEFAULT_JOB_STAGES;
  const i = stages.findIndex(s => s.id === id), ni = i + dir;
  if (ni < 0 || ni >= stages.length) return;
  [stages[i], stages[ni]] = [stages[ni], stages[i]];
  global.jobStages = stages;
  App.saveGlobal(global);
  renderStagesTab();
}
function updateStageField(id, field, value) {
  const global = App.getGlobal();
  const stage = (global.jobStages || []).find(s => s.id === id); if (!stage) return;
  stage[field] = value;
  App.saveGlobal(global);
}
function addStage() {
  const global = App.getGlobal();
  if (!global.jobStages) global.jobStages = [...DEFAULT_JOB_STAGES];
  global.jobStages.push({id: uid(), name: 'New stage', hasDateRange: false});
  App.saveGlobal(global);
  renderStagesTab();
  setTimeout(() => {
    const inputs = document.querySelectorAll('#stage-list .rc-in');
    if (inputs.length) inputs[inputs.length-1].focus();
  }, 50);
}
function deleteStage(id) {
  if (!confirm('Delete this stage?')) return;
  const global = App.getGlobal();
  global.jobStages = (global.jobStages || []).filter(s => s.id !== id);
  App.saveGlobal(global);
  renderStagesTab();
}
function saveStages() {
  // Stages are saved immediately on change — this just confirms
  showSaved('Job stages saved');
}

// ══════════════════════════════════════════
// APPEARANCE TAB
// ══════════════════════════════════════════

function renderAppearanceTab() {
  const global = App.getGlobal();
  document.getElementById('app-logo').value  = global.appearance.logoText || 'THE/LAB';
  document.getElementById('app-font').value  = global.appearance.font     || 'system';
}

function saveAppearance() {
  const global = App.getGlobal();
  global.appearance.logoText = document.getElementById('app-logo').value.trim() || 'THE/LAB';
  global.appearance.font     = document.getElementById('app-font').value;
  App.saveGlobal(global);
  // Mirror to old settings key
  let settings = {};
  try { settings = JSON.parse(localStorage.getItem('thelab_settings') || '{}'); } catch(e) {}
  settings.logoText = global.appearance.logoText;
  localStorage.setItem('thelab_settings', JSON.stringify(settings));
  showSaved('Appearance saved');
}

// ══════════════════════════════════════════
// EXPORT TAB
// ══════════════════════════════════════════

const EXPORT_COLUMNS = [
  {id:'description', label:'Description'},
  {id:'spec',        label:'Spec'},
  {id:'qty',         label:'Qty / Unit'},
  {id:'sale',        label:'Price/unit'},
  {id:'price_dkk',   label:'Price (DKK)'},
  {id:'cost',        label:'Cost/unit'},
  {id:'cost_dkk',    label:'Cost (DKK)'},
  {id:'margin',      label:'Margin %'},
  {id:'note',        label:'Note'},
];

function renderExportTab() {
  const global = App.getGlobal();
  const exp = global.exportDefaults;
  document.getElementById('exp-footer').value = exp.footerText || 'All prices are estimates and exclude VAT';
  document.getElementById('exp-cover').checked = exp.coverPage || false;

  const showCols = exp.showColumns || EXPORT_COLUMNS.map(c => c.id);
  document.getElementById('col-toggles').innerHTML = EXPORT_COLUMNS.map(col => `
    <div class="set-row" style="border-bottom:1px solid var(--bg3);padding:6px 0">
      <span class="set-lbl">${col.label}</span>
      <label class="toggle">
        <input type="checkbox" id="col-${col.id}" ${showCols.includes(col.id)?'checked':''}>
        <span class="toggle-slider"></span>
      </label>
    </div>`).join('');
}

function saveExport() {
  const global = App.getGlobal();
  global.exportDefaults.footerText = document.getElementById('exp-footer').value.trim()
    || 'All prices are estimates and exclude VAT';
  global.exportDefaults.coverPage  = document.getElementById('exp-cover').checked;
  global.exportDefaults.showColumns = EXPORT_COLUMNS
    .filter(col => document.getElementById('col-' + col.id)?.checked)
    .map(col => col.id);
  App.saveGlobal(global);
  // Mirror footer to old settings key
  let settings = {};
  try { settings = JSON.parse(localStorage.getItem('thelab_settings') || '{}'); } catch(e) {}
  settings.footerText      = global.exportDefaults.footerText;
  settings.coverPageDefault = global.exportDefaults.coverPage;
  localStorage.setItem('thelab_settings', JSON.stringify(settings));
  showSaved('Export settings saved');
}

// ══════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════

function showSaved(msg) {
  // Brief toast notification
  let toast = document.getElementById('settings-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'settings-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#083018;color:#9fe1cb;border:1px solid #0f6e56;border-radius:8px;padding:10px 18px;font-size:12px;font-weight:500;z-index:999;opacity:0;transition:opacity .2s';
    document.body.appendChild(toast);
  }
  toast.textContent = '✓ ' + msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
}
