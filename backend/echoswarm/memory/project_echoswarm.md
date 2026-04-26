---
name: ECHO-SWARM project overview
description: 48-hour hackathon project — AI evacuation routing + population swarm simulation
type: project
---

ECHO-SWARM is a 48-hour hackathon project simulating AI-driven flood evacuation coordination.

**Why:** Demo city is Valencia, Spain — DANA floods October 2024. Real disaster, real victims, judges feel it.

**Team split ("The Split"):** Ecaterina owns the Neo4j/backend engine (graph, routing, Hermes LLM). Teammates handle raw data extraction (CDSE/Copernicus satellite API).

**Phase status:** Phases 1 and 2 complete (Valencia EMSR728 verified). Phase 3 (Hermes Engine) complete.

**Phases:**
1. Graph Foundation (Hours 0–8) — COMPLETE
2. Satellite Pipeline (Hours 6–12) — COMPLETE
3. Hermes Engine (Hours 8–18) — COMPLETE: src/hermes/engine.py + src/config.py
4. MiroFish Swarm (Hours 16–28) — NEXT
5. Learning Loop (Hours 26–34) — stretch goal
6. Integration + Demo (Hours 32–48)

**Phase 1 success gate:** CLI script that loads graph, floods a zone, returns a valid route around it.

**How to apply:** Track phase progress, flag if work would jump phases out of order.
