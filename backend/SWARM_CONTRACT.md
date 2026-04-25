# ECHO-SWARM WebSocket Contract

This document describes what our backend expects to receive from the swarm service.

---

## How we trigger you

We open a WebSocket connection to your endpoint:

```
wss://<your-host>/ws/run?scenario=<scenario_name>
```

We do not send any messages over the socket — we only listen.

---

## What we need you to send

Every message must be a JSON object with a `type` field and a `data` field.

### 1. Tick event (send once per simulation step)

```json
{
  "type": "tick",
  "data": {
    "tick": 5,
    "safe": 1200,
    "evacuating": 340,
    "stranded": 60,
    "informed": 1600
  }
}
```

| Field | Type | Description |
|---|---|---|
| `tick` | int | Step number, starting at 1 |
| `safe` | int | Agents who reached safety |
| `evacuating` | int | Agents currently moving |
| `stranded` | int | Agents who cannot move |
| `informed` | int | Agents who received an evacuation order |

---

### 2. Complete event (send exactly once, at the end)

```json
{
  "type": "complete",
  "data": {
    "hermes": {
      "message": {
        "human_readable": "Evacuate zones A3 and B1 immediately via Route 7."
      }
    },
    "critic": {
      "diagnosis": "Bottleneck detected on Route 7 at tick 12.",
      "sop_update": "Add Route 9 as an overflow corridor."
    },
    "map": {
      "flooded_roads": [
        { "id": "way/123", "coords": [[39.47, -0.37], [39.48, -0.38]] }
      ],
      "bottleneck_roads": [
        { "rank": 1, "coords": [[39.46, -0.36], [39.47, -0.37]] }
      ],
      "agents_final": [
        { "lat": 39.47, "lon": -0.37, "state": "SAFE" },
        { "lat": 39.45, "lon": -0.35, "state": "STRANDED" }
      ]
    }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `hermes.message.human_readable` | string | Plain-language evacuation order for the UI |
| `critic.diagnosis` | string | Post-simulation analysis |
| `critic.sop_update` | string | Recommended SOP change |
| `map.flooded_roads` | array | Roads under water — `coords` are `[lat, lon]` pairs |
| `map.bottleneck_roads` | array | Congested roads ranked by severity — `coords` are `[lat, lon]` pairs |
| `map.agents_final` | array | Final agent positions — `state` is `"SAFE"`, `"STRANDED"`, or `"EVACUATING"` |

---

## What we do with your data

- Every `tick` event is forwarded live to the React frontend over our own WebSocket.
- The `complete` event is cached — the full simulation can be replayed later without calling you again.
- If a message fails our schema check we log a warning and continue — we never drop data due to a validation error.
