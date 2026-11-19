import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BodyScanner, { type BodyMeasurement } from "./components/BodyScanner";
import ClimbingBoard, {
  type EvaluationResult,
  type Wall,
} from "./components/ClimbingBoard";
import { playSoftTick } from "./utils/sound";
import "./App.css";

type ClimbingStyle = "static" | "balanced" | "dynamic";
type TrainingGoal =
  | "best_fit"
  | "train_static"
  | "train_dynamic"
  | "train_crimp"
  | "train_sloper"
  | "anti_style";

interface RouteData {
  route_id: string;
  wall_id: string;
  name: string;
  declared_grade_font?: string | null;
  start_hold_ids: string[];
  finish_hold_id: string;
  hold_ids: string[];
}

interface RouteRecommendation {
  route: RouteData;
  evaluation: EvaluationResult;
  estimated_grade: string;
  match_score: number;
  tags: string[];
  reason: string;
}

const API_BASE = "http://127.0.0.1:8000";

const FONT_SCALE = ["6a", "6a+", "6b", "6b+", "6c", "6c+", "7a", "7a+"];

const GRADE_PRESETS = [
  { label: "6a", crimp: 0.3, sloper: 0.3 },
  { label: "6b", crimp: 0.45, sloper: 0.45 },
  { label: "6c", crimp: 0.62, sloper: 0.6 },
  { label: "7a", crimp: 0.8, sloper: 0.78 },
  { label: "7b+", crimp: 0.92, sloper: 0.9 },
];

const TRAINING_GOALS: { key: TrainingGoal; label: string; hint: string }[] = [
  { key: "best_fit", label: "Óptimo para mí", hint: "Afinidad global" },
  { key: "train_static", label: "Técnica Estática", hint: "Equilibrio y control" },
  { key: "train_dynamic", label: "Dinámico", hint: "Alcance y lances" },
  { key: "train_crimp", label: "Regletas", hint: "Fuerza de dedos" },
  { key: "train_sloper", label: "Romos", hint: "Compresión" },
  { key: "anti_style", label: "Anti-Estilo", hint: "Punto débil" },
];

const STYLE_PRESETS: Record<
  ClimbingStyle,
  { title: string; desc: string; dyn: number; stat: number }
> = {
  static: {
    title: "Estático y técnico",
    desc: "Control de core, equilibrio y colocación precisa de pies",
    dyn: 0.25,
    stat: 0.85,
  },
  balanced: {
    title: "Equilibrado",
    desc: "Balance entre control estático e impulsos moderados",
    dyn: 0.55,
    stat: 0.65,
  },
  dynamic: {
    title: "Dinámico / Explosivo",
    desc: "Movimientos largos, coordinación y potencia de tiro",
    dyn: 0.88,
    stat: 0.45,
  },
};

const BAND_LABELS: Record<string, string> = {
  comfortable: "Fluido",
  limit: "Al límite",
  critical_dynamic: "Explosivo",
  impossible: "Inviable",
};

function estimateFontGrade(score: number): string {
  if (score < 22) return "6a";
  if (score < 27) return "6a+";
  if (score < 32) return "6b";
  if (score < 37) return "6b+";
  if (score < 43) return "6c";
  if (score < 49) return "6c+";
  if (score < 56) return "7a";
  return "7a+";
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"board" | "profile">("board");
  const [wall, setWall] = useState<Wall | null>(null);
  const [activeRouteId, setActiveRouteId] = useState<string>("custom");
  const [activeRouteName, setActiveRouteName] = useState<string>("Kilter Board");
  const [activeReason, setActiveReason] = useState<string | null>(null);
  const [litHoldIds, setLitHoldIds] = useState<string[]>([]);
  const [explicitStarts, setExplicitStarts] = useState<string[] | null>(null);
  const [explicitFinish, setExplicitFinish] = useState<string | null>(null);

  const [evalResult, setEvalResult] = useState<EvaluationResult | null>(null);
  const [recommendations, setRecommendations] = useState<RouteRecommendation[]>([]);
  const [loadingRandom, setLoadingRandom] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);
  const [lockedStep, setLockedStep] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);

  const [goal, setGoal] = useState<TrainingGoal>("best_fit");
  const [targetGrade, setTargetGrade] = useState<string>("any");

  const [heightCm, setHeightCm] = useState(171);
  const [wingspanCm, setWingspanCm] = useState(174);
  const [weightKg, setWeightKg] = useState(68);
  const [weightIsEstimated, setWeightIsEstimated] = useState(false);

  const [selectedGrade, setSelectedGrade] = useState("6c");
  const [selectedStyle, setSelectedStyle] = useState<ClimbingStyle>("balanced");

  const [overhangDeg, setOverhangDeg] = useState(30);
  const [dynamicAffinity, setDynamicAffinity] = useState(0.55);
  const [staticControl, setStaticControl] = useState(0.65);
  const [crimpStrength, setCrimpStrength] = useState(0.62);
  const [sloperControl, setSloperControl] = useState(0.6);

  const hasAutoLoadedRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);

  const apeDiff = wingspanCm - heightCm;

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 2200);
  }, []);

  const maxReachCm = useMemo(() => {
    const avgBody = (heightCm + wingspanCm) / 2;
    const baseReach = 0.62 * avgBody;
    const overhangRad = (Math.max(0, overhangDeg) * Math.PI) / 180;
    return baseReach * Math.cos(overhangRad) * (1 + 0.3 * dynamicAffinity);
  }, [heightCm, wingspanCm, overhangDeg, dynamicAffinity]);

  const profilePayload = useMemo(
    () => ({
      overhang_deg: overhangDeg,
      height_cm: heightCm,
      ape_index_cm: wingspanCm,
      dynamic_affinity: dynamicAffinity,
      static_control: staticControl,
      crimp_strength: crimpStrength,
      sloper_control: sloperControl,
    }),
    [
      overhangDeg,
      heightCm,
      wingspanCm,
      dynamicAffinity,
      staticControl,
      crimpStrength,
      sloperControl,
    ]
  );

  useEffect(() => {
    fetch(`${API_BASE}/api/wall`)
      .then((res) => res.json())
      .then((data: Wall) => {
        setWall(data);
        setOverhangDeg(data.overhang_deg);
      })
      .catch(() =>
        setErrorMsg("No se pudo conectar con la API FastAPI en el puerto 8000.")
      );
  }, []);

  const applyRecommendation = useCallback((rec: RouteRecommendation) => {
    setActiveRouteId(rec.route.route_id);
    setActiveRouteName(rec.route.name);
    setActiveReason(rec.reason);
    setLitHoldIds(rec.route.hold_ids);
    setExplicitStarts(rec.route.start_hold_ids);
    setExplicitFinish(rec.route.finish_hold_id);
    setHoveredStep(null);
    setLockedStep(null);
  }, []);

  useEffect(() => {
    if (!wall) return;
    fetch(`${API_BASE}/api/routes/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...profilePayload,
        goal,
        target_grade: targetGrade === "any" ? null : targetGrade,
      }),
    })
      .then((res) => res.json())
      .then((data: RouteRecommendation[]) => {
        setRecommendations(data);
        if (!hasAutoLoadedRef.current && data.length > 0) {
          hasAutoLoadedRef.current = true;
          applyRecommendation(data[0]);
        }
      })
      .catch(() => {});
  }, [wall, profilePayload, goal, targetGrade, applyRecommendation]);

  const handleGenerateRandom = async () => {
    playSoftTick(soundMuted);
    setLoadingRandom(true);
    try {
      const res = await fetch(`${API_BASE}/api/routes/random`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profilePayload,
          goal,
          target_grade: targetGrade === "any" ? null : targetGrade,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setErrorMsg(err.detail || "No se pudo generar un bloque con estos parámetros.");
        return;
      }
      const rec: RouteRecommendation = await res.json();
      applyRecommendation(rec);
      showToast(`Generado: ${rec.route.name} (${rec.estimated_grade})`);
    } catch {
      setErrorMsg("Error de red al generar bloque aleatorio.");
    } finally {
      setLoadingRandom(false);
    }
  };

  const handleSelectBestMatch = () => {
    if (recommendations.length === 0) return;
    playSoftTick(soundMuted);
    const best = recommendations[0];
    applyRecommendation(best);
    showToast(`Cargado: ${best.route.name} · ${best.match_score}% afinidad`);
  };

  const { startIds, finishId } = useMemo(() => {
    if (explicitStarts && explicitFinish) {
      return { startIds: explicitStarts, finishId: explicitFinish };
    }
    if (!wall) return { startIds: [] as string[], finishId: "" };
    const handHolds = wall.holds
      .filter((h) => litHoldIds.includes(h.hold_id) && h.role_allowed !== "foot")
      .sort((a, b) => a.y_cm - b.y_cm);

    if (handHolds.length < 2) return { startIds: [] as string[], finishId: "" };
    const lowestY = handHolds[0].y_cm;
    const starts = handHolds
      .filter((h) => h.y_cm <= lowestY + 20)
      .slice(0, 2)
      .map((h) => h.hold_id);
    return { startIds: starts, finishId: handHolds[handHolds.length - 1].hold_id };
  }, [wall, litHoldIds, explicitStarts, explicitFinish]);

  const runEvaluation = useCallback(async () => {
    if (!wall) return;
    if (litHoldIds.length < 2 || startIds.length === 0 || !finishId) {
      setEvalResult(null);
      setErrorMsg("Enciende al menos 2 presas de mano en el tablero.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profilePayload,
          start_hold_ids: startIds,
          finish_hold_id: finishId,
          hold_ids: litHoldIds,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setEvalResult(null);
        setErrorMsg(err.detail || "Secuencia fuera de alcance para tu perfil actual.");
        return;
      }

      const data: EvaluationResult = await res.json();
      setErrorMsg(null);
      setEvalResult(data);
    } catch {
      setErrorMsg("No hay conexión con el motor en http://127.0.0.1:8000.");
    }
  }, [wall, litHoldIds, startIds, finishId, profilePayload]);

  useEffect(() => {
    runEvaluation();
  }, [runEvaluation]);

  const toggleHold = (holdId: string) => {
    setActiveRouteId("custom");
    setActiveRouteName("Bloque Personalizado");
    setActiveReason(null);
    setExplicitStarts(null);
    setExplicitFinish(null);
    setLitHoldIds((prev) =>
      prev.includes(holdId) ? prev.filter((id) => id !== holdId) : [...prev, holdId]
    );
  };

  const handleScanComplete = (data: BodyMeasurement) => {
    setHeightCm(data.heightCm);
    setWingspanCm(data.wingspanCm);
    setWeightKg(data.weightKg);
    setWeightIsEstimated(true);
    showToast("Perfil antropométrico calibrado con cámara");
  };

  const selectGrade = (gradeLabel: string) => {
    playSoftTick(soundMuted);
    setSelectedGrade(gradeLabel);
    const preset = GRADE_PRESETS.find((g) => g.label === gradeLabel);
    if (preset) {
      setCrimpStrength(preset.crimp);
      setSloperControl(preset.sloper);
    }
  };

  const selectStyle = (styleKey: ClimbingStyle) => {
    playSoftTick(soundMuted);
    setSelectedStyle(styleKey);
    setDynamicAffinity(STYLE_PRESETS[styleKey].dyn);
    setStaticControl(STYLE_PRESETS[styleKey].stat);
  };

  const maxMoveCost = useMemo(() => {
    if (!evalResult || evalResult.moves.length === 0) return 20;
    return Math.max(18, ...evalResult.moves.map((m) => m.cost));
  }, [evalResult]);

  const estimatedGrade = evalResult
    ? estimateFontGrade(evalResult.numeric_difficulty)
    : null;
  const gradeIndex = estimatedGrade ? FONT_SCALE.indexOf(estimatedGrade) : -1;

  const cruxStepIndex = useMemo(() => {
    if (!evalResult) return -1;
    return evalResult.moves.findIndex(
      (m) =>
        m.from_hold === evalResult.crux_move.from_hold &&
        m.to_hold === evalResult.crux_move.to_hold
    );
  }, [evalResult]);

  const routeSignature = `${activeRouteId}:${evalResult?.optimal_beta.join("-") ?? ""}`;

  return (
    <div className="lab-app">
      {/* Barra superior fija minimalista */}
      <header className="lab-topbar">
        <div className="topbar-left">
          <div className="brand-badge" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19L10.5 7L15 14L17.5 10L21 19" />
            </svg>
          </div>
          <span className="brand-name">EasyClimb</span>
          <span className="brand-divider" aria-hidden="true">/</span>
          <button
            type="button"
            className="climber-pill"
            onClick={() => {
              playSoftTick(soundMuted);
              setActiveTab("profile");
            }}
            title="Editar medidas y perfil biomecánico"
          >
            <span>{heightCm} cm</span>
            <span className="dot-sep" />
            <span>Ape {apeDiff >= 0 ? "+" : ""}{apeDiff}</span>
            <span className="dot-sep" />
            <span>{weightKg} kg</span>
            <span className="dot-sep" />
            <span className="climber-pill-grade">{selectedGrade}</span>
          </button>
        </div>

        <nav className="nav-segment" aria-label="Vistas principales">
          <button
            type="button"
            className={`nav-seg-btn ${activeTab === "board" ? "active" : ""}`}
            onClick={() => {
              playSoftTick(soundMuted);
              setActiveTab("board");
            }}
          >
            Tablero
          </button>
          <button
            type="button"
            className={`nav-seg-btn ${activeTab === "profile" ? "active" : ""}`}
            onClick={() => {
              playSoftTick(soundMuted);
              setActiveTab("profile");
            }}
          >
            Perfil y Cámara
          </button>
        </nav>

        <div className="topbar-right">
          <button
            type="button"
            className="icon-control"
            onClick={() => setSoundMuted((m) => !m)}
            aria-label={soundMuted ? "Activar sonido" : "Silenciar sonido"}
            title={soundMuted ? "Activar sonido táctil" : "Silenciar sonido"}
          >
            {soundMuted ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Feedback discreto tipo toast */}
      {toastMsg && (
        <div className="lab-toast" role="status" aria-live="polite">
          <span className="toast-dot" />
          {toastMsg}
        </div>
      )}

      {activeTab === "profile" ? (
        <main className="profile-workbench">
          <section className="profile-pane">
            <BodyScanner
              referenceHeightCm={heightCm}
              onMeasured={handleScanComplete}
            />
          </section>

          <section className="profile-pane">
            <div className="pane-head">
              <h3>Antropometría</h3>
              {weightIsEstimated && <span className="status-chip">Calibrado por cámara</span>}
            </div>

            <div className="measure-grid">
              <label className="measure-field">
                <span>Altura</span>
                <div className="measure-input-row">
                  <input
                    type="number"
                    min={120}
                    max={225}
                    value={heightCm}
                    onChange={(e) => setHeightCm(Number(e.target.value) || 170)}
                  />
                  <em>cm</em>
                </div>
              </label>
              <label className="measure-field">
                <span>Envergadura</span>
                <div className="measure-input-row">
                  <input
                    type="number"
                    min={120}
                    max={235}
                    value={wingspanCm}
                    onChange={(e) => setWingspanCm(Number(e.target.value) || 170)}
                  />
                  <em>cm</em>
                </div>
              </label>
              <label className="measure-field">
                <span>Peso{weightIsEstimated ? " (est.)" : ""}</span>
                <div className="measure-input-row">
                  <input
                    type="number"
                    min={35}
                    max={140}
                    value={weightKg}
                    onChange={(e) => {
                      setWeightKg(Number(e.target.value) || 65);
                      setWeightIsEstimated(false);
                    }}
                  />
                  <em>kg</em>
                </div>
              </label>
            </div>

            <div className="field-section">
              <span className="micro-label">Nivel habitual en bloque</span>
              <div className="grade-selector">
                {GRADE_PRESETS.map((g) => (
                  <button
                    key={g.label}
                    type="button"
                    className={`grade-btn ${selectedGrade === g.label ? "active" : ""}`}
                    onClick={() => selectGrade(g.label)}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field-section">
              <span className="micro-label">Estilo predominante</span>
              <div className="style-stack">
                {(Object.keys(STYLE_PRESETS) as ClimbingStyle[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`style-row ${selectedStyle === key ? "active" : ""}`}
                    onClick={() => selectStyle(key)}
                  >
                    <div className="style-row-head">
                      <strong>{STYLE_PRESETS[key].title}</strong>
                      <span className="radio-dot" />
                    </div>
                    <span>{STYLE_PRESETS[key].desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="btn-primary-action"
              onClick={() => {
                playSoftTick(soundMuted);
                setActiveTab("board");
              }}
            >
              Aplicar al Tablero
            </button>
          </section>
        </main>
      ) : !wall ? (
        <div className="lab-loading">
          <span className="loading-spinner" />
          <span>Conectando con el motor biomecánico EasyClimb...</span>
        </div>
      ) : (
        <main className="lab-workbench">
          {/* CARRIL IZQUIERDO: Entrenamiento y Catálogo */}
          <aside className="lab-rail left-rail">
            <section className="rail-section">
              <div className="section-head">
                <h3>Entrenamiento</h3>
              </div>

              <div className="goal-selector">
                {TRAINING_GOALS.map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    className={`goal-option ${goal === g.key ? "active" : ""}`}
                    onClick={() => {
                      playSoftTick(soundMuted);
                      setGoal(g.key);
                    }}
                  >
                    <span className="goal-indicator" />
                    <span className="goal-text">
                      <strong>{g.label}</strong>
                      <small>{g.hint}</small>
                    </span>
                  </button>
                ))}
              </div>

              <div className="grade-filter">
                <span className="micro-label">Grado objetivo</span>
                <div className="segment-track">
                  {["any", "6a", "6b", "6c", "7a"].map((gr) => (
                    <button
                      key={gr}
                      type="button"
                      className={`segment-item ${targetGrade === gr ? "active" : ""}`}
                      onClick={() => {
                        playSoftTick(soundMuted);
                        setTargetGrade(gr);
                      }}
                    >
                      {gr === "any" ? "Auto" : gr}
                    </button>
                  ))}
                </div>
              </div>

              <div className="cta-group">
                <button
                  type="button"
                  className="btn-primary-action"
                  onClick={handleSelectBestMatch}
                  disabled={recommendations.length === 0}
                >
                  Mejor bloque para mí
                </button>
                <button
                  type="button"
                  className="btn-secondary-action"
                  onClick={handleGenerateRandom}
                  disabled={loadingRandom}
                >
                  {loadingRandom ? (
                    <>
                      <span className="mini-spinner" />
                      Generando bloque...
                    </>
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 3 21 3 21 8" />
                        <line x1="4" y1="20" x2="21" y2="3" />
                        <polyline points="21 16 21 21 16 21" />
                        <line x1="15" y1="15" x2="21" y2="21" />
                        <line x1="4" y1="4" x2="9" y2="9" />
                      </svg>
                      Bloque aleatorio
                    </>
                  )}
                </button>
              </div>
            </section>

            <section className="rail-section catalog-section">
              <div className="section-head">
                <h3>Vías recomendadas</h3>
                <span className="section-count">{recommendations.length}</span>
              </div>

              <div className="route-feed">
                {recommendations.map((rec) => {
                  const isActive = activeRouteId === rec.route.route_id;
                  return (
                    <button
                      key={rec.route.route_id}
                      type="button"
                      className={`route-row ${isActive ? "active" : ""}`}
                      onClick={() => {
                        playSoftTick(soundMuted);
                        applyRecommendation(rec);
                      }}
                    >
                      <div className="route-row-main">
                        <strong>{rec.route.name}</strong>
                        <span className="route-row-grade">{rec.estimated_grade}</span>
                      </div>
                      <div className="route-row-sub">
                        <span>{rec.tags.join(" · ")}</span>
                        <span className="route-row-match">{rec.match_score}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </aside>

          {/* ESCENARIO CENTRAL: Kilter Board protagonista */}
          <section className="lab-center">
            <div className="center-stage-inner">
              <ClimbingBoard
                wall={{ ...wall, overhang_deg: overhangDeg }}
                routeName={activeRouteName}
                routeSignature={routeSignature}
                litHoldIds={litHoldIds}
                startIds={startIds}
                finishId={finishId}
                evalResult={evalResult}
                hoveredStep={hoveredStep}
                lockedStep={lockedStep}
                maxReachCm={maxReachCm}
                heightCm={heightCm}
                wingspanCm={wingspanCm}
                dynamicAffinity={dynamicAffinity}
                soundMuted={soundMuted}
                onToggleHold={toggleHold}
                onSelectStep={setHoveredStep}
                onClearLock={() => setLockedStep(null)}
              />

              {activeReason && (
                <div className="route-insight">
                  <span className="insight-dot" />
                  <p>{activeReason}</p>
                </div>
              )}
            </div>
          </section>

          {/* CARRIL DERECHO: Dificultad, Secuencia y Biomecánica */}
          <aside className="lab-rail right-rail">
            <section className="rail-section">
              <div className="difficulty-hero">
                <div>
                  <span className="micro-label">Dificultad adaptada</span>
                  <div className="difficulty-grade">
                    {estimatedGrade ?? "—"}
                  </div>
                </div>

                <div className="compact-stats">
                  <div className="compact-stat">
                    <span>Esfuerzo</span>
                    <strong>
                      {evalResult ? evalResult.numeric_difficulty.toFixed(1) : "∞"}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className={`compact-stat crux-trigger ${lockedStep === cruxStepIndex && cruxStepIndex >= 0 ? "active" : ""}`}
                    disabled={cruxStepIndex < 0}
                    onClick={() => {
                      if (cruxStepIndex < 0) return;
                      playSoftTick(soundMuted);
                      setLockedStep((prev) => (prev === cruxStepIndex ? null : cruxStepIndex));
                    }}
                    title="Pulsa para fijar el Crux en el tablero"
                  >
                    <span>Crux</span>
                    <strong className="crux-val">
                      {evalResult
                        ? `${evalResult.crux_move.from_hold}→${evalResult.crux_move.to_hold}`
                        : "—"}
                    </strong>
                  </button>
                </div>
              </div>

              {/* Indicador visual continuo de dificultad */}
              <div className="grade-scale" aria-hidden="true">
                {FONT_SCALE.map((g, i) => (
                  <div
                    key={g}
                    className={`scale-seg ${i <= gradeIndex ? "filled" : ""} ${i === gradeIndex ? "current" : ""}`}
                  />
                ))}
              </div>
              <div className="grade-scale-labels">
                <span>6a</span>
                <span>6b+</span>
                <span>6c+</span>
                <span>7a+</span>
              </div>

              {/* Control refinado de inclinación */}
              <div className="incline-block">
                <div className="slider-meta">
                  <span>Inclinación del muro</span>
                  <strong>{overhangDeg}°</strong>
                </div>
                <input
                  type="range"
                  className="precision-slider"
                  min="0"
                  max="50"
                  step="5"
                  value={overhangDeg}
                  onChange={(e) => setOverhangDeg(Number(e.target.value))}
                />
                <div className="slider-ticks">
                  <span>0°</span>
                  <span>25°</span>
                  <span>50°</span>
                </div>
              </div>

              {errorMsg && <div className="rail-alert">{errorMsg}</div>}
            </section>

            <section className="rail-section sequence-section">
              <div className="section-head">
                <h3>Secuencia óptima</h3>
                <span className="section-count">
                  {evalResult ? `${evalResult.moves.length} pasos` : "0"}
                </span>
              </div>

              <div className="sequence-list">
                {evalResult?.moves.map((m, idx) => {
                  const isCrux =
                    m.from_hold === evalResult.crux_move.from_hold &&
                    m.to_hold === evalResult.crux_move.to_hold;
                  const isSelected = lockedStep === idx;
                  const isActive = hoveredStep === idx || isSelected;
                  const pct = Math.min(100, Math.round((m.cost / maxMoveCost) * 100));

                  return (
                    <button
                      key={`${m.from_hold}-${m.to_hold}`}
                      type="button"
                      className={`seq-step ${isCrux ? "crux" : ""} ${isActive ? "active" : ""} ${isSelected ? "locked" : ""}`}
                      onMouseEnter={() => {
                        setHoveredStep(idx);
                        playSoftTick(soundMuted);
                      }}
                      onMouseLeave={() => setHoveredStep(null)}
                      onClick={() => {
                        playSoftTick(soundMuted);
                        setLockedStep((prev) => (prev === idx ? null : idx));
                      }}
                    >
                      <div className="seq-step-top">
                        <div className="seq-step-id">
                          <span className="seq-num">{idx + 1}</span>
                          <strong>{m.from_hold} → {m.to_hold}</strong>
                          <span className="seq-dist">{Math.round(m.distance_cm)} cm</span>
                        </div>
                        <span className={`seq-band ${isCrux ? "crux" : ""}`}>
                          {isCrux ? "Crux" : BAND_LABELS[m.viability_band] ?? m.viability_band}
                        </span>
                      </div>
                      <div className="seq-bar-track">
                        <div
                          className={`seq-bar-fill ${isCrux ? "crux" : ""}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="biomech-disclosure">
                <button
                  type="button"
                  className="disclosure-trigger"
                  onClick={() => setShowAdvanced((s) => !s)}
                  aria-expanded={showAdvanced}
                >
                  <span>Parámetros biomecánicos</span>
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`chevron ${showAdvanced ? "open" : ""}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {showAdvanced && (
                  <div className="biomech-sliders">
                    <div className="mini-slider">
                      <div className="slider-meta"><span>Dinámico</span><strong>{dynamicAffinity.toFixed(2)}</strong></div>
                      <input type="range" className="precision-slider" min="0" max="1" step="0.05" value={dynamicAffinity} onChange={(e) => setDynamicAffinity(Number(e.target.value))} />
                    </div>
                    <div className="mini-slider">
                      <div className="slider-meta"><span>Estático</span><strong>{staticControl.toFixed(2)}</strong></div>
                      <input type="range" className="precision-slider" min="0" max="1" step="0.05" value={staticControl} onChange={(e) => setStaticControl(Number(e.target.value))} />
                    </div>
                    <div className="mini-slider">
                      <div className="slider-meta"><span>Regletas</span><strong>{crimpStrength.toFixed(2)}</strong></div>
                      <input type="range" className="precision-slider" min="0" max="1" step="0.05" value={crimpStrength} onChange={(e) => setCrimpStrength(Number(e.target.value))} />
                    </div>
                    <div className="mini-slider">
                      <div className="slider-meta"><span>Romos</span><strong>{sloperControl.toFixed(2)}</strong></div>
                      <input type="range" className="precision-slider" min="0" max="1" step="0.05" value={sloperControl} onChange={(e) => setSloperControl(Number(e.target.value))} />
                    </div>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </main>
      )}
    </div>
  );
}