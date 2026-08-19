"""Iteration 7 — Stripe payments + Pro paywall tests.

Note: `conftest.ensure_pro_for_test_user` autouse fixture inserts a paid tx
for planner@test.com session-wide so existing regression tests keep working.
Free-user tests below use the `free_user` fixture which removes that doc for
the duration of a single test then restores it.
"""
import os
import time
from datetime import datetime, timezone

import pytest
import requests


# ---------- helpers ----------
@pytest.fixture
def free_user(mongo_db, test_user_id):
    """Temporarily strip Pro access from the test user for a single test."""
    docs = list(mongo_db.payment_transactions.find(
        {"user_id": test_user_id, "payment_status": "paid"}
    ))
    mongo_db.payment_transactions.update_many(
        {"user_id": test_user_id, "payment_status": "paid"},
        {"$set": {"payment_status": "pending", "status": "initiated"}},
    )
    yield test_user_id
    # restore
    for d in docs:
        mongo_db.payment_transactions.update_one(
            {"_id": d["_id"]},
            {"$set": {"payment_status": d.get("payment_status", "paid"),
                       "status": d.get("status", "completed")}},
        )


# ---------- /api/payments/checkout ----------
class TestCheckout:
    def test_checkout_creates_session_and_row(self, api, base_url, auth_headers, mongo_db):
        origin = "https://example.test"
        r = api.post(
            f"{base_url}/api/payments/checkout",
            json={"lookup_key": "pow_pro_monthly", "origin_url": origin},
            headers=auth_headers,
            timeout=45,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "checkout_url" in data and "session_id" in data
        sid = data["session_id"]
        assert sid.startswith("cs_test_"), sid
        assert "checkout.stripe.com" in data["checkout_url"] or "stripe.com" in data["checkout_url"]

        # DB row present with status=initiated / pending
        row = mongo_db.payment_transactions.find_one({"session_id": sid})
        assert row is not None
        assert row["status"] == "initiated"
        assert row["payment_status"] == "pending"
        assert row["lookup_key"] == "pow_pro_monthly"

        # Verify success/cancel URLs on stripe side
        import stripe
        stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
        s = stripe.checkout.Session.retrieve(sid)
        assert f"{origin}/payment/success?session_id=" in s.success_url
        assert s.cancel_url == f"{origin}/payment/cancel"

        # cleanup
        mongo_db.payment_transactions.delete_one({"session_id": sid})


# ---------- /api/payments/status ----------
class TestStatus:
    def test_status_unknown_returns_404(self, api, base_url, auth_headers):
        r = api.get(f"{base_url}/api/payments/status/cs_test_does_not_exist_xyz",
                    headers=auth_headers, timeout=15)
        assert r.status_code == 404

    def test_status_fresh_session_is_pending(self, api, base_url, auth_headers, mongo_db):
        r = api.post(f"{base_url}/api/payments/checkout",
                     json={"lookup_key": "pow_pro_monthly",
                           "origin_url": "https://example.test"},
                     headers=auth_headers, timeout=45)
        assert r.status_code == 200
        sid = r.json()["session_id"]
        try:
            r2 = api.get(f"{base_url}/api/payments/status/{sid}",
                         headers=auth_headers, timeout=15)
            assert r2.status_code == 200
            body = r2.json()
            assert body["session_id"] == sid
            assert body["payment_status"] == "pending"
            assert body["status"] == "initiated"
        finally:
            mongo_db.payment_transactions.delete_one({"session_id": sid})


# ---------- /api/stripe/webhook ----------
class TestWebhook:
    def test_webhook_rejects_missing_signature(self, api, base_url):
        r = api.post(f"{base_url}/api/stripe/webhook",
                     data=b'{"type":"noop"}',
                     headers={"Content-Type": "application/json"}, timeout=15)
        assert r.status_code == 400

    def test_webhook_rejects_bad_signature(self, api, base_url):
        r = api.post(f"{base_url}/api/stripe/webhook",
                     data=b'{"type":"noop"}',
                     headers={"Content-Type": "application/json",
                              "stripe-signature": "t=1,v1=deadbeef"}, timeout=15)
        assert r.status_code == 400


# ---------- /api/billing/plan ----------
class TestBillingPlan:
    def test_plan_free_for_unpaid_user(self, api, base_url, auth_headers, free_user):
        r = api.get(f"{base_url}/api/billing/plan", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        p = r.json()
        assert p["active"] is False
        assert p["plan"] == "free"
        assert p["price"] == {"amount": 2900, "currency": "gbp", "interval": "month"}

    def test_plan_pro_when_paid(self, api, base_url, auth_headers):
        r = api.get(f"{base_url}/api/billing/plan", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        p = r.json()
        assert p["active"] is True
        assert p["plan"] == "pro"


# ---------- /api/billing/invoices ----------
class TestBillingInvoices:
    def test_invoices_empty_when_no_customer(self, api, base_url, auth_headers, mongo_db, test_user_id):
        # ensure the paid tx has no stripe_customer_id
        mongo_db.payment_transactions.update_many(
            {"user_id": test_user_id},
            {"$unset": {"stripe_customer_id": ""}},
        )
        r = api.get(f"{base_url}/api/billing/invoices", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert r.json() == []


# ---------- /api/billing/portal ----------
class TestBillingPortal:
    def test_portal_401_without_token(self, api, base_url):
        r = api.post(f"{base_url}/api/billing/portal",
                     json={"origin_url": "https://x.test"},
                     headers={"Content-Type": "application/json"}, timeout=15)
        assert r.status_code == 401

    def test_portal_404_without_billing_history(self, api, base_url, auth_headers, mongo_db, test_user_id):
        mongo_db.payment_transactions.update_many(
            {"user_id": test_user_id},
            {"$unset": {"stripe_customer_id": ""}},
        )
        r = api.post(f"{base_url}/api/billing/portal",
                     json={"origin_url": "https://x.test"},
                     headers=auth_headers, timeout=15)
        assert r.status_code == 404


# ---------- gating (free vs pro) ----------
class TestGating:
    def test_generate_402_for_free_user(self, api, base_url, auth_headers,
                                        existing_project_id, free_user):
        r = api.post(f"{base_url}/api/projects/{existing_project_id}/generate",
                     headers=auth_headers, timeout=15)
        assert r.status_code == 402, r.text
        detail = r.json().get("detail") or {}
        assert isinstance(detail, dict)
        assert detail.get("code") == "pro_required"
        assert detail.get("feature") == "ai_generation"

    @pytest.mark.parametrize("fmt", ["csv", "json", "xml", "asta", "xer"])
    def test_export_402_for_free_user(self, api, base_url, auth_headers,
                                       existing_project_id, free_user, fmt):
        r = api.get(f"{base_url}/api/projects/{existing_project_id}/export/{fmt}",
                    headers=auth_headers, timeout=30)
        assert r.status_code == 402, f"{fmt}: {r.text}"
        detail = r.json().get("detail") or {}
        assert detail.get("code") == "pro_required"

    @pytest.mark.parametrize("fmt", ["csv", "json", "xml", "asta", "xer"])
    def test_export_200_for_pro_user(self, api, base_url, auth_headers,
                                      existing_project_id, fmt):
        r = api.get(f"{base_url}/api/projects/{existing_project_id}/export/{fmt}",
                    headers=auth_headers, timeout=60)
        assert r.status_code == 200, f"{fmt}: {r.status_code}"
        assert len(r.content) > 100


# ---------- regression: snapshots/versions NOT gated ----------
class TestNoGatingOnSnapshots:
    def test_snapshots_work_for_free_user(self, api, base_url, auth_headers,
                                           existing_project_id, free_user):
        r = api.get(f"{base_url}/api/projects/{existing_project_id}/snapshots",
                    headers=auth_headers, timeout=15)
        assert r.status_code == 200
        r2 = api.get(f"{base_url}/api/projects/{existing_project_id}/versions",
                     headers=auth_headers, timeout=15)
        assert r2.status_code == 200

    def test_snapshot_create_and_compare_for_free_user(self, api, base_url, auth_headers,
                                                        existing_project_id, free_user, mongo_db):
        r = api.post(f"{base_url}/api/projects/{existing_project_id}/snapshots",
                     json={"name": "TEST_iter7_free"}, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        sid = r.json()["id"]
        try:
            rc = api.get(
                f"{base_url}/api/projects/{existing_project_id}/snapshots/{sid}/compare",
                headers=auth_headers, timeout=45,
            )
            assert rc.status_code == 200
            assert "rows" in rc.json()
        finally:
            mongo_db.versions.delete_one({"id": sid})
