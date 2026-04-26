from __future__ import annotations

import random
from dataclasses import dataclass, field
from enum import Enum


class AgentType(str, Enum):
    COMPLIANT = "compliant"
    SKEPTICAL = "skeptical"
    PANIC = "panic"
    IMMOBILE = "immobile"


class AgentState(str, Enum):
    WAITING = "waiting"        # has not yet received the message
    INFORMED = "informed"      # received message; evaluating whether to act
    EVACUATING = "evacuating"  # moving toward shelter
    SAFE = "safe"              # arrived at shelter
    STRANDED = "stranded"      # Immobile; will not move regardless


@dataclass
class Agent:
    id: str
    agent_type: AgentType
    node_id: str
    origin_node_id: str
    state: AgentState = field(default=AgentState.WAITING)
    tokens: frozenset[str] = field(default_factory=frozenset)
    hop_count: int = 0          # hops message traveled to reach this agent
    ticks_informed: int = 0     # ticks elapsed since first informed
    confirmations: int = 0      # distinct sources that have relayed the message
    route: list[str] = field(default_factory=list)   # pre-computed node path to shelter
    route_index: int = 0        # current step in route
    # internal: tracks unique source IDs so each neighbor counts once
    _seen_sources: set[str] = field(default_factory=set, init=False, repr=False)

    def __post_init__(self) -> None:
        if self.agent_type == AgentType.IMMOBILE:
            self.state = AgentState.STRANDED

    def receive_message(
        self,
        tokens: frozenset[str],
        hop_count: int,
        source_id: str,
    ) -> bool:
        """Accept a relayed message. Returns True if this was a new confirmation."""
        if self.agent_type == AgentType.IMMOBILE:
            return False
        if self.state in (AgentState.EVACUATING, AgentState.SAFE, AgentState.STRANDED):
            return False
        if source_id in self._seen_sources:
            return False

        self._seen_sources.add(source_id)

        if self.state == AgentState.WAITING:
            # First receipt: store message and become INFORMED
            self.tokens = tokens
            self.hop_count = hop_count
            self.state = AgentState.INFORMED

        self.confirmations += 1
        return True

    def relay_tokens(self) -> frozenset[str] | None:
        """Return tokens to broadcast to neighbors, possibly mutated, or None."""
        if self.state in (AgentState.WAITING, AgentState.STRANDED, AgentState.SAFE):
            return None
        if self.agent_type == AgentType.IMMOBILE:
            return None

        tokens_list = list(self.tokens)

        if self.agent_type == AgentType.COMPLIANT:
            # 80% relay probability; message transmitted verbatim
            return self.tokens if random.random() < 0.8 else None

        if self.agent_type == AgentType.SKEPTICAL:
            # Only relay after receiving from 2 distinct sources
            if self.confirmations < 2:
                return None
            # Drop one random key token before relaying
            if tokens_list:
                tokens_list.pop(random.randrange(len(tokens_list)))
            return frozenset(tokens_list)

        if self.agent_type == AgentType.PANIC:
            # Relay immediately; garble 1–2 tokens
            n_drop = min(len(tokens_list), random.randint(1, 2))
            for _ in range(n_drop):
                if tokens_list:
                    tokens_list.pop(random.randrange(len(tokens_list)))
            return frozenset(tokens_list)

        return None

    def can_act(self, total_key_tokens: int) -> bool:
        """True when this agent should transition from INFORMED to EVACUATING."""
        if self.agent_type == AgentType.IMMOBILE:
            return False
        if self.state != AgentState.INFORMED:
            return False

        preservation = len(self.tokens) / total_key_tokens if total_key_tokens > 0 else 0.0

        if self.agent_type == AgentType.SKEPTICAL:
            # Requires confirmation from 2 distinct sources AND message sufficiently intact
            return self.confirmations >= 2 and preservation > 0.6

        # Compliant and Panic act whenever message is clear enough
        return preservation > 0.6
