from fastapi import Depends, HTTPException, status

from app.api.auth import get_current_user
from app.core.redis import get_client
from app.models.models import User

_WINDOW_SECONDS = 30


async def swarm_rate_limiter(user: User = Depends(get_current_user)) -> User:
    """
    Allows at most 1 active swarm trigger per user per 30 seconds.
    Inject this dependency instead of get_current_user on the /run endpoint.
    """
    key = f"rate_limit:swarm:{user.id}"
    async with get_client() as r:
        if await r.exists(key):
            ttl = await r.ttl(key)
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Rate limit exceeded. Try again in {ttl}s.",
                headers={"Retry-After": str(ttl)},
            )
        await r.set(key, "1", ex=_WINDOW_SECONDS)
    return user
