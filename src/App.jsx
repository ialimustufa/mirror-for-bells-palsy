import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Home, Sparkles, BookOpen, TrendingUp, Play, Pause, X, ChevronRight, Volume2, VolumeX, Flame, Camera, CameraOff, Check, Heart, Info, ArrowRight, Loader2, Zap, AlertCircle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

// Exercise definitions are the product content layer: the UI, daily plan, and session
// runner all read from this single catalog so copy and timing stay in sync.
const EXERCISES = [
  { id: "eyebrow-raise", name: "Eyebrow Raise", region: "forehead", holdSec: 5, reps: 10, instruction: "Raise both eyebrows as if surprised. Hold gently for 5 seconds, then relax slowly.", tip: "If the affected side won't lift, assist lightly with a finger. Never strain — quality over force.", emoji: "✨" },
  { id: "gentle-frown", name: "Gentle Frown", region: "forehead", holdSec: 4, reps: 8, instruction: "Pull your eyebrows down and inward, as if concentrating. Hold, then relax.", tip: "Watch both brows in the mirror. Aim for symmetric movement, not strength.", emoji: "🌿" },
  { id: "eye-close", name: "Soft Eye Closure", region: "eyes", holdSec: 5, reps: 10, instruction: "Slowly close your eyes — don't squeeze. Hold softly for 5 seconds, then open slowly.", tip: "Forceful blinking can encourage synkinesis. Slow and gentle is the goal.", emoji: "🌙" },
  { id: "wink", name: "Independent Wink", region: "eyes", holdSec: 2, reps: 6, instruction: "Try to close one eye while keeping the other open. Switch sides each rep.", tip: "This builds independent control. It may feel awkward — that's normal early on.", emoji: "👁️" },
  { id: "nose-wrinkle", name: "Nostril Flare", region: "nose", holdSec: 3, reps: 8, instruction: "Flare your nostrils outward, as if taking a deep breath through your nose. Hold gently, then relax.", tip: "If flaring feels stuck, try wrinkling the bridge upward instead — both engage the nasalis muscle group. Keep the rest of your face soft.", emoji: "🍃" },
  { id: "cheek-puff", name: "Cheek Puff", region: "cheeks", holdSec: 5, reps: 8, instruction: "Take a breath, puff air into both cheeks, hold, then move air slowly from one cheek to the other.", tip: "If air leaks from the affected side, hold that lip lightly with a finger to build the seal.", emoji: "🎈" },
  { id: "cheek-suck", name: "Cheek Suck", region: "cheeks", holdSec: 3, reps: 8, instruction: "Suck your cheeks inward against your teeth, like making a 'fish face'. Hold, then release.", tip: "This activates the buccinator muscle — important for chewing and speech.", emoji: "🐟" },
  { id: "closed-smile", name: "Closed Smile", region: "mouth", holdSec: 5, reps: 10, instruction: "Smile with lips closed, lifting both corners of your mouth gently. Hold, then relax.", tip: "This is the cornerstone exercise. Watch both corners rise evenly in the mirror.", emoji: "🌸" },
  { id: "open-smile", name: "Open Smile", region: "mouth", holdSec: 5, reps: 8, instruction: "Smile widely, showing your teeth. Hold for 5 seconds, then relax slowly.", tip: "Only progress to this when closed smile feels symmetric. Don't force a wider smile than the affected side allows.", emoji: "☀️" },
  { id: "pucker", name: "Lip Pucker", region: "mouth", holdSec: 5, reps: 10, instruction: "Purse your lips forward as if blowing a kiss. Hold for 5 seconds, then relax.", tip: "Use the mirror to keep the pucker centered, not pulled toward the stronger side.", emoji: "💐" },
  { id: "lip-press", name: "Lip Press", region: "mouth", holdSec: 4, reps: 8, instruction: "Press your lips firmly but gently together. Hold, then release.", tip: "Builds the orbicularis oris — important for sealing food and clear speech.", emoji: "🌷" },
  { id: "vowel-sounds", name: "Vowel Articulation", region: "mouth", holdSec: 3, reps: 5, instruction: "Slowly and exaggeratedly mouth: A — E — I — O — U. Hold each shape briefly.", tip: "Speak out loud if you can. This integrates retraining into real speech patterns.", emoji: "🎵" },
];

const REGIONS = [{ key: "all", label: "All" }, { key: "forehead", label: "Forehead" }, { key: "eyes", label: "Eyes" }, { key: "nose", label: "Nose" }, { key: "cheeks", label: "Cheeks" }, { key: "mouth", label: "Mouth" }];
const DAILY_ESSENTIALS = ["eyebrow-raise", "eye-close", "nose-wrinkle", "cheek-puff", "closed-smile", "pucker"];
const MOOD_OPTIONS = [{ key: "hopeful", label: "Hopeful", emoji: "🌱" }, { key: "okay", label: "Steady", emoji: "🌤" }, { key: "tired", label: "Tired", emoji: "🌙" }, { key: "frustrated", label: "Frustrated", emoji: "🌧" }];

const STORAGE_KEY = "mirror-app-data";

// Daily cadence: short sessions spread N times across waking hours.
const DAY_START_HOUR = 9;  // 9 AM
const DAY_END_HOUR = 21;   // 9 PM
const INTERSTITIAL_SEC = 10;
const HOLD_SEC = 4;       // fixed across all exercises — score is time-averaged across this window
const REST_SEC = 2;       // "Resting pose" phase: serves as exercise-entry settle AND between-rep recovery

// Persisted app state is intentionally compact and append-only for sessions/journal.
// Derived trend metrics are recomputed in views instead of stored.
const DEFAULT_DATA = { journal: [], sessions: [], prefs: { voiceEnabled: true, mirrorEnabled: true, symmetryEnabled: true, dailyGoal: 3, onboarded: false } };
const todayISO = () => new Date().toISOString().split("T")[0];
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));

// Evenly-spaced session times today (e.g. dailyGoal=5 → 9:00, 12:00, 15:00, 18:00, 21:00).
function todaysSessionSlots(dailyGoal) {
  if (!dailyGoal || dailyGoal <= 0) return [];
  const minutes = (DAY_END_HOUR - DAY_START_HOUR) * 60;
  const step = dailyGoal === 1 ? 0 : minutes / (dailyGoal - 1);
  const slots = [];
  for (let i = 0; i < dailyGoal; i++) {
    const total = DAY_START_HOUR * 60 + step * i;
    const h = Math.floor(total / 60), m = Math.round(total % 60);
    const d = new Date(); d.setHours(h, m, 0, 0);
    slots.push(d);
  }
  return slots;
}

function nextSessionAt(dailyGoal, completedToday) {
  if (completedToday >= dailyGoal) return null;
  const slots = todaysSessionSlots(dailyGoal);
  return slots[completedToday] ?? null;
}

function formatClock(d) {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

const computeStreak = (sessions) => {
  if (!sessions.length) return 0;
  const dates = [...new Set(sessions.map((s) => s.date))].sort().reverse();
  let streak = 0; let cursor = todayISO();
  for (const d of dates) {
    if (d === cursor) { streak++; const prev = new Date(cursor); prev.setDate(prev.getDate() - 1); cursor = prev.toISOString().split("T")[0]; }
    else if (daysBetween(d, cursor) > 0) break;
  }
  return streak;
};

/* MediaPipe Tasks Face Landmarker — 478 landmarks + 52 ARKit-style blendshapes */
const TASKS_VISION_VERSION = "0.10.21";
const TASKS_VISION_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/vision_bundle.mjs`;
const TASKS_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const FACE_LANDMARKER_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

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
};

function bsActivation(bsMap, mapping) {
  if (!bsMap || !mapping) return 0;
  return Math.max(bsMap[mapping.left] ?? 0, bsMap[mapping.right] ?? 0);
}

// Subject-perspective L/R landmark groups. Symmetry is the ratio of the two sides'
// displacement-from-neutral, computed in a head-pose-normalized face frame.
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
  "vowel-sounds":   {
    left:  [61, 84, 91, 78, 95, 88, 178, 40, 17],
    right: [291, 314, 321, 308, 324, 318, 402, 270, 17],
  },
};

// Convert landmarks to a head-pose-normalized frame: origin at nose tip (landmark 1),
// scale = inter-ocular distance (landmarks 33 ↔ 263). Removes head translation/scale.
function faceFrameNormalize(lm) {
  if (!lm || !lm[1] || !lm[33] || !lm[263]) return null;
  const o = lm[1];
  const ex = lm[263].x - lm[33].x, ey = lm[263].y - lm[33].y;
  const scale = Math.hypot(ex, ey);
  if (scale < 0.01) return null;
  const out = new Array(lm.length);
  for (let i = 0; i < lm.length; i++) {
    const p = lm[i]; if (!p) continue;
    out[i] = { x: (p.x - o.x) / scale, y: (p.y - o.y) / scale, z: ((p.z ?? 0) - (o.z ?? 0)) / scale };
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
  let weighted = 0, weight = 0;
  let leftTotal = 0, rightTotal = 0;
  for (const [l, r] of SYMMETRY_PAIRS) {
    if (!current[l] || !current[r] || !neutral[l] || !neutral[r]) continue;
    const lDisp = dist3(current[l], neutral[l]);
    const rDisp = dist3(current[r], neutral[r]);
    leftTotal += lDisp;
    rightTotal += rDisp;
    const total = lDisp + rDisp;
    if (total < 0.003) continue;
    const ratio = Math.min(lDisp, rDisp) / Math.max(lDisp, rDisp);
    weighted += ratio * total; weight += total;
  }
  if (weight < 0.006) return null;
  return { symmetry: weighted / weight, leftDisp: leftTotal, rightDisp: rightTotal };
}

// Brow tracking: more precise than generic landmark-pair displacement because (a) it's
// invariant to head pitch (eye and brow translate together), and (b) it isolates the
// vertical axis where the actual lift/depress signal lives. Measures per-side change in
// brow-to-upper-eyelid vertical gap, in the head-pose-normalized face frame.
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

// Nose tracking: handles BOTH wrinkle/sneer (vertical motion) and nostril flare (horizontal motion).
// Per-side displacement is the magnitude of the nostril-edge centroid's shift from neutral, in
// the head-pose-normalized face frame. Uses mean position (averages out per-point noise) and
// captures whichever axis the user actually moves on — symmetric, sneer, or pure flare.
const NOSE_LANDMARKS = {
  // Nostril rim + ala wing (subject-perspective L/R, matching code convention where left = image-left)
  leftNostril:  [49, 48, 64, 102, 219, 218],
  rightNostril: [279, 278, 294, 331, 439, 438],
};
const NOSE_EXERCISES = new Set(["nose-wrinkle"]);

function avgXY(frame, idxs) {
  let sx = 0, sy = 0, c = 0;
  for (const i of idxs) {
    const p = frame[i]; if (!p) continue;
    sx += p.x; sy += p.y; c++;
  }
  return c ? { x: sx / c, y: sy / c } : null;
}

function computeNoseSymmetry(lm, neutral) {
  if (!lm || !neutral) return null;
  const lmN = faceFrameNormalize(lm), neuN = faceFrameNormalize(neutral);
  if (!lmN || !neuN) return null;
  const lCur = avgXY(lmN, NOSE_LANDMARKS.leftNostril);
  const lNeu = avgXY(neuN, NOSE_LANDMARKS.leftNostril);
  const rCur = avgXY(lmN, NOSE_LANDMARKS.rightNostril);
  const rNeu = avgXY(neuN, NOSE_LANDMARKS.rightNostril);
  if (!lCur || !lNeu || !rCur || !rNeu) return null;
  // Magnitude of centroid shift per side — combines horizontal (flare) and vertical (sneer).
  const lMag = Math.hypot(lCur.x - lNeu.x, lCur.y - lNeu.y);
  const rMag = Math.hypot(rCur.x - rNeu.x, rCur.y - rNeu.y);
  const peak = Math.max(lMag, rMag);
  if (peak < 0.006) return null; // very small motion — nose actions are subtle
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

// Posture: face roughly centered & level. Uses landmark 1 (nose tip) and the eye-line tilt.
function isFaceAligned(lm) {
  if (!lm || !lm[1] || !lm[33] || !lm[263]) return false;
  const nose = lm[1];
  const centerOff = Math.hypot(nose.x - 0.5, nose.y - 0.5);
  const eyeDx = lm[263].x - lm[33].x;
  const eyeDy = lm[263].y - lm[33].y;
  const tiltRad = Math.atan2(eyeDy, eyeDx); // ~0 when level
  return centerOff < 0.12 && Math.abs(tiltRad) < 0.12; // ~7° tilt tolerance
}

function captureSnapshot(video, canvas) {
  if (!video || !canvas || !video.videoWidth) return null;
  const W = 200, H = Math.round((video.videoHeight / video.videoWidth) * W);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.translate(W, 0); ctx.scale(-1, 1); // mirror to match the on-screen video
  ctx.drawImage(video, 0, 0, W, H);
  ctx.restore();
  try { return canvas.toDataURL("image/jpeg", 0.7); } catch { return null; }
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

function useFaceLandmarker(active) {
  const [status, setStatus] = useState("idle");
  const flRef = useRef(null);
  const latestRef = useRef(null); // { landmarks, blendshapes }

  useEffect(() => {
    if (!active || flRef.current) return;
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        const mod = await import(/* @vite-ignore */ TASKS_VISION_URL);
        if (cancelled) return;
        const { FilesetResolver, FaceLandmarker } = mod;
        const fileset = await FilesetResolver.forVisionTasks(TASKS_WASM_BASE);
        if (cancelled) return;
        const fl = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
          outputFaceBlendshapes: true,
          numFaces: 1,
        });
        if (cancelled) { try { fl.close(); } catch { } return; }
        flRef.current = fl;
        setStatus("ready");
      } catch (err) {
        console.warn("[Mirror] FaceLandmarker init failed:", err);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [active]);

  useEffect(() => {
    return () => { try { flRef.current?.close?.(); } catch { } flRef.current = null; };
  }, []);

  return { faceLandmarker: flRef.current, latestRef, status };
}

export default function App() {
  // Top-level orchestration only: global persistence, view routing, and modal/session ownership.
  // Feature views own their local form/filter state.
  const [view, setView] = useState("home");
  const [data, setData] = useState(DEFAULT_DATA);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [exerciseDetail, setExerciseDetail] = useState(null);
  const [viewingReport, setViewingReport] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const stored = await window.storage.get(STORAGE_KEY);
        if (stored?.value) {
          const parsed = JSON.parse(stored.value);
          setData({ ...DEFAULT_DATA, ...parsed, prefs: { ...DEFAULT_DATA.prefs, ...(parsed.prefs ?? {}) } });
          if (!parsed.prefs?.onboarded) setShowOnboarding(true);
        } else { setShowOnboarding(true); }
      } catch { setShowOnboarding(true); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400&family=Manrope:wght@400;500;600;700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => { try { document.head.removeChild(link); } catch { } };
  }, []);

  const persist = useCallback(async (next) => {
    setData(next);
    try { await window.storage.set(STORAGE_KEY, JSON.stringify(next)); } catch (e) { console.error(e); }
  }, []);

  const finishOnboarding = () => { persist({ ...data, prefs: { ...data.prefs, onboarded: true } }); setShowOnboarding(false); };
  const startSession = (ids) => { const exercises = ids.map((id) => EXERCISES.find((e) => e.id === id)).filter(Boolean); setSession({ exercises, startedAt: Date.now() }); };
  const completeSession = (rec) => { persist({ ...data, sessions: [...data.sessions, rec] }); setSession(null); };
  const saveJournal = (entry) => { const filtered = data.journal.filter((j) => j.date !== entry.date); persist({ ...data, journal: [...filtered, entry].sort((a, b) => a.date.localeCompare(b.date)) }); };
  const togglePref = (key) => persist({ ...data, prefs: { ...data.prefs, [key]: !data.prefs[key] } });
  const setPref = (key, value) => persist({ ...data, prefs: { ...data.prefs, [key]: value } });

  const streak = useMemo(() => computeStreak(data.sessions), [data.sessions]);

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#F4EFE6" }}><div className="text-stone-600">Loading…</div></div>;

  return (
    <div className="min-h-screen relative" style={{ background: "#F4EFE6", fontFamily: "Manrope, system-ui, sans-serif", color: "#1F1B16" }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full blur-3xl opacity-30" style={{ background: "#D4A574" }} />
        <div className="absolute top-1/2 -left-32 w-80 h-80 rounded-full blur-3xl opacity-20" style={{ background: "#7A8F73" }} />
      </div>
      <div className="relative max-w-2xl mx-auto px-5 pb-28 pt-8">
        <Header view={view} streak={streak} />
        <main className="mt-8">
          {view === "home" && <HomeView data={data} streak={streak} onStartSession={startSession} onGo={setView} />}
          {view === "practice" && <PracticeView onStartSession={startSession} onShowDetail={setExerciseDetail} />}
          {view === "journal" && <JournalView entries={data.journal} onSave={saveJournal} />}
          {view === "progress" && <ProgressView data={data} streak={streak} prefs={data.prefs} onTogglePref={togglePref} onSetPref={setPref} onOpenReport={setViewingReport} />}
        </main>
      </div>
      <BottomNav view={view} setView={setView} />
      {session && <SessionMode session={session} prefs={data.prefs} sessionsToday={data.sessions.filter((s) => s.date === todayISO()).length} onComplete={completeSession} onCancel={() => setSession(null)} onTogglePref={togglePref} />}
      {exerciseDetail && <ExerciseDetail exercise={exerciseDetail} onClose={() => setExerciseDetail(null)} onStart={(id) => { setExerciseDetail(null); startSession([id]); }} />}
      {showOnboarding && <Onboarding onDone={finishOnboarding} dailyGoal={data.prefs.dailyGoal} onSetDailyGoal={(n) => setPref("dailyGoal", n)} />}
      {viewingReport && <SessionSummary session={viewingReport} onClose={() => setViewingReport(null)} />}
    </div>
  );
}

function Header({ view, streak }) {
  const titles = { home: "Today", practice: "Practice", journal: "Journal", progress: "Progress" };
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#1F1B16" }}>
          <div className="w-4 h-4 rounded-full" style={{ background: "#F4EFE6" }} />
        </div>
        <div>
          <div className="text-lg leading-none" style={{ fontFamily: "Fraunces", fontWeight: 600, letterSpacing: "-0.01em" }}>Mirror</div>
          <div className="text-xs text-stone-500 mt-0.5">{titles[view]}</div>
        </div>
      </div>
      {streak > 0 && <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: "rgba(184, 84, 58, 0.1)", color: "#B8543A" }}><Flame className="w-4 h-4" /><span className="text-sm font-semibold">{streak}</span></div>}
    </header>
  );
}

function HomeView({ data, streak, onStartSession, onGo }) {
  // Home is a derived dashboard: it summarizes today's stored records and maps the
  // configured daily goal into the next practice prompt.
  const todaysSessions = data.sessions.filter((s) => s.date === todayISO());
  const todaysJournal = data.journal.find((j) => j.date === todayISO());
  const dailyGoal = data.prefs.dailyGoal ?? 3;
  const completed = todaysSessions.length;
  const remaining = Math.max(0, dailyGoal - completed);
  const nextSlot = nextSessionAt(dailyGoal, completed);
  const todaysAvgSymmetry = (() => {
    const valid = todaysSessions.map((s) => s.sessionAvg).filter((v) => v != null);
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  })();
  const nextLabel = nextSlot
    ? (nextSlot.getTime() <= Date.now() ? "Now" : formatClock(nextSlot))
    : null;
  const greeting = (() => { const h = new Date().getHours(); if (h < 12) return "Good morning"; if (h < 18) return "Good afternoon"; return "Good evening"; })();

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-stone-500">{greeting}</div>
        <h1 className="text-4xl mt-1 leading-tight" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>
          {streak > 0 ? <><em style={{ fontStyle: "italic", fontWeight: 400 }}>Day {streak}</em> of your practice.</> : "Ready when you are."}
        </h1>
      </div>
      <div className="rounded-3xl p-6 relative overflow-hidden" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
        <div className="absolute -bottom-12 -right-12 w-48 h-48 rounded-full opacity-15" style={{ background: "#D4A574" }} />
        <div className="relative">
          <div className="text-xs uppercase tracking-wider opacity-60 mb-3">Today's progress</div>
          <div className="flex items-center gap-1.5 mb-4">
            {Array.from({ length: dailyGoal }).map((_, i) => {
              const done = i < completed;
              return (
                <div key={i} className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
                  style={{ background: done ? "#B8543A" : "rgba(244,239,230,0.08)", border: done ? "none" : "1px solid rgba(244,239,230,0.2)" }}>
                  {done && <Check className="w-3.5 h-3.5" style={{ color: "#F4EFE6" }} />}
                </div>
              );
            })}
            <div className="ml-2 text-sm opacity-80 tabular-nums">{completed} of {dailyGoal}</div>
          </div>
          <div className="text-2xl mb-1" style={{ fontFamily: "Fraunces", fontWeight: 500 }}>
            {remaining > 0 ? `Session ${completed + 1} of ${dailyGoal}` : "Done for today"}
          </div>
          <div className="text-sm opacity-70 mb-5">
            {remaining > 0
              ? (nextLabel === "Now" ? "Time for your next session" : `Next at ${nextLabel}`)
              : "Beautifully done. Rest and return tomorrow."}
          </div>
          <button onClick={() => onStartSession(DAILY_ESSENTIALS)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>
            <Play className="w-4 h-4 fill-current" />{remaining > 0 ? "Start session" : "Practice again"}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Streak" value={streak} unit={streak === 1 ? "day" : "days"} />
        <StatCard label="Today's symmetry" value={todaysAvgSymmetry != null ? `${displayPct(todaysAvgSymmetry)}` : "—"} unit={todaysAvgSymmetry != null ? "%" : "no data"} />
        <StatCard label="Self-rated" value={todaysJournal ? `${todaysJournal.symmetry}` : "—"} unit={todaysJournal ? "/ 10" : "log"} />
      </div>
      <div className="rounded-2xl p-5" style={{ background: "rgba(122, 143, 115, 0.12)", border: "1px solid rgba(122, 143, 115, 0.2)" }}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "#7A8F73", color: "#F4EFE6" }}><Heart className="w-4 h-4" /></div>
          <div>
            <div className="text-sm mb-1" style={{ fontFamily: "Fraunces", fontWeight: 600 }}>Gentle reminder</div>
            <p className="text-sm text-stone-700 leading-relaxed">Quality over force. Slow, controlled movement in front of the mirror is what teaches your nerves to fire symmetrically — not repetitions or strain.</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SecondaryButton onClick={() => onGo("practice")}>Browse exercises<ArrowRight className="w-4 h-4" /></SecondaryButton>
        <SecondaryButton onClick={() => onGo("journal")}>{todaysJournal ? "Update journal" : "Log today"}<ArrowRight className="w-4 h-4" /></SecondaryButton>
      </div>
    </div>
  );
}

function StatCard({ label, value, unit }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
      <div className="text-xs text-stone-500 mb-1">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>{value}</span>
        <span className="text-xs text-stone-500">{unit}</span>
      </div>
    </div>
  );
}

function SecondaryButton({ children, onClick }) {
  return <button onClick={onClick} className="rounded-2xl p-4 text-left text-sm font-medium flex items-center justify-between transition hover:bg-white" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>{children}</button>;
}

function PracticeView({ onStartSession, onShowDetail }) {
  // Library state stays local until the user starts a session, keeping custom routines
  // ephemeral and avoiding partial selections in persisted recovery data.
  const [region, setRegion] = useState("all");
  const [selected, setSelected] = useState(new Set());
  const filtered = region === "all" ? EXERCISES : EXERCISES.filter((e) => e.region === region);
  const toggle = (id) => { const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); setSelected(next); };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-3xl" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>Practice library</h2>
        <p className="text-sm text-stone-600 mt-1">Tap an exercise to see details. Select multiple to build a custom session.</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {REGIONS.map((r) => (
          <button key={r.key} onClick={() => setRegion(r.key)} className="px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap" style={{ background: region === r.key ? "#1F1B16" : "rgba(255,255,255,0.6)", color: region === r.key ? "#F4EFE6" : "#1F1B16", border: region === r.key ? "none" : "1px solid rgba(31, 27, 22, 0.08)" }}>{r.label}</button>
        ))}
      </div>
      <div className="space-y-2.5">
        {filtered.map((ex) => <ExerciseRow key={ex.id} exercise={ex} selected={selected.has(ex.id)} onToggle={() => toggle(ex.id)} onShow={() => onShowDetail(ex)} />)}
      </div>
      {selected.size > 0 && (
        <div className="fixed bottom-24 left-0 right-0 px-5 z-30">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => onStartSession([...selected])} className="w-full rounded-full py-3.5 px-6 flex items-center justify-center gap-2 font-semibold shadow-lg" style={{ background: "#B8543A", color: "#F4EFE6" }}>
              <Play className="w-4 h-4 fill-current" />Start with {selected.size} exercise{selected.size > 1 ? "s" : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExerciseRow({ exercise, selected, onToggle, onShow }) {
  return (
    <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: selected ? "rgba(184, 84, 58, 0.08)" : "rgba(255,255,255,0.5)", border: selected ? "1px solid rgba(184, 84, 58, 0.3)" : "1px solid rgba(31, 27, 22, 0.06)" }}>
      <button onClick={onToggle} className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: selected ? "#B8543A" : "transparent", border: selected ? "none" : "1.5px solid rgba(31, 27, 22, 0.2)" }} aria-label={selected ? "Deselect" : "Select"}>
        {selected && <Check className="w-3.5 h-3.5 text-white" />}
      </button>
      <button onClick={onShow} className="flex-1 flex items-center gap-3 text-left">
        <div className="text-2xl">{exercise.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] truncate">{exercise.name}</div>
          <div className="text-xs text-stone-500 mt-0.5">{exercise.reps} reps · {exercise.holdSec}s hold · <span className="capitalize">{exercise.region}</span></div>
        </div>
        <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
      </button>
    </div>
  );
}

function ExerciseDetail({ exercise, onClose, onStart }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(31, 27, 22, 0.5)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl p-6 relative" style={{ background: "#F4EFE6" }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(31, 27, 22, 0.06)" }} aria-label="Close"><X className="w-4 h-4" /></button>
        <div className="text-5xl mb-3">{exercise.emoji}</div>
        <h3 className="text-2xl mb-1" style={{ fontFamily: "Fraunces", fontWeight: 600 }}>{exercise.name}</h3>
        <div className="text-xs text-stone-500 mb-5 capitalize">{exercise.region} · {exercise.reps} reps · {exercise.holdSec}s hold</div>
        <div className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-stone-500 mb-1.5">How to do it</div>
            <p className="text-[15px] leading-relaxed text-stone-800">{exercise.instruction}</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: "rgba(122, 143, 115, 0.12)" }}>
            <div className="flex items-start gap-2"><Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#5C7055" }} /><p className="text-sm text-stone-700 leading-relaxed">{exercise.tip}</p></div>
          </div>
        </div>
        <button onClick={() => onStart(exercise.id)} className="mt-6 w-full rounded-full py-3 flex items-center justify-center gap-2 font-semibold" style={{ background: "#1F1B16", color: "#F4EFE6" }}><Play className="w-4 h-4 fill-current" />Practice this one</button>
      </div>
    </div>
  );
}

function SessionMode({ session, prefs, sessionsToday, onComplete, onCancel, onTogglePref }) {
  // Phases: rest (2s entry) → hold (4s) → rest (2s) → hold → ... → interstitial (10s) → next exercise → ... → summary
  // The single `rest` phase plays double-duty as exercise-entry settle AND between-rep recovery.
  const [phase, setPhase] = useState("rest");
  const [exIdx, setExIdx] = useState(0);
  const [repIdx, setRepIdx] = useState(0);
  // Initialized to REST_SEC because the session opens directly into the entry rest — if this
  // were 0, the advance effect would short-circuit out of rest before phase-mount could update it.
  const [secondsLeft, setSecondsLeft] = useState(REST_SEC);
  const [paused, setPaused] = useState(false);
  // Distinguishes the entry rest (no preceding hold) from the post-hold rest. Reset to true
  // on each exercise change.
  const restIsEntryRef = useRef(true);

  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const snapshotCanvasRef = useRef(null);

  const symEnabled = prefs.symmetryEnabled && prefs.mirrorEnabled;
  const { faceLandmarker, latestRef, status: trackerStatus } = useFaceLandmarker(symEnabled);

  const calibBufferRef = useRef([]);
  const neutralRef = useRef(null);
  const noiseRef = useRef(null);
  const peakRepScoreRef = useRef(null);
  const [liveScore, setLiveScore] = useState(null);
  const [liveBalance, setLiveBalance] = useState(null);
  const [postureAligned, setPostureAligned] = useState(false);
  const [exerciseScores, setExerciseScores] = useState([]);
  const repScoresRef = useRef([]);
  const repSnapshotsRef = useRef([]);
  const peakSnapshotRef = useRef(null);
  const peakDispRef = useRef(0);
  // Hold-window score accumulator: rep score = mean(symmetry across all valid frames during hold).
  // Honors sustained effort better than instantaneous peak, esp. on the affected side.
  const holdScoreSumRef = useRef(0);
  const holdScoreCountRef = useRef(0);

  const startTimeRef = useRef(Date.now());
  const current = session.exercises[exIdx];
  const nextExercise = session.exercises[exIdx + 1] ?? null;
  const totalExercises = session.exercises.length;

  useEffect(() => {
    if (!prefs.mirrorEnabled) {
      if (stream) { stream.getTracks().forEach((t) => t.stop()); setStream(null); }
      return;
    }
    let active = true;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((s) => { if (!active) { s.getTracks().forEach((t) => t.stop()); return; } setStream(s); if (videoRef.current) videoRef.current.srcObject = s; })
      .catch((err) => setCameraError(err.message || "Camera unavailable"));
    return () => { active = false; };
  }, [prefs.mirrorEnabled]);

  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream, exIdx]);

  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  // Phase entry: set the timer and announce the phase.
  // Calibration (neutral baseline + per-landmark noise) piggybacks on the entry rest of the first exercise.
  useEffect(() => {
    if (paused) return;
    if (phase === "hold") {
      peakRepScoreRef.current = null;
      peakSnapshotRef.current = null;
      peakDispRef.current = 0;
      holdScoreSumRef.current = 0;
      holdScoreCountRef.current = 0;
      setLiveScore(null);
      setLiveBalance(null);
      speak(prefs.voiceEnabled, "Hold");
    } else if (phase === "rest") {
      if (restIsEntryRef.current) {
        // Entry rest: settle into resting pose. For the very first exercise/rep, this is also
        // the calibration window — we sample the buffer in the detection loop below.
        if (exIdx === 0 && repIdx === 0) calibBufferRef.current = [];
        speak(prefs.voiceEnabled, repIdx === 0 && exIdx === 0
          ? current.name + ". Resting pose. Stay relaxed."
          : current.name + ". Resting pose.");
      } else {
        // Post-hold rest: record this rep using the TIME-AVERAGED hold score; snapshot at peak movement.
        const avgScore = holdScoreCountRef.current > 0 ? holdScoreSumRef.current / holdScoreCountRef.current : null;
        if (avgScore != null) repScoresRef.current = [...repScoresRef.current, avgScore];
        const snap = peakSnapshotRef.current ?? captureSnapshot(videoRef.current, snapshotCanvasRef.current);
        if (snap) repSnapshotsRef.current = [...repSnapshotsRef.current, { ts: Date.now(), score: avgScore, dataUrl: snap }];
        speak(prefs.voiceEnabled, "Resting pose");
      }
    } else if (phase === "interstitial") {
      speak(prefs.voiceEnabled, "Nice work. Take a breath.");
    }
  }, [phase, exIdx, repIdx]);

  useEffect(() => {
    if (paused || phase === "summary") return;
    if (secondsLeft <= 0) {
      // Each branch sets BOTH the new phase and the new timer in one batch — otherwise the advance
      // effect would re-fire with stale secondsLeft = 0 and skip past the just-entered phase.
      if (phase === "hold") {
        setPhase("rest");
        setSecondsLeft(REST_SEC);
      } else if (phase === "rest") {
        if (restIsEntryRef.current) {
          // Entry rest just finished — for first exercise/rep, lock the neutral baseline + per-landmark
          // noise floor before entering hold.
          if (exIdx === 0 && repIdx === 0 && symEnabled && !neutralRef.current && calibBufferRef.current.length > 0) {
            neutralRef.current = averageLandmarks(calibBufferRef.current);
            noiseRef.current = computeNoiseFloor(calibBufferRef.current, neutralRef.current);
          }
          restIsEntryRef.current = false;
          setPhase("hold");
          setSecondsLeft(HOLD_SEC);
        } else if (repIdx + 1 < current.reps) {
          setRepIdx(repIdx + 1);
          setPhase("hold");
          setSecondsLeft(HOLD_SEC);
        } else {
          // End of exercise — finalize per-exercise scores
          const scores = repScoresRef.current;
          const snapshots = repSnapshotsRef.current;
          const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
          setExerciseScores((prev) => [...prev, { exerciseId: current.id, name: current.name, emoji: current.emoji, scores, avg, snapshots }]);
          repScoresRef.current = [];
          repSnapshotsRef.current = [];
          if (exIdx + 1 < totalExercises) {
            setPhase("interstitial");
            setSecondsLeft(INTERSTITIAL_SEC);
          } else {
            speak(prefs.voiceEnabled, "Session complete. Well done.");
            setPhase("summary");
          }
        }
      } else if (phase === "interstitial") {
        setExIdx(exIdx + 1);
        setRepIdx(0);
        restIsEntryRef.current = true; // next exercise starts with an entry rest
        setPhase("rest");
        setSecondsLeft(REST_SEC);
      }
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, paused, phase]);

  // FaceLandmarker detection + overlay loop — synchronous detectForVideo, runs continuously so the overlay stays live
  useEffect(() => {
    if (!faceLandmarker || !videoRef.current) return;
    const lmPairs = EXERCISE_LANDMARK_PAIRS[current.id] ?? null;
    const bsMapping = EXERCISE_BLENDSHAPES[current.id] ?? null;
    const isBrow = BROW_EXERCISES.has(current.id);
    const isNose = NOSE_EXERCISES.has(current.id);

    let raf, alive = true, lastTs = 0;
    const tick = () => {
      if (!alive) return;
      const v = videoRef.current;
      if (!v || v.readyState < 2 || v.paused) { raf = requestAnimationFrame(tick); return; }
      try {
        const ts = Math.max(lastTs + 1, performance.now());
        lastTs = ts;
        const taskResult = faceLandmarker.detectForVideo(v, ts);
        const rawLm = taskResult.faceLandmarks?.[0];
        const bsArr = taskResult.faceBlendshapes?.[0]?.categories;

        if (rawLm) {
          const prevLm = latestRef.current?.landmarks;
          const lm = smoothLandmarks(prevLm, rawLm);
          const bsMap = {};
          if (bsArr) for (const c of bsArr) bsMap[c.categoryName] = c.score;
          latestRef.current = { landmarks: lm, blendshapes: bsMap };

          if (phase === "rest" && restIsEntryRef.current && exIdx === 0 && repIdx === 0 && !neutralRef.current) {
            // Quietly capture neutral-baseline samples during the entry-rest of the first exercise.
            if (calibBufferRef.current.length < 30) calibBufferRef.current.push(lm);
          } else if (phase === "hold") {
            if (!neutralRef.current) neutralRef.current = lm;
            // Brow exercises: pitch-invariant brow-to-eye gap delta.
            // Nose exercises: per-side nostril-edge centroid displacement (handles both wrinkle and flare).
            // Other exercises: head-pose-normalized landmark-pair displacement with per-landmark noise
            // subtracted out. Fallback: generic 9-pair.
            const browResult = isBrow ? computeBrowSymmetry(lm, neutralRef.current) : null;
            const noseResult = isNose ? computeNoseSymmetry(lm, neutralRef.current) : null;
            const pwResult = browResult ?? noseResult ?? computePairwiseSymmetry(lm, neutralRef.current, lmPairs, noiseRef.current);
            const symResult = pwResult ?? computeSymmetry(lm, neutralRef.current);
            if (symResult != null) {
              setLiveScore(symResult.symmetry);
              setLiveBalance({ left: symResult.leftDisp, right: symResult.rightDisp });
              // Time-average accumulator — every valid frame contributes equally to the rep score
              holdScoreSumRef.current += symResult.symmetry;
              holdScoreCountRef.current++;
              if (peakRepScoreRef.current == null || symResult.symmetry > peakRepScoreRef.current) {
                peakRepScoreRef.current = symResult.symmetry;
              }
            }
            // Auto-advance gate AND snapshot trigger. For brow exercises, the brow-lift magnitude is more
            // precise than the blendshape (subtle lifts saturate browOuterUp poorly).
            let activation;
            if (isBrow && browResult) activation = browResult.peak;
            else if (bsMapping)       activation = bsActivation(bsMap, bsMapping);
            else                      activation = symResult ? symResult.peak : 0;
            if (activation > peakDispRef.current) {
              peakDispRef.current = activation;
              // Capture snapshot at peak movement, not peak score — score can be misleading on asymmetric faces
              peakSnapshotRef.current = captureSnapshot(v, snapshotCanvasRef.current);
            }
            // Hold runs for the full holdSec timer — no auto-advance on detected release.
            // We still track peak for snapshot capture, just don't end the phase early.
          }

          const aligned = isFaceAligned(lm);
          setPostureAligned((prev) => (prev === aligned ? prev : aligned));
          drawOverlay(overlayRef.current, v, lm, { aligned, phase });
        } else {
          latestRef.current = null;
          drawOverlay(overlayRef.current, v, null, { aligned: false, phase });
        }
      } catch { }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [faceLandmarker, phase, current.id]);

  const handleSkipExercise = () => {
    flushSpeech();
    const scores = repScoresRef.current;
    const snapshots = repSnapshotsRef.current;
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    setExerciseScores((prev) => [...prev, { exerciseId: current.id, name: current.name, emoji: current.emoji, scores, avg, snapshots }]);
    repScoresRef.current = [];
    repSnapshotsRef.current = [];
    if (exIdx + 1 < totalExercises) { setExIdx(exIdx + 1); setRepIdx(0); restIsEntryRef.current = true; setPhase("rest"); setSecondsLeft(REST_SEC); }
    else setPhase("summary");
  };

  const skipInterstitial = () => { flushSpeech(); setSecondsLeft(0); };

  const handleFinish = () => {
    const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
    const validAvgs = exerciseScores.map((e) => e.avg).filter((v) => v != null);
    const sessionAvg = validAvgs.length > 0 ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length : null;
    onComplete({ date: todayISO(), duration, exercises: exerciseScores.map((e) => e.exerciseId), scores: exerciseScores, sessionAvg, ts: Date.now() });
  };

  if (phase === "summary") return <SessionSummary scores={exerciseScores} sessionsToday={sessionsToday} dailyGoal={prefs.dailyGoal ?? 3} onFinish={handleFinish} />;
  if (phase === "interstitial") {
    return (
      <InterstitialView
        just={exerciseScores[exerciseScores.length - 1]}
        nextExercise={nextExercise}
        secondsLeft={secondsLeft}
        exIdx={exIdx + 1}
        totalExercises={totalExercises}
        onSkip={skipInterstitial}
        onCancel={onCancel}
      />
    );
  }

  const phaseTone = {
    hold: { tag: "HOLD THE POSE", title: current.name, prompt: current.instruction, color: "#B8543A", verb: "contract" },
    rest: { tag: "RESTING POSE",  title: current.name, prompt: current.instruction, color: "#7A8F73", verb: "rest" },
  }[phase];

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
      <div className="flex items-center justify-between p-4 shrink-0">
        <button onClick={onCancel} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(244, 239, 230, 0.1)" }} aria-label="End"><X className="w-5 h-5" /></button>
        <div className="text-xs opacity-70">Exercise {exIdx + 1} of {totalExercises}</div>
        <div className="flex gap-2">
          <button onClick={() => onTogglePref("voiceEnabled")} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(244, 239, 230, 0.1)" }} aria-label="Toggle voice">{prefs.voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}</button>
          <button onClick={() => onTogglePref("mirrorEnabled")} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(244, 239, 230, 0.1)" }} aria-label="Toggle mirror">{prefs.mirrorEnabled ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}</button>
        </div>
      </div>

      {symEnabled && (
        <div className="px-4 pb-2 shrink-0">
          <TrackerStatusPill status={trackerStatus} liveScore={liveScore} phase={phase} />
        </div>
      )}

      <div className="flex-1 relative overflow-hidden">
        {prefs.mirrorEnabled && !cameraError ? (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
            <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            <canvas ref={snapshotCanvasRef} style={{ display: "none" }} />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center opacity-60 px-6"><CameraOff className="w-10 h-10 mx-auto mb-3" /><div className="text-sm">{cameraError ?? "Mirror off"}</div></div>
          </div>
        )}

        {prefs.mirrorEnabled && !cameraError && trackerStatus === "ready" && (
          <div className="absolute top-4 left-4 px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ background: postureAligned ? "rgba(122,143,115,0.85)" : "rgba(212,165,116,0.85)", color: "#1F1B16" }}>
            {postureAligned ? "Posture · centered" : "Center your face in the ring"}
          </div>
        )}

        {phase === "hold" && liveScore != null && (
          <div className="absolute top-4 right-4"><RealtimeFeedback symmetry={liveScore} balance={liveBalance} /></div>
        )}


        {(phase === "hold" || phase === "rest") && (
          <div className="absolute inset-x-0 top-0 h-1.5 transition-colors duration-300" style={{ background: phaseTone.color }} />
        )}

        <div className="absolute inset-0 flex flex-col justify-end pointer-events-none">
          <div className="p-6 pb-4" style={{ background: "linear-gradient(to top, rgba(31,27,22,0.95) 0%, rgba(31,27,22,0.7) 60%, transparent 100%)" }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full" style={{ background: phaseTone.color, color: "#1F1B16" }}>
                {phaseTone.tag}
              </div>
              <div className="text-xs opacity-70">Rep {repIdx + 1} / {current.reps}</div>
            </div>
            <div className="text-5xl mb-1" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>
              {phaseTone.title}
            </div>
            <div className="text-7xl tabular-nums transition-colors duration-300" style={{ fontFamily: "Fraunces", fontWeight: 600, color: phaseTone.color }}>
              {secondsLeft || "·"}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 shrink-0" style={{ borderTop: phase === "hold" || phase === "rest" ? `2px solid ${phaseTone.color}` : "2px solid transparent", transition: "border-color 300ms" }}>
        <div className="text-sm mb-4 leading-relaxed min-h-[2.5em]" style={{ color: phase === "rest" || phase === "hold" ? phaseTone.color : "rgba(244,239,230,0.8)" }}>
          {phaseTone.prompt}
        </div>
        <div className="flex gap-3">
          <button onClick={() => { setPaused((p) => { if (!p) flushSpeech(); return !p; }); }} className="flex-1 rounded-full py-3 flex items-center justify-center gap-2 font-semibold" style={{ background: "rgba(244, 239, 230, 0.15)", color: "#F4EFE6" }}>
            {paused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}{paused ? "Resume" : "Pause"}
          </button>
          <button onClick={handleSkipExercise} className="flex-1 rounded-full py-3 flex items-center justify-center gap-2 font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>Skip<ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}

function TrackerStatusPill({ status, liveScore, phase }) {
  let icon, label, color;
  if (status === "loading") { icon = <Loader2 className="w-3 h-3 animate-spin" />; label = "Loading symmetry tracker…"; color = "#D4A574"; }
  else if (status === "error") { icon = <AlertCircle className="w-3 h-3" />; label = "Tracker unavailable — session continues without scoring"; color = "#A8A29E"; }
  else if (status === "ready" && phase === "hold") {
    icon = <div className="w-2 h-2 rounded-full" style={{ background: "#7A8F73", boxShadow: "0 0 8px #7A8F73" }} />;
    label = liveScore != null ? "Tracking" : "Tracking · waiting for movement";
    color = "#7A8F73";
  }
  else if (status === "ready") { icon = <div className="w-2 h-2 rounded-full" style={{ background: "#7A8F73" }} />; label = "Tracker ready"; color = "#7A8F73"; }
  else { icon = <Loader2 className="w-3 h-3 animate-spin" />; label = "Initializing…"; color = "#D4A574"; }

  return (
    <div className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-full text-xs" style={{ background: "rgba(244, 239, 230, 0.08)", color, border: `1px solid ${color}40` }}>
      {icon}<span>{label}</span>
    </div>
  );
}

function displayPct(raw) {
  if (raw == null) return null;
  return Math.round(Math.max(0, Math.min(1, raw)) * 100);
}
function scoreColor(v) { if (v == null) return "#A8A29E"; if (v >= 0.8) return "#7A8F73"; if (v >= 0.6) return "#D4A574"; return "#B8543A"; }

function RealtimeFeedback({ symmetry, balance }) {
  if (symmetry == null) return null;
  const pct = displayPct(symmetry);
  const color = scoreColor(symmetry);
  const left = balance?.left ?? 0;
  const right = balance?.right ?? 0;
  const max = Math.max(left, right, 0.0001); // avoid div/0
  const leftFrac = Math.min(left / max, 1);
  const rightFrac = Math.min(right / max, 1);
  // Which side is lagging — if the difference is meaningful
  const diff = Math.abs(left - right) / max;
  const lagging = diff > 0.15 ? (left < right ? "L" : "R") : null;

  return (
    <div className="px-3 py-2.5 rounded-2xl"
      style={{
        background: "rgba(31, 27, 22, 0.65)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: `1px solid ${color}`,
        minWidth: 140,
      }}>
      <div className="text-center">
        <div className="text-3xl tabular-nums leading-none" style={{ fontFamily: "Fraunces", fontWeight: 600, color, letterSpacing: "-0.02em" }}>{pct}%</div>
        <div className="text-[9px] uppercase tracking-wider mt-0.5" style={{ color: "#F4EFE6", opacity: 0.6 }}>symmetry</div>
      </div>
      <div className="mt-2.5 space-y-1.5">
        <BalanceBar label="L" frac={leftFrac} highlight={lagging === "L"} color={color} />
        <BalanceBar label="R" frac={rightFrac} highlight={lagging === "R"} color={color} />
      </div>
      <div className="text-[9px] mt-1.5 text-center h-3" style={{ color: "#F4EFE6", opacity: lagging ? 0.75 : 0 }}>
        {lagging === "L" ? "← lagging" : lagging === "R" ? "lagging →" : ""}
      </div>
    </div>
  );
}

function BalanceBar({ label, frac, highlight, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="text-[10px] font-semibold w-3 text-center" style={{ color: "#F4EFE6", opacity: highlight ? 1 : 0.7 }}>{label}</div>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(244, 239, 230, 0.15)" }}>
        <div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: highlight ? color : "#F4EFE6", transition: "width 150ms ease-out, background 200ms" }} />
      </div>
    </div>
  );
}

function SymmetryBadge({ value }) {
  const pct = displayPct(value);
  const color = scoreColor(value);
  return (
    <div className="px-3 py-2 rounded-2xl flex items-center gap-2" style={{ background: "rgba(31, 27, 22, 0.6)", backdropFilter: "blur(8px)", border: `1px solid ${color}` }}>
      <div className="w-2 h-2 rounded-full" style={{ background: color }} />
      <div className="text-right">
        <div className="text-lg leading-none tabular-nums" style={{ fontFamily: "Fraunces", fontWeight: 600, color }}>{pct}%</div>
        <div className="text-[9px] uppercase tracking-wider opacity-60 mt-0.5">symmetry</div>
      </div>
    </div>
  );
}



function speak(enabled, text) {
  if (!enabled || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92;
    u.pitch = 1.0;
    u.volume = 1.0;
    window.speechSynthesis.speak(u);
  } catch { }
}

function flushSpeech() {
  try { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); } catch { }
}

function InterstitialView({ just, nextExercise, secondsLeft, exIdx, totalExercises, onSkip, onCancel }) {
  if (!just) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
      <div className="flex items-center justify-between p-4 shrink-0">
        <button onClick={onCancel} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(244, 239, 230, 0.1)" }} aria-label="End"><X className="w-5 h-5" /></button>
        <div className="text-xs opacity-70">Exercise {exIdx} of {totalExercises} complete</div>
        <div className="w-10" />
      </div>
      <div className="flex-1 overflow-y-auto px-6 pb-2">
        <div className="text-center mb-5">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-2">Just done</div>
          <div className="text-4xl mb-1">{just.emoji}</div>
          <div className="text-xl mb-2" style={{ fontFamily: "Fraunces", fontWeight: 500 }}>{just.name}</div>
          {just.avg != null && (
            <div className="text-5xl tabular-nums" style={{ fontFamily: "Fraunces", fontWeight: 600, color: scoreColor(just.avg), letterSpacing: "-0.02em" }}>{displayPct(just.avg)}%</div>
          )}
          {just.avg != null && <div className="text-xs opacity-60 mt-1">avg symmetry</div>}
        </div>
        {just.snapshots?.length > 0 && (
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1 px-2 justify-center" style={{ scrollbarWidth: "thin" }}>
            {just.snapshots.map((snap, i) => (
              <div key={i} className="shrink-0 rounded-lg overflow-hidden relative" style={{ border: `2px solid ${scoreColor(snap.score)}`, animation: `fadeInRep 0.35s ease-out ${i * 0.08}s both` }}>
                <img src={snap.dataUrl} alt="" style={{ width: 56, height: 80, objectFit: "cover", display: "block" }} />
                <div className="absolute bottom-0 inset-x-0 text-[9px] tabular-nums text-center py-0.5" style={{ background: "rgba(31,27,22,0.7)", color: "#F4EFE6" }}>
                  {snap.score != null ? displayPct(snap.score) + "%" : `#${i + 1}`}
                </div>
              </div>
            ))}
          </div>
        )}
        {nextExercise && (
          <div className="text-center pt-2 border-t" style={{ borderColor: "rgba(244,239,230,0.08)" }}>
            <div className="text-xs uppercase tracking-widest opacity-60 mb-3 mt-4">Up next</div>
            <div className="text-3xl mb-1">{nextExercise.emoji}</div>
            <div className="text-base" style={{ fontFamily: "Fraunces", fontWeight: 500 }}>{nextExercise.name}</div>
            <div className="text-xs opacity-60 mt-1">{nextExercise.reps} reps · {nextExercise.holdSec}s hold</div>
          </div>
        )}
      </div>
      <div className="p-4 shrink-0 flex items-center gap-3" style={{ borderTop: "1px solid rgba(244,239,230,0.08)" }}>
        <div className="flex-1">
          <div className="text-5xl tabular-nums leading-none" style={{ fontFamily: "Fraunces", fontWeight: 600, color: "#D4A574" }}>{secondsLeft || "·"}</div>
          <div className="text-[10px] opacity-60 uppercase tracking-wider mt-0.5">break</div>
        </div>
        <button onClick={onSkip} className="rounded-full px-6 py-3 font-semibold flex items-center gap-2" style={{ background: "#B8543A", color: "#F4EFE6" }}>
          Skip<ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <style>{`@keyframes fadeInRep { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

function formatSessionDate(s) {
  const today = todayISO();
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  const yISO = yest.toISOString().split("T")[0];
  const time = s.ts ? formatClock(new Date(s.ts)) : "";
  if (s.date === today) return `Today${time ? ` · ${time}` : ""}`;
  if (s.date === yISO) return `Yesterday${time ? ` · ${time}` : ""}`;
  const d = new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${d}${time ? ` · ${time}` : ""}`;
}

function formatDuration(secs) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60), r = secs % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

// Dual-mode: live mode receives `scores` (in-progress array) + `onFinish`; view mode
// receives a saved `session` record + `onClose`. Both render the same comprehensive report.
function SessionSummary({ scores, sessionsToday, dailyGoal, onFinish, session, onClose }) {
  const isView = !!session;
  const scoresArr = isView ? (session.scores || []) : scores;
  const overall = isView
    ? session.sessionAvg
    : (() => {
        const valid = scoresArr.map((e) => e.avg).filter((v) => v != null);
        return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
      })();
  const overallPct = displayPct(overall);
  const [timelapse, setTimelapse] = useState(null); // { exerciseIdx, startIdx }
  const sessionN = (sessionsToday ?? 0) + 1;
  const goal = dailyGoal ?? 3;
  const remainingAfter = Math.max(0, goal - sessionN);
  const nextSlot = remainingAfter > 0 ? nextSessionAt(goal, sessionN) : null;
  const message = (() => {
    if (overall == null) return isView ? "Session recorded." : "Session done. Nicely steady work.";
    if (overall >= 0.85) return "Beautifully even today.";
    if (overall >= 0.7) return "Strong symmetric work.";
    if (overall >= 0.55) return "Good practice — the affected side is engaging.";
    return "Every session helps. Keep showing up.";
  })();

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
      <div className="max-w-md mx-auto w-full px-6 py-10 flex-1 flex flex-col">
        {isView && (
          <button onClick={onClose} className="self-start mb-4 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(244, 239, 230, 0.1)" }} aria-label="Close report"><X className="w-5 h-5" /></button>
        )}
        <div className="text-center mb-8">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-2">{isView ? formatSessionDate(session) : "Session complete"}</div>
          <h2 className="text-3xl mb-3" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>
            <em style={{ fontStyle: "italic", fontWeight: 400 }}>{message}</em>
          </h2>
          {!isView && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(244,239,230,0.08)" }}>
              <span className="opacity-80">Session <span className="font-semibold" style={{ color: "#F4EFE6" }}>{sessionN}</span> of {goal} today</span>
              {nextSlot && <span className="opacity-60">· next at {formatClock(nextSlot)}</span>}
              {remainingAfter === 0 && <span className="opacity-60">· done for the day</span>}
            </div>
          )}
          {isView && session.duration != null && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(244,239,230,0.08)" }}>
              <span className="opacity-80">{scoresArr.length} exercise{scoresArr.length !== 1 ? "s" : ""} · {formatDuration(session.duration)}</span>
            </div>
          )}
        </div>
        {overallPct != null && (
          <div className="text-center mb-8">
            <div className="text-7xl tabular-nums" style={{ fontFamily: "Fraunces", fontWeight: 600, color: scoreColor(overall), letterSpacing: "-0.03em" }}>{overallPct}%</div>
            <div className="text-sm opacity-70 mt-1">average symmetry</div>
          </div>
        )}
        <div className="space-y-3 mb-8">
          <div className="text-xs uppercase tracking-wider opacity-60 mb-2">By exercise</div>
          {scoresArr.map((s, exIdx) => (
            <div key={s.exerciseId} className="rounded-2xl p-4" style={{ background: "rgba(244, 239, 230, 0.06)" }}>
              <div className="flex items-center gap-3">
                <div className="text-xl">{s.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-xs opacity-60 mt-0.5">{s.scores.length} rep{s.scores.length !== 1 ? "s" : ""} scored{s.snapshots?.length ? ` · ${s.snapshots.length} shot${s.snapshots.length !== 1 ? "s" : ""}` : ""}</div>
                </div>
                {s.avg != null ? <div className="text-xl tabular-nums" style={{ fontFamily: "Fraunces", fontWeight: 600, color: scoreColor(s.avg) }}>{displayPct(s.avg)}%</div> : <div className="text-xs opacity-50">—</div>}
              </div>
              {s.snapshots?.length > 0 && (
                <div className="flex gap-2 mt-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
                  {s.snapshots.map((snap, i) => (
                    <button key={i} onClick={() => setTimelapse({ exerciseIdx: exIdx, startIdx: i })} className="shrink-0 rounded-lg overflow-hidden relative" style={{ border: `2px solid ${scoreColor(snap.score)}` }} aria-label={`Rep ${i + 1}`}>
                      <img src={snap.dataUrl} alt="" style={{ width: 56, height: 80, objectFit: "cover", display: "block" }} />
                      <div className="absolute bottom-0 inset-x-0 text-[9px] tabular-nums text-center py-0.5" style={{ background: "rgba(31,27,22,0.7)", color: "#F4EFE6" }}>
                        {snap.score != null ? displayPct(snap.score) + "%" : `#${i + 1}`}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {timelapse && (
          <TimelapseModal exercise={scoresArr[timelapse.exerciseIdx]} startIdx={timelapse.startIdx} onClose={() => setTimelapse(null)} />
        )}
        <div className="text-xs opacity-60 leading-relaxed mb-6 px-2 text-center">Symmetry is auto-detected from facial landmarks. Some movement variation is normal even in healthy faces.</div>
        <button onClick={isView ? onClose : onFinish} className="w-full rounded-full py-3.5 font-semibold mt-auto" style={{ background: "#B8543A", color: "#F4EFE6" }}>{isView ? "Close" : "Done"}</button>
      </div>
    </div>
  );
}

function PastSessionsList({ sessions, onOpen }) {
  const sorted = [...sessions].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 30);
  if (sorted.length === 0) return null;
  return (
    <div className="rounded-2xl p-5" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
      <div className="text-sm font-semibold mb-3">Past sessions</div>
      <div className="space-y-1.5">
        {sorted.map((s) => {
          const exCount = (s.exercises ?? s.scores ?? []).length;
          return (
            <button key={s.ts || `${s.date}-${exCount}`} onClick={() => onOpen(s)} className="w-full rounded-xl px-3 py-2.5 flex items-center gap-3 transition hover:bg-white text-left" style={{ background: "rgba(255,255,255,0.4)", border: "1px solid rgba(31, 27, 22, 0.04)" }}>
              <div className="text-xs text-stone-500 tabular-nums w-28 shrink-0">{formatSessionDate(s)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm">{exCount} exercise{exCount !== 1 ? "s" : ""}</div>
                <div className="text-xs text-stone-500 tabular-nums">{formatDuration(s.duration)}</div>
              </div>
              {s.sessionAvg != null
                ? <div className="tabular-nums font-semibold text-base" style={{ fontFamily: "Fraunces", color: scoreColor(s.sessionAvg) }}>{displayPct(s.sessionAvg)}%</div>
                : <div className="text-xs text-stone-400">—</div>}
              <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimelapseModal({ exercise, startIdx, onClose }) {
  const [idx, setIdx] = useState(startIdx);
  const [playing, setPlaying] = useState(false);
  const total = exercise.snapshots.length;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setIdx((i) => {
        if (i + 1 >= total) { setPlaying(false); return i; }
        return i + 1;
      });
    }, 500);
    return () => clearInterval(id);
  }, [playing, total]);
  const snap = exercise.snapshots[idx];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.85)" }} onClick={onClose}>
      <div className="rounded-3xl p-4 max-w-sm w-full mx-4" style={{ background: "#1F1B16", color: "#F4EFE6", border: "1px solid rgba(244,239,230,0.08)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm">{exercise.emoji} {exercise.name}</div>
          <button onClick={onClose} className="text-xs opacity-60 hover:opacity-100">Close</button>
        </div>
        <img src={snap.dataUrl} alt={`Rep ${idx + 1}`} className="w-full rounded-2xl block" />
        <div className="flex items-center gap-3 mt-3">
          <button onClick={() => { if (idx >= total - 1) setIdx(0); setPlaying((p) => !p); }} className="rounded-full px-3 py-1.5 text-sm font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>
            {playing ? "Pause" : "Play timelapse"}
          </button>
          <div className="text-xs opacity-70 flex-1 text-right tabular-nums">
            Rep {idx + 1} / {total}{snap.score != null ? ` · ${displayPct(snap.score)}%` : ""}
          </div>
        </div>
        <input type="range" min="0" max={total - 1} value={idx} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} className="w-full mt-3" style={{ accentColor: "#B8543A" }} />
      </div>
    </div>
  );
}

function JournalView({ entries, onSave }) {
  const today = todayISO();
  const todayEntry = entries.find((e) => e.date === today);
  const [symmetry, setSymmetry] = useState(todayEntry?.symmetry ?? 5);
  const [mood, setMood] = useState(todayEntry?.mood ?? "okay");
  const [notes, setNotes] = useState(todayEntry?.notes ?? "");
  const [saved, setSaved] = useState(false);
  const handleSave = () => { onSave({ date: today, symmetry, mood, notes, ts: Date.now() }); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const past = [...entries].filter((e) => e.date !== today).reverse();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>How are you today?</h2>
        <p className="text-sm text-stone-600 mt-1">A short check-in helps you see your trend over time.</p>
      </div>
      <div className="rounded-2xl p-5" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
        <div className="flex justify-between items-baseline mb-3">
          <div className="text-sm font-semibold">Symmetry rating</div>
          <div className="text-3xl tabular-nums" style={{ fontFamily: "Fraunces", fontWeight: 600, color: "#B8543A" }}>{symmetry}<span className="text-sm text-stone-500 ml-1">/ 10</span></div>
        </div>
        <input type="range" min="1" max="10" value={symmetry} onChange={(e) => setSymmetry(Number(e.target.value))} className="w-full" style={{ accentColor: "#B8543A" }} />
        <div className="flex justify-between text-xs text-stone-500 mt-2"><span>Significant droop</span><span>Full symmetry</span></div>
      </div>
      <div>
        <div className="text-sm font-semibold mb-3">Mood</div>
        <div className="grid grid-cols-4 gap-2">
          {MOOD_OPTIONS.map((m) => (
            <button key={m.key} onClick={() => setMood(m.key)} className="rounded-2xl p-3 text-center" style={{ background: mood === m.key ? "#1F1B16" : "rgba(255,255,255,0.5)", color: mood === m.key ? "#F4EFE6" : "#1F1B16", border: mood === m.key ? "none" : "1px solid rgba(31, 27, 22, 0.06)" }}>
              <div className="text-2xl mb-1">{m.emoji}</div>
              <div className="text-xs font-medium">{m.label}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-sm font-semibold mb-2">Notes</div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything you noticed today — taste, dryness, fatigue, small wins…" rows="4" className="w-full rounded-2xl p-4 text-sm resize-none focus:outline-none focus:ring-2" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)", fontFamily: "Manrope" }} />
      </div>
      <button onClick={handleSave} className="w-full rounded-full py-3 font-semibold" style={{ background: saved ? "#7A8F73" : "#1F1B16", color: "#F4EFE6" }}>{saved ? "✓ Saved" : todayEntry ? "Update entry" : "Save entry"}</button>
      {past.length > 0 && (
        <div>
          <div className="text-sm uppercase tracking-wider text-stone-500 mb-3">Past entries</div>
          <div className="space-y-2">{past.slice(0, 14).map((e) => <PastEntryRow key={e.date} entry={e} />)}</div>
        </div>
      )}
    </div>
  );
}

function PastEntryRow({ entry }) {
  const mood = MOOD_OPTIONS.find((m) => m.key === entry.mood);
  const d = new Date(entry.date);
  const label = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return (
    <div className="rounded-2xl p-3 flex items-center gap-3" style={{ background: "rgba(255, 255, 255, 0.4)", border: "1px solid rgba(31, 27, 22, 0.04)" }}>
      <div className="text-xl">{mood?.emoji ?? "·"}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {entry.notes && <div className="text-xs text-stone-600 truncate">{entry.notes}</div>}
      </div>
      <div className="text-sm tabular-nums shrink-0" style={{ fontFamily: "Fraunces", fontWeight: 600, color: "#B8543A" }}>{entry.symmetry}<span className="text-xs text-stone-500">/10</span></div>
    </div>
  );
}

function ProgressView({ data, streak, prefs, onTogglePref, onSetPref, onOpenReport }) {
  // Progress charts are projections of journal/session history. Keeping them derived
  // avoids migration work when scoring or display rules change.
  const totalSessions = data.sessions.length;
  const last7DaysSessions = data.sessions.filter((s) => { const days = daysBetween(s.date, todayISO()); return days >= 0 && days < 7; }).length;
  const journalChartData = useMemo(() => data.journal.length === 0 ? [] : data.journal.slice(-21).map((j) => ({ date: new Date(j.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), symmetry: j.symmetry })), [data.journal]);
  const aiSymmetryData = useMemo(() => data.sessions.filter((s) => s.sessionAvg != null).slice(-21).map((s) => ({ date: new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), score: displayPct(s.sessionAvg) })), [data.sessions]);
  const activityGrid = useMemo(() => {
    const today = new Date(); const grid = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const iso = d.toISOString().split("T")[0];
      const daySessions = data.sessions.filter((s) => s.date === iso);
      const symAvgs = daySessions.map((s) => s.sessionAvg).filter((v) => v != null);
      const dayAvg = symAvgs.length > 0 ? symAvgs.reduce((a, b) => a + b, 0) / symAvgs.length : null;
      grid.push({ date: iso, count: daySessions.length, avg: dayAvg });
    }
    return grid;
  }, [data.sessions]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>Your progress</h2>
        <p className="text-sm text-stone-600 mt-1">Recovery is rarely linear. Look for the trend, not the day.</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Streak" value={streak} unit={streak === 1 ? "day" : "days"} />
        <StatCard label="Last 7 days" value={last7DaysSessions} unit="sessions" />
        <StatCard label="All time" value={totalSessions} unit="sessions" />
      </div>
      {aiSymmetryData.length > 1 ? (
        <div className="rounded-2xl p-5" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
          <div className="flex items-center gap-2 mb-1"><Zap className="w-3.5 h-3.5" style={{ color: "#B8543A" }} /><div className="text-sm font-semibold">Measured symmetry</div></div>
          <div className="text-xs text-stone-500 mb-4">From your session recordings · auto-detected</div>
          <div style={{ width: "100%", height: 180 }}>
            <ResponsiveContainer>
              <AreaChart data={aiSymmetryData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <defs><linearGradient id="aiGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#B8543A" stopOpacity={0.4} /><stop offset="100%" stopColor="#B8543A" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#7C7066" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#7C7066" }} axisLine={false} tickLine={false} ticks={[0, 50, 100]} />
                <Tooltip contentStyle={{ background: "#1F1B16", border: "none", borderRadius: 8, color: "#F4EFE6", fontSize: 12 }} formatter={(v) => [`${v}%`, "Symmetry"]} />
                <Area type="monotone" dataKey="score" stroke="#B8543A" strokeWidth={2} fill="url(#aiGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl p-5" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
          <div className="flex items-center gap-2 mb-1"><Zap className="w-3.5 h-3.5" style={{ color: "#B8543A" }} /><div className="text-sm font-semibold">Measured symmetry</div></div>
          <div className="text-xs text-stone-500 mt-1">Complete a couple of sessions with the camera on to see your measured symmetry trend over time.</div>
        </div>
      )}
      <div className="rounded-2xl p-5" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Last 14 days</div>
          <div className="text-xs text-stone-500">color = avg symmetry</div>
        </div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(14, 1fr)" }}>
          {activityGrid.map((day) => {
            // No sessions: muted gray. Sessions but no symmetry data: amber dot.
            // With symmetry: color-graded by avg score (red < 60%, amber 60–80%, green ≥ 80%).
            const bg = day.count === 0
              ? "rgba(31, 27, 22, 0.06)"
              : day.avg == null
                ? "rgba(212, 165, 116, 0.5)"
                : scoreColor(day.avg);
            const tooltip = day.count === 0
              ? `${day.date}: no sessions`
              : day.avg != null
                ? `${day.date}: ${day.count} session${day.count !== 1 ? "s" : ""} · ${displayPct(day.avg)}% avg`
                : `${day.date}: ${day.count} session${day.count !== 1 ? "s" : ""}`;
            return <div key={day.date} className="aspect-square rounded-md" style={{ background: bg }} title={tooltip} />;
          })}
        </div>
        <div className="flex items-center gap-2 mt-3 text-xs text-stone-500">
          <span>None</span>
          <div className="w-3 h-3 rounded-sm" style={{ background: "rgba(31, 27, 22, 0.06)" }} />
          <div className="w-3 h-3 rounded-sm" style={{ background: "#B8543A" }} title="< 60%" />
          <div className="w-3 h-3 rounded-sm" style={{ background: "#D4A574" }} title="60–80%" />
          <div className="w-3 h-3 rounded-sm" style={{ background: "#7A8F73" }} title="≥ 80%" />
          <span>Symmetric</span>
        </div>
      </div>
      <PastSessionsList sessions={data.sessions} onOpen={onOpenReport} />
      {journalChartData.length > 1 && (
        <div className="rounded-2xl p-5" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
          <div className="text-sm font-semibold mb-1">Self-rated symmetry</div>
          <div className="text-xs text-stone-500 mb-4">From your journal entries</div>
          <div style={{ width: "100%", height: 160 }}>
            <ResponsiveContainer>
              <AreaChart data={journalChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <defs><linearGradient id="journalGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7A8F73" stopOpacity={0.4} /><stop offset="100%" stopColor="#7A8F73" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#7C7066" }} axisLine={false} tickLine={false} />
                <YAxis domain={[1, 10]} tick={{ fontSize: 10, fill: "#7C7066" }} axisLine={false} tickLine={false} ticks={[1, 5, 10]} />
                <Tooltip contentStyle={{ background: "#1F1B16", border: "none", borderRadius: 8, color: "#F4EFE6", fontSize: 12 }} />
                <Area type="monotone" dataKey="symmetry" stroke="#7A8F73" strokeWidth={2} fill="url(#journalGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div>
        <div className="text-sm uppercase tracking-wider text-stone-500 mb-3">Preferences</div>
        <div className="space-y-2">
          <DailyGoalSelector value={prefs.dailyGoal ?? 3} onChange={(v) => onSetPref("dailyGoal", v)} />
          <ToggleRow label="Symmetry tracking" description="Auto-measure symmetry during exercises" value={prefs.symmetryEnabled} onToggle={() => onTogglePref("symmetryEnabled")} />
          <ToggleRow label="Voice cues during practice" description="Spoken prompts for each rep" value={prefs.voiceEnabled} onToggle={() => onTogglePref("voiceEnabled")} />
          <ToggleRow label="Mirror camera" description="Front camera during sessions" value={prefs.mirrorEnabled} onToggle={() => onTogglePref("mirrorEnabled")} />
        </div>
      </div>
      <div className="rounded-2xl p-4 text-xs text-stone-600 leading-relaxed" style={{ background: "rgba(122, 143, 115, 0.1)" }}>
        Mirror is a practice companion, not medical care. Always work with your neurologist and physical therapist on your specific recovery plan. Discontinue any exercise that causes pain.
      </div>
    </div>
  );
}

function DailyGoalSelector({ value, onChange }) {
  const v = value ?? 3;
  return (
    <div className="rounded-2xl p-4" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
      <div className="text-sm font-medium mb-1">Daily goal</div>
      <div className="text-xs text-stone-500 mb-3">Bell's palsy retraining works best with frequent short sessions. Pick a count that feels sustainable.</div>
      <div className="flex rounded-full p-1 gap-1" style={{ background: "rgba(31, 27, 22, 0.06)" }}>
        {[1, 2, 3, 4, 5, 6].map((n) => {
          const active = v === n;
          return (
            <button key={n} onClick={() => onChange(n)} className="flex-1 py-2 rounded-full text-sm font-semibold tabular-nums" style={{ background: active ? "#1F1B16" : "transparent", color: active ? "#F4EFE6" : "#1F1B16", transition: "background 0.15s, color 0.15s" }}>
              {n}
            </button>
          );
        })}
      </div>
      <div className="text-xs text-stone-500 mt-3">Sessions spread evenly between {DAY_START_HOUR > 12 ? DAY_START_HOUR - 12 : DAY_START_HOUR}{DAY_START_HOUR >= 12 ? " PM" : " AM"} and {DAY_END_HOUR > 12 ? DAY_END_HOUR - 12 : DAY_END_HOUR}{DAY_END_HOUR >= 12 ? " PM" : " AM"}.</div>
    </div>
  );
}

function ToggleRow({ label, description, value, onToggle }) {
  return (
    <button onClick={onToggle} className="w-full rounded-2xl p-4 flex items-center justify-between text-left" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-stone-500 mt-0.5">{description}</div>
      </div>
      <div className="w-11 h-6 rounded-full p-0.5" style={{ background: value ? "#B8543A" : "rgba(31, 27, 22, 0.15)" }}>
        <div className="w-5 h-5 rounded-full bg-white" style={{ transform: value ? "translateX(20px)" : "translateX(0)", transition: "transform 0.15s" }} />
      </div>
    </button>
  );
}

function BottomNav({ view, setView }) {
  const items = [{ key: "home", label: "Today", icon: Home }, { key: "practice", label: "Practice", icon: Sparkles }, { key: "journal", label: "Journal", icon: BookOpen }, { key: "progress", label: "Progress", icon: TrendingUp }];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 px-4 pb-4 pt-2" style={{ background: "linear-gradient(to top, rgba(244,239,230,1) 60%, rgba(244,239,230,0))" }}>
      <div className="max-w-2xl mx-auto rounded-full flex items-center p-1.5 backdrop-blur-md" style={{ background: "rgba(31, 27, 22, 0.92)", boxShadow: "0 8px 32px rgba(31, 27, 22, 0.15)" }}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = view === item.key;
          return (
            <button key={item.key} onClick={() => setView(item.key)} className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-full" style={{ background: active ? "#F4EFE6" : "transparent", color: active ? "#1F1B16" : "rgba(244, 239, 230, 0.65)" }}>
              <Icon className="w-4 h-4" strokeWidth={2.2} />
              <span className="text-[10px] font-semibold">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function Onboarding({ onDone, dailyGoal, onSetDailyGoal }) {
  const [step, setStep] = useState(0);
  const steps = [
    { type: "intro", title: "Welcome to Mirror", body: "A gentle daily companion for facial retraining after Bell's Palsy. We'll guide you through exercises, log how you feel, and show your progress over time.", emoji: "🌿" },
    { type: "intro", title: "AI symmetry tracking", body: "Your front camera measures movement on both sides of your face using 468 facial landmarks, and gives you a real-time symmetry score so you can see exactly where the affected side needs attention.", emoji: "🪞" },
    { type: "intro", title: "Practice with intention", body: "Forceful contractions can train nerves to fire incorrectly (synkinesis). Mirror keeps things slow and controlled, and rewards even movement over big movement.", emoji: "🌸" },
    { type: "goal",  title: "How many times a day?", body: "Bell's palsy retraining works best with frequent short sessions spread across the day. Pick a count that feels sustainable — you can change it anytime.", emoji: "📅" },
    { type: "intro", title: "One important note", body: "Mirror supports your practice but doesn't replace medical care. Please work with your neurologist and physical therapist on your specific protocol. Stop any exercise that causes pain.", emoji: "🌱" },
  ];
  const s = steps[step];
  const v = dailyGoal ?? 3;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
      <div className="max-w-md w-full text-center">
        <div className="text-6xl mb-6">{s.emoji}</div>
        <h2 className="text-3xl mb-4" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>{s.title}</h2>
        <p className="text-base leading-relaxed opacity-80 mb-6">{s.body}</p>
        {s.type === "goal" && (
          <div className="mb-8">
            <div className="flex gap-2 justify-center mb-3">
              {[1, 2, 3, 4, 5, 6].map((n) => {
                const active = v === n;
                return (
                  <button key={n} onClick={() => onSetDailyGoal(n)} className="w-12 h-12 rounded-full text-lg font-semibold tabular-nums transition-all" style={{ background: active ? "#B8543A" : "rgba(244, 239, 230, 0.08)", color: "#F4EFE6", border: active ? "none" : "1px solid rgba(244, 239, 230, 0.2)" }}>
                    {n}
                  </button>
                );
              })}
            </div>
            <div className="text-xs opacity-60">{v} session{v === 1 ? "" : "s"} per day · spread between 9 AM and 9 PM</div>
          </div>
        )}
        <div className="flex justify-center gap-1.5 mb-8">
          {steps.map((_, i) => <div key={i} className="h-1 rounded-full" style={{ width: i === step ? 24 : 6, background: i === step ? "#F4EFE6" : "rgba(244, 239, 230, 0.3)", transition: "all 0.2s" }} />)}
        </div>
        <button onClick={() => step + 1 < steps.length ? setStep(step + 1) : onDone()} className="w-full rounded-full py-3.5 font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>{step + 1 < steps.length ? "Continue" : "Begin"}</button>
      </div>
    </div>
  );
}
