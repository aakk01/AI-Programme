"""Projects CRUD: create, read, list, duplicate, delete + duplicate activity_id 400."""
import uuid


def _create(api, base_url, headers, name="TEST_proj"):
    body = {
        "name": name,
        "inputs": {
            "project_type": "commercial",
            "gia": 5000, "gia_unit": "sqm", "floors": 6,
            "budget": 25000000, "currency": "GBP",
            "start_date": "2026-02-02",
            "procurement": "traditional",
        },
    }
    r = api.post(f"{base_url}/api/projects", json=body, headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_create_read_list(api, base_url, auth_headers):
    p = _create(api, base_url, auth_headers, name=f"TEST_crud_{uuid.uuid4().hex[:6]}")
    pid = p["id"]
    assert p["name"].startswith("TEST_")
    assert "schedule" in p

    r = api.get(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    assert r.json()["id"] == pid

    r2 = api.get(f"{base_url}/api/projects", headers=auth_headers, timeout=30)
    assert r2.status_code == 200
    assert any(x["id"] == pid for x in r2.json())

    # cleanup
    api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)


def test_duplicate_and_delete(api, base_url, auth_headers):
    p = _create(api, base_url, auth_headers, name=f"TEST_dup_{uuid.uuid4().hex[:6]}")
    pid = p["id"]
    r = api.post(f"{base_url}/api/projects/{pid}/duplicate", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    dup = r.json()
    assert dup["id"] != pid
    assert "(copy)" in dup["name"]

    r2 = api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)
    assert r2.status_code == 200 and r2.json().get("deleted") is True

    r3 = api.get(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)
    assert r3.status_code == 404

    # cleanup duplicate
    api.delete(f"{base_url}/api/projects/{dup['id']}", headers=auth_headers, timeout=30)


def test_duplicate_activity_id_returns_400(api, base_url, auth_headers):
    p = _create(api, base_url, auth_headers, name=f"TEST_dupact_{uuid.uuid4().hex[:6]}")
    pid = p["id"]
    activities = [
        {"activity_id": "A1000", "description": "First", "type": "Task", "duration": 5, "predecessors": []},
        {"activity_id": "A1000", "description": "Dup", "type": "Task", "duration": 3, "predecessors": []},
    ]
    r = api.put(f"{base_url}/api/projects/{pid}/activities", json={"activities": activities}, headers=auth_headers, timeout=30)
    assert r.status_code == 400, r.text
    api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)
