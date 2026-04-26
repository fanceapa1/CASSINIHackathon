# GRAPH.md — Spatial Knowledge Graph

## Purpose
The Neo4j graph is the shared reality of ECHO-SWARM. Every other component reads from or writes to it. No component bypasses the graph to make routing decisions. The graph is **completely location-agnostic** — it is constructed dynamically from any BBOX input via the Overpass API.

---

## Ontological Framework: Three-Domain Model
Based on Zhang et al. (2025), "More intelligent knowledge graph" — the paper in `/inspiration`.

```
Event Domain  ──drives──>  Object Domain  ──has──>  State Domain
(the crisis)               (the entities)            (what changed, when)
```

- **Event Domain**: The flood event itself — what triggered the crisis, its progression phases
- **Object Domain**: All geographic entities — roads, bridges, shelters, waterways, sectors (real) + evacuation routes, flood polygons (virtual)
- **State Domain**: Temporal snapshots of object states — what a road's status was at a given timestamp

---

## Domain 1: Event Domain Nodes

```cypher
(:FloodEvent {
  id:         STRING,    // e.g. "flood_paiporta_20241029_001"
  name:       STRING,    // human-readable label
  type:       STRING,    // "flash_flood" | "riverine_flood" | "urban_flood"
  severity:   STRING,    // "minor" | "moderate" | "severe" | "catastrophic"
  source:     STRING,    // "sentinel-1" | "ground_sensor" | "manual"
  bbox:       STRING,    // GeoJSON polygon of affected area
  start_time: DATETIME,
  updated_at: DATETIME
})
```

Events chain into flood progression phases:
```cypher
(:FloodEvent)-[:EVOLVES_INTO]->(:FloodEvent)
// e.g. "river_breach" → "urban_flooding" → "road_cascade_failure"
```

---

## Domain 2: Object Domain Nodes

### Real Geographic Objects (loaded from Overpass, any BBOX)

```cypher
(:Intersection {
  id:                  STRING,   // OSM node ID, prefixed "osm_node_"
  lat:                 FLOAT,
  lon:                 FLOAT,
  elevation:           FLOAT,    // meters ASL (Copernicus DEM or OSM ele tag)
  sector:              STRING    // administrative zone name
})

(:Road {
  id:                  STRING,   // OSM way ID, prefixed "osm_way_"
  name:                STRING,
  highway:             STRING,   // motorway|primary|secondary|tertiary|residential|path
  lanes:               INTEGER,
  maxspeed_kmh:        INTEGER,
  oneway:              BOOLEAN,
  length_m:            FLOAT,    // computed from geometry
  versioning_strategy: STRING    // "append" (waterway-adjacent) | "replace" (interior)
})

(:Bridge {
  id:          STRING,
  name:        STRING,
  road_id:     STRING,   // parent road OSM way ID
  material:    STRING    // concrete|steel|stone|unknown
})

(:Waterway {
  id:           STRING,
  name:         STRING,
  type:         STRING,  // river|stream|canal
  danger_level: FLOAT    // water level threshold triggering road impact (meters)
})

(:Shelter {
  id:       STRING,
  name:     STRING,
  address:  STRING,
  lat:      FLOAT,
  lon:      FLOAT,
  capacity: INTEGER,
  type:     STRING    // community_centre|school|stadium|emergency_shelter
})

(:Sector {
  id:         STRING,
  name:       STRING,
  bbox:       STRING,    // GeoJSON polygon
  population: INTEGER    // from WorldPop or OSM population tag
})
```

### Virtual Geographic Objects (computed/derived)

```cypher
(:EvacuationRoute {
  id:                 STRING,
  origin_id:          STRING,
  destination_id:     STRING,
  computed_at:        DATETIME,
  total_length_m:     FLOAT,
  estimated_time_min: FLOAT
})

(:FloodPolygon {
  id:        STRING,
  geojson:   STRING,    // GeoJSON Polygon geometry
  source:    STRING,    // "sentinel-1-local" | "sentinel-1-cdse"
  tile_id:   STRING,    // Sentinel-1 product ID
  timestamp: DATETIME
})

(:SimulationRun {
  id:              STRING,
  scenario_id:     STRING,
  flood_event_id:  STRING,
  hermes_message:  STRING,
  n_agents:        INTEGER,
  evacuation_rate: FLOAT,
  decay_curve:     STRING,  // JSON array
  run_at:          DATETIME
})
```

---

## Domain 3: State Domain Nodes

State nodes are **separate from object nodes**. They are never modified in-place. New state = new node.

```cypher
(:RoadState {
  id:          STRING,
  passable:    BOOLEAN,   // true = can route through; false = blocked
  flood_depth: FLOAT,     // meters (0.0 if dry)
  cause:       STRING,    // "flood" | "collapse" | "congestion" | "manual"
  timestamp:   DATETIME,
  source:      STRING     // what triggered this state change (e.g. flood_event_id)
})

(:ShelterState {
  id:                 STRING,
  current_occupancy:  INTEGER,
  available_capacity: INTEGER,
  status:             STRING,   // "open" | "full" | "closed"
  timestamp:          DATETIME
})

(:WaterwayState {
  id:          STRING,
  water_level: FLOAT,   // meters
  alert_level: STRING,  // "normal" | "watch" | "warning" | "emergency"
  timestamp:   DATETIME
})
```

---

## Relationships

### Spatial Topology (static, loaded at ingestion)
```cypher
// Core routing edges — see "Dual-Write Strategy" section below
(:Intersection)-[:CONNECTS {
  road_id:         STRING,
  road_name:       STRING,
  length_m:        FLOAT,
  travel_time_min: FLOAT,   // baseline (dry, no congestion)
  passable:        BOOLEAN  // TRUE at ingestion; updated on flood injection
}]->(:Intersection)

(:Bridge)-[:PART_OF]->(:Road)
(:Intersection)-[:IN_SECTOR]->(:Sector)
(:Shelter)-[:IN_SECTOR]->(:Sector)
(:Waterway)-[:FLOWS_THROUGH]->(:Sector)
(:Road)-[:ADJACENT_TO]->(:Waterway)  // set if road OSM geometry is within 50m of waterway
```

### State Relationships (dynamic, written by Copernicus pipeline)
```cypher
(:Road)-[:HAS_STATE]->(:RoadState)
(:Shelter)-[:HAS_STATE]->(:ShelterState)
(:Waterway)-[:HAS_STATE]->(:WaterwayState)
```

### Event Causality
```cypher
(:FloodEvent)-[:CAUSES_STATE_CHANGE]->(:RoadState)
(:FloodEvent)-[:AFFECTS]->(:Road)
(:FloodEvent)-[:INUNDATES]->(:Sector)
(:FloodPolygon)-[:REPRESENTS]->(:FloodEvent)
(:FloodEvent)-[:EVOLVES_INTO]->(:FloodEvent)
```

### Virtual Object Relationships
```cypher
(:EvacuationRoute)-[:STARTS_AT]->(:Intersection)
(:EvacuationRoute)-[:ENDS_AT]->(:Shelter)
(:EvacuationRoute)-[:USES {order: INTEGER}]->(:Road)
```

---

## Dual-Write Strategy (Routing Performance + Audit History)

This is the core performance decision for Neo4j routing.

### The Problem
Neo4j GDS pathfinding algorithms (Dijkstra, A*) and `apoc.algo.dijkstra` require the
routing weight to be a **direct property on the relationship**. They cannot traverse out
to a separate `(:RoadState)` node mid-algorithm. If we relied on RoadState nodes alone,
every shortest-path query would require an expensive pre-processing step.

### Why NOT weight=9999 for impassable roads
Using a very large weight (e.g. 9999) to "block" impassable roads is a common hack but
is semantically wrong: the algorithm may still route through it if no alternative exists,
returning a path through a flooded road with no error. This silently produces wrong results.

### The Correct Dual-Write Approach
On every flood state change, we write to **two places in a single atomic transaction**:

**Write 1 — The Audit Log (RoadState node):**
```cypher
CREATE (s:RoadState {
  id: $state_id,
  passable: false,
  flood_depth: $depth,
  cause: "flood",
  timestamp: $ts,
  source: $flood_event_id
})
MATCH (r:Road {id: $road_id})
CREATE (r)-[:HAS_STATE]->(s)
CREATE (fe:FloodEvent {id: $flood_event_id})-[:CAUSES_STATE_CHANGE]->(s)
```

**Write 2 — The Routing Edge (direct property):**
```cypher
MATCH (:Intersection)-[c:CONNECTS {road_id: $road_id}]->(:Intersection)
SET c.passable = false
// NOTE: travel_time_min is NOT changed. The passable flag is the gate.
```

### How Routing Queries Use This
Pathfinding filters on `passable` BEFORE the algorithm runs:
```cypher
// Get all currently passable edges as a virtual graph, then find shortest path
MATCH path = shortestPath(
  (start:Intersection {id: $origin})-[:CONNECTS*]->(end:Intersection {id: $dest})
)
WHERE ALL(r IN relationships(path) WHERE r.passable = true)
RETURN [n IN nodes(path) | n.id] AS route, 
       reduce(t = 0, r IN relationships(path) | t + r.travel_time_min) AS total_time
```

This is semantically correct: impassable roads are simply absent from the valid solution space.

### Hybrid Versioning (which roads get state history)
- **Roads with `[:ADJACENT_TO]->(:Waterway)`**: APPEND new RoadState nodes on each change.
  Full temporal history. The `versioning_strategy: "append"` property is set at ingestion.
- **All other roads**: REPLACE — detach old RoadState, attach new one.
  The `versioning_strategy: "replace"` property is set at ingestion.
- The `passable` flag on `[:CONNECTS]` is ALWAYS updated (regardless of versioning strategy).
- Strategy is stored as a property on `(:Road)` nodes so it can be changed per-road without
  schema migrations.

---

## Data Sources (Location-Agnostic)

| Data | Source | OSM Tags / API |
|------|--------|----------------|
| Road network | Overpass API | `way["highway"~"motorway\|trunk\|primary\|secondary\|tertiary\|residential"]` |
| Bridges | Overpass API | `way["bridge"="yes"]` |
| Intersections | Derived from OSM ways | Junction nodes from way geometry |
| Shelters | Overpass API | `node["amenity"~"shelter\|community_centre\|school\|hospital"]` |
| Waterways | Overpass API | `way["waterway"~"river\|stream\|canal"]` |
| Admin sectors | Overpass API | `relation["admin_level"~"8\|9\|10"]` |
| Elevation | Copernicus DEM (30m) or OSM `ele` tag | Open Topography API or copernicus.eu/en/datasets |
| Population | WorldPop (100m resolution, global) | worldpop.org open data |
| Flood polygons | Copernicus Sentinel-1 | See SATELLITE.md |

---

## Overpass Query Template (BBOX-parameterized)

```python
OVERPASS_QUERY = """
[out:json][timeout:60];
(
  way["highway"~"motorway|trunk|primary|secondary|tertiary|residential"]
    ({lat_min},{lon_min},{lat_max},{lon_max});
  way["bridge"="yes"]
    ({lat_min},{lon_min},{lat_max},{lon_max});
  way["waterway"~"river|stream|canal"]
    ({lat_min},{lon_min},{lat_max},{lon_max});
  node["amenity"~"shelter|community_centre|school|hospital"]
    ({lat_min},{lon_min},{lat_max},{lon_max});
  relation["admin_level"~"8|9|10"]
    ({lat_min},{lon_min},{lat_max},{lon_max});
  node(w);
);
out body;
>;
out skel qt;
"""
# Example: Paiporta, Valencia test BBOX
# lat_min=39.4165, lon_min=-0.4197, lat_max=39.4372, lon_max=-0.3891
```

---

## Key Functions (to implement in `graph/queries.py`)

### `load_graph(bbox: tuple[float,float,float,float]) → GraphStats`
Pull OSM data from Overpass for any BBOX. Parse nodes/ways/relations. Load into Neo4j.
Set `versioning_strategy` on Road nodes based on waterway adjacency (within 50m).
Return stats: `{n_intersections, n_roads, n_bridges, n_shelters, n_waterways}`.

### `inject_flood(flood_polygon: SectorPolygon, flood_event_id: str) → int`
Find all `[:CONNECTS]` edges where both endpoint Intersections fall within the polygon.
For each affected road:
1. Create new `(:RoadState {passable: false, ...})` node (always, for audit)
2. Link it: `(:Road)-[:HAS_STATE]->(state)` (append or replace per versioning_strategy)
3. Update edge property: `SET c.passable = false` on all `[:CONNECTS]` for that road
All in a single Cypher transaction. Return count of affected edges.

### `get_evacuation_route(origin_id: str, destination_id: str) → RouteResult`
Shortest path filtering on `passable = true`. Uses Cypher `shortestPath` with WHERE clause.
Returns `{path: list[str], total_time_min: float, total_length_m: float}`.
Raises `NoRouteError` if destination is unreachable (do NOT silently return a flooded path).

### `reset_flood(flood_event_id: str) → int`
Restore all edges affected by a specific flood event to `passable = true`.
Create new `(:RoadState {passable: true, cause: "reset"})` nodes.
Used between simulation runs. Returns count of restored edges.

### `get_graph_context(sector: str) → dict`
Returns structured JSON for Hermes:
`{affected_sectors, flooded_roads, open_routes, shelters, satellite_source, flood_event_id}`

---

## Neo4j Constraints & Indexes

```cypher
// Neo4j 5.x syntax
CREATE CONSTRAINT intersection_id IF NOT EXISTS
  FOR (n:Intersection) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT road_id IF NOT EXISTS
  FOR (n:Road) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT shelter_id IF NOT EXISTS
  FOR (n:Shelter) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT flood_event_id IF NOT EXISTS
  FOR (n:FloodEvent) REQUIRE n.id IS UNIQUE;

CREATE INDEX intersection_sector IF NOT EXISTS
  FOR (n:Intersection) ON (n.sector);

CREATE INDEX connects_passable IF NOT EXISTS
  FOR ()-[r:CONNECTS]-() ON (r.passable);

CREATE INDEX road_state_timestamp IF NOT EXISTS
  FOR (s:RoadState) ON (s.timestamp);
```

---

## Open Items
- [ ] Confirm Neo4j 5.x Community vs. Enterprise (GDS library requires specific edition)
- [ ] Decide elevation source: Copernicus DEM API call at ingestion vs. OSM `ele` tag (OSM is faster but sparse)
- [ ] WorldPop API integration or manual download for population data
- [ ] Define the 50m waterway adjacency threshold (should it be configurable in config.py?)
- [ ] Confirm APOC library availability in Docker Neo4j image (required for some path queries)
