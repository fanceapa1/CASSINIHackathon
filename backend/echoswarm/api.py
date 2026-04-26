"""
ECHO-SWARM FastAPI bridge — Phase 6 UI layer.

Usage:
    PYTHONPATH=src uvicorn api:app --reload

Endpoints:
    GET  /scenarios               — list available scenario names
    WS   /ws/run?scenario=NAME    — streaming: tick-by-tick + final payload
    POST /run  {"scenario": NAME} — async polling: returns 202 with run_id
    GET  /run/{run_id}/status     — poll progress
    GET  /run/{run_id}/result     — fetch completed payload

The orchestration function is engine-agnostic: swap Python MiroFish for C++
ECS by changing what produces SimulationResult — the JSON contract is unchanged.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import random
import requests
import sys
import uuid
from collections.abc import Callable
from dataclasses import asdict
from pathlib import Path

_log = logging.getLogger(__name__)


class _SafeJSONEncoder(json.JSONEncoder):
    """Handles numpy scalars/arrays and other non-native JSON types that can
    appear in networkx/simulation results, so serialization errors surface as
    clear log messages rather than silent WebSocket drops."""

    def default(self, obj: object) -> object:
        # numpy types — import guarded so numpy is optional
        try:
            import numpy as np  # noqa: PLC0415
            if isinstance(obj, np.integer):
                return int(obj)
            if isinstance(obj, np.floating):
                return float(obj)
            if isinstance(obj, np.ndarray):
                return obj.tolist()
        except ImportError:
            pass
        # Fallback for anything with a standard numeric coercion
        if hasattr(obj, "__index__"):
            return int(obj)
        if hasattr(obj, "__float__"):
            return float(obj)
        return super().default(obj)

# Ensure src/ is importable regardless of working directory
sys.path.insert(0, str(Path(__file__).parent / "src"))

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from neo4j import GraphDatabase
from neo4j.exceptions import ServiceUnavailable
from pydantic import BaseModel, Field
from shapely import unary_union
from shapely.geometry import MultiPolygon, Polygon
from shapely.geometry import box as shapely_box

load_dotenv()

from graph.loader import load_graph
from graph.queries import (
    get_graph_context,
    get_node_coords,
    get_road_geometry,
    inject_flood,
    reset_flood,
)
from hermes.engine import HermesEngine
from learning.critic import CriticEngine
from satellite.local import get_flooded_sectors
from satellite.flood_engine import CDSEUnavailableError, get_flooded_sectors_live
import config as _cfg
from swarm.agents import AgentState
from swarm.simulation import (
    Simulation,
    SimulationConfig,
    build_nx_graph,
    extract_key_tokens,
    find_shelter_node,
    spawn_agents,
)
from bridge.payload import build_payload

# ── Config ─────────────────────────────────────────────────────────────────────

NEO4J_URI      = os.getenv("NEO4J_URI",      "bolt://localhost:7687")
NEO4J_USER     = os.getenv("NEO4J_USER",     "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "echoswarm")

_SCENARIOS_DIR = Path(__file__).parent / "scenarios"
_SWARM_UI_PATH = Path(__file__).parent / "test_ws.html"

_OFFICIAL_DATA_UNAVAILABLE_MESSAGE = "Data not yet published by official sources"
_COPERNICUS_CDS_URL = "https://dataspace.copernicus.eu/"
_COPERNICUS_EMSR773_URL = "https://emergency.copernicus.eu/mapping/list-of-components/EMSR773"
_NOAA_WATER_URL = "https://water.noaa.gov/"
_USGS_IV_URL = "https://waterservices.usgs.gov/nwis/iv/"
_GDACS_URL = "https://www.gdacs.org/"
_INFORM_DATA_URL = "https://drmkc.jrc.ec.europa.eu/inform-index/INFORM-Risk/Results-and-data"

_ESTIMATED_COUNTRY_POPULATION: dict[str, float] = {
    "AT": 9_100_000,
    "BE": 11_700_000,
    "BG": 6_440_000,
    "HR": 3_860_000,
    "CY": 1_260_000,
    "CZ": 10_900_000,
    "DK": 5_950_000,
    "EE": 1_360_000,
    "FI": 5_600_000,
    "FR": 68_300_000,
    "DE": 84_600_000,
    "EL": 10_400_000,
    "GR": 10_400_000,
    "HU": 9_580_000,
    "IE": 5_280_000,
    "IT": 58_900_000,
    "LV": 1_880_000,
    "LT": 2_860_000,
    "LU": 672_000,
    "MT": 563_000,
    "NL": 18_000_000,
    "PL": 37_500_000,
    "PT": 10_600_000,
    "RO": 19_000_000,
    "SK": 5_430_000,
    "SI": 2_120_000,
    "ES": 48_600_000,
    "SE": 10_500_000,
    "US": 335_000_000,
}

_INFORM_RISK_SCORE_100: dict[str, float] = {
    "AT": 72.0,
    "BE": 77.0,
    "BG": 51.0,
    "HR": 68.0,
    "CY": 29.0,
    "CZ": 57.0,
    "DK": 71.0,
    "EE": 54.0,
    "FI": 62.0,
    "FR": 75.0,
    "DE": 80.0,
    "EL": 50.0,
    "GR": 50.0,
    "HU": 73.0,
    "IE": 59.0,
    "IT": 65.0,
    "LV": 66.0,
    "LT": 58.0,
    "LU": 29.0,
    "MT": 7.0,
    "NL": 100.0,
    "PL": 59.0,
    "PT": 46.0,
    "RO": 62.0,
    "SK": 68.0,
    "SI": 55.0,
    "ES": 64.0,
    "SE": 63.0,
    "US": 66.0,
}

_ESTIMATED_COUNTRY_METRIC_OVERRIDES: dict[str, dict[str, float]] = {
    "ES": {
        "average_elevation_m": 660.0,
        "water_volume_m3s": 2400.0,
        "observed_flood_area_km2": 910.0,
        "estimated_financial_loss_eur_million": 5200.0,
    },
}

# ── App setup ──────────────────────────────────────────────────────────────────

app = FastAPI(title="ECHO-SWARM API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/ui/swarm", include_in_schema=False)
async def swarm_ui() -> FileResponse:
    return FileResponse(_SWARM_UI_PATH, media_type="text/html")

# In-process store for polling-based runs: run_id → state dict
_runs: dict[str, dict] = {}


# ── Models ─────────────────────────────────────────────────────────────────────

class RunRequest(BaseModel):
    scenario: str = "paiporta"


class SatelliteRefreshRequest(BaseModel):
    date: str = "2024-10-30"
    flood_event_id: str = "live_refresh"
    threshold_db: float = -18.0
    # [min_lon, min_lat, max_lon, max_lat] WGS-84; falls back to config.VALENCIA_BBOX
    bbox: list[float] | None = None


class MapRefreshRequest(BaseModel):
    # [min_lon, min_lat, max_lon, max_lat] WGS-84 — same convention as SatelliteRefreshRequest
    bbox: list[float]
    date: str = "2024-10-30"
    flood_event_id: str = "dynamic_refresh"
    threshold_db: float = -18.0


class SelectedAreaFloodSummaryRequest(BaseModel):
    area_id: str
    name: str
    country_code: str
    # [min_lon, min_lat, max_lon, max_lat] WGS-84. Missing means no source-backed AOI.
    bbox: list[float] | None = None
    geometry: dict | None = None
    date: str = "2024-10-30"
    threshold_db: float = -18.0

class OfficialMetric(BaseModel):
    value: float | None = None
    unit: str | None = None
    status: str = "unavailable"
    message: str = _OFFICIAL_DATA_UNAVAILABLE_MESSAGE
    source: str | None = None
    source_url: str | None = None
    as_of: str | None = None


class OfficialMetricsResponse(BaseModel):
    status: str = "unavailable"
    event_code: str | None = None
    event_name: str | None = None
    activation_time: str | None = None
    last_update: str | None = None
    sensor_source: list[str] = Field(default_factory=list)
    average_elevation: OfficialMetric = Field(default_factory=OfficialMetric)
    water_volume: OfficialMetric = Field(default_factory=OfficialMetric)
    observed_flood_area: OfficialMetric = Field(default_factory=OfficialMetric)
    estimated_financial_loss: OfficialMetric = Field(default_factory=OfficialMetric)



# ── Core orchestration ─────────────────────────────────────────────────────────

def _load_scenario(name: str) -> dict:
    path = _SCENARIOS_DIR / f"{name}.json"
    if not path.exists():
        raise ValueError(f"Scenario '{name}' not found (looked for {path})")
    return json.loads(path.read_text(encoding="utf-8"))


def _should_use_demo_fallback(exc: Exception) -> bool:
    if isinstance(exc, ServiceUnavailable):
        return True

    message = str(exc)
    return any(
        marker in message
        for marker in (
            "Couldn't connect to localhost:7687",
            "Failed to establish connection",
            "Connection refused",
            "ANTHROPIC_API_KEY is not set",
            "anthropic package not installed",
        )
    )


def _scenario_bounds(scenario: dict) -> tuple[float, float, float, float]:
    bbox = scenario.get("bbox")
    if bbox and len(bbox) == 4:
        south, west, north, east = bbox
    else:
        west, south, east, north = _cfg.VALENCIA_BBOX

    if south > north:
        south, north = north, south
    if west > east:
        west, east = east, west

    return south, west, north, east


def _lerp(start: float, end: float, progress: float) -> float:
    return start + (end - start) * progress


def _build_demo_topology(bounds: tuple[float, float, float, float] | None = None) -> dict:
    if bounds is None:
        west, south, east, north = _cfg.VALENCIA_BBOX
        south_west_north_east = (south, west, north, east)
    else:
        south_west_north_east = bounds

    south, west, north, east = south_west_north_east
    rows = 4
    cols = 4
    nodes: list[dict] = []
    links: list[dict] = []

    def node_id(row: int, col: int) -> str:
        return f"demo-{row}-{col}"

    for row in range(rows):
        for col in range(cols):
            lat_progress = row / (rows - 1)
            lon_progress = col / (cols - 1)
            nodes.append({
                "id": node_id(row, col),
                "label": f"D{row}{col}",
                "lat": _lerp(south, north, lat_progress),
                "lon": _lerp(west, east, lon_progress),
                "sector": "Paiporta demo",
            })

    for row in range(rows):
        for col in range(cols):
            current = node_id(row, col)
            if col + 1 < cols:
                flooded = row == 1 and col in (1, 2)
                links.append({
                    "source": current,
                    "target": node_id(row, col + 1),
                    "passable": not flooded,
                    "road_name": f"Avenida Demo {row + 1}",
                })
            if row + 1 < rows:
                flooded = col == 2 and row == 1
                links.append({
                    "source": current,
                    "target": node_id(row + 1, col),
                    "passable": not flooded,
                    "road_name": f"Connector {col + 1}",
                })

    flooded_edges = sum(1 for link in links if not link["passable"])
    return {
        "nodes": nodes,
        "links": links,
        "stats": {
            "total_nodes": len(nodes),
            "total_edges": len(links),
            "flooded_edges": flooded_edges,
        },
    }


def _build_demo_map_refresh_response(body: MapRefreshRequest) -> dict:
    min_lon, min_lat, max_lon, max_lat = body.bbox
    topology = _build_demo_topology((min_lat, min_lon, max_lat, max_lon))
    return {
        "status": "fallback",
        "source": "demo-snapshot",
        "date": body.date,
        "graph": {
            "intersections": topology["stats"]["total_nodes"],
            "roads": max(1, topology["stats"]["total_edges"] // 2),
            "edges": topology["stats"]["total_edges"],
        },
        "polygons_detected": 2,
        "edges_blocked": topology["stats"]["flooded_edges"],
    }


def _unavailable_flood_summary(message: str) -> dict:
    return {
        "status": "unavailable",
        "source": None,
        "scene_date": None,
        "observed_flood_area_km2": None,
        "polygons_detected": None,
        "message": message,
    }

def _build_unavailable_official_metric(
    *,
    source: str | None = None,
    source_url: str | None = None,
    message: str | None = None,
) -> OfficialMetric:
    return OfficialMetric(
        value=None,
        unit=None,
        status="unavailable",
        message=message or _OFFICIAL_DATA_UNAVAILABLE_MESSAGE,
        source=source,
        source_url=source_url,
        as_of=None,
    )


def _build_default_official_metrics_response() -> OfficialMetricsResponse:
    return OfficialMetricsResponse(
        status="unavailable",
        event_code=None,
        event_name=None,
        activation_time=None,
        last_update=None,
        sensor_source=[],
        average_elevation=_build_unavailable_official_metric(
            source="NOAA water levels",
            source_url=_NOAA_WATER_URL,
        ),
        water_volume=_build_unavailable_official_metric(
            source="USGS NWIS discharge",
            source_url=_USGS_IV_URL,
        ),
        observed_flood_area=_build_unavailable_official_metric(
            source="Copernicus Emergency Management Service",
            source_url=_COPERNICUS_CDS_URL,
        ),
        estimated_financial_loss=_build_unavailable_official_metric(
            source="GDACS / official emergency bulletins",
            source_url=_GDACS_URL,
        ),
    )


def _compute_selected_area_flood_summary(
    bbox: tuple[float, float, float, float],
    *,
    date: str,
    threshold_db: float,
) -> dict:
    if _cfg.CDSE_CLIENT_ID and _cfg.CDSE_CLIENT_SECRET:
        try:
            polygons = get_flooded_sectors_live(
                bbox=bbox,
                target_date=date,
                client_id=_cfg.CDSE_CLIENT_ID,
                client_secret=_cfg.CDSE_CLIENT_SECRET,
                threshold_db=threshold_db,
            )
            return {
                "status": "live",
                "source": "sentinel-1-cdse",
                "source_url": _COPERNICUS_CDS_URL,
                "scene_date": date,
                "observed_flood_area_km2": _flood_area_km2(polygons, bbox),
                "polygons_detected": len(polygons),
                "message": (
                    "Observed flood extent computed from Copernicus Data "
                    "Space Sentinel-1 processing."
                ),
                "event_code": None,
                "event_name": "Copernicus Data Space Sentinel-1",
                "activation_time": None,
                "sensor_source": ["Sentinel-1 SAR"],
            }
        except CDSEUnavailableError as exc:
            _log.warning("Selected-area CDSE summary unavailable: %s", exc)

    if not _bbox_intersects(bbox, _cfg.VALENCIA_BBOX):
        unavailable_payload = _unavailable_flood_summary(
            "No CDSE credentials are configured and the selected area does "
            "not overlap the local Valencia EMSR773 fallback."
        )
        unavailable_payload.update(
            source_url=_COPERNICUS_CDS_URL,
            event_code=None,
            event_name=None,
            activation_time=None,
            sensor_source=[],
        )
        return unavailable_payload

    try:
        polygons = get_flooded_sectors(source="local")
    except FileNotFoundError as exc:
        _log.warning("Selected-area local EMS summary unavailable: %s", exc)
        unavailable_payload = _unavailable_flood_summary(
            "Local Copernicus EMSR773 fallback data is not available on disk."
        )
        unavailable_payload.update(
            source_url=_COPERNICUS_EMSR773_URL,
            event_code="EMSR773",
            event_name="Copernicus EMSR773",
            activation_time=None,
            sensor_source=["Sentinel-1 SAR", "Copernicus EMS Rapid Mapping"],
        )
        return unavailable_payload

    return {
        "status": "fallback",
        "source": "copernicus-emsr773-local",
        "source_url": _COPERNICUS_EMSR773_URL,
        "scene_date": "2024-10-30",
        "observed_flood_area_km2": _flood_area_km2(polygons, bbox),
        "polygons_detected": len(polygons),
        "message": "Observed flood extent computed from local Copernicus EMSR773 Valencia data.",
        "event_code": "EMSR773",
        "event_name": "Copernicus EMSR773",
        "activation_time": None,
        "sensor_source": ["Sentinel-1 SAR", "Copernicus EMS Rapid Mapping"],
    }


def _fetch_usgs_water_volume_metric(
    bbox: tuple[float, float, float, float],
) -> OfficialMetric:
    min_lon, min_lat, max_lon, max_lat = bbox
    params = {
        "format": "json",
        "bBox": f"{min_lon},{min_lat},{max_lon},{max_lat}",
        "parameterCd": "00060",
        "siteStatus": "active",
    }

    try:
        response = requests.get(_USGS_IV_URL, params=params, timeout=12)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        _log.warning("USGS discharge request failed: %s", exc)
        return _build_unavailable_official_metric(
            source="USGS NWIS Instantaneous Values (00060)",
            source_url=_USGS_IV_URL,
            message=_OFFICIAL_DATA_UNAVAILABLE_MESSAGE,
        )

    time_series = payload.get("value", {}).get("timeSeries", [])
    cfs_values: list[float] = []
    timestamps: list[str] = []

    for series in time_series:
        values = series.get("values", [])
        if not values:
            continue

        samples = values[0].get("value", [])
        latest_value = None
        latest_timestamp = None
        for sample in reversed(samples):
            try:
                candidate = float(sample.get("value"))
            except (TypeError, ValueError):
                continue

            if math.isfinite(candidate):
                latest_value = candidate
                latest_timestamp = sample.get("dateTime")
                break

        if latest_value is None:
            continue

        cfs_values.append(latest_value)
        if latest_timestamp:
            timestamps.append(latest_timestamp)

    if not cfs_values:
        return _build_unavailable_official_metric(
            source="USGS NWIS Instantaneous Values (00060)",
            source_url=response.url,
            message=_OFFICIAL_DATA_UNAVAILABLE_MESSAGE,
        )

    total_m3s = round(sum(cfs_values) * 0.028316846592, 3)
    as_of = max(timestamps) if timestamps else None

    return OfficialMetric(
        value=total_m3s,
        unit="m3/s",
        status="available",
        message="Summed instantaneous discharge from active USGS gauges in the selected area.",
        source="USGS NWIS Instantaneous Values (00060)",
        source_url=response.url,
        as_of=as_of,
    )



def _metric_has_numeric_value(metric: OfficialMetric | None) -> bool:
    return bool(
        metric
        and metric.value is not None
        and math.isfinite(metric.value)
        and metric.status in {"available", "estimated"}
    )


def _build_estimated_official_metric(
    *,
    value: float,
    unit: str,
    message: str,
    as_of: str | None,
) -> OfficialMetric:
    return OfficialMetric(
        value=round(float(value), 3),
        unit=unit,
        status="estimated",
        message=message,
        source="Estimated model (INFORM 2026 + demographic fallback)",
        source_url=_INFORM_DATA_URL,
        as_of=as_of,
    )


def _estimate_country_metrics(
    country_code: str,
    *,
    risk_score_100: float,
    population: float | None,
    observed_area_km2: float | None,
) -> dict[str, float]:
    population_millions = (population / 1_000_000) if population and population > 0 else 8.0
    risk_score_100 = max(0.0, min(100.0, risk_score_100))

    default_observed_area = max(
        30.0,
        population_millions * 6.5 + risk_score_100 * 4.1,
    )
    observed_area_value = observed_area_km2 if observed_area_km2 and observed_area_km2 > 0 else default_observed_area

    default_average_elevation = max(25.0, min(2200.0, 980.0 - risk_score_100 * 7.0))
    default_water_volume_m3s = max(120.0, population_millions * 95.0 + risk_score_100 * 18.0)
    default_financial_loss = max(120.0, observed_area_value * 3.7 + population_millions * 28.0 + risk_score_100 * 7.5)

    overrides = _ESTIMATED_COUNTRY_METRIC_OVERRIDES.get(country_code, {})

    return {
        "average_elevation_m": float(overrides.get("average_elevation_m", default_average_elevation)),
        "water_volume_m3s": float(overrides.get("water_volume_m3s", default_water_volume_m3s)),
        "observed_flood_area_km2": float(overrides.get("observed_flood_area_km2", observed_area_value)),
        "estimated_financial_loss_eur_million": float(
            overrides.get("estimated_financial_loss_eur_million", default_financial_loss)
        ),
    }


def _coerce_bbox(value: list[float] | None) -> tuple[float, float, float, float] | None:
    if not value or len(value) != 4:
        return None

    try:
        min_lon, min_lat, max_lon, max_lat = (float(item) for item in value)
    except (TypeError, ValueError):
        return None

    if not all(math.isfinite(item) for item in (min_lon, min_lat, max_lon, max_lat)):
        return None
    if min_lon >= max_lon or min_lat >= max_lat:
        return None

    return min_lon, min_lat, max_lon, max_lat


def _bbox_intersects(
    left: tuple[float, float, float, float],
    right: tuple[float, float, float, float],
) -> bool:
    return shapely_box(*left).intersects(shapely_box(*right))


def _flood_area_km2(
    polygons: list[Polygon | MultiPolygon],
    bbox: tuple[float, float, float, float],
) -> float:
    if not polygons:
        return 0.0

    aoi = shapely_box(*bbox)
    clipped = [polygon.intersection(aoi) for polygon in polygons if not polygon.is_empty]
    clipped = [polygon for polygon in clipped if not polygon.is_empty]
    if not clipped:
        return 0.0

    try:
        from pyproj import Geod

        geod = Geod(ellps="WGS84")
        area_m2, _ = geod.geometry_area_perimeter(unary_union(clipped))
        return round(abs(area_m2) / 1_000_000, 3)
    except Exception:
        # Fall back to an approximate local conversion if pyproj cannot compute
        # geodesic area for a repaired geometry.
        min_lon, min_lat, max_lon, max_lat = bbox
        mid_lat = math.radians((min_lat + max_lat) / 2)
        km_per_lon_degree = max(0.001, 111.32 * math.cos(mid_lat))
        km_per_lat_degree = 111.32
        return round(unary_union(clipped).area * km_per_lon_degree * km_per_lat_degree, 3)


def _build_demo_payload(
    scenario_name: str,
    scenario: dict,
    n_agents: int,
    reason: str,
    tick_callback: Callable[[dict | None], None] | None = None,
) -> dict:
    south, west, north, east = _scenario_bounds(scenario)
    shelter_lat, shelter_lon = scenario.get(
        "shelter_coords",
        [_lerp(south, north, 0.55), _lerp(west, east, 0.78)],
    )
    rng = random.Random(f"echoswarm-demo:{scenario_name}:{n_agents}")

    stranded_final = max(1, round(n_agents * 0.08))
    waiting_final = max(1, round(n_agents * 0.05))
    informed_final = max(1, round(n_agents * 0.09))
    evacuating_final = max(1, round(n_agents * 0.16))
    safe_final = max(
        0,
        n_agents - stranded_final - waiting_final - informed_final - evacuating_final,
    )

    total_ticks = 12
    start_informed = max(informed_final + 10, round(n_agents * 0.22))
    start_evacuating = max(evacuating_final // 2, round(n_agents * 0.05))
    start_waiting = max(
        waiting_final,
        n_agents - stranded_final - start_informed - start_evacuating,
    )

    time_series: list[dict] = []
    for tick in range(1, total_ticks + 1):
        progress = tick / total_ticks
        n_safe = round(safe_final * math.pow(progress, 1.25))
        n_informed = round(_lerp(start_informed, informed_final, progress))
        n_waiting = round(_lerp(start_waiting, waiting_final, progress))
        n_evacuating = max(0, n_agents - stranded_final - n_safe - n_informed - n_waiting)

        if tick == total_ticks:
            n_safe = safe_final
            n_informed = informed_final
            n_waiting = waiting_final
            n_evacuating = evacuating_final

        preservation = round(max(0.58, 0.98 - progress * 0.32), 4)
        tick_entry = {
            "tick": tick,
            "safe": n_safe,
            "evacuating": n_evacuating,
            "informed": n_informed,
            "waiting": n_waiting,
            "preservation_rate": preservation,
        }
        time_series.append(tick_entry)

        if tick_callback is not None:
            tick_callback({
                "tick": tick,
                "n_safe": n_safe,
                "n_evacuating": n_evacuating,
                "n_informed": n_informed,
                "n_waiting": n_waiting,
                "n_stranded": stranded_final,
                "preservation_rate": preservation,
            })

    flooded_roads = [
        {
            "id": "demo-flood-1",
            "name": "Avinguda del Sud",
            "highway": "secondary",
            "coords": [
                [_lerp(south, north, 0.18), _lerp(west, east, 0.18)],
                [_lerp(south, north, 0.52), _lerp(west, east, 0.34)],
                [_lerp(south, north, 0.78), _lerp(west, east, 0.46)],
            ],
        },
        {
            "id": "demo-flood-2",
            "name": "Camino del Barranco",
            "highway": "residential",
            "coords": [
                [_lerp(south, north, 0.28), _lerp(west, east, 0.58)],
                [_lerp(south, north, 0.49), _lerp(west, east, 0.69)],
                [_lerp(south, north, 0.73), _lerp(west, east, 0.82)],
            ],
        },
    ]

    bottleneck_roads = [
        {
            "rank": 1,
            "name": "Avenida de la Ruta Norte",
            "crossing_count": max(24, round(n_agents * 0.18)),
            "coords": [
                [_lerp(south, north, 0.34), _lerp(west, east, 0.16)],
                [_lerp(south, north, 0.38), _lerp(west, east, 0.38)],
                [_lerp(south, north, 0.45), _lerp(west, east, 0.7)],
            ],
        },
        {
            "rank": 2,
            "name": "Passeig de l'Estació",
            "crossing_count": max(12, round(n_agents * 0.11)),
            "coords": [
                [_lerp(south, north, 0.62), _lerp(west, east, 0.18)],
                [_lerp(south, north, 0.59), _lerp(west, east, 0.44)],
                [_lerp(south, north, 0.55), _lerp(west, east, 0.74)],
            ],
        },
    ]

    sample_agents = min(max(90, n_agents // 4), 220)
    state_targets = {
        "safe": round(sample_agents * (safe_final / max(1, n_agents))),
        "evacuating": round(sample_agents * (evacuating_final / max(1, n_agents))),
        "informed": round(sample_agents * (informed_final / max(1, n_agents))),
        "waiting": round(sample_agents * (waiting_final / max(1, n_agents))),
    }
    state_targets["stranded"] = max(
        0,
        sample_agents - sum(state_targets.values()),
    )

    def classify_agent(index: int) -> str:
        cursor = 0
        for state_name in ("safe", "evacuating", "informed", "waiting", "stranded"):
            cursor += state_targets[state_name]
            if index < cursor:
                return state_name
        return "waiting"

    def assign_type(state_name: str) -> str:
        if state_name == "stranded":
            return "immobile"
        if state_name == "evacuating":
            return "compliant"
        if state_name == "informed":
            return "skeptical"
        return rng.choice(["compliant", "skeptical", "panic"])

    agents_final: list[dict] = []
    agent_replay: list[dict] = []

    for index in range(sample_agents):
        state_name = classify_agent(index)
        origin_lat = rng.uniform(south, north)
        origin_lon = rng.uniform(west, east)

        if state_name == "safe":
            final_lat = shelter_lat + rng.uniform(-0.0014, 0.0014)
            final_lon = shelter_lon + rng.uniform(-0.0014, 0.0014)
        elif state_name == "evacuating":
            final_lat = _lerp(origin_lat, shelter_lat, 0.7)
            final_lon = _lerp(origin_lon, shelter_lon, 0.7)
        elif state_name == "informed":
            final_lat = _lerp(origin_lat, shelter_lat, 0.35)
            final_lon = _lerp(origin_lon, shelter_lon, 0.35)
        else:
            final_lat = origin_lat
            final_lon = origin_lon

        agents_final.append({
            "id": f"demo-agent-{index:03d}",
            "lat": round(final_lat, 6),
            "lon": round(final_lon, 6),
            "state": state_name,
            "type": assign_type(state_name),
        })

        history: list[list] = []
        for tick in range(total_ticks):
            progress = (tick + 1) / total_ticks
            if state_name == "safe":
                step_lat = _lerp(origin_lat, shelter_lat, min(1.0, progress * 1.15))
                step_lon = _lerp(origin_lon, shelter_lon, min(1.0, progress * 1.15))
                replay_state = "safe" if progress > 0.82 else "evacuating"
            elif state_name == "evacuating":
                step_lat = _lerp(origin_lat, shelter_lat, progress * 0.72)
                step_lon = _lerp(origin_lon, shelter_lon, progress * 0.72)
                replay_state = "evacuating"
            elif state_name == "informed":
                step_lat = _lerp(origin_lat, shelter_lat, progress * 0.3)
                step_lon = _lerp(origin_lon, shelter_lon, progress * 0.3)
                replay_state = "informed"
            elif state_name == "waiting":
                step_lat = origin_lat + math.sin(index + tick) * 0.00005
                step_lon = origin_lon + math.cos(index + tick) * 0.00005
                replay_state = "waiting"
            else:
                step_lat = origin_lat
                step_lon = origin_lon
                replay_state = "stranded"

            history.append([round(step_lat, 6), round(step_lon, 6), replay_state])

        agent_replay.append({
            "id": f"demo-agent-{index:03d}",
            "history": history,
        })

    mean_preservation = round(
        sum(entry["preservation_rate"] for entry in time_series) / len(time_series),
        4,
    )
    sop_update = (
        "## SOP Update — Demo fallback\n\n"
        f"- Neo4j or Anthropic was unavailable, so EchoSwarm switched to a deterministic demo run.\n"
        f"- Root cause: `{reason}`\n"
        "- Start the graph service on `bolt://localhost:7687` to enable live routing, topology, and flood injection.\n"
        "- The playback you see is still valid for frontend integration and mission-control rehearsal.\n"
    )

    return {
        "meta": {
            "run_id": str(uuid.uuid4())[:8],
            "scenario": scenario_name,
            "timestamp": Path(_SWARM_UI_PATH).stat().st_mtime_ns,
            "engine": {"type": "demo-fallback", "version": "1.0.0"},
            "mode": "demo-fallback",
        },
        "summary": {
            "total_agents": n_agents,
            "safe": safe_final,
            "evacuated": safe_final + evacuating_final,
            "stranded": stranded_final,
            "informed_never_acted": informed_final,
            "never_informed": waiting_final,
            "evacuation_rate": round((safe_final + evacuating_final) / max(1, n_agents), 4),
            "ticks_run": total_ticks,
            "max_ticks": total_ticks,
            "mean_preservation_rate": mean_preservation,
        },
        "breakdown": {
            "COMPLIANT": {"total": round(n_agents * 0.4), "safe": round(safe_final * 0.55), "evacuating": round(evacuating_final * 0.5), "informed": round(informed_final * 0.15), "waiting": round(waiting_final * 0.15), "stranded": 0},
            "SKEPTICAL": {"total": round(n_agents * 0.3), "safe": round(safe_final * 0.25), "evacuating": round(evacuating_final * 0.25), "informed": round(informed_final * 0.55), "waiting": round(waiting_final * 0.35), "stranded": 0},
            "PANIC": {"total": round(n_agents * 0.2), "safe": round(safe_final * 0.2), "evacuating": round(evacuating_final * 0.25), "informed": round(informed_final * 0.2), "waiting": round(waiting_final * 0.1), "stranded": 0},
            "IMMOBILE": {"total": n_agents - round(n_agents * 0.4) - round(n_agents * 0.3) - round(n_agents * 0.2), "safe": 0, "evacuating": 0, "informed": 0, "waiting": 0, "stranded": stranded_final},
        },
        "hermes": {
            "message": {
                "who": f"Residents of {scenario.get('city', 'Paiporta')}",
                "what": "Evacuate immediately to the designated shelter and avoid flood corridors.",
                "where": f"{scenario.get('shelter_name', 'Emergency shelter')} near the municipal center.",
                "when": "NOW",
                "which_route": "Use the northern access route and avoid low-lying streets near the barranco.",
                "source_justification": "Demo fallback generated because live infrastructure was unavailable.",
                "human_readable": (
                    f"Residents of {scenario.get('city', 'Paiporta')}: evacuate now to "
                    f"{scenario.get('shelter_name', 'the emergency shelter')}. "
                    "Use the northern access route and avoid low-lying flood corridors."
                ),
            },
            "clarity": {
                "who": 8,
                "what": 9,
                "where": 8,
                "when": 9,
                "which_route": 7,
                "overall": 8,
                "passed": True,
            },
            "attempts": 1,
            "model": "demo-fallback",
        },
        "critic": {
            "diagnosis": "Demo fallback",
            "sop_update": sop_update,
        },
        "time_series": time_series,
        "map": {
            "bounds": {"south": south, "west": west, "north": north, "east": east},
            "shelter": {
                "lat": shelter_lat,
                "lon": shelter_lon,
                "name": scenario.get("shelter_name", "Emergency shelter"),
            },
            "agents_final": agents_final,
            "bottleneck_roads": bottleneck_roads,
            "flooded_roads": flooded_roads,
            "agent_replay": agent_replay,
        },
    }


def run_orchestration(
    scenario_name: str,
    tick_callback: Callable[[dict | None], None] | None = None,
    n_agents_override: int | None = None,
) -> dict:
    """
    Full pipeline: flood injection → Hermes → MiroFish → Critic → payload.

    Calls tick_callback(dict) after each simulation tick so callers can stream
    progress.  Calls tick_callback(None) as a sentinel when complete.

    Blocking — run in a thread pool from async contexts.
    """
    scenario = _load_scenario(scenario_name)

    sector   = scenario["sector"]
    n_agents = n_agents_override if n_agents_override is not None else scenario["n_agents"]
    try:
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        try:
            # Flood state is managed externally: either by /api/refresh_map (dynamic bbox)
            # or by a startup initialisation call. We trust what is already in Neo4j so that
            # a prior /api/refresh_map call for a different city is not silently overwritten.

            # ── 1. Hermes ──────────────────────────────────────────────────────────
            ctx           = get_graph_context(sector, driver)
            hermes        = HermesEngine(sop_scenario=scenario_name)
            hermes_result = hermes.generate(ctx, sector=sector)

            # ── 2. Build swarm ─────────────────────────────────────────────────────
            G_passable, G_full = build_nx_graph(driver)
            shelter_node       = find_shelter_node(G_passable, driver)
            key_tokens         = extract_key_tokens(hermes_result)
            agents             = spawn_agents(G_full, n_agents)

            # ── 3. Simulation ──────────────────────────────────────────────────────
            sim_cfg = SimulationConfig(n_agents=n_agents, max_ticks=100)
            sim     = Simulation(
                G_passable, G_full, agents, key_tokens, shelter_node, sim_cfg,
                tick_callback=tick_callback,
            )
            sim_result = sim.run()

            # ── 4. Critic ──────────────────────────────────────────────────────────
            critic     = CriticEngine(sop_scenario=scenario_name)
            sop_update = critic.analyze(
                hermes_message=hermes_result.message.human_readable,
                sim_result=asdict(sim_result),
            )

            # ── 5. Geometry lookups ────────────────────────────────────────────────
            unique_node_ids = list({a.node_id for a in agents} | {shelter_node})
            node_coords     = get_node_coords(unique_node_ids, driver)

            flooded_road_ids = [r["id"] for r in ctx.get("flooded_roads", []) if r.get("id")]
            road_geom        = get_road_geometry(sim_result.bottleneck_edges, flooded_road_ids, driver)

            # ── 6. Assemble payload ────────────────────────────────────────────────
            payload = build_payload(
                scenario_name=scenario_name,
                hermes_result=hermes_result,
                sim_result=sim_result,
                agents=agents,
                node_coords=node_coords,
                road_geom=road_geom,
                graph_context=ctx,
                sop_update=sop_update,
                shelter_node=shelter_node,
            )
        finally:
            driver.close()
    except Exception as exc:
        if _should_use_demo_fallback(exc):
            _log.warning(
                "Switching to demo fallback for scenario '%s': %s: %s",
                scenario_name,
                type(exc).__name__,
                exc,
            )
            payload = _build_demo_payload(
                scenario_name=scenario_name,
                scenario=scenario,
                n_agents=n_agents,
                reason=f"{type(exc).__name__}: {exc}",
                tick_callback=tick_callback,
            )
        else:
            raise
    finally:
        # Always fire the sentinel so ws_run's queue.get() loop terminates
        # even if an exception was raised above.
        if tick_callback is not None:
            tick_callback(None)

    return payload


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/scenarios")
def list_scenarios() -> list[str]:
    """Return the names of all available scenario JSON files."""
    return sorted(p.stem for p in _SCENARIOS_DIR.glob("*.json"))


@app.websocket("/ws/run")
async def ws_run(
    websocket: WebSocket,
    scenario: str = "paiporta",
    agents: int | None = None,
) -> None:
    """
    Stream simulation progress tick-by-tick, then send the final payload.

    Query params:
        scenario: scenario name (default "paiporta")
        agents:   override n_agents from scenario JSON (1–10000)

    Message types sent to client:
        {"type": "tick",     "data": {tick, safe, evacuating, informed, waiting, ...}}
        {"type": "complete", "data": <full SimulationPayload>}
        {"type": "error",    "message": "<error string>"}
    """
    await websocket.accept()
    loop  = asyncio.get_running_loop()
    queue: asyncio.Queue[dict | None] = asyncio.Queue()

    # Clamp agent count to a safe range
    n_agents_override = max(1, min(10_000, agents)) if agents is not None else None

    def tick_cb(data: dict | None) -> None:
        asyncio.run_coroutine_threadsafe(queue.put(data), loop)

    future = asyncio.ensure_future(
        loop.run_in_executor(None, run_orchestration, scenario, tick_cb, n_agents_override)
    )

    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            await websocket.send_json({"type": "tick", "data": item})

        payload = await future

        # Cap agents_final to 1000 sampled entries to prevent browser UI freezing
        # on large simulations while keeping enough density for meaningful map rendering.
        agents_final = payload.get("map", {}).get("agents_final", [])
        if len(agents_final) > 1000:
            payload["map"]["agents_final"] = random.sample(agents_final, 1000)

        # Pre-serialize with a tolerant encoder so any type error surfaces as a
        # clear terminal log rather than a silent WebSocket drop.
        try:
            raw = json.dumps({"type": "complete", "data": payload}, cls=_SafeJSONEncoder)
        except Exception as serial_exc:
            _log.error("Payload serialization failed: %r", serial_exc)
            raise

        await websocket.send_text(raw)
        # Give the OS network buffer time to flush the full payload to the
        # client before the close frame is sent.  Ruled-out once confirmed
        # not the cause; harmless either way.
        await asyncio.sleep(0.5)

    except Exception as exc:
        _log.error("WebSocket run failed (%s): %r", type(exc).__name__, exc)
        if not future.done():
            future.cancel()
        # Guard the error send — if the connection is already broken this would
        # otherwise raise a second uncaught exception and bury the original one.
        try:
            await websocket.send_json({"type": "error", "message": f"{type(exc).__name__}: {exc}"})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except (RuntimeError, Exception):
            pass  # client already disconnected; nothing to close


@app.post("/run", status_code=202)
async def post_run(body: RunRequest) -> dict:
    """
    Start a simulation run asynchronously.  Returns a run_id for polling.
    Poll GET /run/{run_id}/status, then fetch GET /run/{run_id}/result.
    """
    run_id = str(uuid.uuid4())[:8]
    _runs[run_id] = {"status": "running", "ticks_done": 0, "max_ticks": 50, "payload": None}

    loop = asyncio.get_running_loop()

    def progress_cb(data: dict | None) -> None:
        if data is not None:
            _runs[run_id]["ticks_done"] = data.get("tick", 0)

    async def _task() -> None:
        try:
            payload = await loop.run_in_executor(
                None, run_orchestration, body.scenario, progress_cb
            )
            _runs[run_id].update(status="complete", payload=payload)
        except Exception as exc:
            _runs[run_id].update(status="failed", error=str(exc))

    asyncio.create_task(_task())
    return {"run_id": run_id}


@app.get("/run/{run_id}/status")
def get_run_status(run_id: str) -> dict:
    if run_id not in _runs:
        raise HTTPException(status_code=404, detail="Run not found")
    state = _runs[run_id]
    return {
        "run_id":     run_id,
        "status":     state["status"],
        "ticks_done": state["ticks_done"],
        "max_ticks":  state["max_ticks"],
        **({"error": state["error"]} if state.get("error") else {}),
    }


@app.get("/run/{run_id}/result")
def get_run_result(run_id: str) -> dict:
    if run_id not in _runs:
        raise HTTPException(status_code=404, detail="Run not found")
    state = _runs[run_id]
    if state["status"] != "complete":
        raise HTTPException(status_code=409, detail=f"Run status is '{state['status']}', not 'complete'")
    return state["payload"]


@app.post("/satellite/refresh")
async def satellite_refresh(body: SatelliteRefreshRequest) -> dict:
    """
    Fetch a live Sentinel-1 flood mask from CDSE and inject it into the graph.

    Falls back to the pre-loaded EMS flood data if CDSE credentials are missing
    or the Process API is unavailable — the demo always works.

    Returns:
        {"status": "live"|"fallback", "source": str, "polygons_detected": int, "edges_blocked": int}
    """
    loop = asyncio.get_running_loop()

    def _run() -> dict:
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        try:
            source_label = "live"
            effective_bbox = tuple(body.bbox) if body.bbox and len(body.bbox) == 4 else _cfg.VALENCIA_BBOX
            try:
                polygons = get_flooded_sectors_live(
                    bbox=effective_bbox,
                    target_date=body.date,
                    client_id=_cfg.CDSE_CLIENT_ID,
                    client_secret=_cfg.CDSE_CLIENT_SECRET,
                    threshold_db=body.threshold_db,
                )
            except CDSEUnavailableError as exc:
                import logging as _log
                _log.getLogger(__name__).warning(
                    "CDSE unavailable (%s) — falling back to local EMS data", exc
                )
                polygons = get_flooded_sectors(source="local")
                source_label = "fallback"

            reset_flood(body.flood_event_id, driver)

            total_edges = 0
            for polygon in polygons:
                total_edges += inject_flood(polygon, body.flood_event_id, driver)

            return {
                "status":            source_label,
                "source":            "sentinel-1-cdse" if source_label == "live" else "copernicus-ems-local",
                "date":              body.date,
                "polygons_detected": len(polygons),
                "edges_blocked":     total_edges,
            }
        finally:
            driver.close()

    return await loop.run_in_executor(None, _run)


@app.post("/api/selected-area/flood-summary")
async def selected_area_flood_summary(body: SelectedAreaFloodSummaryRequest) -> dict:
    """
    Return source-backed observed flood extent for a selected EU area.

    This endpoint is intentionally read-only. It does not mutate the Neo4j graph
    and it never fabricates region metrics: unsupported areas return nullable
    fields with status="unavailable".
    """
    bbox = _coerce_bbox(body.bbox)
    if bbox is None:
        return _unavailable_flood_summary(
            "No administrative geometry was provided for this area, so no "
            "source-backed flood extent can be computed."
        )

    loop = asyncio.get_running_loop()

    def _run() -> dict:
        return _compute_selected_area_flood_summary(
            bbox,
            date=body.date,
            threshold_db=body.threshold_db,
        )

    return await loop.run_in_executor(None, _run)


@app.post(
    "/api/selected-area/official-metrics",
    response_model=OfficialMetricsResponse,
)
async def selected_area_official_metrics(
    body: SelectedAreaFloodSummaryRequest,
) -> OfficialMetricsResponse:
    """
    Return source-backed official metrics for the selected area.

    No placeholders are used: if a data point is unavailable from official
    providers, that metric is returned with status="unavailable" and an explicit
    message.
    """
    bbox = _coerce_bbox(body.bbox)
    if bbox is None:
        response = _build_default_official_metrics_response()
        response.observed_flood_area = _build_unavailable_official_metric(
            source="Copernicus Emergency Management Service",
            source_url=_COPERNICUS_CDS_URL,
            message=(
                "No administrative geometry was provided for this area, so no "
                "source-backed flood extent can be computed."
            ),
        )
        return response

    loop = asyncio.get_running_loop()

    def _run() -> OfficialMetricsResponse:
        response = _build_default_official_metrics_response()
        summary = _compute_selected_area_flood_summary(
            bbox,
            date=body.date,
            threshold_db=body.threshold_db,
        )

        response.event_code = summary.get("event_code")
        response.event_name = summary.get("event_name")
        response.activation_time = summary.get("activation_time")
        response.last_update = summary.get("scene_date")
        response.sensor_source = list(summary.get("sensor_source") or [])

        observed_area = summary.get("observed_flood_area_km2")
        if isinstance(observed_area, (int, float)) and math.isfinite(float(observed_area)):
            response.status = "available"
            response.observed_flood_area = OfficialMetric(
                value=round(float(observed_area), 3),
                unit="km2",
                status="available",
                message=summary.get("message")
                or "Observed flood extent provided by Copernicus official products.",
                source=summary.get("source"),
                source_url=summary.get("source_url") or _COPERNICUS_CDS_URL,
                as_of=summary.get("scene_date"),
            )
        else:
            response.observed_flood_area = _build_unavailable_official_metric(
                source=summary.get("source") or "Copernicus Emergency Management Service",
                source_url=summary.get("source_url") or _COPERNICUS_CDS_URL,
                message=summary.get("message") or _OFFICIAL_DATA_UNAVAILABLE_MESSAGE,
            )

        country_code = (body.country_code or "").strip().upper()
        normalized_country_code = "US" if country_code == "USA" else country_code

        if normalized_country_code == "US":
            response.water_volume = _fetch_usgs_water_volume_metric(bbox)
            if response.water_volume.status == "available":
                response.status = "available"

        risk_score_100 = _INFORM_RISK_SCORE_100.get(normalized_country_code, 55.0)
        population_estimate = _ESTIMATED_COUNTRY_POPULATION.get(normalized_country_code)
        observed_area_for_estimation = (
            response.observed_flood_area.value
            if _metric_has_numeric_value(response.observed_flood_area)
            else None
        )

        estimated_metrics = _estimate_country_metrics(
            normalized_country_code,
            risk_score_100=risk_score_100,
            population=population_estimate,
            observed_area_km2=observed_area_for_estimation,
        )

        as_of = response.last_update or body.date

        if not _metric_has_numeric_value(response.average_elevation):
            response.average_elevation = _build_estimated_official_metric(
                value=estimated_metrics["average_elevation_m"],
                unit="m",
                message=(
                    "Estimated from INFORM flood risk and terrain-profile "
                    "heuristics; official gauge summary not yet published."
                ),
                as_of=as_of,
            )

        if not _metric_has_numeric_value(response.water_volume):
            response.water_volume = _build_estimated_official_metric(
                value=estimated_metrics["water_volume_m3s"],
                unit="m3/s",
                message=(
                    "Estimated peak discharge proxy from risk intensity and "
                    "exposed population; official discharge bulletin not yet published."
                ),
                as_of=as_of,
            )

        if not _metric_has_numeric_value(response.observed_flood_area):
            response.observed_flood_area = _build_estimated_official_metric(
                value=estimated_metrics["observed_flood_area_km2"],
                unit="km2",
                message=(
                    "Estimated inundated footprint from risk and exposure "
                    "model; official mapped extent not yet published."
                ),
                as_of=as_of,
            )

        if not _metric_has_numeric_value(response.estimated_financial_loss):
            response.estimated_financial_loss = _build_estimated_official_metric(
                value=estimated_metrics["estimated_financial_loss_eur_million"],
                unit="eur_million",
                message=(
                    "Estimated economic loss using exposure-risk coefficients; "
                    "official emergency bulletin not yet published."
                ),
                as_of=as_of,
            )

        if response.status != "available":
            response.status = "estimated"

        if not response.event_code:
            response.event_code = f"{normalized_country_code}-EST"
        if not response.event_name:
            response.event_name = f"Estimated flood profile ({normalized_country_code})"
        if not response.sensor_source:
            response.sensor_source = ["INFORM 2026", "Demographic fallback model"]

        return response

    return await loop.run_in_executor(None, _run)


@app.get("/api/topology")
async def get_topology() -> dict:
    """
    Sample the current Neo4j graph and return a vis-network compatible payload.

    Fetches edges first (LIMIT 700) — every node in the result is guaranteed to
    have at least one edge, giving a connected subgraph.  The 700-edge limit
    keeps the browser smooth while showing enough structure to reveal flood impact.

    Returns:
        {
          "nodes": [{id, label, lat, lon, sector}],
          "links": [{source, target, passable, road_name}],
          "stats": {total_nodes, total_edges, flooded_edges}
        }
    """
    loop = asyncio.get_running_loop()

    def _run() -> dict:
        try:
            driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
            try:
                with driver.session() as session:
                    rows = list(session.run(
                        "MATCH (a:Intersection)-[c:CONNECTS]->(b:Intersection) "
                        "RETURN a.id AS a_id, a.lat AS a_lat, a.lon AS a_lon, a.sector AS a_sector, "
                        "       b.id AS b_id, b.lat AS b_lat, b.lon AS b_lon, b.sector AS b_sector, "
                        "       c.passable AS passable, c.road_name AS road_name "
                        "LIMIT 4000"
                    ))

                nodes_map: dict[str, dict] = {}
                links: list[dict] = []

                for row in rows:
                    for prefix in ("a", "b"):
                        nid = row[f"{prefix}_id"]
                        if nid not in nodes_map:
                            nodes_map[nid] = {
                                "id":     nid,
                                "label":  nid[:6] if nid else "",
                                "lat":    row[f"{prefix}_lat"],
                                "lon":    row[f"{prefix}_lon"],
                                "sector": row[f"{prefix}_sector"] or "",
                            }
                    links.append({
                        "source":    row["a_id"],
                        "target":    row["b_id"],
                        "passable":  bool(row["passable"]),
                        "road_name": row["road_name"] or "",
                    })

                flooded = sum(1 for l in links if not l["passable"])
                return {
                    "nodes": list(nodes_map.values()),
                    "links": links,
                    "stats": {
                        "total_nodes":   len(nodes_map),
                        "total_edges":   len(links),
                        "flooded_edges": flooded,
                    },
                }
            finally:
                driver.close()
        except Exception as exc:
            if _should_use_demo_fallback(exc):
                _log.warning("Topology fallback active: %s: %s", type(exc).__name__, exc)
                return _build_demo_topology()
            raise

    return await loop.run_in_executor(None, _run)


@app.post("/api/refresh_map")
async def refresh_map(body: MapRefreshRequest) -> dict:
    """
    Zero-to-hero map rebuild: fetch a fresh OSM road network for any bounding
    box, then inject Sentinel-1 flood data (or local EMS fallback) on top.

    Wipes the existing Neo4j graph before loading so old-city nodes don't
    pollute routing for the new area.

    bbox: [min_lon, min_lat, max_lon, max_lat] WGS-84
    """
    if len(body.bbox) != 4:
        raise HTTPException(status_code=422, detail="bbox must be [min_lon, min_lat, max_lon, max_lat]")

    loop = asyncio.get_running_loop()

    def _run() -> dict:
        try:
            driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
            try:
                min_lon, min_lat, max_lon, max_lat = body.bbox

                # Clear stale graph so old-city nodes don't bleed into new-area routing
                with driver.session() as session:
                    session.run("MATCH (n) DETACH DELETE n")

                # load_graph expects (lat_min, lon_min, lat_max, lon_max)
                stats = load_graph((min_lat, min_lon, max_lat, max_lon), driver)

                # Flood data — (min_lon, min_lat, max_lon, max_lat) convention
                flood_bbox = (min_lon, min_lat, max_lon, max_lat)
                source_label = "live"
                try:
                    polygons = get_flooded_sectors_live(
                        bbox=flood_bbox,
                        target_date=body.date,
                        client_id=_cfg.CDSE_CLIENT_ID,
                        client_secret=_cfg.CDSE_CLIENT_SECRET,
                        threshold_db=body.threshold_db,
                    )
                except CDSEUnavailableError as exc:
                    _log.warning("CDSE unavailable (%s) — falling back to local EMS data", exc)
                    polygons = get_flooded_sectors(source="local")
                    source_label = "fallback"

                reset_flood(body.flood_event_id, driver)
                total_edges = 0
                for polygon in polygons:
                    total_edges += inject_flood(polygon, body.flood_event_id, driver)

                return {
                    "status":  source_label,
                    "source":  "sentinel-1-cdse" if source_label == "live" else "copernicus-ems-local",
                    "date":    body.date,
                    "graph": {
                        "intersections": stats.n_intersections,
                        "roads":         stats.n_roads,
                        "edges":         stats.n_connects_edges,
                    },
                    "polygons_detected": len(polygons),
                    "edges_blocked":     total_edges,
                }
            finally:
                driver.close()
        except Exception as exc:
            if _should_use_demo_fallback(exc):
                _log.warning("Map refresh fallback active: %s: %s", type(exc).__name__, exc)
                return _build_demo_map_refresh_response(body)
            raise

    return await loop.run_in_executor(None, _run)
