import logging

from sqlalchemy.orm import Session

from database import models

logger = logging.getLogger(__name__)


def stitch_identity(db: Session, *, email: str, session_key: str) -> models.User:
    user = db.query(models.User).filter_by(email=email).one_or_none()
    if user is None:
        user = models.User(email=email)
        db.add(user)
        db.flush()

    session = db.query(models.Session).filter_by(session_key=session_key).one_or_none()
    if session is None:
        session = models.Session(session_key=session_key, user_id=user.id)
        db.add(session)
    else:
        session.user_id = user.id

    db.commit()
    logger.info("identity_stitched", extra={"user_id": user.id, "session_key": session_key})
    return user
