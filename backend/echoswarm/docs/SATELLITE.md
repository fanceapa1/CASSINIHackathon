# SATELLITE.md — Copernicus Satellite Pipeline

## Purpose
Convert Sentinel-1 SAR imagery into flooded sector polygons that the Knowledge Graph can consume. The output of this pipeline is always `list[SectorPolygon]` — the graph and Hermes don't care whether the source is a live API call or a pre-loaded tile.

---

## Dual-Track Strategy (see DECISIONS.md #005)

| Track | When | Data Source | Status |
|-------|------|-------------|--------|
| Phase 1 | Now | Local historical Sentinel-1 tiles (Valencia DANA 2024) | Active |
| Phase 2 | After CDSE access | Live Copernicus Dataspace API | Pending CDSE team |

The graph ingestion function `inject_flood()` is identical in both tracks. Only `get_flooded_sectors()` changes.

---

## Phase 1 — Local Historical Tiles

### Data
- Event: Valencia DANA floods, October 29–30, 2024
- Satellite: Sentinel-1 SAR (C-band, VV polarization)
- Pre-download 3–5 tiles representing flood progression snapshots

### Flood Detection (local)
1. Load GeoTIFF tile with `rasterio`
2. Apply SAR backscatter threshold: pixels below threshold = water
   - Typical threshold: < -18 dB (VV polarization, open water)
3. Vectorize water pixels → GeoJSON polygons
4. Clip to Valencia district bounding box
5. Return as `list[SectorPolygon]`

### Demo Playback
Pre-load tiles T1, T2, T3, T4 (flood progression). During demo, trigger `advance_flood_state()` to move to the next tile. Judges see the flood expanding in real time — architecturally identical to live API.

---

## Phase 2 — Live CDSE API

### Authentication
```python
# OAuth2 Client Credentials flow
POST https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token
  client_id=YOUR_CLIENT_ID
  client_secret=YOUR_CLIENT_SECRET
  grant_type=client_credentials
```

### Product Search
```python
# Search for Sentinel-1 GRD products over Valencia
GET https://catalogue.dataspace.copernicus.eu/odata/v1/Products?
  $filter=Collection/Name eq 'SENTINEL-1' 
    and Attributes/OData.CSC.StringAttribute/any(att:att/Name eq 'productType' and att/OData.CSC.StringAttribute/Value eq 'GRD')
    and OData.CSC.Intersects(area=geography'SRID=4326;POLYGON((...Valencia bbox...))')
  $orderby=ContentDate/Start desc
  $top=1
```

### Download & Process
1. Download the latest GRD tile for Valencia bounding box
2. Apply the same flood detection pipeline as Phase 1 (threshold-based)
3. Feed output polygons into `inject_flood()`

### Polling Interval
- Sentinel-1 revisit time: ~6 days for same-area pass
- For demo: polling every N minutes is a placeholder — real updates happen only when a new pass occurs
- For live demo resilience: always have the latest pre-downloaded tile as fallback

---

## Key Interface (shared between Phase 1 and Phase 2)

```python
def get_flooded_sectors(source: str = 'local') -> list[SectorPolygon]:
    """
    Returns a list of GeoJSON polygons representing currently flooded areas.
    source: 'local' = use pre-loaded historical tiles
            'live'  = query CDSE API for latest Sentinel-1 pass
    """
```

```python
@dataclass
class SectorPolygon:
    polygon: dict      # GeoJSON Polygon geometry
    flood_depth: float # estimated depth in meters (0.0 if unknown)
    timestamp: str     # ISO 8601 of the satellite pass
    source: str        # 'sentinel-1-local' or 'sentinel-1-cdse'
```

---

## Satellite Latency Handling (for judges)
Sentinel-1 does not update in real time. Our answer to judges:
> "In a real deployment, ECHO-SWARM runs on the latest available satellite pass and supplements with ground sensor data or social media signals in the gap. For this demo, we replay a real flood progression from October 2024, tile by tile, to simulate temporal updates."

This is architecturally honest and compelling.

---

## Open Items
- [ ] Confirm CDSE credentials from Data Extraction team
- [ ] Download Valencia DANA October 2024 Sentinel-1 tiles (Phase 1)
- [ ] Choose flood detection method: simple backscatter threshold vs. pre-trained flood model (suggest threshold for 48h constraint)
- [ ] Define exact Valencia bounding box for tile queries
- [ ] Test rasterio + GeoJSON polygon extraction pipeline
