from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models  # noqa: F401 — registers models with Base.metadata before init_db
from app.api import auth, simulation, ws
from app.core.database import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="ECHO-SWARM Backend",
    description="Orchestration and caching layer for the ECHO-SWARM crisis simulation platform",
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(simulation.router)
app.include_router(ws.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
