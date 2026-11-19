import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.engine.graph import evaluate_route
from src.engine.recommender import (
    RouteRecommendation,
    TrainingGoal,
    generate_random_route,
    recommend_routes,
)
from src.models.schemas import (
    ClimberProfile,
    EvaluationResult,
    Route,
    StyleWeights,
    Wall,
)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
WALL_PATH = BASE_DIR / "data" / "sample_wall.json"
ROUTES_PATH = BASE_DIR / "data" / "sample_routes.json"

app = FastAPI(title="TFG-EasyClimb API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ProfilePayload(BaseModel):
    overhang_deg: float = Field(25.0, ge=-15.0, le=75.0)
    height_cm: float = Field(175.0, ge=120.0, le=230.0)
    ape_index_cm: float = Field(175.0, ge=120.0, le=240.0)
    dynamic_affinity: float = Field(0.5, ge=0.0, le=1.0)
    static_control: float = Field(0.5, ge=0.0, le=1.0)
    crimp_strength: float = Field(0.5, ge=0.0, le=1.0)
    sloper_control: float = Field(0.5, ge=0.0, le=1.0)


class EvaluateRequest(ProfilePayload):
    start_hold_ids: list[str] = Field(default_factory=lambda: ["h01", "h02"])
    finish_hold_id: str = "h12"
    hold_ids: list[str] | None = None


class RecommendRequest(ProfilePayload):
    goal: TrainingGoal = "best_fit"
    target_grade: str | None = None


def _load_wall() -> Wall:
    data = json.loads(WALL_PATH.read_text(encoding="utf-8"))
    return Wall(**data)


def _load_routes() -> list[Route]:
    data = json.loads(ROUTES_PATH.read_text(encoding="utf-8"))
    return [Route(**item) for item in data]


def _to_profile(req: ProfilePayload) -> ClimberProfile:
    return ClimberProfile(
        user_id="demo_user",
        height_cm=req.height_cm,
        ape_index_cm=req.ape_index_cm,
        style_weights=StyleWeights(
            dynamic_affinity=req.dynamic_affinity,
            static_control=req.static_control,
            crimp_strength=req.crimp_strength,
            sloper_control=req.sloper_control,
        ),
    )


@app.get("/api/wall", response_model=Wall)
def get_wall() -> Wall:
    return _load_wall()


@app.post("/api/evaluate", response_model=EvaluationResult)
def evaluate_demo(req: EvaluateRequest) -> EvaluationResult:
    wall = _load_wall().model_copy(update={"overhang_deg": req.overhang_deg})
    active_holds = req.hold_ids if req.hold_ids is not None else [h.hold_id for h in wall.holds]
    route = Route(
        route_id="route_custom_01",
        wall_id=wall.wall_id,
        name="Bloque Interactivo",
        start_hold_ids=req.start_hold_ids,
        finish_hold_id=req.finish_hold_id,
        hold_ids=active_holds,
    )
    try:
        return evaluate_route(wall, route, _to_profile(req))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/routes/recommend", response_model=list[RouteRecommendation])
def recommend_demo_routes(req: RecommendRequest) -> list[RouteRecommendation]:
    wall = _load_wall().model_copy(update={"overhang_deg": req.overhang_deg})
    routes = _load_routes()
    return recommend_routes(
        wall=wall,
        routes=routes,
        profile=_to_profile(req),
        goal=req.goal,
        target_grade=req.target_grade,
    )


@app.post("/api/routes/random", response_model=RouteRecommendation)
def random_demo_route(req: RecommendRequest) -> RouteRecommendation:
    wall = _load_wall().model_copy(update={"overhang_deg": req.overhang_deg})
    try:
        return generate_random_route(
            wall=wall,
            profile=_to_profile(req),
            goal=req.goal,
            target_grade=req.target_grade,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc