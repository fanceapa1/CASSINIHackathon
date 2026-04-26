"""
src/satellite/local.py — Copernicus EMS flood polygon loader.

Loads pre-processed flood extent vectors from the Copernicus Emergency
Management Service activation EMSR773 (Valencia DANA, October 2024).
No API calls, no rasterio, no authentication required.

Data note: the EMS file uses 'event_type' / 'notation' properties, not
'obj_type'. Within this file every feature is a flood feature, so the
meaningful filter is 'notation' == 'Flooded area' (standing water that
blocks routing) vs. 'Flood trace' (high-water mark — where water was,
not where it is now; excluded so reset roads stay passable).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Union

from shapely.geometry import MultiPolygon, Polygon, shape

import config

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_FLOOD_FILE = _PROJECT_ROOT / "data" / "valencia_flood_peak.json"


def get_flooded_sectors(
    source: str = "local",
    path: str | Path | None = None,
    *,
    bbox: tuple[float, float, float, float] | None = None,
    target_date: str | None = None,
    threshold_db: float = -18.0,
) -> list[Union[Polygon, MultiPolygon]]:
    """
    Return Shapely geometries for currently flooded areas.

    Each returned polygon is ready to pass directly to inject_flood().
    Coordinates are WGS-84 (lon, lat) — Shapely's (x, y) convention.

    Args:
        source:      'local' — load Copernicus EMS EMSR773 vectors from disk.
                     'live'  — Phase-2 CDSE live pipeline (requires CDSE_CLIENT_ID/SECRET).
        path:        Override the default EMS file path (local source only).
        bbox:        AOI for live source, defaults to VALENCIA_BBOX from config.
        target_date: ISO date for live source, defaults to "2024-10-30".

    Returns:
        List of Shapely Polygon / MultiPolygon objects.

    Raises:
        CDSEUnavailableError: if source='live' and credentials are missing or API fails.
        FileNotFoundError:    if source='local' and the EMS data file is missing.
    """
    if source == "live":
        from satellite.flood_engine import CDSEUnavailableError, get_flooded_sectors_live
        effective_bbox = bbox or config.VALENCIA_BBOX
        effective_date = target_date or "2024-10-30"
        return get_flooded_sectors_live(
            bbox=effective_bbox,
            target_date=effective_date,
            client_id=config.CDSE_CLIENT_ID,
            client_secret=config.CDSE_CLIENT_SECRET,
            threshold_db=threshold_db,
        )

    if source != "local":
        raise ValueError(f"Unknown source {source!r}. Use 'local' or 'live'.")

    if path is not None:
        flood_file = Path(path)
        if not flood_file.is_absolute():
            flood_file = _PROJECT_ROOT / flood_file
    else:
        flood_file = _FLOOD_FILE

    if not flood_file.exists():
        raise FileNotFoundError(
            f"EMS flood data not found: {flood_file}\n"
            "Download EMSR773 vectors from emergency.copernicus.eu and place "
            "the GeoJSON in the /data directory."
        )

    with flood_file.open(encoding="utf-8") as f:
        collection = json.load(f)

    polygons: list[Union[Polygon, MultiPolygon]] = []
    n_traces = 0

    for feature in collection["features"]:
        props = feature.get("properties", {})

        # 'Flood trace' = historical high-water mark, not standing water.
        # Injecting these into the routing graph would block roads that have
        # already been cleared — only 'Flooded area' features are returned.
        if props.get("notation") != "Flooded area":
            n_traces += 1
            continue

        geometry = feature.get("geometry")
        if geometry is None:
            continue

        geom = shape(geometry)
        # Self-intersecting rings (10 features in EMSR773) break contains() checks.
        # buffer(0) is the standard Shapely repair for this — no geometry is lost.
        polygons.append(geom if geom.is_valid else geom.buffer(0))

    logger.info(
        "EMS EMSR773: %d flood-area polygons loaded (%d flood-trace features excluded)",
        len(polygons),
        n_traces,
    )
    return polygons
