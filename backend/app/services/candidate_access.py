import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import Session

LEASE_SECONDS = 30


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_candidate_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    return token, hash_candidate_token(token)


def hash_candidate_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def authorize_candidate_access(
    session: Session,
    db: AsyncSession,
    session_token: str | None,
    client_id: str | None,
) -> None:
    if session.status != "active":
        return

    if not client_id:
        raise HTTPException(status_code=403, detail="Invalid or expired interview link")

    if session.candidate_access_token_hash:
        if not session_token:
            raise HTTPException(status_code=403, detail="Invalid or expired interview link")
        token_hash = hash_candidate_token(session_token)
        if not hmac.compare_digest(token_hash, session.candidate_access_token_hash):
            raise HTTPException(status_code=403, detail="Invalid or expired interview link")

    now = utc_now()
    if (
        session.active_client_id
        and session.active_client_id != client_id
        and session.client_lease_expires_at
        and session.client_lease_expires_at > now
    ):
        raise HTTPException(
            status_code=409,
            detail="This interview session is already open in another tab or browser.",
        )

    session.active_client_id = client_id
    session.client_lease_expires_at = now + timedelta(seconds=LEASE_SECONDS)
    db.add(session)
