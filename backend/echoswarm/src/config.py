"""
src/config.py — LLM and infrastructure configuration for ECHO-SWARM.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()

# ── Anthropic ──────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY: str   = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL:   str   = "claude-3-5-haiku-latest"   # fast + capable for CERC JSON

# ── Satellite / CDSE (Phase 2) ────────────────────────────────────────────────
CDSE_CLIENT_ID:     str = os.getenv("CDSE_CLIENT_ID",     "")
CDSE_CLIENT_SECRET: str = os.getenv("CDSE_CLIENT_SECRET", "")
# Valencia/Paiporta district bbox — (min_lon, min_lat, max_lon, max_lat) WGS-84
VALENCIA_BBOX: tuple[float, float, float, float] = (-0.4197, 39.4165, -0.3891, 39.4372)

# ── Hermes Engine Limits ───────────────────────────────────────────────────────
HERMES_MAX_RETRIES: int          = 2
HERMES_CLARITY_PASS_THRESHOLD: int = 7
HERMES_MAX_TOKENS: int           = 1024
HERMES_FAST_MAX_TOKENS: int      = 256
