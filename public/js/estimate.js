'use strict';
// Depends on app.js (S, projectMeta, App, uid, esc, fmtDKK, fmtFX, avColor, mkRow, UNITS, PALETTE, DEFAULT_PHASES, closeModal)

// ── LOCAL STATE ──
let activeTab = 'estimate';
let importData = null, importHeaders = null;
let coverPageEnabled = false;
let _tmplTargetSid = null;
let _rcItemsById = {};
let _autoSaveTimer = null;
const _undoStack = [];
const UNDO_MAX = 50;
let _recalcTimer = null;
let pendingPush = null;

// ── INIT ──
(function init() {
  const settings = App.getSettings();

  // Try to restore from draft first, then autosave, then demo data
  const draft = App.getDraft();
  if (draft && draft.S) {
    Object.assign(S, draft.S);
    Object.assign(projectMeta, draft.meta || {});
    applyMetaToDOM();
  } else {
    const autosave = (() => { try { return JSON.parse(localStorage.getItem(App._pfx('thelab_autosave')) || 'null'); } catch(e) { return null; } })();
    if (autosave && autosave.S) {
      Object.assign(S, autosave.S);
      Object.assign(projectMeta, {
        name: autosave.name || '',
        client: autosave.client || '',
        version: autosave.version || 'V1',
        date: autosave.date || '',
        currency: autosave.currency || 'DKK',
      });
      applyMetaToDOM();
    } else {
      initBlankEstimate(settings);
    }
  }

  if (!S.assignOpts || !S.assignOpts.length) {
    S.assignOpts = settings.allocationOptions && settings.allocationOptions.length
      ? [...settings.allocationOptions]
      : [];
  }

  // Load coverPage from effective settings (after S is loaded so project overrides apply)
  coverPageEnabled = getEffectiveExportSettings().coverPage;

  renderAssignOpts();
  renderEstimate();
  renderSavedList();
  App.fetchRates(document.getElementById('cur-status')).then(() => onCurChange());
  document.getElementById('cover-toggle').checked = coverPageEnabled;

  // Show seed/clear buttons in test mode
  if (App.getWorkspace() === 'test') {
    const seedBtn = document.getElementById('seed-btn');
    if (seedBtn) seedBtn.style.display = '';
    const clearBtn = document.getElementById('clear-btn');
    if (clearBtn) clearBtn.style.display = '';
  }
})();

function applyMetaToDOM() {
  document.getElementById('proj-name').value    = projectMeta.name    || '';
  document.getElementById('proj-client').value  = projectMeta.client  || '';
  document.getElementById('sel-ver').value      = projectMeta.version || 'V1';
  document.getElementById('proj-date').value    = projectMeta.date    || '';
  document.getElementById('sel-cur').value      = projectMeta.currency || 'DKK';
  updateProjContext();
}

window.updateProjContext = function() {
  const name = document.getElementById('proj-name').value.trim();
  const ver  = document.getElementById('sel-ver').value || 'V1';
  const ctx  = document.getElementById('proj-context');
  if (ctx) ctx.textContent = name ? (name.toUpperCase() + ' / ' + ver) : '—';
};

function initBlankEstimate(settings) {
  projectMeta.name   = '';
  projectMeta.client = '';
  projectMeta.date   = new Date().toISOString().slice(0, 10);
  S = {
    estimate: { sections: [{id:uid(),name:'Labour',rows:[]},{id:uid(),name:'Materials',rows:[]},{id:uid(),name:'Technical',rows:[]}] },
    process:  { phases: DEFAULT_PHASES.map(p => ({id:uid(),key:p.key,label:p.label,bg:p.bg,text:p.text,tasks:[]})) },
    assignOpts: [],
    jobTasks: [],
    overrides: {},
  };
  applyMetaToDOM();
}

// Only callable in test mode — seeds realistic sample data
function seedTestData() {
  if (App.getWorkspace() !== 'test') return;
  const seed = App.getSeedState();
  Object.assign(projectMeta, seed.meta);
  S = seed.S;
  App.clearDraft();
  applyMetaToDOM();
  renderAssignOpts();
  renderEstimate();
  renderSavedList();
  document.getElementById('dirty-ind').style.display = 'inline';
}

// ── SWITCH TO PROCESS ──
function switchToProcess() {
  saveDraftState();
  window.location.href = '/process.html';
}

// Save draft on any sys-nav navigation
window.addEventListener('pagehide', saveDraftState);

function saveDraftState() {
  readMetaFromDOM();
  App.saveDraft(projectMeta, S);
}

function readMetaFromDOM() {
  projectMeta.name     = document.getElementById('proj-name').value;
  projectMeta.client   = document.getElementById('proj-client').value;
  projectMeta.version  = document.getElementById('sel-ver').value;
  projectMeta.date     = document.getElementById('proj-date').value;
  projectMeta.currency = getCur();
}

// ── UNDO ──
function pushUndo() { _undoStack.push(JSON.stringify(S)); if (_undoStack.length > UNDO_MAX) _undoStack.shift(); }
function undo() {
  if (!_undoStack.length) return;
  S = JSON.parse(_undoStack.pop());
  renderAssignOpts();
  renderEstimate();
  document.getElementById('dirty-ind').style.display = 'inline';
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
});

// ── DIRTY / AUTOSAVE ──
function dirty() {
  document.getElementById('dirty-ind').style.display = 'inline';
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(autoSave, 2000);
}
function autoSave() {
  readMetaFromDOM();
  App.saveDraft(projectMeta, S);
}

// ── CURRENCY ──
function onCurChange() {
  const cur = document.getElementById('sel-cur').value;
  const el  = document.getElementById('fx-rate');
  el.textContent = cur === 'DKK' ? '1' : (App.rates[cur] || 7.46).toFixed(4);
  renderEstimate();
}
function getRate() { return parseFloat(document.getElementById('fx-rate').textContent) || 1; }
function getCur()  { return document.getElementById('sel-cur').value; }

// ── ASSIGNMENT OPTIONS ──
function renderAssignOpts() {
  const wrap = document.getElementById('assign-wrap');
  wrap.innerHTML = S.assignOpts.map((opt, i) =>
    `<span class="assign-tag">${esc(opt)}<span class="rm" onclick="removeAssignOpt(${i})">✕</span></span>`
  ).join('');
}
function addAssignOpt() {
  const inp = document.getElementById('assign-new');
  const val = inp.value.trim();
  if (!val) return;
  if (!S.assignOpts.includes(val)) S.assignOpts.push(val);
  inp.value = '';
  renderAssignOpts(); dirty();
}
function removeAssignOpt(i) {
  S.assignOpts.splice(i, 1);
  renderAssignOpts(); dirty();
}

// ── ESTIMATE ──
function getSection(sid) { return S.estimate.sections.find(s => s.id === sid); }
function getERow(sid, rid) { return getSection(sid).rows.find(r => r.id === rid); }

function recalcDebounced() { clearTimeout(_recalcTimer); _recalcTimer = setTimeout(recalc, 150); }

function renderEstimate() {
  const cur = getCur(), showFX = cur !== 'DKK';
  const area = document.getElementById('main');
  area.innerHTML = '';
  S.estimate.sections.forEach(sec => {
    const wrap = document.createElement('div');
    wrap.className = 'section-block';
    wrap.dataset.sid = sec.id;
    const fxTh = showFX ? `<th class="r">Price (${cur})</th>` : '';
    wrap.innerHTML = `
      <div class="section-hdr">
        <input class="section-name" value="${esc(sec.name)}" oninput="getSection('${sec.id}').name=this.value;dirty()">
        <button class="del-section-btn" onclick="delSection('${sec.id}')">✕</button>
      </div>
      <div style="overflow-x:auto">
        <table class="tbl" id="etbl-${sec.id}">
          <thead><tr>
            <th style="width:22px"></th>
            <th style="width:20%">Description</th><th style="width:10%">Spec</th>
            <th style="width:5%">Qty</th><th style="width:6%">Unit</th>
            <th class="r" style="width:8%">Price/unit</th>
            <th class="r" style="width:8%">Price (DKK)</th>${fxTh}
            <th class="r" style="width:8%">Cost/unit</th>
            <th class="r" style="width:8%">Cost (DKK)</th>
            <th class="r" style="width:7%">Margin %</th>
            <th style="width:11%">Note</th>
            <th style="width:60px"></th>
          </tr></thead>
          <tbody id="etb-${sec.id}"></tbody>
          <tfoot><tr><td colspan="99" class="tbl-footer">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <button class="add-row-btn" onclick="addERow('${sec.id}')">+ Add row</button>
                <button class="add-row-btn" onclick="openTemplateModal('${sec.id}')">⊞ From template</button>
              </div>
              <span id="sec-sub-${sec.id}" style="font-size:11px;color:var(--text2)"></span>
            </div>
          </td></tr></tfoot>
        </table>
      </div>`;
    area.appendChild(wrap);
    renderERows(sec, showFX, cur);
    setupEDragDrop(sec.id);
  });
  const addBtn = document.createElement('button');
  addBtn.className = 'add-section-btn'; addBtn.textContent = '+ Add category';
  addBtn.onclick = () => { pushUndo(); S.estimate.sections.push({id:uid(),name:'New category',rows:[]}); renderEstimate(); dirty(); };
  area.appendChild(addBtn);
  const totWrap = document.createElement('div');
  totWrap.style.overflowX = 'auto';
  totWrap.innerHTML = `<table class="tot-tbl"><tbody id="tot-body"></tbody></table>`;
  area.appendChild(totWrap);
  recalc();
}

function renderERows(sec, showFX, cur) {
  const tb = document.getElementById('etb-' + sec.id); if (!tb) return;
  tb.innerHTML = '';
  sec.rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.draggable = true; tr.dataset.rid = row.id; tr.dataset.sid = sec.id;
    const fxCell = showFX ? `<td class="cc" id="efx-${row.id}">—</td>` : '';
    tr.innerHTML = `
      <td><div class="move-btns">
        <button class="mb" onclick="moveERow('${sec.id}','${row.id}',-1)">▲</button>
        <button class="mb" onclick="moveERow('${sec.id}','${row.id}',1)">▼</button>
      </div></td>
      <td style="position:relative">
        <input class="ei" placeholder="Description..." value="${esc(row.what)}" autocomplete="off"
          oninput="getERow('${sec.id}','${row.id}').what=this.value;recalcDebounced();dirty();showRateCardAC(this,'${sec.id}','${row.id}')"
          onblur="setTimeout(()=>hideRateCardAC('${row.id}'),160)">
        <div class="rc-ac-drop" id="rcac-${row.id}" style="display:none"></div>
      </td>
      <td><input class="ei" placeholder="Spec..." value="${esc(row.spec)}" oninput="getERow('${sec.id}','${row.id}').spec=this.value;dirty()"></td>
      <td><input class="ei r" placeholder="—" value="${esc(row.qty)}"
        oninput="getERow('${sec.id}','${row.id}').qty=this.value;recalcDebounced();dirty()"
        onblur="evalQtyFormula(this,'${sec.id}','${row.id}')"></td>
      <td><select class="esel" onchange="getERow('${sec.id}','${row.id}').unit=this.value;dirty()">${UNITS.map(u=>`<option${u===row.unit?' selected':''}>${u}</option>`).join('')}</select></td>
      <td><input class="ei r" placeholder="0" value="${esc(row.sale)}" oninput="getERow('${sec.id}','${row.id}').sale=this.value;recalcDebounced();dirty()"></td>
      <td class="cc" id="est-${row.id}">—</td>${fxCell}
      <td><input class="ei r" placeholder="0" value="${esc(row.cost)}"
        oninput="getERow('${sec.id}','${row.id}').cost=this.value;recalcDebounced();dirty()"
        onkeydown="onEstRowLastFieldTab(event,'${sec.id}','${row.id}')"></td>
      <td class="cc" id="ect-${row.id}">—</td>
      <td class="cc" id="eav-${row.id}">—</td>
      <td>${noteCell(sec.id, row.id, row.note, 'E')}</td>
      <td style="white-space:nowrap">
        <button class="tmpl-save-btn" title="Save as template" onclick="saveRowAsTemplate('${sec.id}','${row.id}')">☆</button>
        <button class="dup-btn" title="Duplicate row" onclick="dupERow('${sec.id}','${row.id}')">⧉</button>
        <button class="rd" onclick="delERow('${sec.id}','${row.id}')">×</button>
      </td>`;
    tb.appendChild(tr);
  });
}

function addERow(sid) {
  pushUndo();
  getSection(sid).rows.push(mkRow());
  const sec = getSection(sid), cur = getCur();
  renderERows(sec, cur !== 'DKK', cur);
  setupEDragDrop(sid); recalc(); dirty();
}
function delERow(sid, rid) {
  pushUndo();
  getSection(sid).rows = getSection(sid).rows.filter(r => r.id !== rid);
  document.getElementById('etb-' + sid)?.querySelectorAll(`[data-rid="${rid}"]`).forEach(el => el.remove());
  recalc(); dirty();
}
function delSection(sid) {
  if (S.estimate.sections.length <= 1) return;
  pushUndo();
  S.estimate.sections = S.estimate.sections.filter(s => s.id !== sid);
  renderEstimate(); dirty();
}
function moveERow(sid, rid, dir) {
  pushUndo();
  const rows = getSection(sid).rows;
  const i = rows.findIndex(r => r.id === rid), ni = i + dir;
  if (ni < 0 || ni >= rows.length) return;
  [rows[i], rows[ni]] = [rows[ni], rows[i]];
  const cur = getCur(); renderERows(getSection(sid), cur !== 'DKK', cur);
  setupEDragDrop(sid); recalc(); dirty();
}
function dupERow(sid, rid) {
  pushUndo();
  const sec = getSection(sid);
  const i = sec.rows.findIndex(r => r.id === rid);
  const clone = Object.assign({}, sec.rows[i], {id: uid()});
  sec.rows.splice(i + 1, 0, clone);
  const cur = getCur(); renderERows(sec, cur !== 'DKK', cur);
  setupEDragDrop(sid); recalc(); dirty();
}
function onEstRowLastFieldTab(e, sid, rid) {
  if (e.key !== 'Tab' || e.shiftKey) return;
  const sec = getSection(sid);
  if (sec.rows[sec.rows.length - 1].id !== rid) return;
  e.preventDefault(); pushUndo();
  const newRow = mkRow(); sec.rows.push(newRow);
  const cur = getCur(); renderERows(sec, cur !== 'DKK', cur);
  setupEDragDrop(sid); recalc(); dirty();
  requestAnimationFrame(() => {
    document.getElementById('etb-' + sid)?.lastElementChild?.querySelector('.ei')?.focus();
  });
}
function evalQtyFormula(el, sid, rid) {
  const raw = el.value.trim();
  if (!raw || /^[\d.]+$/.test(raw)) return;
  if (!/^[\d\s+\-*/().]+$/.test(raw)) return;
  try {
    const result = Function('"use strict";return(' + raw + ')')();
    if (typeof result === 'number' && isFinite(result) && result >= 0) {
      el.value = String(parseFloat(result.toFixed(4)));
      getERow(sid, rid).qty = el.value;
      recalcDebounced(); dirty();
    }
  } catch(_) {}
}

// ── RATE CARD AUTOCOMPLETE ──
function showRateCardAC(input, sid, rid) {
  const val = input.value.trim().toLowerCase();
  const drop = document.getElementById('rcac-' + rid); if (!drop) return;
  if (val.length < 2) { drop.style.display = 'none'; return; }
  const rc = App.getSettings().rateCard || [];
  _rcItemsById = {};
  rc.forEach(item => { _rcItemsById[item.id] = item; });
  const matches = rc.filter(item => (item.name||'').toLowerCase().includes(val) || (item.spec||'').toLowerCase().includes(val)).slice(0, 7);
  if (!matches.length) { drop.style.display = 'none'; return; }
  drop.innerHTML = matches.map(item => `
    <div class="rc-ac-item" onmousedown="applyRateCard('${sid}','${rid}','${item.id}')">
      <div style="color:var(--hi);font-weight:500">${esc(item.name)}</div>
      <div style="font-size:11px;color:var(--text2)">${[esc(item.spec||''),esc(item.unit||''),item.sale?item.sale+' DKK':''].filter(Boolean).join(' · ')}</div>
    </div>`).join('');
  drop.style.display = 'block';
}
function hideRateCardAC(rid) {
  const drop = document.getElementById('rcac-' + rid); if (drop) drop.style.display = 'none';
}
function applyRateCard(sid, rid, iid) {
  const item = _rcItemsById[iid]; if (!item) return;
  const row = getERow(sid, rid);
  if (item.name) row.what = item.name;
  if (item.spec) row.spec = item.spec;
  if (item.unit) row.unit = item.unit;
  if (item.sale !== undefined && item.sale !== '') row.sale = String(item.sale);
  if (item.cost !== undefined && item.cost !== '') row.cost = String(item.cost);
  const cur = getCur(); renderERows(getSection(sid), cur !== 'DKK', cur);
  setupEDragDrop(sid); recalc(); dirty();
}

// ── ESTIMATE DRAG DROP ──
let eDragRow = null, eDragSid = null;
function setupEDragDrop(sid) {
  const tb = document.getElementById('etb-' + sid); if (!tb) return;
  tb.querySelectorAll('tr[draggable]').forEach(tr => {
    tr.addEventListener('dragstart', () => { eDragRow = tr.dataset.rid; eDragSid = tr.dataset.sid; setTimeout(() => tr.classList.add('dragging'), 0); });
    tr.addEventListener('dragend', () => { tr.classList.remove('dragging'); document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')); });
    tr.addEventListener('dragover', e => { e.preventDefault(); tr.classList.add('drag-over'); });
    tr.addEventListener('dragleave', () => tr.classList.remove('drag-over'));
    tr.addEventListener('drop', e => {
      e.preventDefault(); tr.classList.remove('drag-over');
      const targetRid = tr.dataset.rid, targetSid = tr.dataset.sid;
      if (!eDragRow || eDragRow === targetRid) return;
      pushUndo();
      const srcSec = getSection(eDragSid), tgtSec = getSection(targetSid);
      const srcIdx = srcSec.rows.findIndex(r => r.id === eDragRow);
      const row = srcSec.rows.splice(srcIdx, 1)[0];
      const tgtIdx = tgtSec.rows.findIndex(r => r.id === targetRid);
      tgtSec.rows.splice(tgtIdx, 0, row);
      const cur = getCur(), showFX = cur !== 'DKK';
      renderERows(srcSec, showFX, cur); setupEDragDrop(eDragSid);
      if (eDragSid !== targetSid) { renderERows(tgtSec, showFX, cur); setupEDragDrop(targetSid); }
      recalc(); dirty();
    });
  });
  tb.addEventListener('dragover', e => e.preventDefault());
  tb.addEventListener('drop', e => {
    e.preventDefault(); if (!eDragRow) return;
    const tgtSec = getSection(sid), srcSec = getSection(eDragSid);
    if (eDragSid === sid) return;
    pushUndo();
    const srcIdx = srcSec.rows.findIndex(r => r.id === eDragRow);
    const row = srcSec.rows.splice(srcIdx, 1)[0];
    tgtSec.rows.push(row);
    const cur = getCur(), showFX = cur !== 'DKK';
    renderERows(srcSec, showFX, cur); setupEDragDrop(eDragSid);
    renderERows(tgtSec, showFX, cur); setupEDragDrop(sid);
    recalc(); dirty();
  });
}

// ── RECALC ──
function recalc() {
  const cur = getCur(), rate = getRate(), showFX = cur !== 'DKK';
  let totSale = 0, totCost = 0;
  S.estimate.sections.forEach(sec => {
    let secSale = 0;
    sec.rows.forEach(row => {
      const q = parseFloat(row.qty)||0, s = parseFloat(row.sale)||0, c = parseFloat(row.cost)||0;
      const st = q*s, ct = q*c; totSale += st; totCost += ct; secSale += st;
      const stEl = document.getElementById('est-' + row.id); if (!stEl) return;
      stEl.textContent = st ? fmtDKK(st) : '—';
      const fxEl = document.getElementById('efx-' + row.id); if (fxEl) fxEl.textContent = st ? fmtFX(st, cur, rate) : '—';
      const ctEl = document.getElementById('ect-' + row.id); if (ctEl) ctEl.textContent = ct ? fmtDKK(ct) : '—';
      const avEl = document.getElementById('eav-' + row.id);
      if (avEl) {
        if (st && ct) { const pct = (st-ct)/st*100; const {bg,text} = avColor(pct); avEl.innerHTML = `<span class="av-pill" style="background:${bg};color:${text}">${pct.toFixed(1)}%</span>`; }
        else avEl.innerHTML = '<span style="color:var(--text3)">—</span>';
      }
    });
    const subEl = document.getElementById('sec-sub-' + sec.id);
    if (subEl) subEl.textContent = secSale ? 'Subtotal: ' + fmtDKK(secSale) : '';
  });
  const gp = totSale - totCost, pct = totSale ? (gp/totSale*100) : 0;
  document.getElementById('s-rev').textContent  = totSale ? fmtDKK(totSale) : '—';
  document.getElementById('s-cost').textContent = totCost ? fmtDKK(totCost) : '—';
  document.getElementById('s-gp').textContent   = gp      ? fmtDKK(gp)     : '—';
  const pEl = document.getElementById('s-pct');
  if (totSale) { const {text} = avColor(pct); pEl.textContent = pct.toFixed(2) + '%'; pEl.style.color = text; }
  else { pEl.textContent = '—'; pEl.style.color = ''; }
  const fxRow = document.getElementById('s-fx-row'); fxRow.style.display = showFX ? 'flex' : 'none';
  document.getElementById('s-fx-lbl').textContent = 'Total ' + cur;
  document.getElementById('s-fx').textContent = totSale && showFX ? fmtFX(totSale, cur, rate) : '—';
  const tb = document.getElementById('tot-body');
  if (tb) {
    const fxR = showFX ? `<tr><td>Total ${cur}</td><td class="tot-sub">${fmtFX(totSale,cur,rate)}</td></tr>` : '';
    tb.innerHTML = `<tr><td>Cost</td><td class="tot-sub">${fmtDKK(totCost)}</td></tr><tr><td>Gross profit</td><td class="tot-sub">${fmtDKK(gp)}</td></tr><tr><td>Total DKK</td><td>${fmtDKK(totSale)}</td></tr>${fxR}`;
  }
}

// ── NOTE ──
function noteCell(sid, rid, note, type) {
  const saveF = type === 'E'
    ? `getERow('${sid}','${rid}').note=this.value;dirty()`
    : `getPTask('${sid}','${rid}').note=this.value;dirty()`;
  const hasNote = note && note.trim();
  return `<div class="note-wrap">${hasNote
    ? `<div class="note-short" onclick="openNote('${rid}')" title="${esc(note)}">${esc(note)}</div>`
    : `<div class="note-add" onclick="openNote('${rid}')">+ note</div>`
  }<div class="note-pop" id="np-${rid}"><span class="note-cls" onclick="closeNote('${rid}')">Close ✕</span><textarea oninput="${saveF};syncNoteShort('${rid}',this.value)" placeholder="Note...">${esc(note)}</textarea></div></div>`;
}
function openNote(rid) { document.querySelectorAll('.note-pop').forEach(e => e.style.display='none'); const el = document.getElementById('np-'+rid); if (el) { el.style.display='block'; el.querySelector('textarea').focus(); } }
function closeNote(rid) { const el = document.getElementById('np-'+rid); if (el) el.style.display='none'; }
function syncNoteShort(rid, val) { const el = document.getElementById('np-'+rid); const s = el?.parentElement?.querySelector('.note-short,.note-add'); if (!s) return; if (val?.trim()) { s.className='note-short'; s.textContent=val; s.onclick=()=>openNote(rid); } else { s.className='note-add'; s.textContent='+ note'; s.onclick=()=>openNote(rid); } }

document.addEventListener('click', e => {
  if (!e.target.closest('.note-wrap')) document.querySelectorAll('.note-pop').forEach(el => el.style.display='none');
  if (!e.target.closest('[onclick="toggleExportMenu()"]') && !e.target.closest('#exp-menu')) { const m = document.getElementById('exp-menu'); if (m) m.style.display='none'; }
  if (!e.target.closest('.color-palette') && !e.target.closest('.phase-pill')) document.querySelectorAll('.color-palette').forEach(el => el.classList.remove('open'));
});

// ── PUSH TO ESTIMATE MODAL ──
function openPushModal(pid, tid) {
  const task = getPTask(pid, tid);
  if (!task.name) { alert('Add a task name first.'); return; }
  pendingPush = {pid, tid};
  const opts = document.getElementById('push-opts');
  opts.innerHTML = S.estimate.sections.map((sec, i) => `
    <div class="push-opt${i===0?' selected':''}" id="popt-${sec.id}" onclick="selectPushOpt('${sec.id}')">
      <div style="font-size:12px;font-weight:500;color:var(--hi)">${esc(sec.name)}</div>
      <div style="font-size:11px;color:var(--text2)">${sec.rows.length} rows</div>
    </div>`).join('');
  document.getElementById('push-modal').classList.add('open');
}
function selectPushOpt(sid) { document.querySelectorAll('.push-opt').forEach(el => el.classList.remove('selected')); document.getElementById('popt-' + sid)?.classList.add('selected'); }
function confirmPush() {
  if (!pendingPush) return;
  const selEl = document.querySelector('#push-opts .push-opt.selected'); if (!selEl) return;
  const sid = selEl.id.replace('popt-', '');
  const sec = getSection(sid); if (!sec) return;
  const task = getPTask(pendingPush.pid, pendingPush.tid);
  const settings = App.getSettings();
  const mh = (parseFloat(task.crew)||0) * (parseFloat(task.hrs)||0);
  const saleRate = parseFloat(settings.defaultSaleRate) || 0;
  const costRate = parseFloat(settings.defaultCostRate) || 0;
  pushUndo();
  sec.rows.push({id:uid(),what:task.name,spec:task.spec||'',qty:String(mh||task.crew||1),unit:'hrs',sale:saleRate?String(saleRate):'',cost:costRate?String(costRate):'',note:`From process: ${task.note||''}`});
  closeModal('push-modal');
  const cur = getCur(); renderERows(sec, cur !== 'DKK', cur); setupEDragDrop(sid); recalc(); dirty();
}
function pushAllToEstimate() {
  const settings = App.getSettings();
  const saleRate = parseFloat(settings.defaultSaleRate) || 0;
  const costRate = parseFloat(settings.defaultCostRate) || 0;
  const labSec = S.estimate.sections.find(s => s.name.toLowerCase().includes('labour')) || S.estimate.sections[0];
  let count = 0; pushUndo();
  S.process.phases.forEach(phase => {
    phase.tasks.forEach(task => {
      if (!task.name || task.hold === 'External') return;
      const mh = (parseFloat(task.crew)||0) * (parseFloat(task.hrs)||0);
      labSec.rows.push({id:uid(),what:task.name,spec:task.spec||'',qty:String(mh||task.crew||1),unit:'hrs',sale:saleRate?String(saleRate):'',cost:costRate?String(costRate):'',note:`[${phase.label}] ${task.note||''}`});
      count++;
    });
  });
  if (count > 0) { renderEstimate(); alert(`${count} tasks pushed to Estimate → ${labSec.name}.`); }
  else alert('No tasks to push.');
}

// Stubs for process functions referenced in push modal (process data lives in S)
function getPhase(pid)     { return S.process.phases.find(p => p.id === pid); }
function getPTask(pid, tid) { return getPhase(pid).tasks.find(t => t.id === tid); }

// ── TEMPLATES ──
function getTemplates() { try { return JSON.parse(localStorage.getItem(App._pfx('thelab_templates')) || '[]'); } catch(e) { return []; } }
function saveRowAsTemplate(sid, rid) {
  const row = getERow(sid, rid);
  const name = prompt('Template name:', row.what || 'Template'); if (!name) return;
  const templates = getTemplates().filter(t => t.name !== name);
  templates.push({id:uid(), name, row:Object.assign({}, row, {id:undefined, note:''})});
  localStorage.setItem(App._pfx('thelab_templates'), JSON.stringify(templates));
}
function openTemplateModal(sid) {
  _tmplTargetSid = sid;
  const templates = getTemplates();
  const el = document.getElementById('tmpl-list');
  if (!templates.length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--text2);padding:8px 0">No templates saved yet. Use ☆ on any row to save one.</p>';
  } else {
    el.innerHTML = templates.map(t => `
      <div class="push-opt" onclick="insertTemplate('${t.id}')">
        <div style="flex:1">
          <div style="font-size:12px;font-weight:500;color:var(--hi)">${esc(t.name)}</div>
          <div style="font-size:11px;color:var(--text2)">${esc(t.row.what||'')} · ${esc(t.row.unit||'')}${t.row.sale?' · '+t.row.sale+' DKK':''}</div>
        </div>
        <button class="rd" onclick="deleteTemplate('${t.id}',event)" title="Delete">×</button>
      </div>`).join('');
  }
  document.getElementById('tmpl-modal').classList.add('open');
}
function insertTemplate(tid) {
  if (!_tmplTargetSid) return;
  const tmpl = getTemplates().find(t => t.id === tid); if (!tmpl) return;
  pushUndo();
  getSection(_tmplTargetSid).rows.push(Object.assign({}, tmpl.row, {id:uid(), note:''}));
  closeModal('tmpl-modal');
  const sec = getSection(_tmplTargetSid), cur = getCur();
  renderERows(sec, cur !== 'DKK', cur); setupEDragDrop(_tmplTargetSid); recalc(); dirty();
}
function deleteTemplate(tid, e) {
  e.stopPropagation();
  localStorage.setItem(App._pfx('thelab_templates'), JSON.stringify(getTemplates().filter(t => t.id !== tid)));
  openTemplateModal(_tmplTargetSid);
}

// ── SAVE / LOAD ──
function saveProject() {
  readMetaFromDOM();
  const key = projectMeta.key || App.newProjectKey();
  projectMeta.key = key;
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
    const client = p.client || '';
    return `<div class="sv-item" onclick="loadProject('${p._key}')">
      <div class="sv-name">${esc(p.name||'Untitled')}${client?` <span style="color:var(--text3)">/ ${esc(client)}</span>`:''}</div>
      <span class="sv-dup" onclick="dupSaved('${p._key}',event)" title="Duplicate">⧉</span>
      <span class="sv-del" onclick="delSaved('${p._key}',event)">✕</span>
    </div>`;
  }).join('');
}
function loadProject(key) {
  const d = App.loadProjectByKey(key); if (!d) { alert('Could not load project'); return; }
  Object.assign(S, d.S);
  Object.assign(projectMeta, {key, name:d.name||'', client:d.client||'', version:d.version||'V1', date:d.date||'', currency:d.currency||'DKK', status:d.status||'active'});
  applyMetaToDOM();
  renderAssignOpts(); renderEstimate(); renderSavedList();
  document.getElementById('dirty-ind').style.display = 'none';
}
function delSaved(key, e) { e.stopPropagation(); if (confirm('Delete this project?')) { App.deleteProject(key); renderSavedList(); } }
function dupSaved(key, e) { e.stopPropagation(); App.duplicateProject(key); renderSavedList(); }
function newProject() {
  const settings = App.getSettings();
  const defaultOpts = settings.allocationOptions && settings.allocationOptions.length ? settings.allocationOptions : ['Team A','Team B','Both teams','External'];
  projectMeta = {key:null,name:'',client:'',version:'V1',date:new Date().toISOString().slice(0,10),currency:'DKK',status:'active'};
  S = {
    estimate:{sections:[{id:uid(),name:'Labour',rows:[]},{id:uid(),name:'Materials',rows:[]},{id:uid(),name:'Technical',rows:[]}]},
    process:{phases:DEFAULT_PHASES.map(p=>({id:uid(),key:p.key,label:p.label,bg:p.bg,text:p.text,tasks:[]}))},
    assignOpts:[...defaultOpts],
    jobTasks:[],
    overrides:{},
  };
  applyMetaToDOM();
  renderAssignOpts(); renderEstimate(); dirty();
}

// ── EXPORT MENU ──
function toggleExportMenu() {
  const m = document.getElementById('exp-menu'), items = document.getElementById('exp-items');
  document.getElementById('cover-toggle').checked = coverPageEnabled;
  items.innerHTML = `
    <div class="export-item" onclick="exportCSV()">CSV — Internal</div>
    <div class="export-item" onclick="exportXLSX()">Excel (.xlsx)</div>
    <div class="exp-div"></div>
    <div class="export-item" onclick="openWin(buildHTML(true))">HTML — Estimate internal</div>
    <div class="export-item" onclick="openWin(buildHTML(false))">HTML — Estimate client</div>
    <div class="export-item" onclick="callPDF(buildHTML(true),'estimate-internal')">PDF — Estimate internal</div>
    <div class="export-item" onclick="callPDF(buildHTML(false),'estimate-client')">PDF — Estimate client</div>
    <div class="exp-div"></div>
    <div class="export-item" onclick="openWin(buildCombined())">HTML — Combined report</div>
    <div class="export-item" onclick="callPDF(buildCombined(),'full-report')">PDF — Combined report</div>
    <div class="exp-div"></div>
    <div class="export-item" onclick="openVersionCompareModal()">Version comparison...</div>
    <div class="exp-div"></div>
    <div class="export-item" onclick="openExportOptsModal()">Export options...</div>`;
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
function openWin(html) { const w = window.open('','_blank'); if (w) { w.document.write(html); w.document.close(); } }

// ── EXPORT COLUMN DEFINITIONS ──
const EXPORT_COLUMNS = [
  {id:'description', label:'Description'},
  {id:'spec',        label:'Spec (sub-line)'},
  {id:'qty',         label:'Qty / Unit'},
  {id:'sale',        label:'Price/unit'},
  {id:'price_dkk',   label:'Price (DKK)'},
  {id:'cost',        label:'Cost/unit (internal)'},
  {id:'cost_dkk',    label:'Cost (DKK) (internal)'},
  {id:'margin',      label:'Margin % (internal)'},
  {id:'note',        label:'Note (internal)'},
];

// Merge global export defaults with per-project overrides in S.overrides.export
function getEffectiveExportSettings() {
  const global = App.getGlobal();
  const defaults  = global.exportDefaults || {};
  const overrides = (S.overrides && S.overrides.export) || {};
  return {
    coverPage:   overrides.coverPage   !== undefined ? overrides.coverPage   : (defaults.coverPage   || false),
    footerText:  overrides.footerText  !== undefined ? overrides.footerText  : (defaults.footerText  || 'All prices are estimates and exclude VAT'),
    showColumns: overrides.showColumns || defaults.showColumns || EXPORT_COLUMNS.map(c => c.id),
  };
}

// ── EXPORT OPTIONS MODAL ──
let _exportScope = 'project';

function _applyExportScopeStyle(scope) {
  const pBtn = document.getElementById('expopt-scope-project');
  const gBtn = document.getElementById('expopt-scope-global');
  if (!pBtn || !gBtn) return;
  pBtn.style.background = scope === 'project' ? 'var(--bg3)' : 'var(--bg)';
  pBtn.style.color      = scope === 'project' ? 'var(--hi)'  : 'var(--text2)';
  gBtn.style.background = scope === 'global'  ? 'var(--bg3)' : 'var(--bg)';
  gBtn.style.color      = scope === 'global'  ? 'var(--hi)'  : 'var(--text2)';
}

function openExportOptsModal() {
  document.getElementById('exp-menu').style.display = 'none';
  const eff = getEffectiveExportSettings();
  const hasProjectOverride = !!(S.overrides && S.overrides.export);
  _exportScope = hasProjectOverride ? 'project' : 'global';
  _applyExportScopeStyle(_exportScope);
  document.getElementById('expopt-cover').checked = eff.coverPage;
  document.getElementById('expopt-footer').value  = eff.footerText;
  const showCols = eff.showColumns;
  document.getElementById('expopt-cols').innerHTML = EXPORT_COLUMNS.map(col => `
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--bg3);padding:7px 0">
      <span style="font-size:12px;color:var(--text2)">${col.label}</span>
      <label class="toggle">
        <input type="checkbox" id="expopt-col-${col.id}" ${showCols.includes(col.id)?'checked':''}>
        <span class="toggle-slider"></span>
      </label>
    </div>`).join('');
  document.getElementById('expopt-modal').classList.add('open');
}

function setExportScope(scope) {
  _exportScope = scope;
  _applyExportScopeStyle(scope);
}

function saveExportOpts() {
  const coverPage   = document.getElementById('expopt-cover').checked;
  const footerText  = document.getElementById('expopt-footer').value.trim() || 'All prices are estimates and exclude VAT';
  const showColumns = EXPORT_COLUMNS
    .filter(col => document.getElementById('expopt-col-' + col.id)?.checked)
    .map(col => col.id);

  coverPageEnabled = coverPage;
  document.getElementById('cover-toggle').checked = coverPageEnabled;

  if (_exportScope === 'project') {
    if (!S.overrides) S.overrides = {};
    S.overrides.export = { coverPage, footerText, showColumns };
    dirty();
  } else {
    const g = App.getGlobal();
    g.exportDefaults = Object.assign(g.exportDefaults || {}, { coverPage, footerText, showColumns });
    App.saveGlobal(g);
    // Mirror to legacy settings key
    try {
      const ls = JSON.parse(localStorage.getItem('thelab_settings') || '{}');
      ls.footerText = footerText; ls.coverPageDefault = coverPage;
      localStorage.setItem('thelab_settings', JSON.stringify(ls));
    } catch(e) {}
  }
  closeModal('expopt-modal');
}

async function callPDF(html, suffix) {
  readMetaFromDOM();
  const name = (projectMeta.name || 'project').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();
  const filename = `thelab-${name}-${suffix}`;
  try {
    const res = await fetch('/api/pdf', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({html, filename})});
    if (!res.ok) throw new Error((await res.json()).error);
    const blob = await res.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename + '.pdf'; a.click();
  } catch(err) { alert('PDF error: ' + err.message); }
}

// ── CSV / XLSX ──
function exportCSV() {
  let rows = [['Category','Description','Spec','Qty','Unit','Price/unit','Price (DKK)','Cost/unit','Cost (DKK)','Margin %','Note']];
  S.estimate.sections.forEach(sec => { sec.rows.forEach(row => { const q=parseFloat(row.qty)||0,s=parseFloat(row.sale)||0,c=parseFloat(row.cost)||0; const st=q*s,ct=q*c,pct=st&&ct?(st-ct)/st*100:null; rows.push([sec.name,row.what,row.spec,row.qty,row.unit,row.sale,st?Math.round(st):'',row.cost,ct?Math.round(ct):'',pct!==null?pct.toFixed(1)+'%':'',row.note]); }); });
  const csv = rows.map(r => r.map(v => '"' + String(v||'').replace(/"/g,'""') + '"').join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download = 'thelab-estimate.csv'; a.click();
}
function exportXLSX() {
  const wb = XLSX.utils.book_new();
  const eR = [['Category','Description','Spec','Qty','Unit','Price/unit','Price (DKK)','Cost/unit','Cost (DKK)','Margin %','Note']];
  S.estimate.sections.forEach(sec => { eR.push([sec.name,'','','','','','','','','','']); sec.rows.forEach(row => { const q=parseFloat(row.qty)||0,s=parseFloat(row.sale)||0,c=parseFloat(row.cost)||0; const st=q*s,ct=q*c,pct=st&&ct?(st-ct)/st*100:null; eR.push(['',row.what,row.spec,row.qty||'',row.unit,row.sale||'',st||'',row.cost||'',ct||'',pct!==null?pct.toFixed(1)+'%':'',row.note]); }); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(eR), 'Estimate');
  const pR = [['Phase','Task','Spec','Crew','Hours','Man-hrs','Allocation','Note']];
  S.process.phases.forEach(phase => { phase.tasks.forEach(task => { const mh=(parseFloat(task.crew)||0)*(parseFloat(task.hrs)||0); pR.push([phase.label,task.name,task.spec,task.crew,task.hrs,mh,task.hold,task.note]); }); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pR), 'Process');
  XLSX.writeFile(wb, 'thelab-project.xlsx');
}

// ── IMPORT ──
function handleImport(e) {
  const file = e.target.files[0]; if (!file) return;
  if (file.name.toLowerCase().endsWith('.csv')) { const reader = new FileReader(); reader.onload = ev => parseCSV(ev.target.result); reader.readAsText(file); }
  else { const reader = new FileReader(); reader.onload = ev => { const wb = XLSX.read(ev.target.result,{type:'array'}); showMapper(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1})); }; reader.readAsArrayBuffer(file); }
  e.target.value = '';
}
function parseCSV(text) { const lines=text.trim().split('\n'); const data=lines.map(l=>{const arr=[];let cur='',inQ=false;for(let i=0;i<l.length;i++){if(l[i]==='"'){inQ=!inQ;}else if(l[i]===','&&!inQ){arr.push(cur.trim());cur='';}else cur+=l[i];}arr.push(cur.trim());return arr;}); showMapper(data); }
function showMapper(data) {
  if (!data || data.length < 2) { alert('File appears empty.'); return; }
  importHeaders = data[0]; importData = data.slice(1).filter(r => r.some(c => c));
  const fields = ['category','what','spec','qty','unit','sale','cost','note'];
  const labels = ['Category','Description','Spec','Qty','Unit','Sale price/unit','Cost/unit','Note'];
  document.getElementById('map-rows').innerHTML = fields.map((f,i) => `<div class="modal-row"><span style="color:var(--text);font-weight:500">${labels[i]}</span><select class="sb-in" id="map-${f}" style="width:180px"><option value="">— skip —</option>${importHeaders.map((h,j)=>`<option value="${j}"${h.toLowerCase().includes(f)?` selected`:''}>${h}</option>`).join('')}</select></div>`).join('');
  document.getElementById('map-modal').classList.add('open');
}
function confirmImport() {
  const fields = ['category','what','spec','qty','unit','sale','cost','note'];
  const mapping = {}; fields.forEach(f => { const v = document.getElementById('map-'+f).value; if (v !== '') mapping[f] = parseInt(v); });
  const cats = {}; pushUndo();
  importData.forEach(row => { const cat = mapping.category!=null?(row[mapping.category]||'Imported'):'Imported'; if(!cats[cat])cats[cat]=[]; cats[cat].push({id:uid(),what:mapping.what!=null?row[mapping.what]||'':'',spec:mapping.spec!=null?row[mapping.spec]||'':'',qty:mapping.qty!=null?row[mapping.qty]||'':'',unit:mapping.unit!=null?row[mapping.unit]||'pcs':'pcs',sale:mapping.sale!=null?String(row[mapping.sale]||'').replace(/[^0-9.,-]/g,''):'',cost:mapping.cost!=null?String(row[mapping.cost]||'').replace(/[^0-9.,-]/g,''):'',note:mapping.note!=null?row[mapping.note]||'':''}); });
  Object.entries(cats).forEach(([name,rows]) => { const ex = S.estimate.sections.find(s => s.name.toLowerCase()===name.toLowerCase()); if(ex)ex.rows.push(...rows); else S.estimate.sections.push({id:uid(),name,rows}); });
  closeModal('map-modal'); renderEstimate(); dirty();
}

// ── HTML EXPORT BUILDERS ──
function buildCoverPage(name, client, ver, date) {
  const settings = App.getSettings();
  const eff = getEffectiveExportSettings();
  const logo = settings.logoText || 'THE/LAB';
  const footer = eff.footerText;
  return `<div style="page-break-after:always;min-height:100vh;display:flex;flex-direction:column;justify-content:space-between;padding:60px 50px;background:#1a1a18"><div style="font-size:14px;font-weight:700;letter-spacing:2px;color:#f1efe8">${esc(logo)}</div><div><h1 style="font-size:44px;font-weight:700;color:#f1efe8;line-height:1.1;margin-bottom:14px">${esc(name)}</h1><p style="font-size:16px;color:#888780">${[esc(client),esc(ver),esc(date)].filter(Boolean).join(' · ')}</p></div><div style="font-size:11px;color:#5f5e5a">Generated ${new Date().toLocaleDateString('en-GB')} · ${esc(footer)}</div></div>`;
}
function buildEstimateBody(internal, cur, rate) {
  const eff = getEffectiveExportSettings();
  const footerText = eff.footerText;
  const sc = eff.showColumns;
  // Column visibility flags
  const showSpec     = sc.includes('spec');
  const showQty      = sc.includes('qty');
  const showSaleUnit = sc.includes('sale');
  const showPriceDkk = sc.includes('price_dkk');
  const showCostUnit = internal && sc.includes('cost');
  const showCostDkk  = internal && sc.includes('cost_dkk');
  const showMargin   = internal && sc.includes('margin');
  const showNote     = internal && sc.includes('note');
  const showFX       = cur !== 'DKK';

  let totSale = 0, totCost = 0;
  const catHTML = S.estimate.sections.map(sec => {
    const rowsHTML = sec.rows.map(row => {
      const q=parseFloat(row.qty)||0,s=parseFloat(row.sale)||0,c=parseFloat(row.cost)||0;
      const st=q*s,ct=q*c; totSale+=st; totCost+=ct;
      const pct=st&&ct?(st-ct)/st*100:null; const {bg,text}=avColor(pct);
      return `<tr>
        <td>${esc(row.what)||'—'}${showSpec&&row.spec?`<br><span style="font-size:11px;color:#888780">${esc(row.spec)}</span>`:''}</td>
        ${showQty?`<td style="color:#888780">${row.qty?esc(row.qty)+' '+esc(row.unit):'—'}</td>`:''}
        ${showSaleUnit?`<td style="text-align:right">${s?Math.round(s).toLocaleString('en-GB')+' DKK':'—'}</td>`:''}
        ${showPriceDkk?`<td style="text-align:right;font-weight:500">${st?Math.round(st).toLocaleString('en-GB')+' DKK':'—'}</td>`:''}
        ${showFX?`<td style="text-align:right;color:#888780">${st?fmtFX(st,cur,rate):'—'}</td>`:''}
        ${showCostUnit?`<td style="text-align:right;color:#888780">${c?Math.round(c).toLocaleString('en-GB')+' DKK':'—'}</td>`:''}
        ${showCostDkk?`<td style="text-align:right;color:#888780">${ct?Math.round(ct).toLocaleString('en-GB')+' DKK':'—'}</td>`:''}
        ${showMargin?`<td style="text-align:right"><span style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:11px;font-weight:600;background:${bg};color:${text}">${pct!==null?pct.toFixed(1)+'%':'—'}</span></td>`:''}
        ${showNote?`<td style="font-size:11px;color:#888780;white-space:pre-wrap">${esc(row.note)}</td>`:''}
      </tr>`;
    }).join('');
    return `<tr class="cat-row"><td colspan="99">${esc(sec.name)}</td></tr>${rowsHTML}`;
  }).join('');

  const gp=totSale-totCost, pct=totSale?gp/totSale*100:0;
  const {text:pText}=avColor(totSale?pct:null);
  const colCount = 1 +
    (showQty?1:0)+(showSaleUnit?1:0)+(showPriceDkk?1:0)+(showFX?1:0)+
    (showCostUnit?1:0)+(showCostDkk?1:0)+(showMargin?1:0)+(showNote?1:0);

  const summaryGrid=internal?`<div class="grid"><div class="sc"><div class="sn">${Math.round(totSale).toLocaleString('en-GB')} DKK</div><div class="sl">Revenue</div></div><div class="sc"><div class="sn">${Math.round(totCost).toLocaleString('en-GB')} DKK</div><div class="sl">Cost</div></div><div class="sc"><div class="sn">${Math.round(gp).toLocaleString('en-GB')} DKK</div><div class="sl">Gross profit</div></div><div class="sc"><div class="sn" style="color:${pText}">${totSale?pct.toFixed(2)+'%':'—'}</div><div class="sl">Margin %</div></div></div>`:'';

  const thead = `<thead><tr>
    <th style="width:${internal?'22%':'34%'}">Description</th>
    ${showQty?'<th>Qty / unit</th>':''}
    ${showSaleUnit?'<th class="r">Price/unit</th>':''}
    ${showPriceDkk?'<th class="r">Price (DKK)</th>':''}
    ${showFX?`<th class="r">Price (${cur})</th>`:''}
    ${showCostUnit?'<th class="r">Cost/unit</th>':''}
    ${showCostDkk?'<th class="r">Cost (DKK)</th>':''}
    ${showMargin?'<th class="r">Margin %</th>':''}
    ${showNote?'<th>Note</th>':''}
  </tr></thead>`;

  const tfoot = `<tfoot>
    ${showCostDkk?`<tr class="tr"><td colspan="${colCount-1}">Cost</td><td style="color:#888780;font-weight:400">${Math.round(totCost).toLocaleString('en-GB')} DKK</td></tr>`:''}
    ${showPriceDkk?`<tr class="tr"><td colspan="${colCount-1}">Total DKK</td><td>${Math.round(totSale).toLocaleString('en-GB')} DKK</td></tr>`:''}
    ${showFX?`<tr class="tr"><td colspan="${colCount-1}"><span style="color:#888780;font-size:11px;font-weight:400">Total ${cur}</span></td><td>${fmtFX(totSale,cur,rate)}</td></tr>`:''}
  </tfoot>`;

  return `${summaryGrid}<table>${thead}<tbody>${catHTML}</tbody>${tfoot}</table><div class="footer"><span>The/Lab · ${esc(projectMeta.name||'')}${projectMeta.client?' / '+esc(projectMeta.client):''}</span><span>${esc(projectMeta.version||'')} · ${esc(footerText)}</span></div>`;
}
function buildProcessBody() {
  let totalMH=0,totalTasks=0,onSiteDays=0;
  S.process.phases.forEach(phase=>{if(phase.key.startsWith('d')&&/^d\d+$/.test(phase.key)&&phase.tasks.length)onSiteDays++;phase.tasks.forEach(t=>{totalMH+=(parseFloat(t.crew)||0)*(parseFloat(t.hrs)||0);totalTasks++;});});
  const phasesHTML=S.process.phases.map(phase=>{if(!phase.tasks.length)return'';const rowsHTML=phase.tasks.map(task=>{const mh=(parseFloat(task.crew)||0)*(parseFloat(task.hrs)||0);return`<tr><td>${esc(task.name)||'—'}${task.spec?`<br><span style="font-size:11px;color:#888780">${esc(task.spec)}</span>`:''}</td><td style="text-align:right">${task.crew||'—'}</td><td style="text-align:right">${task.hrs||'—'}</td><td style="text-align:right;font-weight:500">${mh||'—'}</td><td style="color:#888780">${esc(task.hold)||'—'}</td><td style="font-size:11px;color:#888780">${esc(task.note)||''}</td></tr>`;}).join('');return`<div style="margin-bottom:20px"><div style="margin-bottom:8px"><span style="display:inline-block;font-size:10px;font-weight:600;padding:3px 10px;border-radius:20px;background:${phase.bg};color:${phase.text}">${esc(phase.label)}</span></div><table><thead><tr><th style="width:32%">Task</th><th class="r" style="width:8%">Crew</th><th class="r" style="width:8%">Hours</th><th class="r" style="width:10%">Man-hrs</th><th style="width:14%">Allocation</th><th>Note</th></tr></thead><tbody>${rowsHTML}</tbody></table></div>`;}).join('');
  const eff=getEffectiveExportSettings();
  const footerText=eff.footerText;
  return `<div class="grid"><div class="sc"><div class="sn">${onSiteDays}</div><div class="sl">On-site days</div></div><div class="sc"><div class="sn">${totalMH}</div><div class="sl">Man-hours total</div></div><div class="sc"><div class="sn">${totalTasks}</div><div class="sl">Tasks</div></div></div>${phasesHTML}<div class="footer"><span>The/Lab · ${esc(projectMeta.name||'')}${projectMeta.client?' / '+esc(projectMeta.client):''}</span><span>${esc(projectMeta.version||'')} · ${esc(footerText)}</span></div>`;
}
function buildHTML(internal) {
  readMetaFromDOM();
  const {name,client,version:ver,date,currency:cur} = projectMeta;
  const rate = getRate();
  const cover = coverPageEnabled ? buildCoverPage(name,client,ver,date) : '';
  const body  = buildEstimateBody(internal, cur, rate);
  const gc = internal ? 4 : 1;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(name)}</title><style>${App.exportCSS}.wrap{max-width:${internal?'1100px':'820px'}}.grid{grid-template-columns:repeat(${gc},1fr)}</style></head><body>${cover}<div class="wrap"><div class="hdr"><div><h1>${esc(name)}${internal?' <span class="badge">INTERNAL</span>':''}</h1><p class="sub">${[esc(client),ver,date].filter(Boolean).join(' · ')}</p></div><div class="logo">THE/LAB</div></div>${body}</div></body></html>`;
}
function buildProcessHTML() {
  readMetaFromDOM();
  const {name,client,version:ver,date} = projectMeta;
  const cover = coverPageEnabled ? buildCoverPage(name,client,ver,date) : '';
  const body  = buildProcessBody();
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(name)} — Process</title><style>${App.exportCSS}.wrap{max-width:900px}.grid{grid-template-columns:repeat(3,1fr)}</style></head><body>${cover}<div class="wrap"><div class="hdr"><div><h1>${esc(name)} — Process Overview</h1><p class="sub">${[esc(client),ver,date].filter(Boolean).join(' · ')}</p></div><div class="logo">THE/LAB</div></div>${body}</div></body></html>`;
}
function buildCombined() {
  readMetaFromDOM();
  const {name,client,version:ver,date,currency:cur} = projectMeta;
  const cover = coverPageEnabled ? buildCoverPage(name,client,ver,date) : '';
  const eB = buildEstimateBody(true, cur, getRate());
  const pB = buildProcessBody();
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(name)} — Full Report</title><style>${App.exportCSS}.wrap{max-width:1100px}.grid{grid-template-columns:repeat(4,1fr)}</style></head><body>${cover}<div class="wrap"><div class="hdr"><div><h1>${esc(name)} — Full Report</h1><p class="sub">${[esc(client),ver,date].filter(Boolean).join(' · ')}</p></div><div class="logo">THE/LAB</div></div><div class="section-title">Estimate</div>${eB}<div class="section-title">Process Overview</div>${pB}</div></body></html>`;
}

// ── VERSION COMPARE ──
function openVersionCompareModal() {
  document.getElementById('exp-menu').style.display = 'none';
  const projects = App.getSavedProjects();
  const el = document.getElementById('vcmp-list');
  if (!projects.length) { el.innerHTML = '<p style="font-size:12px;color:var(--text2);padding:4px 0">No saved projects found.</p>'; }
  else { el.innerHTML = projects.map(p => `<div class="vcmp-item"><input type="checkbox" id="vcmp-${p._key}" value="${p._key}"><label for="vcmp-${p._key}" style="flex:1;cursor:pointer"><div style="font-size:12px;font-weight:500;color:var(--hi)">${esc(p.name||'Untitled')}</div><div style="font-size:11px;color:var(--text2)">${[esc(p.client||''),p.version||'',p.date||''].filter(Boolean).join(' · ')}</div></label></div>`).join(''); }
  document.getElementById('vcmp-modal').classList.add('open');
}
function exportVersionComparison(format) {
  const checked = [...document.querySelectorAll('#vcmp-list input[type=checkbox]:checked')];
  if (!checked.length) { alert('Select at least one version.'); return; }
  const versions = checked.map(cb => App.loadProjectByKey(cb.value)).filter(Boolean);
  const html = buildVersionComparisonHTML(versions);
  closeModal('vcmp-modal');
  if (format === 'html') openWin(html); else callPDF(html, 'version-comparison');
}
function buildVersionComparisonHTML(versions) {
  readMetaFromDOM();
  const savedS = JSON.parse(JSON.stringify(S));
  const {name,client} = projectMeta;
  const cover = coverPageEnabled ? buildCoverPage(name,client,'Comparison',new Date().toISOString().slice(0,10)) : '';
  const sections = versions.map(v => {
    Object.assign(S, v.S);
    const body = buildEstimateBody(true, v.currency||'DKK', parseFloat(v.rate)||1);
    Object.assign(S, savedS);
    return `<div class="section-title">${esc(v.name||'Untitled')} — ${esc(v.version||'')}${v.date?' · '+esc(v.date):''}</div>${body}`;
  }).join('');
  Object.assign(S, savedS);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Version Comparison</title><style>${App.exportCSS}.wrap{max-width:1100px}.grid{grid-template-columns:repeat(4,1fr)}</style></head><body>${cover}<div class="wrap"><div class="hdr"><div><h1>${esc(name)} — Version Comparison</h1><p class="sub">${esc(client||'')}</p></div><div class="logo">THE/LAB</div></div>${sections}</div></body></html>`;
}
