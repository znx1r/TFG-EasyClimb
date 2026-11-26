# TFG-EasyClimb

Student TFG of **znx1r**. Tutor fork: [cesar-andress/TFG-EasyClimb](https://github.com/cesar-andress/TFG-EasyClimb). Upstream: [znx1r/TFG-EasyClimb](https://github.com/znx1r/TFG-EasyClimb).

## Theme

**Intelligent system for generation and evaluation of climbing routes** using:

- topological / graph modelling of a wall and holds,
- biomechanical reach and move-cost heuristics per climber profile,
- (later) computer vision for hold detection,
- (later) multi-objective / evolutionary search for route design,
- optional GIS-style wall layout metadata.

Research questions this project aims to answer:

1. Can route difficulty be quantified mathematically for a given climber?
2. Can we predict biomechanical viability of a move (comfortable / limit / impossible)?
3. Can we generate **equivalent** routes for different physiques?
4. Can evolutionary / multi-objective algorithms design useful training routes?

## What already works (M0)

| Piece | Role |
|-------|------|
| `src/models/schemas.py` | Wall, Hold, Route, ClimberProfile |
| `src/engine/biomechanics.py` | Reach + move cost |
| `src/engine/graph.py` | NetworkX graph + shortest-path “beta” |
| `src/engine/recommender.py` | Random / goal-based route suggestions |
| `src/api/main.py` | FastAPI demo API |
| `web/` | Vite/React board UI (student) |
| `data/sample_*.json` | Demo wall and routes |

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
make test
.venv/bin/uvicorn src.api.main:app --reload --port 8000
```

## Milestones

| ID | Outcome | Tests |
|----|---------|-------|
| **M0** | Graph evaluation + sample wall | Passing |
| **M1** | English planning + stronger test battery (this PR) | Passing + xfails listed |
| **M2** | Computer-vision hold detection (or documented adapter) | `TODO(m2)` xfails |
| **M3** | Richer biomechanical viability / force model | `TODO(m3)` xfails |
| **M4** | Multi-objective / evolutionary route generation | `TODO(m4)` xfails |
| **M5** | Equivalent routes across physiques + wall/GIS metadata | `TODO(m5)` xfails |

Planning: [`docs/PLANNING.md`](docs/PLANNING.md) · related work: [`docs/RELATED_WORK.md`](docs/RELATED_WORK.md) · next: [`docs/NEXT.md`](docs/NEXT.md).

## Authorship

Student: **znx1r**. Tutor scaffolding PRs: César Andrés (`cesar-andress`).
