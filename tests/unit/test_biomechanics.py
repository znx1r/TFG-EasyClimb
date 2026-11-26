"""Unit tests for reach and move-cost heuristics (M0/M1)."""

import math

import pytest

from src.engine.biomechanics import (
    classify_viability,
    effective_reach_cm,
    euclidean_distance,
    move_cost,
)
from src.models.schemas import Hold, HoldType

pytestmark = [pytest.mark.unit]


def test_euclidean_distance_axis_aligned():
    a = Hold(hold_id="a", x_cm=0, y_cm=0, hold_type=HoldType.JUG, grip_quality=1.0)
    b = Hold(hold_id="b", x_cm=30, y_cm=40, hold_type=HoldType.JUG, grip_quality=1.0)
    assert euclidean_distance(a, b) == pytest.approx(50.0)


def test_effective_reach_shrinks_with_overhang(standard_profile):
    flat = effective_reach_cm(standard_profile, overhang_deg=0.0)
    steep = effective_reach_cm(standard_profile, overhang_deg=45.0)
    assert steep < flat


def test_classify_viability_bands():
    assert classify_viability(5.0) == "comfortable"
    assert classify_viability(12.0) == "limit"
    assert classify_viability(20.0) == "critical_dynamic"
    assert classify_viability(math.inf) == "impossible"


def test_move_cost_infinite_when_out_of_reach(standard_profile):
    a = Hold(hold_id="a", x_cm=0, y_cm=0, hold_type=HoldType.JUG, grip_quality=1.0)
    b = Hold(hold_id="b", x_cm=0, y_cm=500, hold_type=HoldType.JUG, grip_quality=1.0)
    assert math.isinf(move_cost(a, b, overhang_deg=0.0, profile=standard_profile))
