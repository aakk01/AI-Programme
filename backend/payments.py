"""Stripe payments module with hosted checkout and test-mode fallback."""
import logging
import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
import stripe

from auth import get_current_user_id

logger = logging.getLogger(__name__)
router = APIRouter(tags=["payments"])

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
stripe.api_key = STRIPE_SECRET_KEY

# Connect to database directly for standalone subscription checks
_client = AsyncIOMotorClient(os.getenv("MONGO_URL", "mongodb://localhost:27017"))
_db = _client[os.getenv("DB_NAME", "pow_generator")]


class CheckoutRequest(BaseModel):
    price_id: str = "price_pro_monthly"
    plan: str = "monthly"


async def user_has_active_subscription(user_id: str) -> bool:
    """Development bypass: Grant unlimited Pro access to all users during testing."""
    return True


@router.get("/api/payments/status")
@router.get("/api/billing/status")
async def subscription_status(user_id: str = Depends(get_current_user_id)):
    """Fetch current user's subscription and pro access status."""
    is_pro = await user_has_active_subscription(user_id)
    user = await _db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return {
        "is_pro": is_pro,
        "subscription_status": user.get("subscription_status", "free") if user else "free",
        "plan": user.get("subscription_plan", "free") if user else "free",
    }


# Match both /api/payments and /api/billing routes
@router.post("/api/payments/create-checkout-session")
@router.post("/api/billing/create-checkout-session")
@router.post("/api/payments/checkout")
@router.post("/api/billing/checkout")
async def create_checkout_session(
    body: CheckoutRequest = None, user_id: str = Depends(get_current_user_id)
):
    """Generate a Stripe Hosted Checkout URL or return a successful dev redirect."""
    user = await _db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # If no live Stripe key is configured, instantly upgrade user in DB and redirect
    if not STRIPE_SECRET_KEY or STRIPE_SECRET_KEY.startswith("sk_test_mock"):
        await _db.users.update_one(
            {"id": user_id},
            {"$set": {"subscription_status": "active", "subscription_plan": "pro_monthly"}},
        )
        return {
            "url": f"{FRONTEND_URL}/dashboard?payment=success",
            "checkout_url": f"{FRONTEND_URL}/dashboard?payment=success",
        }

    try:
        session = stripe.checkout.Session.create(
            customer_email=user["email"],
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": "gbp",
                        "product_data": {
                            "name": "Planner Pro Subscription",
                            "description": "Unlimited AI Generation, Refinement & Scheduling Exports",
                        },
                        "unit_amount": 2900,  # £29.00 / month
                        "recurring": {"interval": "month"},
                    },
                    "quantity": 1,
                }
            ],
            mode="subscription",
            success_url=f"{FRONTEND_URL}/dashboard?payment=success&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{FRONTEND_URL}/dashboard?payment=cancelled",
            metadata={"user_id": user_id},
        )
        return {"url": session.url, "checkout_url": session.url}
    except Exception as e:
        logger.exception("Stripe checkout session creation failed")
        raise HTTPException(status_code=400, detail=str(e))