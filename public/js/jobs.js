'use strict';
// Depends on app.js

// ── STATE ──
let _view         = 'project'; // 'project' | 'task'
let _statusFilter = 'all';     // 'all' | 'upcoming' | 'in-progress' | 'done'
let _personFilter = 'all';     // 'all' | employeeId | '__dept__<deptId>' | '__subdept__<subId>'

// All tasks gathered from every saved project: [{task, projectKey, projectName, projectDate}]
let _allTasks = [];

// ── INIT ──
(function init() {
  populateFilterDropdowns();
  loadAllTasks();
  render();
})();

// Show TL/Admin controls once auth completes
window.onUserReady = function() {
  if (App.canAccess('process')) {
    const btn = document.getElementById('add-task-btn');
    if (btn) btn.style.display = '';
    // Re-render so edit buttons appear on cards
    render();
  }
};

function refresh() {
  loadAllTasks();
  render();
}

// ── GATHER TASKS ──
function loadAllTasks() {
  _allTasks = [];
  App.getSavedProjects().forEach(proj => {
    (proj.jobTasks || []).forEach(task => {
      _allTasks.push({
        task,
        projectKey:  proj._key,
        projectName: proj.name   || 'Untitled',
        projectDate: proj.date   || '',
        projectClient: proj.client || '',
      });
    });
  });
  // Sort: soonest readyByDate first, undated last
  _allTasks.sort((a, b) => {
    const da = a.task.readyByDate || '9999';
    const db = b.task.readyByDate || '9999';
    return da < db ? -1 : da > db ? 1 : 0;
  });
}

// ── FILTER DROPDOWNS ──
function populateFilterDropdowns() {
  const global = App.getGlobal();
  const depts  = global.departments || [];
  const emps   = global.employees   || [];

  const deptSel = document.getElementById('filter-dept');
  deptSel.innerHTML = '<option value="">Department...</option>' +
    depts.map(d => {
      const subOpts = (d.subDepts || []).map(s =>
        `<option value="__subdept__${s.id}">  └ ${esc(s.name)}</option>`
      ).join('');
      return `<option value="__dept__${d.id}">${esc(d.name)}</option>${subOpts}`;
    }).join('');

  const personSel = document.getElementById('filter-person');
  personSel.innerHTML = '<option value="">Person...</option>' +
    emps.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
}

function onDeptFilterChange(val) {
  if (!val) return;
  document.getElementById('filter-person').value = '';
  setPersonFilter(val, 'dept');
}
function onPersonFilterChange(val) {
  if (!val) return;
  document.getElementById('filter-dept').value = '';
  setPersonFilter(val, 'person');
}

// ── FILTER LOGIC ──
function setView(v) {
  _view = v;
  document.getElementById('vt-project').classList.toggle('active', v === 'project');
  document.getElementById('vt-task').classList.toggle('active', v === 'task');
  render();
}

function setStatusFilter(s) {
  _statusFilter = s;
  document.querySelectorAll('[data-status]').forEach(el =>
    el.classList.toggle('active', el.dataset.status === s)
  );
  render();
}

function setPersonFilter(val, type) {
  _personFilter = val;
  // Highlight "All" chip only when truly all
  document.getElementById('filter-all').classList.toggle('active', val === 'all');
  if (val === 'all') {
    document.getElementById('filter-dept').value   = '';
    document.getElementById('filter-person').value = '';
  }
  render();
}

function getFilteredTasks() {
  const global = App.getGlobal();
  const emps   = global.employees || [];

  return _allTasks.filter(({task}) => {
    // Status filter
    if (_statusFilter !== 'all' && (task.status || 'upcoming') !== _statusFilter) return false;

    // Person / dept filter
    if (_personFilter !== 'all') {
      const assigned = task.assignedTo || [];

      if (_personFilter.startsWith('__dept__')) {
        const deptId = _personFilter.replace('__dept__', '');
        const deptEmpIds = emps.filter(e => e.deptId === deptId).map(e => e.id);
        const match = assigned.some(a => a.employeeId && deptEmpIds.includes(a.employeeId));
        if (!match) return false;

      } else if (_personFilter.startsWith('__subdept__')) {
        const subId = _personFilter.replace('__subdept__', '');
        const subEmpIds = emps.filter(e => e.subDeptId === subId).map(e => e.id);
        const match = assigned.some(a => a.employeeId && subEmpIds.includes(a.employeeId));
        if (!match) return false;

      } else {
        // Specific employee ID
        const emp = emps.find(e => e.id === _personFilter);
        const match = assigned.some(a =>
          a.employeeId === _personFilter ||
          (emp && a.name && a.name.toLowerCase() === emp.name.toLowerCase())
        );
        if (!match) return false;
      }
    }

    return true;
  });
}

// ── RENDER ──
function render() {
  const tasks   = getFilteredTasks();
  const mainEl  = document.getElementById('jb-main');
  const global  = App.getGlobal();
  const stages  = global.jobStages || DEFAULT_JOB_STAGES;

  if (!_allTasks.length) {
    mainEl.innerHTML = `<div class="jb-empty">
      <div class="jb-empty-title">No jobs on the board yet</div>
      <p>Open the <a href="/process.html" style="color:var(--teal)">Process planner</a>, add tasks, and use the "+ Job Board" button to add them here.</p>
    </div>`;
    return;
  }

  if (!tasks.length) {
    mainEl.innerHTML = `<div class="jb-empty">
      <div class="jb-empty-title">No jobs match this filter</div>
      <p style="color:var(--text3);font-size:12px">Try a different status or person filter.</p>
    </div>`;
    return;
  }

  if (_view === 'project') {
    renderProjectView(tasks, stages, mainEl);
  } else {
    renderTaskView(tasks, stages, mainEl);
  }
}

// ── PROJECT VIEW ──
function renderProjectView(tasks, stages, mainEl) {
  // Group by project
  const groups = {};
  tasks.forEach(item => {
    if (!groups[item.projectKey]) {
      groups[item.projectKey] = {
        projectKey:    item.projectKey,
        projectName:   item.projectName,
        projectDate:   item.projectDate,
        projectClient: item.projectClient,
        tasks: [],
      };
    }
    groups[item.projectKey].tasks.push(item);
  });

  mainEl.innerHTML = Object.values(groups).map(group => {
    const taskCards = group.tasks.map(item => taskCard(item.task, item.projectKey, stages, false)).join('');
    const meta = [group.projectClient, group.projectDate ? fmtDate(group.projectDate) : ''].filter(Boolean).join(' · ');
    return `<div class="proj-group">
      <div class="proj-group-hdr">
        <div class="proj-group-name">${esc(group.projectName)}</div>
        ${meta ? `<div class="proj-group-meta">${esc(meta)}</div>` : ''}
        <div class="proj-group-count">${group.tasks.length} task${group.tasks.length!==1?'s':''}</div>
      </div>
      ${taskCards}
    </div>`;
  }).join('');
}

// ── TASK VIEW ──
function renderTaskView(tasks, stages, mainEl) {
  const canEdit = App.canAccess('process');
  const cols = canEdit ? '1fr 140px 160px 120px 80px 50px' : '1fr 140px 160px 120px 80px';

  const header = `<div class="task-list-hdr" style="grid-template-columns:${cols}">
    <div>Task / Project</div>
    <div>Assigned</div>
    <div>Pipeline</div>
    <div>Ready by</div>
    <div>Status</div>
    ${canEdit ? '<div></div>' : ''}
  </div>`;

  const rows = tasks.map(item => {
    const {task} = item;
    const crew = (task.assignedTo || []).map(a => esc(a.name)).join(', ') || '—';
    const pipelineSummary = stages
      .filter(s => (task.stages || {})[s.id]?.enabled)
      .map(s => esc(s.name))
      .join(' → ') || '—';
    const statusClass = task.status || 'upcoming';
    const statusLabel = statusClass === 'in-progress' ? 'In Progress' : capitalize(statusClass);
    const locLabel = fmtLocation(task.location);
    const readyStr = task.readyByDate
      ? fmtDate(task.readyByDate) + (task.readyByTime ? ` ${task.readyByTime}` : '')
      : '—';
    return `<div class="task-list-row" style="grid-template-columns:${cols}">
      <div>
        <div style="font-weight:500;color:var(--hi)">${esc(task.name)}</div>
        <div style="font-size:11px;color:var(--text3)">${esc(item.projectName)}${locLabel ? ` · ${esc(locLabel)}` : ''}</div>
      </div>
      <div style="color:var(--text2);font-size:11px">${crew}</div>
      <div style="color:var(--text3);font-size:11px">${pipelineSummary}</div>
      <div style="color:${task.readyByDate?'var(--hi)':'var(--text3)'};font-size:11px">${readyStr}</div>
      <div>
        <button class="status-badge ${statusClass}" onclick="cycleStatus('${item.projectKey}','${task.id}')">${statusLabel}</button>
      </div>
      ${canEdit ? `<div><button class="btn ghost" style="font-size:10px;padding:2px 6px" onclick="openJbEdit('${item.projectKey}','${task.id}')">Edit</button></div>` : ''}
    </div>`;
  }).join('');

  mainEl.innerHTML = header + rows;
}

// ── LOCATION LABEL ──
function fmtLocation(loc) {
  if (!loc || !loc.type) return '';
  const labels = { floor4:'4th floor', forhallen:'Forhallen', equipment:'Equipment room', onlocation:'On location', other:'Other' };
  if (loc.type === 'studio') return loc.studioNum ? `Studio ${loc.studioNum}` : 'Studio';
  return labels[loc.type] || loc.type;
}

// ── TASK CARD ──
function taskCard(task, projectKey, stages, showProject) {
  const statusClass = task.status || 'upcoming';
  const statusLabel = statusClass === 'in-progress' ? 'In Progress' : capitalize(statusClass);
  const crew = task.assignedTo || [];
  const taskStages = task.stages || {};

  const crewHTML = crew.length
    ? `<div class="crew-tags">${crew.map(a => `<span class="crew-tag">${esc(a.name)}</span>`).join('')}</div>`
    : '';

  // Meta row: location + job types + contact
  const locLabel = fmtLocation(task.location);
  const typeBadges = (task.jobTypes || []).map(t =>
    `<span class="job-type-badge ${t}">${capitalize(t)}</span>`
  ).join('');
  const metaHTML = (locLabel || typeBadges || task.contactName) ? `
    <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-bottom:8px">
      ${locLabel ? `<span class="loc-badge">${esc(locLabel)}</span>` : ''}
      ${typeBadges}
      ${task.contactName ? `<span style="font-size:10px;color:var(--text3);margin-left:2px">Contact: ${esc(task.contactName)}</span>` : ''}
    </div>` : '';

  // Ready by + strike
  const readyStr = task.readyByDate
    ? fmtDate(task.readyByDate) + (task.readyByTime ? ` at ${task.readyByTime}` : '')
    : '';
  const strikeStr = task.strikeDate
    ? fmtDate(task.strikeDate) + (task.strikeTime ? ` at ${task.strikeTime}` : '')
    : '';
  const datesHTML = (readyStr || strikeStr) ? `
    <div style="display:flex;gap:16px;margin-bottom:10px;font-size:11px">
      ${readyStr ? `<div>Ready <span style="color:var(--hi);font-weight:500">${esc(readyStr)}</span></div>` : ''}
      ${strikeStr ? `<div style="color:var(--text3)">Strike <span style="color:var(--text2)">${esc(strikeStr)}</span></div>` : ''}
    </div>` : '';

  const pipelineHTML = buildPipelineHTML(stages, taskStages);

  const specHTML = task.spec
    ? `<div style="font-size:11px;color:var(--text3);margin-top:1px">${esc(task.spec)}</div>`
    : '';

  const mhText = task.crew && task.hrs
    ? `${task.crew} crew · ${task.hrs}h · ${(parseFloat(task.crew)||0)*(parseFloat(task.hrs)||0)} mh`
    : '';

  const editBtn = App.canAccess('process')
    ? `<button class="btn ghost" style="font-size:10px;padding:2px 8px" onclick="openJbEdit('${projectKey}','${task.id}')">Edit</button>`
    : '';

  return `<div class="task-card">
    <div class="task-card-top">
      <div class="task-card-info">
        <div class="task-card-name">${esc(task.name)}</div>
        ${specHTML}
        ${mhText ? `<div style="font-size:11px;color:var(--text3);margin-top:3px">${mhText}</div>` : ''}
      </div>
      <div class="task-card-right">
        ${editBtn}
        <button class="status-badge ${statusClass}" onclick="cycleStatus('${projectKey}','${task.id}')">${statusLabel}</button>
      </div>
    </div>
    ${metaHTML}
    ${crewHTML}
    ${datesHTML}
    ${pipelineHTML}
  </div>`;
}

// ── PIPELINE HTML ──
function buildPipelineHTML(stages, taskStages) {
  if (!stages.length) return '';

  const pills = stages.map(stage => {
    const stageData = taskStages[stage.id] || {enabled: false};
    const enabled   = stageData.enabled !== false;
    const pillClass = enabled ? 'enabled' : 'disabled';

    let dateText = '';
    if (enabled) {
      if (stage.hasDateRange && (stageData.startDate || stageData.endDate)) {
        const start = stageData.startDate ? fmtDateShort(stageData.startDate) : '?';
        const end   = stageData.endDate   ? fmtDateShort(stageData.endDate)   : '?';
        dateText = start === end ? start : `${start}–${end}`;
      } else if (!stage.hasDateRange && stage.id !== 'ongoing' && stageData.date) {
        dateText = fmtDateShort(stageData.date);
      } else if (stage.id === 'ongoing' && enabled) {
        dateText = 'ongoing';
      }
    }

    return `<div class="pipe-stage">
      <div class="pipe-pill ${pillClass}">${esc(stage.name)}</div>
      <div class="pipe-dates${dateText?' has-date':''}">${dateText || (enabled ? '—' : '')}</div>
    </div>`;
  }).join('');

  return `<div class="pipeline">${pills}</div>`;
}

// ── STATUS CYCLE ──
function cycleStatus(projectKey, taskId) {
  const order = ['upcoming', 'in-progress', 'done'];
  const proj  = App.loadProjectByKey(projectKey);
  if (!proj || !proj.S) return;

  const jobTask = (proj.S.jobTasks || []).find(jt => jt.id === taskId);
  if (!jobTask) return;

  const current = jobTask.status || 'upcoming';
  const nextIdx = (order.indexOf(current) + 1) % order.length;
  jobTask.status = order[nextIdx];

  // Save back
  App.saveProjectData(projectKey, {
    name:     proj.name,
    client:   proj.client,
    version:  proj.version,
    date:     proj.date,
    currency: proj.currency,
    status:   proj.status,
    key:      projectKey,
  }, proj.S);

  // Update local cache
  const cached = _allTasks.find(t => t.projectKey === projectKey && t.task.id === taskId);
  if (cached) cached.task.status = jobTask.status;

  render();
}

// ── DATE FORMAT ──
function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'}); }
  catch(e) { return d; }
}
function fmtDateShort(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-GB', {day:'numeric', month:'short'}); }
  catch(e) { return d; }
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

// ── ADD / EDIT MODAL ──
let _pendingJbEdit = null; // {projectKey, jobTaskId, mode:'add'|'edit'}

function openJbAdd() {
  const projects = App.getSavedProjects();
  if (!projects.length) { alert('No saved projects. Save a project first.'); return; }
  _pendingJbEdit = { projectKey: null, jobTaskId: null, mode: 'add' };

  const sel = document.getElementById('jb-edit-project');
  sel.innerHTML = '<option value="">— Select project —</option>' +
    projects.map(p => `<option value="${p._key}">${esc(p.name || 'Untitled')}${p.client ? ' - ' + esc(p.client) : ''}</option>`).join('');

  document.getElementById('jb-project-group').style.display = '';
  document.getElementById('jb-edit-title').textContent = 'Add to Job Board';
  document.getElementById('jb-edit-delete-btn').style.display = 'none';
  _clearJbEditForm();
  _buildJbEditStages(null);
  _buildJbEditCrew(null);
  document.getElementById('jb-edit-modal').classList.add('open');
}

function openJbEdit(projectKey, jobTaskId) {
  const proj = App.loadProjectByKey(projectKey);
  if (!proj || !proj.S) return;
  const jt = (proj.S.jobTasks || []).find(t => t.id === jobTaskId);
  if (!jt) return;
  _pendingJbEdit = { projectKey, jobTaskId, mode: 'edit' };

  document.getElementById('jb-project-group').style.display = 'none';
  document.getElementById('jb-edit-title').textContent = 'Edit: ' + esc(jt.name);
  document.getElementById('jb-edit-delete-btn').style.display = '';

  document.getElementById('jb-edit-name').value        = jt.name         || '';
  document.getElementById('jb-edit-spec').value        = jt.spec         || '';
  document.getElementById('jb-edit-ready-by').value    = jt.readyByDate  || '';
  document.getElementById('jb-edit-ready-time').value  = jt.readyByTime  || '';
  document.getElementById('jb-edit-strike-date').value = jt.strikeDate   || '';
  document.getElementById('jb-edit-strike-time').value = jt.strikeTime   || '';
  document.getElementById('jb-edit-contact').value     = jt.contactName  || '';

  const loc = jt.location || {};
  document.getElementById('jb-edit-loc-type').value    = loc.type      || '';
  document.getElementById('jb-edit-studio-num').value  = loc.studioNum || '';
  document.getElementById('jb-edit-loc-addr').value    = loc.address   || '';
  onJbEditLocChange();

  document.querySelectorAll('#jb-edit-type-chips .type-chip').forEach(b =>
    b.classList.toggle('active', (jt.jobTypes || []).includes(b.dataset.type))
  );

  _buildJbEditStages(jt.stages);
  _buildJbEditCrew(jt.assignedTo);
  document.getElementById('jb-edit-modal').classList.add('open');
}

function _clearJbEditForm() {
  ['jb-edit-name','jb-edit-spec','jb-edit-ready-by','jb-edit-ready-time',
   'jb-edit-strike-date','jb-edit-strike-time','jb-edit-contact','jb-edit-loc-addr']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('jb-edit-loc-type').value = '';
  document.getElementById('jb-edit-studio-num').value = '';
  document.querySelectorAll('#jb-edit-type-chips .type-chip').forEach(b => b.classList.remove('active'));
  onJbEditLocChange();
}

function _buildJbEditStages(existing) {
  const stages = (App.getGlobal().jobStages || DEFAULT_JOB_STAGES);
  const def = existing || {};
  document.getElementById('jb-edit-stages-list').innerHTML = stages.map(stage => {
    const sd = def[stage.id] || { enabled: true };
    const checked = sd.enabled !== false ? 'checked' : '';
    let dates = '';
    if (stage.hasDateRange) {
      dates = `<label><span style="font-size:10px;color:var(--text3)">Start</span>
        <input type="date" id="jbe-${stage.id}-start" value="${sd.startDate||''}" class="modal-in" style="width:130px"></label>
        <label><span style="font-size:10px;color:var(--text3)">End</span>
        <input type="date" id="jbe-${stage.id}-end" value="${sd.endDate||''}" class="modal-in" style="width:130px"></label>`;
    } else if (stage.id !== 'ongoing') {
      dates = `<label><span style="font-size:10px;color:var(--text3)">Date</span>
        <input type="date" id="jbe-${stage.id}-date" value="${sd.date||''}" class="modal-in" style="width:130px"></label>`;
    }
    return `<div class="stage-row">
      <input type="checkbox" id="jbe-stage-${stage.id}" ${checked} style="accent-color:var(--teal);width:14px;height:14px;flex-shrink:0">
      <span class="stage-name">${esc(stage.name)}</span>
      <div class="stage-dates">${dates}</div>
    </div>`;
  }).join('');
}

function _buildJbEditCrew(existing) {
  const employees = App.getGlobal().employees || [];
  const assigned = existing || [];
  const roster = employees.length
    ? `<select class="modal-in" id="jbe-crew-picker" style="margin-bottom:6px">
        <option value="">— Pick from roster —</option>
        ${employees.map(e => `<option value="${e.id}" data-name="${esc(e.name)}">${esc(e.name)}</option>`).join('')}
       </select>
       <button type="button" class="add-inline-btn" onclick="addJbEditCrewFromPicker()" style="display:block;margin-bottom:8px">+ Add from roster</button>`
    : '';
  const rows = assigned.map(a =>
    `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
      <input class="modal-in jbe-crew-entry" data-emp-id="${a.employeeId||''}" style="flex:1" value="${esc(a.name)}" placeholder="Name...">
      <button type="button" onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;line-height:1">×</button>
    </div>`
  ).join('');
  document.getElementById('jb-edit-crew-section').innerHTML =
    `${roster}<div id="jbe-crew-list">${rows}</div>
     <button type="button" class="add-inline-btn" onclick="addJbEditCrewFreetext()">+ Add name</button>`;
}

function addJbEditCrewFromPicker() {
  const sel = document.getElementById('jbe-crew-picker');
  const opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) return;
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px';
  div.innerHTML = `<input class="modal-in jbe-crew-entry" data-emp-id="${opt.value}" style="flex:1" value="${esc(opt.text)}" placeholder="Name...">
    <button type="button" onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;line-height:1">×</button>`;
  document.getElementById('jbe-crew-list').appendChild(div);
  sel.value = '';
}

function addJbEditCrewFreetext() {
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px';
  div.innerHTML = `<input class="modal-in jbe-crew-entry" style="flex:1" value="" placeholder="Name...">
    <button type="button" onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;line-height:1">×</button>`;
  document.getElementById('jbe-crew-list').appendChild(div);
  div.querySelector('input').focus();
}

function onJbEditLocChange() {
  const type = document.getElementById('jb-edit-loc-type').value;
  document.getElementById('jb-edit-studio-num').style.display = type === 'studio'     ? '' : 'none';
  document.getElementById('jb-edit-loc-addr').style.display   = type === 'onlocation' ? '' : 'none';
}

function saveJbTask() {
  if (!_pendingJbEdit) return;
  const name = document.getElementById('jb-edit-name').value.trim();
  if (!name) { alert('Task name is required.'); return; }

  // Gather stages
  const stages = App.getGlobal().jobStages || DEFAULT_JOB_STAGES;
  const stagesData = {};
  stages.forEach(stage => {
    const enabled = document.getElementById('jbe-stage-' + stage.id)?.checked ?? true;
    const entry = { enabled };
    if (stage.hasDateRange) {
      entry.startDate = document.getElementById(`jbe-${stage.id}-start`)?.value || '';
      entry.endDate   = document.getElementById(`jbe-${stage.id}-end`)?.value   || '';
    } else if (stage.id !== 'ongoing') {
      entry.date = document.getElementById(`jbe-${stage.id}-date`)?.value || '';
    }
    stagesData[stage.id] = entry;
  });

  const crewEntries = [...document.querySelectorAll('.jbe-crew-entry')]
    .map(inp => ({ employeeId: inp.dataset.empId || null, name: inp.value.trim() }))
    .filter(a => a.name);

  const locType = document.getElementById('jb-edit-loc-type').value;
  const location = locType ? {
    type:      locType,
    studioNum: locType === 'studio'     ? document.getElementById('jb-edit-studio-num').value : '',
    address:   locType === 'onlocation' ? document.getElementById('jb-edit-loc-addr').value   : '',
  } : null;

  const jobTypes    = [...document.querySelectorAll('#jb-edit-type-chips .type-chip.active')].map(b => b.dataset.type);
  const spec        = document.getElementById('jb-edit-spec').value.trim();
  const readyByDate = document.getElementById('jb-edit-ready-by').value;
  const readyByTime = document.getElementById('jb-edit-ready-time').value;
  const strikeDate  = document.getElementById('jb-edit-strike-date').value;
  const strikeTime  = document.getElementById('jb-edit-strike-time').value;
  const contactName = document.getElementById('jb-edit-contact').value.trim();

  let projectKey = _pendingJbEdit.projectKey;
  if (_pendingJbEdit.mode === 'add') {
    projectKey = document.getElementById('jb-edit-project').value;
    if (!projectKey) { alert('Select a project first.'); return; }
  }

  const proj = App.loadProjectByKey(projectKey);
  if (!proj || !proj.S) return;
  if (!proj.S.jobTasks) proj.S.jobTasks = [];

  if (_pendingJbEdit.mode === 'edit') {
    const idx = proj.S.jobTasks.findIndex(t => t.id === _pendingJbEdit.jobTaskId);
    if (idx < 0) return;
    const existing = proj.S.jobTasks[idx];
    proj.S.jobTasks[idx] = {
      ...existing, name, spec, readyByDate, readyByTime, strikeDate, strikeTime,
      location, jobTypes, contactName, stages: stagesData, assignedTo: crewEntries,
    };
    // Sync name/spec back to process planner task if linked
    if (existing.taskId) {
      for (const phase of (proj.S.process?.phases || [])) {
        const pt = (phase.tasks || []).find(t => t.id === existing.taskId);
        if (pt) { pt.name = name; pt.spec = spec; break; }
      }
    }
  } else {
    proj.S.jobTasks.push({
      id: uid(), taskId: null, phaseId: null,
      name, spec, crew: '', hrs: '', hold: '', note: '',
      assignedTo: crewEntries, readyByDate, readyByTime, strikeDate, strikeTime,
      location, jobTypes, contactName, stages: stagesData, status: 'upcoming',
    });
  }

  App.saveProjectData(projectKey, {
    name: proj.name, client: proj.client, version: proj.version,
    date: proj.date, currency: proj.currency, status: proj.status, key: projectKey,
  }, proj.S);

  document.getElementById('jb-edit-modal').classList.remove('open');
  loadAllTasks();
  render();
}

function deleteJbTask() {
  if (!_pendingJbEdit || _pendingJbEdit.mode !== 'edit') return;
  if (!confirm('Remove this task from the job board?')) return;
  const { projectKey, jobTaskId } = _pendingJbEdit;
  const proj = App.loadProjectByKey(projectKey);
  if (!proj || !proj.S) return;
  proj.S.jobTasks = (proj.S.jobTasks || []).filter(t => t.id !== jobTaskId);
  App.saveProjectData(projectKey, {
    name: proj.name, client: proj.client, version: proj.version,
    date: proj.date, currency: proj.currency, status: proj.status, key: projectKey,
  }, proj.S);
  document.getElementById('jb-edit-modal').classList.remove('open');
  loadAllTasks();
  render();
}
