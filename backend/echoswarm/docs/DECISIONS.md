# DECISIONS.md — Architectural Decision Log
> Append-only. Never delete entries. Add new decisions at the bottom.

---

## Decision 001 — Hermes Model
**Date:** 2026-04-24  
**Decision:** Use Claude API (`claude-sonnet-4-6`) as the LLM engine behind the "Hermes" role.  
**Rejected alternatives:**
- Nous Research Hermes-3 via Ollama (local) — rejected: 48-hour constraint makes local model setup too risky
- Nous Research Hermes-3 via hosted API — rejected: lower structured output reliability vs. Claude  
**Rationale:** Best JSON structured output for 5 W's schema, native prompt caching reduces costs on repeated CERC template calls, zero setup time. "Hermes" is a role name in the codebase; the model behind it is an implementation detail.

---

## Decision 002 — Demo City & Scope
**Date:** 2026-04-24  
**Decision:** Valencia, Spain — DANA floods, October 2024. Intersection-level graph for a ~5km × 5km district.  
**Rejected alternatives:**
- Synthetic/fictional city — rejected: less compelling to judges, no real Copernicus data
- Hamburg or other European city — rejected: Valencia has a recent, emotionally resonant flood event with available Sentinel-1 data  
**Rationale:** Real disaster, real victims, real satellite data. Judges respond to narrative. Graph scope (~500–1500 nodes, ~1000–3000 edges) is large enough to show bottlenecks but fast enough for demo-time queries.

---

## Decision 003 — MiroFish/OASIS Implementation
**Date:** 2026-04-24  
**Decision:** Build a lightweight custom Python swarm (4 agent types, probabilistic rules). Call it "MiroFish" internally. Credit OASIS as inspiration in the writeup.  
**Rejected alternatives:**
- Actual OASIS framework — rejected: requires LLM API call per agent per turn; at 1000 agents this is uncontrollable cost and latency during a live demo  
**Rationale:** Full control over agent behavior and speed. Simple enough to debug at 3am. Information decay is measurable without calling an LLM per agent.

---

## Decision 004 — Information Decay Metric
**Date:** 2026-04-24  
**Decision:** Token preservation rate. Count how many key tokens from Hermes' original message (route name, shelter name, action verb) survive after N hops.  
**Rejected alternatives:**
- Cosine similarity on embeddings — rejected: requires embedding model, adds dependency, harder to explain to judges
- Action compliance rate only — rejected: doesn't capture the "telephone game" degradation we want to visualize  
**Rationale:** Fast, interpretable, visualizable as a decay curve. Judges can intuitively understand "the word Oak Street survived 4 hops but was lost by hop 9."

---

## Decision 005 — Copernicus Data Strategy
**Date:** 2026-04-24  
**Decision:** Dual-track. Phase 1 uses local historical Sentinel-1 tiles (Valencia DANA event). Phase 2 swaps in live CDSE API once credentials are ready. Interface is identical: `get_flooded_sectors() → list[SectorPolygon]`.  
**Rejected alternatives:**
- Live-only from the start — rejected: CDSE registration may not be ready in time, blocks Phase 1
- Mock/synthetic flood data only — rejected: weakens the demo narrative and the CDSE integration story  
**Rationale:** Parallel-track approach lets graph development start immediately while the data team handles API setup. Demo uses pre-loaded historical tiles played back in sequence regardless of live API status.

---

## Decision 006 — Seed Broadcast Model
**Date:** 2026-04-24  
**Decision:** Word-of-mouth propagation from 5% seed agents. Hermes message does NOT broadcast to all agents simultaneously.  
**Rejected alternatives:**
- Full broadcast (all agents receive simultaneously) — rejected: eliminates the information decay mechanic entirely  
**Rationale:** Word-of-mouth from a small seed is more realistic (emergency broadcast reaches first responders and immediate neighbors, not every citizen at once) and generates the decay curve we need for the demo.
