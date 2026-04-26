# HERMES.md — Communication Engine

## Purpose
Hermes is the Technical Information Architect. It reads the state of the Knowledge Graph and generates structured, CERC-compliant evacuation orders. It is NOT a general chatbot — every output must conform to the 5 W's schema and pass the Clarity Validator before leaving the engine.

---

## Model
- **Provider:** Anthropic Claude API
- **Model ID:** `claude-sonnet-4-6`
- **Caching:** System prompt is cached (static CERC template). User prompt (graph context) is dynamic per call.

---

## Output Schema (5 W's)
Every Hermes message must be a JSON object:
```json
{
  "who":                "Residents of Sector B (Ruzafa district)",
  "what":               "Evacuate immediately. Water is rising.",
  "where":              "Community Center at Calle Sueca 45 (capacity: 500)",
  "when":               "NOW. Do not wait.",
  "which_route":        "Take Calle Cuba north to Avenida del Puerto. Highway V-30 is closed.",
  "source_justification": "Sentinel-1 satellite confirms river breach at Puente de Aragón as of 06:32 UTC.",
  "human_readable":     "Full plain-language message combining all fields above."
}
```

---

## System Prompt — CERC Framing Template
> This is the static, cached portion. Do not modify between runs.

```
You are Hermes, an emergency crisis communication system.
Your role is to generate evacuation orders following the CERC (Crisis and Emergency Risk Communication) protocol.

THREE PILLARS you must always follow:
1. FRAMING: Validate the threat first. Explain WHY action is needed. Never minimize.
2. CLARITY: Answer Who, What, Where, When, Which route. No bureaucratic language. No passive voice.
3. CONTENT: Always cite the data source. "Satellite imagery confirms X" increases compliance.

OUTPUT FORMAT: You must return valid JSON matching the schema provided. No markdown, no prose outside the JSON.

BAD example: "Inhabitants should seek higher ground."
GOOD example: "Residents of North Sector: Evacuate NOW. Take Oak Street to the Community Center. Highway 5 is closed."
```

---

## User Prompt — Graph Context Injection
> This is the dynamic portion. Built from `get_graph_context(sector)`.

```
Current crisis state:
{graph_context_json}

Generate a CERC-compliant evacuation order for the affected population.
Return JSON only. No additional text.
```

---

## Clarity Validator
A second Claude call that scores the generated message before it is released to the swarm.

### Validator Prompt
```
You are a Crisis Communication Auditor. Score the following evacuation message on each of the 5 W's.

Message:
{hermes_output_json}

Score each dimension 1–10:
- Who (is the target population clearly identified?): X/10
- What (is the required action unambiguous?): X/10
- Where (is the destination specific and navigable?): X/10
- When (is urgency communicated?): X/10
- Which route (is the specific route named with alternatives noted?): X/10

Return JSON: {"who": int, "what": int, "where": int, "when": int, "which_route": int, "overall": int, "pass": bool}
Pass threshold: overall >= 7.
```

### Regeneration Logic
- If `pass: false` → regenerate with a note appended to the user prompt: `"Previous attempt scored X/10. Improve specificity on: [failed dimensions]."`
- Max 3 attempts. If still failing, log and alert for human review.

---

## Learning Loop Integration
After each simulation, the gap analysis generates an SOP modifier — a short text block prepended to the system prompt for the next run:

```
SOP v2 (Valencia, Run 2):
- Previous Clarity failures were in 'which_route'. Always name exactly one primary route and one backup.
- Skeptical agents responded better when source data included a timestamp.
```

SOPs are stored in `sops/valencia_v{n}.md` and loaded at Hermes initialization.

---

## Open Items
- [ ] Finalize CERC system prompt wording with team
- [ ] Decide max token budget per Hermes call (to control costs during swarm runs)
- [ ] Confirm JSON schema covers all edge cases (multiple shelters, split sectors)
- [ ] Test prompt caching hit rate on Claude API
