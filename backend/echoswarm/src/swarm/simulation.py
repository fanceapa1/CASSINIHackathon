from __future__ import annotations

import random
import uuid
from collections import Counter
from collections.abc import Callable
from dataclasses import asdict, dataclass, field

import networkx as nx
from loguru import logger
from neo4j import Driver

from graph.loader import haversine_m
from hermes.engine import HermesResult
from swarm.agents import Agent, AgentState, AgentType

_STOP_WORDS = frozenset({
    "a", "an", "the", "to", "of", "at", "is", "are", "in", "on",
    "and", "or", "for", "be", "now", "do", "not", "go", "all",
    "it", "its", "this", "that", "with", "as", "by", "take",
})

_DEFAULT_DIST: dict[AgentType, float] = {
    AgentType.COMPLIANT: 0.40,
    AgentType.SKEPTICAL: 0.30,
    AgentType.PANIC: 0.20,
    AgentType.IMMOBILE: 0.10,
}


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------

def build_nx_graph(driver: Driver) -> tuple[nx.DiGraph, nx.DiGraph]:
    """Build in-memory networkx graphs from current Neo4j state.

    Returns:
        G_passable: edges where passable=True only (Compliant/Skeptical routing).
        G_full: all edges including flood-blocked ones (Panic movement + relay adjacency).
    """
    G_full = nx.DiGraph()
    G_passable = nx.DiGraph()

    with driver.session() as session:
        nodes = session.run(
            "MATCH (n:Intersection) "
            "RETURN n.id AS id, n.lat AS lat, n.lon AS lon, n.sector AS sector"
        )
        for record in nodes:
            attrs = {"lat": record["lat"], "lon": record["lon"], "sector": record["sector"]}
            G_full.add_node(record["id"], **attrs)
            G_passable.add_node(record["id"], **attrs)

        edges = session.run(
            "MATCH (a:Intersection)-[c:CONNECTS]->(b:Intersection) "
            "RETURN a.id AS from_id, b.id AS to_id, "
            "c.road_id AS road_id, c.road_name AS road_name, "
            "c.length_m AS length_m, c.travel_time_min AS travel_time_min, "
            "c.passable AS passable"
        )
        for record in edges:
            attrs = {
                "road_id": record["road_id"],
                "road_name": record["road_name"],
                "length_m": record["length_m"],
                "travel_time_min": record["travel_time_min"],
                "passable": record["passable"],
            }
            G_full.add_edge(record["from_id"], record["to_id"], **attrs)
            if record["passable"]:
                G_passable.add_edge(record["from_id"], record["to_id"], **attrs)

    logger.info(
        "Built networkx graphs: {} nodes | {} edges total | {} passable",
        G_full.number_of_nodes(),
        G_full.number_of_edges(),
        G_passable.number_of_edges(),
    )
    return G_passable, G_full


def find_shelter_node(G: nx.DiGraph, driver: Driver) -> str:
    """Return the intersection node_id nearest to any Neo4j Shelter."""
    with driver.session() as session:
        result = session.run(
            "MATCH (s:Shelter) RETURN s.id AS id, s.lat AS lat, s.lon AS lon, s.name AS name"
        )
        shelters = [
            {"id": r["id"], "lat": r["lat"], "lon": r["lon"], "name": r["name"]}
            for r in result
        ]

    if not shelters:
        # New-city graphs may have no OSM-tagged shelters. Fall back to the
        # most-connected passable node — high degree ≈ central, reachable from
        # most of the graph — so agents still have a valid evacuation target.
        if not G.nodes():
            raise ValueError("Graph has no nodes; cannot find shelter fallback")
        best_node = max(G.nodes(), key=lambda n: G.degree(n))
        logger.warning(
            "No Shelter nodes in Neo4j — using highest-degree node {} as fallback target",
            best_node,
        )
        return best_node

    shelter = shelters[0]
    best_node: str | None = None
    best_dist = float("inf")

    for node_id, attrs in G.nodes(data=True):
        lat = attrs.get("lat")
        lon = attrs.get("lon")
        if lat is None or lon is None:
            continue
        dist = haversine_m(shelter["lat"], shelter["lon"], lat, lon)
        if dist < best_dist:
            best_dist = dist
            best_node = node_id

    if best_node is None:
        raise ValueError("Could not map any shelter to an intersection node")

    logger.info(
        "Shelter '{}' mapped to intersection {} ({:.0f}m away)",
        shelter["name"],
        best_node,
        best_dist,
    )
    return best_node


# ---------------------------------------------------------------------------
# Token extraction
# ---------------------------------------------------------------------------

def extract_key_tokens(hermes_result: HermesResult) -> frozenset[str]:
    """Derive the canonical token set that agents track for information decay.

    Sources: which_route, where, and what fields from the Hermes message.
    """
    msg = hermes_result.message
    raw = " ".join([msg.which_route, msg.where, msg.what])
    words = raw.lower().replace(",", " ").replace(".", " ").replace(";", " ").split()
    tokens = {w for w in words if len(w) > 3 and w not in _STOP_WORDS}
    return frozenset(tokens)


# ---------------------------------------------------------------------------
# Agent spawning
# ---------------------------------------------------------------------------

def spawn_agents(
    G: nx.DiGraph,
    n: int,
    dist: dict[AgentType, float] | None = None,
) -> list[Agent]:
    """Place n agents uniformly across graph nodes with the given type distribution."""
    if dist is None:
        dist = _DEFAULT_DIST

    types = list(dist.keys())
    weights = [dist[t] for t in types]
    assigned_types = random.choices(types, weights=weights, k=n)

    nodes = list(G.nodes())
    if not nodes:
        raise ValueError("Graph has no nodes; cannot spawn agents")

    agents: list[Agent] = []
    for i, agent_type in enumerate(assigned_types):
        node_id = random.choice(nodes)
        agents.append(Agent(
            id=f"agent_{i:05d}",
            agent_type=agent_type,
            node_id=node_id,
            origin_node_id=node_id,
        ))

    return agents


# ---------------------------------------------------------------------------
# Simulation data models
# ---------------------------------------------------------------------------

@dataclass
class SimulationConfig:
    n_agents: int = 1000
    seed_fraction: float = 0.05
    max_ticks: int = 50
    panic_radius: int = 2        # graph hops within which Panic spreads
    panic_spread_prob: float = 0.3


@dataclass
class TickResult:
    tick: int
    n_safe: int
    n_evacuating: int
    n_informed: int
    n_waiting: int
    n_stranded: int
    preservation_rate: float     # mean token preservation across all informed agents


@dataclass
class SimulationResult:
    run_id: str
    total_agents: int
    evacuated: int               # SAFE + EVACUATING at end
    evacuation_rate: float
    informed_never_acted: int    # INFORMED at termination
    never_informed: int          # WAITING at termination
    decay_curve: list[float]     # preservation_rate per tick
    bottleneck_edges: list[str]  # top-5 road names by cumulative agent crossings
    bottleneck_counts: list[int]  # crossing counts parallel to bottleneck_edges
    ticks_run: int
    tick_history: list[dict] = field(default_factory=list)  # per-tick metrics for API streaming
    agent_replay_snapshots: list[list[dict]] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Simulation engine
# ---------------------------------------------------------------------------

class Simulation:
    def __init__(
        self,
        G_passable: nx.DiGraph,
        G_full: nx.DiGraph,
        agents: list[Agent],
        key_tokens: frozenset[str],
        shelter_node: str,
        config: SimulationConfig | None = None,
        tick_callback: Callable[[dict], None] | None = None,
    ) -> None:
        self._G = G_passable
        self._G_full = G_full
        self._agents = agents
        self._key_tokens = key_tokens
        self._shelter_node = shelter_node
        self._config = config or SimulationConfig()
        self._tick_callback = tick_callback
        self._tick_log: list[TickResult] = []
        self._edge_usage: Counter[str] = Counter()

        # Spatial index: node_id → agents currently at that node
        self._node_to_agents: dict[str, list[Agent]] = {}
        for agent in self._agents:
            self._node_to_agents.setdefault(agent.node_id, []).append(agent)

        # Sample up to 200 agents for per-tick replay history (map animation)
        _REPLAY_N = 200
        self._replay_agents: list[Agent] = random.sample(
            self._agents, min(_REPLAY_N, len(self._agents))
        )
        self._replay_snapshots: list[list[dict]] = []

        # Pre-compute evacuation routes from every reachable node to the shelter
        self._routes: dict[str, list[str]] = {}
        if G_passable.has_node(shelter_node):
            for node in G_passable.nodes():
                if node == shelter_node:
                    self._routes[node] = [node]
                    continue
                try:
                    self._routes[node] = nx.shortest_path(
                        G_passable, node, shelter_node, weight="travel_time_min"
                    )
                except nx.NetworkXNoPath:
                    pass  # unreachable node; agent stays EVACUATING indefinitely

        # Seed the initial 5% of non-Immobile agents with the full Hermes message
        eligible = [a for a in agents if a.agent_type != AgentType.IMMOBILE]
        n_seeds = max(1, int(len(eligible) * self._config.seed_fraction))
        for seed in random.sample(eligible, min(n_seeds, len(eligible))):
            seed.receive_message(key_tokens, hop_count=0, source_id="hermes")

        logger.info(
            "Simulation ready: {} agents | {} seeds | {} routable nodes | {} key tokens",
            len(agents),
            n_seeds,
            len(self._routes),
            len(key_tokens),
        )

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    @property
    def n_routable_nodes(self) -> int:
        """Number of nodes with a pre-computed passable route to the shelter."""
        return len(self._routes)

    def tick(self) -> TickResult:
        """Execute one simulation step and return per-tick metrics."""
        self._relay_messages()
        self._update_evacuation_status()
        self._move_agents()
        self._increment_ticks()
        self._spread_panic()
        result = self._compute_tick_metrics()
        self._tick_log.append(result)
        self._replay_snapshots.append([
            {"id": a.id, "node_id": a.node_id, "state": a.state.value}
            for a in self._replay_agents
        ])
        if self._tick_callback is not None:
            self._tick_callback(asdict(result))
        return result

    def run(self) -> SimulationResult:
        """Run until max_ticks or convergence (no new informed agents)."""
        prev_informed = sum(1 for a in self._agents if a.state == AgentState.INFORMED)

        for tick_n in range(1, self._config.max_ticks + 1):
            self.tick()
            curr_informed = sum(1 for a in self._agents if a.state == AgentState.INFORMED)

            # Early stop after a warm-up period when propagation has stalled
            if tick_n > 5 and curr_informed <= prev_informed:
                logger.info("Convergence at tick {}: no new informed agents", tick_n)
                break
            prev_informed = curr_informed

        return self._build_result()

    # ------------------------------------------------------------------
    # Tick sub-steps (snapshot semantics: collect then apply)
    # ------------------------------------------------------------------

    def _relay_messages(self) -> None:
        """Snapshot all relay operations this tick, then apply atomically."""
        pending: list[tuple[Agent, frozenset[str], int, str]] = []

        for agent in self._agents:
            tokens = agent.relay_tokens()
            if tokens is None:
                continue
            next_hop = agent.hop_count + 1
            for neighbor_id in self._G_full.neighbors(agent.node_id):
                for neighbor in self._node_to_agents.get(neighbor_id, []):
                    pending.append((neighbor, tokens, next_hop, agent.id))

        for receiver, tokens, hop_count, source_id in pending:
            receiver.receive_message(tokens, hop_count, source_id)

    def _update_evacuation_status(self) -> None:
        """Transition INFORMED agents to EVACUATING when can_act() is True."""
        total = len(self._key_tokens)
        for agent in self._agents:
            if agent.state == AgentState.INFORMED and agent.can_act(total):
                agent.state = AgentState.EVACUATING
                if agent.node_id in self._routes:
                    agent.route = self._routes[agent.node_id]
                    agent.route_index = 0

    def _move_agents(self) -> None:
        for agent in self._agents:
            if agent.state != AgentState.EVACUATING:
                continue
            if agent.agent_type == AgentType.PANIC:
                self._move_panic(agent)
            else:
                self._move_along_route(agent)

    def _move_along_route(self, agent: Agent) -> None:
        """Advance Compliant/Skeptical agent one step along pre-computed route."""
        if not agent.route or agent.route_index >= len(agent.route) - 1:
            if agent.node_id == self._shelter_node:
                agent.state = AgentState.SAFE
            return

        current = agent.route[agent.route_index]
        next_node = agent.route[agent.route_index + 1]

        edge_data = self._G.get_edge_data(current, next_node) or {}
        self._edge_usage[edge_data.get("road_name", "unknown")] += 1

        self._move_to(agent, next_node)
        agent.route_index += 1

        if agent.node_id == self._shelter_node:
            agent.state = AgentState.SAFE

    def _move_panic(self, agent: Agent) -> None:
        """Panic agents take a random step on G_full, ignoring flood blockages."""
        neighbors = list(self._G_full.neighbors(agent.node_id))
        if not neighbors:
            return

        current = agent.node_id
        next_node = random.choice(neighbors)

        edge_data = self._G_full.get_edge_data(current, next_node) or {}
        self._edge_usage[edge_data.get("road_name", "unknown")] += 1

        self._move_to(agent, next_node)

        if agent.node_id == self._shelter_node:
            agent.state = AgentState.SAFE

    def _spread_panic(self) -> None:
        """Panic agents infect nearby Compliant/Skeptical agents via social contagion.

        Runs AFTER movement so newly converted agents take effect next tick.
        """
        panic_agents = [
            a for a in self._agents
            if a.agent_type == AgentType.PANIC and a.state != AgentState.SAFE
        ]

        to_convert: list[Agent] = []
        for panic_agent in panic_agents:
            reachable = nx.single_source_shortest_path_length(
                self._G_full, panic_agent.node_id, cutoff=self._config.panic_radius
            )
            for node_id in reachable:
                for neighbor in self._node_to_agents.get(node_id, []):
                    if neighbor.agent_type in (AgentType.COMPLIANT, AgentType.SKEPTICAL):
                        if random.random() < self._config.panic_spread_prob:
                            to_convert.append(neighbor)

        for agent in to_convert:
            agent.agent_type = AgentType.PANIC

    def _increment_ticks(self) -> None:
        for agent in self._agents:
            if agent.state in (AgentState.INFORMED, AgentState.EVACUATING):
                agent.ticks_informed += 1

    # ------------------------------------------------------------------
    # Spatial index
    # ------------------------------------------------------------------

    def _move_to(self, agent: Agent, next_node: str) -> None:
        """Move agent to next_node and update the spatial index."""
        old = agent.node_id
        bucket = self._node_to_agents.get(old)
        if bucket is not None:
            try:
                bucket.remove(agent)
            except ValueError:
                pass
        agent.node_id = next_node
        self._node_to_agents.setdefault(next_node, []).append(agent)

    # ------------------------------------------------------------------
    # Metrics
    # ------------------------------------------------------------------

    def _compute_tick_metrics(self) -> TickResult:
        n_safe = sum(1 for a in self._agents if a.state == AgentState.SAFE)
        n_evacuating = sum(1 for a in self._agents if a.state == AgentState.EVACUATING)
        n_informed = sum(1 for a in self._agents if a.state == AgentState.INFORMED)
        n_waiting = sum(1 for a in self._agents if a.state == AgentState.WAITING)
        n_stranded = sum(1 for a in self._agents if a.state == AgentState.STRANDED)

        total_tokens = len(self._key_tokens)
        informed_pool = [
            a for a in self._agents
            if a.state in (AgentState.INFORMED, AgentState.EVACUATING, AgentState.SAFE)
        ]
        if informed_pool and total_tokens > 0:
            preservation = (
                sum(len(a.tokens) / total_tokens for a in informed_pool) / len(informed_pool)
            )
        else:
            preservation = 1.0

        return TickResult(
            tick=len(self._tick_log) + 1,
            n_safe=n_safe,
            n_evacuating=n_evacuating,
            n_informed=n_informed,
            n_waiting=n_waiting,
            n_stranded=n_stranded,
            preservation_rate=preservation,
        )

    def _build_result(self) -> SimulationResult:
        total = len(self._agents)
        n_safe = sum(1 for a in self._agents if a.state == AgentState.SAFE)
        n_evacuating = sum(1 for a in self._agents if a.state == AgentState.EVACUATING)
        evacuated = n_safe + n_evacuating
        informed_never_acted = sum(1 for a in self._agents if a.state == AgentState.INFORMED)
        never_informed = sum(1 for a in self._agents if a.state == AgentState.WAITING)

        top_bottlenecks = self._edge_usage.most_common(5)
        return SimulationResult(
            run_id=str(uuid.uuid4())[:8],
            total_agents=total,
            evacuated=evacuated,
            evacuation_rate=evacuated / total if total > 0 else 0.0,
            informed_never_acted=informed_never_acted,
            never_informed=never_informed,
            decay_curve=[r.preservation_rate for r in self._tick_log],
            bottleneck_edges=[road for road, _ in top_bottlenecks],
            bottleneck_counts=[count for _, count in top_bottlenecks],
            ticks_run=len(self._tick_log),
            tick_history=[asdict(r) for r in self._tick_log],
            agent_replay_snapshots=self._replay_snapshots,
        )
