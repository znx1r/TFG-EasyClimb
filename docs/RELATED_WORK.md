# Related work — fit and deviations for EasyClimb

Assessment for **this** TFG (topology + climber-conditioned viability + later CV/optimisation).  
Links checked 2026-11-26.

| Project | What it is | Useful for EasyClimb? | Deviation / caution |
|---------|------------|------------------------|---------------------|
| [scsukas8/NeuralClimb](https://github.com/scsukas8/NeuralClimb) | Classical CV: detect/classify holds by colour on 2D images; paused; planned positivity + route planning | **Inspiration for M2** (hold localisation ideas, gym photo acquisition notes) | Classical Canny/blob pipelines struggle with chalk/shadows; **no** climber-conditioned topology or evolutionary design. Do not treat as a drop-in engine. |
| [mkurc1/climbingcrux_model](https://github.com/mkurc1/climbingcrux_model) | YOLOv9 hold detection + FastAPI route suggestion from photos | **Useful reference** for M2 data/YOLO workflow and a photo→holds API shape | Suggests routes by **user grade**, not by biomechanical graph cost / physique equivalence. Different research question. |
| [GabiShahmayster/ChalkGPT](https://github.com/GabiShahmayster/ChalkGPT) | Heavy CV video pipeline (SAM 2, YOLO, SuperPoint/SuperGlue, CLIP) for route detection & climber tracking | **Useful** for video/hold-tracking ideas if M2 goes beyond stills | Large dependency surface; focuses on **observing** climbs, not generating/evaluating topological viability for a profile. |
| [CesareFaccio/CruxVision](https://github.com/CesareFaccio/CruxVision) | Pose → COM → limb force estimates from climbing video | **Strong M3 inspiration** (biomechanics / COM / force distribution) | Analysis of filmed climbs; EasyClimb’s core is **a priori** route evaluation/generation on a wall graph. |
| [OpenBeta](https://github.com/OpenBeta) (`open-tacos`, openbeta.io) | Open outdoor route catalog + maps | **Peripheral**: catalog/UI patterns, geo metadata vocabulary | Outdoor crag CMS, not indoor board topology or personalised move viability. Avoid turning EasyClimb into another guidebook. |

## How EasyClimb should differ

1. **Primary artefact** = wall graph + climber profile → viability / difficulty / beta (already in `src/engine/`).
2. CV is a **sensor** into the graph (M2), not the thesis centre.
3. Generation (M4/M5) must stay multi-objective and physique-aware — that is the novel slice vs “detect holds and paint a route”.
