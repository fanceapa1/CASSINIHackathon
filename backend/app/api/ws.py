"""
WebSocket endpoint for React clients.

Connect: ws://localhost:8000/ws/scenario/{scenario}

Behaviour:
  - CACHED result exists  → replays all ticks at configured speed, then sends "complete"
  - Live run in progress  → subscribes to Redis pub/sub and forwards events as they arrive
  - Nothing running       → sends "idle" event and closes (client should POST /scenarios/{name}/run first)

All messages are JSON: {"type": "<event>", "data": {...}}
"""
import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.core.redis import get_cached_result, subscribe

router = APIRouter(tags=["websocket"])
log = logging.getLogger(__name__)


@router.websocket("/ws/scenario/{scenario}")
async def scenario_ws(websocket: WebSocket, scenario: str):
    await websocket.accept()
    log.info("WS client connected — scenario: %s", scenario)

    try:
        cached = await get_cached_result(scenario)

        if cached:
            await _replay(websocket, cached)
        else:
            await _stream_live(websocket, scenario)

    except WebSocketDisconnect:
        pass
    finally:
        log.info("WS client disconnected — scenario: %s", scenario)


async def _replay(websocket: WebSocket, cached: dict) -> None:
    """Send cached ticks one-by-one then the complete payload."""
    delay = settings.replay_tick_delay_ms / 1000

    for tick_event in cached.get("ticks", []):
        await websocket.send_text(json.dumps(tick_event))
        await asyncio.sleep(delay)

    await websocket.send_text(json.dumps({"type": "complete", "data": cached["complete"]}))


async def _stream_live(websocket: WebSocket, scenario: str) -> None:
    """Forward events from Redis pub/sub until 'complete' or client disconnects."""
    channel = f"scenario:{scenario}"

    async with subscribe(channel) as pubsub:
        while True:
            try:
                message = await asyncio.wait_for(
                    pubsub.get_message(ignore_subscribe_messages=True),
                    timeout=0.05,
                )
            except asyncio.TimeoutError:
                message = None

            if message and message["type"] == "message":
                await websocket.send_text(message["data"])

                event = json.loads(message["data"])
                if event.get("type") == "complete":
                    break

            # Detect silent client disconnects
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=0.01)
            except asyncio.TimeoutError:
                pass
            except WebSocketDisconnect:
                return
