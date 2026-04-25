"""
Swarm service data contract.

The swarm handles all data ingestion internally.
We only send a scenario name and consume the WebSocket stream.
"""
from pydantic import BaseModel


class TickData(BaseModel):
    tick: int
    safe: int
    evacuating: int
    stranded: int
    informed: int


class RoadFeature(BaseModel):
    id: str | None = None
    rank: int | None = None
    coords: list[list[float]]   # [[lat, lon], ...]


class AgentFeature(BaseModel):
    lat: float
    lon: float
    state: str                  # "SAFE" | "STRANDED" | "EVACUATING"


class HermesOutput(BaseModel):
    message: dict               # contains human_readable and structured fields


class CriticOutput(BaseModel):
    diagnosis: str
    sop_update: str


class MapData(BaseModel):
    flooded_roads: list[RoadFeature]
    bottleneck_roads: list[RoadFeature]
    agents_final: list[AgentFeature]


class CompleteData(BaseModel):
    hermes: HermesOutput
    critic: CriticOutput
    map: MapData
