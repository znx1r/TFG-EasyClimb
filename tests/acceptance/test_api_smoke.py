"""Acceptance: FastAPI smoke for the demo API (M0/M1)."""

import pytest
from fastapi.testclient import TestClient

from src.api.main import app

pytestmark = [pytest.mark.acceptance]


@pytest.fixture
def client():
    return TestClient(app)


def test_get_wall(client):
    r = client.get("/api/wall")
    assert r.status_code == 200
    body = r.json()
    assert body["wall_id"]
    assert len(body["holds"]) >= 2


def test_evaluate_default_profile(client):
    r = client.post("/api/evaluate", json={})
    assert r.status_code == 200
    body = r.json()
    assert body["optimal_beta"]
    assert "numeric_difficulty" in body


def test_recommend_routes(client):
    r = client.post("/api/routes/recommend", json={"goal": "best_fit"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)
