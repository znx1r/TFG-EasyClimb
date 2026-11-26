# Planning — EasyClimb

**Student:** znx1r  
**Working title:** Intelligent system for generation/evaluation of climbing routes via topological modelling, computer vision, and multi-objective optimisation (GIS × climbing × AI).

## Student seed idea

Topological model of climb-route **viability by user**: given a wall graph and a climber profile (height, ape index, style), decide whether a sequence of holds is feasible and how hard it is.

## Tutor framing (same TFG, sharper research edge)

Keep the student’s topology core, then layer:

1. **Quantify difficulty** mathematically (path cost, crux cost, grade mapping).
2. **Predict move viability** with biomechanical heuristics (later: richer physics).
3. **Generate equivalent routes** for different physiques (same training stimulus, different holds).
4. **Evolutionary / multi-objective search** to design routes (difficulty, variety, safety constraints).
5. **Computer vision** (optional but planned) to ingest real walls from images — without becoming “only a detector”.
6. Light **GIS / layout** thinking: wall coordinates, orientation, overhang as spatial attributes.

## Milestone map

| ID | Deliverable | Exit criteria |
|----|-------------|----------------|
| M0 | Existing graph engine + API + web demo | `make test` green on core engine |
| M1 | English README/planning + large pytest battery | This PR |
| M2 | CV hold detection or clean adapter interface | Remove `TODO(m2)` xfails |
| M3 | Improved biomechanics (forces / COM / footholds) | Remove `TODO(m3)` |
| M4 | Evolutionary / multi-objective generator | Remove `TODO(m4)` |
| M5 | Cross-physique equivalence + wall metadata/GIS | Remove `TODO(m5)` |

## Non-goals (for now)

- Replacing OpenBeta as a global outdoor catalog.
- Training a production YOLO stack before the topology story is solid.
- Shipping Spanish-only product docs once the English planning track is active (memoir language is separate).
