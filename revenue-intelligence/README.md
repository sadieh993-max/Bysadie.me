# Revenue Intelligence Platform

Production-oriented backend foundation for affiliate attribution and lifetime value analytics.

## Project structure

```
/revenue-intelligence
  /api
  /events
  /identity
  /attribution
  /workers
  /database
  /scripts
  /infra
  /docs
  /tests
```

## Quick start

```bash
cd revenue-intelligence
./scripts/bootstrap.sh
source .venv/bin/activate
docker compose -f infra/docker-compose.yml up -d
alembic upgrade head
pytest
```

## Services implemented
- Event Tracking API (`/events/affiliate-click`, `/events/checkout`, `/events/funnel`)
- Identity Graph API (`/identity/stitch`)
- LTV Attribution Engine (first-touch, last-touch, time-decay, multi-touch proportional)
- Celery analytics worker for async attribution calculations
- PostgreSQL schema with Alembic initial migration
