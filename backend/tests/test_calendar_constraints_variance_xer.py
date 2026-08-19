"""Iteration 2 new features:
- PUT /projects/{id}/calendar (week pattern + holiday region + custom holidays)
- SNET / FNLT / MSO constraints in CPM
- GET /projects/{id}/variance report
- XER export (Primavera P6)
- CSV Free Float/Constraint columns, MSP XML calendar exceptions + constraints
- PATCH /projects/{id} partial inputs merge
"""
import io
import re
import uuid
import xml.etree.ElementTree as ET
import csv


# ---------- helpers ----------
def _mkproj(api, base_url, headers, name="TEST_it2", extra_inputs=None, calendar=None):
    body = {
        "name": f"{name}_{uuid.uuid4().hex[:6]}",
        "inputs": {
            "project_type": "commercial",
            "gia": 5000, "gia_unit": "sqm", "floors": 6,
            "budget": 25_000_000, "currency": "GBP",
            "start_date": "2027-02-01",
            "procurement": "traditional",
            **(extra_inputs or {}),
        },
    }
    if calendar:
        body["calendar"] = calendar
    r = api.post(f"{base_url}/api/projects", json=body, headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _recalc(api, base_url, headers, pid, activities):
    r = api.post(f"{base_url}/api/projects/{pid}/recalculate",
                 json={"activities": activities}, headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _save_acts(api, base_url, headers, pid, activities):
    r = api.put(f"{base_url}/api/projects/{pid}/activities",
                json={"activities": activities}, headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- CALENDAR ----------
class TestCalendar:
    def test_calendar_put_persists_config_not_expanded_list(self, api, base_url, auth_headers):
        p = _mkproj(api, base_url, auth_headers, name="TEST_cal_persist")
        pid = p["id"]
        body = {"week_pattern": "6-day", "holiday_region": "UK", "holidays": ["2027-08-02"]}
        r = api.put(f"{base_url}/api/projects/{pid}/calendar", json=body, headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # Schedule reflects expanded holidays (UK + custom) and 6 working days
        assert data["schedule"]["calendar"]["working_days_per_week"] == 6
        assert data["schedule"]["calendar"]["week_pattern"] == "6-day"
        # UK preset should include 2027-01-01 etc, plus our custom 2027-08-02
        assert "2027-08-02" in data["schedule"]["calendar"]["holidays"]
        assert "2027-01-01" in data["schedule"]["calendar"]["holidays"]

        # Stored raw config on the project (NOT expanded) — re-fetch and inspect
        r2 = api.get(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)
        assert r2.status_code == 200
        stored = r2.json()
        # Raw config only carries the custom list, not the UK preset expansion
        assert stored["calendar"]["week_pattern"] == "6-day"
        assert stored["calendar"]["holiday_region"] == "UK"
        assert stored["calendar"]["holidays"] == ["2027-08-02"]
        # But the computed schedule.calendar.holidays is expanded
        assert len(stored["schedule"]["calendar"]["holidays"]) > 1

        api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)

    def test_calendar_week_patterns_change_finish(self, api, base_url, auth_headers):
        p = _mkproj(api, base_url, auth_headers, name="TEST_cal_finish")
        pid = p["id"]
        # 30-workday chain of activities
        acts = [
            {"activity_id": "A", "type": "Task", "duration": 30, "predecessors": []},
        ]
        _save_acts(api, base_url, auth_headers, pid, acts)

        def set_and_finish(cfg):
            r = api.put(f"{base_url}/api/projects/{pid}/calendar",
                        json=cfg, headers=auth_headers, timeout=30)
            assert r.status_code == 200
            return r.json()["schedule"]["project_finish"]

        finish_5d_none = set_and_finish({"week_pattern": "5-day", "holiday_region": "none", "holidays": []})
        finish_5d_uk = set_and_finish({"week_pattern": "5-day", "holiday_region": "UK", "holidays": []})
        finish_6d_none = set_and_finish({"week_pattern": "6-day", "holiday_region": "none", "holidays": []})
        finish_7d_none = set_and_finish({"week_pattern": "7-day", "holiday_region": "none", "holidays": []})

        # 7-day shortest (calendar finish earliest), 5-day+UK holidays latest
        assert finish_7d_none < finish_6d_none < finish_5d_none, \
            f"7d {finish_7d_none} < 6d {finish_6d_none} < 5d {finish_5d_none}"
        # UK holidays push 5-day finish later or equal (>= not <)
        assert finish_5d_uk >= finish_5d_none

        api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)


# ---------- CONSTRAINTS ----------
class TestConstraints:
    def test_snet_pushes_start(self, api, base_url, auth_headers):
        p = _mkproj(api, base_url, auth_headers, name="TEST_snet",
                    extra_inputs={"start_date": "2027-02-01"})
        pid = p["id"]
        # SNET well after natural CPM start
        acts = [
            {"activity_id": "A", "type": "Task", "duration": 5, "predecessors": []},
            {"activity_id": "B", "type": "Task", "duration": 5,
             "predecessors": [{"id": "A", "type": "FS", "lag": 0}],
             "constraint_type": "SNET", "constraint_date": "2027-06-01"},
        ]
        res = _recalc(api, base_url, auth_headers, pid, acts)
        b = next(a for a in res["activities"] if a["activity_id"] == "B")
        # SNET should push start to at least 2027-06-01
        assert b["start"] >= "2027-06-01", f"Expected B start >= 2027-06-01, got {b['start']}"
        api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)

    def test_fnlt_produces_negative_float_and_critical(self, api, base_url, auth_headers):
        p = _mkproj(api, base_url, auth_headers, name="TEST_fnlt",
                    extra_inputs={"start_date": "2027-02-01"})
        pid = p["id"]
        # Task needs at least 40 wd but FNLT constraints finish at ~10 wd -> neg float
        acts = [
            {"activity_id": "A", "type": "Task", "duration": 40, "predecessors": [],
             "constraint_type": "FNLT", "constraint_date": "2027-02-15"},
        ]
        res = _recalc(api, base_url, auth_headers, pid, acts)
        a = next(x for x in res["activities"] if x["activity_id"] == "A")
        assert a["total_float"] < 0, f"Expected negative float, got {a['total_float']}"
        assert a["critical"] is True
        api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)

    def test_mso_fixes_start_exactly(self, api, base_url, auth_headers):
        p = _mkproj(api, base_url, auth_headers, name="TEST_mso",
                    extra_inputs={"start_date": "2027-02-01"})
        pid = p["id"]
        acts = [
            {"activity_id": "A", "type": "Task", "duration": 5, "predecessors": [],
             "constraint_type": "MSO", "constraint_date": "2027-05-03"},
        ]
        res = _recalc(api, base_url, auth_headers, pid, acts)
        a = next(x for x in res["activities"] if x["activity_id"] == "A")
        # MSO = must start on that exact working day
        # 2027-05-03 is Monday, so start should be that date
        assert a["start"] == "2027-05-03", f"Expected 2027-05-03, got {a['start']}"
        api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)


# ---------- VARIANCE ----------
class TestVariance:
    def test_variance_late_with_target(self, api, base_url, auth_headers):
        p = _mkproj(api, base_url, auth_headers, name="TEST_var_late",
                    extra_inputs={"start_date": "2027-02-01", "completion_date": "2027-03-01"})
        pid = p["id"]
        # 100 wd of work vs target 2027-03-01 (about 20 working days)
        acts = [
            {"activity_id": "A", "type": "Task", "duration": 100, "predecessors": []},
            {"activity_id": "M1", "type": "Milestone", "duration": 0,
             "predecessors": [{"id": "A", "type": "FS", "lag": 0}]},
        ]
        _save_acts(api, base_url, auth_headers, pid, acts)
        r = api.get(f"{base_url}/api/projects/{pid}/variance", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        rep = r.json()
        assert rep["target_finish"] == "2027-03-01"
        assert rep["forecast_finish"] is not None
        assert rep["variance_working_days"] is not None
        assert rep["variance_working_days"] > 0
        assert rep["status"] == "late"
        assert isinstance(rep["milestones"], list) and len(rep["milestones"]) >= 1
        assert any(m["activity_id"] == "M1" for m in rep["milestones"])
        assert isinstance(rep["critical_path"], list) and len(rep["critical_path"]) >= 1
        assert isinstance(rep["negative_float_activities"], list)
        assert rep["variance_calendar_days"] is not None
        api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)

    def test_variance_no_target(self, api, base_url, auth_headers):
        p = _mkproj(api, base_url, auth_headers, name="TEST_var_none",
                    extra_inputs={"start_date": "2027-02-01", "completion_date": None})
        pid = p["id"]
        acts = [{"activity_id": "A", "type": "Task", "duration": 5, "predecessors": []}]
        _save_acts(api, base_url, auth_headers, pid, acts)
        r = api.get(f"{base_url}/api/projects/{pid}/variance", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        rep = r.json()
        assert rep["status"] == "no_target"
        assert rep["target_finish"] in (None, "")
        assert rep["variance_working_days"] is None
        api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)

    def test_variance_negative_float_list(self, api, base_url, auth_headers):
        p = _mkproj(api, base_url, auth_headers, name="TEST_var_neg",
                    extra_inputs={"start_date": "2027-02-01", "completion_date": "2028-01-01"})
        pid = p["id"]
        acts = [
            {"activity_id": "A", "type": "Task", "duration": 100, "predecessors": [],
             "constraint_type": "FNLT", "constraint_date": "2027-02-15"},
        ]
        _save_acts(api, base_url, auth_headers, pid, acts)
        r = api.get(f"{base_url}/api/projects/{pid}/variance", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        rep = r.json()
        assert len(rep["negative_float_activities"]) >= 1
        assert rep["negative_float_activities"][0]["activity_id"] == "A"
        api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)


# ---------- XER EXPORT ----------
class TestXerExport:
    def test_xer_export_structure(self, api, base_url, auth_headers, existing_project_id):
        r = api.get(f"{base_url}/api/projects/{existing_project_id}/export/xer",
                    headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text
        assert "text/plain" in r.headers.get("content-type", "")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower() and ".xer" in cd
        body = r.text
        # ERMHDR first line
        assert body.startswith("ERMHDR\t"), body[:80]
        # Required tables
        for t in ("CURRTYPE", "CALENDAR", "PROJECT", "PROJWBS", "TASK", "TASKPRED"):
            assert f"%T\t{t}" in body, f"missing %T\t{t}"
        # %F and %R present
        assert "%F\t" in body
        assert "%R\t" in body
        # Predecessor codes used
        assert "PR_FS" in body or "PR_SS" in body or "PR_FF" in body or "PR_SF" in body
        # End marker
        assert body.rstrip().endswith("%E")

    def test_xer_taskpred_lag_hours(self, api, base_url, auth_headers):
        """TASKPRED lag_hr_cnt must equal lag_days * 8 (8h/day)."""
        p = _mkproj(api, base_url, auth_headers, name="TEST_xer_lag")
        pid = p["id"]
        acts = [
            {"activity_id": "P1", "type": "Task", "duration": 5, "predecessors": []},
            {"activity_id": "P2", "type": "Task", "duration": 5,
             "predecessors": [{"id": "P1", "type": "FS", "lag": 3}]},
        ]
        _save_acts(api, base_url, auth_headers, pid, acts)
        r = api.get(f"{base_url}/api/projects/{pid}/export/xer",
                    headers=auth_headers, timeout=30)
        assert r.status_code == 200
        body = r.text
        # find TASKPRED block
        m = re.search(r"%T\tTASKPRED\n%F\t([^\n]+)\n((?:%R\t[^\n]*\n?)+)", body)
        assert m, "TASKPRED block not found"
        fields = m.group(1).split("\t")
        rows_txt = m.group(2).strip().splitlines()
        assert rows_txt, "TASKPRED has no %R rows"
        row = rows_txt[0].split("\t")[1:]  # drop %R
        rec = dict(zip(fields, row))
        assert rec["pred_type"] in ("PR_FS", "PR_SS", "PR_FF", "PR_SF")
        # lag=3 -> lag_hr_cnt=24
        assert int(rec["lag_hr_cnt"]) == 24, rec
        api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)


# ---------- CSV new columns + MSP calendar exceptions/constraints + JSON calendar ----------
class TestExistingExportUpdates:
    def test_csv_has_free_float_and_constraint_columns(self, api, base_url, auth_headers, existing_project_id):
        r = api.get(f"{base_url}/api/projects/{existing_project_id}/export/csv",
                    headers=auth_headers, timeout=60)
        assert r.status_code == 200
        reader = csv.reader(io.StringIO(r.text))
        header = next(reader)
        assert "Free Float" in header
        assert "Constraint" in header
        assert "Constraint Date" in header

    def test_json_includes_calendar_config(self, api, base_url, auth_headers, existing_project_id):
        r = api.get(f"{base_url}/api/projects/{existing_project_id}/export/json",
                    headers=auth_headers, timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert "calendar" in data
        assert "week_pattern" in data["calendar"]

    def test_msp_xml_has_calendar_exceptions_and_constraint(self, api, base_url, auth_headers):
        p = _mkproj(api, base_url, auth_headers, name="TEST_msp_ex",
                    calendar={"week_pattern": "5-day", "holiday_region": "UK", "holidays": ["2027-08-02"]})
        pid = p["id"]
        acts = [
            {"activity_id": "A", "type": "Task", "duration": 5, "predecessors": [],
             "constraint_type": "SNET", "constraint_date": "2027-05-03"},
        ]
        _save_acts(api, base_url, auth_headers, pid, acts)
        r = api.get(f"{base_url}/api/projects/{pid}/export/xml",
                    headers=auth_headers, timeout=30)
        assert r.status_code == 200
        root = ET.fromstring(r.text)
        ns = {"m": "http://schemas.microsoft.com/project"}
        # Calendar exceptions present
        exceptions = root.findall(".//m:Calendar/m:Exceptions/m:Exception", ns)
        assert len(exceptions) > 0, "No calendar exceptions"
        # Custom 2027-08-02 among them
        from_dates = [e.findtext(".//m:FromDate", default="", namespaces=ns) for e in exceptions]
        assert any("2027-08-02" in d for d in from_dates), from_dates[:5]
        # Constraint on task A: ConstraintType=4 (SNET)
        tasks = root.findall(".//m:Task", ns)
        target = [t for t in tasks if (t.findtext("m:Name", default="", namespaces=ns) or "").startswith("A") or
                  t.findtext("m:Name", default="", namespaces=ns) == "A"]
        # Just look at all tasks; find one with ConstraintType 4
        ctypes = [t.findtext("m:ConstraintType", default="0", namespaces=ns) for t in tasks]
        assert "4" in ctypes, f"No SNET(4) in ConstraintType values: {ctypes}"
        api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)


# ---------- PATCH MERGE ----------
class TestPatchMerge:
    def test_patch_partial_inputs_merges(self, api, base_url, auth_headers):
        p = _mkproj(api, base_url, auth_headers, name="TEST_patch_merge",
                    extra_inputs={"start_date": "2027-02-01", "project_type": "commercial"})
        pid = p["id"]
        # Patch only completion_date; start_date and project_type must survive
        r = api.patch(f"{base_url}/api/projects/{pid}",
                      json={"inputs": {"completion_date": "2028-01-01"}},
                      headers=auth_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["inputs"]["completion_date"] == "2028-01-01"
        assert data["inputs"]["start_date"] == "2027-02-01", data["inputs"]
        assert data["inputs"]["project_type"] == "commercial", data["inputs"]

        # Patch only name; inputs untouched
        r2 = api.patch(f"{base_url}/api/projects/{pid}",
                       json={"name": "TEST_renamed"}, headers=auth_headers, timeout=30)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["name"] == "TEST_renamed"
        assert d2["inputs"]["start_date"] == "2027-02-01"
        assert d2["inputs"]["completion_date"] == "2028-01-01"
        assert d2["inputs"]["project_type"] == "commercial"

        api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)
