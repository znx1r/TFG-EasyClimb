"""Unit tests for wall graph + route evaluation (M0/M1)."""

import pytest

from src.engine.graph import build_wall_graph, evaluate_route

pytestmark = [pytest.mark.unit]


def test_build_wall_graph_has_nodes(sample_wall, standard_profile):
    g = build_wall_graph(sample_wall, standard_profile)
    assert g.number_of_nodes() >= 2
    assert g.number_of_edges() >= 1


def test_evaluate_route_returns_beta_and_crux(sample_wall, sample_route, standard_profile):
    result = evaluate_route(sample_wall, sample_route, standard_profile)
    assert result.optimal_beta[0] in sample_route.start_hold_ids
    assert result.optimal_beta[-1] == sample_route.finish_hold_id
    assert result.crux_move.from_hold in result.optimal_beta
    assert result.numeric_difficulty > 0


def test_more_overhang_increases_difficulty(sample_wall, sample_route, standard_profile):
    vertical = sample_wall.model_copy(update={"overhang_deg": 0.0})
    overhang = sample_wall.model_copy(update={"overhang_deg": 35.0})
    res_v = evaluate_route(vertical, sample_route, standard_profile)
    res_o = evaluate_route(overhang, sample_route, standard_profile)
    assert res_o.numeric_difficulty > res_v.numeric_difficulty


def test_profiles_can_differ_in_beta_or_difficulty(
    sample_wall, sample_route, short_static, tall_dynamic
):
    res_short = evaluate_route(sample_wall, sample_route, short_static)
    res_tall = evaluate_route(sample_wall, sample_route, tall_dynamic)
    assert (
        res_short.optimal_beta != res_tall.optimal_beta
        or res_short.numeric_difficulty != res_tall.numeric_difficulty
    )
