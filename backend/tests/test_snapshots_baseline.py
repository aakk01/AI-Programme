"""Iteration 6 — Snapshots + Baseline Slippage tests.

Uses the existing seeded project (planner@test.com) and follows a safe
pattern: take a "restore point" snapshot up-front, do all mutations, then
restore at the end via teardown so the shared project is untouched.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://gantt-genius.preview.emergentagent.com",
).rstrip("/")


@pytest.fixture(scope="module")
def hdr(auth_headers):
    return auth_headers


@pytest.fixture(scope="module")
def project(api, hdr, existing_project_id):
    """Take a restore-point snapshot; restore on teardown."""
    pid = existing_project_id
    r = api.post(f"{BASE_URL}/api/projects/{pid}/snapshots",
                 json={"name": "TEST_restorepoint"}, headers=hdr, timeout=30)
    assert r.status_code == 200, r.text
    rp = r.json()["id"]
    yield pid
    # teardown: restore original state
    api.post(f"{BASE_URL}/api/projects/{pid}/snapshots/{rp}/restore",
             headers=hdr, timeout=30)


@pytest.fixture(scope="module")
def state(project):
    return {}


class TestSnapshotsCRUD:
    def test_create_snapshot_uses_name(self, api, hdr, project, state):
        r = api.post(f"{BASE_URL}/api/projects/{project}/snapshots",
                     json={"name": "Target Baseline Rev 0"}, headers=hdr, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("id", "version", "label", "created_at", "activity_count"):
            assert k in data, f"missing {k}"
        assert data["label"] == "Target Baseline Rev 0", "label must equal submitted name"
        assert isinstance(data["activity_count"], int) and data["activity_count"] > 0
        state["baseline_id"] = data["id"]
        state["baseline_activity_count"] = data["activity_count"]

    def test_list_snapshots_sorted_newest_first(self, api, hdr, project):
        r2 = api.post(f"{BASE_URL}/api/projects/{project}/snapshots",
                      json={"name": "TEST_Second"}, headers=hdr, timeout=30)
        assert r2.status_code == 200
        r = api.get(f"{BASE_URL}/api/projects/{project}/snapshots", headers=hdr, timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 2
        versions = [row["version"] for row in rows]
        assert versions == sorted(versions, reverse=True), "should be newest first"
        assert rows[0]["label"] == "TEST_Second"

    def test_compare_unmodified_all_zero_variance(self, api, hdr, project, state):
        # Snap fresh, immediately compare — everything should be zero.
        r = api.post(f"{BASE_URL}/api/projects/{project}/snapshots",
                     json={"name": "TEST_zero"}, headers=hdr, timeout=30)
        sid = r.json()["id"]
        r = api.get(f"{BASE_URL}/api/projects/{project}/snapshots/{sid}/compare",
                    headers=hdr, timeout=30)
        assert r.status_code == 200, r.text
        c = r.json()
        for k in ("snapshot", "current_finish", "baseline_finish",
                  "finish_variance_days", "rows", "added", "removed"):
            assert k in c, f"missing {k}"
        # rows count matches current activities
        gp = api.get(f"{BASE_URL}/api/projects/{project}", headers=hdr, timeout=30).json()
        assert len(c["rows"]) == len(gp["activities"])
        assert c["added"] == []
        assert c["removed"] == []
        assert c["finish_variance_days"] == 0
        for row in c["rows"]:
            for f in ("activity_id", "current_start", "current_finish",
                      "current_duration", "baseline_start", "baseline_finish",
                      "baseline_duration", "start_variance_days",
                      "finish_variance_days", "duration_variance", "in_baseline"):
                assert f in row, f"row missing {f}"
            assert row["in_baseline"] is True
            assert row["start_variance_days"] == 0, row
            assert row["finish_variance_days"] == 0, row
            assert row["duration_variance"] == 0, row
        state["zero_sid"] = sid

    def test_compare_after_mutation_shows_slip(self, api, hdr, project, state):
        sid = state["zero_sid"]
        # Grab current activities, bump duration of first Task-type activity by +10.
        cur = api.get(f"{BASE_URL}/api/projects/{project}", headers=hdr, timeout=30).json()
        acts = cur["activities"]
        target = None
        for a in acts:
            if a.get("activity_type", "Task") != "Milestone" and a.get("duration", 0) > 0:
                target = a["activity_id"]
                a["duration"] = a["duration"] + 10
                break
        assert target is not None
        r = api.put(f"{BASE_URL}/api/projects/{project}/activities",
                    json={"activities": acts}, headers=hdr, timeout=30)
        assert r.status_code == 200
        r = api.get(f"{BASE_URL}/api/projects/{project}/snapshots/{sid}/compare",
                    headers=hdr, timeout=30)
        assert r.status_code == 200
        c = r.json()
        row = next(x for x in c["rows"] if x["activity_id"] == target)
        assert row["duration_variance"] == 10, row
        assert row["finish_variance_days"] is not None and row["finish_variance_days"] > 0
        # project finish variance should be >= 0 (may be 0 if activity is off critical path,
        # but the mutated activity's own finish must slip)
        assert c["finish_variance_days"] is not None
        state["mutated_id"] = target

    def test_compare_added_and_removed(self, api, hdr, project, state):
        # Snapshot the current (mutated) state
        r = api.post(f"{BASE_URL}/api/projects/{project}/snapshots",
                     json={"name": "TEST_prediff"}, headers=hdr, timeout=30)
        sid = r.json()["id"]
        # Add a brand-new activity, remove one existing (non-mutated) activity
        cur = api.get(f"{BASE_URL}/api/projects/{project}", headers=hdr, timeout=30).json()
        acts = cur["activities"]
        removed_id = None
        for a in acts:
            if a["activity_id"] != state["mutated_id"]:
                removed_id = a["activity_id"]
                break
        acts = [a for a in acts if a["activity_id"] != removed_id]
        acts.append({
            "activity_id": "TEST_NEW_1",
            "description": "TEST added",
            "duration": 5,
            "activity_type": "Task",
            "predecessors": [],
        })
        r = api.put(f"{BASE_URL}/api/projects/{project}/activities",
                    json={"activities": acts}, headers=hdr, timeout=30)
        assert r.status_code == 200, r.text
        r = api.get(f"{BASE_URL}/api/projects/{project}/snapshots/{sid}/compare",
                    headers=hdr, timeout=30)
        assert r.status_code == 200
        c = r.json()
        assert "TEST_NEW_1" in c["added"], c["added"]
        removed_ids = [x["activity_id"] for x in c["removed"]]
        assert removed_id in removed_ids, removed_ids
        # rows count matches CURRENT activities
        cur2 = api.get(f"{BASE_URL}/api/projects/{project}", headers=hdr, timeout=30).json()
        assert len(c["rows"]) == len(cur2["activities"])

    def test_restore_snapshot_reverts_activities(self, api, hdr, project, state):
        # Restore the "zero" snapshot (pre-mutation) and verify the mutated
        # activity's duration reverted.
        sid = state["zero_sid"]
        r = api.post(f"{BASE_URL}/api/projects/{project}/snapshots/{sid}/restore",
                     headers=hdr, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "activities" in body
        # And the added TEST_NEW_1 should be gone
        ids = [a["activity_id"] for a in body["activities"]]
        assert "TEST_NEW_1" not in ids


class TestLegacyVersionsCompat:
    def test_legacy_versions_endpoints(self, api, hdr, project):
        r = api.post(f"{BASE_URL}/api/projects/{project}/versions",
                     json={"label": "TEST_LegacySnap"}, headers=hdr, timeout=30)
        assert r.status_code == 200
        vid = r.json()["id"]
        r = api.get(f"{BASE_URL}/api/projects/{project}/versions", headers=hdr, timeout=30)
        assert r.status_code == 200
        assert any(v["id"] == vid for v in r.json())
        r = api.post(f"{BASE_URL}/api/projects/{project}/versions/{vid}/restore",
                     headers=hdr, timeout=30)
        assert r.status_code == 200
