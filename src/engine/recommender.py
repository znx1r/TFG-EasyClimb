import random
from typing import Literal

from pydantic import BaseModel

from src.engine.biomechanics import effective_reach_cm
from src.engine.graph import build_wall_graph, evaluate_route
from src.models.schemas import (
    ClimberProfile,
    EvaluationResult,
    HoldType,
    Route,
    Wall,
)

TrainingGoal = Literal[
    "best_fit",
    "train_static",
    "train_dynamic",
    "train_crimp",
    "train_sloper",
    "anti_style",
]

GRADE_CENTERS: dict[str, float] = {
    "6a": 20.0,
    "6a+": 24.5,
    "6b": 29.5,
    "6b+": 34.5,
    "6c": 40.0,
    "6c+": 46.0,
    "7a": 52.5,
    "7a+": 59.0,
}


class RouteRecommendation(BaseModel):
    route: Route
    evaluation: EvaluationResult
    estimated_grade: str
    match_score: int
    tags: list[str]
    reason: str


def score_to_font(score: float) -> str:
    if score < 22:
        return "6a"
    if score < 27:
        return "6a+"
    if score < 32:
        return "6b"
    if score < 37:
        return "6b+"
    if score < 43:
        return "6c"
    if score < 49:
        return "6c+"
    if score < 56:
        return "7a"
    return "7a+"


def _analyze_style_metrics(
    wall: Wall,
    evaluation: EvaluationResult,
    profile: ClimberProfile,
) -> dict[str, float]:
    hold_map = {h.hold_id: h for h in wall.holds}
    max_reach = max(1.0, effective_reach_cm(profile, wall.overhang_deg))

    distances = [m.distance_cm / max_reach for m in evaluation.moves]
    avg_reach_ratio = sum(distances) / len(distances)
    max_reach_ratio = max(distances)

    beta_holds = [hold_map[hid] for hid in evaluation.optimal_beta if hid in hold_map]
    n_holds = max(1, len(beta_holds))

    crimp_ratio = sum(
        1 for h in beta_holds if h.hold_type in (HoldType.CRIMP, HoldType.POCKET)
    ) / n_holds
    sloper_ratio = sum(
        1 for h in beta_holds if h.hold_type in (HoldType.SLOPER, HoldType.VOLUME)
    ) / n_holds
    pinch_ratio = sum(1 for h in beta_holds if h.hold_type == HoldType.PINCH) / n_holds

    dynamic_index = min(1.0, 0.55 * max_reach_ratio + 0.45 * avg_reach_ratio)
    static_index = max(0.0, 1.0 - dynamic_index) * 0.65 + (
        0.35 * min(1.0, len(evaluation.moves) / 6.0)
    )

    return {
        "dynamic_index": dynamic_index,
        "static_index": static_index,
        "crimp_ratio": crimp_ratio,
        "sloper_ratio": sloper_ratio,
        "pinch_ratio": pinch_ratio,
        "max_reach_ratio": max_reach_ratio,
    }


def _score_route_for_goal(
    wall: Wall,
    evaluation: EvaluationResult,
    profile: ClimberProfile,
    goal: TrainingGoal,
    target_grade: str | None,
) -> tuple[int, list[str], str]:
    metrics = _analyze_style_metrics(wall, evaluation, profile)
    tags: list[str] = []

    if metrics["dynamic_index"] >= 0.68:
        tags.append("Dinámico")
    elif metrics["static_index"] >= 0.58:
        tags.append("Estático")
    if metrics["crimp_ratio"] >= 0.30:
        tags.append("Regletas")
    if metrics["sloper_ratio"] >= 0.30:
        tags.append("Romos")
    if metrics["pinch_ratio"] >= 0.25:
        tags.append("Pinzas")
    if not tags:
        tags.append("Equilibrado")

    # Puntuación por cercanía al grado objetivo
    if target_grade and target_grade in GRADE_CENTERS:
        target_score = GRADE_CENTERS[target_grade]
    else:
        strength_avg = (
            profile.style_weights.crimp_strength + profile.style_weights.sloper_control
        ) / 2.0
        target_score = 22.0 + strength_avg * 30.0

    grade_diff = abs(evaluation.numeric_difficulty - target_score)
    grade_fit = max(0.0, 1.0 - grade_diff / 22.0)

    effective_goal = goal
    if goal == "anti_style":
        if profile.style_weights.dynamic_affinity >= profile.style_weights.static_control:
            effective_goal = "train_static"
        else:
            effective_goal = "train_dynamic"

    if effective_goal == "train_static":
        style_fit = 0.65 * metrics["static_index"] + 0.35 * (
            0.5 * metrics["crimp_ratio"] + 0.5 * metrics["sloper_ratio"]
        )
        reason = (
            "Anti-Estilo: frena atajos explosivos y exige precisión estática."
            if goal == "anti_style"
            else "Secuencia controlada con pasos técnicos para pulir equilibrio y pies."
        )
    elif effective_goal == "train_dynamic":
        style_fit = metrics["dynamic_index"]
        reason = (
            "Anti-Estilo: te saca de tu zona estática con lances amplios."
            if goal == "anti_style"
            else f"Paso largo al {int(metrics['max_reach_ratio'] * 100)}% de tu alcance para entrenar explosividad."
        )
    elif effective_goal == "train_crimp":
        style_fit = min(1.0, metrics["crimp_ratio"] * 1.8)
        reason = "Alta densidad de regletas y cantos pequeños para fuerza de dedos."
    elif effective_goal == "train_sloper":
        style_fit = min(1.0, metrics["sloper_ratio"] * 1.8)
        reason = "Exige compresión y control de cuerpo sobre romos y volúmenes."
    else:
        user_dyn = profile.style_weights.dynamic_affinity
        style_fit = 1.0 - abs(metrics["dynamic_index"] - user_dyn)
        reason = (
            f"Encaja con tu grado y tu estilo ({evaluation.crux_move.from_hold}→"
            f"{evaluation.crux_move.to_hold} como reto principal)."
        )

    total = round((0.48 * grade_fit + 0.52 * style_fit) * 100)
    return max(15, min(99, total)), tags[:3], reason


def recommend_routes(
    wall: Wall,
    routes: list[Route],
    profile: ClimberProfile,
    goal: TrainingGoal = "best_fit",
    target_grade: str | None = None,
) -> list[RouteRecommendation]:
    results: list[RouteRecommendation] = []
    for route in routes:
        try:
            evaluation = evaluate_route(wall, route, profile)
        except ValueError:
            continue

        match_score, tags, reason = _score_route_for_goal(
            wall, evaluation, profile, goal, target_grade
        )
        results.append(
            RouteRecommendation(
                route=route,
                evaluation=evaluation,
                estimated_grade=score_to_font(evaluation.numeric_difficulty),
                match_score=match_score,
                tags=tags,
                reason=reason,
            )
        )

    results.sort(key=lambda r: r.match_score, reverse=True)
    return results


def generate_random_route(
    wall: Wall,
    profile: ClimberProfile,
    goal: TrainingGoal = "best_fit",
    target_grade: str | None = None,
) -> RouteRecommendation:
    """Genera un bloque aleatorio viable sobre el grafo adaptado a dificultad y objetivo."""
    graph = build_wall_graph(wall, profile)
    hold_map = {h.hold_id: h for h in wall.holds}

    low_holds = [h.hold_id for h in wall.holds if h.y_cm <= 110.0]
    top_holds = {h.hold_id for h in wall.holds if h.y_cm >= 310.0}

    candidates: list[RouteRecommendation] = []
    goal_labels = {
        "best_fit": "Adaptado",
        "train_static": "Estático",
        "train_dynamic": "Dinámico",
        "train_crimp": "Regletas",
        "train_sloper": "Romos",
        "anti_style": "Anti-Estilo",
    }

    for attempt in range(70):
        start = random.choice(low_holds)
        path = [start]
        visited = {start}
        current = start

        for _ in range(random.randint(4, 7)):
            neighbors = [
                n
                for n in graph.successors(current)
                if n not in visited and hold_map[n].y_cm > hold_map[current].y_cm + 18.0
            ]
            if not neighbors:
                break

            # Sesga la caminata según el estilo pedido
            weights: list[float] = []
            for n in neighbors:
                dist = graph[current][n]["distance_cm"]
                htype = hold_map[n].hold_type
                w = 1.0
                if goal == "train_dynamic":
                    w += dist / 45.0
                elif goal == "train_static":
                    w += max(0.2, 1.8 - dist / 65.0)
                elif goal == "train_crimp" and htype in (HoldType.CRIMP, HoldType.POCKET) or goal == "train_sloper" and htype in (HoldType.SLOPER, HoldType.VOLUME):
                    w += 3.0
                weights.append(max(0.1, w))

            nxt = random.choices(neighbors, weights=weights, k=1)[0]
            path.append(nxt)
            visited.add(nxt)
            current = nxt
            if current in top_holds and len(path) >= 4:
                break

        if current not in top_holds or len(path) < 4:
            continue

        # Opcionalmente añade 1-2 presas extra de apoyo para darle riqueza al bloque
        extra_pool = [
            h.hold_id
            for h in wall.holds
            if h.hold_id not in visited and 90.0 <= h.y_cm <= 310.0
        ]
        extras = random.sample(extra_pool, k=min(2, len(extra_pool))) if goal == "train_static" else []
        route_holds = list(dict.fromkeys(path + extras))

        route = Route(
            route_id=f"rand_{random.randint(1000, 9999)}_{attempt}",
            wall_id=wall.wall_id,
            name=f"Bloque Random · {goal_labels[goal]} #{random.randint(10, 99)}",
            start_hold_ids=[path[0]],
            finish_hold_id=path[-1],
            hold_ids=route_holds,
        )

        try:
            evaluation = evaluate_route(wall, route, profile)
        except ValueError:
            continue

        match_score, tags, reason = _score_route_for_goal(
            wall, evaluation, profile, goal, target_grade
        )
        candidates.append(
            RouteRecommendation(
                route=route,
                evaluation=evaluation,
                estimated_grade=score_to_font(evaluation.numeric_difficulty),
                match_score=match_score,
                tags=["Generado", *tags[:2]],
                reason=reason,
            )
        )

    if not candidates:
        raise ValueError("No se pudo generar un bloque viable con esa inclinación y perfil.")

    candidates.sort(key=lambda c: c.match_score, reverse=True)
    top_slice = candidates[: min(4, len(candidates))]
    return random.choice(top_slice)