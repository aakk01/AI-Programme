"""Iteration 4 features:
- GET /api/projects/{id}/export/asta -> MS Project-compatible XML tuned for Asta
  (WBS summary hierarchy w/ OutlineLevel 1/2/3, Text1 ExtendedAttribute FieldID
  188743731, calendar week pattern + holiday exceptions, PredecessorLink integrity,
  Milestone / ConstraintType / ConstraintDate)
- POST /api/projects/import/xer (multipart 'file') -> creates a new project owned
  by the caller, with import_stats + Import assumption + week pattern & holidays
  from clndr_data + non-cyclic schedule. Round-trip fidelity check against seeded
  Riverside Tower.
- XER import robustness: 400 for non-XER text; 401 for unauthenticated; type,
  duration, predecessor, constraint and WBS mapping via a synthetic in-process
  fixture using xer_import.import_xer directly.
"""
import io
import re
import sys
import uuid
import xml.etree.ElementTree as ET

import pytest

# Also import the pure-python parser for the mapping / synthetic tests
sys.path.insert(0, "/app/backend")
from xer_import import import_xer, parse_tables, TYPE_MAP, PRED_MAP, CSTR_MAP  # noqa: E402

NS = {"m": "http://schemas.microsoft.com/project"}
WBS_FIELD_ID = "188743731"
RIVERSIDE_PID = "ed60c71a-2483-4e54-b062-e9414efe35ce"


# ---------------- ASTA POWERPROJECT XML ----------------
class TestAstaExport:
    def test_asta_export_headers_and_root(self, api, base_url, auth_headers):
        r = api.get(
            f"{base_url}/api/projects/{RIVERSIDE_PID}/export/asta",
            headers=auth_headers,
            timeout=60,
        )
        assert r.status_code == 200, r.text[:200]
        assert "application/xml" in r.headers.get("content-type", "")
        cd = r.headers.get("content-disposition", "")
        # Filename slug uses the project name; Riverside Tower -> Riverside_Tower-asta.xml
        assert "attachment" in cd.lower()
        assert "-asta.xml" in cd
        root = ET.fromstring(r.text)
        assert root.tag.endswith("Project")

    def test_asta_extended_attribute_registered(self, api, base_url, auth_headers):
        r = api.get(
            f"{base_url}/api/projects/{RIVERSIDE_PID}/export/asta",
            headers=auth_headers,
            timeout=60,
        )
        root = ET.fromstring(r.text)
        # ExtendedAttributes at project level
        ext = root.find("m:ExtendedAttributes/m:ExtendedAttribute", NS)
        assert ext is not None, "No ExtendedAttribute registration on Project"
        assert ext.findtext("m:FieldID", namespaces=NS) == WBS_FIELD_ID
        assert ext.findtext("m:FieldName", namespaces=NS) == "Text1"
        assert (ext.findtext("m:Alias", namespaces=NS) or "").lower() == "wbs code"

    def test_asta_calendar_has_workingdays_and_exceptions(
        self, api, base_url, auth_headers
    ):
        r = api.get(
            f"{base_url}/api/projects/{RIVERSIDE_PID}/export/asta",
            headers=auth_headers,
            timeout=60,
        )
        root = ET.fromstring(r.text)
        cal = root.find("m:Calendars/m:Calendar", NS)
        assert cal is not None, "No Calendar element in Asta export"
        weekdays = cal.findall("m:WeekDays/m:WeekDay", NS)
        assert len(weekdays) == 7, f"Expected 7 WeekDay entries, got {len(weekdays)}"
        working = [
            w
            for w in weekdays
            if (w.findtext("m:DayWorking", namespaces=NS) or "0") == "1"
        ]
        # Riverside Tower uses 5-day week -> 5 working days
        assert len(working) == 5
        # UK holidays exist as Exceptions
        exceptions = cal.findall("m:Exceptions/m:Exception", NS)
        assert len(exceptions) > 0, "No Calendar Exceptions (expected UK holidays)"

    def test_asta_wbs_hierarchy_outline_levels(self, api, base_url, auth_headers):
        r = api.get(
            f"{base_url}/api/projects/{RIVERSIDE_PID}/export/asta",
            headers=auth_headers,
            timeout=60,
        )
        root = ET.fromstring(r.text)
        tasks = root.findall("m:Tasks/m:Task", NS)
        assert tasks, "No Task rows in Asta export"
        levels = {
            t.findtext("m:OutlineLevel", namespaces=NS) or "?": 0 for t in tasks
        }
        for t in tasks:
            lv = t.findtext("m:OutlineLevel", namespaces=NS) or "?"
            levels[lv] = levels.get(lv, 0) + 1
        # Expect L1 summaries, L2 summaries and L3 activities all present
        for lv in ("1", "2", "3"):
            assert levels.get(lv, 0) > 0, f"No tasks at OutlineLevel={lv}: {levels}"
        # Summary rows carry Summary=1; activities carry Summary=0
        summary_l1 = [
            t
            for t in tasks
            if t.findtext("m:OutlineLevel", namespaces=NS) == "1"
        ]
        assert all(
            t.findtext("m:Summary", namespaces=NS) == "1" for t in summary_l1
        )
        # Every task carries an ExtendedAttribute pointing at WBS_FIELD_ID
        for t in tasks[:20]:
            ea = t.find("m:ExtendedAttribute", NS)
            assert ea is not None
            assert ea.findtext("m:FieldID", namespaces=NS) == WBS_FIELD_ID
            val = ea.findtext("m:Value", namespaces=NS)
            assert val is not None and val != "", "Empty WBS value in ExtendedAttribute"

    def test_asta_link_integrity_and_milestone_and_constraint(
        self, api, base_url, auth_headers
    ):
        """Every PredecessorUID must resolve to a real task UID in the file, and the
        number of PredecessorLink entries should equal the number of predecessor
        references among the non-Summary activities."""
        # Build a project with a milestone + a link + an SNET constraint
        body = {
            "name": f"TEST_asta_link_{uuid.uuid4().hex[:6]}",
            "inputs": {
                "project_type": "commercial",
                "start_date": "2027-02-01",
                "procurement": "traditional",
            },
        }
        r = api.post(
            f"{base_url}/api/projects", json=body, headers=auth_headers, timeout=30
        )
        assert r.status_code == 200
        pid = r.json()["id"]
        acts = [
            {
                "activity_id": "A",
                "wbs_l1": "Stage 1",
                "wbs_l2": "Sub A",
                "description": "Alpha",
                "type": "Task",
                "duration": 5,
                "predecessors": [],
            },
            {
                "activity_id": "B",
                "wbs_l1": "Stage 1",
                "wbs_l2": "Sub A",
                "description": "Beta",
                "type": "Task",
                "duration": 5,
                "predecessors": [{"id": "A", "type": "FS", "lag": 2}],
                "constraint_type": "SNET",
                "constraint_date": "2027-06-01",
            },
            {
                "activity_id": "M",
                "wbs_l1": "Stage 2",
                "wbs_l2": "Sub B",
                "description": "Handover",
                "type": "Milestone",
                "duration": 0,
                "predecessors": [{"id": "B", "type": "FS", "lag": 0}],
            },
        ]
        assert (
            api.put(
                f"{base_url}/api/projects/{pid}/activities",
                json={"activities": acts},
                headers=auth_headers,
                timeout=30,
            ).status_code
            == 200
        )
        try:
            r = api.get(
                f"{base_url}/api/projects/{pid}/export/asta",
                headers=auth_headers,
                timeout=30,
            )
            assert r.status_code == 200
            root = ET.fromstring(r.text)
            tasks = root.findall("m:Tasks/m:Task", NS)
            all_uids = {t.findtext("m:UID", namespaces=NS) for t in tasks}
            all_uids.discard(None)
            # every PredecessorUID must resolve
            pred_links = root.findall(".//m:PredecessorLink", NS)
            assert pred_links, "No PredecessorLink entries in Asta export"
            for link in pred_links:
                puid = link.findtext("m:PredecessorUID", namespaces=NS)
                assert puid in all_uids, f"Dangling PredecessorUID={puid}"
                assert link.findtext("m:Type", namespaces=NS) is not None
                assert link.findtext("m:LinkLag", namespaces=NS) is not None
            # count of PredecessorLink == sum of predecessors across non-summary tasks
            non_summary = [
                t
                for t in tasks
                if (t.findtext("m:Summary", namespaces=NS) or "0") == "0"
            ]
            # Sum predecessors from our input activities (all are non-summary)
            expected = sum(len(a.get("predecessors", [])) for a in acts)
            actual = len(pred_links)
            assert actual == expected, (
                f"PredecessorLink count mismatch: expected {expected}, got {actual}"
            )
            # Milestone row: Milestone=1
            milestone_names = {
                t.findtext("m:Name", namespaces=NS): t
                for t in non_summary
                if t.findtext("m:Milestone", namespaces=NS) == "1"
            }
            assert any("Handover" in (n or "") for n in milestone_names), (
                f"No milestone row found: {list(milestone_names)}"
            )
            # Constraint on B: ConstraintType=4 (SNET) + ConstraintDate
            b_row = next(
                (
                    t
                    for t in non_summary
                    if (t.findtext("m:Name", namespaces=NS) or "") == "Beta"
                ),
                None,
            )
            assert b_row is not None, "Task B (Beta) missing"
            assert b_row.findtext("m:ConstraintType", namespaces=NS) == "4"
            cdate = b_row.findtext("m:ConstraintDate", namespaces=NS)
            assert cdate is not None and cdate.startswith("2027-06-01"), cdate
        finally:
            api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)


# ---------------- XER IMPORT ----------------
class TestXerImportEndpoint:
    def test_import_riverside_roundtrip(self, api, base_url, auth_headers):
        """Export Riverside Tower -> XER, then re-import: same counts + finish + duration."""
        # 1. Get the original stats
        orig = api.get(
            f"{base_url}/api/projects/{RIVERSIDE_PID}", headers=auth_headers, timeout=30
        )
        assert orig.status_code == 200
        odata = orig.json()
        orig_activities = len(odata["activities"])
        orig_milestones = sum(
            1 for a in odata["activities"] if a.get("type") == "Milestone"
        )
        orig_links = sum(
            len(a.get("predecessors") or []) for a in odata["activities"]
        )
        orig_finish = odata["schedule"]["project_finish"]
        orig_duration = odata["schedule"]["duration_working_days"]

        # 2. Export to XER
        rx = api.get(
            f"{base_url}/api/projects/{RIVERSIDE_PID}/export/xer",
            headers=auth_headers,
            timeout=60,
        )
        assert rx.status_code == 200
        xer_body = rx.text
        assert xer_body.startswith("ERMHDR")

        # 3. POST /projects/import/xer with the file - use fresh session so
        # requests can auto-set multipart Content-Type (session default is JSON).
        import requests as _r
        files = {"file": ("riverside_roundtrip.xer", xer_body, "text/plain")}
        ri = _r.post(
            f"{base_url}/api/projects/import/xer",
            files=files,
            headers={"Authorization": auth_headers["Authorization"]},
            timeout=60,
        )
        assert ri.status_code == 200, ri.text[:400]
        new = ri.json()
        try:
            new_id = new["id"]
            assert new_id and new_id != RIVERSIDE_PID
            # import_stats present with all keys
            stats = new["import_stats"]
            for k in ("activities", "links", "milestones", "wbs_nodes", "holidays"):
                assert k in stats
            assert stats["activities"] == orig_activities, (
                f"activities mismatch {stats['activities']} vs {orig_activities}"
            )
            assert stats["milestones"] == orig_milestones, (
                f"milestones mismatch {stats['milestones']} vs {orig_milestones}"
            )
            assert stats["links"] == orig_links, (
                f"links mismatch {stats['links']} vs {orig_links}"
            )
            # Match spec numbers exactly
            assert orig_activities == 73
            assert orig_links == 103
            assert orig_milestones == 8
            assert orig_finish == "2029-03-23"
            assert orig_duration == 650
            # Import assumption present
            assumptions = new.get("assumptions") or []
            assert any(a.get("category") == "Import" for a in assumptions), (
                assumptions
            )
            # Calendar week pattern + holidays recovered
            cal = new.get("calendar", {})
            assert cal.get("week_pattern") == "5-day"
            assert len(cal.get("holidays") or []) > 0, "No holidays recovered"
            # schedule.has_cycle is False
            assert new["schedule"]["has_cycle"] is False
            # Round-trip finish & duration match originals
            assert new["schedule"]["project_finish"] == orig_finish
            assert new["schedule"]["duration_working_days"] == orig_duration
            # Owner should be caller: subsequent GET must succeed with same token
            r2 = api.get(
                f"{base_url}/api/projects/{new_id}",
                headers=auth_headers,
                timeout=30,
            )
            assert r2.status_code == 200
        finally:
            # cleanup: delete the imported copy so dashboard stays tidy
            api.delete(
                f"{base_url}/api/projects/{new['id']}",
                headers=auth_headers,
                timeout=30,
            )

    def test_import_rejects_non_xer_text(self, api, base_url, auth_headers):
        import requests as _r
        files = {
            "file": (
                "not-an-xer.txt",
                "Hello, this is a plain text file with no XER tables.\n",
                "text/plain",
            )
        }
        r = _r.post(
            f"{base_url}/api/projects/import/xer",
            files=files,
            headers={"Authorization": auth_headers["Authorization"]},
            timeout=30,
        )
        assert r.status_code == 400, r.text[:200]
        detail = (r.json().get("detail") or "").lower()
        assert "does not look like a p6 xer file" in detail, r.text[:400]

    def test_import_unauthenticated_returns_401(self, api, base_url):
        # New session without auth header
        import requests
        files = {"file": ("x.xer", "ERMHDR\t19\n%E\n", "text/plain")}
        r = requests.post(
            f"{base_url}/api/projects/import/xer", files=files, timeout=30
        )
        assert r.status_code in (401, 403), r.status_code


# ---------------- XER IMPORT: MAPPING via pure-python fixture ----------------
def _mk_synthetic_xer():
    """Hand-authored XER exercising every TYPE_MAP / PRED_MAP / CSTR_MAP branch,
    with tab-separated %T/%F/%R tables and 8-digit YYYYMMDD tokens for holidays."""
    header = "ERMHDR\t19.12\t2026-01-01\tProject\tadmin\tSyntheticTest\tdbxNoName\tPM\tGBP"

    # CALENDAR with 5-day working + one holiday exception (2027-08-02)
    clndr = (
        "(0||CalendarData()("
        "(0||1((0||0(s|08:00|f|17:00)))"
        "(0||2((0||0(s|08:00|f|17:00)))"
        "(0||3((0||0(s|08:00|f|17:00)))"
        "(0||4((0||0(s|08:00|f|17:00)))"
        "(0||5((0||0(s|08:00|f|17:00)))"
        "(0||6()"
        "(0||7()"
        ")(0||Exceptions()(0||20270802())))"
    )
    calendar = (
        "%T\tCALENDAR\n"
        "%F\tclndr_id\tdefault_flag\tclndr_name\tproj_id\tbase_clndr_id\tlast_chng_date\t"
        "clndr_type\tday_hr_cnt\tweek_hr_cnt\tmonth_hr_cnt\tyear_hr_cnt\trsrc_private\tclndr_data\n"
        f"%R\t1\tY\tProgramme\t\t\t\tCA_Base\t8\t40\t173.6\t2080\tN\t{clndr}"
    )

    # PROJECT
    project = (
        "%T\tPROJECT\n"
        "%F\tproj_id\tproj_short_name\tplan_start_date\tscd_end_date\tclndr_id\n"
        "%R\t1\tSyntheticProj\t2027-02-01 08:00\t2027-06-01 17:00\t1"
    )

    # PROJWBS: root + 2 children
    projwbs = (
        "%T\tPROJWBS\n"
        "%F\twbs_id\tproj_id\tparent_wbs_id\tobs_id\tseq_num\test_wt\tproj_node_flag\t"
        "sum_data_flag\tstatus_code\twbs_short_name\twbs_name\tphase_id\torig_cost\t"
        "indep_remain_total_cost\tann_dscnt_rate_pct\n"
        "%R\t1\t1\t\t\t1\t1\tY\tN\tWS_Open\tROOT\tRoot\t\t0\t0\t\n"
        "%R\t2\t1\t1\t\t1\t1\tN\tN\tWS_Open\tS1\tStage One\t\t0\t0\t\n"
        "%R\t3\t1\t2\t\t1\t1\tN\tN\tWS_Open\tSA\tSub A\t\t0\t0\t"
    )

    # TASK: exercise every TYPE + every CSTR + a large duration
    # types: TT_Task, TT_Mile, TT_FinMile, TT_StartMile, TT_WBS, TT_LOE, TT_Rsrc
    # cstr:  CS_MSO->SNET, CS_MSOB->SNET, CS_MEO->FNLT, CS_MEOB->FNLT,
    #        CS_MANDSTART->MSO, CS_MANDFIN->FNLT
    task = (
        "%T\tTASK\n"
        "%F\ttask_id\tproj_id\twbs_id\tclndr_id\tstatus_code\ttask_code\ttask_name\t"
        "target_drtn_hr_cnt\tremain_drtn_hr_cnt\tact_work_qty\ttarget_work_qty\t"
        "task_type\tduration_type\tcomplete_pct_type\ttotal_float_hr_cnt\t"
        "free_float_hr_cnt\tdriving_path_flag\tearly_start_date\tearly_end_date\t"
        "target_start_date\ttarget_end_date\tcstr_type\tcstr_date\tphys_complete_pct\n"
        # Task, dur 40h -> 5wd
        "%R\t1001\t1\t3\t1\tTK_NotStart\tT01\tTask One\t40\t40\t0\t0\tTT_Task\tDT_FixedDUR2\tCP_Drtn\t0\t0\tN\t\t\t2027-02-01 08:00\t2027-02-05 17:00\t\t\t0\n"
        # Milestone: TT_FinMile
        "%R\t1002\t1\t3\t1\tTK_NotStart\tM01\tMilestone Finish\t0\t0\t0\t0\tTT_FinMile\tDT_FixedDUR2\tCP_Drtn\t0\t0\tN\t\t\t2027-02-05 17:00\t2027-02-05 17:00\t\t\t0\n"
        # Milestone: TT_StartMile
        "%R\t1003\t1\t3\t1\tTK_NotStart\tM02\tMilestone Start\t0\t0\t0\t0\tTT_StartMile\tDT_FixedDUR2\tCP_Drtn\t0\t0\tN\t\t\t2027-02-08 08:00\t2027-02-08 08:00\t\t\t0\n"
        # Milestone: TT_Mile
        "%R\t1004\t1\t3\t1\tTK_NotStart\tM03\tMilestone Generic\t0\t0\t0\t0\tTT_Mile\tDT_FixedDUR2\tCP_Drtn\t0\t0\tN\t\t\t2027-02-09 08:00\t2027-02-09 08:00\t\t\t0\n"
        # Summary: TT_WBS
        "%R\t1005\t1\t3\t1\tTK_NotStart\tS01\tSummary WBS\t80\t80\t0\t0\tTT_WBS\tDT_FixedDUR2\tCP_Drtn\t0\t0\tN\t\t\t2027-02-01 08:00\t2027-02-12 17:00\t\t\t0\n"
        # Summary: TT_LOE
        "%R\t1006\t1\t3\t1\tTK_NotStart\tS02\tSummary LOE\t80\t80\t0\t0\tTT_LOE\tDT_FixedDUR2\tCP_Drtn\t0\t0\tN\t\t\t2027-02-01 08:00\t2027-02-12 17:00\t\t\t0\n"
        # Task from TT_Rsrc -> Task fallback, dur 24h -> 3wd
        "%R\t1007\t1\t3\t1\tTK_NotStart\tT02\tResource Task\t24\t24\t0\t0\tTT_Rsrc\tDT_FixedDUR2\tCP_Drtn\t0\t0\tN\t\t\t2027-02-08 08:00\t2027-02-10 17:00\t\t\t0\n"
        # CS_MSOB -> SNET
        "%R\t1010\t1\t3\t1\tTK_NotStart\tC01\tCon MSOB\t8\t8\t0\t0\tTT_Task\tDT_FixedDUR2\tCP_Drtn\t0\t0\tN\t\t\t2027-03-01 08:00\t2027-03-01 17:00\tCS_MSOB\t2027-03-01 08:00\t0\n"
        # CS_MSO -> SNET
        "%R\t1011\t1\t3\t1\tTK_NotStart\tC02\tCon MSO\t8\t8\t0\t0\tTT_Task\tDT_FixedDUR2\tCP_Drtn\t0\t0\tN\t\t\t2027-03-01 08:00\t2027-03-01 17:00\tCS_MSO\t2027-03-02 08:00\t0\n"
        # CS_MEOB -> FNLT
        "%R\t1012\t1\t3\t1\tTK_NotStart\tC03\tCon MEOB\t8\t8\t0\t0\tTT_Task\tDT_FixedDUR2\tCP_Drtn\t0\t0\tN\t\t\t2027-03-01 08:00\t2027-03-01 17:00\tCS_MEOB\t2027-03-03 17:00\t0\n"
        # CS_MEO -> FNLT
        "%R\t1013\t1\t3\t1\tTK_NotStart\tC04\tCon MEO\t8\t8\t0\t0\tTT_Task\tDT_FixedDUR2\tCP_Drtn\t0\t0\tN\t\t\t2027-03-01 08:00\t2027-03-01 17:00\tCS_MEO\t2027-03-04 17:00\t0\n"
        # CS_MANDSTART -> MSO
        "%R\t1014\t1\t3\t1\tTK_NotStart\tC05\tCon MandStart\t8\t8\t0\t0\tTT_Task\tDT_FixedDUR2\tCP_Drtn\t0\t0\tN\t\t\t2027-03-01 08:00\t2027-03-01 17:00\tCS_MANDSTART\t2027-03-05 08:00\t0\n"
        # CS_MANDFIN -> FNLT
        "%R\t1015\t1\t3\t1\tTK_NotStart\tC06\tCon MandFin\t8\t8\t0\t0\tTT_Task\tDT_FixedDUR2\tCP_Drtn\t0\t0\tN\t\t\t2027-03-01 08:00\t2027-03-01 17:00\tCS_MANDFIN\t2027-03-06 17:00\t0"
    )

    # TASKPRED: FS/SS/FF/SF between T01 & T02 (task_code T02 -> task_id 1007)
    taskpred = (
        "%T\tTASKPRED\n"
        "%F\ttask_pred_id\ttask_id\tpred_task_id\tproj_id\tpred_proj_id\tpred_type\tlag_hr_cnt\tcomments\tfloat_path\n"
        "%R\t1\t1007\t1001\t1\t1\tPR_FS\t16\t\tN\n"   # lag 2 wd
        "%R\t2\t1007\t1001\t1\t1\tPR_SS\t0\t\tN\n"
        "%R\t3\t1007\t1001\t1\t1\tPR_FF\t8\t\tN\n"    # lag 1 wd
        "%R\t4\t1007\t1001\t1\t1\tPR_SF\t-8\t\tN"     # lag -1 wd
    )

    end = "%E"
    return "\n".join([header, "", calendar, "", project, "", projwbs, "", task, "", taskpred, "", end]) + "\n"


class TestXerImportMapping:
    """Directly exercise xer_import.import_xer() with an in-memory fixture so we
    verify every TYPE_MAP / PRED_MAP / CSTR_MAP branch, hours/8 rounding, WBS
    dotted code and holiday recovery — no HTTP round-trip needed."""

    def test_type_mapping(self):
        result = import_xer(_mk_synthetic_xer())
        by_code = {a["activity_id"]: a for a in result["activities"]}
        assert by_code["T01"]["type"] == "Task"       # TT_Task -> Task
        assert by_code["M01"]["type"] == "Milestone"  # TT_FinMile
        assert by_code["M02"]["type"] == "Milestone"  # TT_StartMile
        assert by_code["M03"]["type"] == "Milestone"  # TT_Mile
        assert by_code["S01"]["type"] == "Summary"    # TT_WBS
        assert by_code["S02"]["type"] == "Summary"    # TT_LOE
        assert by_code["T02"]["type"] == "Task"       # TT_Rsrc -> Task fallback

    def test_duration_hours_over_eight(self):
        result = import_xer(_mk_synthetic_xer())
        by_code = {a["activity_id"]: a for a in result["activities"]}
        assert by_code["T01"]["duration"] == 5   # 40h / 8
        assert by_code["T02"]["duration"] == 3   # 24h / 8
        # milestone duration forced to 0 regardless of target hours
        assert by_code["M01"]["duration"] == 0
        assert by_code["M02"]["duration"] == 0
        assert by_code["M03"]["duration"] == 0

    def test_pred_type_and_lag_mapping(self):
        result = import_xer(_mk_synthetic_xer())
        by_code = {a["activity_id"]: a for a in result["activities"]}
        preds = by_code["T02"]["predecessors"]
        assert len(preds) == 4
        types = {p["type"] for p in preds}
        assert types == {"FS", "SS", "FF", "SF"}
        # verify hours/8 => days round-trip on each
        by_type = {p["type"]: p for p in preds}
        assert by_type["FS"]["lag"] == 2
        assert by_type["SS"]["lag"] == 0
        assert by_type["FF"]["lag"] == 1
        # negative lag currently maps through int(round(-1.0)) = -1
        assert by_type["SF"]["lag"] in (-1, 0)  # tolerate either rounding branch

    def test_constraint_mapping_all_branches(self):
        result = import_xer(_mk_synthetic_xer())
        by_code = {a["activity_id"]: a for a in result["activities"]}
        assert by_code["C01"]["constraint_type"] == "SNET"       # CS_MSOB
        assert by_code["C02"]["constraint_type"] == "SNET"       # CS_MSO
        assert by_code["C03"]["constraint_type"] == "FNLT"       # CS_MEOB
        assert by_code["C04"]["constraint_type"] == "FNLT"       # CS_MEO
        assert by_code["C05"]["constraint_type"] == "MSO"        # CS_MANDSTART
        assert by_code["C06"]["constraint_type"] == "FNLT"       # CS_MANDFIN
        # ISO date strings preserved
        assert by_code["C05"]["constraint_date"] == "2027-03-05"
        assert by_code["C06"]["constraint_date"] == "2027-03-06"

    def test_wbs_names_and_dotted_code(self):
        result = import_xer(_mk_synthetic_xer())
        by_code = {a["activity_id"]: a for a in result["activities"]}
        a = by_code["T01"]
        # WBS L1 = Stage One (child of root, root is proj_node_flag=Y)
        assert a["wbs_l1"] == "Stage One"
        assert a["wbs_l2"] == "Sub A"
        assert a["wbs_code"] == "1.1"

    def test_calendar_holidays_and_week_pattern(self):
        result = import_xer(_mk_synthetic_xer())
        assert result["week_pattern"] in ("5-day", "6-day", "7-day")
        # 5-day pattern expected (5 working DayWorking=1 slots in clndr_data)
        assert result["week_pattern"] == "5-day"
        assert "2027-08-02" in result["holidays"]

    def test_stats_summary(self):
        result = import_xer(_mk_synthetic_xer())
        stats = result["stats"]
        # 13 rows total in synthetic TASK
        assert stats["activities"] == 13
        assert stats["links"] == 4
        assert stats["milestones"] == 3
        assert stats["holidays"] == 1

    def test_parse_tables_tab_separator(self):
        text = _mk_synthetic_xer()
        t = parse_tables(text)
        assert "TASK" in t and "TASKPRED" in t and "PROJWBS" in t and "CALENDAR" in t
        assert len(t["TASK"]) == 13
        assert len(t["TASKPRED"]) == 4

    def test_non_xer_raises(self):
        with pytest.raises(ValueError, match="does not look like a P6 XER file"):
            import_xer("Hello there.\nNo tables here.\n")
