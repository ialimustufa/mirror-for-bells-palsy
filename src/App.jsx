import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Home, Sparkles, BookOpen, TrendingUp, Play, Pause, X, ChevronRight, Volume2, VolumeX, Flame, Camera, CameraOff, Check, Heart, Info, ArrowRight, Loader2, Zap, AlertCircle, Share2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { compactAppDataForStorage, exportMirrorDataForTransfer, hydrateSessionImages, importMirrorDataFromTransfer, loadMirrorData, saveMirrorData } from "./storage";

// Exercise definitions are the product content layer: the UI, daily plan, and session
// runner all read from this single catalog so copy and timing stay in sync.
const EXERCISES = [
  { id: "eyebrow-raise", name: "Eyebrow Raise", region: "forehead", holdSec: 5, reps: 10, instruction: "Raise both eyebrows as if surprised. Hold gently for 5 seconds, then relax slowly.", tip: "If the affected side won't lift, assist lightly with a finger. Never strain — quality over force." },
  { id: "gentle-frown", name: "Gentle Frown", region: "forehead", holdSec: 4, reps: 8, instruction: "Pull your eyebrows down and inward, as if concentrating. Hold, then relax.", tip: "Watch both brows in the mirror. Aim for symmetric movement, not strength." },
  { id: "eye-close", name: "Soft Eye Closure", region: "eyes", holdSec: 5, reps: 10, instruction: "Slowly close your eyes — don't squeeze. Hold softly for 5 seconds, then open slowly.", tip: "Forceful blinking can encourage synkinesis. Slow and gentle is the goal." },
  { id: "wink", name: "Independent Wink", region: "eyes", holdSec: 2, reps: 6, instruction: "Try to close one eye while keeping the other open. Switch sides each rep.", tip: "This builds independent control. It may feel awkward — that's normal early on." },
  { id: "nose-wrinkle", name: "Nostril Flare", region: "nose", holdSec: 4, reps: 8, instruction: "Flare your nostrils outward, as if taking a deep breath through your nose. Hold gently, then relax.", tip: "If flaring feels stuck, try wrinkling the bridge upward instead — both engage the nasalis muscle group. Keep the rest of your face soft." },
  { id: "cheek-puff", name: "Cheek Puff", region: "cheeks", holdSec: 5, reps: 8, instruction: "Take a breath, puff air into both cheeks, hold, then move air slowly from one cheek to the other.", tip: "If air leaks from the affected side, hold that lip lightly with a finger to build the seal." },
  { id: "cheek-suck", name: "Cheek Suck", region: "cheeks", holdSec: 3, reps: 8, instruction: "Suck your cheeks inward against your teeth, like making a 'fish face'. Hold, then release.", tip: "This activates the buccinator muscle — important for chewing and speech." },
  { id: "closed-smile", name: "Closed Smile", region: "mouth", holdSec: 5, reps: 10, instruction: "Smile with lips closed, lifting both corners of your mouth gently. Hold, then relax.", tip: "This is the cornerstone exercise. Watch both corners rise evenly in the mirror." },
  { id: "open-smile", name: "Open Smile", region: "mouth", holdSec: 5, reps: 8, instruction: "Smile widely, showing your teeth. Hold for 5 seconds, then relax slowly.", tip: "Only progress to this when closed smile feels symmetric. Don't force a wider smile than the affected side allows." },
  { id: "pucker", name: "Lip Pucker", region: "mouth", holdSec: 5, reps: 10, instruction: "Purse your lips forward as if blowing a kiss. Hold for 5 seconds, then relax.", tip: "Use the mirror to keep the pucker centered, not pulled toward the stronger side." },
  { id: "lip-press", name: "Lip Press", region: "mouth", holdSec: 4, reps: 8, instruction: "Press your lips firmly but gently together. Hold, then release.", tip: "Builds the orbicularis oris — important for sealing food and clear speech." },
  { id: "vowel-a", name: "Vowel A Shape", region: "mouth", holdSec: 4, reps: 5, instruction: "Say or silently mouth a slow, open A shape. Hold the jaw open gently, then relax fully.", tip: "Think 'ah'. Keep the mouth opening centered and avoid pulling toward the stronger side." },
  { id: "vowel-e", name: "Vowel E Shape", region: "mouth", holdSec: 4, reps: 5, instruction: "Say or silently mouth a slow E shape. Stretch the lips sideways gently, hold, then relax.", tip: "Think 'ee'. Watch both mouth corners travel evenly without over-smiling." },
  { id: "vowel-i", name: "Vowel I Shape", region: "mouth", holdSec: 4, reps: 5, instruction: "Say or silently mouth a slow I shape. Lift the corners lightly and keep the lips controlled.", tip: "Think 'ih'. This should be smaller and softer than a wide smile." },
  { id: "vowel-o", name: "Vowel O Shape", region: "mouth", holdSec: 4, reps: 5, instruction: "Say or silently mouth a rounded O shape. Hold the lips in a soft circle, then relax.", tip: "Think 'oh'. Keep the circle centered rather than pulled to one side." },
  { id: "vowel-u", name: "Vowel U Shape", region: "mouth", holdSec: 4, reps: 5, instruction: "Say or silently mouth a rounded U shape. Bring the lips forward gently, hold, then relax.", tip: "Think 'oo'. Keep the forward pucker even and avoid clenching." },
  { id: "emoji-smile", name: "Emoji Smile 🙂", region: "emoji", holdSec: 4, reps: 6, instruction: "Make a gentle happy face with lips closed. Hold the smile softly, then relax back to neutral.", tip: "Keep it conversational, not forced. Watch both corners lift at the same speed." },
  { id: "emoji-big-smile", name: "Emoji Big Smile 😄", region: "emoji", holdSec: 4, reps: 5, instruction: "Make a bright open smile, showing teeth only as much as feels comfortable. Hold, then release slowly.", tip: "Use less range if the stronger side pulls too far ahead." },
  { id: "emoji-surprise", name: "Emoji Surprise 😮", region: "emoji", holdSec: 4, reps: 5, instruction: "Raise your eyebrows and make a soft O shape with your mouth, like a surprised face. Hold gently, then relax.", tip: "This links forehead lift with controlled lip rounding. Keep the jaw loose." },
  { id: "emoji-wink", name: "Emoji Wink 😉", region: "emoji", holdSec: 3, reps: 5, instruction: "Make a playful wink expression. Close one eye gently while the mouth stays lightly lifted, then relax.", tip: "Avoid squeezing. The goal is clean eye control without pulling the cheek hard." },
  { id: "emoji-kiss", name: "Emoji Kiss 😘", region: "emoji", holdSec: 4, reps: 5, instruction: "Pucker your lips forward like sending a kiss. Hold the center line steady, then relax.", tip: "Keep the lips centered and soft; do not clench the jaw." },
  { id: "emoji-sad-frown", name: "Emoji Sad Frown ☹️", region: "emoji", holdSec: 4, reps: 5, instruction: "Make a gentle sad face by lowering the mouth corners and lightly drawing the brows together. Hold, then release.", tip: "Use a small expression. Stop if it creates strain around the eye or cheek." },
  { id: "emoji-nose-scrunch", name: "Emoji Nose Scrunch 😖", region: "emoji", holdSec: 4, reps: 5, instruction: "Scrunch your nose lightly as if reacting to a strong smell. Hold the expression, then relax fully.", tip: "Keep the rest of the face soft so the nose and upper lip do the work." },
];
const EXERCISE_BY_ID = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]));

const REGIONS = [{ key: "all", label: "All" }, { key: "forehead", label: "Forehead" }, { key: "eyes", label: "Eyes" }, { key: "nose", label: "Nose" }, { key: "cheeks", label: "Cheeks" }, { key: "mouth", label: "Mouth" }, { key: "emoji", label: "Emoji" }];
const DAILY_ESSENTIALS = ["eyebrow-raise", "eye-close", "nose-wrinkle", "cheek-puff", "closed-smile", "pucker"];
const MOOD_OPTIONS = [{ key: "hopeful", label: "Hopeful", emoji: "🌱" }, { key: "okay", label: "Steady", emoji: "🌤" }, { key: "tired", label: "Tired", emoji: "🌙" }, { key: "frustrated", label: "Frustrated", emoji: "🌧" }];

// Daily cadence: short sessions spread N times across waking hours.
const DAY_START_HOUR = 9;  // 9 AM
const DAY_END_HOUR = 21;   // 9 PM
const INTERSTITIAL_SEC = 10;
const HOLD_SEC = 4;       // fallback hold duration; profiled sessions can use exercise-specific dosing
const REST_SEC = 2;       // fallback rest duration; serves as entry settle AND between-rep recovery
const CALIBRATION_FRAMES = 24;
const CALIBRATION_STABILITY_EPS = 0.006;
const CALIBRATION_RESET_EPS = 0.018;
const FACE_CENTER_MAX_OFFSET = 0.12;
const FACE_TILT_MAX_RAD = 0.12;
const PROFILE_VERSION = 1;
const PROFILE_ASSESSMENT_EXERCISES = EXERCISES.map((exercise) => exercise.id);
const PROFILE_HOLD_SEC = 4;
const PROFILE_REST_SEC = 2;
const PROFILE_EXERCISE_NEUTRAL_MIN_FRAMES = 8;
const PROFILE_REST_RETRY_LIMIT = 1;
const PROFILE_BASELINE_TOP_FRACTION = 0.2;
const PROFILE_MIN_SCORED_FRAMES = 8;
const PROFILE_MIN_ALIGNMENT_RATIO = 0.7;
const PROFILE_RETAKE_DAYS = 14;
const PROFILE_HISTORY_LIMIT = 6;
const PROFILE_STEADY_NOISE_MAX = 0.006;
const PROFILE_USABLE_NOISE_MAX = 0.018;
const REPORT_SNAPSHOT_WIDTH = 520;
const REPORT_SNAPSHOT_QUALITY = 0.9;
const COMFORT_DOSING = {
  gentle: { key: "gentle", label: "Gentle", repScale: 0.65, minReps: 3, maxReps: 8, holdDeltaSec: -1, minHoldSec: 2, maxHoldSec: 4, restSec: 3 },
  normal: { key: "normal", label: "Normal", repScale: 1, minReps: 4, maxReps: 10, holdDeltaSec: 0, minHoldSec: 2, maxHoldSec: 5, restSec: 2 },
  advanced: { key: "advanced", label: "Advanced", repScale: 1.15, minReps: 5, maxReps: 12, holdDeltaSec: 0, minHoldSec: 2, maxHoldSec: 5, restSec: 2 },
};

// Persisted app state is intentionally compact and append-only for sessions/journal.
// Derived trend metrics are recomputed in views instead of stored.
const DEFAULT_DATA = { journal: [], sessions: [], movementProfile: null, initialMovementProfile: null, movementProfileHistory: [], prefs: { voiceEnabled: true, mirrorEnabled: true, symmetryEnabled: true, dailyGoal: 3, onboarded: false } };
const todayISO = () => new Date().toISOString().split("T")[0];
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));

// Single-exercise standalone runs are tagged "practice" — they're still tracked and
// charted, but don't count toward the daily-goal X-of-Y counter. Legacy records have no
// kind and continue to count.
function isCountedSession(s) {
  return s?.kind !== "practice";
}

function normalizeAppData(parsed = {}) {
  const compactParsed = compactAppDataForStorage(parsed);
  const movementProfileHistory = Array.isArray(compactParsed.movementProfileHistory) ? compactParsed.movementProfileHistory : [];
  const inferredInitialProfile = compactParsed.initialMovementProfile ?? movementProfileHistory.at(-1) ?? compactParsed.movementProfile ?? null;
  return {
    ...DEFAULT_DATA,
    ...compactParsed,
    initialMovementProfile: inferredInitialProfile,
    movementProfileHistory,
    prefs: { ...DEFAULT_DATA.prefs, ...(compactParsed.prefs ?? {}) },
  };
}

function archiveMovementProfile(profile, archivedAt = Date.now()) {
  if (!profile) return null;
  const { neutralLandmarks, noiseFloor, ...summary } = profile;
  return {
    ...summary,
    archivedAt,
    hasNeutralLandmarks: Boolean(neutralLandmarks),
    hasNoiseFloor: Boolean(noiseFloor),
  };
}

function averageProfileSymmetry(exercises) {
  const valid = Object.values(exercises ?? {}).map((e) => e.initialSymmetry).filter((v) => v != null);
  return valid.length ? roundMetric(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null;
}

function mergeMovementProfileRetake(currentProfile, partialProfile) {
  if (!currentProfile || !partialProfile?.exercises) return partialProfile;
  const exercises = { ...(currentProfile.exercises ?? {}), ...partialProfile.exercises };
  const retakenExerciseIds = Object.keys(partialProfile.exercises);
  return {
    ...currentProfile,
    updatedAt: Date.now(),
    lastPartialRetakeAt: Date.now(),
    lastPartialRetakeExerciseIds: retakenExerciseIds,
    lastPartialCalibrationQuality: partialProfile.calibrationQuality,
    exercises,
    initialAvgSymmetry: averageProfileSymmetry(exercises),
  };
}

function getComfortDosing(profileOrLevel) {
  const key = typeof profileOrLevel === "string" ? profileOrLevel : profileOrLevel?.comfortLevel;
  return COMFORT_DOSING[key] ?? COMFORT_DOSING.normal;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applySessionDose(exercise, profile) {
  const dosing = getComfortDosing(profile);
  const reps = clampNumber(Math.round(exercise.reps * dosing.repScale), dosing.minReps, dosing.maxReps);
  const holdSec = clampNumber(Math.round(exercise.holdSec + dosing.holdDeltaSec), dosing.minHoldSec, dosing.maxHoldSec);
  return { ...exercise, baseReps: exercise.reps, baseHoldSec: exercise.holdSec, reps, holdSec, restSec: dosing.restSec, comfortLevel: dosing.key };
}

function buildSessionExercises(ids, profile) {
  return ids.map((id) => EXERCISES.find((e) => e.id === id)).filter(Boolean).map((exercise) => applySessionDose(exercise, profile));
}

function exerciseRestSec(exercise) {
  return exercise?.restSec ?? REST_SEC;
}

function exerciseHoldSec(exercise) {
  return exercise?.holdSec ?? HOLD_SEC;
}

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
  if (item.latest?.avg != null) return `recent symmetry ${displayPct(item.latest.avg)}%`;
  if (item.profileExercise.initialSymmetry != null) return `baseline symmetry ${displayPct(item.profileExercise.initialSymmetry)}%`;
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

// Posture: face roughly centered & level. Uses landmark 1 (nose tip) and the eye-line tilt.
function isFaceAligned(lm) {
  return faceAlignmentFeedback(lm).aligned;
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

function useFaceLandmarker(active) {
  const [status, setStatus] = useState("idle");
  const [faceLandmarker, setFaceLandmarker] = useState(null);
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
        if (cancelled) { try { fl.close(); } catch { /* model may already be closed */ } return; }
        flRef.current = fl;
        setFaceLandmarker(fl);
        setStatus("ready");
      } catch (err) {
        console.warn("[Mirror] FaceLandmarker init failed:", err);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [active]);

  useEffect(() => {
    return () => {
      try { flRef.current?.close?.(); } catch { /* best-effort model cleanup */ }
      flRef.current = null;
      setFaceLandmarker(null);
    };
  }, []);

  return { faceLandmarker, latestRef, status };
}

export default function App() {
  // Top-level orchestration only: global persistence, view routing, and modal/session ownership.
  // Feature views own their local form/filter state.
  const [view, setView] = useState("home");
  const [data, setData] = useState(DEFAULT_DATA);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [profileAssessment, setProfileAssessment] = useState(null);
  const [exerciseDetail, setExerciseDetail] = useState(null);
  const [viewingReport, setViewingReport] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const stored = await loadMirrorData();
        if (stored) {
          const normalized = normalizeAppData(stored);
          setData(normalized);
          if (!normalized.prefs?.onboarded) setShowOnboarding(true);
        } else { setShowOnboarding(true); }
      } catch { setShowOnboarding(true); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (loading) return undefined;

    const params = new URLSearchParams(window.location.search);
    if (params.get("mirrorExport") === "1") {
      let cancelled = false;
      (async () => {
        try {
          const dataForTransfer = await exportMirrorDataForTransfer();
          document.title = `Mirror export: ${dataForTransfer?.sessions?.length ?? 0} sessions`;
          if (!cancelled) {
            window.parent?.postMessage({
              type: "mirror-data-export",
              sourceOrigin: window.location.origin,
              data: dataForTransfer,
            }, params.get("target") || "*");
          }
        } catch (error) {
          console.error("Failed to export Mirror data", error);
        }
      })();
      return () => { cancelled = true; };
    }

    const exportTo = params.get("exportTo");
    if (exportTo) {
      let cancelled = false;
      (async () => {
        try {
          const dataForTransfer = await exportMirrorDataForTransfer();
          const sessionCount = dataForTransfer?.sessions?.length ?? 0;
          await fetch(exportTo, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dataForTransfer),
          });
          if (!cancelled) document.title = `Mirror export: ${sessionCount} sessions sent`;
        } catch (error) {
          console.error("Failed to send Mirror export", error);
          if (!cancelled) document.title = "Mirror export failed";
        }
      })();
      return () => { cancelled = true; };
    }

    const importFrom = params.get("importFrom");
    if (importFrom) {
      let cancelled = false;
      (async () => {
        try {
          const response = await fetch(importFrom);
          if (!response.ok) throw new Error(`Import fetch failed with ${response.status}`);
          const incoming = await response.json();
          const incomingSessions = incoming?.sessions?.length ?? 0;
          const saved = await importMirrorDataFromTransfer(incoming);
          if (!cancelled) {
            setData(normalizeAppData(saved));
            document.title = `Mirror import: ${incomingSessions} -> ${saved?.sessions?.length ?? 0} sessions`;
            window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash || ""}`);
          }
        } catch (error) {
          console.error("Failed to fetch Mirror import", error);
          if (!cancelled) document.title = "Mirror import failed";
        }
      })();
      return () => { cancelled = true; };
    }

    const migrateFrom = params.get("migrateFrom");
    if (!migrateFrom) return undefined;

    let sourceUrl;
    try {
      sourceUrl = new URL(migrateFrom);
    } catch {
      console.error("Invalid Mirror migration source", migrateFrom);
      return undefined;
    }

    let cancelled = false;
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";

    function cleanup() {
      window.removeEventListener("message", handleMessage);
      try { iframe.remove(); } catch { /* iframe may already be gone */ }
    }

    async function handleMessage(event) {
      if (event.origin !== sourceUrl.origin || event.data?.type !== "mirror-data-export" || cancelled) return;
      const incomingSessions = event.data.data?.sessions?.length ?? 0;
      try {
        const saved = await importMirrorDataFromTransfer(event.data.data);
        document.title = `Mirror import: ${incomingSessions} -> ${saved?.sessions?.length ?? 0} sessions`;
        if (!cancelled) setData(normalizeAppData(saved));
      } catch (error) {
        console.error("Failed to import Mirror data", error);
      } finally {
        if (!cancelled) window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash || ""}`);
        cleanup();
      }
    }

    window.addEventListener("message", handleMessage);
    sourceUrl.searchParams.set("mirrorExport", "1");
    sourceUrl.searchParams.set("target", window.location.origin);
    iframe.src = sourceUrl.toString();
    document.body.appendChild(iframe);

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [loading]);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400&family=Manrope:wght@400;500;600;700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => { try { document.head.removeChild(link); } catch { /* font link may have been removed externally */ } };
  }, []);

  const persist = useCallback(async (next) => {
    const compactNext = compactAppDataForStorage(next);
    setData(compactNext);
    try {
      const saved = await saveMirrorData(next);
      setData(normalizeAppData(saved));
    } catch (e) { console.error("Failed to persist app data", e); }
  }, []);

  const openStoredReport = useCallback(async (sessionRecord) => {
    const hydrated = await hydrateSessionImages(sessionRecord);
    setViewingReport(hydrated);
  }, []);

  const finishOnboarding = (startProfile = false) => {
    persist({ ...data, prefs: { ...data.prefs, onboarded: true } });
    setShowOnboarding(false);
    if (startProfile) setProfileAssessment({});
  };
  const openProfileAssessment = (retakeExerciseIds = null) => {
    setProfileAssessment(retakeExerciseIds?.length ? { retakeExerciseIds } : {});
  };
  const saveMovementProfile = (profile, options = {}) => {
    if (options.retakeExerciseIds?.length && data.movementProfile) {
      const movementProfile = mergeMovementProfileRetake(data.movementProfile, profile);
      persist({ ...data, movementProfile, initialMovementProfile: data.initialMovementProfile ?? data.movementProfile, prefs: { ...data.prefs, onboarded: true } });
      setProfileAssessment(null);
      return;
    }
    const archived = archiveMovementProfile(data.movementProfile);
    const movementProfileHistory = archived
      ? [archived, ...(data.movementProfileHistory ?? [])].slice(0, PROFILE_HISTORY_LIMIT)
      : (data.movementProfileHistory ?? []);
    persist({ ...data, movementProfile: profile, initialMovementProfile: data.initialMovementProfile ?? profile, movementProfileHistory, prefs: { ...data.prefs, onboarded: true } });
    setProfileAssessment(null);
  };
  const startSession = (ids) => {
    primeSpeech(data.prefs.voiceEnabled);
    const exercises = buildSessionExercises(ids, data.movementProfile);
    const kind = ids.length > 1 ? "session" : "practice";
    setSession({ exercises, kind, startedAt: Date.now(), comfortLevel: getComfortDosing(data.movementProfile).key });
  };
  const completeSession = (rec) => { persist({ ...data, sessions: [...data.sessions, rec] }); setSession(null); };
  const saveJournal = (entry) => { const filtered = data.journal.filter((j) => j.date !== entry.date); persist({ ...data, journal: [...filtered, entry].sort((a, b) => a.date.localeCompare(b.date)) }); };
  const togglePref = (key) => persist({ ...data, prefs: { ...data.prefs, [key]: !data.prefs[key] } });
  const setPref = (key, value) => persist({ ...data, prefs: { ...data.prefs, [key]: value } });

  const streak = useMemo(() => computeStreak(data.sessions), [data.sessions]);

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#F4EFE6" }}><div className="text-stone-600">Loading…</div></div>;

  return (
    <div className="min-h-screen relative lg:pl-20" style={{ background: "#F4EFE6", fontFamily: "Manrope, system-ui, sans-serif", color: "#1F1B16" }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full blur-3xl opacity-30" style={{ background: "#D4A574" }} />
        <div className="absolute top-1/2 -left-32 w-80 h-80 rounded-full blur-3xl opacity-20" style={{ background: "#7A8F73" }} />
      </div>
      <Sidebar view={view} setView={setView} streak={streak} />
      <div className="relative max-w-2xl mx-auto px-5 pb-28 pt-8 lg:pb-12">
        <Header view={view} streak={streak} />
        <main className="mt-8 lg:mt-2">
          {view === "home" && <HomeView data={data} streak={streak} onStartProfile={openProfileAssessment} onStartSession={startSession} onGo={setView} />}
          {view === "practice" && <PracticeView movementProfile={data.movementProfile} sessions={data.sessions} onStartSession={startSession} onShowDetail={setExerciseDetail} />}
          {view === "journal" && <JournalView entries={data.journal} onSave={saveJournal} />}
          {view === "progress" && <ProgressView data={data} streak={streak} prefs={data.prefs} onTogglePref={togglePref} onSetPref={setPref} onOpenReport={openStoredReport} onStartProfile={openProfileAssessment} />}
        </main>
      </div>
      <BottomNav view={view} setView={setView} />
      {session && <SessionMode session={session} prefs={data.prefs} movementProfile={data.movementProfile} initialMovementProfile={data.initialMovementProfile ?? data.movementProfile} sessionsToday={data.sessions.filter((s) => s.date === todayISO() && isCountedSession(s)).length} onComplete={completeSession} onCancel={() => setSession(null)} onTogglePref={togglePref} />}
      {exerciseDetail && <ExerciseDetail exercise={exerciseDetail} movementProfile={data.movementProfile} onClose={() => setExerciseDetail(null)} onStart={(id) => { setExerciseDetail(null); startSession([id]); }} />}
      {showOnboarding && <Onboarding onDone={finishOnboarding} dailyGoal={data.prefs.dailyGoal} onSetDailyGoal={(n) => setPref("dailyGoal", n)} />}
      {profileAssessment && <ProfileAssessment existingProfile={data.movementProfile} retakeExerciseIds={profileAssessment.retakeExerciseIds} onComplete={saveMovementProfile} onSkip={() => setProfileAssessment(null)} />}
      {viewingReport && <SessionSummary session={viewingReport} onClose={() => setViewingReport(null)} />}
    </div>
  );
}

function Header({ view, streak }) {
  const titles = { home: "Today", practice: "Practice", journal: "Journal", progress: "Progress" };
  return (
    <header className="flex items-center justify-between lg:hidden">
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

function Sidebar({ view, setView, streak }) {
  const items = [{ key: "home", label: "Today", icon: Home }, { key: "practice", label: "Practice", icon: Sparkles }, { key: "journal", label: "Journal", icon: BookOpen }, { key: "progress", label: "Progress", icon: TrendingUp }];
  return (
    <aside className="hidden lg:flex fixed top-0 left-0 bottom-0 w-20 z-20 flex-col items-center py-5 gap-2" style={{ background: "rgba(31, 27, 22, 0.94)", borderRight: "1px solid rgba(244,239,230,0.06)" }}>
      <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2" style={{ background: "#F4EFE6" }} title="Mirror">
        <div className="w-4 h-4 rounded-full" style={{ background: "#1F1B16" }} />
      </div>
      <div className="flex flex-col items-center gap-1 flex-1 mt-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = view === item.key;
          return (
            <button key={item.key} onClick={() => setView(item.key)} className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-colors" style={{ background: active ? "#F4EFE6" : "transparent", color: active ? "#1F1B16" : "rgba(244,239,230,0.65)" }}>
              <Icon className="w-4 h-4" strokeWidth={2.2} />
              <span className="text-[9px] font-semibold">{item.label}</span>
            </button>
          );
        })}
      </div>
      {streak > 0 && (
        <div className="flex flex-col items-center gap-0.5 px-2 py-2 rounded-2xl" style={{ background: "rgba(184, 84, 58, 0.18)", color: "#FFB48F" }} title={`${streak} day streak`}>
          <Flame className="w-4 h-4" />
          <span className="text-xs font-semibold tabular-nums">{streak}</span>
        </div>
      )}
    </aside>
  );
}

function HomeView({ data, streak, onStartProfile, onStartSession, onGo }) {
  // Home is a derived dashboard: it summarizes today's stored records and maps the
  // configured daily goal into the next practice prompt.
  const todaysSessions = data.sessions.filter((s) => s.date === todayISO());
  const todaysCountedSessions = todaysSessions.filter(isCountedSession);
  const todaysJournal = data.journal.find((j) => j.date === todayISO());
  const dailyGoal = data.prefs.dailyGoal ?? 3;
  const todaysPlan = buildPersonalizedDailyPlan(data.movementProfile, data.sessions);
  const focusItems = getAdaptiveFocusItems(data.movementProfile, data.sessions, 3);
  const planExercises = todaysPlan.map((id) => EXERCISES.find((e) => e.id === id)).filter(Boolean);
  const latestBaseline = latestSessionBaselineProgress(data.sessions);
  const baselineStatus = profileStatus(data.movementProfile);
  const weakBaselineIds = baselineStatus?.retakeExercises?.map((ex) => ex.exerciseId) ?? [];
  const completed = todaysCountedSessions.length;
  const remaining = Math.max(0, dailyGoal - completed);
  const nextSlot = nextSessionAt(dailyGoal, completed);
  const todaysAvgSymmetry = (() => {
    const valid = todaysSessions.map((s) => s.sessionAvg).filter((v) => v != null);
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  })();
  const nextLabel = nextSlot
    ? (nextSlot.getTime() <= new Date().getTime() ? "Now" : formatClock(nextSlot))
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
          <button onClick={() => onStartSession(todaysPlan)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>
            <Play className="w-4 h-4 fill-current" />{remaining > 0 ? "Start session" : "Practice again"}
          </button>
        </div>
      </div>
      {data.movementProfile && (
        <div className="rounded-2xl p-4" style={{ background: "rgba(31, 27, 22, 0.92)", color: "#F4EFE6" }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-sm font-semibold">Personalized plan</div>
              <div className="text-xs opacity-60">Prioritized from your baseline profile</div>
            </div>
            <div className="flex items-center gap-2">
              {baselineStatus && <div className="text-xs rounded-full px-2.5 py-1" style={{ background: `${baselineStatus.quality.color}26`, color: baselineStatus.quality.color }}>{baselineStatus.quality.label}</div>}
              <div className="text-xs rounded-full px-2.5 py-1" style={{ background: "rgba(244,239,230,0.08)" }}>{planExercises.length} moves</div>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {planExercises.map((ex) => <ExerciseGlyph key={ex.id} exercise={ex} size="xs" tone="dark" />)}
          </div>
          <div className="grid grid-cols-1 gap-2 mt-4">
            {focusItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: "rgba(244,239,230,0.06)" }}>
                <ExerciseGlyph exercise={item.exercise} size="xs" tone="dark" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate">{item.exercise?.name}</div>
                  <div className="text-[11px] opacity-55">{focusReason(item)} · limited side {item.profileExercise.limitedSide}</div>
                </div>
              </div>
            ))}
          </div>
          {latestBaseline && (
            <div className="mt-3 text-xs rounded-xl px-3 py-2" style={{ background: "rgba(122,143,115,0.18)", color: "#D9E5D2" }}>
              Latest baseline progress: {latestBaseline.side} side · {baselineProgressLabel(latestBaseline)}
            </div>
          )}
          {baselineStatus?.shouldRetake && (
            <div className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: "rgba(184,84,58,0.16)", color: "#FFD3C1" }}>
              <div className="flex-1 text-xs">Retake baseline: {baselineStatus.reason}</div>
              <button onClick={() => onStartProfile(weakBaselineIds.length ? weakBaselineIds : null)} className="rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap" style={{ background: "#B8543A", color: "#F4EFE6" }}>{weakBaselineIds.length ? "Retake weak" : "Retake"}</button>
            </div>
          )}
        </div>
      )}
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

function ExerciseGlyph({ exercise, exerciseId, region, size = "sm", tone = "light", className = "" }) {
  const resolved = exercise ?? EXERCISES.find((e) => e.id === exerciseId) ?? {};
  const regionKey = resolved.region ?? region ?? "mouth";
  const sizeClass = { xs: "w-8 h-8 rounded-xl", sm: "w-10 h-10 rounded-2xl", md: "w-14 h-14 rounded-2xl", lg: "w-20 h-20 rounded-3xl" }[size] ?? "w-10 h-10 rounded-2xl";
  const dark = tone === "dark";
  const background = dark ? "rgba(244, 239, 230, 0.08)" : "rgba(122, 143, 115, 0.1)";
  const border = dark ? "1px solid rgba(244, 239, 230, 0.1)" : "1px solid rgba(122, 143, 115, 0.18)";
  const color = dark ? "#F4EFE6" : "#1F1B16";
  const accent = dark ? "#D4A574" : "#7A8F73";

  return (
    <div className={`${sizeClass} ${className} shrink-0 flex items-center justify-center`} style={{ background, border, color }} aria-hidden>
      <svg viewBox="0 0 48 48" className="w-[72%] h-[72%]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 5.5c-9.2 0-15.5 7.6-15.5 18.4 0 11 6.8 18.6 15.5 18.6s15.5-7.6 15.5-18.6C39.5 13.1 33.2 5.5 24 5.5Z" opacity="0.26" />
        <path d="M24 14.5v17" opacity="0.16" />

        {regionKey === "forehead" && (
          <>
            <path d="M16 15.8c2.8-1.4 5.1-1.4 7.2-.2" stroke={accent} />
            <path d="M24.8 15.6c2.1-1.2 4.4-1.2 7.2.2" stroke={accent} />
            <path d="M17.5 11.2c4.2-1.7 8.8-1.7 13 0" opacity="0.58" />
          </>
        )}

        {regionKey === "eyes" && (
          <>
            <path d="M14.5 21.2c2.3-2.2 5.1-2.2 7.4 0" stroke={accent} />
            <path d="M26.1 21.2c2.3-2.2 5.1-2.2 7.4 0" stroke={accent} />
            <path d="M15.8 24.2c1.5.9 3.1.9 4.8 0" opacity="0.58" />
            <path d="M27.4 24.2c1.7.9 3.3.9 4.8 0" opacity="0.58" />
          </>
        )}

        {regionKey === "nose" && (
          <>
            <path d="M24 18.5c-.5 3.8-1.5 7.2-3.4 10.3" stroke={accent} />
            <path d="M24 18.5c.5 3.8 1.5 7.2 3.4 10.3" stroke={accent} />
            <path d="M18.2 31.3c1.4-1.1 2.8-1.1 4.1 0" opacity="0.58" />
            <path d="M25.7 31.3c1.3-1.1 2.7-1.1 4.1 0" opacity="0.58" />
          </>
        )}

        {regionKey === "cheeks" && (
          <>
            <path d="M14.4 27.3c2.4 2.1 5.2 2.1 7.5 0" stroke={accent} />
            <path d="M26.1 27.3c2.3 2.1 5.1 2.1 7.5 0" stroke={accent} />
            <path d="M16.4 23.1c1.1-.6 2.3-.6 3.4 0" opacity="0.5" />
            <path d="M28.2 23.1c1.1-.6 2.3-.6 3.4 0" opacity="0.5" />
          </>
        )}

        {regionKey === "mouth" && (
          <>
            <path d="M17 31.2c4.5 3.4 9.5 3.4 14 0" stroke={accent} />
            <path d="M19.6 27.8h8.8" opacity="0.58" />
          </>
        )}

        {regionKey === "emoji" && (
          <>
            <path d="M15.5 18.4c2.2-1.3 4.3-1.3 6.2 0" stroke={accent} />
            <path d="M26.3 18.4c1.9-1.3 4-1.3 6.2 0" stroke={accent} />
            <path d="M16.6 23.2c1.4 1 3 1 4.4 0" opacity="0.58" />
            <path d="M27 23.2c1.4 1 3 1 4.4 0" opacity="0.58" />
            <path d="M17 31.4c4.6 4 9.4 4 14 0" stroke={accent} />
            <path d="M33.2 12.4l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3.9-1.8Z" fill={accent} stroke="none" />
          </>
        )}
      </svg>
    </div>
  );
}

function PracticeView({ movementProfile, sessions, onStartSession, onShowDetail }) {
  // Library state stays local until the user starts a session, keeping custom routines
  // ephemeral and avoiding partial selections in persisted recovery data.
  const profilePlan = useMemo(() => buildPersonalizedDailyPlan(movementProfile, sessions), [movementProfile, sessions]);
  const focusItems = useMemo(() => getAdaptiveFocusItems(movementProfile, sessions, 3), [movementProfile, sessions]);
  const dosing = getComfortDosing(movementProfile);
  const [region, setRegion] = useState("all");
  const [selected, setSelected] = useState(() => new Set(profilePlan));
  useEffect(() => { if (movementProfile) setSelected(new Set(profilePlan)); }, [movementProfile, profilePlan]);
  const filtered = region === "all" ? EXERCISES : EXERCISES.filter((e) => e.region === region);
  const toggle = (id) => { const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); setSelected(next); };
  const shownIds = filtered.map((exercise) => exercise.id);
  const selectedShownCount = shownIds.filter((id) => selected.has(id)).length;
  const allShownSelected = shownIds.length > 0 && selectedShownCount === shownIds.length;
  const recommendedSelected = selected.size === profilePlan.length && profilePlan.every((id) => selected.has(id));
  const selectRecommended = () => setSelected(new Set(profilePlan));
  const selectAllShown = () => setSelected((prev) => new Set([...prev, ...shownIds]));
  const clearSelection = () => setSelected(new Set());

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-3xl" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>Practice library</h2>
        <p className="text-sm text-stone-600 mt-1">Tap an exercise to see details. Select multiple to build a custom session.</p>
      </div>
      {movementProfile && (
        <div className="rounded-2xl p-4" style={{ background: "rgba(122, 143, 115, 0.12)", border: "1px solid rgba(122, 143, 115, 0.2)" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold">Baseline focus selected</div>
              <div className="text-xs text-stone-600">{dosing.label} dose · starts with the lowest baseline movements.</div>
            </div>
            <button onClick={selectRecommended} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: "#1F1B16", color: "#F4EFE6" }}>Recommended</button>
          </div>
          <div className="space-y-2">
            {focusItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <ExerciseGlyph exercise={item.exercise} size="xs" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{item.exercise?.name}</div>
                  <div className="text-[11px] text-stone-600">{focusReason(item)} · limited side {item.profileExercise.limitedSide}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {REGIONS.map((r) => (
          <button key={r.key} onClick={() => setRegion(r.key)} className="px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap" style={{ background: region === r.key ? "#1F1B16" : "rgba(255,255,255,0.6)", color: region === r.key ? "#F4EFE6" : "#1F1B16", border: region === r.key ? "none" : "1px solid rgba(31, 27, 22, 0.08)" }}>{r.label}</button>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl px-4 py-3" style={{ background: "rgba(255,255,255,0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
        <div className="text-xs text-stone-600">{selectedShownCount} of {filtered.length} shown selected{selected.size !== selectedShownCount ? ` · ${selected.size} total` : ""}</div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={selectRecommended} disabled={recommendedSelected} className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-45" style={{ background: "rgba(122, 143, 115, 0.16)", color: "#3E5F3B" }}>{recommendedSelected ? "Recommended selected" : "Recommended"}</button>
          <button onClick={selectAllShown} disabled={allShownSelected} className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-45" style={{ background: "#1F1B16", color: "#F4EFE6" }}>{allShownSelected ? "Shown selected" : "Select all shown"}</button>
          {selected.size > 0 && <button onClick={clearSelection} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: "rgba(31, 27, 22, 0.06)", color: "#1F1B16" }}>Clear</button>}
        </div>
      </div>
      <div className="space-y-2.5">
        {filtered.map((ex) => <ExerciseRow key={ex.id} exercise={ex} sessionExercise={applySessionDose(ex, movementProfile)} selected={selected.has(ex.id)} onToggle={() => toggle(ex.id)} onShow={() => onShowDetail(ex)} />)}
      </div>
      {selected.size > 0 && (
        <div className="fixed bottom-24 left-0 right-0 px-5 z-30 lg:bottom-6 lg:left-20">
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

function ExerciseRow({ exercise, sessionExercise, selected, onToggle, onShow }) {
  const dose = sessionExercise ?? exercise;
  return (
    <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: selected ? "rgba(184, 84, 58, 0.08)" : "rgba(255,255,255,0.5)", border: selected ? "1px solid rgba(184, 84, 58, 0.3)" : "1px solid rgba(31, 27, 22, 0.06)" }}>
      <button onClick={onToggle} className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: selected ? "#B8543A" : "transparent", border: selected ? "none" : "1.5px solid rgba(31, 27, 22, 0.2)" }} aria-label={selected ? "Deselect" : "Select"}>
        {selected && <Check className="w-3.5 h-3.5 text-white" />}
      </button>
      <button onClick={onShow} className="flex-1 flex items-center gap-3 text-left">
        <ExerciseGlyph exercise={exercise} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] truncate">{exercise.name}</div>
          <div className="text-xs text-stone-500 mt-0.5">{dose.reps} reps · {dose.holdSec}s hold · <span className="capitalize">{exercise.region}</span></div>
        </div>
        <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
      </button>
    </div>
  );
}

function ExerciseDetail({ exercise, movementProfile, onClose, onStart }) {
  const dose = applySessionDose(exercise, movementProfile);
  const dosing = getComfortDosing(movementProfile);
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(31, 27, 22, 0.5)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl p-6 relative" style={{ background: "#F4EFE6" }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(31, 27, 22, 0.06)" }} aria-label="Close"><X className="w-4 h-4" /></button>
        <ExerciseGlyph exercise={exercise} size="lg" className="mb-3" />
        <h3 className="text-2xl mb-1" style={{ fontFamily: "Fraunces", fontWeight: 600 }}>{exercise.name}</h3>
        <div className="text-xs text-stone-500 mb-5 capitalize">{exercise.region} · {dose.reps} reps · {dose.holdSec}s hold · {dosing.label.toLowerCase()} dose</div>
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

function SessionMode({ session, prefs, movementProfile, initialMovementProfile, sessionsToday, onComplete, onCancel, onTogglePref }) {
  // Phases: optional calibrate → rest (2s entry) → hold (4s) → rest (2s) → hold → ... → interstitial (10s) → next exercise → ... → summary
  // The single `rest` phase plays double-duty as exercise-entry settle AND between-rep recovery.
  const initialRestSec = exerciseRestSec(session.exercises[0]);
  const [phase, setPhase] = useState(() => (prefs.symmetryEnabled && prefs.mirrorEnabled ? "calibrate" : "rest"));
  const [exIdx, setExIdx] = useState(0);
  const [repIdx, setRepIdx] = useState(0);
  // Initialized to the first exercise rest duration because the session opens directly into the entry rest — if this
  // were 0, the advance effect would short-circuit out of rest before phase-mount could update it.
  const [secondsLeft, setSecondsLeft] = useState(() => (prefs.symmetryEnabled && prefs.mirrorEnabled ? null : initialRestSec));
  const [paused, setPaused] = useState(false);
  // Distinguishes the entry rest (no preceding hold) from the post-hold rest. Reset to true
  // on each exercise change.
  const restIsEntryRef = useRef(true);

  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const snapshotCanvasRef = useRef(null);
  const baselineSnapshotRef = useRef(null);

  const symEnabled = prefs.symmetryEnabled && prefs.mirrorEnabled;
  const { faceLandmarker, latestRef, status: trackerStatus } = useFaceLandmarker(symEnabled);

  const calibBufferRef = useRef([]);
  const calibBsBufferRef = useRef([]);
  const lastCalibLmRef = useRef(null);
  const neutralRef = useRef(null);
  const noiseRef = useRef(null);
  const neutralBsRef = useRef(null);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationStatus, setCalibrationStatus] = useState("Preparing tracker");
  const peakRepScoreRef = useRef(null);
  const [liveScore, setLiveScore] = useState(null);
  const [liveBalance, setLiveBalance] = useState(null);
  const [liveBaselineProgress, setLiveBaselineProgress] = useState(null);
  const [postureAligned, setPostureAligned] = useState(false);
  const [exerciseScores, setExerciseScores] = useState([]);
  const repScoresRef = useRef([]);
  const repBaselineProgressRef = useRef([]);
  const repInitialBaselineProgressRef = useRef([]);
  const repSnapshotsRef = useRef([]);
  const peakSnapshotRef = useRef(null);
  const peakDispRef = useRef(0);
  // Hold-window score accumulator: rep score = mean(symmetry across all valid frames during hold).
  // Honors sustained effort better than instantaneous peak, esp. on the affected side.
  const holdScoreSumRef = useRef(0);
  const holdScoreCountRef = useRef(0);
  const holdLeftSumRef = useRef(0);
  const holdRightSumRef = useRef(0);

  const startTimeRef = useRef(session.startedAt);
  const current = session.exercises[exIdx];
  const nextExercise = session.exercises[exIdx + 1] ?? null;
  const totalExercises = session.exercises.length;
  const currentReps = current.reps;
  const currentRestSec = exerciseRestSec(current);
  const currentHoldSec = exerciseHoldSec(current);
  const nextRestSec = exerciseRestSec(nextExercise);

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

  useEffect(() => {
    if (phase !== "calibrate") return;
    calibBufferRef.current = [];
    calibBsBufferRef.current = [];
    lastCalibLmRef.current = null;
    neutralRef.current = null;
    noiseRef.current = null;
    neutralBsRef.current = null;
    baselineSnapshotRef.current = null;
    setCalibrationProgress(0);
    setCalibrationStatus("Preparing tracker");
    speak(prefs.voiceEnabled, "Calibration. Center your face and stay relaxed.");
  }, [phase, prefs.voiceEnabled]);

  useEffect(() => {
    if (phase !== "calibrate") return;
    if (!symEnabled || cameraError || trackerStatus === "error") {
      setPhase("rest");
      setSecondsLeft(currentRestSec);
    }
  }, [phase, symEnabled, cameraError, trackerStatus, currentRestSec]);

  // Phase entry: set the timer and announce the phase.
  useEffect(() => {
    if (paused) return;
    if (phase === "hold") {
      peakRepScoreRef.current = null;
      peakSnapshotRef.current = null;
      peakDispRef.current = 0;
      holdScoreSumRef.current = 0;
      holdScoreCountRef.current = 0;
      holdLeftSumRef.current = 0;
      holdRightSumRef.current = 0;
      setLiveScore(null);
      setLiveBalance(null);
      setLiveBaselineProgress(null);
      speak(prefs.voiceEnabled, "Hold");
    } else if (phase === "rest") {
      if (restIsEntryRef.current) {
        // Entry rest: settle into the exercise before the first hold.
        speak(prefs.voiceEnabled, repIdx === 0 && exIdx === 0
          ? current.name + ". Resting pose. Stay relaxed."
          : current.name + ". Resting pose.");
      } else {
        // Post-hold rest: record this rep using the TIME-AVERAGED hold score; snapshot at peak movement.
        const avgScore = holdScoreCountRef.current > 0 ? holdScoreSumRef.current / holdScoreCountRef.current : null;
        if (avgScore != null) repScoresRef.current = [...repScoresRef.current, avgScore];
        if (holdScoreCountRef.current > 0) {
          const leftAvg = holdLeftSumRef.current / holdScoreCountRef.current;
          const rightAvg = holdRightSumRef.current / holdScoreCountRef.current;
          const progress = computeBaselineProgressFromDisplacements(current.id, leftAvg, rightAvg, movementProfile);
          const initialProgress = computeBaselineProgressFromDisplacements(current.id, leftAvg, rightAvg, initialMovementProfile);
          if (progress) repBaselineProgressRef.current = [...repBaselineProgressRef.current, progress];
          if (initialProgress) repInitialBaselineProgressRef.current = [...repInitialBaselineProgressRef.current, initialProgress];
        }
        const snap = peakSnapshotRef.current ?? captureSnapshot(videoRef.current, snapshotCanvasRef.current);
        if (snap) repSnapshotsRef.current = [...repSnapshotsRef.current, { ts: Date.now(), score: avgScore, dataUrl: snap }];
        speak(prefs.voiceEnabled, "Resting pose");
      }
    } else if (phase === "interstitial") {
      speak(prefs.voiceEnabled, "Nice work. Take a breath.");
    }
  }, [phase, exIdx, repIdx]);

  useEffect(() => {
    if (paused || phase === "summary" || phase === "calibrate") return;
    if (secondsLeft <= 0) {
      // Each branch sets BOTH the new phase and the new timer in one batch — otherwise the advance
      // effect would re-fire with stale secondsLeft = 0 and skip past the just-entered phase.
      if (phase === "hold") {
        setPhase("rest");
        setSecondsLeft(currentRestSec);
      } else if (phase === "rest") {
        if (restIsEntryRef.current) {
          restIsEntryRef.current = false;
          setPhase("hold");
          setSecondsLeft(currentHoldSec);
        } else if (repIdx + 1 < currentReps) {
          setRepIdx(repIdx + 1);
          setPhase("hold");
          setSecondsLeft(currentHoldSec);
        } else {
          // End of exercise — finalize per-exercise scores
          const scores = repScoresRef.current;
          const baselineProgress = summarizeBaselineProgress(repBaselineProgressRef.current);
          const initialBaselineProgress = summarizeBaselineProgress(repInitialBaselineProgressRef.current);
          const snapshots = repSnapshotsRef.current;
          const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
          setExerciseScores((prev) => [...prev, { exerciseId: current.id, name: current.name, region: current.region, repsTarget: current.reps, holdSec: current.holdSec, restSec: current.restSec, comfortLevel: current.comfortLevel, baselineSnapshot: baselineSnapshotRef.current, scores, avg, snapshots, baselineProgress, initialBaselineProgress }]);
          repScoresRef.current = [];
          repBaselineProgressRef.current = [];
          repInitialBaselineProgressRef.current = [];
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
        setSecondsLeft(nextRestSec);
      }
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, paused, phase]);

  // FaceLandmarker detection + overlay loop — synchronous detectForVideo, runs continuously so the overlay stays live
  useEffect(() => {
    if (!faceLandmarker || !videoRef.current) return;
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

          if (phase === "calibrate") {
            const alignment = faceAlignmentFeedback(lm);
            const aligned = alignment.aligned;
            setPostureAligned((prev) => (prev === aligned ? prev : aligned));
            if (!neutralRef.current) {
              if (!aligned) {
                calibBufferRef.current = [];
                calibBsBufferRef.current = [];
                lastCalibLmRef.current = null;
                setCalibrationProgress(0);
                setCalibrationStatus(alignment.label);
              } else {
                const delta = lastCalibLmRef.current ? normalizedFrameDelta(lm, lastCalibLmRef.current) : 0;
                lastCalibLmRef.current = lm;
                if (delta > CALIBRATION_RESET_EPS) {
                  calibBufferRef.current = [lm];
                  calibBsBufferRef.current = [bsMap];
                  setCalibrationProgress(1);
                  setCalibrationStatus(calibrationPrompt(1, delta));
                } else {
                  if (calibBufferRef.current.length < CALIBRATION_FRAMES) {
                    calibBufferRef.current.push(lm);
                    calibBsBufferRef.current.push(bsMap);
                  }
                  const progress = calibBufferRef.current.length;
                  setCalibrationProgress((prev) => (prev === progress ? prev : progress));
                  setCalibrationStatus(calibrationPrompt(progress, delta));
                  if (progress >= CALIBRATION_FRAMES) {
                    const neutral = averageLandmarks(calibBufferRef.current);
                    neutralRef.current = neutral;
                    noiseRef.current = computeNoiseFloor(calibBufferRef.current, neutral);
                    neutralBsRef.current = averageBlendshapes(calibBsBufferRef.current);
                    baselineSnapshotRef.current = captureSnapshot(v, snapshotCanvasRef.current);
                    restIsEntryRef.current = true;
                    setPhase("rest");
                    setSecondsLeft(currentRestSec);
                  }
                }
              }
            }
          } else if (phase === "hold") {
            // Brow exercises: pitch-invariant brow-to-eye gap delta.
            // Nose exercises: aperture widening + upward ala lift (handles both wrinkle and flare).
            // Other exercises: face-local landmark-pair displacement with per-landmark noise
            // subtracted out. Fallback: generic 9-pair.
            const symResult = computeExerciseSymmetry(current.id, lm, neutralRef.current, noiseRef.current, bsMap, neutralBsRef.current);
            if (symResult != null) {
              const profileThreshold = effectiveProfileThreshold(current.id, getProfileExercise(movementProfile, current.id)?.activationThreshold);
              const activated = !profileThreshold || symResult.peak >= profileThreshold;
              if (activated) {
                setLiveScore(symResult.symmetry);
                setLiveBalance({ left: symResult.leftDisp, right: symResult.rightDisp });
                // Time-average accumulator — every valid frame contributes equally to the rep score.
                // A saved movement profile raises this from generic movement to user-scaled movement.
                holdScoreSumRef.current += symResult.symmetry;
                holdScoreCountRef.current++;
                holdLeftSumRef.current += symResult.leftDisp;
                holdRightSumRef.current += symResult.rightDisp;
                setLiveBaselineProgress(computeBaselineProgress(current.id, symResult, movementProfile));
                if (peakRepScoreRef.current == null || symResult.symmetry > peakRepScoreRef.current) {
                  peakRepScoreRef.current = symResult.symmetry;
                }
              } else {
                setLiveScore(null);
                setLiveBalance(null);
                setLiveBaselineProgress(null);
              }
            }
            // Auto-advance gate AND snapshot trigger. For brow exercises, the brow-lift magnitude is more
            // precise than the blendshape (subtle lifts saturate browOuterUp poorly).
            let activation;
            if ((isBrow || isNose) && symResult) activation = symResult.peak;
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
          if (phase === "calibrate") {
            calibBufferRef.current = [];
            calibBsBufferRef.current = [];
            lastCalibLmRef.current = null;
            baselineSnapshotRef.current = null;
            setCalibrationProgress(0);
            setCalibrationStatus("Find your face in the camera");
          }
          drawOverlay(overlayRef.current, v, null, { aligned: false, phase });
        }
      } catch {
        // Detection is best-effort; transient MediaPipe/video frame errors should not end a session.
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [faceLandmarker, phase, current.id, currentRestSec, movementProfile]);

  const handleSkipExercise = () => {
    flushSpeech();
    const scores = repScoresRef.current;
    const baselineProgress = summarizeBaselineProgress(repBaselineProgressRef.current);
    const initialBaselineProgress = summarizeBaselineProgress(repInitialBaselineProgressRef.current);
    const snapshots = repSnapshotsRef.current;
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    setExerciseScores((prev) => [...prev, { exerciseId: current.id, name: current.name, region: current.region, repsTarget: current.reps, holdSec: current.holdSec, restSec: current.restSec, comfortLevel: current.comfortLevel, baselineSnapshot: baselineSnapshotRef.current, scores, avg, snapshots, baselineProgress, initialBaselineProgress }]);
    repScoresRef.current = [];
    repBaselineProgressRef.current = [];
    repInitialBaselineProgressRef.current = [];
    repSnapshotsRef.current = [];
    if (exIdx + 1 < totalExercises) { setExIdx(exIdx + 1); setRepIdx(0); restIsEntryRef.current = true; setPhase("rest"); setSecondsLeft(nextRestSec); }
    else setPhase("summary");
  };

  const skipCalibration = () => {
    flushSpeech();
    calibBufferRef.current = [];
    calibBsBufferRef.current = [];
    lastCalibLmRef.current = null;
    neutralRef.current = null;
    noiseRef.current = null;
    neutralBsRef.current = null;
    baselineSnapshotRef.current = captureSnapshot(videoRef.current, snapshotCanvasRef.current);
    restIsEntryRef.current = true;
    setCalibrationProgress(0);
    setCalibrationStatus("Scoring skipped");
    setPhase("rest");
    setSecondsLeft(currentRestSec);
  };

  const nextInterstitial = () => { flushSpeech(); setSecondsLeft(0); };

  const handleFinish = () => {
    const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
    const validAvgs = exerciseScores.map((e) => e.avg).filter((v) => v != null);
    const sessionAvg = validAvgs.length > 0 ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length : null;
    const baselineProgress = summarizeSessionBaselineProgress(exerciseScores);
    const initialBaselineProgress = summarizeSessionBaselineProgress(exerciseScores, "initialBaselineProgress");
    onComplete({ date: todayISO(), duration, exercises: exerciseScores.map((e) => e.exerciseId), scores: exerciseScores, sessionAvg, baselineProgress, initialBaselineProgress, baselineSnapshot: baselineSnapshotRef.current, comfortLevel: session.comfortLevel, kind: session.kind ?? (exerciseScores.length > 1 ? "session" : "practice"), ts: Date.now() });
  };

  if (phase === "summary") return <SessionSummary scores={exerciseScores} sessionsToday={sessionsToday} dailyGoal={prefs.dailyGoal ?? 3} kind={session.kind} startedAt={session.startedAt} comfortLevel={session.comfortLevel} baselineProgress={summarizeSessionBaselineProgress(exerciseScores)} initialBaselineProgress={summarizeSessionBaselineProgress(exerciseScores, "initialBaselineProgress")} onFinish={handleFinish} />;
  if (phase === "interstitial") {
    return (
      <InterstitialView
        just={exerciseScores[exerciseScores.length - 1]}
        nextExercise={nextExercise}
        secondsLeft={secondsLeft}
        exIdx={exIdx + 1}
        totalExercises={totalExercises}
        onNext={nextInterstitial}
        onCancel={onCancel}
      />
    );
  }

  const phaseTone = {
    calibrate: { tag: "CALIBRATING", title: "Stay relaxed", prompt: calibrationStatus, color: "#D4A574", verb: "calibrate" },
    hold: { tag: "HOLD THE POSE", title: current.name, prompt: current.instruction, color: "#B8543A", verb: "contract" },
    rest: { tag: "RESTING POSE",  title: current.name, prompt: current.instruction, color: "#7A8F73", verb: "rest" },
  }[phase];
  const calibrationPct = Math.round((calibrationProgress / CALIBRATION_FRAMES) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch lg:items-center lg:justify-center lg:p-6" style={{ background: "rgba(12,10,8,0.92)" }}>
      <div className="flex flex-col w-full h-full lg:w-[440px] lg:h-[860px] lg:max-h-[92vh] lg:rounded-3xl lg:overflow-hidden lg:shadow-2xl" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
      <div className="flex items-center justify-between p-4 shrink-0">
        <button onClick={onCancel} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(244, 239, 230, 0.1)" }} aria-label="End"><X className="w-5 h-5" /></button>
        <div className="text-xs opacity-70">Exercise {exIdx + 1} of {totalExercises}</div>
        <div className="flex gap-2">
          <button onClick={() => { if (!prefs.voiceEnabled) primeSpeech(true); else flushSpeech(); onTogglePref("voiceEnabled"); }} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(244, 239, 230, 0.1)" }} aria-label="Toggle voice">{prefs.voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}</button>
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
          <div className="absolute top-4 right-4"><RealtimeFeedback symmetry={liveScore} balance={liveBalance} baseline={liveBaselineProgress} /></div>
        )}


        {(phase === "hold" || phase === "rest" || phase === "calibrate") && (
          <div className="absolute inset-x-0 top-0 h-1.5 transition-colors duration-300" style={{ background: phaseTone.color }} />
        )}

        <div className="absolute inset-0 flex flex-col justify-end pointer-events-none">
          <div className="p-6 pb-4" style={{ background: "linear-gradient(to top, rgba(31,27,22,0.95) 0%, rgba(31,27,22,0.7) 60%, transparent 100%)" }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full" style={{ background: phaseTone.color, color: "#1F1B16" }}>
                {phaseTone.tag}
              </div>
              <div className="text-xs opacity-70">Rep {repIdx + 1} / {currentReps}</div>
            </div>
            <div className="text-5xl mb-1" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>
              {phaseTone.title}
            </div>
            <div className="text-7xl tabular-nums transition-colors duration-300" style={{ fontFamily: "Fraunces", fontWeight: 600, color: phaseTone.color }}>
              {phase === "calibrate" ? `${calibrationPct}%` : (secondsLeft || "·")}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 shrink-0" style={{ borderTop: phase === "hold" || phase === "rest" || phase === "calibrate" ? `2px solid ${phaseTone.color}` : "2px solid transparent", transition: "border-color 300ms" }}>
        <div className="text-sm mb-4 leading-relaxed min-h-[2.5em]" style={{ color: phase === "rest" || phase === "hold" || phase === "calibrate" ? phaseTone.color : "rgba(244,239,230,0.8)" }}>
          {phaseTone.prompt}
        </div>
        <div className="flex gap-3">
          <button onClick={() => { setPaused((p) => { if (!p) flushSpeech(); return !p; }); }} className="flex-1 rounded-full py-3 flex items-center justify-center gap-2 font-semibold" style={{ background: "rgba(244, 239, 230, 0.15)", color: "#F4EFE6" }}>
            {paused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}{paused ? "Resume" : "Pause"}
          </button>
          <button onClick={phase === "calibrate" ? skipCalibration : handleSkipExercise} className="flex-1 rounded-full py-3 flex items-center justify-center gap-2 font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>{phase === "calibrate" ? "Start unscored" : "Skip"}<ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
      </div>
    </div>
  );
}

function emptyAssessmentFrameStats() {
  return { frames: 0, holdFrames: 0, alignedFrames: 0, leftSum: 0, rightSum: 0, symSum: 0, leftPeak: 0, rightPeak: 0, symPeak: null, samples: [] };
}

function finalizeAssessmentStats(stat, exercise) {
  const frames = stat.frames;
  const robust = robustMovementWindow(stat.samples, PROFILE_BASELINE_TOP_FRACTION);
  const quality = exerciseBaselineQuality(stat);
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    region: exercise.region,
    frames,
    holdFrames: stat.holdFrames ?? frames,
    alignedFrames: stat.alignedFrames ?? 0,
    neutralFrames: stat.neutralFrames ?? 0,
    neutralSource: stat.neutralSource ?? "global",
    quality,
    leftAvg: frames ? stat.leftSum / frames : null,
    rightAvg: frames ? stat.rightSum / frames : null,
    symAvg: frames ? stat.symSum / frames : null,
    leftRobustAvg: robust?.left ?? null,
    rightRobustAvg: robust?.right ?? null,
    symRobustAvg: robust?.symmetry ?? null,
    robustPeakAvg: robust?.peak ?? null,
    baselineFrames: robust?.count ?? 0,
    baselineMethod: robust ? `top-${Math.round(PROFILE_BASELINE_TOP_FRACTION * 100)}-movement-mean` : "mean",
    leftPeak: stat.leftPeak,
    rightPeak: stat.rightPeak,
    symPeak: stat.symPeak,
  };
}

function ProfileAssessment({ existingProfile, retakeExerciseIds, onComplete, onSkip }) {
  const retakeIds = [...new Set((retakeExerciseIds ?? []).filter((id) => EXERCISE_BY_ID.has(id)))];
  const isPartialRetake = retakeIds.length > 0;
  const exerciseIds = isPartialRetake ? retakeIds : PROFILE_ASSESSMENT_EXERCISES;
  const exercises = exerciseIds.map((id) => EXERCISE_BY_ID.get(id)).filter(Boolean);
  const [phase, setPhase] = useState("intro");
  const [affectedSide, setAffectedSide] = useState("unsure");
  const [comfortLevel, setComfortLevel] = useState("gentle");
  const [exIdx, setExIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(PROFILE_REST_SEC);
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [postureAligned, setPostureAligned] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationStatus, setCalibrationStatus] = useState("Preparing tracker");
  const [restStatus, setRestStatus] = useState("Relax your face before the movement.");
  const [liveScore, setLiveScore] = useState(null);
  const [liveBalance, setLiveBalance] = useState(null);
  const [exerciseStats, setExerciseStats] = useState([]);
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const neutralRef = useRef(null);
  const noiseRef = useRef(null);
  const neutralBsRef = useRef(null);
  const calibBufferRef = useRef([]);
  const calibBsBufferRef = useRef([]);
  const lastCalibLmRef = useRef(null);
  const exerciseNeutralRef = useRef(null);
  const exerciseNoiseRef = useRef(null);
  const exerciseNeutralBsRef = useRef(null);
  const restBufferRef = useRef([]);
  const restBsBufferRef = useRef([]);
  const restRetryRef = useRef(0);
  const statRef = useRef(emptyAssessmentFrameStats());
  const activeCamera = phase !== "intro" && phase !== "summary";
  const { faceLandmarker, latestRef, status: trackerStatus } = useFaceLandmarker(activeCamera);
  const current = exercises[exIdx] ?? exercises[0];
  const scoredStats = exerciseStats.map((s) => s.symAvg).filter((v) => v != null);
  const summaryAvg = scoredStats.length ? scoredStats.reduce((sum, v) => sum + v, 0) / scoredStats.length : null;
  const retakeCount = exerciseStats.filter((s) => s.quality?.key === "retake").length;

  useEffect(() => {
    if (!activeCamera) return;
    let alive = true;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((s) => { if (!alive) { s.getTracks().forEach((t) => t.stop()); return; } setStream(s); if (videoRef.current) videoRef.current.srcObject = s; })
      .catch((err) => setCameraError(err.message || "Camera unavailable"));
    return () => { alive = false; };
  }, [activeCamera]);

  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream, exIdx]);

  useEffect(() => {
    if (!activeCamera && stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  }, [activeCamera, stream]);

  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  useEffect(() => {
    if (phase !== "calibrate") return;
    neutralRef.current = null;
    noiseRef.current = null;
    neutralBsRef.current = null;
    calibBufferRef.current = [];
    calibBsBufferRef.current = [];
    lastCalibLmRef.current = null;
    setCalibrationProgress(0);
    setCalibrationStatus("Preparing tracker");
  }, [phase]);

  useEffect(() => {
    if (phase !== "hold") return;
    statRef.current = emptyAssessmentFrameStats();
    statRef.current.neutralFrames = restBufferRef.current.length;
    statRef.current.neutralSource = exerciseNeutralRef.current ? "exercise-rest" : "global";
    setLiveScore(null);
    setLiveBalance(null);
  }, [phase, exIdx]);

  useEffect(() => {
    if (phase !== "rest") return;
    restRetryRef.current = 0;
    restBufferRef.current = [];
    restBsBufferRef.current = [];
    exerciseNeutralRef.current = null;
    exerciseNoiseRef.current = null;
    exerciseNeutralBsRef.current = null;
    setRestStatus("Relax your face. Capturing a neutral baseline for this exercise.");
  }, [phase, exIdx]);

  useEffect(() => {
    if (phase !== "rest" && phase !== "hold") return;
    if (secondsLeft <= 0) {
      if (phase === "rest") {
        const restFrames = restBufferRef.current;
        if (restFrames.length < PROFILE_EXERCISE_NEUTRAL_MIN_FRAMES && restRetryRef.current < PROFILE_REST_RETRY_LIMIT) {
          restRetryRef.current += 1;
          setRestStatus("Need a steadier neutral pose before this movement. Center your face and stay relaxed.");
          setSecondsLeft(PROFILE_REST_SEC);
          return;
        }
        if (restFrames.length >= PROFILE_EXERCISE_NEUTRAL_MIN_FRAMES) {
          const exerciseNeutral = averageLandmarks(restFrames);
          exerciseNeutralRef.current = exerciseNeutral;
          exerciseNoiseRef.current = computeNoiseFloor(restFrames, exerciseNeutral);
          exerciseNeutralBsRef.current = averageBlendshapes(restBsBufferRef.current);
        } else {
          exerciseNeutralRef.current = null;
          exerciseNoiseRef.current = null;
          exerciseNeutralBsRef.current = null;
        }
        setPhase("hold");
        setSecondsLeft(PROFILE_HOLD_SEC);
      } else {
        const stat = finalizeAssessmentStats(statRef.current, current);
        setExerciseStats((prev) => [...prev, stat]);
        if (exIdx + 1 < exercises.length) {
          setExIdx((idx) => idx + 1);
          setPhase("rest");
          setSecondsLeft(PROFILE_REST_SEC);
        } else {
          setPhase("summary");
        }
      }
      return;
    }
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, secondsLeft, exIdx, current, exercises.length]);

  useEffect(() => {
    if (!faceLandmarker || !videoRef.current || !activeCamera) return;
    let raf, alive = true, lastTs = 0;
    const tick = () => {
      if (!alive) return;
      const v = videoRef.current;
      if (!v || v.readyState < 2 || v.paused) { raf = requestAnimationFrame(tick); return; }
      try {
        const ts = Math.max(lastTs + 1, performance.now());
        lastTs = ts;
        const result = faceLandmarker.detectForVideo(v, ts);
        const rawLm = result.faceLandmarks?.[0];
        const bsArr = result.faceBlendshapes?.[0]?.categories;
        if (rawLm) {
          const lm = smoothLandmarks(latestRef.current?.landmarks, rawLm);
          const bsMap = {};
          if (bsArr) for (const c of bsArr) bsMap[c.categoryName] = c.score;
          latestRef.current = { landmarks: lm, blendshapes: bsMap };
          const alignment = faceAlignmentFeedback(lm);
          const aligned = alignment.aligned;
          setPostureAligned((prev) => (prev === aligned ? prev : aligned));

          if (phase === "calibrate") {
            if (!aligned) {
              calibBufferRef.current = [];
              calibBsBufferRef.current = [];
              lastCalibLmRef.current = null;
              setCalibrationProgress(0);
              setCalibrationStatus(alignment.label);
            } else {
              const delta = lastCalibLmRef.current ? normalizedFrameDelta(lm, lastCalibLmRef.current) : 0;
              lastCalibLmRef.current = lm;
              if (delta > CALIBRATION_RESET_EPS) {
                calibBufferRef.current = [lm];
                calibBsBufferRef.current = [bsMap];
                setCalibrationProgress(1);
                setCalibrationStatus(calibrationPrompt(1, delta));
              } else {
                if (calibBufferRef.current.length < CALIBRATION_FRAMES) {
                  calibBufferRef.current.push(lm);
                  calibBsBufferRef.current.push(bsMap);
                }
                const progress = calibBufferRef.current.length;
                setCalibrationProgress((prev) => (prev === progress ? prev : progress));
                setCalibrationStatus(calibrationPrompt(progress, delta));
                if (progress >= CALIBRATION_FRAMES) {
                  const neutral = averageLandmarks(calibBufferRef.current);
                  neutralRef.current = neutral;
                  noiseRef.current = computeNoiseFloor(calibBufferRef.current, neutral);
                  neutralBsRef.current = averageBlendshapes(calibBsBufferRef.current);
                  setPhase("rest");
                  setSecondsLeft(PROFILE_REST_SEC);
                }
              }
            }
          } else if (phase === "rest") {
            if (aligned) {
              restBufferRef.current.push(lm);
              restBsBufferRef.current.push(bsMap);
              const count = restBufferRef.current.length;
              const remaining = Math.max(0, PROFILE_EXERCISE_NEUTRAL_MIN_FRAMES - count);
              setRestStatus(remaining > 0
                ? `Hold neutral for this exercise. ${remaining} more steady frame${remaining === 1 ? "" : "s"}.`
                : "Exercise neutral captured. Keep relaxed until the movement starts.");
            } else {
              setRestStatus(`${alignment.label} so this exercise gets its own baseline.`);
            }
          } else if (phase === "hold") {
            const stat = statRef.current;
            stat.holdFrames++;
            if (aligned) stat.alignedFrames++;
            const neutral = exerciseNeutralRef.current ?? neutralRef.current;
            const noise = exerciseNoiseRef.current ?? noiseRef.current;
            const neutralBs = exerciseNeutralBsRef.current ?? neutralBsRef.current;
            const sym = computeExerciseSymmetry(current.id, lm, neutral, noise, bsMap, neutralBs);
            if (sym) {
              stat.frames++;
              stat.leftSum += sym.leftDisp;
              stat.rightSum += sym.rightDisp;
              stat.symSum += sym.symmetry;
              stat.leftPeak = Math.max(stat.leftPeak, sym.leftDisp);
              stat.rightPeak = Math.max(stat.rightPeak, sym.rightDisp);
              stat.symPeak = stat.symPeak == null ? sym.symmetry : Math.max(stat.symPeak, sym.symmetry);
              stat.samples.push({ left: sym.leftDisp, right: sym.rightDisp, symmetry: sym.symmetry, peak: sym.peak });
              setLiveScore(sym.symmetry);
              setLiveBalance({ left: sym.leftDisp, right: sym.rightDisp });
            }
          }
          drawOverlay(overlayRef.current, v, lm, { aligned, phase });
        } else {
          latestRef.current = null;
          if (phase === "calibrate") {
            calibBufferRef.current = [];
            calibBsBufferRef.current = [];
            lastCalibLmRef.current = null;
            setCalibrationProgress(0);
            setCalibrationStatus("Find your face in the camera");
          } else if (phase === "rest") {
            setRestStatus("Find your face in the camera so this exercise gets its own baseline.");
          }
          drawOverlay(overlayRef.current, v, null, { aligned: false, phase });
        }
      } catch {
        // Best-effort assessment; transient frame/model errors should not close the flow.
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [activeCamera, faceLandmarker, latestRef, phase, current.id]);

  const handleBegin = () => {
    setExerciseStats([]);
    setExIdx(0);
    setSecondsLeft(PROFILE_REST_SEC);
    restBufferRef.current = [];
    restBsBufferRef.current = [];
    exerciseNeutralRef.current = null;
    exerciseNoiseRef.current = null;
    exerciseNeutralBsRef.current = null;
    setPhase("calibrate");
  };

  const handleSave = () => {
    const profile = buildMovementProfile({
      neutral: neutralRef.current,
      noise: noiseRef.current,
      exerciseStats,
      affectedSide: isPartialRetake ? existingProfile?.affectedSide ?? affectedSide : affectedSide,
      comfortLevel: isPartialRetake ? existingProfile?.comfortLevel ?? comfortLevel : comfortLevel,
    });
    onComplete(profile, { retakeExerciseIds: isPartialRetake ? exerciseIds : null });
  };

  if (phase === "intro") {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-5" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
        <div className="max-w-md w-full max-h-[92vh] overflow-y-auto pr-1">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-3">Personal baseline</div>
          <h2 className="text-4xl mb-3" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>{isPartialRetake ? "Retake selected baselines." : "Let's understand your face first."}</h2>
          <p className="text-sm leading-relaxed opacity-75 mb-6">{isPartialRetake ? "Mirror will recalibrate neutral and replace only the selected exercise baselines in your existing profile." : "Mirror will capture a neutral pose and every exercise movement. This creates a local movement profile for future personalization."}</p>

          {!isPartialRetake && <div className="space-y-5 mb-7">
            <div>
              <div className="text-sm font-semibold mb-2">Affected side</div>
              <div className="grid grid-cols-4 gap-2">
                {["left", "right", "both", "unsure"].map((side) => (
                  <button key={side} onClick={() => setAffectedSide(side)} className="rounded-full py-2 text-xs font-semibold capitalize" style={{ background: affectedSide === side ? "#B8543A" : "rgba(244,239,230,0.08)", color: "#F4EFE6", border: affectedSide === side ? "none" : "1px solid rgba(244,239,230,0.14)" }}>{side}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold mb-2">Comfort level</div>
              <div className="grid grid-cols-3 gap-2">
                {["gentle", "normal", "advanced"].map((level) => (
                  <button key={level} onClick={() => setComfortLevel(level)} className="rounded-full py-2 text-xs font-semibold capitalize" style={{ background: comfortLevel === level ? "#7A8F73" : "rgba(244,239,230,0.08)", color: "#F4EFE6", border: comfortLevel === level ? "none" : "1px solid rgba(244,239,230,0.14)" }}>{level}</button>
                ))}
              </div>
            </div>
          </div>}

          <div className="rounded-2xl p-4 mb-6" style={{ background: "rgba(244,239,230,0.06)", border: "1px solid rgba(244,239,230,0.08)" }}>
            <div className="text-xs uppercase tracking-wider opacity-60 mb-3">{isPartialRetake ? "Retake set" : "Assessment set"}</div>
            <div className="grid grid-cols-6 gap-2">
              {exercises.map((ex) => <ExerciseGlyph key={ex.id} exercise={ex} size="xs" tone="dark" className="mx-auto" />)}
            </div>
            <div className="text-xs opacity-55 mt-3">{exercises.length} movements · about {Math.ceil(exercises.length * (PROFILE_REST_SEC + PROFILE_HOLD_SEC) / 60)} minutes</div>
          </div>

          <div className="flex gap-3">
            <button onClick={onSkip} className="flex-1 rounded-full py-3 font-semibold" style={{ background: "rgba(244,239,230,0.12)", color: "#F4EFE6" }}>Skip</button>
            <button onClick={handleBegin} className="flex-1 rounded-full py-3 font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>{isPartialRetake ? "Start retake" : "Start baseline"}</button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "summary") {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-5" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
        <div className="max-w-md w-full max-h-[92vh] overflow-y-auto pr-1">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-3">Baseline complete</div>
          <h2 className="text-4xl mb-3" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>{isPartialRetake ? "Selected baselines ready." : "Movement profile ready."}</h2>
          <p className="text-sm leading-relaxed opacity-75 mb-6">{isPartialRetake ? "Only these exercise baselines will replace the matching movements in your current profile." : "This profile is saved locally and can be used to personalize thresholds and track progress from your starting point."}</p>
          {summaryAvg != null && (
            <div className="text-center mb-6">
              <div className="text-7xl tabular-nums" style={{ fontFamily: "Fraunces", fontWeight: 600, color: scoreColor(summaryAvg), letterSpacing: "-0.03em" }}>{displayPct(summaryAvg)}%</div>
              <div className="text-xs opacity-60 mt-1">initial average symmetry</div>
            </div>
          )}
          {retakeCount > 0 && (
            <div className="rounded-2xl p-3 mb-4 text-xs" style={{ background: "rgba(212,165,116,0.14)", color: "#F6D8B2", border: "1px solid rgba(212,165,116,0.2)" }}>
              {retakeCount} baseline movement{retakeCount === 1 ? "" : "s"} had low-quality capture. You can still save this profile, but those exercises should be retaken later.
            </div>
          )}
          <div className="space-y-2 mb-6">
            {exerciseStats.map((stat) => (
              <div key={stat.exerciseId} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: "rgba(244,239,230,0.06)" }}>
                <ExerciseGlyph exerciseId={stat.exerciseId} region={stat.region} size="xs" tone="dark" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{stat.name}</div>
                  <div className="text-xs opacity-55">{stat.frames} scored frame{stat.frames === 1 ? "" : "s"} · baseline: {stat.baselineFrames || 0} robust frame{stat.baselineFrames === 1 ? "" : "s"} · neutral: {stat.neutralSource === "exercise-rest" ? `${stat.neutralFrames} rest frames` : "global"} · limited side: {inferLimitedSide(stat.leftPeak, stat.rightPeak)}</div>
                  {stat.quality && (
                    <div className="text-[11px] mt-0.5" style={{ color: stat.quality.key === "strong" ? "#A8C39F" : stat.quality.key === "usable" ? "#F6D8B2" : "#FFB48F" }}>
                      {stat.quality.label}{stat.quality.issues?.length ? ` · ${stat.quality.issues.join(", ")}` : ""}
                    </div>
                  )}
                </div>
                {stat.symAvg != null ? <div className="text-lg tabular-nums" style={{ fontFamily: "Fraunces", color: scoreColor(stat.symAvg) }}>{displayPct(stat.symAvg)}%</div> : <div className="text-xs opacity-45">—</div>}
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={handleBegin} className="flex-1 rounded-full py-3 font-semibold" style={{ background: "rgba(244,239,230,0.12)", color: "#F4EFE6" }}>Redo</button>
            <button onClick={handleSave} className="flex-1 rounded-full py-3 font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>{isPartialRetake ? "Save retake" : "Save profile"}</button>
          </div>
        </div>
      </div>
    );
  }

  const calibrationPct = Math.round((calibrationProgress / CALIBRATION_FRAMES) * 100);
  const phaseTone = phase === "calibrate"
    ? { tag: "CALIBRATING", title: "Stay relaxed", prompt: calibrationStatus, color: "#D4A574" }
    : phase === "hold"
      ? { tag: "ASSESS", title: current.name, prompt: current.instruction, color: "#B8543A" }
      : { tag: "REST", title: current.name, prompt: restStatus, color: "#7A8F73" };

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch lg:items-center lg:justify-center lg:p-6" style={{ background: "rgba(12,10,8,0.92)" }}>
      <div className="flex flex-col w-full h-full lg:w-[440px] lg:h-[860px] lg:max-h-[92vh] lg:rounded-3xl lg:overflow-hidden lg:shadow-2xl" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
        <div className="flex items-center justify-between p-4 shrink-0">
          <button onClick={onSkip} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(244, 239, 230, 0.1)" }} aria-label="Skip baseline"><X className="w-5 h-5" /></button>
          <div className="text-xs opacity-70">{phase === "calibrate" ? "Neutral baseline" : `Exercise ${exIdx + 1} of ${exercises.length}`}</div>
          <div className="w-10" />
        </div>

        <div className="px-4 pb-2 shrink-0">
          <TrackerStatusPill status={cameraError ? "error" : trackerStatus} liveScore={liveScore} phase={phase} />
        </div>

        <div className="flex-1 relative overflow-hidden">
          {!cameraError ? (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
              <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center opacity-60 px-6"><CameraOff className="w-10 h-10 mx-auto mb-3" /><div className="text-sm">{cameraError}</div></div>
            </div>
          )}

          {!cameraError && trackerStatus === "ready" && (
            <div className="absolute top-4 left-4 px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ background: postureAligned ? "rgba(122,143,115,0.85)" : "rgba(212,165,116,0.85)", color: "#1F1B16" }}>
              {postureAligned ? "Posture · centered" : "Center your face in the ring"}
            </div>
          )}

          {phase === "hold" && liveScore != null && (
            <div className="absolute top-4 right-4"><RealtimeFeedback symmetry={liveScore} balance={liveBalance} /></div>
          )}

          <div className="absolute inset-x-0 top-0 h-1.5 transition-colors duration-300" style={{ background: phaseTone.color }} />
          <div className="absolute inset-0 flex flex-col justify-end pointer-events-none">
            <div className="p-6 pb-4" style={{ background: "linear-gradient(to top, rgba(31,27,22,0.95) 0%, rgba(31,27,22,0.7) 60%, transparent 100%)" }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full" style={{ background: phaseTone.color, color: "#1F1B16" }}>{phaseTone.tag}</div>
                {phase !== "calibrate" && <div className="text-xs opacity-70">{current.region}</div>}
              </div>
              <div className="text-5xl mb-1" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>{phaseTone.title}</div>
              <div className="text-7xl tabular-nums transition-colors duration-300" style={{ fontFamily: "Fraunces", fontWeight: 600, color: phaseTone.color }}>
                {phase === "calibrate" ? `${calibrationPct}%` : (secondsLeft || "·")}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 shrink-0" style={{ borderTop: `2px solid ${phaseTone.color}` }}>
          <div className="text-sm mb-4 leading-relaxed min-h-[2.5em]" style={{ color: phaseTone.color }}>{phaseTone.prompt}</div>
          <button onClick={onSkip} className="w-full rounded-full py-3 font-semibold" style={{ background: "rgba(244,239,230,0.12)", color: "#F4EFE6" }}>Skip baseline</button>
        </div>
      </div>
    </div>
  );
}

function TrackerStatusPill({ status, liveScore, phase }) {
  let icon, label, color;
  if (status === "loading") { icon = <Loader2 className="w-3 h-3 animate-spin" />; label = "Loading symmetry tracker…"; color = "#D4A574"; }
  else if (status === "error") { icon = <AlertCircle className="w-3 h-3" />; label = "Tracker unavailable — session continues without scoring"; color = "#A8A29E"; }
  else if (status === "ready" && phase === "calibrate") {
    icon = <Loader2 className="w-3 h-3 animate-spin" />;
    label = "Calibrating neutral pose";
    color = "#D4A574";
  }
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

function RealtimeFeedback({ symmetry, balance, baseline }) {
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
      {baseline && (
        <div className="text-[9px] mt-1.5 text-center pt-1.5" style={{ color: "#F4EFE6", borderTop: "1px solid rgba(244,239,230,0.12)", opacity: 0.78 }}>
          {baseline.side} · {baselineProgressLabel(baseline)}
        </div>
      )}
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

let speechTimer = null;
let lastSpeechText = "";
let lastSpeechAt = 0;
let cachedSpeechVoice = null;

function getSpeechSynth() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

function getSpeechVoice(synth) {
  if (cachedSpeechVoice) return cachedSpeechVoice;
  const voices = synth?.getVoices?.() ?? [];
  cachedSpeechVoice = voices.find((v) => /^en(-|_)/i.test(v.lang) && v.localService) || voices.find((v) => /^en(-|_)/i.test(v.lang)) || voices[0] || null;
  return cachedSpeechVoice;
}

function makeSpeechUtterance(text) {
  const synth = getSpeechSynth();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = getSpeechVoice(synth);
  if (voice) utterance.voice = voice;
  utterance.rate = 0.92;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  return utterance;
}

function primeSpeech(enabled) {
  const synth = getSpeechSynth();
  if (!enabled || !synth) return;
  try {
    cachedSpeechVoice = null;
    synth.getVoices?.();
    synth.resume?.();
    const u = makeSpeechUtterance("Voice guidance ready.");
    u.volume = 0.35;
    u.rate = 1;
    synth.cancel();
    synth.speak(u);
    setTimeout(() => synth.resume?.(), 80);
  } catch {
    // Speech synthesis availability varies by browser and device.
  }
}

function speak(enabled, text) {
  const synth = getSpeechSynth();
  if (!enabled || !synth || !text) return;
  const now = Date.now();
  if (text === lastSpeechText && now - lastSpeechAt < 900) return;
  lastSpeechText = text;
  lastSpeechAt = now;
  try {
    if (speechTimer) clearTimeout(speechTimer);
    const u = makeSpeechUtterance(text);
    u.onerror = () => {
      try { synth.resume?.(); } catch { /* optional browser API */ }
    };
    if (synth.speaking || synth.pending) synth.cancel();
    synth.resume?.();
    speechTimer = setTimeout(() => {
      try {
        synth.resume?.();
        synth.speak(u);
        setTimeout(() => synth.resume?.(), 120);
      } catch {
        // Speech synthesis is optional and browser-dependent.
      }
    }, 60);
  } catch {
    // Speech synthesis is optional and browser-dependent.
  }
}

function flushSpeech() {
  const synth = getSpeechSynth();
  try {
    if (speechTimer) clearTimeout(speechTimer);
    speechTimer = null;
    synth?.cancel?.();
    synth?.resume?.();
  } catch { /* optional browser API */ }
}

function InterstitialView({ just, nextExercise, secondsLeft, exIdx, totalExercises, onNext, onCancel }) {
  if (!just) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-stretch lg:items-center lg:justify-center lg:p-6" style={{ background: "rgba(12,10,8,0.92)" }}>
      <div className="flex flex-col w-full h-full lg:w-[440px] lg:h-[860px] lg:max-h-[92vh] lg:rounded-3xl lg:overflow-hidden lg:shadow-2xl" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
      <div className="flex items-center justify-between p-4 shrink-0">
        <button onClick={onCancel} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(244, 239, 230, 0.1)" }} aria-label="End"><X className="w-5 h-5" /></button>
        <div className="text-xs opacity-70">Exercise {exIdx} of {totalExercises} complete</div>
        <div className="w-10" />
      </div>
      <div className="flex-1 overflow-y-auto px-6 pb-2">
        <div className="text-center mb-5">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-2">Just done</div>
          <ExerciseGlyph exerciseId={just.exerciseId} region={just.region} size="lg" tone="dark" className="mx-auto mb-3" />
          <div className="text-xl mb-2" style={{ fontFamily: "Fraunces", fontWeight: 500 }}>{just.name}</div>
          {just.avg != null && (
            <div className="text-5xl tabular-nums" style={{ fontFamily: "Fraunces", fontWeight: 600, color: scoreColor(just.avg), letterSpacing: "-0.02em" }}>{displayPct(just.avg)}%</div>
          )}
          {just.avg != null && <div className="text-xs opacity-60 mt-1">avg symmetry</div>}
          {just.baselineProgress && (
            <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(244,239,230,0.08)", color: "#D4A574" }}>
              <TrendingUp className="w-3 h-3" />{just.baselineProgress.side} side · {baselineProgressLabel(just.baselineProgress)}
            </div>
          )}
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
            <ExerciseGlyph exercise={nextExercise} size="md" tone="dark" className="mx-auto mb-3" />
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
        <button onClick={onNext} className="rounded-full px-6 py-3 font-semibold flex items-center gap-2" style={{ background: "#B8543A", color: "#F4EFE6" }}>
          Next<ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <style>{`@keyframes fadeInRep { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      </div>
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

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function buildSessionReportHtml(s) {
  const ts = s.ts ? new Date(s.ts) : new Date();
  const dateStr = ts.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeStr = formatClock(ts);
  const dur = formatDuration(s.duration);
  const overallPct = displayPct(s.sessionAvg);
  const overallColor = scoreColor(s.sessionAvg);
  const comfort = s.comfortLevel ? (COMFORT_DOSING[s.comfortLevel]?.label ?? s.comfortLevel) : null;
  const sessionType = s.kind === "practice" ? "Practice run" : "Daily session";
  const baseline = s.baselineProgress;
  const initialBaseline = s.initialBaselineProgress;
  const scoresArr = s.scores || [];
  const totalReps = scoresArr.reduce((sum, e) => sum + (e.scores?.length ?? 0), 0);

  const exerciseRows = scoresArr.map((e) => {
    const pct = displayPct(e.avg);
    const color = scoreColor(e.avg);
    const repsArr = e.scores ?? [];
    const repLabel = `${repsArr.length}${e.repsTarget ? `/${e.repsTarget}` : ""} rep${(e.repsTarget ?? repsArr.length) === 1 ? "" : "s"}`;
    const doseBits = [
      e.region,
      repLabel,
      e.holdSec ? `${e.holdSec}s hold` : null,
      e.restSec ? `${e.restSec}s rest` : null,
    ].filter(Boolean).join(" · ");
    const repBreakdown = repsArr.length > 0
      ? repsArr.map((r) => {
          const rp = displayPct(r);
          return `<span class="rep" style="background:${rp == null ? "#E7E5E4" : scoreColor(r)};color:#fff">${rp == null ? "—" : rp + "%"}</span>`;
        }).join("")
      : '<span class="muted">No symmetry data captured</span>';
    const baselineLine = e.baselineProgress
      ? `<div class="muted small">Current baseline: ${escapeHtml(e.baselineProgress.side)} side · ${escapeHtml(baselineProgressLabel(e.baselineProgress) ?? "")}</div>`
      : "";
    const initialBaselineLine = e.initialBaselineProgress
      ? `<div class="muted small">First baseline: ${escapeHtml(e.initialBaselineProgress.side)} side · ${escapeHtml(baselineProgressLabel(e.initialBaselineProgress) ?? "")}</div>`
      : "";
    const allSnapshots = e.snapshots || [];
    const movementSnap = allSnapshots.reduce((best, snap) => {
      if (!best) return snap;
      return (snap.score ?? -1) > (best.score ?? -1) ? snap : best;
    }, null);
    const baselineImage = e.baselineSnapshot || s.baselineSnapshot || null;
    const movementPct = displayPct(movementSnap?.score);
    const comparison = baselineImage || movementSnap ? `
      <div class="comparison">
        <figure class="compare-frame">
          ${baselineImage ? `<img src="${baselineImage}" alt="Neutral baseline frame" />` : `<div class="missing-image">No baseline image</div>`}
          <figcaption>Baseline neutral</figcaption>
        </figure>
        <figure class="compare-frame">
          ${movementSnap ? `<img src="${movementSnap.dataUrl}" alt="Peak movement frame" />` : `<div class="missing-image">No movement image</div>`}
          <figcaption>Movement${movementPct == null ? "" : ` · ${movementPct}%`}</figcaption>
        </figure>
      </div>`
      : "";
    const snapshots = allSnapshots.slice(0, 6).map((snap) => {
      const sp = displayPct(snap.score);
      return `<div class="snap"><img src="${snap.dataUrl}" alt="" /><div class="snap-label" style="background:${scoreColor(snap.score)}">${sp == null ? "—" : sp + "%"}</div></div>`;
    }).join("");
    return `
      <section class="exercise">
        <div class="ex-head">
          <div>
            <div class="ex-name">${escapeHtml(e.name)}</div>
            <div class="muted small">${escapeHtml(doseBits)}</div>
            ${baselineLine}
            ${initialBaselineLine}
          </div>
          <div class="ex-score" style="color:${color}">${pct == null ? "—" : pct + "%"}</div>
        </div>
        <div class="reps">${repBreakdown}</div>
        ${comparison}
        ${snapshots ? `<div class="snaps">${snapshots}</div>` : ""}
      </section>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Facial Retraining Session — ${escapeHtml(dateStr)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1F1B16; margin: 0; padding: 32px; background: #F4EFE6; }
  .page { max-width: 760px; margin: 0 auto; background: #fff; padding: 40px 44px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: #78716C; margin: 28px 0 12px; font-weight: 600; }
  .meta { color: #57534E; font-size: 13px; margin-bottom: 24px; }
  .summary { display: grid; grid-template-columns: auto 1fr; gap: 24px; align-items: center; padding: 20px; background: #FAF7F0; border-radius: 12px; margin-bottom: 12px; }
  .big-score { font-size: 56px; font-weight: 700; line-height: 1; letter-spacing: -0.02em; color: ${overallColor}; }
  .summary-meta { font-size: 13px; color: #57534E; line-height: 1.6; }
  .summary-meta strong { color: #1F1B16; }
  .baseline { padding: 12px 16px; background: rgba(122,143,115,0.12); border-radius: 8px; font-size: 13px; color: #4A6B47; margin-bottom: 12px; }
  .exercise { padding: 16px 0; border-top: 1px solid #E7E5E4; }
  .exercise:first-of-type { border-top: none; }
  .ex-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .ex-name { font-weight: 600; font-size: 15px; margin-bottom: 2px; }
  .ex-score { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .reps { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 10px; }
  .rep { font-size: 11px; padding: 3px 8px; border-radius: 4px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
  .compare-frame { margin: 0; border: 1px solid #E7E5E4; border-radius: 10px; overflow: hidden; background: #FAF7F0; }
  .compare-frame img { width: 100%; height: 220px; object-fit: cover; object-position: center; display: block; image-rendering: auto; }
  .compare-frame figcaption { font-size: 11px; color: #57534E; padding: 7px 9px; background: #FAF7F0; font-weight: 600; }
  .missing-image { height: 220px; display: flex; align-items: center; justify-content: center; color: #A8A29E; font-size: 12px; background: #F5F2EC; }
  .snaps { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .snap { position: relative; width: 72px; height: 104px; border-radius: 6px; overflow: hidden; border: 1px solid #E7E5E4; }
  .snap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .snap-label { position: absolute; bottom: 0; inset-inline: 0; font-size: 9px; color: #fff; text-align: center; padding: 1px 0; font-weight: 600; }
  .muted { color: #78716C; }
  .small { font-size: 12px; margin-top: 2px; }
  .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #E7E5E4; font-size: 11px; color: #78716C; line-height: 1.6; }
  @media print {
    body { background: #fff; padding: 0; }
    .page { box-shadow: none; border-radius: 0; padding: 24px; max-width: none; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="page">
    <h1>Facial Retraining Session Report</h1>
    <div class="meta">${escapeHtml(dateStr)}${timeStr ? ` · ${escapeHtml(timeStr)}` : ""}</div>

    <div class="summary">
      <div class="big-score">${overallPct == null ? "—" : overallPct + "%"}</div>
      <div class="summary-meta">
        <div><strong>Average symmetry</strong> across the session</div>
        <div>Type: <strong>${escapeHtml(sessionType)}</strong></div>
        <div>Duration: <strong>${escapeHtml(dur)}</strong></div>
        <div>Exercises: <strong>${scoresArr.length}</strong> · Reps captured: <strong>${totalReps}</strong></div>
        ${comfort ? `<div>Comfort level: <strong>${escapeHtml(comfort)}</strong></div>` : ""}
      </div>
    </div>

    ${baseline ? `<div class="baseline"><strong>Current baseline progress:</strong> ${escapeHtml(baseline.side)} side · ${escapeHtml(baselineProgressLabel(baseline) ?? "")}</div>` : ""}
    ${initialBaseline ? `<div class="baseline"><strong>First baseline progress:</strong> ${escapeHtml(initialBaseline.side)} side · ${escapeHtml(baselineProgressLabel(initialBaseline) ?? "")}</div>` : ""}

    <h2>By Exercise</h2>
    ${exerciseRows || '<div class="muted">No exercises recorded.</div>'}

    <div class="footer">
      Symmetry is auto-detected from facial landmarks captured during the session. Some movement variation is normal even in healthy faces.
      Generated for clinical review by a physiotherapist or facial retraining specialist.
    </div>
  </div>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 250); });</script>
</body>
</html>`;
}

function shareSessionReport(sessionLike) {
  const html = buildSessionReportHtml(sessionLike);
  const win = window.open("", "_blank");
  if (!win) {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mirror-session-report-${sessionLike.date || todayISO()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}

// Dual-mode: live mode receives `scores` (in-progress array) + `onFinish`; view mode
// receives a saved `session` record + `onClose`. Both render the same comprehensive report.
function SessionSummary({ scores, sessionsToday, dailyGoal, baselineProgress, initialBaselineProgress, kind, startedAt, comfortLevel, onFinish, session, onClose }) {
  const isView = !!session;
  const scoresArr = isView ? (session.scores || []) : scores;
  const sessionBaseline = isView ? session.baselineProgress : baselineProgress;
  const sessionInitialBaseline = isView ? session.initialBaselineProgress : initialBaselineProgress;
  const effectiveKind = isView ? session.kind : kind;
  const isPractice = effectiveKind === "practice";
  const nextFocus = sessionFocusRecommendation(scoresArr);
  const overall = isView
    ? session.sessionAvg
    : (() => {
        const valid = scoresArr.map((e) => e.avg).filter((v) => v != null);
        return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
      })();
  const reportSession = isView ? { ...session, sessionAvg: overall } : {
    date: todayISO(),
    ts: Date.now(),
    duration: startedAt ? Math.round((Date.now() - startedAt) / 1000) : null,
    sessionAvg: overall,
    baselineProgress: sessionBaseline,
    initialBaselineProgress: sessionInitialBaseline,
    scores: scoresArr,
    comfortLevel,
    kind: effectiveKind,
  };
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
    <div className="fixed inset-0 z-50 flex items-stretch lg:items-center lg:justify-center lg:p-6" style={{ background: "rgba(12,10,8,0.92)" }}>
      <div className="flex flex-col w-full h-full lg:w-[440px] lg:h-[860px] lg:max-h-[92vh] lg:rounded-3xl lg:shadow-2xl overflow-y-auto" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
      <div className="max-w-md mx-auto w-full px-6 py-10 flex-1 flex flex-col">
        {isView && (
          <button onClick={onClose} className="self-start mb-4 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(244, 239, 230, 0.1)" }} aria-label="Close report"><X className="w-5 h-5" /></button>
        )}
        <div className="text-center mb-8">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-2">{isView ? formatSessionDate(session) : isPractice ? "Practice complete" : "Session complete"}</div>
          <h2 className="text-3xl mb-3" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>
            <em style={{ fontStyle: "italic", fontWeight: 400 }}>{message}</em>
          </h2>
          {!isView && !isPractice && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(244,239,230,0.08)" }}>
              <span className="opacity-80">Session <span className="font-semibold" style={{ color: "#F4EFE6" }}>{sessionN}</span> of {goal} today</span>
              {nextSlot && <span className="opacity-60">· next at {formatClock(nextSlot)}</span>}
              {remainingAfter === 0 && <span className="opacity-60">· done for the day</span>}
            </div>
          )}
          {!isView && isPractice && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(244,239,230,0.08)" }}>
              <span className="opacity-80">Practice run · doesn't count toward daily goal</span>
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
            {sessionBaseline && (
              <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(244,239,230,0.08)", color: "#D4A574" }}>
                <TrendingUp className="w-3 h-3" />current baseline · {sessionBaseline.side} side · {baselineProgressLabel(sessionBaseline)}
              </div>
            )}
            {sessionInitialBaseline && (
              <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(122,143,115,0.12)", color: "#A8C39F" }}>
                <TrendingUp className="w-3 h-3" />first baseline · {sessionInitialBaseline.side} side · {baselineProgressLabel(sessionInitialBaseline)}
              </div>
            )}
          </div>
        )}
        {nextFocus && (
          <div className="rounded-2xl p-4 mb-6" style={{ background: "rgba(122,143,115,0.12)", border: "1px solid rgba(122,143,115,0.2)" }}>
            <div className="text-xs uppercase tracking-wider opacity-55 mb-2">Next focus</div>
            <div className="flex items-center gap-3">
              <ExerciseGlyph exerciseId={nextFocus.exerciseId} region={nextFocus.region} size="xs" tone="dark" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{nextFocus.name}</div>
                <div className="text-xs opacity-65 mt-0.5">{nextFocus.avg != null ? `${displayPct(nextFocus.avg)}% symmetry` : "unscored"}{nextFocus.baselineProgress ? ` · ${baselineProgressLabel(nextFocus.baselineProgress)}` : ""}</div>
              </div>
            </div>
          </div>
        )}
        <div className="space-y-3 mb-8">
          <div className="text-xs uppercase tracking-wider opacity-60 mb-2">By exercise</div>
          {scoresArr.map((s, exIdx) => (
            <div key={s.exerciseId} className="rounded-2xl p-4" style={{ background: "rgba(244, 239, 230, 0.06)" }}>
              <div className="flex items-center gap-3">
                <ExerciseGlyph exerciseId={s.exerciseId} region={s.region} size="xs" tone="dark" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-xs opacity-60 mt-0.5">{s.scores.length} rep{s.scores.length !== 1 ? "s" : ""} scored{s.snapshots?.length ? ` · ${s.snapshots.length} shot${s.snapshots.length !== 1 ? "s" : ""}` : ""}</div>
                  {s.baselineProgress && <div className="text-xs mt-1" style={{ color: "#D4A574" }}>current · {s.baselineProgress.side} side · {baselineProgressLabel(s.baselineProgress)}</div>}
                  {s.initialBaselineProgress && <div className="text-xs mt-0.5" style={{ color: "#A8C39F" }}>first · {s.initialBaselineProgress.side} side · {baselineProgressLabel(s.initialBaselineProgress)}</div>}
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
        <div className="mt-auto space-y-3">
          <button
            onClick={() => shareSessionReport(reportSession)}
            className="w-full rounded-full py-3 font-medium flex items-center justify-center gap-2"
            style={{ background: "rgba(244, 239, 230, 0.1)", color: "#F4EFE6", border: "1px solid rgba(244, 239, 230, 0.18)" }}
          >
            <Share2 className="w-4 h-4" /> Save PDF for physio
          </button>
          <button onClick={isView ? onClose : onFinish} className="w-full rounded-full py-3.5 font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>{isView ? "Close" : "Done"}</button>
        </div>
      </div>
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
          const progress = preferredBaselineProgress(s);
          return (
            <button key={s.ts || `${s.date}-${exCount}`} onClick={() => onOpen(s)} className="w-full rounded-xl px-3 py-2.5 flex items-center gap-3 transition hover:bg-white text-left" style={{ background: "rgba(255,255,255,0.4)", border: "1px solid rgba(31, 27, 22, 0.04)" }}>
              <div className="text-xs text-stone-500 tabular-nums w-28 shrink-0">{formatSessionDate(s)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm flex items-center gap-2">
                  <span>{exCount} exercise{exCount !== 1 ? "s" : ""}</span>
                  {s.kind === "practice" && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: "rgba(184, 84, 58, 0.12)", color: "#B8543A" }}>Practice</span>}
                </div>
                <div className="text-xs text-stone-500 tabular-nums">{formatDuration(s.duration)}{progress ? ` · ${baselineProgressLabel(progress)}` : ""}</div>
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
          <div className="flex items-center gap-2 text-sm"><ExerciseGlyph exerciseId={exercise.exerciseId} region={exercise.region} size="xs" tone="dark" />{exercise.name}</div>
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

function MovementProfileCard({ profile, initialProfile, history, sessions, progressByExercise, onStart }) {
  const exercises = profileExerciseEntries(profile);
  const focusItems = getAdaptiveFocusItems(profile, sessions, 3);
  const created = profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
  const status = profileStatus(profile);
  const retakeExerciseIds = status?.retakeExercises?.map((ex) => ex.exerciseId) ?? [];
  const firstProfile = initialProfile && initialProfile.createdAt !== profile?.createdAt ? initialProfile : null;
  const previousProfile = history?.[0] ?? null;
  const comparison = compareMovementProfiles(profile, previousProfile);
  const firstComparison = compareMovementProfiles(profile, firstProfile);
  const historyRows = (history ?? []).slice(0, 3);
  if (!profile) {
    return (
      <div className="rounded-2xl p-5" style={{ background: "rgba(31, 27, 22, 0.92)", color: "#F4EFE6" }}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(244,239,230,0.1)" }}><Zap className="w-4 h-4" style={{ color: "#D4A574" }} /></div>
          <div className="flex-1">
            <div className="text-sm font-semibold mb-1">Personal movement baseline</div>
            <p className="text-xs opacity-70 leading-relaxed mb-4">Capture a short first-use profile so Mirror can compare future sessions against your own starting point.</p>
            <button onClick={onStart} className="rounded-full px-4 py-2 text-xs font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>Create baseline</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-5" style={{ background: "rgba(31, 27, 22, 0.92)", color: "#F4EFE6" }}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Personal movement baseline</div>
          <div className="text-xs opacity-60 mt-0.5 leading-relaxed">Created {created ?? "unknown"} · affected side: {formatProfileSide(profile.affectedSide)} · {getComfortDosing(profile).label.toLowerCase()} dose</div>
        </div>
        <div className="text-right">
          {profile.initialAvgSymmetry != null && (
            <div className="text-2xl tabular-nums" style={{ fontFamily: "Fraunces", fontWeight: 600, color: scoreColor(profile.initialAvgSymmetry) }}>{displayPct(profile.initialAvgSymmetry)}%</div>
          )}
          {status && <div className="inline-flex mt-1 text-[10px] rounded-full px-2 py-0.5" style={{ background: `${status.quality.color}26`, color: status.quality.color }}>{status.quality.label}</div>}
        </div>
      </div>
      {status?.shouldRetake && (
        <div className="rounded-2xl p-3 mb-4 flex flex-wrap items-center gap-3" style={{ background: "rgba(184,84,58,0.16)", color: "#FFD3C1" }}>
          <div className="flex-1 text-xs">Retake recommended: {status.reason}</div>
          {retakeExerciseIds.length > 0 && (
            <button onClick={() => onStart(retakeExerciseIds)} className="rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap" style={{ background: "#B8543A", color: "#F4EFE6" }}>Retake weak only</button>
          )}
          {(status.noisy || status.stale || retakeExerciseIds.length === 0) && (
            <button onClick={() => onStart()} className="rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap" style={{ background: "rgba(244,239,230,0.12)", color: "#F4EFE6", border: "1px solid rgba(244,239,230,0.18)" }}>Full retake</button>
          )}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-2xl p-3" style={{ background: "rgba(244,239,230,0.06)" }}>
          <div className="text-[10px] uppercase tracking-wider opacity-45 mb-1">Profile</div>
          <div className="text-sm font-semibold tabular-nums">v{profile.version ?? "—"}</div>
        </div>
        <div className="rounded-2xl p-3" style={{ background: "rgba(244,239,230,0.06)" }}>
          <div className="text-[10px] uppercase tracking-wider opacity-45 mb-1">Noise</div>
          <div className="text-sm font-semibold tabular-nums">{profile.calibrationQuality?.coreAvgNoise ?? profile.calibrationQuality?.avgNoise ?? "—"}</div>
        </div>
        <div className="rounded-2xl p-3" style={{ background: "rgba(244,239,230,0.06)" }}>
          <div className="text-[10px] uppercase tracking-wider opacity-45 mb-1">Retakes</div>
          <div className="text-sm font-semibold tabular-nums">{history?.length ?? 0}</div>
        </div>
      </div>
      {firstComparison && (
        <div className="rounded-2xl p-3 mb-4" style={{ background: "rgba(212,165,116,0.12)", border: "1px solid rgba(212,165,116,0.18)" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider opacity-55">First vs current</div>
              <div className="text-xs opacity-60 mt-0.5">First saved baseline {firstComparison.previousDate ?? "available"}</div>
            </div>
            {firstComparison.avgSymmetryDelta != null && (
              <div className="text-sm font-semibold tabular-nums" style={{ color: firstComparison.avgSymmetryDelta >= 0 ? "#A8C39F" : "#FFB48F" }}>{signedPointDelta(firstComparison.avgSymmetryDelta)}</div>
            )}
          </div>
        </div>
      )}
      {comparison && (
        <div className="rounded-2xl p-3 mb-4" style={{ background: "rgba(122,143,115,0.14)", border: "1px solid rgba(122,143,115,0.2)" }}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="text-xs uppercase tracking-wider opacity-55">Retake comparison</div>
              <div className="text-xs opacity-60 mt-0.5">Compared with {comparison.previousDate ?? "previous baseline"}</div>
            </div>
            {comparison.avgSymmetryDelta != null && (
              <div className="text-sm font-semibold tabular-nums" style={{ color: comparison.avgSymmetryDelta >= 0 ? "#A8C39F" : "#FFB48F" }}>{signedPointDelta(comparison.avgSymmetryDelta)}</div>
            )}
          </div>
          <div className="space-y-2">
            {comparison.exerciseDeltas.slice(0, 2).map((item) => (
              <div key={item.exerciseId} className="flex items-center gap-2 text-xs">
                <ExerciseGlyph exerciseId={item.exerciseId} region={item.region} size="xs" tone="dark" />
                <div className="flex-1 min-w-0 truncate">{item.name}</div>
                <div className="tabular-nums" style={{ color: item.symmetryDelta >= 0 ? "#A8C39F" : "#FFB48F" }}>{signedPointDelta(item.symmetryDelta)}</div>
              </div>
            ))}
            {comparison.noiseDelta != null && (
              <div className="text-[11px] opacity-60">Calibration noise {comparison.noiseDelta <= 0 ? "decreased" : "increased"} by {Math.abs(comparison.noiseDelta).toFixed(5)}</div>
            )}
          </div>
        </div>
      )}
      {focusItems.length > 0 && (
        <div className="rounded-2xl p-3 mb-4" style={{ background: "rgba(244,239,230,0.06)" }}>
          <div className="text-xs uppercase tracking-wider opacity-55 mb-2">Current focus</div>
          <div className="space-y-2">
            {focusItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-xs">
                <ExerciseGlyph exercise={item.exercise} size="xs" tone="dark" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{item.exercise?.name}</div>
                  <div className="opacity-55">{focusReason(item)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2 mb-4">
        {exercises.map((ex) => (
          <div key={ex.exerciseId} className="flex items-center gap-3 text-xs">
            <ExerciseGlyph exerciseId={ex.exerciseId} region={ex.region} size="xs" tone="dark" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{ex.name}</div>
              <div className="opacity-55">limited side: {ex.limitedSide} · threshold {ex.activationThreshold ?? "—"}</div>
              {ex.quality && <div className="opacity-55">quality: {ex.quality.label}{ex.quality.issues?.length ? ` · ${ex.quality.issues.join(", ")}` : ""}</div>}
              {progressByExercise?.[ex.exerciseId] && <div className="mt-0.5" style={{ color: "#D4A574" }}>{baselineProgressLabel(progressByExercise[ex.exerciseId])}</div>}
            </div>
            {ex.quality?.key === "retake" && (
              <button onClick={() => onStart([ex.exerciseId])} className="rounded-full px-2.5 py-1 text-[11px] font-semibold shrink-0" style={{ background: "rgba(184,84,58,0.2)", color: "#FFD3C1" }}>Retake</button>
            )}
            {ex.initialSymmetry != null && <div className="tabular-nums shrink-0" style={{ color: scoreColor(ex.initialSymmetry) }}>{displayPct(ex.initialSymmetry)}%</div>}
          </div>
        ))}
      </div>
      {historyRows.length > 0 && (
        <div className="rounded-2xl p-3 mb-4" style={{ background: "rgba(244,239,230,0.06)" }}>
          <div className="text-xs uppercase tracking-wider opacity-55 mb-2">Baseline history</div>
          <div className="space-y-2">
            {historyRows.map((item, index) => {
              const archivedStatus = profileStatus(item);
              return (
                <div key={item.archivedAt ?? `${item.createdAt}-${index}`} className="flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium">{formatProfileDate(item.createdAt) ?? "Previous baseline"}</div>
                    <div className="opacity-50">affected side {formatProfileSide(item.affectedSide)} · {archivedStatus?.quality.label ?? "Unknown"}</div>
                  </div>
                  {item.initialAvgSymmetry != null && <div className="tabular-nums" style={{ color: scoreColor(item.initialAvgSymmetry) }}>{displayPct(item.initialAvgSymmetry)}%</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <button onClick={onStart} className="rounded-full px-4 py-2 text-xs font-semibold" style={{ background: "rgba(244,239,230,0.12)", color: "#F4EFE6" }}>Redo baseline</button>
    </div>
  );
}

function ProgressView({ data, streak, prefs, onTogglePref, onSetPref, onOpenReport, onStartProfile }) {
  // Progress charts are projections of journal/session history. Keeping them derived
  // avoids migration work when scoring or display rules change.
  const totalSessions = data.sessions.length;
  const last7DaysSessions = data.sessions.filter((s) => { const days = daysBetween(s.date, todayISO()); return days >= 0 && days < 7; }).length;
  const journalChartData = useMemo(() => data.journal.length === 0 ? [] : data.journal.slice(-21).map((j) => ({ date: new Date(j.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), symmetry: j.symmetry })), [data.journal]);
  const aiSymmetryData = useMemo(() => data.sessions.filter((s) => s.sessionAvg != null).slice(-21).map((s) => ({ date: new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), score: displayPct(s.sessionAvg) })), [data.sessions]);
  const baselineProgressData = useMemo(() => data.sessions.map((s) => {
    const progress = preferredBaselineProgress(s);
    return progress?.ratio == null ? null : { date: new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), progress: Math.round(progress.ratio * 100) };
  }).filter(Boolean).slice(-21), [data.sessions]);
  const progressByExercise = useMemo(() => latestExerciseProgressById(data.sessions), [data.sessions]);
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
      {baselineProgressData.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
          <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-3.5 h-3.5" style={{ color: "#7A8F73" }} /><div className="text-sm font-semibold">Progress from baseline</div></div>
          <div className="text-xs text-stone-500 mb-4">Affected or limited side movement · 100% = first saved baseline</div>
          <div style={{ width: "100%", height: 160 }}>
            <ResponsiveContainer>
              <AreaChart data={baselineProgressData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <defs><linearGradient id="baselineGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7A8F73" stopOpacity={0.4} /><stop offset="100%" stopColor="#7A8F73" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#7C7066" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, "dataMax + 20"]} tick={{ fontSize: 10, fill: "#7C7066" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#1F1B16", border: "none", borderRadius: 8, color: "#F4EFE6", fontSize: 12 }} formatter={(v) => [`${v}%`, "Movement"]} />
                <Area type="monotone" dataKey="progress" stroke="#7A8F73" strokeWidth={2} fill="url(#baselineGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
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
      <MovementProfileCard profile={data.movementProfile} initialProfile={data.initialMovementProfile} history={data.movementProfileHistory} sessions={data.sessions} progressByExercise={progressByExercise} onStart={onStartProfile} />
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
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-20 px-4 pb-4 pt-2" style={{ background: "linear-gradient(to top, rgba(244,239,230,1) 60%, rgba(244,239,230,0))" }}>
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
    { type: "intro", title: "AI symmetry tracking", body: "Your front camera measures movement on both sides of your face using dense facial landmarks, and gives you a real-time symmetry score so you can see exactly where the affected side needs attention.", emoji: "🪞" },
    { type: "intro", title: "Practice with intention", body: "Forceful contractions can train nerves to fire incorrectly (synkinesis). Mirror keeps things slow and controlled, and rewards even movement over big movement.", emoji: "🌸" },
    { type: "goal",  title: "How many times a day?", body: "Bell's palsy retraining works best with frequent short sessions spread across the day. Pick a count that feels sustainable — you can change it anytime.", emoji: "📅" },
    { type: "intro", title: "One important note", body: "Mirror supports your practice but doesn't replace medical care. Please work with your neurologist and physical therapist on your specific protocol. Stop any exercise that causes pain.", emoji: "🌱" },
    { type: "profile", title: "Build your baseline", body: "Optional: capture a short local movement profile now so Mirror can understand your starting point and personalize future progress tracking.", emoji: "🧭" },
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
        {s.type === "profile" ? (
          <div className="flex gap-3">
            <button onClick={() => onDone(false)} className="flex-1 rounded-full py-3.5 font-semibold" style={{ background: "rgba(244,239,230,0.12)", color: "#F4EFE6" }}>Skip for now</button>
            <button onClick={() => onDone(true)} className="flex-1 rounded-full py-3.5 font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>Create baseline</button>
          </div>
        ) : (
          <button onClick={() => setStep(step + 1)} className="w-full rounded-full py-3.5 font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>Continue</button>
        )}
      </div>
    </div>
  );
}
