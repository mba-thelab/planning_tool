'use strict';
// Depends on app.js: App, Jobs, uid, esc, fmtDate, fmtDateRange

const STUDIOS = [
  { id:'studio-1', label:'Studio 1' },
  { id:'studio-2', label:'Studio 2' },
  { id:'studio-3', label:'Studio 3' },
  { id:'studio-4', label:'Studio 4' },
  { id:'studio-5', label:'Studio 5' },
  { id:'studio-6', label:'Studio 6' },
  { id:'studio-7', label:'Studio 7' },
  { id:'studio-8', label:'Studio 8' },
  { id:'floor4',   label:'4th floor' },
  { id:'forhallen',label:'Forhallen' },
  { id:'equipment',label:'Equip. room' },
  { id:'onlocation',label:'On location' },
];

// Map location object → studio ID for grid lookup
function locToId(loc) {
  if (!loc || !loc.type) return null;
  if (loc.type === 'studio') return 'studio-' + (loc.studioNum || '?');
  return loc.type;
}

let weekOffset = 0; // 0 = current week
let currentView = 'grid';

// ── INIT ──
(function init() {
  renderWeekLabel();
  renderBoard();
})();

// ── WEEK NAVIGATION ──
function getWeekDays(offset) {
  const now  = new Date();
  const dow  = now.getDay(); // 0 = Sun
  const mon  = new Date(now);
  mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

function renderWeekLabel() {
  const days  = getWeekDays(weekOffset);
  const first = days[0];
  const last  = days[6];
  document.getElementById('week-lbl').textContent =
    first.toLocaleDateString('en-GB', { day:'numeric', month:'short' }) + ' – ' +
    last.toLocaleDateString('en-GB',  { day:'numeric', month:'short', year:'numeric' });
}

function prevWeek()  { weekOffset--; renderWeekLabel(); renderBoard(); }
function nextWeek()  { weekOffset++; renderWeekLabel(); renderBoard(); }
function goToday()   { weekOffset = 0; renderWeekLabel(); renderBoard(); }

function setView(v) {
  currentView = v;
  document.getElementById('vbtn-grid').classList.toggle('active', v === 'grid');
  document.getElementById('vbtn-list').classList.toggle('active', v === 'list');
  renderBoard();
}

// ── ALL SCHEDULE ENTRIES ──
function getAllEntries() {
  const q = (document.getElementById('board-filter')?.value || '').toLowerCase().trim();
  const entries = [];
  Jobs.getAll().forEach(job => {
    (job.schedule || []).forEach(entry => {
      if (q && !(job.title||'').toLowerCase().includes(q) && !(job.client?.name||'').toLowerCase().includes(q)) return;
      entries.push({ ...entry, _job: job });
    });
  });
  return entries;
}

// Check if entry overlaps a given date (ISO string)
function entryOnDate(entry, iso) {
  if (!entry.dateStart) return false;
  const end = entry.dateEnd || entry.dateStart;
  return iso >= entry.dateStart && iso <= end;
}

// ── RENDER ──
function renderBoard() {
  currentView === 'grid' ? renderGrid() : renderList();
}

function renderGrid() {
  const days    = getWeekDays(weekOffset);
  const today   = new Date().toISOString().slice(0, 10);
  const entries = getAllEntries();
  const area    = document.getElementById('board-content');

  const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  let html = `<table class="board-table"><thead><tr>
    <th>Location</th>
    ${days.map((d, i) => {
      const iso  = d.toISOString().slice(0,10);
      const isToday = iso === today;
      return `<th${isToday ? ' style="color:var(--accent)"' : ''}>${DAY_NAMES[i]} ${d.getDate()}</th>`;
    }).join('')}
  </tr></thead><tbody>`;

  STUDIOS.forEach(studio => {
    html += `<tr><td>${studio.label}</td>`;
    days.forEach(d => {
      const iso   = d.toISOString().slice(0, 10);
      const isToday = iso === today;
      const cells = entries.filter(e => locToId(e.location) === studio.id && entryOnDate(e, iso));
      const phase = cells.length
        ? cells.map(e => {
            const phase = e._job.plan?.phases?.find(p => p.id === e.phaseId);
            const bg    = phase ? phase.bg : 'var(--bg3)';
            const types = (e.type||[]).join(', ');
            return `<div class="board-cell-job" style="border-left:3px solid ${bg}"
              onclick="window.location.href='/job.html?id=${e._job.id}'">
              <div class="board-cell-job-title">${esc(e._job.title || e._job.client?.name || 'Untitled')}</div>
              ${types ? `<div class="board-cell-job-meta">${types}</div>` : ''}
            </div>`;
          }).join('')
        : '';
      html += `<td${isToday ? ' class="board-today"' : ''}>${phase}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  area.innerHTML = html;
}

function renderList() {
  const entries = getAllEntries();
  const area    = document.getElementById('board-content');

  if (!entries.length) {
    area.innerHTML = `<div style="padding:40px 24px;color:var(--text3);font-size:12px">No schedule entries found. Add jobs to the board from the Job → Schedule tab.</div>`;
    return;
  }

  // Group by job
  const byJob = {};
  entries.forEach(e => {
    const id = e._job.id;
    if (!byJob[id]) byJob[id] = { job: e._job, entries: [] };
    byJob[id].entries.push(e);
  });

  const STATUS_COLORS = {
    upcoming: 'var(--text2)',
    active:   '#fac775',
    done:     '#9fe1cb',
    hold:     '#f09595',
  };

  let html = '<div style="padding:16px 24px">';
  Object.values(byJob).forEach(({ job, entries: es }) => {
    html += `<div style="margin-bottom:24px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;cursor:pointer"
        onclick="window.location.href='/job.html?id=${job.id}'">
        <span style="font-size:13px;font-weight:400;color:var(--hi)">${esc(job.title || 'Untitled')}</span>
        ${job.client?.name ? `<span style="font-size:11px;color:var(--text2)">${esc(job.client.name)}</span>` : ''}
        <span class="btn ghost" style="font-size:10px;padding:2px 8px;margin-left:auto">↗ Open</span>
      </div>`;

    es.forEach(e => {
      const phase = job.plan?.phases?.find(p => p.id === e.phaseId);
      const bg    = phase ? phase.bg : 'var(--border)';
      const label = phase ? phase.label : 'Unlinked';
      const types = (e.type||[]).map(t => `<span class="job-type-badge ${t}">${t}</span>`).join(' ');
      const loc   = formatLocation(e.location);
      const statusColor = STATUS_COLORS[e.status] || 'var(--text2)';

      html += `<div class="sched-entry">
        <div class="sched-phase-bar" style="background:${bg}"></div>
        <div class="sched-body">
          <div class="sched-info">
            <div class="sched-title">${esc(label)}${e.note ? ` <span style="font-size:11px;color:var(--text2)">— ${esc(e.note)}</span>` : ''}</div>
            <div class="sched-meta">${loc}${e.dateStart || e.dateEnd ? ' · ' + fmtDateRange(e.dateStart, e.dateEnd) : ''}</div>
            ${types ? `<div style="margin-top:5px;display:flex;gap:4px">${types}</div>` : ''}
          </div>
          <div class="sched-actions">
            <span style="font-size:11px;color:${statusColor}">${e.status || 'upcoming'}</span>
          </div>
        </div>
      </div>`;
    });
    html += '</div>';
  });

  html += '</div>';
  area.innerHTML = html;
}

function formatLocation(loc) {
  if (!loc || !loc.type) return '—';
  if (loc.type === 'studio') return 'Studio ' + (loc.studioNum || '');
  const map = { floor4:'4th floor', forhallen:'Forhallen', equipment:'Equipment room', onlocation:'On location', other: loc.addr || 'Other' };
  return map[loc.type] || '—';
}
