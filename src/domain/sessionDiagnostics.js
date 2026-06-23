import { EXERCISE_BY_ID } from "./exercises";
import { summarizeCaptureQualityFromFeatures, summarizeSessionCaptureQuality } from "./captureQuality";

const DROP_REASON_LABELS = {
  "no-face": "No face",
  "missing-neutral": "Missing neutral",
  "head-pose": "Head pose",
  alignment: "Alignment",
  "below-signal-gate": "Low signal",
  "below-activation-threshold": "Below baseline threshold",
  "no-symmetry-result": "No symmetry result",
};

const CAPTURE_QUALITY_NOTES = {
  strong: "Capture quality was strong enough for trend review.",
  usable: "Capture quality was usable; review frame counts before interpreting small changes.",
  weak: "Capture quality was weak; do not treat this session as progress or regression by itself.",
  unscored: "The session did not capture enough scored frames for trend interpretation.",
};

const COACTIVATION_RANK = { low: 0, medium: 1, high: 2 };
const EYE_CLOSURE_EXERCISES = new Set(["eye-close", "blink", "wink", "emoji-wink"]);

function compactNumber(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function diagnosticReasonLabel(reason) {
  return DROP_REASON_LABELS[reason] ?? String(reason ?? "Unknown");
}

function mergeCounts(items = []) {
  const merged = {};
  for (const item of items) {
    for (const [key, value] of Object.entries(item ?? {})) {
      if (!Number.isFinite(value) || value <= 0) continue;
      merged[key] = (merged[key] ?? 0) + value;
    }
  }
  return Object.keys(merged).length ? merged : null;
}

function topDropReasons(counts, limit = 3) {
  return Object.entries(counts ?? {})
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([reason, count]) => ({ reason, label: diagnosticReasonLabel(reason), count }));
}

function coactivationCandidates(score) {
  const featureCoactivation = score?.movementFeatures?.coactivation ?? score?.coactivation ?? null;
  if (featureCoactivation) return [featureCoactivation];
  return (score?.repDiagnostics ?? [])
    .map((item) => item?.coactivation)
    .filter(Boolean);
}

function summarizeCoactivation(samples = []) {
  const valid = samples.filter((item) => Number.isFinite(item?.score));
  if (!valid.length) return null;
  const mean = valid.reduce((sum, item) => sum + item.score, 0) / valid.length;
  const maxScore = Math.max(...valid.map((item) => item.maxScore ?? item.score));
  const risk = valid.reduce((current, item) => {
    const itemRisk = item.risk ?? "low";
    return COACTIVATION_RANK[itemRisk] > COACTIVATION_RANK[current] ? itemRisk : current;
  }, "low");
  const regions = {};
  for (const sample of valid) {
    for (const region of sample.regions ?? []) {
      if (!region?.region) continue;
      regions[region.region] = Math.max(regions[region.region] ?? 0, region.movement ?? 0);
    }
  }
  return {
    score: compactNumber(mean, 4),
    maxScore: compactNumber(maxScore, 4),
    risk,
    sampleCount: valid.reduce((sum, item) => sum + (item.sampleCount ?? 1), 0),
    regions: Object.entries(regions)
      .sort((a, b) => b[1] - a[1])
      .map(([region, movement]) => ({ region, movement: compactNumber(movement, 5) })),
  };
}

function featuresForScore(score) {
  if (Array.isArray(score?.repDiagnostics) && score.repDiagnostics.length) return score.repDiagnostics;
  if (score?.movementFeatures) return [score.movementFeatures];
  return [];
}

function summarizeExerciseDiagnostics(score) {
  const features = featuresForScore(score);
  const captureQuality = score?.captureQuality ?? summarizeCaptureQualityFromFeatures(features);
  const dropReasonCounts = captureQuality?.dropReasonCounts ?? mergeCounts(features.map((item) => item.dropReasonCounts));
  const coactivation = summarizeCoactivation(coactivationCandidates(score));
  return {
    exerciseId: score?.exerciseId ?? null,
    name: score?.name ?? EXERCISE_BY_ID.get(score?.exerciseId)?.name ?? score?.exerciseId ?? "Exercise",
    scoringModelVersion: score?.scoringModelVersion ?? features.find((item) => item?.scoringModelVersion)?.scoringModelVersion ?? null,
    captureQuality,
    dropReasonCounts,
    topDropReasons: topDropReasons(dropReasonCounts),
    coactivation,
    observedFrameCount: captureQuality?.observedFrameCount ?? features.reduce((sum, item) => sum + (item?.observedFrameCount ?? 0), 0),
    validScoredFrameCount: captureQuality?.validScoredFrameCount ?? features.reduce((sum, item) => sum + (item?.validScoredFrameCount ?? 0), 0),
    rejectedFrameCount: captureQuality?.rejectedFrameCount ?? features.reduce((sum, item) => sum + (item?.rejectedFrameCount ?? 0), 0),
    scoreDistribution: score?.movementFeatures?.scoreDistribution ?? null,
  };
}

function summarizeSessionDiagnostics(sessionLike = {}) {
  const scores = Array.isArray(sessionLike) ? sessionLike : (sessionLike?.scores ?? []);
  const exercises = scores.map(summarizeExerciseDiagnostics);
  const setupQuality = Array.isArray(sessionLike) ? null : sessionLike.setupQuality ?? null;
  const captureQuality = Array.isArray(sessionLike)
    ? summarizeSessionCaptureQuality(scores)
    : sessionLike.captureQuality ?? summarizeSessionCaptureQuality(scores);
  const dropReasonCounts = captureQuality?.dropReasonCounts ?? mergeCounts(exercises.map((item) => item.dropReasonCounts));
  const coactivation = summarizeCoactivation(exercises.map((item) => item.coactivation).filter(Boolean));
  const eyeClosureScore = scores.find((score) => EYE_CLOSURE_EXERCISES.has(score?.exerciseId));
  const eyeClosureLow = eyeClosureScore && (
    (Number.isFinite(eyeClosureScore.avg) && eyeClosureScore.avg < 0.55)
    || ["weak", "unscored"].includes(eyeClosureScore.captureQuality?.key)
  );
  const safetyPrompts = [];
  if (setupQuality?.key === "weak") {
    safetyPrompts.push("Camera setup was weak before calibration; repeat the session if the score looks inconsistent.");
  }
  if (["weak", "unscored"].includes(captureQuality?.key)) {
    safetyPrompts.push("Data quality was low; use this session as practice context, not a progress signal.");
  }
  if (coactivation && COACTIVATION_RANK[coactivation.risk] >= COACTIVATION_RANK.medium) {
    safetyPrompts.push("Extra movement appeared in quiet regions; keep the surrounding areas relaxed and review this with a clinician if it is new or worsening.");
  }
  if (eyeClosureLow) {
    safetyPrompts.push("If eye closure feels incomplete or the eye feels dry, follow your clinician's eye-protection plan.");
  }
  return {
    scoringModelVersion: sessionLike?.scoringModelVersion ?? exercises.find((item) => item.scoringModelVersion)?.scoringModelVersion ?? null,
    setupQuality,
    captureQuality,
    captureQualityNote: CAPTURE_QUALITY_NOTES[captureQuality?.key] ?? null,
    dropReasonCounts,
    topDropReasons: topDropReasons(dropReasonCounts),
    coactivation,
    exercises,
    safetyPrompts,
    hasDiagnostics: Boolean(setupQuality || captureQuality || dropReasonCounts || coactivation || exercises.some((item) => item.captureQuality || item.coactivation || item.dropReasonCounts)),
  };
}

export {
  CAPTURE_QUALITY_NOTES,
  diagnosticReasonLabel,
  summarizeExerciseDiagnostics,
  summarizeSessionDiagnostics,
};
