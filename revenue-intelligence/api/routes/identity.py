from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database.session import get_db
from identity.service import stitch_identity

router = APIRouter(prefix="/identity", tags=["identity"])


class IdentityStitchIn(BaseModel):
    email: str
    session_key: str


@router.post("/stitch")
def stitch(payload: IdentityStitchIn, db: Session = Depends(get_db)) -> dict:
    try:
        user = stitch_identity(db, email=payload.email, session_key=payload.session_key)
        return {"status": "ok", "user_id": user.id}
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Failed to stitch identity") from exc
