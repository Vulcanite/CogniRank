import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

bearer_scheme = HTTPBearer(auto_error=False)


def _b64_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64_decode(value: str) -> bytes:
    padded = value + ("=" * (-len(value) % 4))
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _sign(payload: str) -> str:
    digest = hmac.new(
        settings.admin_secret_key.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return _b64_encode(digest)


def create_admin_token(username: str) -> tuple[str, datetime]:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.admin_token_ttl_minutes)
    payload = {
        "sub": username,
        "exp": int(expires_at.timestamp()),
        "nonce": secrets.token_urlsafe(12),
    }
    encoded_payload = _b64_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return f"{encoded_payload}.{_sign(encoded_payload)}", expires_at


def verify_admin_token(token: str) -> str:
    try:
        encoded_payload, signature = token.split(".", 1)
        expected_signature = _sign(encoded_payload)
        if not hmac.compare_digest(signature, expected_signature):
            raise ValueError("Invalid signature")

        payload = json.loads(_b64_decode(encoded_payload))
        expires_at = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            raise ValueError("Token expired")

        username = str(payload["sub"])
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired admin token",
        ) from exc

    if username != settings.admin_username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin token",
        )
    return username


async def require_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication required",
        )
    return verify_admin_token(credentials.credentials)
