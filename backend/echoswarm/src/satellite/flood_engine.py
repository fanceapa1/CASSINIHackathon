"""
src/satellite/flood_engine.py — Live CDSE satellite flood detection.

Pipeline (Phase 2):
  1. OAuth2 client credentials → CDSE access token
  2. Sentinel Hub Process API → SAR VV band as raw σ°×1000 normalized to UINT8 PNG
  3. Python-side threshold: flood = pixel < 10**(threshold_db/10) * SIGMA0_SCALE
  4. PIL + numpy + shapely → list[Polygon] in WGS-84

Why raw values (not server-side threshold):
  Thresholding in the evalscript produces a binary 0/255 image.  We can't distinguish
  "scene is dark everywhere and threshold is too strict" from "image is empty" from a
  binary mask alone.  Returning raw values lets Python print the actual σ° distribution
  and suggest the right threshold from real data.
"""

from __future__ import annotations

import io
import logging
import time
from datetime import date, timedelta
from typing import Union

import numpy as np
import requests
from PIL import Image
from shapely.geometry import MultiPolygon, Polygon
from shapely.geometry import box as shapely_box
from shapely.ops import unary_union

logger = logging.getLogger(__name__)

_TOKEN_URL   = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
_PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process"

# Scale factor: evalscript returns round(σ° × SIGMA0_SCALE), capped at 255.
# Flood = DARK pixel (low backscatter).  pixel=10 ≈ -20 dB, pixel=16 ≈ -18 dB, pixel=32 ≈ -15 dB.
# Python thresholds with: pixel < int(10**(threshold_db/10) * SIGMA0_SCALE)
_SIGMA0_SCALE = 1000

# NOTE: no leading newline — evalscript parser requires //VERSION=3 on the first line.
_EVALSCRIPT = (
    '//VERSION=3\n'
    'function setup() {\n'
    '  return {\n'
    '    input: [{ bands: ["VV"], units: "LINEAR_POWER" }],\n'
    '    output: { bands: 1, sampleType: "UINT8" }\n'
    '  };\n'
    '}\n'
    'function evaluatePixel(s) {\n'
    '  // Raw σ° × 1000, capped at 255.  Darker = lower backscatter = more likely flood.\n'
    '  // Python applies the threshold so the full distribution is visible for debugging.\n'
    '  return [Math.min(Math.round(s.VV * 1000), 255)];\n'
    '}\n'
)


class CDSEUnavailableError(Exception):
    """Raised when CDSE credentials are missing or the Process API is unreachable."""


# ─── Public API ────────────────────────────────────────────────────────────────

def get_flooded_sectors_live(
    bbox: tuple[float, float, float, float],
    target_date: str,
    client_id: str,
    client_secret: str,
    *,
    width: int = 512,
    height: int = 512,
    threshold_db: float = -20.0,
) -> list[Union[Polygon, MultiPolygon]]:
    """
    Full live pipeline: authenticate → fetch SAR flood mask → vectorize → return polygons.

    Args:
        bbox:          (min_lon, min_lat, max_lon, max_lat) WGS-84.
        target_date:   ISO date string "YYYY-MM-DD".  If no Sentinel-1 pass exists for
                       this exact date, a ±3-day window is tried automatically.
        client_id:     CDSE OAuth2 client ID.
        client_secret: CDSE OAuth2 client secret.
        width/height:  Process API output resolution.  512×512 covers a 5×5 km AOI well.
        threshold_db:  SAR backscatter cut-off in dB.  Pixels with σ° below this are
                       classified as flood.  -20 dB is the open-water standard; loosen to
                       -18 or -15 for turbulent/wind-roughened flood water.

    Returns:
        list[Polygon | MultiPolygon] — same interface as get_flooded_sectors(source='local').

    Raises:
        CDSEUnavailableError: if credentials are missing, auth fails, or the Process API
                              is unreachable.  Caller should fall back to local EMS data.
    """
    if not client_id or not client_secret:
        raise CDSEUnavailableError(
            "CDSE_CLIENT_ID and CDSE_CLIENT_SECRET must be set in the environment. "
            "Register at dataspace.copernicus.eu to obtain OAuth2 client credentials."
        )

    t0 = time.monotonic()

    try:
        token = get_token(client_id, client_secret)
        logger.info("CDSE token acquired in %.1fs", time.monotonic() - t0)
    except requests.HTTPError as exc:
        raise CDSEUnavailableError(f"CDSE authentication failed: {exc}") from exc

    try:
        mask = fetch_flood_mask(bbox, target_date, token, width=width, height=height)
        logger.info("Flood mask fetched in %.1fs total", time.monotonic() - t0)
    except requests.HTTPError as exc:
        raise CDSEUnavailableError(f"Sentinel Hub Process API error: {exc}") from exc

    polygons = mask_to_polygons(mask, bbox, threshold_db=threshold_db)
    logger.info(
        "flood_engine: %d flood polygons at threshold %.0f dB in %.1fs",
        len(polygons), threshold_db, time.monotonic() - t0,
    )
    return polygons


# ─── Step 1: Authentication ────────────────────────────────────────────────────

def get_token(client_id: str, client_secret: str) -> str:
    """OAuth2 client credentials flow → CDSE access token string."""
    resp = requests.post(
        _TOKEN_URL,
        data={
            "client_id":     client_id,
            "client_secret": client_secret,
            "grant_type":    "client_credentials",
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


# ─── Step 2: Sentinel Hub Process API ─────────────────────────────────────────

def fetch_flood_mask(
    bbox: tuple[float, float, float, float],
    target_date: str,
    token: str,
    *,
    width: int = 512,
    height: int = 512,
) -> np.ndarray:
    """
    Call the Sentinel Hub Process API and return a raw σ°×1000 uint8 array (H, W).
    Darker pixel = lower backscatter = more likely flood.  No threshold applied here.

    If the exact target_date has no available scene, retries with a ±3-day window.
    """
    _print_bbox_stats(bbox, width, height)

    mask = _call_process_api(bbox, target_date, target_date, token, width, height)

    if mask is None or mask.max() == 0:
        d = date.fromisoformat(target_date)
        date_from = (d - timedelta(days=3)).isoformat()
        date_to   = (d + timedelta(days=3)).isoformat()
        logger.warning(
            "No Sentinel-1 scene on %s — retrying with %s to %s",
            target_date, date_from, date_to,
        )
        mask = _call_process_api(bbox, date_from, date_to, token, width, height)

    if mask is None:
        mask = np.zeros((height, width), dtype=np.uint8)

    _print_mask_stats(mask)
    return mask


def _call_process_api(
    bbox: tuple[float, float, float, float],
    date_from: str,
    date_to: str,
    token: str,
    width: int,
    height: int,
) -> np.ndarray | None:
    """Single Process API call.  Returns None on 204 No Content (no scene available).

    Payload notes (CDSE Sentinel Hub Process API):
      - bounds.bbox is [min_lon, min_lat, max_lon, max_lat] in CRS84 (default; no crs field needed).
      - dataFilter accepts: timeRange, acquisitionMode, polarization, orbitDirection.
        "resolution" is NOT a valid field and causes a 400 — omit it.
      - evalscript must start with //VERSION=3 as the first character (no leading newline).
    """
    import json as _json

    min_lon, min_lat, max_lon, max_lat = bbox
    payload = {
        "input": {
            "bounds": {
                # CRS84 WGS-84 (lon, lat) is the default — no properties.crs field needed.
                # Adding an unrecognized or wrong crs URI causes a 400.
                "bbox": [min_lon, min_lat, max_lon, max_lat],
            },
            "data": [{
                "type": "sentinel-1-grd",
                "dataFilter": {
                    "timeRange": {
                        "from": f"{date_from}T00:00:00Z",
                        "to":   f"{date_to}T23:59:59Z",
                    },
                    # IW mode with dual-pol VV+VH — standard for European flood events.
                    # "resolution" is not a valid S1-GRD dataFilter key; omit to avoid 400.
                    "acquisitionMode": "IW",
                    "polarization":    "DV",
                },
            }],
        },
        "output": {
            "width":  width,
            "height": height,
            "responses": [{
                "identifier": "default",
                "format":     {"type": "image/png"},
            }],
        },
        "evalscript": _EVALSCRIPT,
    }

    print(f"[flood_engine] Sending to {_PROCESS_URL}:")
    print(_json.dumps(payload, indent=2))

    resp = requests.post(
        _PROCESS_URL,
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=50,
    )

    if resp.status_code == 400:
        print(f"[flood_engine] 400 response body: {resp.text[:1000]}")

    if resp.status_code == 204:
        return None
    resp.raise_for_status()

    img = Image.open(io.BytesIO(resp.content)).convert("L")
    arr = np.array(img, dtype=np.uint8)
    print(f"[flood_engine] API returned image: shape={arr.shape} content-length={len(resp.content)} bytes")
    return arr


# ─── Debug helpers ────────────────────────────────────────────────────────────

def _print_bbox_stats(bbox: tuple[float, float, float, float], width: int, height: int) -> None:
    """Print geographic extent and pixel resolution so we can confirm the AOI is sensible."""
    import math
    min_lon, min_lat, max_lon, max_lat = bbox
    mid_lat = (min_lat + max_lat) / 2
    km_x = (max_lon - min_lon) * math.cos(math.radians(mid_lat)) * 111.32
    km_y = (max_lat - min_lat) * 111.32
    print(f"[flood_engine] BBOX: {bbox}")
    print(
        f"[flood_engine]   Extent: {km_x:.2f} km × {km_y:.2f} km  "
        f"({km_x*km_y:.2f} km²)  at {width}×{height} → "
        f"{km_x*1000/width:.1f} m/px × {km_y*1000/height:.1f} m/px"
    )


def _print_mask_stats(arr: np.ndarray) -> None:
    """Print σ° distribution with dB equivalents and pixel counts at key thresholds."""
    import math

    def px_to_db(px: float) -> str:
        return "< −50" if px <= 0 else f"{10 * math.log10(px / _SIGMA0_SCALE):.1f}"

    mn, mx, mean_val = int(arr.min()), int(arr.max()), float(arr.mean())
    print(
        f"[flood_engine] Raw σ°×{_SIGMA0_SCALE} stats: "
        f"min={mn} ({px_to_db(mn)} dB)  "
        f"mean={mean_val:.1f} ({px_to_db(mean_val)} dB)  "
        f"max={mx} ({px_to_db(mx)} dB)"
    )

    # Show pixel counts at the three most useful flood thresholds
    total = arr.size
    for tdb in (-20, -18, -15):
        tpx = int(10 ** (tdb / 10) * _SIGMA0_SCALE)
        count = int((arr < tpx).sum())
        suggestion = " ← try this" if count > 50 and tdb > -20 else ""
        print(
            f"[flood_engine]   pixels < {tdb} dB  (px<{tpx:3d}): "
            f"{count:6d} / {total} = {count/total*100:.2f}%{suggestion}"
        )


# ─── Step 3: Vectorization ─────────────────────────────────────────────────────

def mask_to_polygons(
    mask: np.ndarray,
    bbox: tuple[float, float, float, float],
    *,
    downsample: int = 16,
    min_cells: int = 1,
    threshold_db: float = -20.0,
) -> list[Union[Polygon, MultiPolygon]]:
    """
    Convert a raw σ°×1000 uint8 mask to WGS-84 Shapely polygons.

    No GDAL, no scipy.  Strategy:
      1. Compute pixel_threshold = int(10**(threshold_db/10) * SIGMA0_SCALE).
         Flood = pixel < threshold (darker = lower backscatter = more likely water).
      2. Downsample 16× with nearest-neighbour → ~32×32 cells for 512-px input.
      3. Each flood cell becomes a geographic bbox aligned to the cell grid.
      4. unary_union merges adjacent cells into contiguous flood polygons.

    Args:
        mask:         uint8 array (H, W); raw σ°×1000 values (0=very dark, 255=very bright).
        bbox:         (min_lon, min_lat, max_lon, max_lat) WGS-84.
        downsample:   Divisor applied to mask dimensions.  16× → ~32×32 for 512-px input.
        min_cells:    Drop polygons covering fewer than this many cells (noise filter).
        threshold_db: SAR backscatter cut-off in dB.  Pixels below = flood.

    Returns:
        List of Shapely Polygon / MultiPolygon objects, ready for inject_flood().
    """
    pixel_threshold = int(10 ** (threshold_db / 10) * _SIGMA0_SCALE)
    print(
        f"[flood_engine] threshold_db={threshold_db:.1f} → "
        f"linear={10**(threshold_db/10):.4f} → pixel_threshold={pixel_threshold} "
        f"(flood = pixel < {pixel_threshold})"
    )

    min_lon, min_lat, max_lon, max_lat = bbox
    h, w = mask.shape

    ds_h = max(1, h // downsample)
    ds_w = max(1, w // downsample)

    small = np.array(
        Image.fromarray(mask).resize((ds_w, ds_h), Image.NEAREST),
        dtype=np.uint8,
    )
    flood_cells = int((small < pixel_threshold).sum())
    total_cells = small.size
    print(
        f"[flood_engine] After {downsample}× downsample ({ds_w}×{ds_h}): "
        f"{flood_cells}/{total_cells} cells classified as flood "
        f"({flood_cells/total_cells*100:.1f}%)"
    )

    rows, cols = np.where(small < pixel_threshold)
    if len(rows) == 0:
        logger.info("mask_to_polygons: no flood cells at threshold %.0f dB — try a higher value", threshold_db)
        return []

    lon_step = (max_lon - min_lon) / ds_w
    lat_step = (max_lat - min_lat) / ds_h

    boxes = [
        shapely_box(
            min_lon +  c      * lon_step,
            max_lat - (r + 1) * lat_step,
            min_lon + (c + 1) * lon_step,
            max_lat -  r      * lat_step,
        )
        for r, c in zip(rows, cols)
    ]

    merged = unary_union(boxes)
    if merged.is_empty:
        return []

    if merged.geom_type == "Polygon":
        result = [merged]
    elif merged.geom_type == "MultiPolygon":
        result = list(merged.geoms)
        if min_cells > 1:
            cell_area = lon_step * lat_step
            result = [g for g in result if g.area >= min_cells * cell_area]
    else:
        # GeometryCollection fallback — extract only usable parts
        result = [g for g in merged.geoms if g.geom_type in ("Polygon", "MultiPolygon")]

    if result:
        sample_coords = list(result[0].exterior.coords)[:5]
        print(
            f"[flood_engine] {len(result)} polygon(s) — "
            f"first polygon exterior (first 5 coords, lon/lat): {sample_coords}"
        )
        print(
            f"[flood_engine] First polygon bounds (minx=west, miny=south, maxx=east, maxy=north): "
            f"{result[0].bounds}"
        )

    return result
