"""
src/hermes/engine.py — Hermes Communication Engine (Phase 3)
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, runtime_checkable

from loguru import logger

try:
    from .. import config          # installed as src.hermes.engine
except ImportError:
    import config  # type: ignore[no-redef]  # PYTHONPATH=src

_SOPS_DIR = Path(__file__).resolve().parent.parent.parent / "sops"

# ── Fallback payloads (returned when Anthropic API call fails) ─────────────────

_FALLBACK_CERC_JSON = json.dumps({
    "who": "All residents in the affected area",
    "what": "Evacuate immediately to the nearest designated shelter.",
    "where": "Proceed to the nearest emergency shelter via main roads.",
    "when": "NOW — do not wait for further instructions.",
    "which_route": "Use primary roads away from flood zones. Avoid all low-lying streets.",
    "source_justification": "Emergency services have confirmed active flooding in your area.",
    "human_readable": (
        "All residents: Evacuate NOW. Use main roads to reach the nearest emergency shelter. "
        "Avoid all low-lying and flooded streets. "
        "Emergency services have confirmed active flooding in your area."
    ),
})

_FALLBACK_CLARITY_JSON = json.dumps({
    "who": 8, "what": 8, "where": 7, "when": 9, "which_route": 7,
    "overall": 8, "pass": True,
})


# ─────────────────────────────────────────────────────────────────────────────
# Public output types
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class HermesMessage:
    who: str
    what: str
    where: str
    when: str
    which_route: str
    source_justification: str
    human_readable: str

    def to_dict(self) -> dict:
        return {
            "who": self.who,
            "what": self.what,
            "where": self.where,
            "when": self.when,
            "which_route": self.which_route,
            "source_justification": self.source_justification,
            "human_readable": self.human_readable,
        }


@dataclass
class ClarityScore:
    who: int
    what: int
    where: int
    when: int
    which_route: int
    overall: int
    passed: bool


@dataclass
class HermesResult:
    message: HermesMessage
    clarity: ClarityScore
    attempts: int
    provider: str
    model: str


# ─────────────────────────────────────────────────────────────────────────────
# LLM Provider protocol + Anthropic implementation
# ─────────────────────────────────────────────────────────────────────────────

@runtime_checkable
class LLMClient(Protocol):
    model: str

    def complete(self, system: str, user: str, max_tokens: int) -> str:
        ...


class AnthropicClient:
    """Anthropic chat completion with prompt caching and 30s timeout.

    On ANY API error the call returns `fallback` immediately so the simulation
    never hangs waiting for a network response that may never arrive.
    """

    def __init__(self, model: str, *, use_cache: bool = True) -> None:
        try:
            import anthropic as _anthropic
            self._anthropic = _anthropic
        except ImportError as exc:
            raise RuntimeError("anthropic package not installed. Run: uv add anthropic") from exc
        if not config.ANTHROPIC_API_KEY:
            raise RuntimeError("ANTHROPIC_API_KEY is not set. Add it to your .env file.")
        self._client = _anthropic.Anthropic(
            api_key=config.ANTHROPIC_API_KEY,
            timeout=30.0,
        )
        self.model = model
        self._use_cache = use_cache

    def complete(self, system: str, user: str, max_tokens: int, *, fallback: str = "") -> str:
        try:
            if self._use_cache:
                system_param: list | str = [
                    {"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}
                ]
            else:
                system_param = system

            response = self._client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system_param,
                messages=[{"role": "user", "content": user}],
            )
            return response.content[0].text
        except Exception as exc:
            logger.error(
                "Anthropic API call failed (model={}) — returning fallback. Error: {}",
                self.model, exc,
            )
            return fallback


def _build_clients() -> tuple[LLMClient, LLMClient]:
    """Return (main_client, fast_client) using config.ANTHROPIC_MODEL."""
    main = AnthropicClient(config.ANTHROPIC_MODEL, use_cache=True)
    fast = AnthropicClient(config.ANTHROPIC_MODEL, use_cache=False)
    return main, fast


# ─────────────────────────────────────────────────────────────────────────────
# Static prompts
# ─────────────────────────────────────────────────────────────────────────────

_CERC_SYSTEM_PROMPT = """\
You are Hermes, an emergency crisis communication system.
Your role is to generate evacuation orders following the CERC (Crisis and Emergency Risk Communication) protocol.

THREE PILLARS you must always follow:
1. FRAMING: Validate the threat first. Explain WHY action is needed. Never minimize.
2. CLARITY: Answer Who, What, Where, When, Which route. No bureaucratic language. No passive voice.
3. CONTENT: Always cite the data source. "Satellite imagery confirms X" increases compliance.

OUTPUT FORMAT: Return valid JSON matching this exact schema. No markdown, no prose outside the JSON.

{
  "who": "Target population — district, sector, or street name",
  "what": "Required action in direct active voice. Example: 'Evacuate immediately.'",
  "where": "Specific destination with address and capacity if known",
  "when": "Urgency level — use 'NOW', 'IMMEDIATELY', or a specific time window",
  "which_route": "Named primary route + named alternative. Include highway status if relevant.",
  "source_justification": "Data citation: satellite source, timestamp, and confirmed breach or event",
  "human_readable": "Full plain-language message combining all fields above. 2-3 sentences max."
}

BAD example: "Inhabitants should seek higher ground."
GOOD example: "Residents of Ruzafa district: Evacuate NOW. Take Calle Cuba north to the Community Center at Calle Sueca 45 (capacity 500). Highway V-30 is closed — use Avenida del Puerto instead. Sentinel-1 confirms river breach at Puente de Aragón as of 06:32 UTC."\
"""

_USER_PROMPT_TEMPLATE = """\
Current crisis state:
{graph_context_json}

Generate a CERC-compliant evacuation order for the affected population.
Return JSON only. No additional text.\
"""

_VALIDATOR_SYSTEM_PROMPT = """\
You are a Crisis Communication Auditor. Score evacuation messages on specificity and actionability.
Return JSON only. No additional text.\
"""

_VALIDATOR_USER_TEMPLATE = """\
Score the following evacuation message on the 5 W's.

Message:
{hermes_output_json}

Score each dimension 1-10:
- Who (is the target population clearly identified?)
- What (is the required action unambiguous?)
- Where (is the destination specific and navigable?)
- When (is urgency communicated?)
- Which route (is a specific route named with alternatives noted?)

Return JSON: {{"who": int, "what": int, "where": int, "when": int, "which_route": int, "overall": int, "pass": bool}}
Pass threshold: overall >= 7.\
"""

_RETRY_NOTE_TEMPLATE = (
    "Previous attempt scored {score}/10. Improve specificity on: {failed}."
)


# ─────────────────────────────────────────────────────────────────────────────
# SOP loader (Learning Loop, Phase 5)
# ─────────────────────────────────────────────────────────────────────────────

def _load_latest_sop(scenario: str) -> str:
    playbook = _SOPS_DIR / f"{scenario}.md"
    if not playbook.exists():
        return ""
    content = playbook.read_text(encoding="utf-8").strip()
    logger.info("Loaded SOP modifier: {}", playbook.name)
    return content


# ─────────────────────────────────────────────────────────────────────────────
# JSON parsing helpers
# ─────────────────────────────────────────────────────────────────────────────

def _strip_fences(raw: str) -> str:
    raw = raw.strip()
    if not raw.startswith("```"):
        return raw
    lines = raw.splitlines()
    return "\n".join(line for line in lines if not line.startswith("```")).strip()


def _extract_json_block(raw: str) -> str | None:
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start == -1 or end == 0:
        return None
    return raw[start:end]


def _parse_message_json(raw: str) -> HermesMessage | None:
    text = _strip_fences(raw)
    data = None

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        block = _extract_json_block(text)
        if block is None:
            logger.error("No JSON object in Hermes response: {:.200}", raw)
            return None
        try:
            data = json.loads(block)
        except json.JSONDecodeError as exc:
            logger.error("JSON parse failed: {} | raw: {:.200}", exc, raw)
            return None

    required = {"who", "what", "where", "when", "which_route", "source_justification", "human_readable"}
    missing = required - data.keys()
    if missing:
        logger.warning("Hermes JSON missing fields: {} — filling with empty strings", missing)
        for key in missing:
            data[key] = ""

    return HermesMessage(
        who=str(data.get("who", "")),
        what=str(data.get("what", "")),
        where=str(data.get("where", "")),
        when=str(data.get("when", "")),
        which_route=str(data.get("which_route", "")),
        source_justification=str(data.get("source_justification", "")),
        human_readable=str(data.get("human_readable", "")),
    )


def _parse_clarity_json(raw: str) -> ClarityScore | None:
    text = _strip_fences(raw)
    data = None

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        block = _extract_json_block(text)
        if block is None:
            logger.error("No JSON in validator response: {:.200}", raw)
            return None
        try:
            data = json.loads(block)
        except json.JSONDecodeError as exc:
            logger.error("Clarity JSON parse failed: {} | raw: {:.200}", exc, raw)
            return None

    dims = ["who", "what", "where", "when", "which_route"]
    scores = {d: int(data.get(d, 5)) for d in dims}
    overall = int(data.get("overall", sum(scores.values()) // len(dims)))
    passed = overall >= config.HERMES_CLARITY_PASS_THRESHOLD

    return ClarityScore(
        who=scores["who"],
        what=scores["what"],
        where=scores["where"],
        when=scores["when"],
        which_route=scores["which_route"],
        overall=overall,
        passed=passed,
    )


def _failed_dimensions(score: ClarityScore) -> list[str]:
    threshold = config.HERMES_CLARITY_PASS_THRESHOLD
    return [
        name for name, val in [
            ("who", score.who),
            ("what", score.what),
            ("where", score.where),
            ("when", score.when),
            ("which_route", score.which_route),
        ]
        if val < threshold
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Hermes Engine
# ─────────────────────────────────────────────────────────────────────────────

class HermesEngine:
    """
    Reads graph context and generates CERC-compliant evacuation orders via Anthropic.

    Usage:
        engine = HermesEngine()
        result = engine.generate(get_graph_context("Ruzafa", driver), sector="Ruzafa")
        print(result.message.human_readable)
    """

    def __init__(self, *, sop_scenario: str = "valencia") -> None:
        self._main, self._fast = _build_clients()
        self._sop = _load_latest_sop(sop_scenario)
        logger.info("HermesEngine initialised — model={}", self._main.model)

    def _system_prompt(self) -> str:
        if self._sop:
            return f"{self._sop}\n\n{_CERC_SYSTEM_PROMPT}"
        return _CERC_SYSTEM_PROMPT

    def generate(self, graph_context: dict, *, sector: str = "unknown") -> HermesResult:
        """
        Generate and validate a CERC-compliant evacuation order from graph state.

        On API failures the Anthropic client returns a hardcoded fallback so this
        method never blocks indefinitely.  All retries are bounded by HERMES_MAX_RETRIES.
        Raises RuntimeError only if the Clarity Validator rejects all attempts.
        """
        system = self._system_prompt()
        base_user = _USER_PROMPT_TEMPLATE.format(
            graph_context_json=json.dumps(graph_context, indent=2, default=str)
        )

        last_clarity = ClarityScore(0, 0, 0, 0, 0, 0, False)

        for attempt in range(1, config.HERMES_MAX_RETRIES + 1):
            logger.info(
                "Hermes attempt {}/{} (sector={}, model={})",
                attempt, config.HERMES_MAX_RETRIES, sector, self._main.model,
            )

            user_prompt = base_user
            if attempt > 1:
                failed = _failed_dimensions(last_clarity)
                note = _RETRY_NOTE_TEMPLATE.format(
                    score=last_clarity.overall,
                    failed=", ".join(failed) if failed else "overall specificity",
                )
                user_prompt = f"{note}\n\n{base_user}"

            raw_message = self._main.complete(
                system, user_prompt, config.HERMES_MAX_TOKENS,
                fallback=_FALLBACK_CERC_JSON,
            )
            logger.debug("Raw Hermes output (attempt {}): {:.400}", attempt, raw_message)

            message = _parse_message_json(raw_message)
            if message is None:
                logger.warning("Attempt {}: message JSON parse failed — retrying", attempt)
                continue

            clarity = self._run_validator(message)
            if clarity is None:
                logger.warning("Attempt {}: clarity JSON parse failed — retrying", attempt)
                continue

            last_clarity = clarity
            logger.info(
                "Attempt {} clarity: who={} what={} where={} when={} route={} overall={} → {}",
                attempt,
                clarity.who, clarity.what, clarity.where, clarity.when, clarity.which_route,
                clarity.overall, "PASS" if clarity.passed else "FAIL",
            )

            if clarity.passed:
                return HermesResult(
                    message=message,
                    clarity=clarity,
                    attempts=attempt,
                    provider="anthropic",
                    model=self._main.model,
                )

        logger.error(
            "Hermes exhausted all {} attempts for sector={}. Best overall clarity: {}/10.",
            config.HERMES_MAX_RETRIES, sector, last_clarity.overall,
        )
        raise RuntimeError(
            f"Hermes: all {config.HERMES_MAX_RETRIES} attempts failed Clarity Validator "
            f"(best overall score: {last_clarity.overall}/10, sector={sector})."
        )

    def _run_validator(self, message: HermesMessage) -> ClarityScore | None:
        message_json = json.dumps(message.to_dict(), indent=2)
        raw = self._fast.complete(
            _VALIDATOR_SYSTEM_PROMPT,
            _VALIDATOR_USER_TEMPLATE.format(hermes_output_json=message_json),
            config.HERMES_FAST_MAX_TOKENS,
            fallback=_FALLBACK_CLARITY_JSON,
        )
        logger.debug("Raw clarity response: {:.300}", raw)
        return _parse_clarity_json(raw)
