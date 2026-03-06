import json
import logging

from sqlalchemy.orm import Session

from attribution.engine import first_touch, last_touch, multi_touch_proportional, serialize_touchpoints, time_decay
from database import models
from database.session import SessionLocal
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)

MODEL_REGISTRY = {
    "first_touch": first_touch,
    "last_touch": last_touch,
    "time_decay": time_decay,
    "multi_touch_proportional": multi_touch_proportional,
}


@celery_app.task(name="workers.tasks.compute_attribution")
def compute_attribution(order_id: int) -> dict:
    db: Session = SessionLocal()
    try:
        order = db.query(models.Order).filter_by(id=order_id).one_or_none()
        if order is None:
            logger.warning("order_not_found", extra={"order_id": order_id})
            return {"status": "not_found", "order_id": order_id}

        touchpoints = (
            db.query(models.Touchpoint)
            .filter_by(user_id=order.user_id)
            .order_by(models.Touchpoint.occurred_at.asc())
            .all()
        )
        serialized = serialize_touchpoints(touchpoints)

        for model_name, model_fn in MODEL_REGISTRY.items():
            output = model_fn(serialized, float(order.total_amount))
            result = models.AttributionResult(order_id=order.id, model=model_name, payload=json.dumps(output))
            db.add(result)

        db.commit()
        return {"status": "ok", "order_id": order.id, "models": list(MODEL_REGISTRY.keys())}
    except Exception:
        db.rollback()
        logger.exception("compute_attribution_failed", extra={"order_id": order_id})
        raise
    finally:
        db.close()
