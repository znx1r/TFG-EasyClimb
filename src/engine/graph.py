import itertools
import math

import networkx as nx

from src.engine.biomechanics import classify_viability, euclidean_distance, move_cost
from src.models.schemas import (
    ClimberProfile,
    EvaluationResult,
    MoveEvaluation,
    Route,
    Wall,
)


def build_wall_graph(wall: Wall, profile: ClimberProfile, allowed_hold_ids: set[str] | None = None) -> nx.DiGraph:
    """Construye un grafo dirigido ponderado con las transiciones viables."""
    graph = nx.DiGraph()
    holds = [
        h for h in wall.holds if allowed_hold_ids is None or h.hold_id in allowed_hold_ids
    ]

    for hold in holds:
        graph.add_node(hold.hold_id, hold=hold)

    for hold_a in holds:
        for hold_b in holds:
            if hold_a.hold_id == hold_b.hold_id:
                continue
            # Evita retrocesos bruscos hacia abajo; permite progresión lateral o ascendente
            if hold_b.y_cm < hold_a.y_cm - 10.0:
                continue

            cost = move_cost(hold_a, hold_b, wall.overhang_deg, profile)
            if not math.isinf(cost):
                graph.add_edge(
                    hold_a.hold_id,
                    hold_b.hold_id,
                    weight=cost,
                    distance_cm=round(euclidean_distance(hold_a, hold_b), 2),
                )

    return graph


def evaluate_route(wall: Wall, route: Route, profile: ClimberProfile) -> EvaluationResult:
    """Calcula la beta óptima, el crux y la dificultad personalizada de una ruta."""
    allowed = set(route.hold_ids) | set(route.start_hold_ids) | {route.finish_hold_id}
    graph = build_wall_graph(wall, profile, allowed_hold_ids=allowed)

    best_path: list[str] | None = None
    best_total_cost = math.inf

    for start_id in route.start_hold_ids:
        if start_id not in graph or route.finish_hold_id not in graph:
            continue
        try:
            path = nx.shortest_path(graph, source=start_id, target=route.finish_hold_id, weight="weight")
            total_cost = nx.path_weight(graph, path, weight="weight")
            if total_cost < best_total_cost:
                best_total_cost = total_cost
                best_path = path
        except nx.NetworkXNoPath:
            continue

    if best_path is None or len(best_path) < 2:
        raise ValueError(f"No existe una secuencia viable para el perfil {profile.user_id}")

    moves: list[MoveEvaluation] = []
    for u, v in itertools.pairwise(best_path):
        edge = graph[u][v]
        cost = edge["weight"]
        moves.append(
            MoveEvaluation(
                from_hold=u,
                to_hold=v,
                distance_cm=edge["distance_cm"],
                cost=cost,
                viability_band=classify_viability(cost),
            )
        )

    crux = max(moves, key=lambda m: m.cost)
    other_moves_cost = sum(m.cost for m in moves if m is not crux)
    numeric_difficulty = round(crux.cost + 0.35 * other_moves_cost, 2)

    return EvaluationResult(
        route_id=route.route_id,
        user_id=profile.user_id,
        numeric_difficulty=numeric_difficulty,
        crux_move=crux,
        optimal_beta=best_path,
        moves=moves,
    )