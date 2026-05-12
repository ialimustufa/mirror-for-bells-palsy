import {
  CALIBRATION_FRAMES,
  CALIBRATION_RESET_EPS,
  CALIBRATION_STABILITY_EPS,
  FACE_CENTER_MAX_OFFSET,
  FACE_TILT_MAX_RAD,
  PROFILE_BASELINE_TOP_FRACTION,
  PROFILE_EXERCISE_NEUTRAL_MIN_FRAMES,
  PROFILE_MIN_ALIGNMENT_RATIO,
  PROFILE_MIN_SCORED_FRAMES,
  PROFILE_RETAKE_DAYS,
  PROFILE_STEADY_NOISE_MAX,
  PROFILE_USABLE_NOISE_MAX,
  PROFILE_VERSION,
  REPORT_SNAPSHOT_QUALITY,
  REPORT_SNAPSHOT_WIDTH,
} from "../domain/config";
import { DAILY_ESSENTIALS, EXERCISES, PROFILE_ASSESSMENT_EXERCISES } from "../domain/exercises";
import { clampNumber } from "../domain/session";

const SYMMETRY_PAIRS = [[105, 334], [70, 300], [159, 386], [145, 374], [50, 280], [205, 425], [61, 291], [37, 267], [84, 314]];

// Per-exercise blendshape pair — used ONLY for auto-advance gating (activation magnitude),
// not for the symmetry score. The model's L/R blendshape values regress toward each other
// on asymmetric faces and give false-symmetric readings.
const EXERCISE_BLENDSHAPES = {
  "eyebrow-raise": { left: "browOuterUpLeft", right: "browOuterUpRight" },
  "gentle-frown":  { left: "browDownLeft",    right: "browDownRight" },
  "eye-close":     { left: "eyeBlinkLeft",    right: "eyeBlinkRight" },
  "nose-wrinkle":  { left: "noseSneerLeft",   right: "noseSneerRight" },
  "cheek-suck":    { left: "cheekSquintLeft", right: "cheekSquintRight" },
  "closed-smile":  { left: "mouthSmileLeft",  right: "mouthSmileRight" },
  "open-smile":    { left: "mouthSmileLeft",  right: "mouthSmileRight" },
  "lip-press":     { left: "mouthPressLeft",  right: "mouthPressRight" },
  "emoji-smile":    { left: "mouthSmileLeft",  right: "mouthSmileRight" },
  "emoji-big-smile": { left: "mouthSmileLeft", right: "mouthSmileRight" },
  "emoji-wink":     { left: "eyeBlinkLeft",    right: "eyeBlinkRight" },
  "emoji-sad-frown": { left: "mouthFrownLeft", right: "mouthFrownRight" },
  "emoji-nose-scrunch": { left: "noseSneerLeft", right: "noseSneerRight" },
};

function bsActivation(bsMap, mapping) {
  if (!bsMap || !mapping) return 0;
  return Math.max(bsMap[mapping.left] ?? 0, bsMap[mapping.right] ?? 0);
}

// Subject-perspective L/R landmark groups. Symmetry is the ratio of the two sides'
// displacement-from-neutral, computed in a face-local frame.
// Groups densified for Bell's palsy sensitivity — affected-side movement is often subtle,
// and more landmarks per side gives spatial averaging that pulls real signal out of noise.
const EXERCISE_LANDMARK_PAIRS = {
  // Brow upper row + lower brow ridge + forehead row above (frontalis muscle)
  "eyebrow-raise":  {
    left:  [70, 63, 105, 66, 107, 46, 53, 52, 65, 55, 109, 67, 104, 69],
    right: [300, 293, 334, 296, 336, 276, 283, 282, 295, 285, 338, 297, 333, 299],
  },
  "gentle-frown":   {
    left:  [70, 63, 105, 66, 107, 46, 53, 52, 65, 55, 109, 67, 104, 69],
    right: [300, 293, 334, 296, 336, 276, 283, 282, 295, 285, 338, 297, 333, 299],
  },
  // Full eye contour — all 16 points around the eye (upper lid, lower lid, inner/outer corner)
  "eye-close":      {
    left:  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
    right: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
  },
  "wink":           {
    left:  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
    right: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
  },
  // Nostril edge + ala wings + upper-bridge sides (nasalis insertion).
  // Removed unrelated points (infraorbital, lateral cheek) that drift during talking/breathing.
  "nose-wrinkle":   {
    left:  [49, 48, 64, 102, 219, 218, 122],
    right: [279, 278, 294, 331, 439, 438, 351],
  },
  // Mid-cheek + zygomatic + nasolabial fold for fuller buccinator/zygomaticus coverage
  "cheek-puff":     {
    left:  [205, 192, 213, 50, 187, 147, 36, 142, 207, 216],
    right: [425, 416, 433, 280, 411, 376, 266, 371, 427, 436],
  },
  "cheek-suck":     {
    left:  [205, 192, 213, 50, 187, 147, 36, 142, 207, 216],
    right: [425, 416, 433, 280, 411, 376, 266, 371, 427, 436],
  },
  // Mouth corner + outer lip ring + inner lip ring + chin corner
  "closed-smile":   {
    left:  [61, 84, 91, 146, 78, 95, 88, 178, 39, 40, 181],
    right: [291, 314, 321, 375, 308, 324, 318, 402, 269, 270, 405],
  },
  "open-smile":     {
    left:  [61, 84, 91, 146, 78, 95, 88, 178, 39, 40, 185, 181, 17],
    right: [291, 314, 321, 375, 308, 324, 318, 402, 269, 270, 409, 405, 17],
  },
  "pucker":         {
    left:  [61, 91, 146, 78, 185, 95, 88, 178, 40, 39, 37, 0],
    right: [291, 321, 375, 308, 409, 324, 318, 402, 270, 269, 267, 0],
  },
  "lip-press":      {
    left:  [61, 84, 91, 78, 95, 88, 178, 39],
    right: [291, 314, 321, 308, 324, 318, 402, 269],
  },
  "vowel-a":        {
    left:  [61, 84, 91, 146, 78, 95, 88, 178, 40, 17, 200],
    right: [291, 314, 321, 375, 308, 324, 318, 402, 270, 17, 200],
  },
  "vowel-e":        {
    left:  [61, 84, 91, 146, 78, 95, 88, 178, 39, 40, 181],
    right: [291, 314, 321, 375, 308, 324, 318, 402, 269, 270, 405],
  },
  "vowel-i":        {
    left:  [61, 84, 91, 78, 95, 88, 178, 39, 40],
    right: [291, 314, 321, 308, 324, 318, 402, 269, 270],
  },
  "vowel-o":        {
    left:  [61, 91, 146, 78, 185, 95, 88, 178, 40, 37, 0],
    right: [291, 321, 375, 308, 409, 324, 318, 402, 270, 267, 0],
  },
  "vowel-u":        {
    left:  [61, 91, 146, 78, 185, 95, 88, 178, 40, 37, 0],
    right: [291, 321, 375, 308, 409, 324, 318, 402, 270, 267, 0],
  },
  "emoji-smile":    {
    left:  [61, 84, 91, 146, 78, 95, 88, 178, 39, 40, 181],
    right: [291, 314, 321, 375, 308, 324, 318, 402, 269, 270, 405],
  },
  "emoji-big-smile": {
    left:  [61, 84, 91, 146, 78, 95, 88, 178, 39, 40, 185, 181, 17],
    right: [291, 314, 321, 375, 308, 324, 318, 402, 269, 270, 409, 405, 17],
  },
  "emoji-surprise": {
    left:  [70, 63, 105, 66, 107, 61, 91, 146, 78, 185, 95, 88, 178, 40, 37, 0, 17],
    right: [300, 293, 334, 296, 336, 291, 321, 375, 308, 409, 324, 318, 402, 270, 267, 0, 17],
  },
  "emoji-wink":     {
    left:  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 61, 84, 91],
    right: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466, 291, 314, 321],
  },
  "emoji-kiss":     {
    left:  [61, 91, 146, 78, 185, 95, 88, 178, 40, 39, 37, 0],
    right: [291, 321, 375, 308, 409, 324, 318, 402, 270, 269, 267, 0],
  },
  "emoji-sad-frown": {
    left:  [70, 63, 105, 66, 107, 61, 84, 91, 146, 78, 95, 88, 178, 39, 181],
    right: [300, 293, 334, 296, 336, 291, 314, 321, 375, 308, 324, 318, 402, 269, 405],
  },
  "emoji-nose-scrunch": {
    left:  [49, 48, 64, 102, 219, 218, 122, 33, 7, 163, 144, 145, 159, 160],
    right: [279, 278, 294, 331, 439, 438, 351, 263, 249, 390, 373, 374, 386, 387],
  },
};

// Convert landmarks to a face-local frame: origin at nose tip (landmark 1), x-axis
// follows the eye line (33 -> 263), scale = inter-ocular distance. This removes
// translation, roll, and scale; yaw/pitch still need MediaPipe's transform matrix.
function faceFrameNormalize(lm) {
  if (!lm || !lm[1] || !lm[33] || !lm[263]) return null;
  const o = lm[1];
  const ex = lm[263].x - lm[33].x, ey = lm[263].y - lm[33].y;
  const scale = Math.hypot(ex, ey);
  if (scale < 0.01) return null;
  const ux = ex / scale, uy = ey / scale;
  const out = new Array(lm.length);
  for (let i = 0; i < lm.length; i++) {
    const p = lm[i]; if (!p) continue;
    const dx = p.x - o.x, dy = p.y - o.y;
    out[i] = {
      x: (dx * ux + dy * uy) / scale,
      y: (-dx * uy + dy * ux) / scale,
      z: ((p.z ?? 0) - (o.z ?? 0)) / scale,
    };
  }
  return out;
}

function sumDisp(lmN, neuN, idxs, noiseFloor) {
  // Sum of per-landmark distance from neutral, with each point's natural at-rest jitter
  // subtracted out. This pulls subtle real movement (e.g. affected-side recruitment in
  // Bell's palsy) above the noise band so it can be scored.
  let total = 0;
  for (const i of idxs) {
    const a = lmN[i], b = neuN[i]; if (!a || !b) continue;
    const d = Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
    const noise = noiseFloor ? (noiseFloor[i] ?? 0) : 0;
    total += Math.max(0, d - noise);
  }
  return total;
}

function computePairwiseSymmetry(lm, neutral, mapping, noiseFloor) {
  if (!mapping || !neutral) return null;
  const lmN = faceFrameNormalize(lm), neuN = faceFrameNormalize(neutral);
  if (!lmN || !neuN) return null;
  const lDisp = sumDisp(lmN, neuN, mapping.left, noiseFloor);
  const rDisp = sumDisp(lmN, neuN, mapping.right, noiseFloor);
  const peak = Math.max(lDisp, rDisp);
  // Lower threshold than the pre-denoising version (0.04 → 0.02): with per-landmark noise
  // subtracted out, the residual is real motion, so we can score smaller movements.
  if (peak < 0.02) return null;
  const symmetry = Math.min(lDisp, rDisp) / peak;
  return { symmetry, leftDisp: lDisp, rightDisp: rDisp, peak };
}

// Per-landmark "noise" = each point's average jitter from the neutral mean across the
// calibration window. Captured during get-ready, then subtracted from displacement
// during hold to expose subtle real motion.
function computeNoiseFloor(buffer, neutral) {
  if (!buffer || buffer.length < 5 || !neutral) return null;
  const neuN = faceFrameNormalize(neutral);
  if (!neuN) return null;
  const N = neutral.length;
  const sums = new Float32Array(N);
  const counts = new Uint16Array(N);
  for (const lm of buffer) {
    const lmN = faceFrameNormalize(lm);
    if (!lmN) continue;
    for (let i = 0; i < N; i++) {
      const a = lmN[i], b = neuN[i];
      if (!a || !b) continue;
      sums[i] += Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
      counts[i]++;
    }
  }
  const noise = new Float32Array(N);
  for (let i = 0; i < N; i++) noise[i] = counts[i] > 0 ? sums[i] / counts[i] : 0;
  return noise;
}

function dist3(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function computeSymmetry(current, neutral) {
  if (!current || !neutral) return null;
  const curN = faceFrameNormalize(current), neuN = faceFrameNormalize(neutral);
  if (!curN || !neuN) return null;
  let weighted = 0, weight = 0;
  let leftTotal = 0, rightTotal = 0;
  for (const [l, r] of SYMMETRY_PAIRS) {
    if (!curN[l] || !curN[r] || !neuN[l] || !neuN[r]) continue;
    const lDisp = dist3(curN[l], neuN[l]);
    const rDisp = dist3(curN[r], neuN[r]);
    leftTotal += lDisp;
    rightTotal += rDisp;
    const total = lDisp + rDisp;
    if (total < 0.012) continue;
    const ratio = Math.min(lDisp, rDisp) / Math.max(lDisp, rDisp);
    weighted += ratio * total; weight += total;
  }
  if (weight < 0.024) return null;
  return { symmetry: weighted / weight, leftDisp: leftTotal, rightDisp: rightTotal };
}

// Brow tracking: more precise than generic landmark-pair displacement because (a) it's
// less sensitive to pitch (eye and brow translate together), and (b) it isolates the
// vertical axis where the actual lift/depress signal lives. Measures per-side change in
// brow-to-upper-eyelid vertical gap, in the face-local frame.
const BROW_LANDMARKS = {
  // Upper brow row + lower brow ridge — 10 points per side
  leftBrow:    [70, 63, 105, 66, 107, 46, 53, 52, 65, 55],
  rightBrow:   [300, 293, 334, 296, 336, 276, 283, 282, 295, 285],
  // Upper eyelid arc — the stable reference the brow lifts away from
  leftEyeTop:  [159, 158, 157, 160, 161],
  rightEyeTop: [386, 385, 384, 387, 388],
};
const BROW_EXERCISES = new Set(["eyebrow-raise", "gentle-frown"]);

function avgY(frame, idxs) {
  let s = 0, c = 0;
  for (const i of idxs) { if (frame[i]) { s += frame[i].y; c++; } }
  return c ? s / c : null;
}

function browEyeGap(frame, browIdxs, eyeIdxs) {
  const b = avgY(frame, browIdxs), e = avgY(frame, eyeIdxs);
  return (b == null || e == null) ? null : (e - b); // smaller image y = higher; positive = brow above eye
}

// Nose tracking: handles BOTH nostril flare (aperture widening) and wrinkle/sneer
// (upward ala lift). A centroid-shift-only score can miss a real flare because the
// nostril rim widens while the whole cluster barely translates.
const NOSE_LANDMARKS = {
  // Subject-perspective L/R, matching code convention where left = image-left.
  midline: [1, 2, 4, 5, 195, 197],
  leftRim: [49, 48, 64],
  rightRim: [279, 278, 294],
  leftAla: [102, 219, 218],
  rightAla: [331, 439, 438],
};
const NOSE_EXERCISES = new Set(["nose-wrinkle", "emoji-nose-scrunch"]);
const NOSE_MIN_SIGNAL = 0.0012;
const NOSE_PROFILE_THRESHOLD_FLOOR = 0.0015;
const NOSE_PROFILE_THRESHOLD_MAX = 0.0025;

function avgXY(frame, idxs) {
  let sx = 0, sy = 0, c = 0;
  for (const i of idxs) {
    const p = frame[i]; if (!p) continue;
    sx += p.x; sy += p.y; c++;
  }
  return c ? { x: sx / c, y: sy / c } : null;
}

function avgNoseCluster(frame, rimIdxs, alaIdxs) {
  let sx = 0, sy = 0, c = 0;
  for (const idxs of [rimIdxs, alaIdxs]) {
    for (const i of idxs) {
      const p = frame[i]; if (!p) continue;
      sx += p.x; sy += p.y; c++;
    }
  }
  return c ? { x: sx / c, y: sy / c } : null;
}

function noseShape(frame) {
  const mid = avgXY(frame, NOSE_LANDMARKS.midline);
  const leftRim = avgXY(frame, NOSE_LANDMARKS.leftRim);
  const rightRim = avgXY(frame, NOSE_LANDMARKS.rightRim);
  const leftAla = avgXY(frame, NOSE_LANDMARKS.leftAla);
  const rightAla = avgXY(frame, NOSE_LANDMARKS.rightAla);
  const leftCluster = avgNoseCluster(frame, NOSE_LANDMARKS.leftRim, NOSE_LANDMARKS.leftAla);
  const rightCluster = avgNoseCluster(frame, NOSE_LANDMARKS.rightRim, NOSE_LANDMARKS.rightAla);
  if (!mid || !leftRim || !rightRim || !leftAla || !rightAla || !leftCluster || !rightCluster) return null;

  // Aperture proxy: distance from the face midline to a weighted nostril-side center.
  // The rim gets more weight than the ala because flare primarily opens the nostril.
  const leftOpenX = (leftRim.x * 2 + leftAla.x) / 3;
  const rightOpenX = (rightRim.x * 2 + rightAla.x) / 3;
  return {
    leftWidth: Math.max(0, mid.x - leftOpenX),
    rightWidth: Math.max(0, rightOpenX - mid.x),
    leftY: leftCluster.y,
    rightY: rightCluster.y,
  };
}

// Delta gating intentionally watches mouth corners and chin so talking, jaw motion,
// and expression changes reset neutral calibration.
const CALIBRATION_DELTA_POINTS = [1, 4, 10, 33, 61, 152, 199, 263, 291];
// Profile quality uses a stricter stable-core subset. Thresholds are compatibility
// defaults until we tune them against captured calibration samples.
const CORE_QUALITY_POINTS = [1, 4, 10, 33, 263];

function normalizedFrameDelta(aLm, bLm) {
  const aN = faceFrameNormalize(aLm), bN = faceFrameNormalize(bLm);
  if (!aN || !bN) return Infinity;
  let total = 0, count = 0;
  for (const i of CALIBRATION_DELTA_POINTS) {
    const a = aN[i], b = bN[i];
    if (!a || !b) continue;
    total += Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
    count++;
  }
  return count ? total / count : Infinity;
}

function meanNoise(noiseFloor, idxs) {
  if (!noiseFloor) return 0;
  let s = 0, c = 0;
  for (const i of idxs) {
    const n = noiseFloor[i];
    if (n == null) continue;
    s += n; c++;
  }
  return c ? s / c : 0;
}

function averageBlendshapes(buffer) {
  if (!buffer || buffer.length === 0) return null;
  const sums = {};
  const counts = {};
  for (const bs of buffer) {
    if (!bs) continue;
    for (const k in bs) {
      sums[k] = (sums[k] ?? 0) + bs[k];
      counts[k] = (counts[k] ?? 0) + 1;
    }
  }
  const avg = {};
  for (const k in sums) avg[k] = counts[k] > 0 ? sums[k] / counts[k] : 0;
  return avg;
}

// Weight that maps a 1.0 blendshape activation to a strong-flare mesh magnitude (~0.03).
// Used so per-side blendshape activation can additively reinforce the mesh signal without
// dominating it. The mesh stays primary because it lateralizes more honestly on asymmetric
// faces; blendshapes regress toward bilaterally similar values.
const NOSE_BS_WEIGHT = 0.03;

function computeNoseSymmetry(lm, neutral, noiseFloor, bsMap, neutralBs) {
  if (!lm || !neutral) return null;
  const lmN = faceFrameNormalize(lm), neuN = faceFrameNormalize(neutral);
  if (!lmN || !neuN) return null;
  const cur = noseShape(lmN), neu = noseShape(neuN);
  if (!cur || !neu) return null;

  const lFlareRaw = Math.max(0, cur.leftWidth - neu.leftWidth);
  const rFlareRaw = Math.max(0, cur.rightWidth - neu.rightWidth);
  const lLiftRaw = Math.max(0, neu.leftY - cur.leftY);   // smaller y = lifted upward
  const rLiftRaw = Math.max(0, neu.rightY - cur.rightY);

  // Per-side centroid jitter: averaging N landmarks scales single-point noise by 1/sqrt(N),
  // which is what the width/lift signals operate on. Subtracting this brings nose scoring
  // in line with sumDisp's per-point denoising in the pairwise scorer.
  const leftIdxs = [...NOSE_LANDMARKS.leftRim, ...NOSE_LANDMARKS.leftAla];
  const rightIdxs = [...NOSE_LANDMARKS.rightRim, ...NOSE_LANDMARKS.rightAla];
  const leftNoise = meanNoise(noiseFloor, leftIdxs) / Math.sqrt(leftIdxs.length);
  const rightNoise = meanNoise(noiseFloor, rightIdxs) / Math.sqrt(rightIdxs.length);

  const lFlare = Math.max(0, lFlareRaw - leftNoise);
  const rFlare = Math.max(0, rFlareRaw - rightNoise);
  const lLift = Math.max(0, lLiftRaw - leftNoise);
  const rLift = Math.max(0, rLiftRaw - rightNoise);

  // Per-side blendshape activation, with calibration-time neutral subtracted so a slightly
  // raised resting `noseSneer*` doesn't masquerade as movement.
  const lBs = bsMap ? Math.max(0, (bsMap.noseSneerLeft ?? 0) - (neutralBs?.noseSneerLeft ?? 0)) : 0;
  const rBs = bsMap ? Math.max(0, (bsMap.noseSneerRight ?? 0) - (neutralBs?.noseSneerRight ?? 0)) : 0;

  const lMesh = Math.hypot(lFlare, lLift);
  const rMesh = Math.hypot(rFlare, rLift);
  const lMag = lMesh + NOSE_BS_WEIGHT * lBs;
  const rMag = rMesh + NOSE_BS_WEIGHT * rBs;
  const peak = Math.max(lMag, rMag);
  // Adaptive gate: small absolute floor for real flare signals, but rises with calibration
  // jitter so a noisy session doesn't drift into "scored" territory after denoising.
  const noiseGate = Math.max(leftNoise, rightNoise) * 1.5;
  if (peak < Math.max(NOSE_MIN_SIGNAL, noiseGate)) return null;
  const symmetry = Math.min(lMag, rMag) / peak;
  return { symmetry, leftDisp: lMag, rightDisp: rMag, peak };
}

function computeBrowSymmetry(lm, neutral) {
  if (!lm || !neutral) return null;
  const lmN = faceFrameNormalize(lm), neuN = faceFrameNormalize(neutral);
  if (!lmN || !neuN) return null;
  const lCur = browEyeGap(lmN, BROW_LANDMARKS.leftBrow,  BROW_LANDMARKS.leftEyeTop);
  const lNeu = browEyeGap(neuN, BROW_LANDMARKS.leftBrow,  BROW_LANDMARKS.leftEyeTop);
  const rCur = browEyeGap(lmN, BROW_LANDMARKS.rightBrow, BROW_LANDMARKS.rightEyeTop);
  const rNeu = browEyeGap(neuN, BROW_LANDMARKS.rightBrow, BROW_LANDMARKS.rightEyeTop);
  if (lCur == null || lNeu == null || rCur == null || rNeu == null) return null;
  const lLift = Math.abs(lCur - lNeu); // abs handles both raise (gap grows) and frown (gap shrinks)
  const rLift = Math.abs(rCur - rNeu);
  const peak = Math.max(lLift, rLift);
  if (peak < 0.008) return null; // brow noise floor (lowered after denser landmark groups average out more per-point jitter)
  const symmetry = Math.min(lLift, rLift) / peak;
  return { symmetry, leftDisp: lLift, rightDisp: rLift, peak };
}

function computeExerciseSymmetry(exerciseId, lm, neutral, noiseFloor, bsMap, neutralBs) {
  const mapping = EXERCISE_LANDMARK_PAIRS[exerciseId] ?? null;
  const browResult = BROW_EXERCISES.has(exerciseId) ? computeBrowSymmetry(lm, neutral) : null;
  const noseResult = NOSE_EXERCISES.has(exerciseId) ? computeNoseSymmetry(lm, neutral, noiseFloor, bsMap, neutralBs) : null;
  return browResult ?? noseResult ?? computePairwiseSymmetry(lm, neutral, mapping, noiseFloor) ?? computeSymmetry(lm, neutral);
}

function roundMetric(v, digits = 4) {
  return Number.isFinite(v) ? Number(v.toFixed(digits)) : null;
}

function percentile(values, pct) {
  const valid = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const idx = Math.min(valid.length - 1, Math.max(0, Math.ceil(valid.length * pct) - 1));
  return valid[idx];
}

function averageSamples(samples) {
  if (!samples?.length) return null;
  const totals = samples.reduce((acc, item) => ({
    left: acc.left + (item.left ?? 0),
    right: acc.right + (item.right ?? 0),
    symmetry: acc.symmetry + (item.symmetry ?? 0),
    peak: acc.peak + (item.peak ?? 0),
  }), { left: 0, right: 0, symmetry: 0, peak: 0 });
  return {
    count: samples.length,
    left: totals.left / samples.length,
    right: totals.right / samples.length,
    symmetry: totals.symmetry / samples.length,
    peak: totals.peak / samples.length,
  };
}

function robustMovementWindow(samples, fraction = PROFILE_BASELINE_TOP_FRACTION) {
  const valid = (samples ?? []).filter((item) => Number.isFinite(item?.peak) && item.peak > 0);
  if (!valid.length) return null;
  const count = Math.max(1, Math.ceil(valid.length * fraction));
  return averageSamples([...valid].sort((a, b) => b.peak - a.peak).slice(0, count));
}

function exerciseBaselineQuality(stat) {
  const holdFrames = stat.holdFrames ?? stat.frames ?? 0;
  const scoredFrames = stat.frames ?? 0;
  const alignedFrames = stat.alignedFrames ?? 0;
  const scoredRatio = holdFrames > 0 ? scoredFrames / holdFrames : 0;
  const alignmentRatio = holdFrames > 0 ? alignedFrames / holdFrames : 0;
  const peak = Math.max(stat.leftPeak ?? 0, stat.rightPeak ?? 0);
  const signalScore = clampNumber(peak / 0.04, 0, 1);
  const neutralOk = (stat.neutralFrames ?? 0) >= PROFILE_EXERCISE_NEUTRAL_MIN_FRAMES;
  const frameScore = clampNumber(scoredFrames / PROFILE_MIN_SCORED_FRAMES, 0, 1);
  const score = roundMetric(frameScore * 0.35 + alignmentRatio * 0.25 + signalScore * 0.25 + (neutralOk ? 0.15 : 0), 3);
  const issues = [];
  if (!neutralOk) issues.push("short neutral capture");
  if (scoredFrames < PROFILE_MIN_SCORED_FRAMES) issues.push("low scored frames");
  if (alignmentRatio < PROFILE_MIN_ALIGNMENT_RATIO) issues.push("face alignment drift");
  if (peak < 0.006) issues.push("very low movement signal");
  const key = score >= 0.8 && issues.length === 0 ? "strong" : score >= 0.55 ? "usable" : "retake";
  const label = key === "strong" ? "Strong" : key === "usable" ? "Usable" : "Retake";
  return {
    key,
    label,
    score,
    issues,
    holdFrames,
    scoredFrames,
    scoredRatio: roundMetric(scoredRatio, 3),
    alignmentRatio: roundMetric(alignmentRatio, 3),
    peakMovement: roundMetric(peak),
  };
}

function compactLandmarks(lm) {
  if (!lm) return null;
  return lm.map((p) => ({ x: roundMetric(p.x, 5), y: roundMetric(p.y, 5), z: roundMetric(p.z ?? 0, 5) }));
}

function compactNoiseFloor(noise) {
  if (!noise) return null;
  return Array.from(noise, (v) => roundMetric(v, 5));
}

function inferLimitedSide(left, right) {
  const peak = Math.max(left ?? 0, right ?? 0);
  if (peak < 0.0001) return "unknown";
  const diff = Math.abs((left ?? 0) - (right ?? 0)) / peak;
  if (diff < 0.15) return "balanced";
  return left < right ? "left" : "right";
}

function activationThresholdForExercise(exerciseId, peak) {
  if (NOSE_EXERCISES.has(exerciseId)) {
    return roundMetric(Math.max(peak * 0.25, NOSE_PROFILE_THRESHOLD_FLOOR));
  }
  return roundMetric(Math.max(peak * 0.35, 0.004));
}

function effectiveProfileThreshold(exerciseId, threshold) {
  if (threshold == null) return null;
  if (NOSE_EXERCISES.has(exerciseId)) return Math.min(threshold, NOSE_PROFILE_THRESHOLD_MAX);
  return threshold;
}

function buildMovementProfile({ neutral, noise, exerciseStats, affectedSide, comfortLevel }) {
  const exercises = {};
  for (const stat of exerciseStats) {
    const leftBaseline = stat.leftRobustAvg ?? stat.leftAvg;
    const rightBaseline = stat.rightRobustAvg ?? stat.rightAvg;
    const symmetryBaseline = stat.symRobustAvg ?? stat.symAvg;
    const leftPeak = stat.leftPeak ?? 0;
    const rightPeak = stat.rightPeak ?? 0;
    const peak = Math.max(leftPeak, rightPeak);
    exercises[stat.exerciseId] = {
      exerciseId: stat.exerciseId,
      name: stat.name,
      region: stat.region,
      frames: stat.frames,
      holdFrames: stat.holdFrames ?? stat.frames,
      alignedFrames: stat.alignedFrames ?? 0,
      neutralFrames: stat.neutralFrames ?? 0,
      neutralSource: stat.neutralSource ?? "global",
      quality: stat.quality ?? null,
      baselineMethod: stat.baselineMethod ?? "mean",
      baselineFrames: stat.baselineFrames ?? stat.frames,
      leftMeanMovement: roundMetric(stat.leftAvg),
      rightMeanMovement: roundMetric(stat.rightAvg),
      meanSymmetry: stat.symAvg == null ? null : roundMetric(stat.symAvg),
      leftBaselineMovement: roundMetric(leftBaseline),
      rightBaselineMovement: roundMetric(rightBaseline),
      leftPeakMovement: roundMetric(leftPeak),
      rightPeakMovement: roundMetric(rightPeak),
      initialSymmetry: symmetryBaseline == null ? null : roundMetric(symmetryBaseline),
      activationThreshold: activationThresholdForExercise(stat.exerciseId, peak),
      limitedSide: inferLimitedSide(leftPeak, rightPeak),
    };
  }
  const valid = Object.values(exercises).filter((e) => e.initialSymmetry != null);
  const initialAvgSymmetry = valid.length
    ? valid.reduce((sum, e) => sum + e.initialSymmetry, 0) / valid.length
    : null;
  const noiseValues = noise ? Array.from(noise).filter((v) => Number.isFinite(v)) : [];
  const avgNoise = noiseValues.length ? noiseValues.reduce((a, b) => a + b, 0) / noiseValues.length : null;
  const coreNoiseValues = noise ? CORE_QUALITY_POINTS.map((idx) => noise[idx]).filter((v) => Number.isFinite(v)) : [];
  const coreAvgNoise = coreNoiseValues.length ? coreNoiseValues.reduce((a, b) => a + b, 0) / coreNoiseValues.length : null;
  const p90Noise = percentile(noiseValues, 0.9);
  return {
    version: PROFILE_VERSION,
    createdAt: Date.now(),
    affectedSide,
    comfortLevel,
    neutralLandmarks: compactLandmarks(neutral),
    noiseFloor: compactNoiseFloor(noise),
    calibrationQuality: {
      frames: CALIBRATION_FRAMES,
      exerciseNeutralMinFrames: PROFILE_EXERCISE_NEUTRAL_MIN_FRAMES,
      baselineTopFraction: PROFILE_BASELINE_TOP_FRACTION,
      avgNoise: roundMetric(avgNoise, 5),
      coreAvgNoise: roundMetric(coreAvgNoise, 5),
      coreQualityPoints: CORE_QUALITY_POINTS,
      p90Noise: roundMetric(p90Noise, 5),
      stabilityEps: CALIBRATION_STABILITY_EPS,
      steadyNoiseMax: PROFILE_STEADY_NOISE_MAX,
      usableNoiseMax: PROFILE_USABLE_NOISE_MAX,
    },
    initialAvgSymmetry: roundMetric(initialAvgSymmetry),
    exercises,
  };
}

function getProfileExercise(profile, exerciseId) {
  return profile?.exercises?.[exerciseId] ?? null;
}

function movementForSide(left, right, side) {
  if (side === "left") return left ?? 0;
  if (side === "right") return right ?? 0;
  return Math.min(left ?? 0, right ?? 0);
}

function resolveFocusSide(profile, profileExercise, left, right) {
  if (profile?.affectedSide === "left" || profile?.affectedSide === "right") return profile.affectedSide;
  if (profileExercise?.limitedSide === "left" || profileExercise?.limitedSide === "right") return profileExercise.limitedSide;
  return (left ?? 0) <= (right ?? 0) ? "left" : "right";
}

function profileBaselineForSide(profileExercise, side) {
  if (!profileExercise) return null;
  const avg = side === "left" ? profileExercise.leftBaselineMovement : profileExercise.rightBaselineMovement;
  const peak = side === "left" ? profileExercise.leftPeakMovement : profileExercise.rightPeakMovement;
  return avg ?? peak ?? null;
}

function computeBaselineProgressFromDisplacements(exerciseId, leftDisp, rightDisp, profile) {
  const profileExercise = getProfileExercise(profile, exerciseId);
  if (!profileExercise) return null;
  const side = resolveFocusSide(profile, profileExercise, leftDisp, rightDisp);
  const baseline = profileBaselineForSide(profileExercise, side);
  if (!baseline || baseline <= 0) return null;
  const current = movementForSide(leftDisp, rightDisp, side);
  const ratio = current / baseline;
  return {
    side,
    currentMovement: roundMetric(current),
    baselineMovement: roundMetric(baseline),
    ratio: roundMetric(ratio),
    deltaPct: Math.round((ratio - 1) * 100),
  };
}

function computeBaselineProgress(exerciseId, symResult, profile) {
  if (!symResult) return null;
  return computeBaselineProgressFromDisplacements(exerciseId, symResult.leftDisp, symResult.rightDisp, profile);
}

function summarizeBaselineProgress(items) {
  const valid = (items ?? []).filter((p) => p?.ratio != null);
  if (!valid.length) return null;
  const ratio = valid.reduce((sum, p) => sum + p.ratio, 0) / valid.length;
  const first = valid[0];
  return {
    side: first.side,
    ratio: roundMetric(ratio),
    deltaPct: Math.round((ratio - 1) * 100),
    baselineMovement: first.baselineMovement,
    currentMovement: roundMetric(valid.reduce((sum, p) => sum + (p.currentMovement ?? 0), 0) / valid.length),
    reps: valid.length,
  };
}

function summarizeSessionBaselineProgress(scores, key = "baselineProgress") {
  return summarizeBaselineProgress((scores ?? []).map((s) => s?.[key]).filter(Boolean));
}

function baselineProgressLabel(progress) {
  if (progress?.ratio == null) return null;
  if (progress.ratio >= 1) return `+${progress.deltaPct}% from baseline`;
  return `${Math.round(progress.ratio * 100)}% of baseline`;
}

function preferredBaselineProgress(record) {
  return record?.initialBaselineProgress ?? record?.baselineProgress ?? null;
}

function buildPersonalizedDailyPlan(profile, sessions = [], count = DAILY_ESSENTIALS.length) {
  if (!profile?.exercises) return DAILY_ESSENTIALS.slice(0, count);
  const scored = getAdaptiveFocusItems(profile, sessions, count).map((item) => item.id);
  return [...new Set([...scored, ...DAILY_ESSENTIALS])].slice(0, count);
}

function latestSessionBaselineProgress(sessions) {
  const latest = [...(sessions ?? [])].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0)).find((s) => preferredBaselineProgress(s));
  return preferredBaselineProgress(latest);
}

function latestExerciseProgressById(sessions) {
  const out = {};
  for (const session of [...(sessions ?? [])].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))) {
    for (const score of session.scores ?? []) {
      const progress = preferredBaselineProgress(score);
      if (!out[score.exerciseId] && progress) out[score.exerciseId] = progress;
    }
  }
  return out;
}

function latestExerciseScoreById(sessions) {
  const out = {};
  for (const session of [...(sessions ?? [])].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))) {
    for (const score of session.scores ?? []) {
      if (!out[score.exerciseId]) out[score.exerciseId] = score;
    }
  }
  return out;
}

function getAdaptiveFocusItems(profile, sessions, count = 5) {
  if (!profile?.exercises) return [];
  const latestByExercise = latestExerciseScoreById(sessions);
  return Object.values(profile.exercises)
    .filter((ex) => EXERCISES.some((item) => item.id === ex.exerciseId))
    .map((ex) => {
      const latest = latestByExercise[ex.exerciseId];
      const baselineGap = ex.initialSymmetry == null ? 0.25 : 1 - ex.initialSymmetry;
      const latestGap = latest?.avg == null ? 0 : 1 - latest.avg;
      const progressGap = latest?.baselineProgress?.ratio == null ? 0 : Math.max(0, 1 - latest.baselineProgress.ratio);
      const sideFocus = (profile.affectedSide === "left" || profile.affectedSide === "right") && ex.limitedSide === profile.affectedSide ? 0.2 : 0;
      const noRecentData = latest ? 0 : 0.1;
      const score = baselineGap * 0.45 + latestGap * 0.35 + progressGap * 0.25 + sideFocus + noRecentData;
      return {
        id: ex.exerciseId,
        score,
        baselineGap,
        latestGap,
        progressGap,
        latest,
        exercise: EXERCISES.find((item) => item.id === ex.exerciseId),
        profileExercise: ex,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

function focusReason(item) {
  if (!item) return "";
  if (item.latest?.baselineProgress?.ratio != null && item.latest.baselineProgress.ratio < 1) {
    return `${Math.round(item.latest.baselineProgress.ratio * 100)}% of baseline`;
  }
  if (item.latest?.avg != null) return `recent symmetry ${Math.round(item.latest.avg * 100)}%`;
  if (item.profileExercise.initialSymmetry != null) return `baseline symmetry ${Math.round(item.profileExercise.initialSymmetry * 100)}%`;
  return `limited side ${item.profileExercise.limitedSide}`;
}

function sessionFocusRecommendation(scores) {
  const ranked = (scores ?? [])
    .filter((s) => s.avg != null || s.baselineProgress?.ratio != null)
    .map((s) => {
      const symmetryGap = s.avg == null ? 0 : 1 - s.avg;
      const progressGap = s.baselineProgress?.ratio == null ? 0 : Math.max(0, 1 - s.baselineProgress.ratio);
      return { ...s, focusScore: symmetryGap * 0.6 + progressGap * 0.4 };
    })
    .sort((a, b) => b.focusScore - a.focusScore);
  return ranked[0] ?? null;
}

function profileAgeDays(profile) {
  if (!profile?.createdAt) return null;
  return Math.max(0, Math.floor((Date.now() - profile.createdAt) / (1000 * 60 * 60 * 24)));
}

function profileQuality(profile) {
  const metric = profile?.calibrationQuality?.coreAvgNoise ?? profile?.calibrationQuality?.avgNoise;
  if (metric == null) return { key: "unknown", label: "Unknown", color: "#A8A29E", metric: null };
  if (metric <= PROFILE_STEADY_NOISE_MAX) return { key: "steady", label: "Steady", color: "#7A8F73", metric };
  if (metric <= PROFILE_USABLE_NOISE_MAX) return { key: "usable", label: "Usable", color: "#D4A574", metric };
  return { key: "noisy", label: "Noisy", color: "#B8543A", metric };
}

function profileStatus(profile) {
  if (!profile) return null;
  const ageDays = profileAgeDays(profile);
  const quality = profileQuality(profile);
  const stale = ageDays != null && ageDays >= PROFILE_RETAKE_DAYS;
  const noisy = quality.key === "noisy";
  const exerciseEntries = Object.values(profile.exercises ?? {});
  const retakeExercises = exerciseEntries.filter((ex) => ex.quality?.key === "retake");
  return {
    ageDays,
    quality,
    stale,
    noisy,
    retakeExercises,
    shouldRetake: stale || noisy || retakeExercises.length > 0,
    reason: noisy ? "calibration was noisy" : stale ? `${ageDays} days old` : retakeExercises.length > 0 ? `${retakeExercises.length} exercise baseline${retakeExercises.length === 1 ? "" : "s"} need review` : null,
  };
}

function profileExerciseEntries(profile) {
  const order = new Map(PROFILE_ASSESSMENT_EXERCISES.map((id, index) => [id, index]));
  return Object.values(profile?.exercises ?? {}).sort((a, b) => {
    const aOrder = order.get(a.exerciseId) ?? 99;
    const bOrder = order.get(b.exerciseId) ?? 99;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
}

function formatProfileSide(side) {
  const labels = { left: "left", right: "right", both: "both", unsure: "unsure", balanced: "balanced", unknown: "unknown" };
  return labels[side] ?? "unsure";
}

function formatProfileDate(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function signedPointDelta(delta) {
  if (delta == null) return null;
  const pts = Math.round(delta * 100);
  if (pts === 0) return "0 pts";
  return `${pts > 0 ? "+" : ""}${pts} pts`;
}

function compareMovementProfiles(current, previous) {
  if (!current || !previous) return null;
  const avgSymmetryDelta = current.initialAvgSymmetry != null && previous.initialAvgSymmetry != null
    ? current.initialAvgSymmetry - previous.initialAvgSymmetry
    : null;
  const noiseDelta = current.calibrationQuality?.avgNoise != null && previous.calibrationQuality?.avgNoise != null
    ? current.calibrationQuality.avgNoise - previous.calibrationQuality.avgNoise
    : null;
  const previousExercises = previous.exercises ?? {};
  const exerciseDeltas = profileExerciseEntries(current)
    .map((ex) => {
      const prev = previousExercises[ex.exerciseId];
      if (ex.initialSymmetry == null || prev?.initialSymmetry == null) return null;
      return { exerciseId: ex.exerciseId, name: ex.name, region: ex.region, symmetryDelta: ex.initialSymmetry - prev.initialSymmetry };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.symmetryDelta) - Math.abs(a.symmetryDelta));
  return {
    previousDate: formatProfileDate(previous.createdAt),
    archivedDate: formatProfileDate(previous.archivedAt),
    avgSymmetryDelta,
    noiseDelta,
    exerciseDeltas,
  };
}

// Anatomical face midline (top of forehead → glabella → nose bridge → nose tip → philtrum → chin).
// Used as a dotted symmetry guide so the user can compare left/right sides of the face by eye.
const FACE_MIDLINE = [10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 164, 0, 11, 12, 13, 14, 15, 16, 17, 18, 200, 199, 175, 152];

// Face contour + key feature indices for the overlay (subset of the 468-point mesh)
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const LEFT_BROW = [70, 63, 105, 66, 107];
const RIGHT_BROW = [336, 296, 334, 293, 300];
const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];

// Compute the object-cover transform that maps normalized landmark coords -> mirrored display pixels
function objectCoverTransform(canvas, video) {
  const cw = canvas.width, ch = canvas.height;
  const vw = video.videoWidth || cw, vh = video.videoHeight || ch;
  if (!vw || !vh) return null;
  const scale = Math.max(cw / vw, ch / vh);
  const dw = vw * scale, dh = vh * scale;
  const ox = (cw - dw) / 2, oy = (ch - dh) / 2;
  return { dw, dh, ox, oy, cw };
}

function drawOverlay(canvas, video, lm, { aligned, phase }) {
  if (!canvas || !video) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Centering ring (posture guide) — green when aligned, soft amber otherwise
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const ringR = Math.min(canvas.width, canvas.height) * 0.36;
  ctx.lineWidth = 2 * dpr;
  ctx.strokeStyle = aligned ? "rgba(122,143,115,0.85)" : "rgba(212,165,116,0.55)";
  ctx.setLineDash([8 * dpr, 8 * dpr]);
  ctx.beginPath(); ctx.ellipse(cx, cy, ringR * 0.78, ringR, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);

  if (!lm) return;
  const t = objectCoverTransform(canvas, video);
  if (!t) return;
  const px = (p) => t.cw - (p.x * t.dw + t.ox); // mirrored X to match scaleX(-1) on the video
  const py = (p) => p.y * t.dh + t.oy;

  // Faint full mesh (every 3rd point — keeps it readable)
  ctx.fillStyle = "rgba(244,239,230,0.18)";
  for (let i = 0; i < lm.length; i += 3) {
    const p = lm[i]; if (!p) continue;
    ctx.beginPath(); ctx.arc(px(p), py(p), 1 * dpr, 0, Math.PI * 2); ctx.fill();
  }

  // Feature polylines
  const stroke = (idxs, color, closed) => {
    ctx.beginPath();
    idxs.forEach((i, k) => { const p = lm[i]; if (!p) return; const x = px(p), y = py(p); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    if (closed) ctx.closePath();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
  };
  stroke(FACE_OVAL, "rgba(244,239,230,0.6)", true);
  stroke(LEFT_BROW, "rgba(212,165,116,0.95)", false);
  stroke(RIGHT_BROW, "rgba(212,165,116,0.95)", false);
  stroke(LEFT_EYE, "rgba(184,84,58,0.9)", true);
  stroke(RIGHT_EYE, "rgba(184,84,58,0.9)", true);
  stroke(LIPS_OUTER, "rgba(184,84,58,0.95)", true);

  // Dotted vertical symmetry midline — follows the face's anatomical center line, not the screen center,
  // so it stays correct when the head tilts.
  ctx.save();
  ctx.setLineDash([4 * dpr, 5 * dpr]);
  ctx.strokeStyle = "rgba(244,239,230,0.55)";
  ctx.lineWidth = 1.25 * dpr;
  ctx.beginPath();
  let started = false;
  for (const i of FACE_MIDLINE) {
    const p = lm[i]; if (!p) continue;
    const x = px(p), y = py(p);
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  if (started) ctx.stroke();
  ctx.restore();

  // Highlight the symmetry pairs in accent during hold
  if (phase === "hold") {
    ctx.fillStyle = "rgba(122,143,115,1)";
    for (const [l, r] of SYMMETRY_PAIRS) {
      for (const i of [l, r]) {
        const p = lm[i]; if (!p) continue;
        ctx.beginPath(); ctx.arc(px(p), py(p), 3 * dpr, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}

function faceAlignmentFeedback(lm) {
  if (!lm || !lm[1] || !lm[33] || !lm[263]) {
    return { aligned: false, label: "Find your face in the camera", issue: "missing" };
  }
  const nose = lm[1];
  const centerOff = Math.hypot(nose.x - 0.5, nose.y - 0.5);
  const eyeDx = lm[263].x - lm[33].x;
  const eyeDy = lm[263].y - lm[33].y;
  const tiltRad = Math.atan2(eyeDy, eyeDx); // ~0 when level
  const centered = centerOff < FACE_CENTER_MAX_OFFSET;
  const level = Math.abs(tiltRad) < FACE_TILT_MAX_RAD;
  if (centered && level) return { aligned: true, label: "Posture · centered", issue: null, centerOff, tiltRad };
  if (!centered && !level) return { aligned: false, label: "Center and level your face", issue: "center-tilt", centerOff, tiltRad };
  if (!centered) return { aligned: false, label: "Center your face in the ring", issue: "center", centerOff, tiltRad };
  return { aligned: false, label: "Keep your eyes level", issue: "tilt", centerOff, tiltRad };
}

function calibrationPrompt(progress, delta) {
  if (delta > CALIBRATION_RESET_EPS) return "Too much movement. Relax your jaw, stop talking, and hold neutral.";
  if (delta > CALIBRATION_STABILITY_EPS) return "Small movement detected. Keep the same resting expression.";
  if (progress < 8) return "Good. Keep your face soft and neutral.";
  if (progress < CALIBRATION_FRAMES - 6) return "Stay relaxed. Avoid blinking or smiling.";
  return "Almost done. Hold this same neutral pose.";
}

function captureSnapshot(video, canvas, { width = REPORT_SNAPSHOT_WIDTH, quality = REPORT_SNAPSHOT_QUALITY } = {}) {
  if (!video || !canvas || !video.videoWidth) return null;
  const W = Math.min(width, video.videoWidth || width);
  const H = Math.round((video.videoHeight / video.videoWidth) * W);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.save();
  ctx.translate(W, 0); ctx.scale(-1, 1); // mirror to match the on-screen video
  ctx.drawImage(video, 0, 0, W, H);
  ctx.restore();
  try { return canvas.toDataURL("image/jpeg", quality); } catch { return null; }
}

function averageLandmarks(buffer) {
  if (!buffer.length) return null;
  const n = buffer[0].length; const out = [];
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, sz = 0;
    for (const lm of buffer) { sx += lm[i].x; sy += lm[i].y; sz += lm[i].z ?? 0; }
    out.push({ x: sx / buffer.length, y: sy / buffer.length, z: sz / buffer.length });
  }
  return out;
}

const SMOOTHING_ALPHA = 0.65; // EMA factor — higher = more responsive, lower = steadier

function smoothLandmarks(prev, next) {
  if (!prev || prev.length !== next.length) return next.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 }));
  const a = SMOOTHING_ALPHA;
  const out = new Array(next.length);
  for (let i = 0; i < next.length; i++) {
    const p = prev[i], n = next[i];
    out[i] = {
      x: p.x + a * (n.x - p.x),
      y: p.y + a * (n.y - p.y),
      z: (p.z ?? 0) + a * ((n.z ?? 0) - (p.z ?? 0)),
    };
  }
  return out;
}
export {
  BROW_EXERCISES,
  CALIBRATION_DELTA_POINTS,
  CORE_QUALITY_POINTS,
  EXERCISE_BLENDSHAPES,
  NOSE_EXERCISES,
  activationThresholdForExercise,
  averageBlendshapes,
  averageLandmarks,
  baselineProgressLabel,
  bsActivation,
  buildMovementProfile,
  buildPersonalizedDailyPlan,
  calibrationPrompt,
  captureSnapshot,
  compareMovementProfiles,
  computeBaselineProgress,
  computeBaselineProgressFromDisplacements,
  computeBrowSymmetry,
  computeExerciseSymmetry,
  computeNoiseFloor,
  computeNoseSymmetry,
  computePairwiseSymmetry,
  computeSymmetry,
  drawOverlay,
  effectiveProfileThreshold,
  exerciseBaselineQuality,
  faceAlignmentFeedback,
  faceFrameNormalize,
  focusReason,
  formatProfileDate,
  formatProfileSide,
  getAdaptiveFocusItems,
  getProfileExercise,
  latestExerciseProgressById,
  latestExerciseScoreById,
  latestSessionBaselineProgress,
  normalizedFrameDelta,
  objectCoverTransform,
  preferredBaselineProgress,
  profileAgeDays,
  profileBaselineForSide,
  profileExerciseEntries,
  profileQuality,
  profileStatus,
  resolveFocusSide,
  robustMovementWindow,
  roundMetric,
  sessionFocusRecommendation,
  signedPointDelta,
  smoothLandmarks,
  summarizeBaselineProgress,
  summarizeSessionBaselineProgress,
  inferLimitedSide,
};
