from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class AffiliateClickIn(BaseModel):
    session_key: str = Field(min_length=3)
    affiliate_id: str
    source: str
    campaign: str | None = None
    clicked_at: datetime | None = None


class CheckoutEventIn(BaseModel):
    email: str
    order_number: str
    amount: Decimal
    occurred_at: datetime | None = None


class FunnelEventIn(BaseModel):
    session_key: str
    channel: str
    reference_id: str
    occurred_at: datetime | None = None
