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
const QUALITY_RANK = { strong: 0, usable: 1, weak: 2, unscored: 3 };

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

function trendDirection(delta, lowerIsBetter = false) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.0001) return "unchanged";
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return improved ? "improved" : (lowerIsBetter ? "higher" : "lower");
}

function rankedChange(previous, current, ranks) {
  if (ranks[previous] == null && ranks[current] == null) return "unchanged";
  if (ranks[previous] == null) return current ? "new" : "unchanged";
  if (ranks[current] == null) return "missing";
  if (ranks[current] === ranks[previous]) return "unchanged";
  return ranks[current] < ranks[previous] ? "lower-risk" : "higher-risk";
}

function assessmentPoint(assessment = {}) {
  return {
    date: assessment.date ?? null,
    ts: assessment.ts ?? null,
    sourceSessionId: assessment.sourceSessionId ?? null,
    sourceSessionTs: assessment.sourceSessionTs ?? null,
  };
}

function zoneByKey(assessment = {}) {
  const out = new Map();
  for (const zone of assessment.zones ?? []) {
    if (zone?.zone) out.set(zone.zone, zone);
  }
  return out;
}

function compareAssessmentRecords(previous = null, current = null) {
  if (!previous || !current) return null;
  const previousAverage = previous.averageVoluntaryMovement;
  const currentAverage = current.averageVoluntaryMovement;
  const averageDelta = Number.isFinite(previousAverage) && Number.isFinite(currentAverage)
    ? compactNumber(currentAverage - previousAverage)
    : null;
  const previousResting = previous.resting?.averageAsymmetryRatio;
  const currentResting = current.resting?.averageAsymmetryRatio;
  const restingDelta = Number.isFinite(previousResting) && Number.isFinite(currentResting)
    ? compactNumber(currentResting - previousResting)
    : null;
  const previousZones = zoneByKey(previous);
  const currentZones = zoneByKey(current);
  const zoneKeys = [...new Set([...previousZones.keys(), ...currentZones.keys()])];

  return {
    kind: "standard-assessment-comparison",
    from: assessmentPoint(previous),
    to: assessmentPoint(current),
    averageVoluntaryMovement: {
      previous: previousAverage ?? null,
      current: currentAverage ?? null,
      delta: averageDelta,
      direction: trendDirection(averageDelta),
    },
    restingAsymmetry: {
      previous: previousResting ?? null,
      current: currentResting ?? null,
      delta: restingDelta,
      direction: trendDirection(restingDelta, true),
    },
    coactivationRisk: {
      previous: previous.coactivationRisk ?? null,
      current: current.coactivationRisk ?? null,
      change: rankedChange(previous.coactivationRisk, current.coactivationRisk, COACTIVATION_RANK),
    },
    captureQuality: {
      previous: previous.captureQuality?.key ?? previous.captureQuality ?? null,
      current: current.captureQuality?.key ?? current.captureQuality ?? null,
      change: rankedChange(previous.captureQuality?.key ?? previous.captureQuality, current.captureQuality?.key ?? current.captureQuality, QUALITY_RANK),
    },
    zones: zoneKeys.map((zoneKey) => {
      const previousZone = previousZones.get(zoneKey);
      const currentZone = currentZones.get(zoneKey);
      const previousMovement = previousZone?.voluntaryMovement;
      const currentMovement = currentZone?.voluntaryMovement;
      const delta = Number.isFinite(previousMovement) && Number.isFinite(currentMovement)
        ? compactNumber(currentMovement - previousMovement)
        : null;
      return {
        zone: zoneKey,
        label: currentZone?.label ?? previousZone?.label ?? ASSESSMENT_ZONE_LABELS[zoneKey] ?? zoneKey,
        previousVoluntaryMovement: previousMovement ?? null,
        currentVoluntaryMovement: currentMovement ?? null,
        voluntaryMovementDelta: delta,
        voluntaryMovementDirection: trendDirection(delta),
        previousCoactivationRisk: previousZone?.coactivationRisk ?? null,
        currentCoactivationRisk: currentZone?.coactivationRisk ?? null,
        coactivationRiskChange: rankedChange(previousZone?.coactivationRisk, currentZone?.coactivationRisk, COACTIVATION_RANK),
        previousCaptureQuality: previousZone?.captureQuality ?? null,
        currentCaptureQuality: currentZone?.captureQuality ?? null,
      };
    }),
    note: "Comparison uses Mirror practice metrics only; it is not a validated clinical grade.",
  };
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
  compareAssessmentRecords,
  summarizeAssessmentSession,
};
