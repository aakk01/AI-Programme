# AI Programme of Works Generator — PRD

## Original problem statement
Web app that turns high-level project parameters into a fully structured, CPM-driven Programme of Works, with WBS hierarchy, dependencies, milestones, an interactive Gantt view, and exports compatible with Primavera P6, Asta Powerproject and MS Project.

## User choices (confirmed)
- AI model: **Claude Sonnet 4.6** (Emergent Universal Key)
- Auth: JWT email/password
- Theme: light + dark with toggle
- Exports: CSV + JSON + MS Project XML (+ P6 XER added in iteration 2)

## Architecture
- Frontend: React 19 (CRA/craco), Tailwind, shadcn/ui, react-resizable-panels, custom SVG Gantt
- Backend: FastAPI — `server.py` (routes), `cpm.py` (CPM engine + WorkCalendar + variance), `holiday_presets.py`, `ai_gen.py`, `exporters.py`, `auth.py`
- DB: MongoDB — `users`, `projects` (embedded activities + calendar config), `versions`, `chats`
- AI: `emergentintegrations.LlmChat` → anthropic/claude-sonnet-4-6, async background task + status polling

## User personas
1. Solo planner / planning consultant — needs a defensible baseline fast
2. Contractor project controls team — needs P6/Asta-importable logic
3. Client / PM — needs an indicative programme with visible assumptions

## Core requirements (static)
Input wizard · AI WBS L1–L3 generation with assumptions log · server-side CPM (forward/backward pass, total & free float, critical path, FS/SS/FF/SF with ± lags, constraints) · configurable working calendar · editable P6-style grid with live recalc · interactive Gantt · exports · AI refinement diff/approve · accounts, dashboard, version snapshots · variance reporting.

## Implemented
### Iteration 1 (2026-06)
- JWT signup/login/me, protected routes, dashboard (create/open/duplicate/delete)
- 4-step input wizard; async AI baseline generation + polling; assumptions register
- CPM engine (5-day week), editable grid with live recalc and link-syntax validation
- SVG Gantt: arrows, red critical path, diamond milestones, summary bars, zoom, WBS filter, drag durations
- Resizable split view, light/dark theme, AI refinement drawer with approve-before-apply diffs
- Version snapshots/restore; CSV / JSON / MS Project XML exports
- 22/22 backend pytest, full frontend E2E pass

### Iteration 2 (2026-06)
- **Configurable working calendar**: 5/6/7-day weeks, UK & US public-holiday presets, custom non-working dates; set in the wizard or the workspace calendar dialog; drives CPM, Gantt axis, MSP XML calendar exceptions and XER calendar
- **Date constraints**: SNET / FNLT / MSO per activity, editable in the grid, produce negative float where the network can't comply
- **Target-completion variance report**: forecast vs target finish, variance in working and calendar days, status, negative-float register, milestone table, critical-path count
- **Primavera P6 XER export**: ERMHDR + CURRTYPE, CALENDAR, PROJECT, PROJWBS, TASK, TASKPRED tables with PR_FS/SS/FF/SF links and lag in hours
- **Row reordering**: drag & drop rows in the grid (disabled while a stage filter is active); order persists on save
- Fixed: PATCH /projects/{id} partial inputs no longer wipes unspecified fields; grid uses fixed layout so all columns including Float fit on screen
- 34/34 backend pytest, full frontend E2E pass

### Iteration 3 (2026-06)
- **Undo/redo**: 50-step history over every grid mutation (cell edits, range fills, paste, clear, add, delete, row reorder) with toolbar buttons and Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y; history resets on save, version restore and AI change application
- **Range editing**: click + Shift+click rectangular selection, Ctrl+A select all, Escape to clear, arrow / Shift+arrow navigation, Enter or F2 or direct typing to edit, Ctrl+D fill down, Ctrl+C copy as TSV, TSV paste from Excel/P6, Delete to clear — read-only columns are never written and every batch is validated before it hits the CPM engine
- Row reorder now reschedules immediately; the UNSAVED flag clears when undo returns to the last-saved state
- 34/34 backend pytest, full frontend E2E pass

## Backlog
### P0
- Stale "running" generation recovery if the pod restarts mid-generation (heartbeat timestamp)
### P1
- Baseline vs current comparison view (variance bars against a snapshot)
- Asta Powerproject XML export; XER round-trip import
- Calendar per activity (e.g. 7-day for concrete cure, 5-day for trades)
### P2
- Resource and cost loading, histograms, S-curves
- Multi-user collaboration / sharing per project (single-owner today)
- PDF / print-ready programme output with title block

## Next tasks
1. Baseline vs current comparison against a saved snapshot
2. Per-activity calendars
3. Asta Powerproject XML export / XER import
