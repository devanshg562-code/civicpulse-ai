from datetime import datetime, timedelta, timezone
from functools import lru_cache
from uuid import uuid4

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.models import RevokedToken, Role, User
from app.database.session import get_db


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


@lru_cache(maxsize=1)
def _password_hash():
    from pwdlib import PasswordHash

    return PasswordHash.recommended()


def hash_password(password: str) -> str:
    return _password_hash().hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return _password_hash().verify(password, hashed)


def create_access_token(user: User) -> tuple[str, str, datetime]:
    if not settings.jwt_secret:
        raise HTTPException(status_code=503, detail="Authentication is not configured. Set JWT_SECRET in backend/.env.")
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=settings.access_token_expire_minutes)
    jti = str(uuid4())
    token = jwt.encode(
        {"sub": str(user.id), "role": user.role.name, "jti": jti, "iat": now, "exp": expires},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    return token, jti, expires


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    unauthorized = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired access token", headers={"WWW-Authenticate": "Bearer"})
    if not settings.jwt_secret:
        raise HTTPException(status_code=503, detail="Authentication is not configured. Set JWT_SECRET in backend/.env.")
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        jti = payload.get("jti")
        if not user_id or not jti:
            raise unauthorized
    except JWTError as exc:
        raise unauthorized from exc
    if db.get(RevokedToken, jti):
        raise unauthorized
    user = db.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))
    if not user:
        raise unauthorized
    return user


def require_roles(*allowed: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role.name not in allowed:
            raise HTTPException(status_code=403, detail="You are not authorized to access this resource.")
        return user

    return dependency
