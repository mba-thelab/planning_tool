'use strict';

// ── CONSTANTS ──
const UNITS = ['pcs','m','m²','mm','cm','hrs','days','lin.m','kg','l','—'];
const PALETTE = [
  {bg:'#0c447c',text:'#b5d4f4',label:'Blue'},
  {bg:'#085041',text:'#9fe1cb',label:'Teal'},
  {bg:'#3c3489',text:'#cecbf6',label:'Purple'},
  {bg:'#712b13',text:'#f5c4b3',label:'Coral'},
  {bg:'#633806',text:'#fac775',label:'Amber'},
  {bg:'#27500a',text:'#c0dd97',label:'Green'},
  {bg:'#444441',text:'#d3d1c7',label:'Gray'},
  {bg:'#791f1f',text:'#f7c1c1',label:'Red'},
];
const DEFAULT_PHASES = [
  {key:'prep', label:'Preparation', bg:'#0c447c', text:'#b5d4f4'},
  {key:'ext',  label:'External',    bg:'#633806', text:'#fac775'},
  {key:'d1',   label:'Day 1',       bg:'#085041', text:'#9fe1cb'},
  {key:'d2',   label:'Day 2',       bg:'#3c3489', text:'#cecbf6'},
  {key:'d3',   label:'Day 3',       bg:'#712b13', text:'#f5c4b3'},
];
const DEFAULT_JOB_STAGES = [
  {id:'build',    name:'Build',    hasDateRange:true},
  {id:'paint',    name:'Paint',    hasDateRange:true},
  {id:'delivery', name:'Delivery', hasDateRange:false},
  {id:'ongoing',  name:'Ongoing',  hasDateRange:false},
  {id:'strike',   name:'Strike',   hasDateRange:false},
];

// ── UTILS ──
function uid() { return Math.random().toString(36).slice(2,9); }
function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtDKK(n) { return Math.round(n).toLocaleString('en-GB') + ' DKK'; }
function fmtFX(n, cur, rate) { return (cur==='EUR'?'€':'$') + (n/rate).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function avColor(pct) {
  const TARGET = App.getGlobal().rates.targetMargin || 20;
  if (pct === null) return {bg:'transparent', text:'var(--text3)'};
  const d = pct - TARGET;
  if (d >= 0) {
    const t = Math.min(d/25,1);
    return {bg:`rgba(${Math.round(20+20*t)},${Math.round(70+80*t)},${Math.round(30+20*t)},1)`, text:`rgb(${Math.round(100-60*t)},${Math.round(200+55*t)},${Math.round(120+40*t)})`};
  } else {
    const t = Math.min(-d/25,1);
    return {bg:`rgba(${Math.round(80+50*t)},${Math.round(30-10*t)},20,1)`, text:`rgb(${Math.round(220+35*t)},${Math.round(100-60*t)},60)`};
  }
}

// ── STATE ──
// Shared project state — manipulated by estimate.js and process.js
let S = {
  estimate: {sections:[]},
  process:  {phases:[]},
  assignOpts: [],
  jobTasks: [],
  overrides: {},
};

// Project metadata (envelope around S)
let projectMeta = {
  key: null,
  name: '',
  client: '',
  version: 'V1',
  date: new Date().toISOString().slice(0,10),
  currency: 'DKK',
  status: 'active',
};

function mkRow()  { return {id:uid(),what:'',spec:'',qty:'',unit:'pcs',sale:'',cost:'',note:''}; }
function mkTask() { return {id:uid(),name:'',spec:'',crew:2,hrs:8,hold:'',note:''}; }

// ── APP NAMESPACE ──
const App = {

  // ── AUTH ──
  currentUser: null,

  async fetchCurrentUser() {
    try {
      const res = await fetch('/api/me');
      if (!res.ok) return null;
      this.currentUser = await res.json();
      // Match to employee roster by email to get role
      const global = this.getGlobal();
      const emp = (global.employees || []).find(e => e.email === this.currentUser.email);
      this.currentUser.role       = emp ? emp.role       : 'employee';
      this.currentUser.employeeId = emp ? emp.id         : null;
      this.currentUser.deptId     = emp ? emp.deptId     : null;
      // Keep localStorage session in sync for backward compat
      this.saveSession({ employeeId: this.currentUser.employeeId, viewMode: this.currentUser.role });
      this._injectUserBar();
      return this.currentUser;
    } catch(e) { return null; }
  },

  async logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
  },

  _injectUserBar() {
    const u = this.currentUser;
    if (!u) return;
    // Add name + logout to every topbar tr-right
    const right = document.querySelector('.tr-right');
    if (!right || document.getElementById('user-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'user-bar';
    bar.style.cssText = 'display:flex;align-items:center;gap:8px;margin-left:4px;padding-left:10px;border-left:1px solid var(--border)';
    bar.innerHTML = `
      ${u.avatar ? `<img src="${u.avatar}" style="width:22px;height:22px;border-radius:50%;object-fit:cover">` : ''}
      <span style="font-size:11px;color:var(--text2)">${esc(u.name.split(' ')[0])}</span>
      <button class="btn ghost" style="font-size:11px;padding:3px 8px" onclick="App.logout()">Sign out</button>`;
    right.appendChild(bar);
  },

  // ── SESSION ──
  getSession() {
    try { return Object.assign({employeeId:null, viewMode:'admin'}, JSON.parse(localStorage.getItem('thelab_session')||'{}')); }
    catch(e) { return {employeeId:null, viewMode:'admin'}; }
  },
  saveSession(data) {
    localStorage.setItem('thelab_session', JSON.stringify(data));
  },
  canAccess(feature) {
    const mode = this.getSession().viewMode;
    const rules = {
      estimate:    ['teamleader','admin'],
      process:     ['teamleader','admin'],
      settings:    ['admin'],
      postMessage: ['teamleader','admin'],
      jobboard:    ['employee','teamleader','admin'],
      dashboard:   ['employee','teamleader','admin'],
    };
    return (rules[feature] || []).includes(mode);
  },

  // ── GLOBAL SETTINGS ──
  getGlobal() {
    const defaults = {
      departments: [],
      employees: [],
      jobStages: DEFAULT_JOB_STAGES,
      rates: {defaultSaleRate:0, defaultCostRate:0, targetMargin:20},
      appearance: {logoText:'THE/LAB', theme:'dark', font:'system'},
      exportDefaults: {
        footerText: 'All prices are estimates and exclude VAT',
        showColumns: ['description','qty','unit','sale','cost','margin','note'],
        colors: {}, coverPage: false,
      },
    };
    try {
      const stored = JSON.parse(localStorage.getItem('thelab_global') || '{}');
      return this._deepMerge(defaults, stored);
    } catch(e) { return defaults; }
  },
  saveGlobal(data) {
    localStorage.setItem('thelab_global', JSON.stringify(data));
  },

  // Backward-compat shim — reads old thelab_settings and blends with global
  getSettings() {
    const g = this.getGlobal();
    let old = {};
    if (!localStorage.getItem('thelab_global')) {
      try { old = JSON.parse(localStorage.getItem('thelab_settings') || '{}'); } catch(e) {}
    }
    return {
      logoText:         g.appearance.logoText           || old.logoText           || 'THE/LAB',
      footerText:       g.exportDefaults.footerText     || old.footerText         || 'All prices are estimates and exclude VAT',
      defaultSaleRate:  g.rates.defaultSaleRate         || old.defaultSaleRate    || 0,
      defaultCostRate:  g.rates.defaultCostRate         || old.defaultCostRate    || 0,
      coverPageDefault: g.exportDefaults.coverPage      || old.coverPageDefault   || false,
      allocationOptions:old.allocationOptions           || ['Team A','Team B','Both teams','External'],
      rateCard:         old.rateCard                    || [],
    };
  },

  // ── DRAFT (in-progress project across page navigations) ──
  getDraft() {
    try { return JSON.parse(localStorage.getItem('thelab_draft') || 'null'); }
    catch(e) { return null; }
  },
  saveDraft(meta, state) {
    localStorage.setItem('thelab_draft', JSON.stringify({meta, S: state, draftAt: Date.now()}));
  },
  clearDraft() {
    localStorage.removeItem('thelab_draft');
    localStorage.removeItem('thelab_autosave');
  },

  // ── PROJECTS ──
  getSavedKeys() {
    return Object.keys(localStorage).filter(k => k.startsWith('thelab_proj_')).sort().reverse();
  },
  getSavedProjects() {
    return this.getSavedKeys().map(k => {
      try {
        const d = JSON.parse(localStorage.getItem(k));
        return {...d, _key: k};
      } catch(e) { return null; }
    }).filter(Boolean);
  },
  saveProjectData(key, meta, state) {
    const data = {
      ...meta,
      key,
      S: state,
      savedAt: Date.now(),
      // Preserve new fields; fall back to empty defaults
      jobTasks: state.jobTasks || [],
      overrides: state.overrides || {},
    };
    localStorage.setItem(key, JSON.stringify(data));
  },
  loadProjectByKey(key) {
    try {
      const d = JSON.parse(localStorage.getItem(key));
      // Ensure new fields exist for old saves
      if (d.S && !d.S.jobTasks)  d.S.jobTasks  = [];
      if (d.S && !d.S.overrides) d.S.overrides  = {};
      return d;
    } catch(e) { return null; }
  },
  deleteProject(key) {
    localStorage.removeItem(key);
  },
  duplicateProject(key) {
    const d = this.loadProjectByKey(key);
    if (!d) return null;
    const copy = JSON.parse(JSON.stringify(d));
    copy.name = (d.name || 'Untitled') + ' (copy)';
    copy.savedAt = Date.now();
    // Fresh IDs
    copy.S.estimate.sections.forEach(sec => { sec.id = uid(); sec.rows.forEach(r => r.id = uid()); });
    copy.S.process.phases.forEach(ph => { ph.id = uid(); ph.tasks.forEach(t => t.id = uid()); });
    if (copy.S.jobTasks) copy.S.jobTasks = copy.S.jobTasks.map(jt => ({...jt, id: uid()}));
    const newKey = 'thelab_proj_' + Date.now();
    copy.key = newKey;
    localStorage.setItem(newKey, JSON.stringify(copy));
    return newKey;
  },

  // ── NAVIGATION (with access guard) ──
  navigate(page) {
    const guards = {'estimate.html':'estimate','process.html':'process','settings.html':'settings','jobs.html':'jobboard'};
    const feature = guards[page];
    if (feature && !this.canAccess(feature)) {
      window.location.href = '/';
      return;
    }
    window.location.href = '/' + page;
  },

  // ── CURRENCY ──
  rates: {EUR: 7.46, USD: 7.90},
  async fetchRates(statusEl) {
    if (statusEl) { statusEl.className = 'cur-loading'; statusEl.textContent = 'Fetching rates...'; }
    try {
      const res  = await fetch('/api/rates');
      const data = await res.json();
      if (data.EUR) App.rates.EUR = data.EUR;
      if (data.USD) App.rates.USD = data.USD;
      localStorage.setItem('thelab_rates', JSON.stringify({rates: App.rates, ts: Date.now()}));
      if (statusEl) { statusEl.className = 'cur-ok'; statusEl.textContent = 'Rates updated (Nationalbanken)'; }
      return true;
    } catch(e) {
      try {
        const saved = JSON.parse(localStorage.getItem('thelab_rates'));
        if (saved?.rates) App.rates = saved.rates;
      } catch(_) {}
      if (statusEl) { statusEl.className = 'cur-err'; statusEl.textContent = 'Offline — saved rates'; }
      return false;
    }
  },

  // ── EXPORT CSS (shared between HTML builders) ──
  exportCSS: `*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#d3d1c7;background:#1a1a18;padding:40px 20px}.wrap{margin:0 auto}.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px}h1{font-size:20px;font-weight:600;color:#f1efe8}.sub{font-size:12px;color:#888780;margin-bottom:22px}.logo{font-size:13px;font-weight:700;letter-spacing:2px;color:#f1efe8}.badge{display:inline-block;font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;background:#3c3489;color:#cecbf6;margin-left:8px;vertical-align:middle}.grid{display:grid;gap:10px;margin-bottom:22px}.sc{background:#2c2c2a;border:1px solid #3d3d3a;border-radius:8px;padding:12px 16px}.sn{font-size:18px;font-weight:600;color:#f1efe8}.sl{font-size:11px;color:#888780;margin-top:2px}table{width:100%;border-collapse:collapse;border:1px solid #3d3d3a;border-radius:8px;overflow:hidden;background:#2c2c2a;margin-bottom:14px}thead tr{background:#1a1a18}th{font-size:11px;font-weight:600;color:#888780;text-align:left;padding:7px 12px;border-bottom:1px solid #3d3d3a;white-space:nowrap}th.r{text-align:right}td{padding:7px 12px;font-size:12px;color:#d3d1c7;border-bottom:1px solid #1a1a18;vertical-align:middle}tr:last-child td{border-bottom:none}.tr{background:#1a1a18;font-weight:600;color:#f1efe8;font-size:13px;border-top:1px solid #3d3d3a}.tr td{text-align:right}.tr td:first-child{text-align:left}.cat-row td{background:#2c2c2a;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:#888780;padding:5px 12px}.footer{margin-top:22px;border-top:1px solid #2c2c2a;padding-top:12px;font-size:11px;color:#5f5e5a;display:flex;justify-content:space-between}.section-title{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:#5f5e5a;margin:28px 0 12px;padding-bottom:7px;border-bottom:1px solid #3d3d3a}`,

  // ── INTERNAL HELPER ──
  _deepMerge(target, source) {
    const out = {...target};
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
          && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
        out[key] = this._deepMerge(target[key], source[key]);
      } else {
        out[key] = source[key];
      }
    }
    return out;
  },
};

// ── PAGE GUARD ── call at top of any restricted page
function guardPage(feature) {
  if (!App.canAccess(feature)) {
    window.location.href = '/';
  }
}

// ── SHARED MODAL HELPER ──
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

// ── AUTO-INIT AUTH on every page ──
document.addEventListener('DOMContentLoaded', () => App.fetchCurrentUser());
