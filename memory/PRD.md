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

### Iteration 4 (2026-06)
- **Asta Powerproject XML export**: Asta has no public native XML schema (it imports MSP XML and P6 XER), so the export is MSP-compatible XML tuned for Asta — a real WBS summary hierarchy (OutlineLevel 1/2/3), OutlineNumber, the WBS code carried in a Text1 extended attribute (FieldID 188743731) that Asta maps to its outline code, calendar week pattern + holiday exceptions, milestones, constraints, slack and full predecessor links
- **Primavera P6 XER import**: upload a .xer on the dashboard to create a new project — parses %T/%F/%R tables (PROJECT, PROJWBS, TASK, TASKPRED, CALENDAR), maps activity types, hours→working days, PR_FS/SS/FF/SF links with lags, P6 constraint codes → SNET/FNLT/MSO, WBS names into L1/L2/L3 with dotted codes, and recovers the week pattern and holiday exceptions. Round-trip through our own XER is lossless (73 activities / 103 links / same finish date)
- Non-XER uploads are rejected with a clear message; the import is logged as an assumption entry
- 51/51 backend pytest, full frontend E2E pass

### Iteration 5 (2026-08) — Bug fix
- **MSP XML export Duration=0 bug fixed**: `<Task>` element children in `to_msproject_xml` and `to_asta_xml` were being emitted in a non-XSD-compliant order (`Type→OutlineLevel→WBS→Milestone→Summary→Critical→Start→Finish→Duration...`). MS Project / Asta Powerproject follow strict XSD ordering and silently drop out-of-sequence elements — that's why every activity showed 0d. Reordered to `UID→ID→Name→Type→IsNull→WBS→OutlineNumber→OutlineLevel→Priority→Start→Finish→Duration→DurationFormat→Work→EffortDriven→Estimated→Milestone→Summary→Critical→FreeSlack→TotalSlack→FixedCost→...→ConstraintType→CalendarUID→Manual→PredecessorLink` and added the previously missing `<IsNull>`, `<Priority>`, `<Work>`, `<Manual>` fields. 10/10 export pytest pass; `/app/backend/tests/test_msp_export.py` asserts XSD ordering, non-zero duration for 10/15/20-day tasks (PT80H/PT120H/PT160H) and PT0H for milestones.

### Iteration 6 (2026-08) — Version Snapshots & Baseline Slippage View
- **Snapshots API** (`server.py`): new `POST /api/projects/{id}/snapshots` (accepts `{name}`), `GET /snapshots`, `POST /snapshots/{sid}/restore`, `GET /snapshots/{sid}/compare`. Snapshots now capture calendar in addition to activities/assumptions/inputs. Legacy `/versions` endpoints retained for BC.
- **Compare** endpoint reruns CPM on the snapshot to produce per-activity `{current_start, current_finish, baseline_start, baseline_finish, start_variance_days, finish_variance_days, duration_variance, in_baseline}` plus `added[]` / `removed[]` sets and project-level finish variance.
- **Workspace UI**: replaced separate Snapshot / Versions buttons with a single **Snapshots (N)** dropdown → Save baseline snapshot… modal, Manage / restore snapshots dialog, Show BL columns toggle. New **Baseline selector** in the toolbar overlays a chosen snapshot.
- **Gantt overlay** (`GanttChart.jsx`): slim baseline bar rendered beneath each current bar; colour graded red (slip > 5d) → amber (> 0d) → muted (no slip). New `workingDayOffset` helper converts baseline ISO dates → working-day offset from project start.
- **DataGrid baseline columns** (`DataGrid.jsx`): optional BL Start / BL Finish / Var (d) columns, coloured cell for non-zero variance.
- **Verified**: 7/7 snapshot pytest, 10/10 export regression, full Playwright E2E flow green (`/app/test_reports/iteration_6.json`).

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
3. MSP XML import; add <DialogDescription> to dialogs to clear the Radix aria warning
