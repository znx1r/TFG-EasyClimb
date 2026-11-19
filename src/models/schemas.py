from enum import Enum

from pydantic import BaseModel, Field


class HoldType(str, Enum):
    JUG = "jug"
    CRIMP = "crimp"
    SLOPER = "sloper"
    PINCH = "pinch"
    POCKET = "pocket"
    VOLUME = "volume"
    FOOTHOLD = "foothold"


class HoldRole(str, Enum):
    HAND = "hand"
    FOOT = "foot"
    BOTH = "both"


class Hold(BaseModel):
    hold_id: str
    x_cm: float = Field(..., ge=0.0)
    y_cm: float = Field(..., ge=0.0)
    hold_type: HoldType
    grip_quality: float = Field(..., ge=0.0, le=1.0, description="0.0 peor agarre, 1.0 canto bueno")
    role_allowed: HoldRole = HoldRole.BOTH


class Wall(BaseModel):
    wall_id: str
    name: str
    width_cm: float = Field(..., gt=0.0)
    height_cm: float = Field(..., gt=0.0)
    overhang_deg: float = Field(0.0, ge=-15.0, le=75.0, description="0 vertical, >0 desplome")
    holds: list[Hold]


class Route(BaseModel):
    route_id: str
    wall_id: str
    name: str
    declared_grade_font: str | None = None
    start_hold_ids: list[str]
    finish_hold_id: str
    hold_ids: list[str]


class StyleWeights(BaseModel):
    dynamic_affinity: float = Field(0.5, ge=0.0, le=1.0)
    static_control: float = Field(0.5, ge=0.0, le=1.0)
    crimp_strength: float = Field(0.5, ge=0.0, le=1.0)
    sloper_control: float = Field(0.5, ge=0.0, le=1.0)


class ClimberProfile(BaseModel):
    user_id: str
    height_cm: float = Field(..., ge=120.0, le=230.0)
    ape_index_cm: float = Field(..., ge=120.0, le=240.0, description="Envergadura total en cm")
    style_weights: StyleWeights = Field(default_factory=StyleWeights)


class MoveEvaluation(BaseModel):
    from_hold: str
    to_hold: str
    distance_cm: float
    cost: float
    viability_band: str


class EvaluationResult(BaseModel):
    route_id: str
    user_id: str
    numeric_difficulty: float
    crux_move: MoveEvaluation
    optimal_beta: list[str]
    moves: list[MoveEvaluation]