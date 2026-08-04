# AI Programme of Works Generator — PRD

## Original problem statement
Web app that turns high-level project parameters into a fully structured, CPM-driven Programme of Works, with WBS hierarchy, dependencies, milestones, an interactive Gantt view, and exports compatible with Primavera P6, Asta Powerproject and MS Project.

## User choices (confirmed)
- AI model: **Claude Sonnet 4.6** (Emergent Universal Key) — "Claude Sonnet 5" is not a released model
- Auth: JWT email/password
- Build order: Phases 1–4 first, then AI chat + exports (all delivered in build 1)
- Theme: light + dark with toggle
- Exports: CSV + JSON + MS Project XML

## Architecture
- Frontend: React 19 (CRA/craco), Tailwind, shadcn/ui, react-resizable-panels, custom SVG Gantt
- Backend: FastAPI — `server.py` (routes), `cpm.py` (CPM engine), `ai_gen.py` (Claude orchestration), `exporters.py`, `auth.py` (JWT + bcrypt)
- DB: MongoDB collections — `users`, `projects` (embedded activities), `versions`, `chats`
- AI: `emergentintegrations.LlmChat` → anthropic/claude-sonnet-4-6, async background task + status polling (generation exceeds the 60s ingress timeout)

## User personas
1. Solo planner / planning consultant — needs a defensible baseline fast
2. Contractor project controls team — needs P6/Asta-importable logic
3. Client / PM — needs an indicative programme with visible assumptions

## Core requirements (static)
Input wizard · AI WBS L1–L3 generation with assumptions log · server-side CPM (forward/backward pass, total & free float, critical path, FS/SS/FF/SF with ± lags) · editable P6-style grid with live recalc · interactive Gantt (arrows, red critical path, diamond milestones, summary bars, zoom, WBS filter, drag duration) · exports · AI refinement diff/approve · accounts, dashboard, version snapshots.

## Implemented (2026-06)
- JWT signup/login/me, protected routes, logout
- Project dashboard: create, open, duplicate, delete, stats (activities, duration, finish)
- 4-step input wizard (Project / Scale / Commercial / Constraints)
- Async AI baseline generation + polling; assumptions register dialog (14 assumptions on the reference project); 73-activity closed network verified
- CPM engine: 5-day working calendar, FS/SS/FF/SF ± lags, milestone dur=0, summary rollups, total/free float, critical flags, cycle detection
- Editable grid (double-click cells), link-syntax validation, add/delete activity, live recalculation, save & persist
- SVG Gantt: dependency arrows, red critical path, diamond milestones, summary bars, day/week/month zoom, WBS L1 filter, drag right edge to change duration
- Resizable split view (grid over Gantt), light/dark theme toggle with persistence
- AI refinement drawer: natural-language instruction → explanation + diff → approve & apply with reschedule
- Version snapshots, history dialog, restore
- Exports: CSV, JSON, MS Project XML (PredecessorLink, calendar, slack) — importable to P6 / Asta / MSP
- Backend pytest suite (22 tests, all passing) in `/app/backend/tests/`

## Backlog
### P0
- Stale "running" generation recovery if the pod restarts mid-generation (heartbeat timestamp)
- Configurable working calendar: 6/7-day weeks, UK/US public holidays, project-specific non-working days
### P1
- Constraints (Start No Earlier Than, Finish No Later Than) and deadline vs target completion variance report
- Reorder activities (drag rows), multi-select, copy/paste ranges in the grid
- Primavera P6 XER export; Asta PP XML export
- Baseline vs current comparison view (variance bars)
### P2
- Resource and cost loading, histograms, S-curves
- Multi-user collaboration / sharing per project (single-owner today)
- PDF / print-ready programme output with title block

## Next tasks
1. Working-calendar configuration (holidays + week pattern) surfaced in the wizard
2. Date constraints + target-completion variance
3. P6 XER export
