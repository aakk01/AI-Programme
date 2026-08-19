"""Regression tests for MSP XML / Asta XML / CSV / JSON / XER exports.

Focus: verify MSP XSD element ordering fix so MS Project & Asta Powerproject
don't silently drop <Duration> (previously all tasks imported as 0d).
"""
import os
import re
import uuid
import xml.etree.ElementTree as ET

import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
MSP_NS = "http://schemas.microsoft.com/project"
NS = {"m": MSP_NS}

EMAIL = "planner@test.com"
PASSWORD = "Test1234"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        # try signup
        r = requests.post(f"{API}/auth/signup", json={"email": EMAIL, "password": PASSWORD, "name": "Planner"})
        assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def project_id(client):
    """Create a project and seed activities via PUT so we don't need AI."""
    name = f"TEST_export_{uuid.uuid4().hex[:6]}"
    r = client.post(f"{API}/projects", json={
        "name": name,
        "inputs": {"project_type": "Office", "start_date": "2025-02-03"},
        "calendar": {"week_pattern": "5-day", "holiday_region": "none", "holidays": []},
    })
    assert r.status_code == 200, r.text
    pid = r.json()["id"]

    activities = [
        {"activity_id": "A100", "wbs_code": "1.1", "wbs_l1": "Enabling", "wbs_l2": "Site",
         "description": "Site setup", "type": "Task", "duration": 10, "predecessors": []},
        {"activity_id": "A200", "wbs_code": "1.2", "wbs_l1": "Enabling", "wbs_l2": "Site",
         "description": "Demolition", "type": "Task", "duration": 15,
         "predecessors": [{"id": "A100", "type": "FS", "lag": 0}]},
        {"activity_id": "A300", "wbs_code": "2.1", "wbs_l1": "Structure", "wbs_l2": "Frame",
         "description": "Frame erection", "type": "Task", "duration": 20,
         "predecessors": [{"id": "A200", "type": "FS", "lag": 2}]},
        {"activity_id": "M900", "wbs_code": "3.1", "wbs_l1": "Handover", "wbs_l2": "Completion",
         "description": "Practical Completion", "type": "Milestone", "duration": 0,
         "predecessors": [{"id": "A300", "type": "FS", "lag": 0}]},
    ]
    r = client.put(f"{API}/projects/{pid}/activities", json={"activities": activities})
    assert r.status_code == 200, r.text
    yield pid
    client.delete(f"{API}/projects/{pid}")


# ---------- helper: assert XSD element order inside each Task ----------
# MSP XSD sequence (subset we care about)
XSD_ORDER = [
    "UID", "ID", "Name", "Type", "IsNull", "WBS", "OutlineNumber", "OutlineLevel",
    "Priority", "Start", "Finish", "Duration", "DurationFormat", "Work",
    "EffortDriven", "Estimated", "Milestone", "Summary", "Critical",
    "FreeSlack", "TotalSlack", "FixedCost", "FixedCostAccrual",
    "PercentComplete", "PercentWorkComplete", "ConstraintType",
    "CalendarUID", "Manual", "PredecessorLink",
]


def _assert_task_order(task_el, ctx=""):
    order_index = {n: i for i, n in enumerate(XSD_ORDER)}
    last_i = -1
    last_name = ""
    for child in list(task_el):
        tag = child.tag.split("}", 1)[-1]
        if tag not in order_index:
            continue
        i = order_index[tag]
        assert i >= last_i, (
            f"[{ctx}] Element <{tag}> appears after <{last_name}> "
            f"which violates MSP XSD ordering"
        )
        last_i = i
        last_name = tag


# ---------- MSP XML tests ----------
class TestMspXml:
    def test_export_status_and_headers(self, client, project_id):
        r = client.get(f"{API}/projects/{project_id}/export/mspxml")
        assert r.status_code == 200
        assert "xml" in r.headers.get("content-type", "").lower()
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd and ".xml" in cd

    def test_duration_nonzero_and_xsd_ordering(self, client, project_id):
        r = client.get(f"{API}/projects/{project_id}/export/mspxml")
        root = ET.fromstring(r.text)
        tasks = root.findall(".//m:Task", NS)
        assert len(tasks) == 4

        # each Task must have <Manual> and correct ordering
        for t in tasks:
            name = t.findtext("m:Name", default="", namespaces=NS)
            assert t.find("m:Manual", NS) is not None, f"Missing <Manual> in {name}"
            _assert_task_order(t, ctx=f"MSP:{name}")

            dur = t.findtext("m:Duration", default="", namespaces=NS)
            is_milestone = t.findtext("m:Milestone", default="0", namespaces=NS) == "1"
            if is_milestone:
                assert dur == "PT0H0M0S", f"Milestone {name} should have zero duration, got {dur}"
            else:
                assert dur != "PT0H0M0S", f"Non-milestone {name} has zero duration (bug!)"
                # verify ISO 8601 format PT{hours}H0M0S
                m = re.match(r"^PT(\d+)H0M0S$", dur)
                assert m, f"Malformed duration {dur}"
                assert int(m.group(1)) > 0

    def test_expected_duration_conversion(self, client, project_id):
        """10d=PT80H, 15d=PT120H, 20d=PT160H (8h/day)."""
        r = client.get(f"{API}/projects/{project_id}/export/mspxml")
        root = ET.fromstring(r.text)
        wanted = {"Site setup": "PT80H0M0S", "Demolition": "PT120H0M0S",
                  "Frame erection": "PT160H0M0S", "Practical Completion": "PT0H0M0S"}
        for t in root.findall(".//m:Task", NS):
            name = t.findtext("m:Name", default="", namespaces=NS)
            if name in wanted:
                dur = t.findtext("m:Duration", default="", namespaces=NS)
                assert dur == wanted[name], f"{name}: expected {wanted[name]}, got {dur}"

    def test_predecessor_links(self, client, project_id):
        r = client.get(f"{API}/projects/{project_id}/export/mspxml")
        root = ET.fromstring(r.text)
        preds = root.findall(".//m:Task/m:PredecessorLink", NS)
        assert len(preds) == 3  # A200<-A100, A300<-A200(lag=2), M900<-A300
        for p in preds:
            assert p.find("m:PredecessorUID", NS) is not None
            assert p.find("m:Type", NS) is not None
            assert p.find("m:LinkLag", NS) is not None
        # lag=2 days -> 2*4800 = 9600 tenth-minutes
        lags = sorted(int(p.findtext("m:LinkLag", namespaces=NS)) for p in preds)
        assert lags == [0, 0, 9600]


# ---------- Asta XML tests ----------
class TestAstaXml:
    def test_export_status(self, client, project_id):
        r = client.get(f"{API}/projects/{project_id}/export/asta")
        assert r.status_code == 200
        assert "xml" in r.headers.get("content-type", "").lower()
        assert "attachment" in r.headers.get("content-disposition", "")

    def test_summary_hierarchy_and_leaf_durations(self, client, project_id):
        r = client.get(f"{API}/projects/{project_id}/export/asta")
        root = ET.fromstring(r.text)
        tasks = root.findall(".//m:Task", NS)
        assert len(tasks) > 4  # summaries + leaves

        levels = set()
        summary_count = 0
        leaf_task_seen = False
        for t in tasks:
            name = t.findtext("m:Name", default="", namespaces=NS)
            _assert_task_order(t, ctx=f"Asta:{name}")
            lvl = int(t.findtext("m:OutlineLevel", default="0", namespaces=NS))
            levels.add(lvl)
            is_summary = t.findtext("m:Summary", default="0", namespaces=NS) == "1"
            is_milestone = t.findtext("m:Milestone", default="0", namespaces=NS) == "1"
            dur = t.findtext("m:Duration", default="", namespaces=NS)

            if is_summary:
                summary_count += 1
                assert lvl in (1, 2), f"Summary {name} unexpected level {lvl}"
            elif not is_milestone:
                leaf_task_seen = True
                assert dur != "PT0H0M0S", f"Leaf non-milestone {name} has zero duration"
            else:  # milestone leaf
                assert dur == "PT0H0M0S"

        assert 1 in levels and 2 in levels and 3 in levels
        assert summary_count >= 2  # at least L1 & L2 summaries
        assert leaf_task_seen

    def test_asta_predecessors(self, client, project_id):
        r = client.get(f"{API}/projects/{project_id}/export/asta")
        root = ET.fromstring(r.text)
        preds = root.findall(".//m:Task/m:PredecessorLink", NS)
        assert len(preds) == 3


# ---------- Regression: CSV / JSON / XER ----------
class TestOtherExports:
    def test_csv(self, client, project_id):
        r = client.get(f"{API}/projects/{project_id}/export/csv")
        assert r.status_code == 200
        assert "csv" in r.headers.get("content-type", "").lower()
        assert "attachment" in r.headers.get("content-disposition", "")
        lines = r.text.strip().splitlines()
        assert lines[0].startswith("Activity ID")
        # Duration column should have values 10, 15, 20, 0
        durations = [row.split(",")[6] for row in lines[1:]]
        assert "10" in durations and "15" in durations and "20" in durations

    def test_json(self, client, project_id):
        r = client.get(f"{API}/projects/{project_id}/export/json")
        assert r.status_code == 200
        data = r.json()
        assert "activities" in data
        assert len(data["activities"]) == 4
        durs = {a["activity_id"]: a["duration"] for a in data["activities"]}
        assert durs["A100"] == 10 and durs["A300"] == 20 and durs["M900"] == 0

    def test_xer(self, client, project_id):
        r = client.get(f"{API}/projects/{project_id}/export/xer")
        assert r.status_code == 200
        text = r.text
        assert text.startswith("ERMHDR")
        assert "%T\tTASK" in text
        # parse TASK rows and confirm non-zero target_drtn_hr_cnt for tasks
        task_section = text.split("%T\tTASK", 1)[1].split("%T\t", 1)[0]
        fields_line = [l for l in task_section.splitlines() if l.startswith("%F")][0]
        fields = fields_line.split("\t")[1:]
        drtn_idx = fields.index("target_drtn_hr_cnt")
        type_idx = fields.index("task_type")
        rows = [l.split("\t")[1:] for l in task_section.splitlines() if l.startswith("%R")]
        assert len(rows) == 4
        non_mile_durs = [int(r[drtn_idx]) for r in rows if r[type_idx] != "TT_Mile"]
        assert all(d > 0 for d in non_mile_durs), f"Non-milestone XER durations: {non_mile_durs}"
        mile_durs = [int(r[drtn_idx]) for r in rows if r[type_idx] == "TT_Mile"]
        assert all(d == 0 for d in mile_durs)
