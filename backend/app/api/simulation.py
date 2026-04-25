import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from geoalchemy2.functions import ST_Intersects, ST_MakeEnvelope
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.core.database import get_db
from app.core.limiter import swarm_rate_limiter
from app.core.redis import delete_cached_result, get_cached_result, list_cached_scenarios
from app.models.models import SimulationRun, User
from app.swarm.bridge import is_running, run_bridge

router = APIRouter(prefix="/scenarios", tags=["simulation"])


def _bbox_to_wkt(bbox_str: str) -> str:
    """'west,south,east,north' → WKT polygon string for PostGIS storage."""
    try:
        w, s, e, n = [float(x.strip()) for x in bbox_str.split(",")]
    except ValueError:
        raise HTTPException(400, "bbox must be four comma-separated floats: west,south,east,north")
    return f"SRID=4326;POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))"


# ---------------------------------------------------------------------------
# Public endpoints (no auth required)
# ---------------------------------------------------------------------------

@router.get("")
async def list_scenarios():
    """List all scenarios that have a cached result ready for playback."""
    return await list_cached_scenarios()


# IMPORTANT: /search must be defined before /{scenario} routes so FastAPI
# does not swallow "search" as a scenario name parameter.
@router.get("/search")
async def search_by_bbox(
    bbox: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Find all SimulationRun records whose bounding_box intersects the given bbox.
    bbox query param format: west,south,east,north  (e.g. 4.87,52.33,4.95,52.40)
    """
    try:
        w, s, e, n = [float(x.strip()) for x in bbox.split(",")]
    except ValueError:
        raise HTTPException(400, "bbox must be four comma-separated floats: west,south,east,north")

    result = await db.execute(
        select(SimulationRun).where(
            ST_Intersects(
                SimulationRun.bounding_box,
                ST_MakeEnvelope(w, s, e, n, 4326),
            )
        ).order_by(SimulationRun.created_at.desc())
    )
    runs = result.scalars().all()

    return [
        {
            "id": r.id,
            "scenario_name": r.scenario_name,
            "created_at": r.created_at,
            "status": r.status,
        }
        for r in runs
    ]


@router.get("/{scenario}/status")
async def get_status(scenario: str):
    cached = await get_cached_result(scenario)
    running = is_running(scenario)
    if cached:
        return {"scenario": scenario, "status": "cached", "tick_count": len(cached.get("ticks", []))}
    if running:
        return {"scenario": scenario, "status": "running"}
    return {"scenario": scenario, "status": "idle"}


@router.get("/{scenario}/summary")
async def get_summary(
    scenario: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Return a condensed summary of the most recent completed run for a scenario.
    Reads from the SimulationRun DB table — never returns the raw ticks array.
    """
    result = await db.execute(
        select(SimulationRun)
        .where(SimulationRun.scenario_name == scenario, SimulationRun.status == "complete")
        .order_by(SimulationRun.created_at.desc())
    )
    run = result.scalar_one_or_none()

    if not run:
        raise HTTPException(404, f"No completed run found for scenario '{scenario}'")

    ticks: list = run.ticks or []
    final_data: dict = ticks[-1].get("data", {}) if ticks else {}

    return {
        "run_id": run.id,
        "scenario": scenario,
        "created_at": run.created_at,
        "tick_count": len(ticks),
        "final_state": {
            "safe": final_data.get("safe", 0),
            "evacuating": final_data.get("evacuating", 0),
            "stranded": final_data.get("stranded", 0),
            "informed": final_data.get("informed", 0),
        },
    }


@router.post("/{scenario}/run")
async def run_scenario(
    scenario: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    bbox: str | None = None,
    force: bool = False,
    _: User = Depends(swarm_rate_limiter),
):
    """
    Trigger a simulation run. Protected by JWT + 30-second rate limit per user.

    - bbox (optional query param): "west,south,east,north" — stored for spatial search.
    - force=true: clears cache and re-runs against the live swarm service.
    """
    if not force:
        cached = await get_cached_result(scenario)
        if cached:
            return {"scenario": scenario, "status": "cached", "message": "Connect to WS for replay."}

    if is_running(scenario):
        return {"scenario": scenario, "status": "running", "message": "Already in progress."}

    if force:
        await delete_cached_result(scenario)

    # Create a DB record to track this run
    run = SimulationRun(
        id=str(uuid.uuid4()),
        scenario_name=scenario,
        status="running",
        bounding_box=_bbox_to_wkt(bbox) if bbox else None,
    )
    db.add(run)
    await db.commit()

    background_tasks.add_task(run_bridge, scenario, run.id)
    return {"scenario": scenario, "run_id": run.id, "status": "started", "message": "Connect to WS for live events."}


@router.delete("/{scenario}/cache")
async def clear_cache(
    scenario: str,
    _: User = Depends(get_current_user),
):
    """Invalidate cached result so the next /run hits the swarm service fresh."""
    deleted = await delete_cached_result(scenario)
    if not deleted:
        raise HTTPException(404, f"No cached result found for scenario '{scenario}'")
    return {"scenario": scenario, "deleted": True}
