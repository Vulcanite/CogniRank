import secrets

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import settings
from app.schemas import AdminLoginRequest, AdminLoginResponse
from app.services.auth import create_admin_token, require_admin

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=AdminLoginResponse)
async def login(payload: AdminLoginRequest) -> AdminLoginResponse:
    username_ok = secrets.compare_digest(payload.username, settings.admin_username)
    password_ok = secrets.compare_digest(payload.password, settings.admin_password)
    if not username_ok or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials",
        )

    token, expires_at = create_admin_token(payload.username)
    return AdminLoginResponse(
        access_token=token,
        expires_at=expires_at,
        username=payload.username,
    )


@router.post("/refresh", response_model=AdminLoginResponse)
async def refresh(username: str = Depends(require_admin)) -> AdminLoginResponse:
    token, expires_at = create_admin_token(username)
    return AdminLoginResponse(
        access_token=token,
        expires_at=expires_at,
        username=username,
    )
