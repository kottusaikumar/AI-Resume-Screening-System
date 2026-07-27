"""Password authentication and short-lived signed access tokens."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import secrets
from typing import Literal

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash

from app.core import config, storage

Role = Literal["admin", "recruiter", "reviewer"]
_password_hash = PasswordHash.recommended()
_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str
    role: Role
    organization_id: str


def hash_password(password: str) -> str:
    if len(password) < 12:
        raise ValueError("Password must be at least 12 characters.")
    return _password_hash.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    return _password_hash.verify(password, encoded)


def issue_access_token(user: dict) -> tuple[str, int]:
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=config.ACCESS_TOKEN_MINUTES)
    payload = {
        "sub": user["id"],
        "org": user["organization_id"],
        "role": user["role"],
        "email": user["email"],
        "iss": config.AUTH_ISSUER,
        "iat": now,
        "exp": expires,
    }
    token = jwt.encode(payload, config.AUTH_SECRET, algorithm="HS256")
    return token, int((expires - now).total_seconds())


def authenticate(email: str, password: str) -> dict | None:
    user = storage.get_user_by_email(email.strip().lower())
    if not user or not user["is_active"]:
        return None
    if not verify_password(password, user["password_hash"]):
        return None
    return user


def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> CurrentUser:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized
    try:
        payload = jwt.decode(
            credentials.credentials,
            config.AUTH_SECRET,
            algorithms=["HS256"],
            issuer=config.AUTH_ISSUER,
            options={"require": ["exp", "iat", "iss", "sub", "org", "role"]},
        )
    except jwt.PyJWTError:
        raise unauthorized

    user = storage.get_user(payload["sub"])
    if not user or not user["is_active"] or user["organization_id"] != payload["org"]:
        raise unauthorized
    return CurrentUser(
        id=user["id"],
        email=user["email"],
        role=user["role"],
        organization_id=user["organization_id"],
    )


def require_admin(user: CurrentUser = Depends(require_user)) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required.")
    return user


def require_recruiter(user: CurrentUser = Depends(require_user)) -> CurrentUser:
    if user.role not in {"admin", "recruiter"}:
        raise HTTPException(status_code=403, detail="Recruiter access required.")
    return user


def ensure_bootstrap_admin() -> None:
    if storage.get_user_by_email(config.BOOTSTRAP_ADMIN_EMAIL):
        return
    organization_id = storage.create_organization(config.BOOTSTRAP_ORG_NAME)
    storage.create_user(
        email=config.BOOTSTRAP_ADMIN_EMAIL,
        password_hash=hash_password(config.BOOTSTRAP_ADMIN_PASSWORD),
        role="admin",
        organization_id=organization_id,
    )
    storage.assign_unowned_records(organization_id)
    config.logger.warning(
        "Created bootstrap administrator %s. Change BOOTSTRAP_ADMIN_PASSWORD before public deployment.",
        config.BOOTSTRAP_ADMIN_EMAIL,
    )


def ensure_showcase_user() -> dict:
    """Create or return the limited recruiter identity used by public showcases."""
    existing = storage.get_user_by_email(config.SHOWCASE_USER_EMAIL)
    if existing:
        return existing
    admin = storage.get_user_by_email(config.BOOTSTRAP_ADMIN_EMAIL)
    if not admin:
        raise RuntimeError("Bootstrap organization is unavailable for showcase access.")
    return storage.create_user(
        email=config.SHOWCASE_USER_EMAIL,
        password_hash=hash_password(secrets.token_urlsafe(32)),
        role="recruiter",
        organization_id=admin["organization_id"],
    )
