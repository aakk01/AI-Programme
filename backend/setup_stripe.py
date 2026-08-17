"""Idempotent Stripe catalog bootstrap for Programme of Works.

Run once (and safe to re-run) to create/update the Pro subscription product.
"""
import os

import stripe
from dotenv import load_dotenv

load_dotenv()
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]

CATALOG = [
    {
        "emergent_product_id": "pow_pro",
        "name": "Programme of Works — Pro",
        "tax_code": "txcd_10103001",  # SaaS
        "prices": [
            {
                "lookup_key": "pow_pro_monthly",
                "amount": 2900,  # £29.00
                "currency": "gbp",
                "interval": "month",
            },
        ],
    },
]


def get_or_create_product(entry):
    for p in stripe.Product.list(active=True, limit=100).auto_paging_iter():
        if (p.to_dict().get("metadata") or {}).get("emergent_product_id") == entry["emergent_product_id"]:
            return p
    return stripe.Product.create(
        name=entry["name"],
        tax_code=entry.get("tax_code"),
        metadata={"managed_by": "emergent", "emergent_product_id": entry["emergent_product_id"]},
    )


def ensure_price(product, p):
    existing = stripe.Price.list(lookup_keys=[p["lookup_key"]], active=True, limit=1).data
    if existing and (
        existing[0].unit_amount != p["amount"] or existing[0].currency != p["currency"]
    ):
        stripe.Price.modify(existing[0].id, active=False)
        existing = []
    if existing:
        return existing[0]
    kwargs = dict(
        product=product.id,
        unit_amount=p["amount"],
        currency=p["currency"],
        lookup_key=p["lookup_key"],
        transfer_lookup_key=True,
    )
    if p.get("interval"):
        kwargs["recurring"] = {"interval": p["interval"]}
    return stripe.Price.create(**kwargs)


def main():
    for entry in CATALOG:
        product = get_or_create_product(entry)
        for p in entry["prices"]:
            price = ensure_price(product, p)
            print(
                f"[OK] {entry['name']} · {p['lookup_key']} · "
                f"{price.unit_amount / 100:.2f} {price.currency.upper()}/{p.get('interval', 'once')}"
            )


if __name__ == "__main__":
    main()
