"""
WebSocket bridge: connects to the swarm service, forwards events to Redis,
caches the completed simulation for replay, and persists the run to Postgres.

Lifecycle per scenario run:
  1. Open WSS connection to swarm service
  2. Stream "tick" events → publish to Redis pub/sub (live clients receive them)
  3. On "complete" → publish + cache in Redis + persist ticks to SimulationRun table
  4. On error → publish error event + mark SimulationRun as "error"
"""
import asyncio
import json
import logging

import websockets
from websockets.exceptions import WebSocketException

from pydantic import ValidationError

from app.core.config import settings
from app.core.redis import cache_result, publish
from app.swarm.client import CompleteData, TickData

log = logging.getLogger(__name__)

_running: set[str] = set()


async def run_bridge(scenario: str, run_id: str | None = None) -> None:
    """
    Entry point — safe to call from a FastAPI BackgroundTask.
    run_id: if provided, the corresponding SimulationRun row is updated in Postgres.
    """
    if scenario in _running:
        log.info("Bridge for '%s' already running — skipping duplicate", scenario)
        return

    _running.add(scenario)
    try:
        await _connect_and_stream(scenario, run_id)
    finally:
        _running.discard(scenario)


async def _connect_and_stream(scenario: str, run_id: str | None, max_retries: int = 3) -> None:
    url = f"{settings.swarm_ws_url}?scenario={scenario}"
    ticks: list[dict] = []

    for attempt in range(1, max_retries + 1):
        try:
            log.info("Connecting to swarm WS (attempt %d): %s", attempt, url)
            async with websockets.connect(url, open_timeout=15) as ws:
                await publish(f"scenario:{scenario}", "bridge_connected", {"scenario": scenario})

                async for raw in ws:
                    try:
                        event = json.loads(raw)
                    except json.JSONDecodeError:
                        log.warning("Swarm sent non-JSON message: %s", raw[:200])
                        continue

                    event_type = event.get("type")
                    data = event.get("data", event)

                    if event_type == "tick":
                        try:
                            TickData.model_validate(data)
                        except ValidationError as exc:
                            log.warning("tick payload schema mismatch: %s", exc)
                        ticks.append({"type": "tick", "data": data})
                        await publish(f"scenario:{scenario}", "tick", data)

                    elif event_type == "complete":
                        try:
                            CompleteData.model_validate(data)
                        except ValidationError as exc:
                            log.warning("complete payload schema mismatch: %s", exc)
                        await cache_result(scenario, ticks, data)
                        await publish(f"scenario:{scenario}", "complete", data)
                        if run_id:
                            await _persist_complete(run_id, ticks)
                        log.info("Bridge for '%s' complete — %d ticks", scenario, len(ticks))
                        return

                    else:
                        await publish(f"scenario:{scenario}", event_type or "unknown", data)

            log.warning("Swarm WS closed without 'complete' for scenario '%s'", scenario)
            break

        except (WebSocketException, OSError, asyncio.TimeoutError) as exc:
            log.error("Swarm WS error (attempt %d/%d): %s", attempt, max_retries, exc)
            if attempt < max_retries:
                await asyncio.sleep(2 ** attempt)
            else:
                error_msg = f"Failed to connect after {max_retries} attempts: {exc}"
                await publish(f"scenario:{scenario}", "error", {"scenario": scenario, "message": error_msg})
                if run_id:
                    await _persist_error(run_id, error_msg)


async def _persist_complete(run_id: str, ticks: list[dict]) -> None:
    from sqlalchemy import update
    from app.core.database import AsyncSessionLocal
    from app.models.models import SimulationRun

    async with AsyncSessionLocal() as session:
        await session.execute(
            update(SimulationRun)
            .where(SimulationRun.id == run_id)
            .values(status="complete", ticks=ticks)
        )
        await session.commit()


async def _persist_error(run_id: str, message: str) -> None:
    from sqlalchemy import update
    from app.core.database import AsyncSessionLocal
    from app.models.models import SimulationRun

    async with AsyncSessionLocal() as session:
        await session.execute(
            update(SimulationRun)
            .where(SimulationRun.id == run_id)
            .values(status="error")
        )
        await session.commit()
    log.error("SimulationRun %s marked as error: %s", run_id, message)


def is_running(scenario: str) -> bool:
    return scenario in _running
