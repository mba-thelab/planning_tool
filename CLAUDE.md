# CLAUDE.md

This file provides guidance to Claude Code when working on this repository.

---

## What this project is

**The/Lab — Internal Operating System** is a tool being built for The Lab, a physical production facility in Denmark with ~70 people, 8 studios, and 7 departments. The goal is to replace fragmented coordination (email chains, iMessage groups, phone calls) with a single shared system where every job lives from first client contact to final invoice.

This is not a generic project management tool. It is built specifically for how The Lab works — multiple entry points, cross-department jobs, physical production reality.

The project is being built by a manager at The Lab, working with Claude Code. The tool currently exists but has known bugs and non-optimal things that need to be addressed before expanding further.

---

## Commands

```bash
node server.js  # Start the server at http://localhost:3000
```

No test suite. No build step.

---

## File Structure

```
server.js                        — Express server on port 3000
public/
  index.html                     — Dashboard
  estimate.html                  — Estimate tool
  process.html                   — Process planner
  jobs.html                      — Job Board
  css/
    style.css                    — Shared styles
  js/
    app.js                       — Shared foundation: storage, session, navigation
    estimate.js                  — Estimate logic
    process.js                   — Process planner logic
    jobs.js                      — Job Board logic
  docs/
    vision/                      — Vision documents (standalone HTML, fonts embedded)
      thelab-one-tool-en.html
      thelab-one-tool-dk.html
      thelab-one-tool-en-onepager.html
      thelab-one-tool-dk-onepager.html
```

### Server endpoints
- `POST /api/pdf` — generates PDF via Puppeteer. Takes `{ html, filename }` body (HTML content, not a URL)
- `GET /api/rates` — fetches live currency rates from Nationalbanken, returns JSON (rates are DKK per 1 unit of foreign currency)

---

## Frontend Architecture

Vanilla JS, Express, Puppeteer, SheetJS. No React, no bundler, no TypeScript.

**State object `S`** (shared across views via localStorage draft):
- `S.estimate.sections` — array of categories, each with `rows[]`
- `S.process.phases` — array of phases, each with `tasks[]`
- `S.assignOpts` — array of assignment option strings

**Cross-view navigation:** `App.saveDraft()` saves current project state to localStorage, then redirects. The receiving page reads the draft on load. This is how project context is preserved when moving between Estimate, Process, and Job Board.

**Estimate:** Each row has `id, what, spec, qty, unit, sale, cost, note`. Calculates totals and margin % automatically. Supports DKK/EUR/USD with live rates. Target margin 20% — colour coded green/amber/red.

**Process:** Phases with customisable labels and colours. Each task has `id, name, spec, crew, hrs, hold, note`. Tasks can be pushed to Estimate categories via modal. Drag & drop between phases.

**Job Board:** Tasks pushed from Process. Filter bar, project view / task view toggle, pipeline stages with dates, status badges.

**Permissions:** Three tiers — Employee (Job Board + Dashboard only), Team Leader, Admin. Stored in `thelab_session` in localStorage. Maps to future JWT auth without migration.

---

## The seven departments

Understanding this is critical for feature decisions:

| Department | Role | Client contact |
|---|---|---|
| Booking | Central coordination and studio scheduling. Overview of everything in the building. | Yes |
| Production | Project management AND execution. Producers/PMs handle client contact, scope, budget, planning — and then execute. | Yes — direct |
| Set-build | Has its own **management layer** (set-build managers: client contact, estimating, process planning, 3D drawing and rendering, material sourcing, supplier relations, sub-contractor coordination) AND its own execution team (construction, painting, installation, strike). A full production department. | Yes — direct |
| Rental | Equipment management and external hire. | Yes — direct |
| Assistants | Photographers' and directors' assistants. Scheduled across shoots, studios, call times. | Minimal |
| Kitchen | Two distinct operations: in-house restaurant and café open to the public for breakfast and lunch, AND catering for every production in the building. One team. | Minimal |
| Administration | Financial oversight across all projects. Connected to E-conomic. | Internal |

**Any department can be the first point of contact for a new job** — clients reach out by call or email to whoever they know. Jobs enter anywhere and get routed from there. Do not assume Booking is the only or primary entry point.

**Do not call Set-build staff "producers"** — they are "set-build managers."

---

## Key constraints

- **E-conomic** — The Lab's existing financial management system. This tool does NOT replace it. Role is operational planning and estimating. Integration to reduce double-entry is planned for Phase 4.
- **iMessage** — what The Lab uses internally for communication. Not WhatsApp.
- **No time tracking** — not a culture fit. Do not suggest or build it.
- **No approval chains** — beyond what already exists in the culture.

---

## Brand / UI system

- **Font:** TheLabMono-Light (300) for body, TheLabMono-Regular (400) for values/active. TheLab-Stencil for logo only.
- **Font files:** `public/docs/brand/visual_identity/FONT_THELAB/`
- **Accent colour:** `#e03d00` (orange-red) — replaces all previous `--teal` usage
- **Backgrounds:** `--bg: #191917`, `--bg2: #242422`, `--bg3: #333331`
- **Text:** `--text: #cccbc2`, `--text2: #848279`, `--text3: #5a5955`, `--hi: #efefed`
- **Border:** `--border: #3f3f3c`
- **Border radius:** 4px on primary containers, 20px on status pills only
- **Sys-nav:** 34px strip below topbar on all pages: DASHBOARD / PROCESS / ESTIMATE / JOB BOARD

---

## Product roadmap

### Phase 1 — Strengthen what exists ← current priority after bug fixes
- Full brand UI system applied consistently
- Dashboard as live operations center (not a launcher)
- Project lifecycle status: Inquiry / Active / In Production / Delivered / Invoiced
- Pipeline view on Dashboard
- Cross-view project navigation (context preserved between views)
- Process sidebar shows read-only cost totals from Estimate

### Phase 2 — All departments in the system
- Multi-department Job Board (catering orders, equipment requests, assistant scheduling)
- Brief/Intake form for Booking
- Department-specific task queues
- **Requires PostgreSQL migration** — cannot be fully realised in localStorage

### Phase 3 — Resource layer
- Studio calendar (8 studios, reservations tied to projects, double-booking prevention)
- Equipment inventory for Rental
- Crew capacity view per department
- Logistics task type

### Phase 4 — Financial completion
- Actual cost tracking vs estimate
- Invoice generation from approved estimate
- E-conomic integration
- Supplier database
- Analytics

---

## Immediate next steps

1. **Bug fix session** — walk through known bugs and non-optimal things in the current tool before adding anything new
2. **Phase 1 UI system** — once the tool is stable

---

## What not to build yet
- Studio calendar (needs PostgreSQL — Phase 3)
- Supplier database (Phase 4)
- Analytics (Phase 4)
- Time tracking (probably never — culture question)
- Anything in Phase 2+ before the database migration is planned
