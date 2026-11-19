import json
from pathlib import Path

from src.engine.graph import evaluate_route
from src.models.schemas import ClimberProfile, Route, StyleWeights, Wall


def _load_sample_wall() -> Wall:
    data = json.loads(Path("data/sample_wall.json").read_text(encoding="utf-8"))
    return Wall(**data)


def _sample_route(wall: Wall) -> Route:
    return Route(
        route_id="route_demo_01",
        wall_id=wall.wall_id,
        name="Bloque Completo Demo",
        start_hold_ids=["h01", "h02"],
        finish_hold_id="h12",
        hold_ids=[h.hold_id for h in wall.holds],
    )


def test_more_overhang_increases_difficulty() -> None:
    wall_vertical = _load_sample_wall().model_copy(update={"overhang_deg": 0.0})
    wall_overhang = _load_sample_wall().model_copy(update={"overhang_deg": 35.0})
    route = _sample_route(wall_vertical)
    profile = ClimberProfile(user_id="std_user", height_cm=175.0, ape_index_cm=175.0)

    res_vertical = evaluate_route(wall_vertical, route, profile)
    res_overhang = evaluate_route(wall_overhang, route, profile)

    assert res_overhang.numeric_difficulty > res_vertical.numeric_difficulty


def test_different_profiles_find_different_betas() -> None:
    wall = _load_sample_wall()
    route = _sample_route(wall)

    short_static = ClimberProfile(
        user_id="short_static",
        height_cm=155.0,
        ape_index_cm=155.0,
        style_weights=StyleWeights(dynamic_affinity=0.2, static_control=0.8),
    )
    tall_dynamic = ClimberProfile(
        user_id="tall_dynamic",
        height_cm=188.0,
        ape_index_cm=192.0,
        style_weights=StyleWeights(dynamic_affinity=0.85, static_control=0.5),
    )

    res_short = evaluate_route(wall, route, short_static)
    res_tall = evaluate_route(wall, route, tall_dynamic)

    print(f"\nPerfil bajo/estatico -> Beta: {res_short.optimal_beta} | Dif: {res_short.numeric_difficulty} | Crux: {res_short.crux_move.from_hold}->{res_short.crux_move.to_hold}")
    print(f"Perfil alto/dinamico -> Beta: {res_tall.optimal_beta} | Dif: {res_tall.numeric_difficulty} | Crux: {res_tall.crux_move.from_hold}->{res_tall.crux_move.to_hold}")

    assert res_short.optimal_beta != res_tall.optimal_beta
    assert res_short.numeric_difficulty != res_tall.numeric_difficulty