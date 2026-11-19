import { useEffect, useMemo, useRef, useState } from "react";
import { computeClimberPose, type StickmanPose } from "../utils/ik";
import { playHoldToggle, playSoftTick, playStepPulse } from "../utils/sound";

export interface Hold {
  hold_id: string;
  x_cm: number;
  y_cm: number;
  hold_type: string;
  grip_quality: number;
  role_allowed: string;
}

export interface Wall {
  wall_id: string;
  name: string;
  width_cm: number;
  height_cm: number;
  overhang_deg: number;
  holds: Hold[];
}

export interface MoveEvaluation {
  from_hold: string;
  to_hold: string;
  distance_cm: number;
  cost: number;
  viability_band: string;
}

export interface EvaluationResult {
  route_id: string;
  user_id: string;
  numeric_difficulty: number;
  crux_move: MoveEvaluation;
  optimal_beta: string[];
  moves: MoveEvaluation[];
}

interface ClimbingBoardProps {
  wall: Wall;
  routeName: string;
  routeSignature: string;
  litHoldIds: string[];
  startIds: string[];
  finishId: string;
  evalResult: EvaluationResult | null;
  hoveredStep: number | null;
  lockedStep: number | null;
  maxReachCm: number;
  heightCm: number;
  wingspanCm: number;
  dynamicAffinity: number;
  soundMuted: boolean;
  onToggleHold: (holdId: string) => void;
  onSelectStep: (idx: number | null) => void;
  onClearLock: () => void;
}

const HOLD_LABELS: Record<string, string> = {
  jug: "Canto (Jug)",
  crimp: "Regleta (Crimp)",
  sloper: "Romo (Sloper)",
  pinch: "Pinza (Pinch)",
  pocket: "Bidedo (Pocket)",
  volume: "Volumen",
  foothold: "Pie Kickboard",
};

const ROLE_LABELS: Record<string, string> = {
  hand: "Mano",
  foot: "Solo pie",
  both: "Mano / Pie",
};

const COL_LABELS = ["A", "B", "C", "D", "E", "F", "G"];
const COL_XS = [24, 56, 89, 122, 155, 188, 220];
const ROW_YS = [76, 109, 142, 175, 208, 241, 274, 307, 340];

function hashAngle(id: string, holdType: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % 360;
  }
  if (holdType === "crimp" || holdType === "foothold") return (hash % 14) - 7;
  if (holdType === "pinch") return (hash % 28) - 14;
  return (hash % 32) - 16;
}

function HoldShape({
  type,
  isLit,
  ledColor,
}: {
  type: string;
  isLit: boolean;
  ledColor: string;
}) {
  const fill = isLit ? "url(#lab-resin-lit)" : "url(#lab-resin-off)";
  const stroke = isLit ? ledColor : "rgba(255,255,255,0.1)";
  const strokeW = isLit ? 0.95 : 0.45;
  const edgeHighlight = isLit ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.1)";

  switch (type) {
    case "jug":
      return (
        <g>
          <path
            d="M -10.5 -2 C -11.5 -7.5, -5 -10.5, 1.5 -9.5 C 8 -8.5, 12.5 -4.5, 10.5 2 C 9 7.5, 3 9, -4 7.5 C -9.5 6, -10 3, -10.5 -2 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeW}
          />
          <path
            d="M -6.5 -3 C -2.5 -6, 4.5 -5.5, 6.5 -2.5 C 4.5 0, -4 0, -6.5 -3 Z"
            fill="#07080A"
            opacity={isLit ? 0.68 : 0.45}
          />
          <path
            d="M -7 -5.2 C -3 -8, 4 -7.5, 7 -4.8"
            fill="none"
            stroke={edgeHighlight}
            strokeWidth="1"
            strokeLinecap="round"
          />
          <circle cx="0" cy="3" r="1.1" fill="#07080A" />
        </g>
      );
    case "crimp":
      return (
        <g>
          <path
            d="M -9.5 -3 C -9.5 -5, -5 -5.8, 0 -5.8 C 5 -5.8, 9.5 -5, 9.5 -3 L 8.8 3 C 8 4.8, -8 4.8, -8.8 3 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeW}
          />
          <path
            d="M -7.2 -3.9 Q 0 -4.9, 7.2 -3.9"
            fill="none"
            stroke={edgeHighlight}
            strokeWidth="1.25"
            strokeLinecap="round"
          />
          <circle cx="0" cy="0.8" r="1" fill="#07080A" />
        </g>
      );
    case "sloper":
      return (
        <g>
          <path
            d="M -10.5 1.5 C -12 -6, -6 -11, 1 -10.5 C 8 -9.5, 12 -3.8, 10.5 3 C 9 9, 2 10.5, -4 9 C -9 7.5, -9.8 5, -10.5 1.5 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeW}
          />
          <ellipse
            cx="-2"
            cy="-3.2"
            rx="5.5"
            ry="3"
            fill={edgeHighlight}
            opacity="0.45"
          />
          <circle cx="2" cy="3" r="1.1" fill="#07080A" opacity="0.75" />
        </g>
      );
    case "pinch":
      return (
        <g>
          <path
            d="M -4.8 -9.5 C -1.5 -11, 3 -10, 5.5 -7.5 C 6.8 -3, 6 4.5, 4 9 C 1.5 11, -3.8 10.2, -5.5 7.5 C -6.8 3, -6.8 -4.5, -4.8 -9.5 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeW}
          />
          <path
            d="M 0 -7.2 L 0.6 7.2"
            fill="none"
            stroke={edgeHighlight}
            strokeWidth="1.1"
            strokeLinecap="round"
          />
          <circle cx="0" cy="0" r="1.05" fill="#07080A" />
        </g>
      );
    case "pocket":
      return (
        <g>
          <path
            d="M -9 -1.5 C -9.8 -6.8, -3.8 -9.8, 2.2 -9 C 8 -7.5, 10.2 -2.2, 8.8 3.8 C 7.2 8.2, -0.8 9.8, -5.2 6.8 C -9 4.5, -8.2 2.2, -9 -1.5 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeW}
          />
          <ellipse cx="-2.3" cy="-1" rx="2.1" ry="2.7" fill="#07080A" opacity="0.9" />
          <ellipse cx="2.7" cy="-0.8" rx="2" ry="2.5" fill="#07080A" opacity="0.9" />
        </g>
      );
    case "volume":
      return (
        <g>
          <polygon
            points="0,-13 12.5,8.5 -12.5,8.5"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeW}
          />
          <polygon points="0,-13 12.5,8.5 0,1.5" fill="rgba(0,0,0,0.32)" />
          <polygon points="0,-13 -12.5,8.5 0,1.5" fill="rgba(255,255,255,0.06)" />
        </g>
      );
    default:
      return (
        <g>
          <path
            d="M -5.8 -2.2 Q 0 -4.8, 5.8 -2.2 L 5 2.8 Q 0 4.2, -5 2.8 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeW}
          />
        </g>
      );
  }
}

function StickmanLayer({
  pose,
  isCruxMove,
}: {
  pose: StickmanPose;
  isCruxMove: boolean;
}) {
  const baseStroke = "#E5E7EB";
  const activeStroke = isCruxMove ? "#FF4D5E" : "#38BDF8";

  return (
    <g pointerEvents="none" className="stickman-layer">
      <g
        opacity="0.3"
        transform="translate(2.5, 4)"
        stroke="#000000"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <line x1={pose.shoulderL.x} y1={pose.shoulderL.y} x2={pose.elbowL.x} y2={pose.elbowL.y} strokeWidth="4.6" />
        <line x1={pose.elbowL.x} y1={pose.elbowL.y} x2={pose.handL.x} y2={pose.handL.y} strokeWidth="3.8" />
        <line x1={pose.shoulderR.x} y1={pose.shoulderR.y} x2={pose.elbowR.x} y2={pose.elbowR.y} strokeWidth="4.6" />
        <line x1={pose.elbowR.x} y1={pose.elbowR.y} x2={pose.handR.x} y2={pose.handR.y} strokeWidth="3.8" />
        <line x1={pose.hipL.x} y1={pose.hipL.y} x2={pose.kneeL.x} y2={pose.kneeL.y} strokeWidth="4.8" />
        <line x1={pose.kneeL.x} y1={pose.kneeL.y} x2={pose.footL.x} y2={pose.footL.y} strokeWidth="3.8" />
        <line x1={pose.hipR.x} y1={pose.hipR.y} x2={pose.kneeR.x} y2={pose.kneeR.y} strokeWidth="4.8" />
        <line x1={pose.kneeR.x} y1={pose.kneeR.y} x2={pose.footR.x} y2={pose.footR.y} strokeWidth="3.8" />
      </g>

      <g stroke={baseStroke} strokeLinecap="round" opacity="0.82">
        <line x1={pose.hipL.x} y1={pose.hipL.y} x2={pose.kneeL.x} y2={pose.kneeL.y} strokeWidth="3.8" />
        <line x1={pose.kneeL.x} y1={pose.kneeL.y} x2={pose.footL.x} y2={pose.footL.y} strokeWidth="3.2" />
        <line x1={pose.hipR.x} y1={pose.hipR.y} x2={pose.kneeR.x} y2={pose.kneeR.y} strokeWidth="3.8" />
        <line x1={pose.kneeR.x} y1={pose.kneeR.y} x2={pose.footR.x} y2={pose.footR.y} strokeWidth="3.2" />
      </g>

      <polygon
        points={`${pose.shoulderL.x},${pose.shoulderL.y} ${pose.shoulderR.x},${pose.shoulderR.y} ${pose.hipR.x},${pose.hipR.y} ${pose.hipL.x},${pose.hipL.y}`}
        fill="rgba(245, 246, 247, 0.12)"
        stroke={baseStroke}
        strokeWidth="1.9"
        strokeLinejoin="round"
      />

      <g strokeLinecap="round">
        <line x1={pose.shoulderL.x} y1={pose.shoulderL.y} x2={pose.elbowL.x} y2={pose.elbowL.y} stroke={pose.activeHand === "L" ? activeStroke : baseStroke} strokeWidth="3.6" />
        <line x1={pose.elbowL.x} y1={pose.elbowL.y} x2={pose.handL.x} y2={pose.handL.y} stroke={pose.activeHand === "L" ? activeStroke : baseStroke} strokeWidth="3.1" />
        <line x1={pose.shoulderR.x} y1={pose.shoulderR.y} x2={pose.elbowR.x} y2={pose.elbowR.y} stroke={pose.activeHand === "R" ? activeStroke : baseStroke} strokeWidth="3.6" />
        <line x1={pose.elbowR.x} y1={pose.elbowR.y} x2={pose.handR.x} y2={pose.handR.y} stroke={pose.activeHand === "R" ? activeStroke : baseStroke} strokeWidth="3.1" />
      </g>

      <circle cx={pose.head.x} cy={pose.head.y} r={pose.headRadius} fill="#111316" stroke={baseStroke} strokeWidth="2.1" />

      {[
        pose.shoulderL,
        pose.shoulderR,
        pose.elbowL,
        pose.elbowR,
        pose.hipL,
        pose.hipR,
        pose.kneeL,
        pose.kneeR,
      ].map((pt, i) => (
        <circle key={i} cx={pt.x} cy={pt.y} r="2" fill="#111316" stroke="#9CA3AF" strokeWidth="1" />
      ))}

      <circle cx={pose.handL.x} cy={pose.handL.y} r="3.2" fill={pose.activeHand === "L" ? activeStroke : "#F5F6F7"} />
      <circle cx={pose.handR.x} cy={pose.handR.y} r="3.2" fill={pose.activeHand === "R" ? activeStroke : "#F5F6F7"} />
      <circle cx={pose.footL.x} cy={pose.footL.y} r="2.6" fill="#F5A623" />
      <circle cx={pose.footR.x} cy={pose.footR.y} r="2.6" fill="#F5A623" />

      {pose.isDyno && (
        <g transform={`translate(${pose.head.x}, ${pose.head.y - pose.headRadius - 9})`}>
          <rect x="-18" y="-6.5" width="36" height="11.5" rx="5.75" fill="#FF4D5E" />
          <text y="1.5" textAnchor="middle" fill="#FFFFFF" fontSize="6.2" fontWeight="700" letterSpacing="0.5">
            DYNO
          </text>
        </g>
      )}
    </g>
  );
}

export default function ClimbingBoard({
  wall,
  routeName,
  routeSignature,
  litHoldIds,
  startIds,
  finishId,
  evalResult,
  hoveredStep,
  lockedStep,
  maxReachCm,
  heightCm,
  wingspanCm,
  dynamicAffinity,
  soundMuted,
  onToggleHold,
  onSelectStep,
  onClearLock,
}: ClimbingBoardProps) {
  const [hoveredHoldId, setHoveredHoldId] = useState<string | null>(null);
  const [showReachAura, setShowReachAura] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [animState, setAnimState] = useState<{ stepIdx: number; progress: number } | null>(null);
  const [pulseHoldId, setPulseHoldId] = useState<string | null>(null);

  const rafRef = useRef<number | null>(null);
  const lastSoundStepRef = useRef<number>(-1);

  const holdMap = useMemo(
    () => Object.fromEntries(wall.holds.map((h) => [h.hold_id, h])),
    [wall.holds]
  );

  const betaSet = useMemo(
    () => new Set(evalResult ? evalResult.optimal_beta : []),
    [evalResult]
  );

  const litHolds = useMemo(
    () => wall.holds.filter((h) => litHoldIds.includes(h.hold_id)),
    [wall.holds, litHoldIds]
  );

  // Detiene la reproducción si cambia de bloque
  useEffect(() => {
    setIsPlaying(false);
    setAnimState(null);
  }, [routeSignature]);

  useEffect(() => {
    if (!isPlaying || !evalResult || evalResult.moves.length === 0) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      return;
    }

    const totalMoves = evalResult.moves.length;
    const msPerMove = 1080;
    const startTime = performance.now();
    lastSoundStepRef.current = -1;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const rawStep = elapsed / msPerMove;

      if (rawStep >= totalMoves) {
        setIsPlaying(false);
        setAnimState(null);
        onSelectStep(null);
        return;
      }

      const stepIdx = Math.floor(rawStep);
      const progress = rawStep - stepIdx;

      if (stepIdx !== lastSoundStepRef.current) {
        lastSoundStepRef.current = stepIdx;
        const move = evalResult.moves[stepIdx];
        const isCrux =
          move.from_hold === evalResult.crux_move.from_hold &&
          move.to_hold === evalResult.crux_move.to_hold;
        onSelectStep(stepIdx);
        playStepPulse(isCrux, soundMuted);
      }

      setAnimState({ stepIdx, progress });
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, evalResult, onSelectStep, soundMuted]);

  const activeFocusStep = animState
    ? animState.stepIdx
    : hoveredStep !== null
      ? hoveredStep
      : lockedStep;

  const effectivePoseInput = useMemo(() => {
    if (!evalResult || evalResult.optimal_beta.length < 2) return null;
    if (animState) return animState;
    if (activeFocusStep !== null) return { stepIdx: activeFocusStep, progress: 0.96 };
    return null;
  }, [animState, activeFocusStep, evalResult]);

  const stickmanPose = useMemo(() => {
    if (!effectivePoseInput || !evalResult) return null;
    return computeClimberPose({
      betaIds: evalResult.optimal_beta,
      holdMap,
      allHolds: litHolds.length >= 2 ? litHolds : wall.holds,
      wallWidthCm: wall.width_cm,
      wallHeightCm: wall.height_cm,
      overhangDeg: wall.overhang_deg,
      heightCm,
      wingspanCm,
      dynamicAffinity,
      stepIdx: effectivePoseInput.stepIdx,
      progress: effectivePoseInput.progress,
    });
  }, [
    effectivePoseInput,
    evalResult,
    holdMap,
    litHolds,
    wall,
    heightCm,
    wingspanCm,
    dynamicAffinity,
  ]);

  const activeMove =
    activeFocusStep !== null && evalResult ? evalResult.moves[activeFocusStep] : null;
  const activeIsCrux = Boolean(
    activeMove &&
      evalResult &&
      activeMove.from_hold === evalResult.crux_move.from_hold &&
      activeMove.to_hold === evalResult.crux_move.to_hold
  );

  const focusedHoldPair = useMemo(() => {
    if (!activeMove) return new Set<string>();
    return new Set([activeMove.from_hold, activeMove.to_hold]);
  }, [activeMove]);

  const hoveredHold = hoveredHoldId ? holdMap[hoveredHoldId] : null;

  const handleHoldClick = (holdId: string) => {
    const willTurnOn = !litHoldIds.includes(holdId);
    playHoldToggle(willTurnOn, soundMuted);
    setPulseHoldId(holdId);
    window.setTimeout(() => setPulseHoldId(null), 340);
    setIsPlaying(false);
    setAnimState(null);
    onClearLock();
    onToggleHold(holdId);
  };

  return (
    <div className="board-stage">
      {/* Cabecera de control del tablero */}
      <div className="board-header">
        <div className="board-heading">
          <div className="board-title-row">
            <h2>{routeName}</h2>
            <span className="board-spec-tag">{wall.overhang_deg}°</span>
          </div>
          <span className="board-meta-line">
            Kilter 8×12 Original · {litHoldIds.length} presas activas · Alcance {Math.round(maxReachCm)} cm
          </span>
        </div>

        <div className="board-toolbar">
          <button
            type="button"
            className={`tool-pill ${showReachAura ? "active" : ""}`}
            onClick={() => {
              playSoftTick(soundMuted);
              setShowReachAura((v) => !v);
            }}
            title="Muestra tu radio real de alcance al señalar una presa"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
              <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
            </svg>
            Alcance
          </button>

          <button
            type="button"
            className={`tool-pill primary ${isPlaying ? "stop" : ""}`}
            disabled={!evalResult || evalResult.moves.length === 0}
            onClick={() => {
              if (isPlaying) {
                setIsPlaying(false);
                setAnimState(null);
                onSelectStep(null);
              } else {
                onClearLock();
                setIsPlaying(true);
              }
            }}
          >
            {isPlaying ? (
              <>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                  <rect x="2" y="2" width="8" height="8" rx="1.5" />
                </svg>
                Detener
              </>
            ) : (
              <>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M3 1.8L10.2 6L3 10.2V1.8Z" />
                </svg>
                Simular Beta
              </>
            )}
          </button>
        </div>
      </div>

      {/* Lienzo principal del Kilter Board */}
      <div className="board-canvas-shell">
        <svg
          className="kilter-svg"
          viewBox={`-14 -14 ${wall.width_cm + 22} ${wall.height_cm + 22}`}
          role="img"
          aria-label={`Tablero interactivo ${wall.name}`}
        >
          <defs>
            <linearGradient id="lab-board-surface" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16181D" />
              <stop offset="65%" stopColor="#121418" />
              <stop offset="100%" stopColor="#0E1014" />
            </linearGradient>

            <linearGradient id="lab-kickboard" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0E1013" />
              <stop offset="100%" stopColor="#0A0B0E" />
            </linearGradient>

            <radialGradient id="lab-resin-off" cx="35%" cy="25%" r="75%">
              <stop offset="0%" stopColor="#2C3038" />
              <stop offset="70%" stopColor="#202329" />
              <stop offset="100%" stopColor="#17191E" />
            </radialGradient>

            <radialGradient id="lab-resin-lit" cx="30%" cy="20%" r="78%">
              <stop offset="0%" stopColor="#69707D" />
              <stop offset="62%" stopColor="#464C57" />
              <stop offset="100%" stopColor="#2B2F37" />
            </radialGradient>

            <filter id="lab-led-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2.8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="lab-hold-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="1.6" floodColor="#000000" floodOpacity="0.62" />
            </filter>
          </defs>

          {/* Superficie del muro */}
          <rect
            x="0"
            y="0"
            width={wall.width_cm}
            height={wall.height_cm}
            rx="5"
            fill="url(#lab-board-surface)"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="0.9"
          />

          {/* Juntas estructurales de los paneles 4×8 */}
          <line x1={wall.width_cm / 2} y1="0" x2={wall.width_cm / 2} y2={wall.height_cm - 56} stroke="rgba(255,255,255,0.035)" strokeWidth="0.8" />
          <line x1="0" y1="122" x2={wall.width_cm} y2="122" stroke="rgba(255,255,255,0.035)" strokeWidth="0.8" />
          <line x1="0" y1="244" x2={wall.width_cm} y2="244" stroke="rgba(255,255,255,0.035)" strokeWidth="0.8" />

          {/* Kickboard inferior */}
          <rect
            x="0.5"
            y={wall.height_cm - 56}
            width={wall.width_cm - 1}
            height="55.5"
            fill="url(#lab-kickboard)"
          />
          <line
            x1="0"
            y1={wall.height_cm - 56}
            x2={wall.width_cm}
            y2={wall.height_cm - 56}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
          />

          {/* Ejes de coordenadas minimalistas */}
          {COL_LABELS.map((lbl, idx) => (
            <text
              key={lbl}
              x={COL_XS[idx]}
              y="-5"
              textAnchor="middle"
              fill="#555B66"
              fontSize="6"
              fontWeight="600"
              letterSpacing="0.4"
            >
              {lbl}
            </text>
          ))}
          {ROW_YS.map((yVal, idx) => (
            <text
              key={idx}
              x="-7"
              y={wall.height_cm - yVal + 2}
              textAnchor="middle"
              fill="#555B66"
              fontSize="6"
              fontWeight="600"
            >
              {idx + 1}
            </text>
          ))}
          <text
            x="-7"
            y={wall.height_cm - 28}
            textAnchor="middle"
            fill="#686F7C"
            fontSize="5.4"
            fontWeight="700"
          >
            KB
          </text>

          {/* Aura de alcance biomecánico */}
          {showReachAura && hoveredHold && !isPlaying && (
            <g className="reach-ring-group">
              <circle
                cx={hoveredHold.x_cm}
                cy={wall.height_cm - hoveredHold.y_cm}
                r={maxReachCm}
                fill="rgba(47, 129, 247, 0.05)"
                stroke="rgba(47, 129, 247, 0.42)"
                strokeWidth="0.9"
                strokeDasharray="3.5 3.5"
              />
            </g>
          )}

          {/* Conexiones progresivas animadas entre presas */}
          {evalResult && (
            <g key={routeSignature}>
              {evalResult.moves.map((m, idx) => {
                const a = holdMap[m.from_hold];
                const b = holdMap[m.to_hold];
                if (!a || !b) return null;

                const isCrux =
                  m.from_hold === evalResult.crux_move.from_hold &&
                  m.to_hold === evalResult.crux_move.to_hold;
                const isFocused = activeFocusStep === idx;
                const dimmed = activeFocusStep !== null && !isFocused;

                const x1 = a.x_cm;
                const y1 = wall.height_cm - a.y_cm;
                const x2 = b.x_cm;
                const y2 = wall.height_cm - b.y_cm;

                const mx = (x1 + x2) / 2;
                const my = (y1 + y2) / 2;
                const dx = x2 - x1;
                const dy = y2 - y1;
                const len = Math.hypot(dx, dy) || 1;
                const offset = Math.min(10, len * 0.095) * (idx % 2 === 0 ? 1 : -1);
                const cx = mx - (dy / len) * offset;
                const cy = my + (dx / len) * offset;

                const pathD = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
                const color = isCrux ? "#FF4D5E" : "#38BDF8";

                return (
                  <g
                    key={`${m.from_hold}-${m.to_hold}`}
                    className="route-edge-group"
                    opacity={dimmed ? 0.14 : isPlaying && !isFocused ? 0.28 : 0.92}
                  >
                    {isFocused && (
                      <path
                        d={pathD}
                        fill="none"
                        stroke={color}
                        strokeWidth="5"
                        strokeOpacity="0.16"
                        strokeLinecap="round"
                      />
                    )}
                    <path
                      className="edge-draw"
                      style={{ animationDelay: `${idx * 48}ms` }}
                      pathLength={100}
                      d={pathD}
                      fill="none"
                      stroke={color}
                      strokeWidth={isFocused ? 2.1 : isCrux ? 1.65 : 1.15}
                      strokeDasharray={isCrux ? undefined : "100"}
                      strokeLinecap="round"
                    />
                    {isCrux && (
                      <path
                        d={pathD}
                        fill="none"
                        stroke="#090A0C"
                        strokeWidth="1.2"
                        strokeDasharray="2 4"
                        opacity="0.45"
                      />
                    )}
                    {isFocused && !isPlaying && (
                      <g transform={`translate(${cx}, ${cy})`}>
                        <rect
                          x="-18"
                          y="-6.5"
                          width="36"
                          height="13"
                          rx="6.5"
                          fill="#111316"
                          stroke={color}
                          strokeWidth="0.85"
                        />
                        <text
                          x="0"
                          y="2"
                          textAnchor="middle"
                          fill="#F5F6F7"
                          fontSize="5.8"
                          fontWeight="600"
                        >
                          {Math.round(m.distance_cm)} cm
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          )}

          {/* Presas esculpidas del Kilter Board */}
          {wall.holds.map((h) => {
            const cx = h.x_cm;
            const cy = wall.height_cm - h.y_cm;
            const isLit = litHoldIds.includes(h.hold_id);
            const inBeta = betaSet.has(h.hold_id);
            const isStart = startIds.includes(h.hold_id);
            const isFinish = finishId === h.hold_id;
            const isFootOnly = h.role_allowed === "foot";
            const isCruxTarget = evalResult?.crux_move.to_hold === h.hold_id;
            const isPulsing = pulseHoldId === h.hold_id;
            const isStepHighlighted = focusedHoldPair.has(h.hold_id);

            let ledColor = "transparent";
            if (isLit) {
              if (isStart) ledColor = "#30D158";
              else if (isFinish) ledColor = "#B47CFF";
              else if (isFootOnly) ledColor = "#F5A623";
              else if (isCruxTarget) ledColor = "#FF4D5E";
              else ledColor = "#38BDF8";
            }

            const scale = isFootOnly ? 0.78 : 0.76 + h.grip_quality * 0.24;
            const angle = hashAngle(h.hold_id, h.hold_type);
            const stepOrder = evalResult ? evalResult.optimal_beta.indexOf(h.hold_id) : -1;

            return (
              <g
                key={h.hold_id}
                className={`kilter-hold ${isLit ? "lit" : "off"} ${isStepHighlighted ? "focused" : ""}`}
                transform={`translate(${cx}, ${cy})`}
                onClick={() => handleHoldClick(h.hold_id)}
                onMouseEnter={() => {
                  setHoveredHoldId(h.hold_id);
                  playSoftTick(soundMuted);
                }}
                onMouseLeave={() => setHoveredHoldId(null)}
              >
                {/* Superficie táctil generosa para interacción precisa en desktop y móvil */}
                <circle r="13.5" fill="transparent" />

                {/* Onda breve de confirmación al encender/apagar */}
                {isPulsing && (
                  <circle
                    className="hold-ping"
                    cx="0"
                    cy="0"
                    r="10"
                    fill="none"
                    stroke={ledColor === "transparent" ? "#F5F6F7" : ledColor}
                    strokeWidth="1.35"
                  />
                )}

                {/* Resaltado de vínculo cuando el movimiento está seleccionado en la secuencia */}
                {isStepHighlighted && (
                  <circle
                    cx="0"
                    cy="0"
                    r={14.5 * scale}
                    fill="none"
                    stroke={activeIsCrux ? "#FF4D5E" : "#F5F6F7"}
                    strokeWidth="1.15"
                    strokeOpacity="0.8"
                  />
                )}

                {/* Anillo LED funcional del Kilter Board */}
                {isLit && (
                  <>
                    <circle
                      cx="0"
                      cy="0"
                      r={isFootOnly ? 8 : 11.4 * scale}
                      fill="none"
                      stroke={ledColor}
                      strokeWidth={inBeta || isStart || isFinish ? 2 : 1.2}
                      strokeOpacity={inBeta || isStart || isFinish || isFootOnly ? 0.92 : 0.42}
                      filter="url(#lab-led-glow)"
                    />
                    <circle
                      cx="0"
                      cy="0"
                      r={isFootOnly ? 7.2 : 10.6 * scale}
                      fill={ledColor}
                      opacity={inBeta || isStart || isFinish ? 0.13 : 0.05}
                    />
                  </>
                )}

                <g
                  className="hold-body-scale"
                  filter="url(#lab-hold-shadow)"
                >
                  <g transform={`rotate(${angle}) scale(${scale})`}>
                    <HoldShape type={h.hold_type} isLit={isLit} ledColor={ledColor} />
                  </g>
                </g>

                {/* Número de secuencia limpio e integrado */}
                {stepOrder >= 0 && !isPlaying && (
                  <g transform={`translate(${9 * scale}, ${-8.5 * scale})`}>
                    <circle
                      r="4.7"
                      fill={isStepHighlighted ? ledColor : "#111316"}
                      stroke={ledColor}
                      strokeWidth="0.95"
                    />
                    <text
                      y="1.8"
                      textAnchor="middle"
                      fill={isStepHighlighted ? "#090A0C" : "#F5F6F7"}
                      fontSize="5.6"
                      fontWeight="700"
                    >
                      {stepOrder + 1}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Stickman biomecánico con cinemática rígida */}
          {stickmanPose && <StickmanLayer pose={stickmanPose} isCruxMove={activeIsCrux} />}
        </svg>

        {/* Barra contextual inferior (tooltip minimalista sin salto de layout) */}
        <div className="board-inspector">
          {isPlaying && activeMove ? (
            <>
              <div className="inspector-left">
                <span className={`inspector-badge ${activeIsCrux ? "crux" : "live"}`}>
                  {activeIsCrux ? "Crux" : `Paso ${(activeFocusStep ?? 0) + 1}`}
                </span>
                <span className="inspector-primary">
                  {activeMove.from_hold} → {activeMove.to_hold}
                </span>
                <span className="inspector-sep">·</span>
                <span className="inspector-muted">{Math.round(activeMove.distance_cm)} cm</span>
              </div>
              <span className="inspector-muted">
                Modelo {heightCm} cm / Ape {wingspanCm - heightCm >= 0 ? "+" : ""}{wingspanCm - heightCm}
              </span>
            </>
          ) : hoveredHold ? (
            <>
              <div className="inspector-left">
                <span className="inspector-badge">{hoveredHold.hold_id.toUpperCase()}</span>
                <span className="inspector-primary">
                  {HOLD_LABELS[hoveredHold.hold_type] ?? hoveredHold.hold_type}
                </span>
                <span className="inspector-sep">·</span>
                <span className="inspector-muted">
                  {ROLE_LABELS[hoveredHold.role_allowed] ?? hoveredHold.role_allowed}
                </span>
              </div>
              <div className="inspector-grip">
                <span>Agarre</span>
                <div className="grip-meter">
                  <div
                    className="grip-meter-fill"
                    style={{ width: `${Math.round(hoveredHold.grip_quality * 100)}%` }}
                  />
                </div>
                <strong>{Math.round(hoveredHold.grip_quality * 100)}%</strong>
              </div>
            </>
          ) : activeMove && lockedStep !== null ? (
            <>
              <div className="inspector-left">
                <span className={`inspector-badge ${activeIsCrux ? "crux" : ""}`}>
                  Paso {lockedStep + 1} fijado
                </span>
                <span className="inspector-primary">
                  {activeMove.from_hold} → {activeMove.to_hold} ({Math.round(activeMove.distance_cm)} cm)
                </span>
              </div>
              <button type="button" className="inspector-clear" onClick={onClearLock}>
                Soltar vista
              </button>
            </>
          ) : (
            <span className="inspector-idle">
              Pulsa cualquier presa para editar el bloque · Selecciona un paso para inspeccionar la biomecánica
            </span>
          )}
        </div>
      </div>

      {/* Leyenda funcional compacta */}
      <div className="board-legend">
        <span><i className="legend-dot" style={{ background: "#30D158" }} />Inicio</span>
        <span><i className="legend-dot" style={{ background: "#38BDF8" }} />Manos / Pies</span>
        <span><i className="legend-dot" style={{ background: "#F5A623" }} />Solo Pies</span>
        <span><i className="legend-dot" style={{ background: "#B47CFF" }} />Top</span>
        <span><i className="legend-dot" style={{ background: "#FF4D5E" }} />Crux</span>
      </div>
    </div>
  );
}