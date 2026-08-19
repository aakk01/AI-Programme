"""One fresh AI generation + one refinement.

Serialize: only one AI call at a time due to the Emergent LLM plan (single concurrent request).
Generation ~2-3min. Refinement ~30-60s.
"""
import time
import uuid


def test_generation_end_to_end(api, base_url, auth_headers):
    body = {
        "name": f"TEST_aigen_{uuid.uuid4().hex[:6]}",
        "inputs": {
            "project_type": "small commercial fit-out",
            "gia": 1500, "gia_unit": "sqm", "floors": 2,
            "budget": 3000000, "currency": "GBP",
            "start_date": "2026-03-01",
            "procurement": "traditional",
            "notes": "single tenant office refurb",
        },
    }
    r = api.post(f"{base_url}/api/projects", json=body, headers=auth_headers, timeout=30)
    assert r.status_code == 200
    pid = r.json()["id"]

    gen = api.post(f"{base_url}/api/projects/{pid}/generate", headers=auth_headers, timeout=30)
    assert gen.status_code == 200
    assert gen.json()["status"] == "running"

    # Poll until done, up to ~4 minutes
    status = "running"
    project = None
    err = ""
    deadline = time.time() + 420
    while time.time() < deadline:
        time.sleep(10)
        s = api.get(f"{base_url}/api/projects/{pid}/generation-status", headers=auth_headers, timeout=30)
        assert s.status_code == 200
        js = s.json()
        status = js.get("status")
        err = js.get("error", "")
        if status in ("done", "error"):
            project = js.get("project")
            break

    # cleanup regardless
    try:
        assert status == "done", f"Generation ended with status={status} err={err}"
        acts = project["activities"]
        assert 45 <= len(acts) <= 90, f"activity count {len(acts)} outside [45,90]"
        assumptions = project.get("assumptions", [])
        assert len(assumptions) >= 1, "No assumptions returned"
        assert project["schedule"]["has_cycle"] is False
    finally:
        api.delete(f"{base_url}/api/projects/{pid}", headers=auth_headers, timeout=30)


def test_refine_and_apply(api, base_url, auth_headers, existing_project_id):
    # Refine an existing project to keep runtime reasonable
    r = api.post(
        f"{base_url}/api/projects/{existing_project_id}/refine",
        json={"instruction": "Increase all tender period activity durations by 5 working days."},
        headers=auth_headers,
        timeout=180,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "explanation" in body and len(body["explanation"]) > 5
    assert "changes" in body and isinstance(body["changes"], list)
    # Assert changes are meaningful
    assert len(body["changes"]) >= 1

    # Apply-changes on a duplicate to avoid mutating the seed
    dup = api.post(f"{base_url}/api/projects/{existing_project_id}/duplicate", headers=auth_headers, timeout=30)
    assert dup.status_code == 200
    dup_id = dup.json()["id"]

    apply = api.post(
        f"{base_url}/api/projects/{dup_id}/apply-changes",
        json={"changes": body["changes"]},
        headers=auth_headers,
        timeout=60,
    )
    assert apply.status_code == 200, apply.text
    applied = apply.json()
    assert "activities" in applied and "schedule" in applied
    assert applied["schedule"]["has_cycle"] is False

    api.delete(f"{base_url}/api/projects/{dup_id}", headers=auth_headers, timeout=30)
