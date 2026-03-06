from fastapi import FastAPI

from api.config import get_settings
from api.logging import configure_logging
from api.routes.events import router as events_router
from api.routes.health import router as health_router
from api.routes.identity import router as identity_router

settings = get_settings()
configure_logging(settings.log_level)

app = FastAPI(title=settings.app_name)
app.include_router(health_router)
app.include_router(events_router)
app.include_router(identity_router)
