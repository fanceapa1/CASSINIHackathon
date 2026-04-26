"""
src/graph/loader.py — OSM road-network ingestion into Neo4j.

Entry point: load_graph(bbox, driver) → GraphStats

Design contract (from GRAPH.md):
  - Location-agnostic: any BBOX accepted.
  - Dual-Write Strategy: passable:true set directly on [:CONNECTS] edges at
    ingestion, ready for flood injection without pre-processing steps.
  - versioning_strategy on (:Road): "append" for waterway-adjacent roads,
    "replace" for interior roads — governs how RoadState audit history is kept.
  - All Neo4j 5.x constraints and relationship-property indexes created here.
"""

from __future__ import annotations

import logging
import math
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Optional

import requests
import overpy
from neo4j import Driver

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

# Exact query from GRAPH.md — parameterised by bbox floats.
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

# Tried in order; skips to next on 404/connection failure so a dead mirror
# never blocks the pipeline. User-Agent is required by overpass-api.de to
# avoid 406 rate-limit rejections.
_OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",       # official primary
    "https://lz4.overpass-api.de/api/interpreter",   # official secondary (load-balanced)
    "https://overpass.kumi.systems/api/interpreter",  # third-party mirror — last resort
]
_USER_AGENT = "ECHO-SWARM-Hackathon-Bot/1.0"

# km/h defaults used when OSM maxspeed tag is absent
_SPEED_KMH: dict[str, int] = {
    "motorway": 120,
    "trunk": 100,
    "primary": 80,
    "secondary": 60,
    "tertiary": 50,
    "unclassified": 40,
    "residential": 30,
    "living_street": 20,
    "service": 20,
    "path": 5,
    "footway": 5,
    "cycleway": 15,
}

_ROUTABLE_HIGHWAY_TYPES = frozenset(
    ["motorway", "trunk", "primary", "secondary", "tertiary",
     "residential", "unclassified", "living_street", "service"]
)

# Roads whose geometry falls within this distance of a waterway node receive
# versioning_strategy="append" so their RoadState history is never overwritten.
WATERWAY_ADJACENCY_M: float = 50.0

# Neo4j write batch size — keeps transactions from timing out on large BBoxes.
_BATCH_SIZE = 500


# ─────────────────────────────────────────────────────────────────────────────
# Public return type
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class GraphStats:
    n_intersections: int = 0
    n_roads: int = 0
    n_bridges: int = 0
    n_shelters: int = 0
    n_waterways: int = 0
    n_connects_edges: int = 0

    def __str__(self) -> str:
        return (
            f"Intersections={self.n_intersections}  Roads={self.n_roads}  "
            f"Bridges={self.n_bridges}  Shelters={self.n_shelters}  "
            f"Waterways={self.n_waterways}  CONNECTS={self.n_connects_edges}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Geometry helpers
# ─────────────────────────────────────────────────────────────────────────────

def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres between two WGS-84 coordinates."""
    R = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2.0 * R * math.asin(math.sqrt(max(0.0, a)))


def _speed_for_way(tags: dict) -> int:
    """Return travel speed in km/h, respecting the maxspeed OSM tag."""
    raw = tags.get("maxspeed", "")
    if raw:
        try:
            numeric = float("".join(c for c in raw.split()[0] if c.isdigit() or c == "."))
            if "mph" in raw.lower():
                numeric *= 1.60934
            return max(5, int(numeric))
        except (ValueError, IndexError):
            pass
    return _SPEED_KMH.get(tags.get("highway", "residential"), 30)


# ─────────────────────────────────────────────────────────────────────────────
# Schema — constraints and indexes (Neo4j 5.x syntax)
# ─────────────────────────────────────────────────────────────────────────────

def _setup_schema(driver: Driver) -> None:
    statements = [
        # Uniqueness constraints
        "CREATE CONSTRAINT intersection_id IF NOT EXISTS "
        "FOR (n:Intersection) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT road_id IF NOT EXISTS "
        "FOR (n:Road) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT shelter_id IF NOT EXISTS "
        "FOR (n:Shelter) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT flood_event_id IF NOT EXISTS "
        "FOR (n:FloodEvent) REQUIRE n.id IS UNIQUE",
        # Node-property indexes
        "CREATE INDEX intersection_sector IF NOT EXISTS "
        "FOR (n:Intersection) ON (n.sector)",
        # Relationship-property index — critical for routing filter on passable
        "CREATE INDEX connects_passable IF NOT EXISTS "
        "FOR ()-[r:CONNECTS]-() ON (r.passable)",
        # State audit index
        "CREATE INDEX road_state_timestamp IF NOT EXISTS "
        "FOR (s:RoadState) ON (s.timestamp)",
    ]
    with driver.session() as session:
        for stmt in statements:
            session.run(stmt)
    logger.info("Schema constraints and indexes verified.")


# ─────────────────────────────────────────────────────────────────────────────
# Overpass API
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_overpass(
    bbox: tuple[float, float, float, float],
    max_retries: int = 2,
) -> overpy.Result:
    lat_min, lon_min, lat_max, lon_max = bbox
    query = OVERPASS_QUERY.format(
        lat_min=lat_min, lon_min=lon_min,
        lat_max=lat_max, lon_max=lon_max,
    )
    api = overpy.Overpass()
    headers = {"User-Agent": _USER_AGENT}
    last_exc: Exception | None = None

    for url in _OVERPASS_ENDPOINTS:
        for attempt in range(max_retries):
            try:
                logger.info(
                    "Querying Overpass %s (attempt %d/%d) bbox=%s …",
                    url, attempt + 1, max_retries, bbox,
                )
                response = requests.post(
                    url, data={"data": query}, headers=headers, timeout=90,
                )
                response.raise_for_status()
                return api.parse_json(response.text)
            except requests.HTTPError as exc:
                last_exc = exc
                code = exc.response.status_code if exc.response is not None else 0
                if code in (400, 404):
                    # Definitive endpoint failure — skip immediately, no retry
                    logger.warning("Overpass %s returned HTTP %d — trying next endpoint", url, code)
                    break
                # Transient (429 rate-limit, 503 overload) — retry with backoff
                if attempt < max_retries - 1:
                    wait = 2 ** attempt
                    logger.warning("Overpass %s HTTP %d — retrying in %ds", url, code, wait)
                    time.sleep(wait)
            except (requests.ConnectionError, overpy.exception.OverPyException) as exc:
                last_exc = exc
                if attempt < max_retries - 1:
                    wait = 2 ** attempt
                    logger.warning("Overpass %s error: %s — retrying in %ds", url, exc, wait)
                    time.sleep(wait)
                else:
                    logger.warning("Overpass %s failed: %s — trying next endpoint", url, exc)

    raise RuntimeError(
        f"Overpass query failed on all {len(_OVERPASS_ENDPOINTS)} endpoints. "
        f"Last error: {last_exc}"
    )


# ─────────────────────────────────────────────────────────────────────────────
# OSM parsing
# ─────────────────────────────────────────────────────────────────────────────

def _build_node_lookup(result: overpy.Result) -> dict[int, overpy.Node]:
    return {n.id: n for n in result.nodes}


def _classify_ways(
    result: overpy.Result,
    node_lookup: dict[int, overpy.Node],
) -> tuple[list[overpy.Way], list[overpy.Way], list[overpy.Way]]:
    """Split result.ways into (highway_ways, bridge_ways, waterway_ways)."""
    highway_ways: list[overpy.Way] = []
    bridge_ways: list[overpy.Way] = []
    waterway_ways: list[overpy.Way] = []

    for way in result.ways:
        tags = way.tags
        if tags.get("highway") in _ROUTABLE_HIGHWAY_TYPES:
            highway_ways.append(way)
        if tags.get("bridge") == "yes":
            bridge_ways.append(way)
        if tags.get("waterway") in ("river", "stream", "canal"):
            waterway_ways.append(way)

    return highway_ways, bridge_ways, waterway_ways


def _find_intersection_ids(
    highway_ways: list[overpy.Way],
    node_lookup: dict[int, overpy.Node],
) -> set[int]:
    """
    A node qualifies as a routing intersection when it appears in ≥2 highway
    ways, or is the terminal (first/last) node of any highway way.
    Terminal nodes are always included so dead-end streets are reachable as
    route origins or destinations.
    """
    way_count: dict[int, int] = defaultdict(int)
    endpoints: set[int] = set()

    for way in highway_ways:
        # Use the raw node-ID list; safer than way.nodes which may re-query.
        try:
            node_ids = [n.id for n in way.nodes]
        except Exception:
            logger.debug("Could not resolve nodes for way %s — skipping", way.id)
            continue
        if not node_ids:
            continue
        for nid in node_ids:
            way_count[nid] += 1
        endpoints.add(node_ids[0])
        endpoints.add(node_ids[-1])

    return {nid for nid, cnt in way_count.items() if cnt >= 2} | endpoints


def _waterway_coords(waterway_ways: list[overpy.Way]) -> list[tuple[float, float]]:
    """Flat list of (lat, lon) for every node belonging to a waterway way."""
    coords: list[tuple[float, float]] = []
    for way in waterway_ways:
        try:
            for node in way.nodes:
                coords.append((float(node.lat), float(node.lon)))
        except Exception:
            pass
    return coords


def _is_waterway_adjacent(
    road_node_coords: list[tuple[float, float]],
    wcoords: list[tuple[float, float]],
    threshold_m: float = WATERWAY_ADJACENCY_M,
) -> bool:
    """True if any road-geometry node lies within threshold_m of any waterway node."""
    for rlat, rlon in road_node_coords:
        for wlat, wlon in wcoords:
            # Bounding-box pre-filter (≈0.00045° ≈ 50m) before haversine
            if abs(rlat - wlat) > 0.0009 or abs(rlon - wlon) > 0.0009:
                continue
            if haversine_m(rlat, rlon, wlat, wlon) <= threshold_m:
                return True
    return False


def _parse_highway_ways(
    highway_ways: list[overpy.Way],
    intersection_ids: set[int],
    wcoords: list[tuple[float, float]],
) -> tuple[dict[int, dict], list[dict], list[dict]]:
    """
    Parse highway ways into Neo4j-ready dicts.

    Returns:
        intersections  {osm_node_id: Intersection prop dict}
        roads          [Road prop dict]
        edges          [CONNECTS prop dict]   — passable=True on all edges
    """
    intersections: dict[int, dict] = {}
    roads: list[dict] = []
    edges: list[dict] = []

    for way in highway_ways:
        try:
            nodes = way.nodes
        except Exception:
            logger.debug("Skipping way %s — node resolution failed", way.id)
            continue
        if len(nodes) < 2:
            continue

        tags = way.tags
        highway = tags.get("highway", "residential")
        speed_kmh = _speed_for_way(tags)
        road_id = f"osm_way_{way.id}"
        road_name = tags.get("name") or tags.get("ref") or ""
        oneway = tags.get("oneway", "no") in ("yes", "1", "true")

        # Waterway adjacency check using full geometry (all nodes, not just
        # intersections) for accurate 50m threshold from GRAPH.md.
        road_coords = [(float(n.lat), float(n.lon)) for n in nodes]
        versioning = "append" if _is_waterway_adjacent(road_coords, wcoords) else "replace"

        # Road node — total length is sum of all segment lengths
        total_length_m = sum(
            haversine_m(
                float(nodes[i].lat), float(nodes[i].lon),
                float(nodes[i + 1].lat), float(nodes[i + 1].lon),
            )
            for i in range(len(nodes) - 1)
        )
        try:
            lanes = int(tags.get("lanes", 1))
        except (ValueError, TypeError):
            lanes = 1
        try:
            maxspeed = int(tags.get("maxspeed", speed_kmh))
        except (ValueError, TypeError):
            maxspeed = speed_kmh

        roads.append({
            "id": road_id,
            "name": road_name,
            "highway": highway,
            "lanes": lanes,
            "maxspeed_kmh": maxspeed,
            "oneway": oneway,
            "length_m": round(total_length_m, 2),
            "versioning_strategy": versioning,
        })

        # ── Identify intersection nodes in this way, preserving sequence ───
        # pos_to_node: [(position_in_nodes_list, node)] for intersection nodes
        pos_to_node: list[tuple[int, overpy.Node]] = [
            (i, node)
            for i, node in enumerate(nodes)
            if node.id in intersection_ids
        ]

        if len(pos_to_node) < 2:
            # Degenerate way with no traversable intersections — skip edges
            # but still register both endpoints as intersections so they are
            # reachable if used as a route origin/destination.
            for _, node in [(0, nodes[0]), (len(nodes) - 1, nodes[-1])]:
                _register_intersection(intersections, node)
            continue

        for _, node in pos_to_node:
            _register_intersection(intersections, node)

        # ── Build CONNECTS edges between consecutive intersection nodes ─────
        for k in range(len(pos_to_node) - 1):
            pos_a, node_a = pos_to_node[k]
            pos_b, node_b = pos_to_node[k + 1]

            # Sum haversine distances through ALL intermediate geometry nodes
            seg_nodes = nodes[pos_a: pos_b + 1]
            length_m = sum(
                haversine_m(
                    float(seg_nodes[j].lat), float(seg_nodes[j].lon),
                    float(seg_nodes[j + 1].lat), float(seg_nodes[j + 1].lon),
                )
                for j in range(len(seg_nodes) - 1)
            )
            travel_time_min = (length_m / 1000.0) / speed_kmh * 60.0

            from_id = f"osm_node_{node_a.id}"
            to_id = f"osm_node_{node_b.id}"

            fwd: dict = {
                "segment_id": f"{from_id}|{to_id}|{road_id}",
                "from_id": from_id,
                "to_id": to_id,
                "road_id": road_id,
                "road_name": road_name,
                "length_m": round(length_m, 2),
                "travel_time_min": round(travel_time_min, 4),
                "passable": True,
            }
            edges.append(fwd)

            if not oneway:
                rev_from, rev_to = to_id, from_id
                edges.append({
                    **fwd,
                    "segment_id": f"{rev_from}|{rev_to}|{road_id}",
                    "from_id": rev_from,
                    "to_id": rev_to,
                })

    return intersections, roads, edges


def _register_intersection(store: dict[int, dict], node: overpy.Node) -> None:
    if node.id in store:
        return
    store[node.id] = {
        "id": f"osm_node_{node.id}",
        "lat": float(node.lat),
        "lon": float(node.lon),
        # OSM `ele` tag is sparse; Copernicus DEM fill is a Phase-2 open item.
        "elevation": float(node.tags.get("ele") or 0.0),
        "sector": (
            node.tags.get("addr:suburb")
            or node.tags.get("is_in:suburb")
            or node.tags.get("is_in")
            or ""
        ),
    }


def _parse_bridges(bridge_ways: list[overpy.Way]) -> list[dict]:
    bridges = []
    for way in bridge_ways:
        tags = way.tags
        bridges.append({
            "id": f"osm_way_{way.id}_bridge",
            "name": tags.get("name") or tags.get("ref") or "",
            "road_id": f"osm_way_{way.id}",
            "material": tags.get("bridge:structure") or tags.get("material") or "unknown",
        })
    return bridges


def _parse_waterways(waterway_ways: list[overpy.Way]) -> list[dict]:
    waterways = []
    for way in waterway_ways:
        tags = way.tags
        waterways.append({
            "id": f"osm_way_{way.id}",
            "name": tags.get("name") or "",
            "type": tags.get("waterway", "river"),
            "danger_level": 0.0,  # populated by Copernicus pipeline
        })
    return waterways


def _parse_shelters(result: overpy.Result) -> list[dict]:
    shelters = []
    for node in result.nodes:
        amenity = node.tags.get("amenity", "")
        if amenity not in ("shelter", "community_centre", "school", "hospital"):
            continue
        shelters.append({
            "id": f"osm_node_{node.id}",
            "name": node.tags.get("name") or "",
            "address": node.tags.get("addr:street") or "",
            "lat": float(node.lat),
            "lon": float(node.lon),
            "capacity": _parse_int(node.tags.get("capacity"), default=0),
            "type": amenity,
        })
    return shelters


def _parse_int(value: Optional[str], default: int = 0) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


# ─────────────────────────────────────────────────────────────────────────────
# Neo4j writes — batched UNWIND for performance
# ─────────────────────────────────────────────────────────────────────────────

def _write_intersections(driver: Driver, intersections: dict[int, dict]) -> int:
    nodes_list = list(intersections.values())
    if not nodes_list:
        return 0
    with driver.session() as session:
        result = session.run(
            """
            UNWIND $nodes AS n
            MERGE (i:Intersection {id: n.id})
            SET i.lat       = n.lat,
                i.lon       = n.lon,
                i.elevation = n.elevation,
                i.sector    = n.sector
            RETURN count(i) AS cnt
            """,
            nodes=nodes_list,
        )
        return result.single()["cnt"]


def _write_roads(driver: Driver, roads: list[dict]) -> int:
    if not roads:
        return 0
    with driver.session() as session:
        result = session.run(
            """
            UNWIND $roads AS r
            MERGE (road:Road {id: r.id})
            SET road.name                = r.name,
                road.highway             = r.highway,
                road.lanes               = r.lanes,
                road.maxspeed_kmh        = r.maxspeed_kmh,
                road.oneway              = r.oneway,
                road.length_m            = r.length_m,
                road.versioning_strategy = r.versioning_strategy
            RETURN count(road) AS cnt
            """,
            roads=roads,
        )
        return result.single()["cnt"]


def _write_connects(driver: Driver, edges: list[dict]) -> int:
    """
    Write [:CONNECTS] edges in batches.

    Uses MERGE on segment_id so the loader is idempotent across restarts.
    passable=True is set at ingestion; inject_flood() will flip it to False.
    travel_time_min is NOT changed on flood — the passable flag is the gate
    (see Dual-Write Strategy in GRAPH.md).
    """
    total = 0
    for i in range(0, len(edges), _BATCH_SIZE):
        batch = edges[i: i + _BATCH_SIZE]
        with driver.session() as session:
            result = session.run(
                """
                UNWIND $edges AS e
                MATCH (a:Intersection {id: e.from_id})
                MATCH (b:Intersection {id: e.to_id})
                MERGE (a)-[c:CONNECTS {segment_id: e.segment_id}]->(b)
                SET c.road_id         = e.road_id,
                    c.road_name       = e.road_name,
                    c.length_m        = e.length_m,
                    c.travel_time_min = e.travel_time_min,
                    c.passable        = e.passable
                RETURN count(c) AS cnt
                """,
                edges=batch,
            )
            total += result.single()["cnt"]
    return total


def _write_bridges(driver: Driver, bridges: list[dict]) -> int:
    if not bridges:
        return 0
    with driver.session() as session:
        result = session.run(
            """
            UNWIND $bridges AS b
            MERGE (br:Bridge {id: b.id})
            SET br.name     = b.name,
                br.road_id  = b.road_id,
                br.material = b.material
            WITH br, b
            MATCH (r:Road {id: b.road_id})
            MERGE (br)-[:PART_OF]->(r)
            RETURN count(br) AS cnt
            """,
            bridges=bridges,
        )
        return result.single()["cnt"]


def _write_waterways(driver: Driver, waterways: list[dict]) -> int:
    if not waterways:
        return 0
    with driver.session() as session:
        result = session.run(
            """
            UNWIND $ww AS w
            MERGE (wn:Waterway {id: w.id})
            SET wn.name         = w.name,
                wn.type         = w.type,
                wn.danger_level = w.danger_level
            RETURN count(wn) AS cnt
            """,
            ww=waterways,
        )
        return result.single()["cnt"]


def _write_shelters(driver: Driver, shelters: list[dict]) -> int:
    if not shelters:
        return 0
    with driver.session() as session:
        result = session.run(
            """
            UNWIND $shelters AS s
            MERGE (sh:Shelter {id: s.id})
            SET sh.name     = s.name,
                sh.address  = s.address,
                sh.lat      = s.lat,
                sh.lon      = s.lon,
                sh.capacity = s.capacity,
                sh.type     = s.type
            RETURN count(sh) AS cnt
            """,
            shelters=shelters,
        )
        return result.single()["cnt"]


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def load_graph(
    bbox: tuple[float, float, float, float],
    driver: Driver,
) -> GraphStats:
    """
    Ingest OSM road network for *any* bounding box into Neo4j.

    Args:
        bbox:   (lat_min, lon_min, lat_max, lon_max) in WGS-84 decimal degrees.
                Valencia/Paiporta test bbox: (39.4165, -0.4197, 39.4372, -0.3891)
        driver: Active neo4j.Driver instance.

    Returns:
        GraphStats with counts of each node/edge type written.

    Side-effects:
        • Creates Neo4j constraints and relationship-property indexes.
        • MERGE semantics — safe to call multiple times (idempotent).
        • All [:CONNECTS] edges are written with passable=True.
          Call inject_flood() (queries.py) to flip specific edges.
    """
    stats = GraphStats()

    # 1. Schema — must run before any MERGE that relies on unique constraints.
    _setup_schema(driver)

    # 2. Pull OSM data.
    result = _fetch_overpass(bbox)
    node_lookup = _build_node_lookup(result)
    logger.info(
        "Overpass returned %d nodes, %d ways, %d relations",
        len(result.nodes), len(result.ways), len(result.relations),
    )

    # 3. Classify ways by type.
    highway_ways, bridge_ways, waterway_ways = _classify_ways(result, node_lookup)
    logger.info(
        "Classified: %d highway, %d bridge, %d waterway ways",
        len(highway_ways), len(bridge_ways), len(waterway_ways),
    )

    # 4. Pre-compute waterway geometry for adjacency checks (done once here,
    #    not per-road, so O(waterway_nodes) not O(roads × waterway_nodes)).
    wcoords = _waterway_coords(waterway_ways)

    # 5. Identify routing intersection nodes.
    intersection_ids = _find_intersection_ids(highway_ways, node_lookup)
    logger.info("Identified %d routing intersection nodes", len(intersection_ids))

    # 6. Parse all entity types.
    intersections, roads, edges = _parse_highway_ways(
        highway_ways, intersection_ids, wcoords
    )
    bridges = _parse_bridges(bridge_ways)
    waterways = _parse_waterways(waterway_ways)
    shelters = _parse_shelters(result)

    logger.info(
        "Parsed: %d intersections, %d roads, %d edges, "
        "%d bridges, %d waterways, %d shelters",
        len(intersections), len(roads), len(edges),
        len(bridges), len(waterways), len(shelters),
    )

    # 7. Write to Neo4j — order matters: nodes before relationships.
    stats.n_intersections = _write_intersections(driver, intersections)
    stats.n_roads = _write_roads(driver, roads)
    stats.n_bridges = _write_bridges(driver, bridges)
    stats.n_waterways = _write_waterways(driver, waterways)
    stats.n_shelters = _write_shelters(driver, shelters)
    stats.n_connects_edges = _write_connects(driver, edges)

    logger.info("Graph load complete — %s", stats)
    return stats
