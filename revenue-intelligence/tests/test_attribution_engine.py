from datetime import datetime, timedelta

from attribution.engine import first_touch, last_touch, multi_touch_proportional, time_decay


def sample_touchpoints():
    now = datetime.utcnow()
    return [
        {"id": 1, "occurred_at": now - timedelta(days=10)},
        {"id": 2, "occurred_at": now - timedelta(days=2)},
        {"id": 3, "occurred_at": now},
    ]


def test_first_touch():
    result = first_touch(sample_touchpoints(), 120.0)
    assert result == [{"touchpoint_id": 1, "credit": 120.0}]


def test_last_touch():
    result = last_touch(sample_touchpoints(), 120.0)
    assert result == [{"touchpoint_id": 3, "credit": 120.0}]


def test_multi_touch_proportional():
    result = multi_touch_proportional(sample_touchpoints(), 120.0)
    assert len(result) == 3
    assert sum(item["credit"] for item in result) == 120.0


def test_time_decay_gives_more_weight_to_recent_touchpoints():
    result = time_decay(sample_touchpoints(), 120.0)
    by_id = {item["touchpoint_id"]: item["credit"] for item in result}
    assert by_id[3] > by_id[2] > by_id[1]
