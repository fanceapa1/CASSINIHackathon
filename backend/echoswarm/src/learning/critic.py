"""
src/learning/critic.py — Hermes-Critic: Learning Loop (Phase 5)

Analyses a completed MiroFish simulation against the original Hermes message
and produces an SOP Update — a Markdown snippet that HermesEngine prepends to
its system prompt on the next run.

Persists two artefacts per scenario:
  sops/{scenario}.md         — overwritten each run; latest rules only
  sops/{scenario}_history.md — append-only diary of every diagnosis

Usage:
    from dataclasses import asdict
    critic = CriticEngine()
    sop = critic.analyze(
        hermes_message=hermes_result.message.human_readable,
        sim_result=asdict(sim_result),
    )
    print(sop)
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from loguru import logger

try:
    from .. import config
    from ..hermes.engine import _build_clients
except ImportError:
    import config  # type: ignore[no-redef]
    from hermes.engine import _build_clients  # type: ignore[no-redef]

_FALLBACK_SOP_UPDATE = """\
## SOP Update — Emergency Fallback: Connectivity Issue During Analysis
- **Rule:** Include a precise street-level shelter destination and named primary route so Skeptical agents can self-validate without a second source.
- **Rule:** Cite a verifiable data point (satellite timestamp or confirmed road closure) in the first sentence to establish credibility before issuing instructions.\
"""

_SOPS_DIR = Path(__file__).resolve().parent.parent.parent / "sops"

_CRITIC_SYSTEM_PROMPT = """\
You are Hermes-Critic, an after-action analyst for emergency evacuation systems.
You receive a Hermes evacuation order and the results of a MiroFish population simulation.

Your task: diagnose the communication failure and produce a concise SOP Update.

Focus on: message clarity for multi-hop word-of-mouth, route specificity,
and whether Skeptical agents had enough verifiable, self-contained information
to act without needing external confirmation.

OUTPUT FORMAT: Return a Markdown snippet only. No preamble, no trailing commentary.
Start with: ## SOP Update — [brief 3–5 word diagnosis title]
Then 1–3 bullet points, each on its own line: "- **Rule:** [one-sentence instruction for Hermes]"
Be prescriptive, not descriptive. Each rule must be actionable in the next message.

EXAMPLE OUTPUT:
## SOP Update — Skeptical Agents Need Verifiable Anchors
- **Rule:** Include at least one verifiable data point (satellite timestamp, confirmed road closure, authority name) so Skeptical agents can self-validate without a second source.
- **Rule:** State the shelter destination as a precise street intersection, not a building name alone.\
"""

_CRITIC_USER_TEMPLATE = """\
## Original Hermes Evacuation Message
{hermes_message}

## MiroFish Simulation Results
- Total agents: {total_agents}
- Evacuated (safe + en route at end): {evacuated} ({evacuation_rate:.1%})
- Informed but never acted (hesitation / skepticism): {informed_never_acted}
- Never reached by message: {never_informed}
- Stranded — Immobile agents (expected baseline): {stranded}
- Token preservation at final hop: {final_preservation:.1%}
- Bottleneck roads: {bottleneck_edges}

## Diagnosis Request
Skeptical agents (30% of population) require confirmation from 2 distinct neighbor
sources AND a token preservation rate >60% to transition to EVACUATING.
Given the metrics above, identify the primary failure mode:

1. **Framing** — the threat lacked enough authority/credibility for Skeptical self-verification
2. **Clarity** — route or shelter details degraded too fast through word-of-mouth hops
3. **Content** — missing verifiable data points that Skeptical agents need to act alone

Produce an SOP Update that Hermes must prepend to its next evacuation message.\
"""


class CriticEngine:
    """
    After-action critic for the Hermes / MiroFish pipeline.

    Sends a diagnosis prompt to the configured LLM provider and returns an SOP
    Update Markdown snippet. Automatically persists the result to two locations
    so HermesEngine picks it up on the next invocation.

    Args:
        sop_scenario: Scenario name used to name sop files (default "valencia").
    """

    def __init__(self, *, sop_scenario: str = "valencia") -> None:
        self._client, _ = _build_clients()
        self._scenario = sop_scenario
        _SOPS_DIR.mkdir(parents=True, exist_ok=True)
        logger.info(
            "CriticEngine initialised — model={}  scenario={}",
            self._client.model, sop_scenario,
        )

    # ── Public API ────────────────────────────────────────────────────────────

    def analyze(self, hermes_message: str, sim_result: dict) -> str:
        """
        Diagnose simulation failures and return an SOP Update Markdown snippet.

        The snippet is also:
        - Overwritten to sops/{scenario}.md (picked up by HermesEngine next run)
        - Appended to sops/{scenario}_history.md (scenario-specific diary)

        Args:
            hermes_message: The human_readable field from the Hermes evacuation message.
            sim_result:     Dict matching SimulationResult fields. Easiest source:
                            ``dataclasses.asdict(simulation.run())``

        Returns:
            SOP Update as a Markdown string.

        Raises:
            RuntimeError: LLM provider is not configured (missing API key).
        """
        user_prompt = self._build_user_prompt(hermes_message, sim_result)
        evac_pct = sim_result.get("evacuation_rate", 0.0) * 100
        logger.info(
            "CriticEngine.analyze — run_id={}  evacuation_rate={:.1f}%  model={}",
            sim_result.get("run_id", "unknown"),
            evac_pct,
            self._client.model,
        )

        raw = self._client.complete(
            _CRITIC_SYSTEM_PROMPT, user_prompt, max_tokens=512,
            fallback=_FALLBACK_SOP_UPDATE,
        )
        sop_update = raw.strip() or _FALLBACK_SOP_UPDATE

        self._persist(sop_update, sim_result)
        return sop_update

    # ── Private helpers ───────────────────────────────────────────────────────

    def _build_user_prompt(self, hermes_message: str, sim_result: dict) -> str:
        total = sim_result.get("total_agents", 0)
        evacuated = sim_result.get("evacuated", 0)
        evacuation_rate = sim_result.get("evacuation_rate", 0.0)
        informed_never_acted = sim_result.get("informed_never_acted", 0)
        never_informed = sim_result.get("never_informed", 0)
        # Stranded = Immobile agents; not tracked separately in SimulationResult
        stranded = max(0, total - evacuated - informed_never_acted - never_informed)
        decay_curve = sim_result.get("decay_curve", [1.0])
        final_preservation = decay_curve[-1] if decay_curve else 1.0
        bottleneck_edges = sim_result.get("bottleneck_edges", [])

        return _CRITIC_USER_TEMPLATE.format(
            hermes_message=hermes_message,
            total_agents=total,
            evacuated=evacuated,
            evacuation_rate=evacuation_rate,
            informed_never_acted=informed_never_acted,
            never_informed=never_informed,
            stranded=stranded,
            final_preservation=final_preservation,
            bottleneck_edges=", ".join(bottleneck_edges) if bottleneck_edges else "none recorded",
        )

    def _persist(self, sop_update: str, sim_result: dict) -> None:
        """Overwrite the scenario playbook and append a full entry to the history log."""
        playbook = _SOPS_DIR / f"{self._scenario}.md"
        playbook.write_text(sop_update, encoding="utf-8")
        logger.info("Playbook overwritten → {}", playbook.name)

        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        run_id = sim_result.get("run_id", "unknown")
        evac_rate = sim_result.get("evacuation_rate", 0.0)

        history_entry = (
            f"\n---\n\n"
            f"**Run:** {run_id} · **{timestamp}** · Evac rate: {evac_rate:.1%}\n\n"
            f"{sop_update}\n"
        )
        history = _SOPS_DIR / f"{self._scenario}_history.md"
        with history.open("a", encoding="utf-8") as fh:
            fh.write(history_entry)
        logger.info("Appended to {}", history.name)
