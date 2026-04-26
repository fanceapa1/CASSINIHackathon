#!/usr/bin/env python3
"""
ECHO-SWARM end-to-end simulation runner — Valencia DANA 2024.

Usage:
    PYTHONPATH=src uv run python run_swarm.py

Requires:
    - Neo4j running (docker-compose up -d)
    - Valencia OSM graph already loaded into Neo4j
    - LLM_PROVIDER + API key in .env (GROQ_API_KEY or ANTHROPIC_API_KEY)

Step ordering matters:
    1. Inject flood first — without this, get_graph_context sees an un-flooded
       graph and Hermes generates an irrelevant message.
    2. Reset before injecting — makes re-runs idempotent; no ghost flood state.
"""

import argparse
import json
import os
import sys
import time
from dataclasses import asdict
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from neo4j import GraphDatabase
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from shapely import unary_union
from shapely.geometry import MultiPolygon, Point

from graph.queries import get_graph_context, inject_flood, reset_flood
from hermes.engine import HermesEngine
from learning.critic import CriticEngine
from satellite.local import get_flooded_sectors
from swarm.agents import AgentState, AgentType
from swarm.simulation import (
    Simulation,
    SimulationConfig,
    build_nx_graph,
    extract_key_tokens,
    find_shelter_node,
    spawn_agents,
)

# ── Infrastructure config (env-driven, not scenario-specific) ─────────────────
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "echoswarm")

_SCENARIOS_DIR = Path(__file__).resolve().parent / "scenarios"

console = Console()


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="ECHO-SWARM end-to-end simulation runner")
    p.add_argument(
        "--scenario",
        default="paiporta",
        help="Scenario name (loads scenarios/<name>.json). Default: paiporta",
    )
    return p.parse_args()


def _load_scenario(name: str) -> dict:
    path = _SCENARIOS_DIR / f"{name}.json"
    if not path.exists():
        console.print(f"[red]✗ Scenario file not found:[/red] {path}")
        sys.exit(1)
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    args = _parse_args()
    scenario = _load_scenario(args.scenario)

    SECTOR: str = scenario["sector"]
    FLOOD_EVENT_ID: str = scenario["flood_event_id"]
    FLOOD_DATA_PATH: str = scenario["flood_data_path"]
    N_AGENTS: int = scenario["n_agents"]
    CITY: str = scenario.get("city", SECTOR)

    t_start = time.perf_counter()
    console.rule(f"[bold blue]ECHO-SWARM · {CITY}  [{args.scenario}][/bold blue]")

    # ── Connect ───────────────────────────────────────────────────────────────
    console.print(f"Connecting to Neo4j at [cyan]{NEO4J_URI}[/cyan] ...")
    try:
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        driver.verify_connectivity()
    except Exception as exc:
        console.print(f"[red]✗ Neo4j connection failed:[/red] {exc}")
        sys.exit(1)

    with driver.session() as session:
        n_nodes = session.run(
            "MATCH (n:Intersection) RETURN count(n) AS n"
        ).single()["n"]

    if n_nodes == 0:
        console.print(
            "[red]✗ No Intersection nodes found.[/red] "
            "Load the Valencia OSM graph first (graph/loader.py)."
        )
        driver.close()
        sys.exit(1)

    console.print(f"[green]✓ Connected[/green] — {n_nodes:,} intersection nodes in graph")

    # ── Step 1: Flood injection ───────────────────────────────────────────────
    console.rule("[bold yellow]Step 1 · Flood Injection (Copernicus EMS EMSR773)[/bold yellow]")

    with console.status("Loading satellite flood polygons..."):
        polygons = get_flooded_sectors(source="local", path=FLOOD_DATA_PATH)
    console.print(f"  {len(polygons)} flood-area polygons loaded from local EMS data")

    with console.status("Resetting prior flood state (idempotency)..."):
        n_reset = reset_flood(FLOOD_EVENT_ID, driver)
    if n_reset:
        console.print(f"  Reset {n_reset} previously flooded edges → passable")

    with console.status("Computing flood union..."):
        raw_union = unary_union(polygons)
        # unary_union can return GeometryCollection on degenerate data; guard it
        if raw_union.geom_type not in ("Polygon", "MultiPolygon"):
            flood_geom = MultiPolygon(
                [g for g in raw_union.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
            )
        else:
            flood_geom = raw_union

    # ── Spatial sanity check ─────────────────────────────────────────────────
    # If this prints 0 the polygon and the graph don't overlap at all — check
    # that the OSM BBOX used during load_graph() covers the EMSR773 flood area.
    with driver.session() as session:
        node_coords = [
            (r["lon"], r["lat"])
            for r in session.run(
                "MATCH (i:Intersection) RETURN i.lon AS lon, i.lat AS lat"
            )
        ]
        n_roads_in_db = session.run("MATCH (n:Road) RETURN count(n) AS n").single()["n"]
        n_connects_in_db = session.run(
            "MATCH ()-[c:CONNECTS]->() RETURN count(c) AS n"
        ).single()["n"]

    # Print the actual coordinate ranges stored in Neo4j — this immediately
    # reveals a lat/lon swap: lon should be ≈ -0.4 and lat should be ≈ 39.4
    # for Paiporta; if those values are reversed the columns are flipped.
    if node_coords:
        stored_lons = [c[0] for c in node_coords]
        stored_lats = [c[1] for c in node_coords]
        console.print(
            f"  Neo4j lon range: [{min(stored_lons):.4f}, {max(stored_lons):.4f}]  "
            f"lat range: [{min(stored_lats):.4f}, {max(stored_lats):.4f}]"
        )

    PROXIMITY_DEG = 0.007  # must match inject_flood default (~780 m)
    n_inside = sum(1 for lon, lat in node_coords if flood_geom.contains(Point(lon, lat)))

    # Check with swapped axes — catches lat/lon flip in stored node coordinates.
    n_inside_swapped = sum(
        1 for lon, lat in node_coords if flood_geom.contains(Point(lat, lon))
    )

    n_near = sum(
        1 for lon, lat in node_coords
        if not flood_geom.contains(Point(lon, lat))
        and flood_geom.distance(Point(lon, lat)) <= PROXIMITY_DEG
    )
    if n_inside > 0:
        inside_label = "[green]OK[/green]"
    elif n_inside_swapped > 0:
        inside_label = (
            f"[red]COORDINATE FLIP DETECTED — {n_inside_swapped} nodes match "
            f"when lat/lon are swapped[/red]"
        )
    elif n_near > 0:
        inside_label = (
            f"[yellow]0 strict — {n_near} within {PROXIMITY_DEG}° buffer (proximity mode)[/yellow]"
        )
    else:
        inside_label = "[red]NONE — polygon and graph BBOX do not overlap![/red]"

    console.print(
        f"  Road nodes: {n_roads_in_db:,}  CONNECTS edges: {n_connects_in_db:,}"
    )
    console.print(
        f"  Intersections inside flood polygon: {n_inside:,} / {len(node_coords):,}  {inside_label}"
    )

    with console.status("Injecting flood into graph..."):
        n_blocked = inject_flood(flood_geom, FLOOD_EVENT_ID, driver)

    if n_blocked == 0:
        console.print(
            "  [red]✗ 0 edges blocked.[/red] "
            "Check the spatial overlap line above and loguru output for details."
        )
    else:
        console.print(f"  [yellow]{n_blocked:,} road edges set to impassable[/yellow]")

    # ── Step 2: Hermes ────────────────────────────────────────────────────────
    console.rule("[bold green]Step 2 · Hermes Crisis Communication Engine[/bold green]")

    with console.status("Querying graph context..."):
        ctx = get_graph_context(SECTOR, driver)

    n_flooded_roads = len(ctx.get("flooded_roads", []))
    n_shelters = len(ctx.get("shelters", []))
    console.print(
        f"  Sector [cyan]{SECTOR}[/cyan] — "
        f"flooded roads: [red]{n_flooded_roads}[/red]  shelters: [green]{n_shelters}[/green]  "
        f"passable edges: {ctx.get('passable_edge_count', '?')}"
    )

    with console.status("Generating CERC evacuation order (Clarity Validator active)..."):
        try:
            hermes = HermesEngine(sop_scenario=args.scenario)
            hermes_result = hermes.generate(ctx, sector=SECTOR)
        except RuntimeError as exc:
            console.print(f"[red]✗ Hermes failed:[/red] {exc}")
            console.print("[dim]Check LLM_PROVIDER and API key in .env[/dim]")
            driver.close()
            sys.exit(1)

    score = hermes_result.clarity
    console.print(Panel(
        hermes_result.message.human_readable,
        title=(
            f"[bold green]Hermes Evacuation Order[/bold green]  "
            f"Clarity {score.overall}/10 · "
            f"{hermes_result.attempts} attempt(s) · "
            f"{hermes_result.provider} / {hermes_result.model}"
        ),
        border_style="green",
        padding=(1, 2),
    ))

    score_table = Table(show_header=True, header_style="dim", box=None, padding=(0, 3))
    for dim in ("Who", "What", "Where", "When", "Which Route"):
        score_table.add_column(dim, justify="center")
    score_table.add_row(
        f"{score.who}/10", f"{score.what}/10", f"{score.where}/10",
        f"{score.when}/10", f"{score.which_route}/10",
    )
    console.print(score_table)

    # ── Step 3: Build swarm ───────────────────────────────────────────────────
    console.rule("[bold magenta]Step 3 · MiroFish Swarm Setup[/bold magenta]")

    with console.status("Building networkx graphs from Neo4j state..."):
        G_passable, G_full = build_nx_graph(driver)

    n_total_edges = G_full.number_of_edges()
    n_passable = G_passable.number_of_edges()
    console.print(
        f"  Nodes: {G_full.number_of_nodes():,}  "
        f"Passable edges: [green]{n_passable:,}[/green]  "
        f"Blocked: [red]{n_total_edges - n_passable:,}[/red]"
    )

    try:
        shelter_node = find_shelter_node(G_passable, driver)
    except ValueError as exc:
        console.print(f"[red]✗ Cannot find shelter node:[/red] {exc}")
        driver.close()
        sys.exit(1)

    key_tokens = extract_key_tokens(hermes_result)
    if not key_tokens:
        console.print("[yellow]⚠ No key tokens extracted — decay curve will be flat[/yellow]")

    console.print(f"  Shelter intersection node: [cyan]{shelter_node}[/cyan]")
    console.print(
        f"  Key tokens ({len(key_tokens)}): [dim]{', '.join(sorted(key_tokens))}[/dim]"
    )

    agents = spawn_agents(G_full, N_AGENTS)
    type_counts = {t: sum(1 for a in agents if a.agent_type == t) for t in AgentType}
    agent_summary = "  ".join(
        f"{t.value.title()}: {n}" for t, n in type_counts.items()
    )
    console.print(f"  Spawned {N_AGENTS} agents — {agent_summary}")

    # ── Step 4: Simulation ────────────────────────────────────────────────────
    console.rule("[bold cyan]Step 4 · Simulation[/bold cyan]")

    config = SimulationConfig(n_agents=N_AGENTS, max_ticks=50)

    with console.status("Pre-computing evacuation routes for all nodes..."):
        sim = Simulation(G_passable, G_full, agents, key_tokens, shelter_node, config)

    console.print(f"  {sim.n_routable_nodes:,} nodes have a passable route to shelter")

    with console.status("Running simulation ticks..."):
        t_sim = time.perf_counter()
        result = sim.run()
        t_sim = time.perf_counter() - t_sim

    console.print(
        f"  [green]Complete[/green] — {result.ticks_run} ticks in {t_sim:.2f}s"
    )

    # ── Step 5: Results ───────────────────────────────────────────────────────
    console.rule("[bold white]Results[/bold white]")

    n_stranded = sum(1 for a in agents if a.state == AgentState.STRANDED)

    summary = Table(
        title=f"Simulation Summary  ·  Run {result.run_id}",
        show_header=True,
        header_style="bold",
        min_width=48,
    )
    summary.add_column("Metric", style="cyan", min_width=30)
    summary.add_column("Value", style="bold white", justify="right")

    evac_pct = f"{result.evacuation_rate:.1%}"
    summary.add_row("Total agents", str(result.total_agents))
    summary.add_row("Evacuated  (Safe + En Route)", f"{result.evacuated}  ({evac_pct})")
    summary.add_row("Informed, never acted", str(result.informed_never_acted))
    summary.add_row("Never informed", str(result.never_informed))
    summary.add_row("Stranded (Immobile)", str(n_stranded))
    summary.add_row("Ticks run", str(result.ticks_run))
    console.print(summary)

    _print_decay_curve(result.decay_curve)
    _print_bottlenecks(result.bottleneck_edges)

    # ── Step 5: Learning Loop (Critic Analysis) ───────────────────────────────
    console.rule("[bold red]Step 5 · The Learning Loop (Critic Analysis)[/bold red]")

    with console.status("Running Hermes-Critic diagnosis..."):
        try:
            critic = CriticEngine(sop_scenario=args.scenario)
            sop_update = critic.analyze(
                hermes_message=hermes_result.message.human_readable,
                sim_result=asdict(result),
            )
        except Exception as exc:
            console.print(f"[red]✗ Critic failed:[/red] {exc}")
            sop_update = None

    if sop_update:
        console.print(Panel(
            sop_update,
            title="[bold red]Hermes-Critic · SOP Update[/bold red]",
            subtitle="[dim]Written to sops/latest_feedback.md and sops/valencia_v*.md[/dim]",
            border_style="red",
            padding=(1, 2),
        ))
    else:
        console.print("[dim]Critic output unavailable — see log for details[/dim]")

    elapsed = time.perf_counter() - t_start
    console.rule()
    console.print(f"[dim]Total runtime {elapsed:.1f}s  ·  Run ID {result.run_id}[/dim]")

    driver.close()


def _print_decay_curve(decay_curve: list[float]) -> None:
    if not decay_curve:
        return

    console.print("\n[bold]Information Decay Curve (token preservation % per tick):[/bold]")

    # ASCII sparkline: normalise to the initial value so the curve starts at █
    max_v = decay_curve[0] if decay_curve[0] > 0 else 1.0
    bars = "▁▂▃▄▅▆▇█"
    sparkline = "".join(bars[min(int((v / max_v) * (len(bars) - 1)), len(bars) - 1)] for v in decay_curve)
    console.print(f"  [cyan]{sparkline}[/cyan]")

    # Sampled values table: show ~8 evenly spaced ticks
    n = len(decay_curve)
    step = max(1, n // 8)
    indices = list(range(0, n, step))
    if indices[-1] != n - 1:
        indices.append(n - 1)

    decay_table = Table(show_header=True, header_style="dim", box=None, padding=(0, 2))
    for i in indices:
        decay_table.add_column(f"T{i + 1}", justify="right")
    decay_table.add_row(*[f"{decay_curve[i]:.0%}" for i in indices])
    console.print(decay_table)


def _print_bottlenecks(bottleneck_edges: list[str]) -> None:
    if not bottleneck_edges:
        return

    console.print("\n[bold]Top Bottleneck Roads (highest agent traffic):[/bold]")
    for rank, road in enumerate(bottleneck_edges, 1):
        bar = "█" * (6 - rank)
        console.print(f"  {rank}. [yellow]{road or 'unnamed'}[/yellow]  [dim]{bar}[/dim]")


if __name__ == "__main__":
    main()
