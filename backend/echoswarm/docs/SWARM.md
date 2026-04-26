
# SWARM.md — MiroFish Agent Swarm

## Purpose
MiroFish simulates how a population receives and propagates Hermes' evacuation order. It measures two things: (1) whether agents actually evacuate, and (2) whether the message degrades as it travels through word-of-mouth. This is the "Information Decay" mechanic.

Inspired by OASIS (Open Agent Social Intelligence Simulation). Built as a lightweight custom Python swarm — NOT the actual OASIS library. See DECISIONS.md #003.

---

## Agent Types & Distribution

| Type | % of Population | Behavior |
|------|----------------|----------|
| Compliant | 40% | Follows instructions if received clearly. Relays message verbatim with 80% probability. |
| Skeptical | 30% | Requires 2 confirmations before acting. Drops route details from relayed message. |
| Panic | 20% | Acts immediately but garbles message (randomly shuffles or drops key tokens). |
| Immobile | 10% | Never evacuates. Never relays. (Elderly, disabled, or unresponsive.) |

---

## Information Decay Metric

**Token Preservation Rate** — the fraction of key tokens from Hermes' original message that survive in a relayed version.

### Key Tokens (extracted from Hermes output)
- Route names (e.g. "Calle Cuba", "Avenida del Puerto")
- Shelter name/address
- Action verb (e.g. "evacuate", "go to")
- Closed road names (e.g. "Highway V-30")

### Per-Hop Score
```
preservation_rate = (surviving_key_tokens / total_key_tokens)
```

### Decay Curve
Plot `preservation_rate` on Y-axis vs. `hop_number` on X-axis. The curve shows how fast the message degrades through the population.

---

## Simulation Loop

### Initialization
1. Place N agents on graph nodes (weighted by sector population density)
2. Assign agent types randomly per distribution above
3. Identify 5% of agents as "seed agents" (those who receive Hermes' message directly)

### Each Tick
1. Seed agents (or any agent who has received the message) attempt to relay to graph-adjacent agents
2. Relay probability and mutation depend on sender's agent type:
   - Compliant → relay with 80% probability, no mutation
   - Skeptical → relay only after receiving from 2 sources; drops 1 random key token
   - Panic → relay immediately; shuffles or drops up to 2 key tokens randomly
   - Immobile → never relays
3. Receiving agent: if message received, mark as "informed"
4. If informed AND message is clear enough (preservation_rate > 0.6) AND agent type is Compliant or Panic → mark as "evacuating"
5. Move evacuating agents along their known route (graph traversal)

### Termination
Simulation ends after MAX_TICKS (configurable, suggest 50) or when no new agents are becoming informed.

---

## Logged Metrics (per simulation run)

```json
{
  "run_id": "valencia_run_001",
  "total_agents": 1000,
  "evacuated": 623,
  "evacuation_rate": 0.623,
  "informed_never_acted": 184,
  "never_informed": 193,
  "decay_curve": [1.0, 0.95, 0.87, 0.76, ...],
  "bottleneck_edges": ["Calle Cuba / Avenida del Puerto junction"],
  "message_variants_at_hop_10": ["...", "..."]
}
```

---

## Implementation Notes

- The graph from Neo4j drives agent adjacency — agents can only relay to graph neighbors
- Flood-injected edges are also blocked for agent movement (not just routing)
- Run the simulation in Python (no LLM calls per agent — pure probabilistic rules)
- For visualization: output agent positions per tick as a time-series JSON → render with pyvis

---

## Implementation Notes (Phase 4 additions)

### Resolved Design Decisions
- **Skeptical wait**: 2-source confirmation — agent must receive the message from 2 distinct neighbors (`agent.confirmations >= 2`) before acting or relaying. This models social verification, not a timer.
- **Panic + blocked roads**: Panic agents use `G_full` (all edges, including flood-blocked) for movement and relay adjacency. Compliant/Skeptical use `G_passable` only. Two graphs are maintained in memory.
- **Social contagion**: Panic agents spread their type to nearby Compliant/Skeptical agents within `panic_radius` hops (default 2) with probability `panic_spread_prob` (default 0.3). This happens at the end of each tick so conversions take effect next tick.

### Two-Graph Architecture
- `G_passable`: DiGraph with only passable=True edges. Used for Compliant/Skeptical pathfinding and route pre-computation.
- `G_full`: DiGraph with all edges including flood-blocked. Used for Panic movement, relay adjacency across all agent types, and panic contagion BFS.
- Both graphs are built from Neo4j state at simulation start via `build_nx_graph(driver)`.

### Token Extraction
Key tokens are derived from Hermes output fields: `which_route`, `where`, `what`. Words shorter than 4 characters and common stop words are filtered out. The resulting `frozenset[str]` is the canonical set tracked for information decay.

### Route Pre-computation
At simulation init, `nx.shortest_path(G_passable, source, shelter_node, weight="travel_time_min")` is computed for every reachable intersection. Compliant/Skeptical agents look up their route in O(1). Unreachable nodes (cut off by flood) produce no route; agents in those nodes remain EVACUATING indefinitely.

### Snapshot Semantics
All relay operations within a single tick are collected first, then applied together. This prevents same-tick cascade propagation and ensures `hop_count` accurately reflects the number of ticks elapsed since seed broadcast.

## Open Items
- [ ] Decide N (total agents). Suggest 500–1000 for fast demo runs.
- [ ] Confirm population density weighting source for Valencia district (currently: uniform random placement)
- [ ] Design replay file format for demo (pre-recorded tick-by-tick state)
