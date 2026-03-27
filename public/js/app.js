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
  {key:'prep',    label:'Preparation', bg:'#0c447c', text:'#b5d4f4'},
  {key:'build',   label:'Build',       bg:'#085041', text:'#9fe1cb'},
  {key:'paint',   label:'Paint',       bg:'#633806', text:'#fac775'},
  {key:'install', label:'Install',     bg:'#3c3489', text:'#cecbf6'},
  {key:'strike',  label:'Strike',      bg:'#712b13', text:'#f5c4b3'},
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

      const global = this.getGlobal();
      if (!global.employees) global.employees = [];
      let emp = global.employees.find(e => e.email === this.currentUser.email);

      // Bootstrap admin: auto-create/promote if email matches ADMIN_EMAIL
      if (this.currentUser.isBootstrapAdmin) {
        if (!emp) {
          emp = { id: uid(), name: this.currentUser.name, email: this.currentUser.email,
                  role: 'teamleader', isAdmin: true, deptId: null, subDeptId: null };
          global.employees.push(emp);
          this.saveGlobal(global);
        } else if (!emp.isAdmin && emp.role !== 'admin') {
          emp.isAdmin = true;
          this.saveGlobal(global);
        }
      }

      // First login — redirect to onboarding (skip if already there, or in test mode)
      if (!emp) {
        if (this.getWorkspace() === 'test') {
          // In test mode, grant admin without onboarding
          this.currentUser.role    = 'teamleader';
          this.currentUser.isAdmin = true;
          this.currentUser.employeeId = null;
          this.currentUser.deptId  = null;
          this.saveSession({ employeeId: null, viewMode: 'admin' });
          this._injectUserBar();
          return this.currentUser;
        }
        if (window.location.pathname !== '/onboard.html') {
          window.location.href = '/onboard.html';
          return null;
        }
      }

      const isAdmin = emp ? (emp.isAdmin || emp.role === 'admin') : false;
      this.currentUser.role       = emp ? (emp.role === 'admin' ? 'teamleader' : (emp.role || 'employee')) : 'employee';
      this.currentUser.isAdmin    = isAdmin;
      this.currentUser.employeeId = emp ? emp.id     : null;
      this.currentUser.deptId     = emp ? emp.deptId : null;
      this.saveSession({ employeeId: this.currentUser.employeeId, viewMode: isAdmin ? 'admin' : this.currentUser.role });
      this._injectUserBar();
      return this.currentUser;
    } catch(e) { return null; }
  },

  async logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
  },

  // ── WORKSPACE (live / test) ──
  getWorkspace() {
    return localStorage.getItem('thelab_workspace') || 'live';
  },
  setWorkspace(ws) {
    localStorage.setItem('thelab_workspace', ws);
    window.location.reload();
  },
  // Prefix storage keys for test workspace
  _pfx(key) {
    if (this.getWorkspace() === 'test') {
      // Don't prefix session, rates, or workspace keys — only data keys
      return key.replace(/^thelab_(?!workspace|session|rates|settings)/, 'thelab_test_');
    }
    return key;
  },
  newProjectKey() {
    return this._pfx('thelab_proj_') + Date.now();
  },

  _injectUserBar() {
    const u = this.currentUser;
    if (!u) return;
    const right = document.querySelector('.tr-right');
    if (!right || document.getElementById('user-bar')) return;
    const ws = this.getWorkspace();
    const wsBtn = u.isAdmin
      ? (ws === 'test'
          ? `<span style="font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;background:#3c3489;color:#cecbf6;cursor:pointer;border:1px solid #5a50c0" onclick="App.setWorkspace('live')" title="Click to switch back to live data">TEST MODE</span>`
          : `<button class="btn ghost" style="font-size:10px;padding:2px 7px" onclick="App.setWorkspace('test')" title="Switch to test data">Test</button>`)
      : '';
    const bar = document.createElement('div');
    bar.id = 'user-bar';
    bar.style.cssText = 'display:flex;align-items:center;gap:8px;margin-left:4px;padding-left:10px;border-left:1px solid var(--border)';
    bar.innerHTML = `
      ${wsBtn}
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
      const stored = JSON.parse(localStorage.getItem(this._pfx('thelab_global')) || '{}');
      return this._deepMerge(defaults, stored);
    } catch(e) { return defaults; }
  },
  saveGlobal(data) {
    localStorage.setItem(this._pfx('thelab_global'), JSON.stringify(data));
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
    try { return JSON.parse(localStorage.getItem(this._pfx('thelab_draft')) || 'null'); }
    catch(e) { return null; }
  },
  saveDraft(meta, state) {
    localStorage.setItem(this._pfx('thelab_draft'), JSON.stringify({meta, S: state, draftAt: Date.now()}));
  },
  clearDraft() {
    localStorage.removeItem(this._pfx('thelab_draft'));
    localStorage.removeItem(this._pfx('thelab_autosave'));
  },

  // ── PROJECTS ──
  getSavedKeys() {
    const prefix = this._pfx('thelab_proj_');
    return Object.keys(localStorage).filter(k => k.startsWith(prefix)).sort().reverse();
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
    const newKey = this.newProjectKey();
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

  // ── TEST WORKSPACE HELPERS ──
  clearTestData() {
    if (this.getWorkspace() !== 'test') return;
    Object.keys(localStorage)
      .filter(k => k.startsWith('thelab_test_'))
      .forEach(k => localStorage.removeItem(k));
    window.location.reload();
  },

  getSeedState() {
    const today = new Date().toISOString().slice(0, 10);
    const d = n => { const dt = new Date(); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10); };
    return {
      meta: { name: 'Aesop Nordic - Flagship Fit-Out', client: 'Aesop Nordic', version: 'V1', date: today, currency: 'DKK', status: 'active' },
      S: {
        estimate: { sections: [
          {id:uid(),name:'Labour',rows:[
            {id:uid(),what:'Project manager',spec:'On-site coordination',qty:'3',unit:'days',sale:'4800',cost:'3200',note:'Incl. daily reporting'},
            {id:uid(),what:'Installation crew',spec:'2-person team',qty:'6',unit:'days',sale:'7200',cost:'4800',note:''},
            {id:uid(),what:'Electrician',spec:'Certified external',qty:'2',unit:'days',sale:'6500',cost:'5200',note:'Subcontractor rate'},
            {id:uid(),what:'Finisher / painter',spec:'Touch-up and detailing',qty:'1',unit:'days',sale:'3800',cost:'2600',note:''},
          ]},
          {id:uid(),name:'Materials',rows:[
            {id:uid(),what:'Steel wall framing',spec:'60x40mm powder-coated',qty:'48',unit:'lin.m',sale:'185',cost:'110',note:'RAL 9005'},
            {id:uid(),what:'LED strip lighting',spec:'24V 14W/m warm white',qty:'32',unit:'m',sale:'320',cost:'195',note:'Incl. drivers'},
            {id:uid(),what:'Acoustic panel',spec:'12mm felt, light grey',qty:'24',unit:'m\u00b2',sale:'680',cost:'420',note:'Custom cut'},
            {id:uid(),what:'Joinery paint',spec:'Farrow and Ball Railings',qty:'8',unit:'l',sale:'290',cost:'175',note:'2 coats'},
            {id:uid(),what:'Fixings and consumables',spec:'Misc hardware',qty:'1',unit:'pcs',sale:'2400',cost:'1600',note:''},
          ]},
          {id:uid(),name:'Technical',rows:[
            {id:uid(),what:'Scissor lift rental',spec:'8m working height',qty:'3',unit:'days',sale:'2200',cost:'1650',note:'Incl. transport'},
            {id:uid(),what:'Waste disposal',spec:'Skip hire + labour',qty:'1',unit:'pcs',sale:'1800',cost:'1400',note:''},
            {id:uid(),what:'Travel and logistics',spec:'Van + fuel',qty:'6',unit:'days',sale:'650',cost:'480',note:''},
          ]},
        ]},
        process: { phases: [
          {id:uid(),key:'prep',label:'Preparation',bg:'#0c447c',text:'#b5d4f4',tasks:[
            {id:uid(),name:'Site survey and measurements',spec:'Full floor plan verification',crew:2,hrs:4,hold:'Team A',note:'Bring laser measure'},
            {id:uid(),name:'Material order and procurement',spec:'Steel, panels, lighting',crew:1,hrs:6,hold:'Team A',note:'8-day lead time on panels'},
            {id:uid(),name:'Team briefing and drawings',spec:'Review install drawings',crew:4,hrs:2,hold:'Both teams',note:''},
          ]},
          {id:uid(),key:'build',label:'Build',bg:'#085041',text:'#9fe1cb',tasks:[
            {id:uid(),name:'Site protection and setup',spec:'Floor covering, hoarding',crew:2,hrs:3,hold:'Team A',note:''},
            {id:uid(),name:'Steel framing install',spec:'Wall A + B',crew:2,hrs:7,hold:'Team A',note:'Check plumb on every section'},
            {id:uid(),name:'Acoustic panel installation',spec:'Adhesive + mechanical fix',crew:2,hrs:8,hold:'Team A',note:'Leave 2mm shadow gap'},
          ]},
          {id:uid(),key:'paint',label:'Paint',bg:'#633806',text:'#fac775',tasks:[
            {id:uid(),name:'Joinery painting - first coat',spec:'Brush apply',crew:1,hrs:5,hold:'Team B',note:'Allow 4h dry time'},
            {id:uid(),name:'Painting - second coat and touch-up',spec:'',crew:1,hrs:4,hold:'Team B',note:''},
          ]},
          {id:uid(),key:'install',label:'Install',bg:'#3c3489',text:'#cecbf6',tasks:[
            {id:uid(),name:'Cable pulling',spec:'LED circuits',crew:2,hrs:5,hold:'Team B',note:'Follow electrical drawing rev.3'},
            {id:uid(),name:'LED strip and driver fit-off',spec:'Test each zone',crew:2,hrs:6,hold:'Team B',note:''},
            {id:uid(),name:'Final lighting commissioning',spec:'Scene programming',crew:2,hrs:3,hold:'Team A',note:'Client present for sign-off'},
          ]},
          {id:uid(),key:'strike',label:'Strike',bg:'#712b13',text:'#f5c4b3',tasks:[
            {id:uid(),name:'Snagging and de-rig',spec:'Full walkthrough',crew:4,hrs:3,hold:'Both teams',note:''},
            {id:uid(),name:'Site clean and handover',spec:'',crew:2,hrs:2,hold:'Both teams',note:'Hand keys to store manager'},
          ]},
        ]},
        assignOpts: ['Team A', 'Team B', 'Both teams', 'External'],
        jobTasks: [
          {
            id:uid(),name:'Aesop Nordic - Studio 3',spec:'Flagship store fit-out',crew:4,hrs:8,hold:'Team A',note:'',
            status:'in-progress',readyByDate:d(3),readyByTime:'08:00',strikeDate:d(5),strikeTime:'17:00',
            location:{type:'studio',studioNum:'3'},jobTypes:['build','paint'],contactName:'Ronnie',assignedTo:[],
            stages:{build:{enabled:true,startDate:d(-2),endDate:d(2)},paint:{enabled:true,startDate:d(3),endDate:d(4)},delivery:{enabled:false},ongoing:{enabled:false},strike:{enabled:true,date:d(5)}},
          },
          {
            id:uid(),name:'Nike - Studio 1',spec:'Campaign shoot setup',crew:2,hrs:6,hold:'Team B',note:'',
            status:'upcoming',readyByDate:d(7),readyByTime:'07:00',strikeDate:d(8),strikeTime:'18:00',
            location:{type:'studio',studioNum:'1'},jobTypes:['install'],contactName:'Maria',assignedTo:[],
            stages:{build:{enabled:false},paint:{enabled:false},delivery:{enabled:true,date:d(6)},ongoing:{enabled:false},strike:{enabled:true,date:d(8)}},
          },
          {
            id:uid(),name:'H&M Flagship - Forhallen',spec:'Seasonal display install',crew:3,hrs:7,hold:'Both teams',note:'',
            status:'upcoming',readyByDate:d(12),readyByTime:'09:00',strikeDate:d(14),strikeTime:'16:00',
            location:{type:'forhallen'},jobTypes:['build','install'],contactName:'Sofie',assignedTo:[],
            stages:{build:{enabled:true,startDate:d(10),endDate:d(11)},paint:{enabled:false},delivery:{enabled:false},ongoing:{enabled:false},strike:{enabled:true,date:d(14)}},
          },
        ],
        overrides: {},
      },
    };
  },

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
document.addEventListener('DOMContentLoaded', () => {
  App.fetchCurrentUser().then(() => {
    if (typeof window.onUserReady === 'function') window.onUserReady();
  });
});
