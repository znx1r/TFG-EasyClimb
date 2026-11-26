"""M2 — computer vision hold detection (adapter into the wall graph).

TODO(m2): implement image → list[Hold] (or documented external detector).
Remove every TODO(m2) and xfail when green.
"""

from pathlib import Path

import pytest

pytestmark = [pytest.mark.acceptance]

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.xfail(reason="TODO(m2): src/vision (or src/cv) package with detect_holds()")
def test_vision_package_importable():
    import importlib

    mod = importlib.import_module("src.vision")
    assert hasattr(mod, "detect_holds") or hasattr(mod, "holds_from_image")


@pytest.mark.xfail(reason="TODO(m2): detect_holds returns Hold-compatible dicts with x_cm/y_cm")
def test_detect_holds_shape():
    from src.vision import detect_holds  # type: ignore

    holds = detect_holds(ROOT / "data" / "sample_wall.json")  # placeholder path until image lands
    assert isinstance(holds, list)
    assert holds
    assert {"hold_id", "x_cm", "y_cm"} <= set(holds[0])


@pytest.mark.xfail(reason="TODO(m2): fixtures/images sample wall photo under tests/fixtures/")
def test_cv_image_fixture_exists():
    fixtures = ROOT / "tests" / "fixtures" / "images"
    assert fixtures.is_dir()
    assert any(fixtures.glob("*.jpg")) or any(fixtures.glob("*.png"))


@pytest.mark.xfail(reason="TODO(m2): POST /api/vision/holds or equivalent endpoint")
def test_vision_http_endpoint():
    from fastapi.testclient import TestClient

    from src.api.main import app

    client = TestClient(app)
    r = client.post("/api/vision/holds")
    assert r.status_code in (200, 422)
    assert False, "TODO(m2): wire multipart image upload and assert holds JSON"
