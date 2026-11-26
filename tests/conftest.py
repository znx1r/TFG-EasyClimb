"""Shared fixtures for EasyClimb tests."""

import json
from pathlib import Path

import pytest

from src.models.schemas import ClimberProfile, Route, StyleWeights, Wall

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def sample_wall() -> Wall:
    data = json.loads((ROOT / "data" / "sample_wall.json").read_text(encoding="utf-8"))
    return Wall(**data)


@pytest.fixture
def sample_route(sample_wall: Wall) -> Route:
    return Route(
        route_id="route_demo_01",
        wall_id=sample_wall.wall_id,
        name="Bloque Completo Demo",
        start_hold_ids=["h01", "h02"],
        finish_hold_id="h12",
        hold_ids=[h.hold_id for h in sample_wall.holds],
    )


@pytest.fixture
def standard_profile() -> ClimberProfile:
    return ClimberProfile(user_id="std_user", height_cm=175.0, ape_index_cm=175.0)


@pytest.fixture
def short_static() -> ClimberProfile:
    return ClimberProfile(
        user_id="short_static",
        height_cm=155.0,
        ape_index_cm=155.0,
        style_weights=StyleWeights(dynamic_affinity=0.2, static_control=0.8),
    )


@pytest.fixture
def tall_dynamic() -> ClimberProfile:
    return ClimberProfile(
        user_id="tall_dynamic",
        height_cm=188.0,
        ape_index_cm=192.0,
        style_weights=StyleWeights(dynamic_affinity=0.85, static_control=0.5),
    )
