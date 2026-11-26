"""M5 — equivalent routes across physiques + wall/GIS metadata.

TODO(m5): physique transfer and spatial wall attributes.
Remove every TODO(m5) and xfail when green.
"""

from pathlib import Path

import pytest

pytestmark = [pytest.mark.acceptance]

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.xfail(reason="TODO(m5): equivalent_route(wall, route, from_profile, to_profile)")
def test_equivalent_route_api(sample_wall, sample_route, short_static, tall_dynamic):
    from src.engine.equivalence import equivalent_route  # type: ignore

    alt = equivalent_route(sample_wall, sample_route, short_static, tall_dynamic)
    assert alt.hold_ids != sample_route.hold_ids or alt.route_id != sample_route.route_id
    assert alt.wall_id == sample_wall.wall_id


@pytest.mark.xfail(reason="TODO(m5): equivalence preserves difficulty band within tolerance")
def test_equivalent_route_similar_difficulty(
    sample_wall, sample_route, short_static, tall_dynamic
):
    from src.engine.equivalence import equivalent_route  # type: ignore
    from src.engine.graph import evaluate_route

    alt = equivalent_route(sample_wall, sample_route, short_static, tall_dynamic)
    d0 = evaluate_route(sample_wall, sample_route, short_static).numeric_difficulty
    d1 = evaluate_route(sample_wall, alt, tall_dynamic).numeric_difficulty
    assert abs(d0 - d1) / max(d0, 1e-6) < 0.25


@pytest.mark.xfail(reason="TODO(m5): wall schema carries GIS-like metadata (lat/lon or CRS/local frame)")
def test_wall_gis_metadata_fields(sample_wall):
    data = sample_wall.model_dump()
    assert "crs" in data or "latitude" in data or "origin_epsg" in data or "geo" in data


@pytest.mark.xfail(reason="TODO(m5): docs/gis_wall_layout.md explaining spatial attributes")
def test_gis_doc_exists():
    candidates = [
        ROOT / "docs" / "gis_wall_layout.md",
        ROOT / "docs" / "GIS.md",
    ]
    assert any(p.is_file() and p.stat().st_size > 150 for p in candidates)
