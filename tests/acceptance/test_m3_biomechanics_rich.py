"""M3 — richer biomechanical viability (footholds, COM/forces).

TODO(m3): extend beyond hand-reach heuristics. Remove TODO(m3) xfails when green.
"""

import pytest

from src.models.schemas import HoldRole

pytestmark = [pytest.mark.acceptance]


@pytest.mark.xfail(reason="TODO(m3): footholds must participate in viability (not hand-only graph)")
def test_footholds_affect_evaluation(sample_wall, sample_route, standard_profile):
    from src.engine.graph import evaluate_route

    # Force at least one foothold in the sample wall for the milestone contract
    feet = [h for h in sample_wall.holds if h.role_allowed == HoldRole.FOOT]
    assert feet, "sample wall should include footholds for M3"
    result = evaluate_route(sample_wall, sample_route, standard_profile)
    assert any(m.from_hold.startswith("f") or "foot" in m.from_hold.lower() for m in result.moves)


@pytest.mark.xfail(reason="TODO(m3): centre-of-mass or limb-force estimate on a move")
def test_move_exposes_force_or_com_fields(sample_wall, sample_route, standard_profile):
    from src.engine.graph import evaluate_route

    result = evaluate_route(sample_wall, sample_route, standard_profile)
    crux = result.crux_move.model_dump()
    assert "com_shift_cm" in crux or "peak_force_n" in crux or "force_estimate" in crux


@pytest.mark.xfail(reason="TODO(m3): docs/biomechanics.md describing the richer model")
def test_biomechanics_doc_exists():
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    candidates = [root / "docs" / "biomechanics.md", root / "docs" / "BIOMECHANICS.md"]
    assert any(p.is_file() and p.stat().st_size > 200 for p in candidates)


@pytest.mark.xfail(reason="TODO(m3): impossible moves labelled with structured reason codes")
def test_impossible_move_reason_code(sample_wall, standard_profile):
    from src.engine.biomechanics import move_cost
    from src.models.schemas import Hold, HoldType

    a = Hold(hold_id="a", x_cm=0, y_cm=0, hold_type=HoldType.JUG, grip_quality=1.0)
    b = Hold(hold_id="b", x_cm=0, y_cm=800, hold_type=HoldType.JUG, grip_quality=1.0)
    cost = move_cost(a, b, overhang_deg=0.0, profile=standard_profile)
    # Milestone: return structured result, not only inf
    assert hasattr(cost, "reason") or isinstance(cost, dict)
