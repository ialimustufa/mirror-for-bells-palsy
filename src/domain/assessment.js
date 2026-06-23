import { EXERCISE_BY_ID } from "./exercises";
import { applySessionDose } from "./session";

const STANDARD_ASSESSMENT_VERSION = 1;
const STANDARD_ASSESSMENT_KIND = "standard-assessment";
const ASSESSMENT_SESSION_KIND = "assessment";
const STANDARD_ASSESSMENT_REPS = 2;
const STANDARD_ASSESSMENT_REST_SEC = 4;

const STANDARD_ASSESSMENT_EXERCISE_IDS = Object.freeze([
  "eyebrow-raise",
  "eye-close",
  "open-smile",
  "nose-wrinkle",
  "pucker",
]);

const ASSESSMENT_ZONE_BY_EXERCISE = Object.freeze({
  "eyebrow-raise": "brow",
  "eye-close": "eye",
  "open-smile": "mouth",
  "nose-wrinkle": "midface",
  pucker: "mouth",
});

const ASSESSMENT_ZONE_LABELS = Object.freeze({
  brow: "Brow/forehead",
  eye: "Eye",
  midface: "Midface/nose",
  mouth: "Mouth",
});

const COACTIVATION_RANK = { low: 0, medium: 1, high: 2 };

function compactNumber(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function buildStandardAssessmentExercises(profile = null) {
  return STANDARD_ASSESSMENT_EXERCISE_IDS
    .map((id) => EXERCISE_BY_ID.get(id))
    .filter(Boolean)
    .map((exercise) => {
      const dose = applySessionDose(exercise, profile, { reps: STANDARD_ASSESSMENT_REPS });
      return {
        ...dose,
        assessmentKind: STANDARD_ASSESSMENT_KIND,
        assessmentZone: ASSESSMENT_ZONE_BY_EXERCISE[exercise.id],
        reps: STANDARD_ASSESSMENT_REPS,
        restSec: Math.max(dose.restSec ?? 0, STANDARD_ASSESSMENT_REST_SEC),
      };
    });
}

function progressMetric(score) {
  const progress = score?.initialMovementProgress ?? score?.movementProgress ?? score?.initialBaselineProgress ?? score?.baselineProgress;
  const ratio = progress?.affectedProgressRatio ?? progress?.ratio;
  if (Number.isFinite(ratio)) return { value: ratio, source: progress.affectedProgressRatio != null ? "affected-progress" : "baseline-progress" };
  if (Number.isFinite(score?.avg)) return { value: score.avg, source: "symmetry" };
  return { value: null, source: null };
}

function coactivationRiskForScore(score) {
  const risk = score?.movementFeatures?.coactivation?.risk ?? score?.coactivation?.risk ?? null;
  return COACTIVATION_RANK[risk] != null ? risk : null;
}

function strongestRisk(current, candidate) {
  if (!candidate) return current ?? null;
  if (!current) return candidate;
  return COACTIVATION_RANK[candidate] > COACTIVATION_RANK[current] ? candidate : current;
}

function summarizeZone(zone, scores) {
  const metrics = scores.map(progressMetric).filter((item) => Number.isFinite(item.value));
  const avg = metrics.length ? metrics.reduce((sum, item) => sum + item.value, 0) / metrics.length : null;
  const coactivationRisk = scores.reduce((risk, score) => strongestRisk(risk, coactivationRiskForScore(score)), null);
  const qualityKeys = scores.map((score) => score?.captureQuality?.key).filter(Boolean);
  return {
    zone,
    label: ASSESSMENT_ZONE_LABELS[zone] ?? zone,
    exerciseIds: scores.map((score) => score.exerciseId).filter(Boolean),
    voluntaryMovement: compactNumber(avg),
    movementSource: metrics.find((item) => item.source)?.source ?? null,
    coactivationRisk,
    captureQuality: qualityKeys.includes("weak") || qualityKeys.includes("unscored")
      ? "weak"
      : qualityKeys.includes("usable")
        ? "usable"
        : qualityKeys.includes("strong")
          ? "strong"
          : null,
  };
}

function summarizeAssessmentZones(scores = []) {
  const grouped = new Map();
  for (const score of scores) {
    const zone = ASSESSMENT_ZONE_BY_EXERCISE[score?.exerciseId];
    if (!zone) continue;
    if (!grouped.has(zone)) grouped.set(zone, []);
    grouped.get(zone).push(score);
  }
  return Object.keys(ASSESSMENT_ZONE_LABELS)
    .map((zone) => summarizeZone(zone, grouped.get(zone) ?? []))
    .filter((zone) => zone.exerciseIds.length > 0);
}

function summarizeAssessmentSession(session = {}) {
  const scores = Array.isArray(session.scores) ? session.scores : [];
  const zones = summarizeAssessmentZones(scores);
  const voluntaryValues = zones.map((zone) => zone.voluntaryMovement).filter(Number.isFinite);
  const coactivationRisk = zones.reduce((risk, zone) => strongestRisk(risk, zone.coactivationRisk), null);
  const restingMetrics = session.restingMetrics && typeof session.restingMetrics === "object" ? session.restingMetrics : null;
  return {
    version: STANDARD_ASSESSMENT_VERSION,
    kind: STANDARD_ASSESSMENT_KIND,
    date: session.date ?? null,
    ts: session.ts ?? Date.now(),
    duration: session.duration ?? null,
    sourceSessionTs: session.ts ?? null,
    sourceSessionId: session.id ?? null,
    scoringModelVersion: session.scoringModelVersion ?? null,
    captureQuality: session.captureQuality ?? null,
    resting: {
      baselineSnapshotAvailable: Boolean(session.baselineSnapshot || session.hasBaselineSnapshot || session.baselineImageId),
      metrics: restingMetrics,
      averageAsymmetryRatio: restingMetrics?.averageAsymmetryRatio ?? null,
      note: "Neutral rest is captured during calibration and used as the local comparison baseline.",
    },
    zones,
    averageVoluntaryMovement: voluntaryValues.length
      ? compactNumber(voluntaryValues.reduce((sum, value) => sum + value, 0) / voluntaryValues.length)
      : null,
    coactivationRisk,
  };
}

function appendAssessmentRecord(data = {}, assessment) {
  if (!assessment) return data;
  return {
    ...data,
    assessments: [...(data.assessments ?? []), assessment],
  };
}

export {
  ASSESSMENT_SESSION_KIND,
  ASSESSMENT_ZONE_BY_EXERCISE,
  ASSESSMENT_ZONE_LABELS,
  STANDARD_ASSESSMENT_EXERCISE_IDS,
  STANDARD_ASSESSMENT_KIND,
  STANDARD_ASSESSMENT_REPS,
  STANDARD_ASSESSMENT_REST_SEC,
  STANDARD_ASSESSMENT_VERSION,
  appendAssessmentRecord,
  buildStandardAssessmentExercises,
  summarizeAssessmentSession,
};
