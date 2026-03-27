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
  const header = `<div class="task-list-hdr">
    <div>Task / Project</div>
    <div>Assigned</div>
    <div>Pipeline</div>
    <div>Ready by</div>
    <div>Status</div>
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
    return `<div class="task-list-row">
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

  return `<div class="task-card">
    <div class="task-card-top">
      <div class="task-card-info">
        <div class="task-card-name">${esc(task.name)}</div>
        ${specHTML}
        ${mhText ? `<div style="font-size:11px;color:var(--text3);margin-top:3px">${mhText}</div>` : ''}
      </div>
      <div class="task-card-right">
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
