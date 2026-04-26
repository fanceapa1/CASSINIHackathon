# ECHO-SWARM: Meta-Strategy & Architecture Plan

## Context
48-hour hackathon. Team structure: You (architecture + integration), Data Extraction team (CDSE API).  
Goal of this planning phase: lock the meta-strategy and doc structure before any code is written.  
Current state: BLUEPRINT.md only. No code, no infra.

---

## Architectural Decisions (Locked — Rationale Below)

### Hermes Model → Claude API (claude-sonnet-4-6)
**Why not Nous Hermes-3 locally:** 48 hours. Downloading + running a 7B model via Ollama eats setup time we don't have. If the model misbehaves at 3am, debugging it is brutal.  
**Why Claude:** Best structured JSON output (critical for the 5 W's schema), prompt caching cuts costs on repeated CERC template calls, zero setup. "Hermes" stays as the role name in the codebase — the model behind it is an implementation detail.  
**Risk:** API costs during heavy simulation runs. Mitigate with caching + rate limiting in the swarm.

### Demo City → Valencia, Spain (DANA floods, October 2024)
**Why:** A real disaster with real victims. Judges feel it. Sentinel-1 SAR tiles exist for it. Overpass has the full Spanish road network. The narrative writes itself: "Here is where the bridge failed. Here is what Hermes would have said."  
**Scope:** One district (~5km × 5km) of Valencia. Intersection-level graph granularity (~500–1500 nodes, ~1000–3000 edges). Not every house. Not just "North/South." Exactly the bottleneck-visible resolution we need.

### MiroFish/OASIS → Lightweight Custom Python Swarm (OASIS-Inspired)
**Why not actual OASIS framework:** The real OASIS engine makes LLM API calls per agent per turn. At 1000 agents, that's thousands of API calls. Uncontrollable cost and latency in a live demo.  
**What we build instead:** A Python swarm with simple behavioral rules — 4 agent types (Compliant, Skeptical, Panic, Immobile) with probabilistic message acceptance and relay. We call it "MiroFish" in our codebase. We credit OASIS as the inspiration in the writeup.  
**Information Decay Metric:** Token preservation rate. Count how many key tokens from Hermes' original message (route name, shelter name, action verb) survive after N hops of word-of-mouth. Simple, fast, visualizable as a decay curve. No embedding models needed.

### Copernicus Strategy → Dual-Track
**Phase 1 (NOW):** Local historical Sentinel-1 tiles from the Valencia DANA event. Hardcode flood polygons extracted from these. Build and test everything against this.  
**Phase 2 (when CDSE team delivers):** Swap the flood polygon source to live CDSE API calls. The rest of the pipeline is unchanged because the interface is the same: `get_flooded_sectors() → list[SectorPolygon]`.

---

## Implementation Phases (48-Hour Sprint)

### Phase 1: Graph Foundation (Hours 0–8) — START NOW
**Goal:** Working Neo4j graph of Valencia district with flood injection.

Steps:
1. Overpass API → pull intersection-level road network for chosen Valencia district
2. Load into Neo4j: nodes `{id, name, lat, lon, elevation, capacity, sector}`; edges `{road_name, distance, edge_status: open|impassable|congested}`
3. Write `inject_flood(sector_polygon) → set edges to impassable`
4. Write `get_evacuation_route(origin, destination) → path` (shortest path avoiding impassable)
5. Seed with local Sentinel-1 flood data: extract flooded polygons, call inject_flood

**Success gate:** CLI script that loads graph, floods a zone, returns a valid route around it.

**Parallel track (Data team):** CDSE API registration + test authentication. Deliver `get_flooded_sectors()` stub with the same return type as the local version.

---

### Phase 2: Satellite Pipeline — Live Data (Hours 6–12, after CDSE access)
**Goal:** Replace hardcoded flood polygons with live CDSE API calls.

Steps:
1. Authenticate with CDSE OAuth2
2. Query Sentinel-1 SLC/GRD tile for Valencia bounding box (latest pass)
3. Run flood detection: SAR backscatter thresholding (pre-trained model if time allows, simple threshold if not)
4. Output: list of flooded sector polygons → feed into `inject_flood()`
5. Set up polling interval: every N minutes, re-query and update graph

**Key design choice:** For the demo, pre-download 3–5 historical tiles from different "snapshots" of the Valencia flood progression. Play them back in sequence during demo to simulate "live" satellite updates without depending on a real-time Sentinel-1 pass. The architecture is identical — judges don't need to know the tiles are pre-loaded.

**Success gate:** `get_flooded_sectors()` returns real polygons from a Sentinel-1 tile and updates the graph.

---

### Phase 3: Hermes Engine (Hours 8–18)
**Goal:** LLM generates structured, CERC-compliant evacuation orders from graph state.

Steps:
1. Graph query → extract: `{affected_sectors, open_routes, shelter_capacity, flooded_roads}`
2. Build Hermes system prompt: CERC framing template (validate threat, provide "why", motivate action)
3. Build user prompt: inject graph context as structured JSON
4. Define output schema: `{who, what, where, when, which_route, source_justification}`
5. Add Clarity Validator: a second Claude call that scores the message 1–10 on the 5 W's before it leaves Hermes. Reject and regenerate if score < 7.
6. Persist prompt caching on the system prompt (unchanging) to reduce latency

**Can be tested independently:** Mock the graph context with hardcoded JSON — don't need Phase 1 complete to start prompt engineering.

**Success gate:** Hermes produces a message scoring ≥ 7/10 on Clarity Validator for a sample flood scenario.

---

### Phase 4: MiroFish Swarm (Hours 16–28)
**Goal:** Simulate population response and measure information decay.

Agent types:
- **Compliant (40%):** Follows instructions if received clearly. Relays message verbatim with 80% probability.
- **Skeptical (30%):** Requires 2 confirmations before acting. Degrades message by randomly dropping route details.
- **Panic (20%):** Acts immediately but garbles message (randomly shuffles key tokens).
- **Immobile (10%):** Never evacuates. Doesn't relay.

Steps:
1. Initialize agents on graph nodes (distribute by sector population density)
2. Hermes message → broadcast to seed agents (word-of-mouth from 5% seed agents)
3. Each tick: agents relay to graph-adjacent agents with type-specific mutation rules
4. Log per-tick: message fidelity (token preservation rate), agent evacuation status, route usage
5. After N ticks: output decay curve, evacuation success rate, bottleneck roads

**Success gate:** Simulation produces a visible decay curve over 20+ agent hops.

---

### Phase 5: Learning Loop (Hours 26–34) — Stretch Goal
**Goal:** Hermes analyzes simulation results and improves its own SOP.

Steps:
1. After simulation, extract failure metrics: which agents didn't evacuate, what message variant they received
2. Hermes gap analysis prompt: "Agents in Sector B failed to evacuate. Their received message said X. Original message said Y. Diagnose: Framing, Clarity, or Content failure?"
3. Generate new SOP as a prompt modifier (1–3 bullet points of adjustment)
4. Persist SOP to `sops/valencia_v{n}.md`
5. Re-run simulation with updated SOP → compare evacuation rate delta

**This is a stretch goal.** If Phases 1–4 aren't solid by hour 26, skip this and focus on demo hardening.

---

### Phase 6: Integration + Demo (Hours 32–48)
**Goal:** End-to-end pipeline runs in one command. Demo narrative is rehearsed.

Steps:
1. Orchestration: `python run_simulation.py --scenario valencia_dana_2024`
2. Visualization: pyvis graph render (highlight flooded edges in red, evacuation path in green, agent positions as dots)
3. Pre-record OASIS run if real-time is too slow for live demo (replay mode)
4. Demo narrative: "Before ECHO-SWARM... After ECHO-SWARM... With the Learning Loop..."

---

## Documentation Structure

```
echoswarm/
├── BLUEPRINT.md              ← existing, don't touch
├── PLAN.md                   ← this file
├── docs/
│   ├── DECISIONS.md          ← append-only log of every architectural choice + rationale
│   ├── GRAPH.md              ← Neo4j schema, Overpass query, flood injection logic
│   ├── HERMES.md             ← prompt design, CERC template, 5 W's schema, Clarity Validator
│   ├── SWARM.md              ← agent types, MiroFish rules, information decay metric
│   ├── SATELLITE.md          ← CDSE API workflow, Sentinel-1 processing, demo playback strategy
│   └── INTEGRATION.md        ← how all 4 components wire together, event flow
```

### Rules:
1. **One doc per component, not per phase.** Phases slip and merge. Components don't.
2. **No per-phase implementation .md files.** Track phase progress in tasks, not docs.
3. **DECISIONS.md is the most important file.** Every time we choose something, write: Decision / Rejected alternatives / Rationale / Timestamp.
4. **Component docs are written BEFORE the code for that component** — they are the spec, not the documentation.
5. **No master architecture doc.** That's BLUEPRINT.md. Don't duplicate it.

---

## Remaining Open Questions (Non-Blocking)

- **Before Phase 4:** Exact seed broadcast model — word-of-mouth from 5% seed agents (recommended).
- **Before Phase 3:** Multilingual output? English is fine for technical judges.
- **Before Phase 6:** Visualization upgrade — pyvis for prototype, kepler.gl if time allows.

---

## Verification Gates

| Phase | Gate |
|-------|------|
| 1 | CLI returns valid route around flooded zone |
| 2 | `get_flooded_sectors()` returns real polygons from Sentinel-1 tile |
| 3 | Hermes message scores ≥7/10 on Clarity Validator |
| 4 | Decay curve shows measurable token degradation over 20 hops |
| 5 | Second simulation with updated SOP shows ≥10% evacuation rate improvement |
| 6 | Full pipeline runs in <90 seconds on demo hardware |
