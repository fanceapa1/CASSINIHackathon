"""
src/graph/queries.py — Flood injection, evacuation routing, and graph state reads.

Public API:
    inject_flood(polygon, flood_event_id, driver) → int
    get_evacuation_route(origin_id, destination_id, driver) → RouteResult
    reset_flood(flood_event_id, driver) → int
    get_graph_context(sector, driver) → dict

Dual-Write Contract (GRAPH.md):
  Every state change writes atomically to two places:
    1. (:RoadState) node     — immutable audit log
    2. [:CONNECTS].passable  — routing gate, read by every path query

Routing note: uses bounded variable-length path (not shortestPath) so the
passable=true WHERE filter prunes DURING traversal. shortestPath+WHERE is a
post-filter that returns null when the shortest hop-count path is flooded,
even if a passable detour exists — which would silently break the demo.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Union

import shapely.geometry
from loguru import logger
from neo4j import Driver


# ─────────────────────────────────────────────────────────────────────────────
# Public types
# ─────────────────────────────────────────────────────────────────────────────

# Matches the CDSE team's Phase-2 output interface: get_flooded_sectors() → list[FloodPolygon]
FloodPolygon = Union[shapely.geometry.Polygon, shapely.geometry.MultiPolygon]


@dataclass
class RouteResult:
    path: list[str]        # ordered Intersection IDs, origin → destination
    total_time_min: float
    total_length_m: float


class NoRouteError(Exception):
    """
    Raised when no passable route exists between origin and destination.
    Never silently return a path that traverses a flooded road.
    """


# ─────────────────────────────────────────────────────────────────────────────
# inject_flood
# ─────────────────────────────────────────────────────────────────────────────

def inject_flood(
    polygon: FloodPolygon,
    flood_event_id: str,
    driver: Driver,
    *,
    flood_depth: float = 1.0,
    proximity_buffer_deg: float = 0.007,
) -> int:
    """
    Mark all roads with at least one endpoint near *polygon* as impassable.

    Dual-Write (single atomic transaction):
      Write 1 — (:RoadState {passable:false}) audit node per affected road,
                 append or replace per Road.versioning_strategy.
      Write 2 — [:CONNECTS].passable = false on all edges for affected roads.

    Args:
        polygon:               Shapely Polygon/MultiPolygon in WGS-84. Coordinates
                               are (lon, lat) — Shapely's (x, y) convention.
        flood_event_id:        Logical flood event ID.  FloodEvent node is MERGE'd
                               so multiple inject_flood calls can share one event.
        driver:                Active Neo4j driver.
        flood_depth:           Flood depth in metres recorded on each RoadState node.
        proximity_buffer_deg:  If strict containment finds 0 intersections, expand
                               the polygon by this many WGS-84 degrees (≈111 km/deg)
                               before retrying.  0.007 ≈ 780 m — enough to capture
                               road intersection nodes that sit on elevated centerlines
                               between EMSR land-parcel flood polygons.  Set to 0 to
                               disable the fallback.

    Returns:
        Count of [:CONNECTS] edges set to passable=false.
    """
    # ── Step 1: Python-side spatial filter ───────────────────────────────────
    # Fetch all Intersection coordinates once, then filter with Shapely.
    # Cheaper than a round-trip per node; fine for ≤1 500-node demo district.
    all_nodes = _fetch_all_intersections(driver)

    flooded_ids = _nodes_inside(all_nodes, polygon)

    if not flooded_ids:
        # Check for lat/lon flip: if Neo4j nodes were stored with axes swapped,
        # Point(lon, lat) will miss the polygon.  Try Point(lat, lon) and log
        # loudly so it can be caught and fixed in the loader.
        flipped_ids = _nodes_inside(all_nodes, polygon, swap_axes=True)
        if flipped_ids:
            logger.error(
                "inject_flood: LAT/LON FLIP DETECTED — {} intersections found "
                "only when axes are swapped (i.lat stores longitude, i.lon stores "
                "latitude).  Fix _register_intersection in loader.py.  "
                "Proceeding with swapped axes as a temporary workaround (event={}).",
                len(flipped_ids), flood_event_id,
            )
            flooded_ids = flipped_ids

    if not flooded_ids and proximity_buffer_deg > 0:
        # EMSR flood polygons trace flooded *land parcels* (fields, properties),
        # not road corridors.  Road centerline intersection nodes often fall in
        # the narrow gaps between polygons even when the road is genuinely
        # impassable.  Buffering captures these near-misses.
        approx_m = proximity_buffer_deg * 111_320
        logger.warning(
            "inject_flood: 0 intersections inside polygon — retrying with "
            "{:.4f}° proximity buffer (~{:.0f} m) (event={})",
            proximity_buffer_deg, approx_m, flood_event_id,
        )
        flooded_ids = _nodes_inside(all_nodes, polygon.buffer(proximity_buffer_deg))

    if not flooded_ids:
        logger.warning(
            "inject_flood: polygon contains NO intersections even after buffer "
            "(event={}) — check that the flood polygon overlaps the loaded graph BBOX",
            flood_event_id,
        )
        return 0
    logger.info(
        "inject_flood: {} intersections inside flood zone (event={})",
        len(flooded_ids), flood_event_id,
    )

    # ── Step 2: Identify affected road_ids ───────────────────────────────────
    # A road is blocked when AT LEAST ONE endpoint is within the flood polygon.
    # (Changed from AND → OR: flood at either end makes the segment impassable,
    # and the original AND missed all boundary roads where one node is just
    # outside the polygon.)
    affected = _find_affected_roads(driver, flooded_ids)
    if not affected:
        logger.warning(
            "inject_flood: flooded_ids={} nodes but _find_affected_roads returned 0 roads "
            "(event={}) — CONNECTS edges may be missing road_id or Road nodes absent",
            len(flooded_ids), flood_event_id,
        )
        return 0

    replace_roads = [r["road_id"] for r in affected if r["strategy"] != "append"]
    append_roads  = [r["road_id"] for r in affected if r["strategy"] == "append"]
    all_road_ids  = [r["road_id"] for r in affected]
    logger.info(
        "inject_flood: {} affected roads — {} replace / {} append (event={})",
        len(all_road_ids), len(replace_roads), len(append_roads), flood_event_id,
    )

    # ── Step 3: Atomic dual-write transaction ─────────────────────────────────
    with driver.session() as session:
        with session.begin_transaction() as tx:

            # A ── "replace" roads: remove current state, create new one.
            #      FOREACH trick handles the null case (road with no prior state).
            if replace_roads:
                tx.run(
                    """
                    UNWIND $road_ids AS road_id
                    MATCH (r:Road {id: road_id})
                    OPTIONAL MATCH (r)-[:HAS_STATE]->(old:RoadState)
                    WITH r, road_id, collect(old) AS old_states
                    FOREACH (s IN old_states | DETACH DELETE s)
                    CREATE (ns:RoadState {
                        id:          road_id + '__' + $feid,
                        passable:    false,
                        flood_depth: $depth,
                        cause:       'flood',
                        timestamp:   datetime(),
                        source:      $feid
                    })
                    CREATE (r)-[:HAS_STATE]->(ns)
                    """,
                    road_ids=replace_roads,
                    feid=flood_event_id,
                    depth=flood_depth,
                )

            # B ── "append" roads (waterway-adjacent): preserve full history.
            #      timestamp() millis appended to id for uniqueness per call.
            if append_roads:
                tx.run(
                    """
                    UNWIND $road_ids AS road_id
                    MATCH (r:Road {id: road_id})
                    CREATE (ns:RoadState {
                        id:          road_id + '__' + $feid + '__' + toString(timestamp()),
                        passable:    false,
                        flood_depth: $depth,
                        cause:       'flood',
                        timestamp:   datetime(),
                        source:      $feid
                    })
                    CREATE (r)-[:HAS_STATE]->(ns)
                    """,
                    road_ids=append_roads,
                    feid=flood_event_id,
                    depth=flood_depth,
                )

            # C1 ── Create FloodEvent and [:AFFECTS] relationships.
            #       Uses MERGE on Road so it works even when Road nodes are present
            #       AND when they're absent (creates a minimal stub).  reset_flood()
            #       depends on [:AFFECTS] to know which roads to undo.
            tx.run(
                """
                MERGE (fe:FloodEvent {id: $feid})
                WITH fe
                UNWIND $road_ids AS road_id
                MERGE (r:Road {id: road_id})
                MERGE (fe)-[:AFFECTS]->(r)
                """,
                road_ids=all_road_ids,
                feid=flood_event_id,
            )

            # C2 ── Wire [:CAUSES_STATE_CHANGE] to RoadState audit nodes written
            #       in A/B.  Best-effort: no-op if Road nodes had no HAS_STATE.
            tx.run(
                """
                MATCH (fe:FloodEvent {id: $feid})
                MATCH (r:Road)-[:HAS_STATE]->(s:RoadState {source: $feid})
                MERGE (fe)-[:CAUSES_STATE_CHANGE]->(s)
                """,
                feid=flood_event_id,
            )

            # D ── Dual-Write: the routing gate.
            #      travel_time_min is intentionally NOT touched — passable is the gate.
            result = tx.run(
                """
                UNWIND $road_ids AS road_id
                MATCH ()-[c:CONNECTS {road_id: road_id}]->()
                SET c.passable = false
                RETURN count(c) AS affected_edges
                """,
                road_ids=all_road_ids,
            )
            affected_edges: int = result.single()["affected_edges"]
            tx.commit()

    logger.info(
        "inject_flood complete: {} CONNECTS edges → passable=false (event={})",
        affected_edges, flood_event_id,
    )
    return affected_edges


def _nodes_inside(
    nodes: list[dict],
    polygon: FloodPolygon,
    swap_axes: bool = False,
) -> set[str]:
    """Return node IDs whose point falls inside *polygon*.

    swap_axes=True tests Point(lat, lon) to detect a lat/lon storage flip.
    """
    if swap_axes:
        return {
            n["id"] for n in nodes
            if polygon.contains(shapely.geometry.Point(n["lat"], n["lon"]))
        }
    return {
        n["id"] for n in nodes
        if polygon.contains(shapely.geometry.Point(n["lon"], n["lat"]))
    }


def _fetch_all_intersections(driver: Driver) -> list[dict]:
    """Return {id, lat, lon} for every Intersection node."""
    with driver.session() as session:
        result = session.run(
            "MATCH (i:Intersection) RETURN i.id AS id, i.lat AS lat, i.lon AS lon"
        )
        return [{"id": r["id"], "lat": r["lat"], "lon": r["lon"]} for r in result]


def _find_affected_roads(
    driver: Driver,
    flooded_ids: set[str],
) -> list[dict]:
    """
    Return distinct {road_id, strategy} for CONNECTS edges with AT LEAST ONE
    flooded endpoint.

    Original used AND (both endpoints must be inside the polygon).  That missed
    every road at the flood boundary — exactly where most observable flooding
    occurs — because the outer intersection sits just outside the polygon.
    OR is also more realistic: one flooded endpoint means the segment is
    impassable regardless of where the other end is.

    OPTIONAL MATCH on Road decouples road identification from Road node
    existence; if Road nodes are absent (loader issue) we still get the
    road_id from the CONNECTS edge and default to 'replace' versioning.
    """
    with driver.session() as session:
        result = session.run(
            """
            MATCH (a:Intersection)-[c:CONNECTS]->(b:Intersection)
            WHERE a.id IN $flooded_ids OR b.id IN $flooded_ids
            WITH DISTINCT c.road_id AS road_id
            OPTIONAL MATCH (r:Road {id: road_id})
            RETURN road_id, coalesce(r.versioning_strategy, 'replace') AS strategy
            """,
            flooded_ids=list(flooded_ids),
        )
        rows = [
            {"road_id": r["road_id"], "strategy": r["strategy"]}
            for r in result
            if r["road_id"] is not None
        ]
    logger.info("_find_affected_roads: {} road segments identified", len(rows))
    return rows


# ─────────────────────────────────────────────────────────────────────────────
# get_evacuation_route
# ─────────────────────────────────────────────────────────────────────────────

def get_evacuation_route(
    origin_id: str,
    destination_id: str,
    driver: Driver,
    *,
    max_hops: int = 40,
) -> RouteResult:
    """
    Find the fastest passable route between two Intersection nodes.

    Uses bounded variable-length path matching so the WHERE passable=true
    predicate prunes during traversal, not as a post-filter. Routes around
    flooded roads; never silently returns a path through them.

    Args:
        origin_id:      Intersection.id of the starting point.
        destination_id: Intersection.id of the target (shelter entrance node).
        max_hops:       Maximum relationship hops. 40 covers the full Paiporta
                        district; raise if routing across a larger BBOX.

    Returns:
        RouteResult with ordered path, travel time, and total distance.

    Raises:
        NoRouteError: Destination is genuinely unreachable given current flood state.
    """
    if not isinstance(max_hops, int) or max_hops < 1:
        raise ValueError(f"max_hops must be a positive integer, got {max_hops!r}")

    with driver.session() as session:
        # NOTE: max_hops is injected as a literal (not a Cypher parameter) because
        # Neo4j does not support parameterised relationship-length bounds.
        # It is validated as a positive int above, so there is no injection risk.
        result = session.run(
            f"""
            MATCH (s:Intersection {{id: $origin}}), (e:Intersection {{id: $dest}})
            MATCH path = (s)-[:CONNECTS*..{max_hops}]->(e)
            WHERE ALL(r IN relationships(path) WHERE r.passable = true)
            WITH path,
                 reduce(t = 0.0, r IN relationships(path) | t + r.travel_time_min) AS total_time,
                 reduce(d = 0.0, r IN relationships(path) | d + r.length_m)        AS total_dist
            ORDER BY total_time ASC
            LIMIT 1
            RETURN [n IN nodes(path)         | n.id]       AS route,
                   [r IN relationships(path) | r.road_id]  AS road_ids,
                   total_time,
                   total_dist
            """,
            origin=origin_id,
            dest=destination_id,
        )
        record = result.single()

    if record is None:
        raise NoRouteError(
            f"No passable route from {origin_id!r} to {destination_id!r} "
            f"within {max_hops} hops. All paths may be flooded or the nodes "
            f"are disconnected."
        )

    route_result = RouteResult(
        path=record["route"],
        total_time_min=round(record["total_time"], 3),
        total_length_m=round(record["total_dist"], 1),
    )
    logger.info(
        "Route: {} intersections | {:.1f} min | {:.0f} m",
        len(route_result.path), route_result.total_time_min, route_result.total_length_m,
    )

    _persist_evacuation_route(route_result, road_ids=record["road_ids"], driver=driver)
    return route_result


def _persist_evacuation_route(
    result: RouteResult,
    road_ids: list[str],
    driver: Driver,
) -> None:
    """
    Write (:EvacuationRoute) node + STARTS_AT, ENDS_AT, USES relationships
    per the GRAPH.md virtual-object schema.
    """
    route_id = f"route_{uuid.uuid4().hex[:12]}"
    with driver.session() as session:
        session.run(
            """
            CREATE (er:EvacuationRoute {
                id:                 $route_id,
                origin_id:          $origin_id,
                destination_id:     $dest_id,
                computed_at:        datetime(),
                total_length_m:     $length_m,
                estimated_time_min: $time_min
            })
            WITH er
            MATCH (origin:Intersection {id: $origin_id})
            CREATE (er)-[:STARTS_AT]->(origin)
            WITH er
            MATCH (dest:Intersection {id: $dest_id})
            CREATE (er)-[:ENDS_AT]->(dest)
            """,
            route_id=route_id,
            origin_id=result.path[0],
            dest_id=result.path[-1],
            length_m=result.total_length_m,
            time_min=result.total_time_min,
        )

        # USES relationships — ordered road sequence for Hermes/visualisation
        uses_records = [
            {"route_id": route_id, "road_id": rid, "order": i}
            for i, rid in enumerate(road_ids)
            if rid  # guard: degenerate single-node segments have no road_id
        ]
        if uses_records:
            session.run(
                """
                UNWIND $uses AS u
                MATCH (er:EvacuationRoute {id: u.route_id})
                MATCH (r:Road {id: u.road_id})
                CREATE (er)-[:USES {order: u.order}]->(r)
                """,
                uses=uses_records,
            )


# ─────────────────────────────────────────────────────────────────────────────
# reset_flood
# ─────────────────────────────────────────────────────────────────────────────

def reset_flood(flood_event_id: str, driver: Driver) -> int:
    """
    Restore all roads affected by *flood_event_id* to passable=true.

    Creates new (:RoadState {passable:true, cause:'reset'}) audit nodes —
    state nodes are never modified in-place. Used between simulation runs to
    reset the graph to a dry baseline without reloading the OSM data.

    Returns:
        Count of [:CONNECTS] edges restored to passable=true.
    """
    with driver.session() as session:
        result = session.run(
            """
            MATCH (fe:FloodEvent {id: $feid})-[:AFFECTS]->(r:Road)
            RETURN r.id AS road_id
            """,
            feid=flood_event_id,
        )
        road_ids = [r["road_id"] for r in result]

    if not road_ids:
        logger.info("reset_flood: no roads linked to event {} — nothing to restore", flood_event_id)
        return 0

    with driver.session() as session:
        with session.begin_transaction() as tx:
            # Create "reset" RoadState audit nodes (state history is never pruned)
            tx.run(
                """
                UNWIND $road_ids AS road_id
                MATCH (r:Road {id: road_id})
                CREATE (ns:RoadState {
                    id:          road_id + '__reset__' + $feid,
                    passable:    true,
                    flood_depth: 0.0,
                    cause:       'reset',
                    timestamp:   datetime(),
                    source:      $feid
                })
                CREATE (r)-[:HAS_STATE]->(ns)
                """,
                road_ids=road_ids,
                feid=flood_event_id,
            )

            # Dual-Write: restore the routing gate
            result = tx.run(
                """
                UNWIND $road_ids AS road_id
                MATCH ()-[c:CONNECTS {road_id: road_id}]->()
                SET c.passable = true
                RETURN count(c) AS restored_edges
                """,
                road_ids=road_ids,
            )
            restored: int = result.single()["restored_edges"]
            tx.commit()

    logger.info(
        "reset_flood: {} edges → passable=true (event={})", restored, flood_event_id
    )
    return restored


# ─────────────────────────────────────────────────────────────────────────────
# get_graph_context
# ─────────────────────────────────────────────────────────────────────────────

# Max distinct road names forwarded to Hermes. Groq's 12k-token context fills
# fast once flooded_roads grows past a few hundred segments; 10 representative
# names are enough for a CERC message — the count scalar conveys the scale.
_MAX_FLOODED_ROADS_IN_CONTEXT = 10


def get_graph_context(sector: str, driver: Driver) -> dict:
    """
    Return structured graph state for Hermes prompt injection (Phase 3).

    Output schema (GRAPH.md):
        {affected_sectors, flooded_roads, flooded_road_count, open_routes,
         shelters, satellite_source, flood_event_id}

    Phase-1 note: full IN_SECTOR filtering requires admin-boundary relations
    (Phase-2 open item). Roads and shelters are returned globally when
    sector='all'; otherwise Intersection.sector string is used as a rough filter.

    Token-budget note: flooded_roads is capped at _MAX_FLOODED_ROADS_IN_CONTEXT
    distinct street names.  flooded_road_count carries the true total so Hermes
    can communicate the disaster scale without blowing the LLM context window.
    """
    with driver.session() as session:

        # ── Currently flooded roads (checked via CONNECTS edge, not RoadState,
        #    so the result always reflects the live routing state) ────────────
        flooded_result = session.run(
            """
            MATCH (r:Road)
            WHERE EXISTS {
                MATCH ()-[c:CONNECTS {road_id: r.id}]->()
                WHERE c.passable = false
            }
            RETURN DISTINCT r.id AS id, r.name AS name, r.highway AS highway
            """
        )
        flooded_roads_raw = [
            {"id": r["id"], "name": r["name"], "highway": r["highway"]}
            for r in flooded_result
        ]

        # ── Passable edge count (proxy for routing headroom) ─────────────────
        passable_cnt = session.run(
            "MATCH ()-[c:CONNECTS]->() WHERE c.passable = true RETURN count(c) AS cnt"
        ).single()["cnt"]

        # ── Open shelters — lat/lon stripped (spatial, not useful in CERC text) ──
        shelters_result = session.run(
            """
            MATCH (sh:Shelter)
            RETURN sh.id       AS id,
                   sh.name     AS name,
                   sh.capacity AS capacity,
                   sh.type     AS type
            """
        )
        shelters = [
            {"id": r["id"], "name": r["name"],
             "capacity": r["capacity"], "type": r["type"]}
            for r in shelters_result
        ]

        # ── Most recent active FloodEvent ─────────────────────────────────────
        event_record = session.run(
            """
            MATCH (fe:FloodEvent)
            RETURN fe.id AS id,
                'Copernicus EMS' AS source,
                'High' AS severity
            LIMIT 1
            """
        ).single()

    flood_event_id   = event_record["id"]     if event_record else None
    satellite_source = event_record["source"] if event_record else "unknown"

    # ── Deduplicate + truncate flooded roads for the LLM prompt ─────────────
    # Multiple Road nodes often share the same street name (different segments).
    # Deduplicating by name gives Hermes the street-level picture; the integer
    # count tells it the scale without listing every segment.
    flooded_roads = _truncate_road_list(flooded_roads_raw, _MAX_FLOODED_ROADS_IN_CONTEXT)

    return {
        "affected_sectors":    [sector] if sector and sector != "all" else [],
        "flooded_roads":       flooded_roads,
        "flooded_road_count":  len(flooded_roads_raw),
        "passable_edge_count": passable_cnt,
        "open_routes":         passable_cnt > 0,
        "shelters":            shelters,
        "satellite_source":    satellite_source,
        "flood_event_id":      flood_event_id,
    }


# ─────────────────────────────────────────────────────────────────────────────
# get_node_coords / get_road_geometry  (Phase 6 — API bridge helpers)
# ─────────────────────────────────────────────────────────────────────────────

def get_node_coords(node_ids: list[str], driver: Driver) -> dict[str, tuple[float, float]]:
    """Return {node_id: (lat, lon)} for a batch of Intersection node IDs."""
    if not node_ids:
        return {}
    with driver.session() as session:
        result = session.run(
            "MATCH (i:Intersection) WHERE i.id IN $ids "
            "RETURN i.id AS id, i.lat AS lat, i.lon AS lon",
            ids=node_ids,
        )
        return {r["id"]: (r["lat"], r["lon"]) for r in result}


def get_road_geometry(
    road_names: list[str],
    road_ids: list[str],
    driver: Driver,
) -> dict:
    """
    Return coordinates for visualising bottleneck and flooded roads.

    Road nodes have no geometry; coords are derived from CONNECTS segment
    endpoints (Intersection lat/lon).  Each road may span many segments, so
    all distinct endpoint coordinates are collected and deduplicated.

    Returns:
        {
            "by_name": {road_name: [[lat, lon], ...]},
            "by_id":   {road_id:   {"name": str, "coords": [[lat, lon], ...]}}
        }
    """
    by_name: dict[str, list[list[float]]] = {}
    by_id: dict[str, dict] = {}

    if road_names:
        with driver.session() as session:
            result = session.run(
                """
                MATCH (a:Intersection)-[c:CONNECTS]->(b:Intersection)
                WHERE c.road_name IN $road_names
                RETURN c.road_name AS name,
                       a.lat AS a_lat, a.lon AS a_lon,
                       b.lat AS b_lat, b.lon AS b_lon
                """,
                road_names=road_names,
            )
            for r in result:
                name = r["name"] or "unknown"
                pts = by_name.setdefault(name, [])
                for pt in ([r["a_lat"], r["a_lon"]], [r["b_lat"], r["b_lon"]]):
                    if pt not in pts:
                        pts.append(pt)

    if road_ids:
        with driver.session() as session:
            result = session.run(
                """
                MATCH (a:Intersection)-[c:CONNECTS]->(b:Intersection)
                WHERE c.road_id IN $road_ids AND c.passable = false
                RETURN c.road_id AS id, c.road_name AS name,
                       a.lat AS a_lat, a.lon AS a_lon,
                       b.lat AS b_lat, b.lon AS b_lon
                """,
                road_ids=road_ids,
            )
            for r in result:
                rid = r["id"]
                entry = by_id.setdefault(rid, {"name": r["name"], "coords": []})
                for pt in ([r["a_lat"], r["a_lon"]], [r["b_lat"], r["b_lon"]]):
                    if pt not in entry["coords"]:
                        entry["coords"].append(pt)

    logger.info(
        "get_road_geometry: {} bottleneck roads, {} flooded roads",
        len(by_name), len(by_id),
    )
    return {"by_name": by_name, "by_id": by_id}


def _truncate_road_list(roads: list[dict], max_roads: int) -> list[dict]:
    """Deduplicate by name, sort named roads first, cap at max_roads."""
    seen: set[str] = set()
    deduped: list[dict] = []
    for road in roads:
        key = road.get("name") or road["id"]
        if key not in seen:
            seen.add(key)
            deduped.append(road)

    # Named roads first — they produce better CERC copy.
    deduped.sort(key=lambda r: (not bool(r.get("name")), r.get("name") or ""))

    if len(deduped) <= max_roads:
        return deduped

    remainder = len(deduped) - max_roads
    return deduped[:max_roads] + [
        {"name": f"…and {remainder} other streets", "highway": None, "id": None}
    ]
