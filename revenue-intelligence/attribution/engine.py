from datetime import datetime
from math import exp


def first_touch(touchpoints: list[dict], order_value: float) -> list[dict]:
    if not touchpoints:
        return []
    return [{"touchpoint_id": touchpoints[0]["id"], "credit": round(order_value, 2)}]


def last_touch(touchpoints: list[dict], order_value: float) -> list[dict]:
    if not touchpoints:
        return []
    return [{"touchpoint_id": touchpoints[-1]["id"], "credit": round(order_value, 2)}]


def time_decay(touchpoints: list[dict], order_value: float, half_life_days: float = 7.0) -> list[dict]:
    if not touchpoints:
        return []

    order_time = max(tp["occurred_at"] for tp in touchpoints)
    weights = []
    for tp in touchpoints:
        age_days = max((order_time - tp["occurred_at"]).total_seconds() / 86400.0, 0)
        weights.append(exp(-age_days / half_life_days))

    total_weight = sum(weights) or 1.0
    return [
        {"touchpoint_id": tp["id"], "credit": round(order_value * (weight / total_weight), 2)}
        for tp, weight in zip(touchpoints, weights, strict=False)
    ]


def multi_touch_proportional(touchpoints: list[dict], order_value: float) -> list[dict]:
    if not touchpoints:
        return []

    per_touch = order_value / len(touchpoints)
    return [{"touchpoint_id": tp["id"], "credit": round(per_touch, 2)} for tp in touchpoints]


def serialize_touchpoints(rows: list[object]) -> list[dict]:
    return [
        {
            "id": row.id,
            "occurred_at": row.occurred_at if isinstance(row.occurred_at, datetime) else datetime.utcnow(),
        }
        for row in rows
    ]
