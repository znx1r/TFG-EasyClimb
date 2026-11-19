import json
from pathlib import Path

WALL_W = 244.0  # Kilter Board 8x12 ft (ancho real)
WALL_H = 366.0  # Kilter Board 8x12 ft (alto real)

# Tipos de presa simétricos por fila (de abajo hacia arriba)
ROW_PATTERNS: list[list[tuple[str, float]]] = [
    # Fila 1 (Inicio - 7 columnas)
    [("jug", 0.88), ("pinch", 0.72), ("jug", 0.90), ("sloper", 0.65), ("jug", 0.90), ("pinch", 0.72), ("jug", 0.88)],
    # Fila 2 (6 columnas intercaladas)
    [("crimp", 0.56), ("jug", 0.80), ("crimp", 0.52), ("crimp", 0.52), ("jug", 0.80), ("crimp", 0.56)],
    # Fila 3 (7 columnas)
    [("sloper", 0.48), ("crimp", 0.46), ("pinch", 0.66), ("volume", 0.58), ("pinch", 0.66), ("crimp", 0.46), ("sloper", 0.48)],
    # Fila 4 (6 columnas)
    [("pinch", 0.58), ("crimp", 0.42), ("sloper", 0.46), ("sloper", 0.46), ("crimp", 0.42), ("pinch", 0.58)],
    # Fila 5 (7 columnas)
    [("crimp", 0.40), ("jug", 0.76), ("pocket", 0.36), ("crimp", 0.44), ("pocket", 0.36), ("jug", 0.76), ("crimp", 0.40)],
    # Fila 6 (6 columnas)
    [("sloper", 0.44), ("pinch", 0.62), ("crimp", 0.38), ("crimp", 0.38), ("pinch", 0.62), ("sloper", 0.44)],
    # Fila 7 (7 columnas)
    [("pinch", 0.60), ("sloper", 0.42), ("jug", 0.74), ("sloper", 0.45), ("jug", 0.74), ("sloper", 0.42), ("pinch", 0.60)],
    # Fila 8 (6 columnas)
    [("crimp", 0.45), ("pinch", 0.58), ("crimp", 0.40), ("crimp", 0.40), ("pinch", 0.58), ("crimp", 0.45)],
    # Fila 9 (Top - 7 columnas)
    [("jug", 0.86), ("sloper", 0.50), ("jug", 0.90), ("jug", 0.95), ("jug", 0.90), ("sloper", 0.50), ("jug", 0.86)],
]

ODD_X = [24.0, 56.0, 89.0, 122.0, 155.0, 188.0, 220.0]
EVEN_X = [40.0, 73.0, 106.0, 138.0, 171.0, 204.0]
ROW_Y = [76.0, 109.0, 142.0, 175.0, 208.0, 241.0, 274.0, 307.0, 340.0]


def build_kilter_wall() -> tuple[dict, dict[tuple[int, int], str]]:
    holds: list[dict] = []
    grid_id: dict[tuple[int, int], str] = {}

    # Reservamos h01, h02 (inicio) y h12 (top centro) para compatibilidad con tests
    reserved: dict[tuple[int, int], str] = {
        (0, 2): "h01",
        (0, 4): "h02",
        (8, 3): "h12",
    }

    next_num = 3
    for r_idx, row in enumerate(ROW_PATTERNS):
        xs = ODD_X if len(row) == 7 else EVEN_X
        y = ROW_Y[r_idx]
        for c_idx, (htype, quality) in enumerate(row):
            if (r_idx, c_idx) in reserved:
                hid = reserved[(r_idx, c_idx)]
            else:
                while next_num == 12:
                    next_num += 1
                hid = f"h{next_num:02d}"
                next_num += 1

            grid_id[(r_idx, c_idx)] = hid
            holds.append(
                {
                    "hold_id": hid,
                    "x_cm": xs[c_idx],
                    "y_cm": y,
                    "hold_type": htype,
                    "grip_quality": quality,
                    "role_allowed": "both" if r_idx <= 3 else "hand",
                }
            )

    # Kickboard inferior (2 filas de pies atornillados exclusivos de pie)
    foot_rows = [
        (22.0, [30.0, 62.0, 94.0, 122.0, 150.0, 182.0, 214.0]),
        (42.0, [46.0, 78.0, 108.0, 136.0, 166.0, 198.0]),
    ]
    f_num = 1
    for y_foot, xs_foot in foot_rows:
        for x_foot in xs_foot:
            holds.append(
                {
                    "hold_id": f"f{f_num:02d}",
                    "x_cm": x_foot,
                    "y_cm": y_foot,
                    "hold_type": "foothold",
                    "grip_quality": 0.70,
                    "role_allowed": "foot",
                }
            )
            f_num += 1

    wall = {
        "wall_id": "kilter_original_8x12",
        "name": "Kilter Board 8×12 Original",
        "width_cm": WALL_W,
        "height_cm": WALL_H,
        "overhang_deg": 30.0,
        "holds": holds,
    }
    return wall, grid_id


def build_kilter_routes(g: dict[tuple[int, int], str]) -> list[dict]:
    return [
        {
            "route_id": "kb_warmup",
            "wall_id": "kilter_original_8x12",
            "name": "Kilter Classic Warmup",
            "declared_grade_font": "6a",
            "start_hold_ids": [g[(0, 2)], g[(0, 4)]],
            "finish_hold_id": g[(8, 3)],
            "hold_ids": [
                "f03", "f05", "f09", "f11",
                g[(0, 2)], g[(0, 4)], g[(1, 1)], g[(2, 2)], g[(3, 3)],
                g[(4, 1)], g[(5, 1)], g[(6, 2)], g[(7, 2)], g[(8, 3)],
            ],
        },
        {
            "route_id": "kb_crimp_rail",
            "wall_id": "kilter_original_8x12",
            "name": "Micro Edge Line",
            "declared_grade_font": "6c",
            "start_hold_ids": [g[(0, 1)], g[(0, 2)]],
            "finish_hold_id": g[(8, 2)],
            "hold_ids": [
                "f02", "f04", "f08", "f10",
                g[(0, 1)], g[(0, 2)], g[(1, 0)], g[(2, 1)], g[(3, 1)],
                g[(4, 0)], g[(5, 2)], g[(6, 2)], g[(7, 2)], g[(8, 2)],
            ],
        },
        {
            "route_id": "kb_dyno_pillar",
            "wall_id": "kilter_original_8x12",
            "name": "Launch Pad 40",
            "declared_grade_font": "6c+",
            "start_hold_ids": [g[(0, 2)], g[(0, 4)]],
            "finish_hold_id": g[(8, 3)],
            "hold_ids": [
                "f04", "f10", "f11",
                g[(0, 2)], g[(0, 4)], g[(2, 3)], g[(4, 3)], g[(6, 4)], g[(8, 3)],
            ],
        },
        {
            "route_id": "kb_sloper_arc",
            "wall_id": "kilter_original_8x12",
            "name": "Compression Wave",
            "declared_grade_font": "6c",
            "start_hold_ids": [g[(0, 4)], g[(0, 5)]],
            "finish_hold_id": g[(8, 4)],
            "hold_ids": [
                "f05", "f06", "f11", "f12",
                g[(0, 4)], g[(0, 5)], g[(2, 6)], g[(3, 3)], g[(5, 5)],
                g[(6, 5)], g[(6, 3)], g[(8, 4)],
            ],
        },
        {
            "route_id": "kb_pinch_symmetry",
            "wall_id": "kilter_original_8x12",
            "name": "Twin Pinches",
            "declared_grade_font": "6b+",
            "start_hold_ids": [g[(0, 1)], g[(0, 5)]],
            "finish_hold_id": g[(8, 3)],
            "hold_ids": [
                "f02", "f06", "f09", "f12",
                g[(0, 1)], g[(0, 5)], g[(2, 2)], g[(2, 4)], g[(3, 0)],
                g[(5, 1)], g[(5, 4)], g[(6, 0)], g[(7, 1)], g[(7, 4)], g[(8, 3)],
            ],
        },
        {
            "route_id": "kb_pocket_crux",
            "wall_id": "kilter_original_8x12",
            "name": "Two-Finger Direct",
            "declared_grade_font": "7a",
            "start_hold_ids": [g[(0, 2)], g[(0, 4)]],
            "finish_hold_id": g[(8, 3)],
            "hold_ids": [
                "f03", "f04", "f05", "f10",
                g[(0, 2)], g[(0, 4)], g[(1, 2)], g[(3, 2)], g[(4, 2)],
                g[(5, 3)], g[(7, 3)], g[(8, 3)],
            ],
        },
        {
            "route_id": "kb_diagonal_flow",
            "wall_id": "kilter_original_8x12",
            "name": "Left-to-Right Traverse",
            "declared_grade_font": "6b",
            "start_hold_ids": [g[(0, 0)], g[(0, 1)]],
            "finish_hold_id": g[(8, 6)],
            "hold_ids": [
                "f01", "f02", "f08", "f10", "f12",
                g[(0, 0)], g[(0, 1)], g[(1, 1)], g[(2, 2)], g[(3, 2)],
                g[(4, 3)], g[(5, 4)], g[(6, 4)], g[(7, 5)], g[(8, 6)],
            ],
        },
        {
            "route_id": "kb_static_ladder",
            "wall_id": "kilter_original_8x12",
            "name": "Precision Control",
            "declared_grade_font": "6b+",
            "start_hold_ids": [g[(0, 2)], g[(0, 4)]],
            "finish_hold_id": g[(8, 3)],
            "hold_ids": [
                "f03", "f05", "f09", "f11",
                g[(0, 2)], g[(0, 4)], g[(1, 2)], g[(1, 3)], g[(2, 2)],
                g[(3, 2)], g[(4, 3)], g[(5, 2)], g[(6, 2)], g[(7, 2)], g[(8, 3)],
            ],
        },
    ]


def main() -> None:
    wall, grid = build_kilter_wall()
    routes = build_kilter_routes(grid)

    Path("data/sample_wall.json").write_text(
        json.dumps(wall, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    Path("data/sample_routes.json").write_text(
        json.dumps(routes, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"OK: {wall['name']} generado con {len(wall['holds'])} presas y {len(routes)} bloques.")


if __name__ == "__main__":
    main()