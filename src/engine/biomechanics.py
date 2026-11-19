import math

from src.models.schemas import ClimberProfile, Hold, HoldType


def euclidean_distance(hold_a: Hold, hold_b: Hold) -> float:
    return math.hypot(hold_b.x_cm - hold_a.x_cm, hold_b.y_cm - hold_a.y_cm)


def effective_reach_cm(profile: ClimberProfile, overhang_deg: float) -> float:
    """Calcula el alcance máximo efectivo en cm según perfil y desplome."""
    avg_body_cm = (profile.height_cm + profile.ape_index_cm) / 2.0
    base_reach = 0.62 * avg_body_cm
    overhang_rad = math.radians(max(0.0, overhang_deg))
    overhang_factor = math.cos(overhang_rad)
    dynamic_bonus = 1.0 + 0.30 * profile.style_weights.dynamic_affinity
    return base_reach * overhang_factor * dynamic_bonus


def classify_viability(cost: float) -> str:
    if math.isinf(cost):
        return "impossible"
    if cost < 10.0:
        return "comfortable"
    if cost < 16.0:
        return "limit"
    return "critical_dynamic"


def move_cost(
    hold_a: Hold,
    hold_b: Hold,
    overhang_deg: float,
    profile: ClimberProfile,
) -> float:
    """Devuelve el coste biomecánico de transicionar de hold_a a hold_b."""
    dist = euclidean_distance(hold_a, hold_b)
    max_reach = effective_reach_cm(profile, overhang_deg)

    if dist > max_reach:
        return math.inf

    # 1. Coste por distancia (crece rápido al acercarse al límite de alcance)
    dist_ratio = dist / max_reach
    c_dist = (dist_ratio / (1.0 - dist_ratio + 0.15)) * 4.0

    # 2. Coste por calidad del agarre destino modulado por perfil
    grip_modifier = 1.0
    if hold_b.hold_type == HoldType.CRIMP:
        grip_modifier = 1.25 - 0.5 * profile.style_weights.crimp_strength
    elif hold_b.hold_type == HoldType.SLOPER:
        grip_modifier = 1.25 - 0.5 * profile.style_weights.sloper_control
    c_grip = (1.0 - hold_b.grip_quality) * 8.0 * grip_modifier

    # 3. Coste por desplome (penaliza menos a perfiles con buen control estático)
    overhang_rad = math.radians(max(0.0, overhang_deg))
    c_overhang = math.sin(overhang_rad) * 6.0 * (1.2 - 0.4 * profile.style_weights.static_control)

    # 4. Coste base de fatiga por ejecutar un movimiento
    base_effort = 2.0

    return round(base_effort + c_dist + c_grip + c_overhang, 3)