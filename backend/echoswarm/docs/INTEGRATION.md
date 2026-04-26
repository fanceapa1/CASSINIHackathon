# INTEGRATION.md — System Event Flow

## Purpose
Defines how all four components connect. This is the source of truth for data contracts between components. If a component's output shape changes, this file is updated first.

---

## End-to-End Event Flow

```
[Copernicus Pipeline]
       │
       │  list[SectorPolygon]
       ▼
[Knowledge Graph (Neo4j)]
       │
       │  get_graph_context(sector) → dict
       ▼
[Hermes Engine (Claude API)]
       │
       │  {who, what, where, when, which_route, source_justification, human_readable}
       ▼
[MiroFish Swarm]
       │
       │  SimulationResult {evacuation_rate, decay_curve, bottleneck_edges, ...}
       ▼
[Learning Loop (Hermes Gap Analysis)]
       │
       │  SOP modifier → prepended to Hermes system prompt on next run
       ▼
[Next simulation run]
```

---

## Component Contracts

### Copernicus → Graph
**Function:** `inject_flood(polygons: list[SectorPolygon]) → int`  
**Input:** List of SectorPolygon objects (GeoJSON polygon + metadata)  
**Output:** Count of edges set to `impassable`  
**Side effect:** Writes `edge_status = 'impassable'` on affected Neo4j edges  

---

### Graph → Hermes
**Function:** `get_graph_context(sector: str) → dict`  
**Output schema:**
```json
{
  "affected_sectors": ["Ruzafa", "L'Eixample"],
  "flooded_roads": ["Calle Sueca", "Avenida del Puerto (south)"],
  "open_routes": [
    {"from": "Sector B center", "to": "Community Center Norte", "via": "Calle Cuba → Gran Via"}
  ],
  "shelters": [
    {"name": "Community Center Norte", "address": "Calle Sueca 45", "capacity": 500, "current_occupancy": 0}
  ],
  "satellite_source": "Sentinel-1 pass at 06:32 UTC 2024-10-30"
}
```

---

### Hermes → MiroFish
**Function:** `create_simulation(hermes_message: dict, graph: Neo4jGraph) → Simulation`  
**Input:** The validated Hermes JSON output (5 W's schema)  
**How MiroFish uses it:**
- `which_route` → the "correct" route agents should know
- `where` → the target shelter
- `human_readable` → the initial message injected into seed agents
- Key tokens extracted from `which_route` + `where` + `what` → used for decay measurement

---

### MiroFish → Learning Loop
**Function:** `analyze_simulation(result: SimulationResult, original_message: dict) → SOP`  
**Input:** Simulation metrics + original Hermes message  
**Output:** SOP modifier string (1–3 bullet points)  
**Storage:** `sops/valencia_v{n}.md`  

---

## Orchestration Script Interface
```
python run_simulation.py --scenario valencia_dana_2024 [--source live|local] [--agents 1000] [--ticks 50]
```

Execution order:
1. Load graph (or verify it's already populated)
2. Get flooded sectors (local or live)
3. Inject flood into graph
4. Get graph context for affected sectors
5. Call Hermes → validate with Clarity Validator
6. Initialize MiroFish with Hermes output + graph
7. Run simulation for N ticks
8. (Optional) Run Learning Loop gap analysis
9. Output metrics + decay curve to `results/run_{timestamp}.json`

---

## Shared Data Types (single source of truth)

Define these in `echo_swarm/types.py`:

```python
@dataclass
class SectorPolygon:
    polygon: dict        # GeoJSON
    flood_depth: float
    timestamp: str
    source: str

@dataclass
class HermesMessage:
    who: str
    what: str
    where: str
    when: str
    which_route: str
    source_justification: str
    human_readable: str
    clarity_score: int   # from Clarity Validator

@dataclass
class SimulationResult:
    run_id: str
    total_agents: int
    evacuated: int
    evacuation_rate: float
    informed_never_acted: int
    never_informed: int
    decay_curve: list[float]
    bottleneck_edges: list[str]
    ticks_run: int
```

---

## Open Items
- [ ] Confirm Neo4j connection string format (bolt://localhost:7687 for local Docker)
- [ ] Decide on async vs. sync for Copernicus polling (suggest sync for 48h sprint)
- [ ] Define `run_simulation.py` CLI args fully once Phase 1 is complete
- [ ] Add error handling for Hermes Clarity Validator retry loop (max 3 attempts)
