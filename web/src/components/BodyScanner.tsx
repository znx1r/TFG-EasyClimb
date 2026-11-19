import { useCallback, useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

export interface BodyMeasurement {
  heightCm: number;
  wingspanCm: number;
  weightKg: number;
}

interface BodyScannerProps {
  referenceHeightCm: number;
  onMeasured: (data: BodyMeasurement) => void;
}

const SKELETON_EDGES: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];

const TARGET_SAMPLES = 35;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export default function BodyScanner({
  referenceHeightCm,
  onMeasured,
}: BodyScannerProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "scanning" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fullBodyOk, setFullBodyOk] = useState(false);
  const [tPoseOk, setTPoseOk] = useState(false);
  const [progress, setProgress] = useState(0);
  const [livePreview, setLivePreview] = useState<BodyMeasurement | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const samplesRef = useRef<{ wingspanCm: number; weightKg: number }[]>([]);
  const refHeightRef = useRef(referenceHeightCm);

  useEffect(() => {
    refHeightRef.current = referenceHeightCm;
  }, [referenceHeightCm]);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      landmarkerRef.current?.close();
    };
  }, [stopCamera]);

  const drawOverlay = (
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    w: number,
    h: number,
    ready: boolean
  ) => {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);

    const color = ready ? "#22c55e" : "#38bdf8";
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;

    for (const [a, b] of SKELETON_EDGES) {
      const p1 = landmarks[a];
      const p2 = landmarks[b];
      if ((p1.visibility ?? 0) < 0.4 || (p2.visibility ?? 0) < 0.4) continue;
      ctx.beginPath();
      ctx.moveTo(p1.x * w, p1.y * h);
      ctx.lineTo(p2.x * w, p2.y * h);
      ctx.stroke();
    }

    ctx.fillStyle = "#f8fafc";
    for (const idx of [0, 11, 12, 13, 14, 15, 16, 23, 24, 27, 28]) {
      const p = landmarks[idx];
      if ((p.visibility ?? 0) < 0.4) continue;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  const evaluateLandmarks = (
    lm: NormalizedLandmark[],
    w: number,
    h: number
  ) => {
    const px = (idx: number) => ({ x: lm[idx].x * w, y: lm[idx].y * h });
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);

    const requiredIndices = [0, 11, 12, 15, 16, 23, 24, 27, 28];
    const allVisible = requiredIndices.every((i) => {
      const p = lm[i];
      return (
        (p.visibility ?? 0) > 0.5 &&
        p.x > 0.02 &&
        p.x < 0.98 &&
        p.y > 0.02 &&
        p.y < 0.98
      );
    });

    if (!allVisible) {
      return { allVisible: false, isTPose: false, sample: null };
    }

    const eyeMid = {
      x: (px(2).x + px(5).x) / 2,
      y: (px(2).y + px(5).y) / 2,
    };
    const shoulderMid = {
      x: (px(11).x + px(12).x) / 2,
      y: (px(11).y + px(12).y) / 2,
    };
    const crownY = eyeMid.y - 0.52 * Math.max(10, shoulderMid.y - eyeMid.y);

    const heelsVisible =
      (lm[29].visibility ?? 0) > 0.4 && (lm[30].visibility ?? 0) > 0.4;
    const ankleMidY = (px(27).y + px(28).y) / 2;
    const footY = heelsVisible
      ? (px(29).y + px(30).y) / 2
      : ankleMidY + 0.045 * Math.abs(ankleMidY - shoulderMid.y);

    const heightPx = Math.max(1, footY - crownY);

    // Comprobación de postura en T (brazos abiertos y horizontales)
    const wristL = px(15);
    const wristR = px(16);
    const shL = px(11);
    const shR = px(12);

    const armsLevel =
      Math.abs(wristL.y - shL.y) < heightPx * 0.14 &&
      Math.abs(wristR.y - shR.y) < heightPx * 0.14;
    const armsSpread = Math.abs(wristL.x - wristR.x) > heightPx * 0.58;
    const isTPose = armsLevel && armsSpread;

    const refHeight = refHeightRef.current;
    const cmPerPx = refHeight / heightPx;

    // Envergadura: distancia muñeca-muñeca + longitud proporcional de ambas manos
    const armL = dist(shL, px(13)) + dist(px(13), wristL);
    const armR = dist(shR, px(14)) + dist(px(14), wristR);
    const wingspanPx = dist(wristL, wristR) + 0.32 * (armL + armR);
    const wingspanCm = Math.round(clamp(wingspanPx * cmPerPx, 125, 235));

    // Estimación orientativa de peso basada en altura y complexión hombro/cadera
    const shoulderRatio = dist(shL, shR) / heightPx;
    const hipRatio = dist(px(23), px(24)) / heightPx;
    const frameScore = clamp(
      (shoulderRatio / 0.225) * 0.65 + (hipRatio / 0.14) * 0.35,
      0.85,
      1.25
    );
    const estBmi = clamp(22.0 * frameScore, 18.5, 28.0);
    const heightM = refHeight / 100;
    const weightKg = Math.round(estBmi * heightM * heightM);

    return {
      allVisible: true,
      isTPose,
      sample: { heightCm: refHeight, wingspanCm, weightKg },
    };
  };

  const startScan = async () => {
    setErrorMsg(null);
    setProgress(0);
    setFullBodyOk(false);
    setTPoseOk(false);
    samplesRef.current = [];
    setStatus("loading");

    try {
      if (!landmarkerRef.current) {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        const modelUrl =
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
        try {
          landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: modelUrl, delegate: "GPU" },
            runningMode: "VIDEO",
            numPoses: 1,
          });
        } catch {
          landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: modelUrl, delegate: "CPU" },
            runningMode: "VIDEO",
            numPoses: 1,
          });
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      setStatus("scanning");

      let lastVideoTime = -1;
      const detectFrame = () => {
        if (!videoRef.current || !canvasRef.current || !landmarkerRef.current) return;
        const v = videoRef.current;
        const c = canvasRef.current;

        if (v.readyState >= 2 && v.currentTime !== lastVideoTime) {
          lastVideoTime = v.currentTime;
          if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
            c.width = v.videoWidth;
            c.height = v.videoHeight;
          }

          const result = landmarkerRef.current.detectForVideo(v, performance.now());
          const ctx = c.getContext("2d");

          if (result.landmarks.length > 0 && ctx) {
            const lm = result.landmarks[0];
            const evalRes = evaluateLandmarks(lm, c.width, c.height);
            setFullBodyOk(evalRes.allVisible);
            setTPoseOk(evalRes.isTPose);
            drawOverlay(ctx, lm, c.width, c.height, evalRes.allVisible && evalRes.isTPose);

            if (evalRes.allVisible && evalRes.isTPose && evalRes.sample) {
              setLivePreview(evalRes.sample);
              samplesRef.current.push({
                wingspanCm: evalRes.sample.wingspanCm,
                weightKg: evalRes.sample.weightKg,
              });

              const pct = Math.min(
                100,
                Math.round((samplesRef.current.length / TARGET_SAMPLES) * 100)
              );
              setProgress(pct);

              if (samplesRef.current.length >= TARGET_SAMPLES) {
                const finalWingspan = Math.round(
                  median(samplesRef.current.map((s) => s.wingspanCm))
                );
                const finalWeight = Math.round(
                  median(samplesRef.current.map((s) => s.weightKg))
                );
                const finalData: BodyMeasurement = {
                  heightCm: refHeightRef.current,
                  wingspanCm: finalWingspan,
                  weightKg: finalWeight,
                };
                setLivePreview(finalData);
                stopCamera();
                setStatus("done");
                onMeasured(finalData);
                return;
              }
            }
          } else if (ctx) {
            ctx.clearRect(0, 0, c.width, c.height);
            setFullBodyOk(false);
            setTPoseOk(false);
          }
        }

        rafRef.current = requestAnimationFrame(detectFrame);
      };

      rafRef.current = requestAnimationFrame(detectFrame);
    } catch {
      stopCamera();
      setStatus("error");
      setErrorMsg(
        "No se pudo abrir la cámara. Comprueba los permisos del navegador o introduce tus medidas manualmente a la derecha."
      );
    }
  };

  return (
    <div className="scanner-card">
      <div className="scanner-header">
        <div>
          <h3>Escáner Corporal con Cámara</h3>
          <p className="panel-hint">
            Introduce tu altura real, aléjate hasta verte de pies a cabeza y abre los brazos en cruz (postura en T).
          </p>
        </div>
        {status === "scanning" ? (
          <button
            className="btn btn-danger"
            onClick={() => {
              stopCamera();
              setStatus("idle");
            }}
          >
            Detener cámara
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={startScan}
            disabled={status === "loading"}
          >
            {status === "loading"
              ? "Cargando IA de pose..."
              : status === "done"
                ? "Volver a escanear"
                : "Abrir cámara y medir"}
          </button>
        )}
      </div>

      <div className="scanner-viewport">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`scanner-video ${status === "scanning" ? "visible" : ""}`}
        />
        <canvas
          ref={canvasRef}
          className={`scanner-canvas ${status === "scanning" ? "visible" : ""}`}
        />

        {status !== "scanning" && (
          <div className="scanner-placeholder">
            {status === "loading" && <p>Descargando modelo MediaPipe Pose...</p>}
            {status === "idle" && (
              <>
                <div className="tpose-icon">🧍</div>
                <p>Colócate a 2–3 metros de la cámara en postura en T</p>
                <span>Calculamos automáticamente tu envergadura (Ape Index) y peso orientativo</span>
              </>
            )}
            {status === "done" && livePreview && (
              <div className="scan-success">
                <strong>¡Medición completada!</strong>
                <p>
                  Envergadura: <b>{livePreview.wingspanCm} cm</b> (Ape{" "}
                  {livePreview.wingspanCm - livePreview.heightCm >= 0 ? "+" : ""}
                  {livePreview.wingspanCm - livePreview.heightCm} cm) · Peso estimado:{" "}
                  <b>~{livePreview.weightKg} kg</b>
                </p>
                <span>Puedes ajustar cualquier valor manualmente en el panel derecho.</span>
              </div>
            )}
            {status === "error" && <p className="text-error">{errorMsg}</p>}
          </div>
        )}

        {status === "scanning" && (
          <div className="scanner-hud">
            <div className="hud-pills">
              <span className={`hud-pill ${fullBodyOk ? "ok" : ""}`}>
                {fullBodyOk ? "✓ Cuerpo completo" : "Aléjate para verte entero"}
              </span>
              <span className={`hud-pill ${tPoseOk ? "ok" : ""}`}>
                {tPoseOk ? "✓ Postura en T" : "Abre los brazos en cruz"}
              </span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}