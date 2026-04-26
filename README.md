# ECHO-SWARM Flood Risk Dashboard

[Watch the demo](./demo.mp4)

ECHO-SWARM is a hackathon prototype for EU flood-risk inspection and evacuation simulation. The frontend shows EU country and ADM1 administrative boundaries, sourced flood-risk scores, and Copernicus-backed observed flood extent when the backend can compute it. The backend exposes a FastAPI bridge around Copernicus/CDSE flood processing, Neo4j graph refreshes, and the swarm simulation UI.

## Repository Layout

- `frontend/`: React, TypeScript, Vite, MapLibre dashboard.
- `frontend/public/data/`: EU GISCO country boundaries and cached ADM1 boundary data.
- `backend/echoswarm/`: FastAPI bridge, Sentinel-1 flood processing, Neo4j graph loading, Hermes/swarm simulation code.
- `backend/echoswarm/docs/`: Architecture notes for graph, satellite, Hermes, swarm, and integration contracts.

## Data Policy

The dashboard is EU-only. It should not label the product as covering non-EU countries unless those sources are intentionally added later.

Sidebar metrics follow a source-backed-only rule:

- Country flood risk uses JRC/DRMKC INFORM Risk Index 2026 flood components.
- Country boundaries use GISCO 2024 EU country geometry.
- ADM1 boundaries use the bundled boundary cache and geoBoundaries fallback.
- Observed flood extent uses Copernicus Data Space Sentinel-1 processing when CDSE credentials are configured.
- Local Copernicus EMSR773 Valencia data is used only when the selected area overlaps that local fallback.
- Unsupported values are displayed as `-`, not generated estimates.

Source references:

- JRC INFORM Risk: https://drmkc.jrc.ec.europa.eu/inform-index/INFORM-Risk/Results-and-data
- Copernicus Sentinel Hub APIs: https://dataspace.copernicus.eu/analyse/apis/sentinel-hub
- Copernicus CEMS data: https://documentation.dataspace.copernicus.eu/Data/CopernicusServices/CEMS.html
- geoBoundaries API: https://www.geoboundaries.org/api.html

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The Vite app defaults to http://localhost:5173.

Useful frontend commands:

```bash
npm run build
npm run lint
npm run preview
```

Optional frontend environment:

```bash
VITE_ECHOSWARM_API_URL=http://localhost:8000
VITE_ECHOSWARM_UI_URL=http://localhost:8000/ui/swarm
```

## Backend Setup

Start Neo4j:

```bash
cd backend/echoswarm
docker compose up -d
```

Install and run the API:

```bash
cd backend/echoswarm
uv sync
PYTHONPATH=src uv run uvicorn api:app --reload --port 8000
```

The API defaults to http://localhost:8000.

Useful backend endpoints:

- `GET /ui/swarm`: embedded swarm simulation UI.
- `POST /api/selected-area/flood-summary`: read-only selected-area flood extent summary.
- `POST /api/refresh_map`: rebuild graph for a bounding box and inject flood data.
- `POST /satellite/refresh`: refresh Sentinel-1 flood data into the graph.
- `GET /api/topology`: graph topology payload for visualizations.

## Backend Environment

```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=echoswarm

CDSE_CLIENT_ID=
CDSE_CLIENT_SECRET=

ANTHROPIC_API_KEY=
GROQ_API_KEY=
```

`CDSE_CLIENT_ID` and `CDSE_CLIENT_SECRET` are optional. Without them, selected-area flood summaries return `-` unless the area overlaps the local Valencia EMSR773 fallback and that file is available.

## Build Checklist

```bash
cd frontend
npm run lint
npm run build
```

```bash
cd backend/echoswarm
PYTHONPATH=src uv run python - <<'PY'
from fastapi.testclient import TestClient
from api import app

client = TestClient(app)
response = client.post("/api/selected-area/flood-summary", json={
    "area_id": "smoke",
    "name": "Smoke Area",
    "country_code": "RO",
    "bbox": [23.0, 45.0, 24.0, 46.0],
})
print(response.status_code)
print(response.json())
PY
```
