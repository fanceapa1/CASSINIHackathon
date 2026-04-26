"""
src/api/payload.py — Pure payload assembler for the ECHO-SWARM API bridge.

No I/O.  Receives all data as arguments and returns the frontend JSON dict.
Engine-agnostic: swap Python MiroFish for C++ ECS by passing the same
SimulationResult shape — only meta.engine.type changes.
"""

from __future__ import annotations

import datetime

from hermes.engine import HermesResult
from swarm.agents import Agent, AgentState, AgentType
from swarm.simulation import SimulationResult

_ENGINE_TYPE = "python-mirofish"
_ENGINE_VERSION = "1.0.0"
_DEFAULT_MAX_TICKS = 50


def build_payload(
    scenario_name: str,
    hermes_result: HermesResult,
    sim_result: SimulationResult,
    agents: list[Agent],
    node_coords: dict[str, tuple[float, float]],
    road_geom: dict,
    graph_context: dict,
    sop_update: str,
    shelter_node: str,
) -> dict:
    """Assemble the complete frontend JSON payload. Pure — no I/O."""
    decay = sim_result.decay_curve
    mean_preservation = round(sum(decay) / len(decay), 4) if decay else 1.0
    stranded = sum(1 for a in agents if a.state == AgentState.STRANDED)

    meta = {
        "run_id":    sim_result.run_id,
        "scenario":  scenario_name,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "engine":    {"type": _ENGINE_TYPE, "version": _ENGINE_VERSION},
    }

    summary = {
        "total_agents":           sim_result.total_agents,
        "evacuated":              sim_result.evacuated,
        "stranded":               stranded,
        "informed_never_acted":   sim_result.informed_never_acted,
        "never_informed":         sim_result.never_informed,
        "evacuation_rate":        round(sim_result.evacuation_rate, 4),
        "ticks_run":              sim_result.ticks_run,
        "max_ticks":              _DEFAULT_MAX_TICKS,
        "mean_preservation_rate": mean_preservation,
    }

    breakdown: dict[str, dict] = {}
    for at in AgentType:
        bucket = [a for a in agents if a.agent_type == at]
        breakdown[at.value.upper()] = {
            "total":      len(bucket),
            "safe":       sum(1 for a in bucket if a.state == AgentState.SAFE),
            "evacuating": sum(1 for a in bucket if a.state == AgentState.EVACUATING),
            "informed":   sum(1 for a in bucket if a.state == AgentState.INFORMED),
            "waiting":    sum(1 for a in bucket if a.state == AgentState.WAITING),
            "stranded":   sum(1 for a in bucket if a.state == AgentState.STRANDED),
        }

    msg = hermes_result.message
    cl = hermes_result.clarity
    hermes_payload = {
        "message": {
            "who":                  msg.who,
            "what":                 msg.what,
            "where":                msg.where,
            "when":                 msg.when,
            "which_route":          msg.which_route,
            "source_justification": msg.source_justification,
            "human_readable":       msg.human_readable,
        },
        "clarity": {
            "who":         cl.who,
            "what":        cl.what,
            "where":       cl.where,
            "when":        cl.when,
            "which_route": cl.which_route,
            "overall":     cl.overall,
            "passed":      cl.passed,
        },
        "attempts": hermes_result.attempts,
        "model":    hermes_result.model,
    }

    # Extract diagnosis title from the first ## header in the SOP update
    diagnosis = "Analysis complete"
    for line in sop_update.splitlines():
        stripped = line.strip()
        if stripped.startswith("## SOP Update"):
            diagnosis = stripped.replace("## SOP Update — ", "").replace("## SOP Update", "").strip()
            break

    critic_payload = {"diagnosis": diagnosis, "sop_update": sop_update}

    time_series = [
        {
            "tick":              t["tick"],
            "safe":              t["n_safe"],
            "evacuating":        t["n_evacuating"],
            "informed":          t["n_informed"],
            "waiting":           t["n_waiting"],
            "preservation_rate": round(t["preservation_rate"], 4),
        }
        for t in sim_result.tick_history
    ]

    # Agent final positions (skip agents whose node has no coord mapping)
    agents_final = [
        {
            "id":    agent.id,
            "lat":   coords[0],
            "lon":   coords[1],
            "state": agent.state.value,
            "type":  agent.agent_type.value,
        }
        for agent in agents
        if (coords := node_coords.get(agent.node_id)) is not None
    ]

    # Replay: 200 sampled agents, per-tick [lat, lon, state] history
    agent_replay: list[dict] = []
    snapshots = sim_result.agent_replay_snapshots
    if snapshots:
        n_in_sample = len(snapshots[0])
        for agent_idx in range(n_in_sample):
            agent_id = snapshots[0][agent_idx]["id"]
            history: list[list] = []
            for tick_snap in snapshots:
                if agent_idx >= len(tick_snap):
                    continue
                s = tick_snap[agent_idx]
                coords = node_coords.get(s["node_id"])
                if coords:
                    history.append([coords[0], coords[1], s["state"]])
            if history:
                agent_replay.append({"id": agent_id, "history": history})

    # Bottleneck roads with geometry and crossing counts
    by_name = road_geom.get("by_name", {})
    counts = sim_result.bottleneck_counts
    bottleneck_roads = [
        {
            "rank":           rank,
            "name":           name,
            "crossing_count": counts[rank - 1] if rank - 1 < len(counts) else 0,
            "coords":         by_name.get(name, []),
        }
        for rank, name in enumerate(sim_result.bottleneck_edges, 1)
    ]

    # Flooded roads with geometry
    by_id = road_geom.get("by_id", {})
    flooded_roads = [
        {
            "id":      road.get("id"),
            "name":    road.get("name"),
            "highway": road.get("highway"),
            "coords":  by_id.get(road.get("id") or "", {}).get("coords", []),
        }
        for road in graph_context.get("flooded_roads", [])
    ]

    # Bounding box from all node coords in scope
    all_coords = list(node_coords.values())
    bounds: dict = {}
    if all_coords:
        lats = [c[0] for c in all_coords]
        lons = [c[1] for c in all_coords]
        bounds = {"south": min(lats), "west": min(lons), "north": max(lats), "east": max(lons)}

    # Shelter position from its nearest intersection node
    shelter_coords = node_coords.get(shelter_node)
    shelters = graph_context.get("shelters", [])
    shelter_info: dict = {}
    if shelter_coords:
        shelter_info = {
            "lat":  shelter_coords[0],
            "lon":  shelter_coords[1],
            "name": shelters[0]["name"] if shelters else "Shelter",
        }

    map_payload = {
        "bounds":           bounds,
        "shelter":          shelter_info,
        "agents_final":     agents_final,
        "bottleneck_roads": bottleneck_roads,
        "flooded_roads":    flooded_roads,
        "agent_replay":     agent_replay,
    }

    return {
        "meta":        meta,
        "summary":     summary,
        "breakdown":   breakdown,
        "hermes":      hermes_payload,
        "critic":      critic_payload,
        "time_series": time_series,
        "map":         map_payload,
    }
