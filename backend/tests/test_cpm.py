"""CPM correctness via /recalculate: FS/SS/FF/SF, negative lags, milestone dur=0, cycles, critical."""
import uuid


def _mkproj(api, base_url, headers):
    body = {"name": f"TEST_cpm_{uuid.uuid4().hex[:6]}",
            "inputs": {"project_type": "x", "start_date": "2026-02-02"}}
    r = api.post(f"{base_url}/api/projects", json=body, headers=headers, timeout=30)
    assert r.status_code == 200
    return r.json()["id"]


def _recalc(api, base_url, headers, pid, activities):
    r = api.post(f"{base_url}/api/projects/{pid}/recalculate",
                 json={"activities": activities}, headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_fs_link_basic(api, base_url, auth_headers):
    pid = _mkproj(api, base_url, auth_headers)
    acts = [
        {"activity_id": "A1", "type": "Task", "duration": 5, "predecessors": []},
        {"activity_id": "A2", "type": "Task", "duration": 3, "predecessors": [{"id": "A1", "type": "FS", "lag": 0}]},
    ]
    res = _recalc(api, base_url, auth_headers, pid, acts)
    a1 = next(a for a in res["activities"] if a["activity_id"] == "A1")
    a2 = next(a for a in res["activities"] if a["activity_id"] == "A2")
    assert a1["es"] == 0 and a1["ef"] == 5
    assert a2["es"] == 5 and a2["ef"] == 8
    assert res["has_cycle"] is False
    api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)


def test_ss_positive_lag(api, base_url, auth_headers):
    pid = _mkproj(api, base_url, auth_headers)
    acts = [
        {"activity_id": "A1", "type": "Task", "duration": 10, "predecessors": []},
        {"activity_id": "A2", "type": "Task", "duration": 4, "predecessors": [{"id": "A1", "type": "SS", "lag": 3}]},
    ]
    res = _recalc(api, base_url, auth_headers, pid, acts)
    a2 = next(a for a in res["activities"] if a["activity_id"] == "A2")
    assert a2["es"] == 3 and a2["ef"] == 7
    api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)


def test_ff_link(api, base_url, auth_headers):
    pid = _mkproj(api, base_url, auth_headers)
    acts = [
        {"activity_id": "A1", "type": "Task", "duration": 10, "predecessors": []},
        {"activity_id": "A2", "type": "Task", "duration": 4, "predecessors": [{"id": "A1", "type": "FF", "lag": 2}]},
    ]
    res = _recalc(api, base_url, auth_headers, pid, acts)
    a2 = next(a for a in res["activities"] if a["activity_id"] == "A2")
    # ef of A2 = ef(A1) + 2 = 12, so es = 12 - 4 = 8
    assert a2["ef"] == 12 and a2["es"] == 8
    api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)


def test_sf_link(api, base_url, auth_headers):
    pid = _mkproj(api, base_url, auth_headers)
    acts = [
        {"activity_id": "A1", "type": "Task", "duration": 6, "predecessors": []},
        {"activity_id": "A2", "type": "Task", "duration": 4, "predecessors": [{"id": "A1", "type": "SF", "lag": 5}]},
    ]
    res = _recalc(api, base_url, auth_headers, pid, acts)
    a2 = next(a for a in res["activities"] if a["activity_id"] == "A2")
    # SF: ef of A2 = es(A1) + lag = 0 + 5 = 5; so es = 1
    assert a2["ef"] == 5 and a2["es"] == 1
    api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)


def test_negative_lag(api, base_url, auth_headers):
    pid = _mkproj(api, base_url, auth_headers)
    acts = [
        {"activity_id": "A1", "type": "Task", "duration": 10, "predecessors": []},
        {"activity_id": "A2", "type": "Task", "duration": 4, "predecessors": [{"id": "A1", "type": "FS", "lag": -3}]},
    ]
    res = _recalc(api, base_url, auth_headers, pid, acts)
    a2 = next(a for a in res["activities"] if a["activity_id"] == "A2")
    # ef(A1) + lag = 10 - 3 = 7
    assert a2["es"] == 7 and a2["ef"] == 11
    api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)


def test_milestone_duration_forced_zero(api, base_url, auth_headers):
    pid = _mkproj(api, base_url, auth_headers)
    acts = [
        {"activity_id": "A1", "type": "Task", "duration": 5, "predecessors": []},
        {"activity_id": "M1", "type": "Milestone", "duration": 99, "predecessors": [{"id": "A1", "type": "FS", "lag": 0}]},
    ]
    res = _recalc(api, base_url, auth_headers, pid, acts)
    m = next(a for a in res["activities"] if a["activity_id"] == "M1")
    assert m["duration"] == 0
    assert m["es"] == m["ef"] == 5
    api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)


def test_critical_path_and_float(api, base_url, auth_headers):
    pid = _mkproj(api, base_url, auth_headers)
    # A -> B (critical) & A -> C -> B (has float since C is shorter)
    acts = [
        {"activity_id": "A", "type": "Task", "duration": 5, "predecessors": []},
        {"activity_id": "B", "type": "Task", "duration": 10, "predecessors": [{"id": "A", "type": "FS", "lag": 0}]},
        {"activity_id": "C", "type": "Task", "duration": 3, "predecessors": [{"id": "A", "type": "FS", "lag": 0}]},
        {"activity_id": "D", "type": "Task", "duration": 4, "predecessors": [
            {"id": "B", "type": "FS", "lag": 0}, {"id": "C", "type": "FS", "lag": 0}]},
    ]
    res = _recalc(api, base_url, auth_headers, pid, acts)
    by = {a["activity_id"]: a for a in res["activities"]}
    assert by["A"]["critical"] is True
    assert by["B"]["critical"] is True
    assert by["D"]["critical"] is True
    assert by["C"]["critical"] is False
    assert by["C"]["total_float"] > 0
    assert res["critical_count"] >= 3
    api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)


def test_cycle_detection(api, base_url, auth_headers):
    pid = _mkproj(api, base_url, auth_headers)
    acts = [
        {"activity_id": "X", "type": "Task", "duration": 3, "predecessors": [{"id": "Y", "type": "FS", "lag": 0}]},
        {"activity_id": "Y", "type": "Task", "duration": 3, "predecessors": [{"id": "X", "type": "FS", "lag": 0}]},
    ]
    res = _recalc(api, base_url, auth_headers, pid, acts)
    assert res["has_cycle"] is True
    api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)
