from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database.session import get_db
from events.schemas import AffiliateClickIn, CheckoutEventIn, FunnelEventIn
from events.service import ingest_affiliate_click, ingest_checkout_event, ingest_funnel_event
from workers.tasks.attribution_tasks import compute_attribution

router = APIRouter(prefix="/events", tags=["events"])


@router.post("/affiliate-click")
def post_affiliate_click(payload: AffiliateClickIn, db: Session = Depends(get_db)) -> dict:
    try:
        click = ingest_affiliate_click(db, payload)
        return {"status": "ok", "click_id": click.id}
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Failed to ingest affiliate click") from exc


@router.post("/checkout")
def post_checkout(payload: CheckoutEventIn, db: Session = Depends(get_db)) -> dict:
    try:
        order = ingest_checkout_event(db, payload)
        compute_attribution.delay(order.id)
        return {"status": "ok", "order_id": order.id}
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Failed to ingest checkout event") from exc


@router.post("/funnel")
def post_funnel_event(payload: FunnelEventIn, db: Session = Depends(get_db)) -> dict:
    try:
        touchpoint = ingest_funnel_event(db, payload)
        return {"status": "ok", "touchpoint_id": touchpoint.id}
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Failed to ingest funnel event") from exc
