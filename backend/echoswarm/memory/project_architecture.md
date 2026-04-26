---
name: ECHO-SWARM architecture decisions
description: Locked architectural choices — Dual-Write Strategy, tech stack, Valencia BBOX, APOC
type: project
---

All decisions are locked. Do not propose changing them without strong reason.

**Dual-Write Strategy (core performance decision):**
On every flood state change, write atomically to two places:
1. `:RoadState` node (audit log, append or replace per versioning_strategy on Road)
2. `passable` boolean directly on `[:CONNECTS]` edges (routing gate)
Never use weight=9999 hack — it silently routes through flooded roads.
Routing query filters `WHERE ALL(r IN relationships(path) WHERE r.passable = true)`.

**versioning_strategy on (:Road) nodes:**
- "append" — roads with `[:ADJACENT_TO]->(:Waterway)` within 50m (full history)
- "replace" — all other roads (single current state)
Set at ingestion time in loader.py; stored on Road node for runtime flexibility.

**Tech stack (locked):**
- Neo4j 5.26 Community Edition + APOC (Docker)
- Python 3.11+, `uv` for package management
- `overpy` for Overpass API queries
- `anthropic` SDK (claude-sonnet-4-6) for Hermes
- `shapely` + `pyproj` for geometry
- `pydantic` v2 for data models

**Valencia test BBOX:** lat_min=39.4165, lon_min=-0.4197, lat_max=39.4372, lon_max=-0.3891 (Paiporta district, ~5km×5km)

**Neo4j auth:** neo4j/echoswarm (docker-compose default)
**Ports:** 7474 (Browser), 7687 (Bolt)

**Routing algorithm (CONFIRMED DEVIATION from GRAPH.md spec):**
GRAPH.md shows `shortestPath(...) WHERE ALL(r.passable=true)`. This is WRONG for correctness:
shortestPath finds the fewest-hops path first, then applies WHERE as a post-filter. If the
direct path is flooded, it returns null even when a passable detour exists.
CORRECT approach (implemented in queries.py): bounded variable-length path `[:CONNECTS*..40]`
where WHERE prunes DURING traversal, then ORDER BY travel_time_min ASC LIMIT 1.

**Key files:**
- `docker-compose.yml` — Neo4j 5.26 + APOC
- `pyproject.toml` — uv deps (groq + anthropic both installed)
- `src/graph/loader.py` — load_graph(bbox, driver) → GraphStats (Phase 1)
- `src/graph/queries.py` — inject_flood, get_evacuation_route, reset_flood, get_graph_context (Phase 1)
- `src/config.py` — LLM_PROVIDER switch: "groq" (default) | "anthropic"
- `src/hermes/engine.py` — HermesEngine: CERC generation + Clarity Validator (Phase 3)
- `sops/` — Learning Loop SOP modifiers, loaded at HermesEngine init (Phase 5)

**Overpass query:** Exact query in GRAPH.md — fetches highway ways, bridge ways, waterway ways, amenity nodes (shelters), admin relations, plus all referenced nodes via node(w) + recurse.

**How to apply:** Before suggesting any routing, flood-injection, or schema change, verify it respects the Dual-Write contract above.
