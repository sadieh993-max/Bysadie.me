import logging
from datetime import datetime

from sqlalchemy.orm import Session

from database import models
from events.schemas import AffiliateClickIn, CheckoutEventIn, FunnelEventIn

logger = logging.getLogger(__name__)


def ingest_affiliate_click(db: Session, event: AffiliateClickIn) -> models.AffiliateClick:
    session = db.query(models.Session).filter_by(session_key=event.session_key).one_or_none()
    if session is None:
        session = models.Session(session_key=event.session_key)
        db.add(session)
        db.flush()

    click = models.AffiliateClick(
        session_id=session.id,
        affiliate_id=event.affiliate_id,
        source=event.source,
        campaign=event.campaign,
        clicked_at=event.clicked_at or datetime.utcnow(),
    )
    db.add(click)
    db.commit()
    db.refresh(click)
    logger.info("affiliate_click_ingested", extra={"click_id": click.id, "affiliate_id": click.affiliate_id})
    return click


def ingest_checkout_event(db: Session, event: CheckoutEventIn) -> models.Order:
    user = db.query(models.User).filter_by(email=event.email).one_or_none()
    if user is None:
        user = models.User(email=event.email)
        db.add(user)
        db.flush()

    order = models.Order(
        user_id=user.id,
        order_number=event.order_number,
        total_amount=event.amount,
        created_at=event.occurred_at or datetime.utcnow(),
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    logger.info("checkout_event_ingested", extra={"order_id": order.id, "user_id": user.id})
    return order


def ingest_funnel_event(db: Session, event: FunnelEventIn) -> models.Touchpoint:
    session = db.query(models.Session).filter_by(session_key=event.session_key).one_or_none()
    if session is None:
        session = models.Session(session_key=event.session_key)
        db.add(session)
        db.flush()

    touchpoint = models.Touchpoint(
        user_id=session.user_id,
        channel=event.channel,
        reference_id=event.reference_id,
        occurred_at=event.occurred_at or datetime.utcnow(),
    )
    db.add(touchpoint)
    db.commit()
    db.refresh(touchpoint)
    logger.info("funnel_event_ingested", extra={"touchpoint_id": touchpoint.id, "channel": touchpoint.channel})
    return touchpoint
