"""Legacy acceptance smoke (kept for student familiarity). Prefer tests/unit/."""

import pytest

from src.engine.graph import evaluate_route

pytestmark = [pytest.mark.acceptance]


def test_evaluate_smoke(sample_wall, sample_route, standard_profile):
    result = evaluate_route(sample_wall, sample_route, standard_profile)
    assert len(result.optimal_beta) >= 2
    assert result.crux_move.cost > 0
