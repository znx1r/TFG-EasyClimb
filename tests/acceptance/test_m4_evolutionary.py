"""M4 — multi-objective / evolutionary route generation.

TODO(m4): search routes under difficulty, variety, and safety objectives.
Remove every TODO(m4) and xfail when green.
"""

import pytest

pytestmark = [pytest.mark.acceptance]


@pytest.mark.xfail(reason="TODO(m4): evolutionary generator module (e.g. src/engine/evolve.py)")
def test_evolve_module_importable():
    import importlib

    mod = importlib.import_module("src.engine.evolve")
    assert hasattr(mod, "evolve_routes") or hasattr(mod, "generate_population")


@pytest.mark.xfail(reason="TODO(m4): generator returns ≥N candidate routes with objective scores")
def test_evolve_returns_scored_population(sample_wall, standard_profile):
    from src.engine.evolve import evolve_routes  # type: ignore

    pop = evolve_routes(sample_wall, standard_profile, population_size=8, generations=3)
    assert len(pop) >= 3
    assert "objectives" in pop[0] or "score" in pop[0]


@pytest.mark.xfail(reason="TODO(m4): multi-objective vector includes difficulty + diversity (+ safety)")
def test_objectives_include_difficulty_and_diversity(sample_wall, standard_profile):
    from src.engine.evolve import evolve_routes  # type: ignore

    pop = evolve_routes(sample_wall, standard_profile, population_size=5, generations=2)
    objs = pop[0]["objectives"]
    keys = {k.lower() for k in objs}
    assert "difficulty" in keys or "numeric_difficulty" in keys
    assert "diversity" in keys or "variety" in keys


@pytest.mark.xfail(reason="TODO(m4): POST /api/routes/evolve endpoint")
def test_evolve_http_endpoint():
    from fastapi.testclient import TestClient

    from src.api.main import app

    client = TestClient(app)
    r = client.post("/api/routes/evolve", json={"generations": 2})
    assert r.status_code == 200
    assert isinstance(r.json(), list)
