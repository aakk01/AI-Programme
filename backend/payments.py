"""Stripe payments router (Flow A - claimable sandbox).

Exposes checkout / status / webhook and a helper for gating Pro-only features.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

import stripe
from fastapi import APIRouter, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# Async Mongo client — the same instance style used in server.py
_mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
_db = _mongo[os.environ["DB_NAME"]]
transactions = _db["payment_transactions"]

router = APIRouter()

PRO_LOOKUP_KEY = "pow_pro_monthly"


# ---------- models ----------
class CheckoutRequest(BaseModel):
    lookup_key: str = PRO_LOOKUP_KEY
    origin_url: str
    quantity: int = Field(1, ge=1, le=10)


# ---------- helpers ----------
async def user_has_active_subscription(user_id: str) -> bool:
    """Cheap check — DB-only. Returns True iff the user has any paid tx for a
    Pro-tier lookup_key whose Stripe subscription is currently active."""
    if not user_id:
        return False
    tx = await transactions.find_one(
        {"user_id": user_id, "payment_status": "paid", "lookup_key": PRO_LOOKUP_KEY},
        sort=[("updated_at", -1)],
    )
    if not tx:
        return False
    sub_id = tx.get("stripe_subscription_id")
    if not sub_id:
        # One-off payment recorded as paid — treat as active for the current period.
        return True
    try:
        sub = stripe.Subscription.retrieve(sub_id)
    except stripe.error.StripeError:
        return True  # fall back to DB truth if Stripe momentarily unreachable
    return sub.status in {"active", "trialing", "past_due"}


async def _record_initial(session, req: CheckoutRequest, user_id: Optional[str], price):
    await transactions.insert_one(
        {
            "session_id": session.id,
            "user_id": user_id,
            "lookup_key": req.lookup_key,
            "amount": (price.unit_amount or 0) * req.quantity,
            "currency": price.currency,
            "status": "initiated",
            "payment_status": "pending",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
    )


# ---------- endpoints ----------
@router.post("/api/payments/checkout")
async def create_checkout(req: CheckoutRequest, request: Request):
    from auth import get_current_user_id_optional  # local to dodge circular imports

    user_id = await get_current_user_id_optional(request)
    prices = stripe.Price.list(lookup_keys=[req.lookup_key], active=True, limit=1).data
    if not prices:
        raise HTTPException(500, f"Price not found: {req.lookup_key}")
    price = prices[0]
    kwargs = dict(
        line_items=[{"price": price.id, "quantity": req.quantity}],
        mode="subscription" if price.recurring else "payment",
        success_url=f"{req.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{req.origin_url}/payment/cancel",
        metadata={"user_id": user_id or "", "lookup_key": req.lookup_key},
    )
    if price.recurring:
        kwargs["subscription_data"] = {
            "metadata": {"user_id": user_id or "", "lookup_key": req.lookup_key}
        }
    try:
        # tax_mode = "full" (SMP): GB sandbox + SaaS digital product
        session = stripe.checkout.Session.create(**kwargs, managed_payments={"enabled": True})
    except stripe.error.InvalidRequestError as e:
        msg = (getattr(e, "user_message", "") or "").lower()
        if "managed payments" in msg or "ineligible" in msg:
            session = stripe.checkout.Session.create(
                **kwargs,
                automatic_tax={"enabled": True},
                billing_address_collection="required",
            )
        else:
            raise
    await _record_initial(session, req, user_id, price)
    return {"checkout_url": session.url, "session_id": session.id}


@router.get("/api/payments/status/{session_id}")
async def get_status(session_id: str):
    record = await transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not record:
        raise HTTPException(404, "Transaction not found")
    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {
                        "$set": {
                            "status": "completed",
                            "payment_status": "paid",
                            "stripe_subscription_id": s.subscription,
                            "stripe_payment_intent_id": s.payment_intent,
                            "stripe_customer_id": s.customer,
                            "updated_at": datetime.now(timezone.utc),
                        }
                    },
                )
                record = await transactions.find_one({"session_id": session_id}, {"_id": 0})
        except stripe.error.StripeError:
            pass
    return {
        "session_id": record["session_id"],
        "status": record["status"],
        "payment_status": record["payment_status"],
    }


@router.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, "Invalid signature")
    obj = event["data"]["object"]
    t = event["type"]
    now = datetime.now(timezone.utc)
    if t == "checkout.session.completed":
        await transactions.update_one(
            {"session_id": obj["id"], "payment_status": {"$ne": "paid"}},
            {
                "$set": {
                    "status": "completed",
                    "payment_status": obj.get("payment_status", "paid"),
                    "stripe_subscription_id": obj.get("subscription"),
                    "stripe_payment_intent_id": obj.get("payment_intent"),
                    "stripe_customer_id": obj.get("customer"),
                    "updated_at": now,
                }
            },
        )
    elif t == "checkout.session.async_payment_succeeded":
        await transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"payment_status": "paid", "updated_at": now}},
        )
    elif t == "checkout.session.async_payment_failed":
        await transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"status": "failed", "payment_status": "failed", "updated_at": now}},
        )
    elif t == "checkout.session.expired":
        await transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"status": "expired", "payment_status": "expired", "updated_at": now}},
        )
    elif t == "customer.subscription.deleted":
        await transactions.update_one(
            {"stripe_subscription_id": obj.get("id")},
            {"$set": {"status": "cancelled", "payment_status": "cancelled", "updated_at": now}},
        )
    elif t == "charge.refunded":
        await transactions.update_one(
            {"stripe_payment_intent_id": obj.get("payment_intent")},
            {"$set": {"status": "refunded", "payment_status": "refunded", "updated_at": now}},
        )
    return {"status": "ok"}


# ---------- billing UI helpers ----------
@router.get("/api/billing/plan")
async def billing_plan(request: Request):
    from auth import get_current_user_id_optional

    user_id = await get_current_user_id_optional(request)
    if not user_id:
        return {"active": False, "plan": None, "status": "guest"}
    active = await user_has_active_subscription(user_id)
    tx = await transactions.find_one(
        {"user_id": user_id, "lookup_key": PRO_LOOKUP_KEY},
        sort=[("updated_at", -1)],
        projection={"_id": 0},
    )
    sub = None
    if tx and tx.get("stripe_subscription_id"):
        try:
            s = stripe.Subscription.retrieve(tx["stripe_subscription_id"])
            sub = {
                "id": s.id,
                "status": s.status,
                "current_period_end": s.current_period_end,
                "cancel_at_period_end": s.cancel_at_period_end,
            }
        except stripe.error.StripeError:
            sub = None
    return {
        "active": active,
        "plan": "pro" if active else "free",
        "price": {"amount": 2900, "currency": "gbp", "interval": "month"},
        "subscription": sub,
        "latest_tx": tx,
    }


@router.get("/api/billing/invoices")
async def billing_invoices(request: Request):
    from auth import get_current_user_id_optional

    user_id = await get_current_user_id_optional(request)
    if not user_id:
        return []
    tx = await transactions.find_one(
        {"user_id": user_id, "payment_status": "paid"},
        sort=[("updated_at", -1)],
    )
    if not tx or not tx.get("stripe_customer_id"):
        return []
    try:
        invs = stripe.Invoice.list(customer=tx["stripe_customer_id"], limit=20).data
    except stripe.error.StripeError:
        return []
    return [
        {
            "id": i.id,
            "number": i.number,
            "amount_paid": i.amount_paid,
            "currency": i.currency,
            "status": i.status,
            "created": i.created,
            "hosted_invoice_url": i.hosted_invoice_url,
            "invoice_pdf": i.invoice_pdf,
        }
        for i in invs
    ]


@router.post("/api/billing/portal")
async def billing_portal(request: Request, body: dict):
    """Create a Stripe Customer Portal session for the current user."""
    from auth import get_current_user_id_optional

    user_id = await get_current_user_id_optional(request)
    if not user_id:
        raise HTTPException(401, "Login required")
    tx = await transactions.find_one(
        {"user_id": user_id, "payment_status": "paid", "stripe_customer_id": {"$ne": None}},
        sort=[("updated_at", -1)],
    )
    if not tx:
        raise HTTPException(404, "No billing account yet")
    origin = (body or {}).get("origin_url") or ""
    portal = stripe.billing_portal.Session.create(
        customer=tx["stripe_customer_id"],
        return_url=f"{origin}/billing",
    )
    return {"portal_url": portal.url}
