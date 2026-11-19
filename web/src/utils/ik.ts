export interface Point2D {
  x: number;
  y: number;
}

export interface StickmanPose {
  head: Point2D;
  headRadius: number;
  neck: Point2D;
  shoulderL: Point2D;
  shoulderR: Point2D;
  elbowL: Point2D;
  elbowR: Point2D;
  handL: Point2D;
  handR: Point2D;
  hipCenter: Point2D;
  hipL: Point2D;
  hipR: Point2D;
  kneeL: Point2D;
  kneeR: Point2D;
  footL: Point2D;
  footR: Point2D;
  activeHand: "L" | "R" | null;
  reachTension: number;
  isDyno: boolean;
}

interface SimpleHold {
  hold_id: string;
  x_cm: number;
  y_cm: number;
  role_allowed?: string;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * IK rígido de 2 huesos: garantiza matemáticamente que
 * dist(root, joint) === len1 y dist(joint, end) === len2 en todo momento.
 * Nunca estira una extremidad más allá de su longitud anatómica.
 */
function solveRigidTwoBoneIK(
  root: Point2D,
  target: Point2D,
  len1: number,
  len2: number,
  bendSign: 1 | -1
): { joint: Point2D; end: Point2D; tension: number } {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const rawDist = Math.hypot(dx, dy) || 0.0001;
  const ux = dx / rawDist;
  const uy = dy / rawDist;

  const maxLen = len1 + len2 - 0.15;
  const minLen = Math.abs(len1 - len2) + 1.5;
  const clampedDist = clamp(rawDist, minLen, maxLen);

  const end: Point2D = {
    x: root.x + ux * clampedDist,
    y: root.y + uy * clampedDist,
  };

  const cosAngle = clamp(
    (len1 * len1 + clampedDist * clampedDist - len2 * len2) /
      (2 * len1 * clampedDist),
    -1,
    1
  );
  const baseAngle = Math.atan2(uy, ux);
  const jointAngle = baseAngle + bendSign * Math.acos(cosAngle);

  const joint: Point2D = {
    x: root.x + Math.cos(jointAngle) * len1,
    y: root.y + Math.sin(jointAngle) * len1,
  };

  return {
    joint,
    end,
    tension: clamp(rawDist / (len1 + len2), 0, 1),
  };
}

function toSvg(hold: SimpleHold, wallHeightCm: number): Point2D {
  return { x: hold.x_cm, y: wallHeightCm - hold.y_cm };
}

function findFootTarget(
  hip: Point2D,
  side: "L" | "R",
  legLen: number,
  allHolds: SimpleHold[],
  wallHeightCm: number,
  wallWidthCm: number
): Point2D {
  const idealX = hip.x + (side === "L" ? -15 : 15);
  const idealY = Math.min(wallHeightCm - 10, hip.y + legLen * 0.78);

  let best: Point2D | null = null;
  let bestScore = Infinity;

  for (const h of allHolds) {
    const p = toSvg(h, wallHeightCm);
    const dy = p.y - hip.y;
    if (dy < legLen * 0.22 || dy > legLen * 0.95) continue;
    const d = dist(hip, p);
    if (d > legLen * 0.95) continue;

    const footBonus = h.role_allowed === "foot" ? -14 : 0;
    const crossPenalty =
      side === "L"
        ? p.x > hip.x + 14
          ? 28
          : 0
        : p.x < hip.x - 14
          ? 28
          : 0;

    const score = dist(p, { x: idealX, y: idealY }) + crossPenalty + footBonus;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }

  return (
    best ?? {
      x: clamp(idealX, 16, wallWidthCm - 16),
      y: idealY,
    }
  );
}

/**
 * Calcula una pose biomecánica realista y estrictamente rígida para el paso actual.
 */
export function computeClimberPose(params: {
  betaIds: string[];
  holdMap: Record<string, SimpleHold>;
  allHolds: SimpleHold[];
  wallWidthCm: number;
  wallHeightCm: number;
  overhangDeg: number;
  heightCm: number;
  wingspanCm: number;
  dynamicAffinity: number;
  stepIdx: number;
  progress: number;
}): StickmanPose | null {
  const {
    betaIds,
    holdMap,
    allHolds,
    wallWidthCm,
    wallHeightCm,
    overhangDeg,
    heightCm,
    wingspanCm,
    stepIdx,
    progress,
  } = params;

  if (betaIds.length < 2) return null;

  // Antropometría real en cm (misma escala que el Kilter Board)
  const shoulderW = 0.215 * heightCm;
  const torsoLen = 0.295 * heightCm;
  const hipW = 0.135 * heightCm;
  const headRadius = 0.058 * heightCm;
  const armTotal = Math.max(46, (wingspanCm - shoulderW) / 2);
  const upperArm = armTotal * 0.48;
  const forearm = armTotal * 0.52;
  const legTotal = 0.465 * heightCm;
  const thigh = legTotal * 0.52;
  const shin = legTotal * 0.48;

  const firstHold = holdMap[betaIds[0]];
  if (!firstHold) return null;
  const startPt = toSvg(firstHold, wallHeightCm);

  let leftHoldPt: Point2D = { x: startPt.x - 5, y: startPt.y };
  let rightHoldPt: Point2D = { x: startPt.x + 5, y: startPt.y };

  let movingHand: "L" | "R" = "R";
  let prevMovingPt: Point2D = rightHoldPt;
  let targetPt: Point2D = rightHoldPt;

  const clampedStep = clamp(stepIdx, 0, betaIds.length - 2);

  for (let i = 0; i <= clampedStep; i++) {
    const nextHold = holdMap[betaIds[i + 1]];
    if (!nextHold) return null;
    const nextPt = toSvg(nextHold, wallHeightCm);

    const midX = (leftHoldPt.x + rightHoldPt.x) / 2;
    let chosen: "L" | "R";
    if (nextPt.x < midX - 18) chosen = "L";
    else if (nextPt.x > midX + 18) chosen = "R";
    else chosen = i % 2 === 0 ? "R" : "L";

    if (i === clampedStep) {
      movingHand = chosen;
      prevMovingPt = chosen === "L" ? leftHoldPt : rightHoldPt;
      targetPt = nextPt;
    } else if (chosen === "L") {
      leftHoldPt = nextPt;
    } else {
      rightHoldPt = nextPt;
    }
  }

  const anchorHand = movingHand === "L" ? rightHoldPt : leftHoldPt;
  const spanRequired = dist(anchorHand, targetPt);
  const maxStaticSpan = armTotal * 1.92 + shoulderW * 0.85;
  const isDyno = spanRequired > maxStaticSpan;

  const p = clamp(progress, 0, 1);
  const eased = easeInOutCubic(p);

  // Trayectoria natural de la mano activa
  const arcX = Math.sin(eased * Math.PI) * (movingHand === "L" ? -8 : 8);
  const arcY = -Math.sin(eased * Math.PI) * (isDyno ? 10 : 4);
  const desiredMovingHand: Point2D = {
    x: lerp(prevMovingPt.x, targetPt.x, eased) + arcX,
    y: lerp(prevMovingPt.y, targetPt.y, eased) + arcY,
  };

  // Posición inicial y final deseadas del centro de hombros
  const sag = 0.44 + (overhangDeg / 90) * 0.16;
  const startCenter: Point2D = {
    x: (anchorHand.x + prevMovingPt.x) / 2,
    y: Math.max(anchorHand.y, prevMovingPt.y) + armTotal * sag,
  };
  const endCenter: Point2D = {
    x: lerp(anchorHand.x, targetPt.x, isDyno ? 0.82 : 0.56),
    y:
      (isDyno ? targetPt.y : Math.min(anchorHand.y, targetPt.y) * 0.65 + Math.max(anchorHand.y, targetPt.y) * 0.35) +
      armTotal * (isDyno ? 0.52 : sag * 0.88),
  };

  const shoulderMid: Point2D = {
    x: lerp(startCenter.x, endCenter.x, eased),
    y: lerp(startCenter.y, endCenter.y, eased) + (isDyno ? -Math.sin(p * Math.PI) * 14 : 0),
  };

  const movingOffX = movingHand === "L" ? -shoulderW / 2 : shoulderW / 2;
  const anchorOffX = -movingOffX;

  // En un dinámico real, la mano de apoyo suelta brevemente al despegar
  const anchorAttached = !isDyno || p < 0.32;

  // Proyección iterativa de restricciones rígidas sobre los hombros (cero elasticidad)
  const maxArmSafe = armTotal * 0.96;
  for (let iter = 0; iter < 6; iter++) {
    // 1. Mantener el hombro activo dentro del alcance real de la mano activa
    const mSh = { x: shoulderMid.x + movingOffX, y: shoulderMid.y };
    const dm = dist(mSh, desiredMovingHand);
    if (dm > maxArmSafe) {
      const pull = dm - maxArmSafe;
      shoulderMid.x += ((desiredMovingHand.x - mSh.x) / dm) * pull;
      shoulderMid.y += ((desiredMovingHand.y - mSh.y) / dm) * pull;
    }

    // 2. Mantener el hombro de apoyo anclado a su presa (si no está en vuelo dinámico)
    if (anchorAttached) {
      const aSh = { x: shoulderMid.x + anchorOffX, y: shoulderMid.y };
      const da = dist(aSh, anchorHand);
      if (da > maxArmSafe) {
        const pull = da - maxArmSafe;
        shoulderMid.x += ((anchorHand.x - aSh.x) / da) * pull;
        shoulderMid.y += ((anchorHand.y - aSh.y) / da) * pull;
      }
    }
  }

  shoulderMid.x = clamp(shoulderMid.x, 18, wallWidthCm - 18);
  shoulderMid.y = clamp(shoulderMid.y, headRadius * 2 + 8, wallHeightCm - torsoLen - 18);

  // Ligero giro realista de hombros hacia la mano más alta
  const rawTilt =
    movingHand === "L"
      ? (anchorHand.y - desiredMovingHand.y) * 0.08
      : (desiredMovingHand.y - anchorHand.y) * 0.08;
  const tilt = clamp(rawTilt, -6, 6);

  const shoulderL: Point2D = { x: shoulderMid.x - shoulderW / 2, y: shoulderMid.y - tilt };
  const shoulderR: Point2D = { x: shoulderMid.x + shoulderW / 2, y: shoulderMid.y + tilt };
  const neck: Point2D = { x: shoulderMid.x, y: shoulderMid.y - 3 };
  const head: Point2D = { x: shoulderMid.x + tilt * 0.2, y: shoulderMid.y - headRadius - 4 };

  // Si en un dinámico la mano de apoyo se suelta, queda flexionada junto al torso
  const desiredAnchorHand: Point2D = anchorAttached
    ? anchorHand
    : {
        x: shoulderMid.x + anchorOffX * 1.4,
        y: shoulderMid.y + armTotal * 0.45,
      };

  const targetL = movingHand === "L" ? desiredMovingHand : desiredAnchorHand;
  const targetR = movingHand === "R" ? desiredMovingHand : desiredAnchorHand;

  // Solución IK estrictamente rígida para ambos brazos
  const armL = solveRigidTwoBoneIK(shoulderL, targetL, upperArm, forearm, -1);
  const armR = solveRigidTwoBoneIK(shoulderR, targetR, upperArm, forearm, 1);

  const hipCenter: Point2D = {
    x: clamp(
      shoulderMid.x + (anchorHand.x - shoulderMid.x) * 0.12,
      20,
      wallWidthCm - 20
    ),
    y: Math.min(wallHeightCm - 22, shoulderMid.y + torsoLen),
  };
  const hipL: Point2D = { x: hipCenter.x - hipW / 2, y: hipCenter.y };
  const hipR: Point2D = { x: hipCenter.x + hipW / 2, y: hipCenter.y };

  // Apoyos de pies y solución IK estrictamente rígida para ambas piernas
  const footTargetL = findFootTarget(hipL, "L", legTotal, allHolds, wallHeightCm, wallWidthCm);
  const footTargetR = findFootTarget(hipR, "R", legTotal, allHolds, wallHeightCm, wallWidthCm);
  const legL = solveRigidTwoBoneIK(hipL, footTargetL, thigh, shin, 1);
  const legR = solveRigidTwoBoneIK(hipR, footTargetR, thigh, shin, -1);

  return {
    head,
    headRadius,
    neck,
    shoulderL,
    shoulderR,
    elbowL: armL.joint,
    elbowR: armR.joint,
    handL: armL.end,
    handR: armR.end,
    hipCenter,
    hipL,
    hipR,
    kneeL: legL.joint,
    kneeR: legR.joint,
    footL: legL.end,
    footR: legR.end,
    activeHand: movingHand,
    reachTension: movingHand === "L" ? armL.tension : armR.tension,
    isDyno,
  };
}