import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import redis.asyncio as aioredis

from app.core.config import settings

_pool: aioredis.ConnectionPool | None = None

CACHE_PREFIX = "cache:scenario:"
META_KEY = "cache:index"


def get_pool() -> aioredis.ConnectionPool:
    global _pool
    if _pool is None:
        _pool = aioredis.ConnectionPool.from_url(settings.redis_url, decode_responses=True)
    return _pool


def get_client() -> aioredis.Redis:
    return aioredis.Redis(connection_pool=get_pool())


# ---------------------------------------------------------------------------
# Pub/sub
# ---------------------------------------------------------------------------

async def publish(channel: str, event_type: str, payload: dict) -> None:
    async with get_client() as r:
        await r.publish(channel, json.dumps({"type": event_type, "data": payload}))


@asynccontextmanager
async def subscribe(channel: str):
    client = get_client()
    pubsub = client.pubsub()
    await pubsub.subscribe(channel)
    try:
        yield pubsub
    finally:
        await pubsub.unsubscribe(channel)
        await client.aclose()


# ---------------------------------------------------------------------------
# Simulation result cache
# ---------------------------------------------------------------------------

async def cache_result(scenario: str, ticks: list[dict], complete: dict) -> None:
    """Persist a completed simulation so it can be replayed without re-running."""
    payload = json.dumps({"ticks": ticks, "complete": complete})
    async with get_client() as r:
        if settings.cache_ttl > 0:
            await r.set(f"{CACHE_PREFIX}{scenario}", payload, ex=settings.cache_ttl)
        else:
            await r.set(f"{CACHE_PREFIX}{scenario}", payload)
        # Update the index
        meta = json.loads(await r.get(META_KEY) or "[]")
        if scenario not in meta:
            meta.append({"scenario": scenario, "cached_at": datetime.now(timezone.utc).isoformat()})
            await r.set(META_KEY, json.dumps(meta))


async def get_cached_result(scenario: str) -> dict | None:
    """Return {ticks, complete} or None if not cached."""
    async with get_client() as r:
        raw = await r.get(f"{CACHE_PREFIX}{scenario}")
    return json.loads(raw) if raw else None


async def delete_cached_result(scenario: str) -> bool:
    """Remove cached result. Returns True if something was deleted."""
    async with get_client() as r:
        deleted = await r.delete(f"{CACHE_PREFIX}{scenario}")
        if deleted:
            meta = json.loads(await r.get(META_KEY) or "[]")
            meta = [m for m in meta if m["scenario"] != scenario]
            await r.set(META_KEY, json.dumps(meta))
    return bool(deleted)


async def list_cached_scenarios() -> list[dict]:
    """Return index of all cached scenarios with metadata."""
    async with get_client() as r:
        return json.loads(await r.get(META_KEY) or "[]")
