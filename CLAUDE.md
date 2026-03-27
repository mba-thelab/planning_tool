# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**The/Lab — Project Tool** is an internal project estimation and process planning web app.

## Commands

```bash
node server.js  # Start the server at http://localhost:3000
```

No test suite configured. No build step required.

## File Structure

- **`server.js`** — Express server on port 3000
  - `POST /api/pdf` — generates PDFs via Puppeteer
  - `GET /api/rates` — fetches live currency rates from Nationalbanken, returns JSON (rates are DKK per 1 unit)
- **`public/index.html`** — entire frontend as a single HTML file (vanilla JS, inline CSS)

## Frontend Architecture

Single-page app with two tabs, no framework, no bundler.

**State object `S`:**
- `S.estimate.sections` — array of categories, each with `rows[]`
- `S.process.phases` — array of phases, each with `tasks[]`
- `S.assignOpts` — array of assignment option strings

**Estimate tab:**
Each row has: `id, what, spec, qty, unit, sale, cost, note`
Calculates price totals and margin % automatically. Supports DKK/EUR/USD with live rates from Nationalbanken. Target margin is 20% — color coded green/amber/red.

**Process tab:**
Phases: Preparation, External, Day 1, Day 2, Day 3 (customisable labels and colours). Each task has: `id, name, spec, crew, hrs, hold, note`. Tasks can be pushed to Estimate categories via a modal. Drag & drop supported between phases and categories.

## Export

- HTML (internal + client versions)
- PDF via server Puppeteer endpoint
- CSV and XLSX via SheetJS

## Tech Stack

Vanilla JS, Express, Puppeteer, SheetJS. No React, no bundler, no TypeScript.

## Upcoming Features

- User login with departments and personal project storage
- PostgreSQL database
- Deploy to Railway or Render
