"""Exports (csv/json/xml) and Versions (snapshot/list/restore) against existing seeded project."""
import xml.etree.ElementTree as ET


def test_export_csv(api, base_url, auth_headers, existing_project_id):
    r = api.get(f"{base_url}/api/projects/{existing_project_id}/export/csv", headers=auth_headers, timeout=60)
    assert r.status_code == 200, r.text
    assert "text/csv" in r.headers.get("content-type", "")
    assert "attachment" in r.headers.get("content-disposition", "").lower()
    assert ".csv" in r.headers.get("content-disposition", "")
    assert "Activity ID" in r.text
    assert len(r.text.splitlines()) >= 10


def test_export_json(api, base_url, auth_headers, existing_project_id):
    r = api.get(f"{base_url}/api/projects/{existing_project_id}/export/json", headers=auth_headers, timeout=60)
    assert r.status_code == 200
    assert "application/json" in r.headers.get("content-type", "")
    assert "attachment" in r.headers.get("content-disposition", "").lower()
    data = r.json()
    assert "activities" in data and "schedule" in data
    assert len(data["activities"]) > 10


def test_export_xml(api, base_url, auth_headers, existing_project_id):
    r = api.get(f"{base_url}/api/projects/{existing_project_id}/export/xml", headers=auth_headers, timeout=60)
    assert r.status_code == 200
    assert "xml" in r.headers.get("content-type", "")
    assert "attachment" in r.headers.get("content-disposition", "").lower()
    # Well-formed XML with PredecessorLink
    root = ET.fromstring(r.text)
    ns = {"m": "http://schemas.microsoft.com/project"}
    pred_links = root.findall(".//m:PredecessorLink", ns)
    assert len(pred_links) > 0, "No PredecessorLink entries in MSP XML"


def test_version_snapshot_list_restore(api, base_url, auth_headers, existing_project_id):
    r = api.post(f"{base_url}/api/projects/{existing_project_id}/versions",
                 json={"label": "TEST_snapshot"}, headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    vid = r.json()["id"]

    r2 = api.get(f"{base_url}/api/projects/{existing_project_id}/versions", headers=auth_headers, timeout=30)
    assert r2.status_code == 200
    versions = r2.json()
    assert any(v["id"] == vid for v in versions)

    r3 = api.post(f"{base_url}/api/projects/{existing_project_id}/versions/{vid}/restore",
                  headers=auth_headers, timeout=60)
    assert r3.status_code == 200
    body = r3.json()
    assert "activities" in body and len(body["activities"]) > 0
