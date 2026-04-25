from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.models import User

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _create_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiry_hours)
    return jwt.encode({"sub": username, "exp": expire}, settings.jwt_secret, algorithm="HS256")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        username: str = payload["sub"]
    except (JWTError, KeyError):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user


class RegisterRequest(BaseModel):
    username: str
    password: str


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(User).where(User.username == req.username))).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already taken")
    user = User(username=req.username, hashed_password=pwd_context.hash(req.password))
    db.add(user)
    await db.commit()
    return {"access_token": _create_token(user.username), "token_type": "bearer"}


@router.post("/token")
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(User).where(User.username == form.username))).scalar_one_or_none()
    if not user or not pwd_context.verify(form.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password")
    return {"access_token": _create_token(user.username), "token_type": "bearer"}
