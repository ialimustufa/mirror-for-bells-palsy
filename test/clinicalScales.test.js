import assert from "node:assert/strict";
import test from "node:test";
import { estimateClinicalScaleGrades } from "../src/domain/clinicalScales.js";

const RESTING_METRICS = {
  version: 1,
  averageAsymmetryRatio: 0.16,
  metrics: {
    palpebralFissure: { label: "Palpebral fissure", userLeft: 0.044, userRight: 0.05, asymmetryRatio: 0.1, narrowerSide: "left" },
    nasolabialMidface: { label: "Nasolabial/midface proxy", userLeft: 0.04, userRight: 0.07, asymmetryRatio: 0.35, smallerSide: "left" },
    oralCommissure: { label: "Oral commissure vertical position", userLeft: 0.58, userRight: 0.61, asymmetryRatio: 0.05, lowerSide: "right" },
  },
};

function movementScore(exerciseId, ratio, extra = {}) {
  return {
    exerciseId,
    initialMovementProgress: { affectedProgressRatio: ratio },
    captureQuality: { key: "strong" },
    ...extra,
  };
}

test("clinical scale estimates require at least 80 percent usable standard assessment coverage", () => {
  const result = estimateClinicalScaleGrades({
    restingMetrics: RESTING_METRICS,
    scores: [
      movementScore("eyebrow-raise", 0.9),
      movementScore("eye-close", 0.8),
      movementScore("open-smile", 0.7),
    ],
  });

  assert.equal(result.status, "insufficient-data");
  assert.equal(result.coverage.usableMovementCount, 3);
  assert.equal(result.coverage.requiredMovementCount, 5);
  assert.equal(result.coverage.standardMet, false);
  assert.match(result.reasons.join(" "), /80% usable/);
  assert.equal(result.scales, null);
});

test("clinical scale estimates map complete assessment evidence into HB, Sunnybrook, and eFACE-style domains", () => {
  const result = estimateClinicalScaleGrades({
    restingMetrics: RESTING_METRICS,
    scores: [
      movementScore("eyebrow-raise", 0.95),
      movementScore("eye-close", 0.8, { movementFeatures: { coactivation: { risk: "medium", score: 0.22 } } }),
      movementScore("open-smile", 0.7, { movementFeatures: { coactivation: { risk: "high", score: 0.65 } } }),
      movementScore("nose-wrinkle", 0.5),
      movementScore("pucker", 0.3),
    ],
  });

  assert.equal(result.status, "estimated");
  assert.equal(result.evidence.tier, "complete-standard-assessment");
  assert.equal(result.evidence.label, "Complete standard-assessment evidence");
  assert.equal(result.evidence.completeRestingMetrics, true);
  assert.deepEqual(result.evidence.requiredRestingMetricKeys, ["palpebralFissure", "nasolabialMidface", "oralCommissure"]);
  assert.deepEqual(result.evidence.availableRestingMetricKeys, ["palpebralFissure", "nasolabialMidface", "oralCommissure"]);
  assert.deepEqual(result.evidence.missingRestingMetricKeys, []);
  assert.equal(result.evidence.calculationUsesCompleteRestingMetrics, true);
  assert.equal(result.coverage.standardMet, true);
  assert.equal(result.coverage.usableMovementCount, 5);
  assert.equal(result.scales.houseBrackmann.grade, "IV");
  assert.equal(result.scales.sunnybrook.voluntaryMovementScore, 72);
  assert.equal(result.scales.sunnybrook.restingSymmetryScore, 15);
  assert.equal(result.scales.sunnybrook.synkinesisScore, 4);
  assert.equal(result.scales.sunnybrook.compositeScore, 53);
  assert.ok(result.scales.eface.totalScore > 65);
  assert.ok(result.scales.eface.totalScore < 75);
  assert.match(result.caveats.join(" "), /not assigned by a clinician/);
});

test("clinical scale estimates distinguish minimum from complete standard evidence", () => {
  const result = estimateClinicalScaleGrades({
    restingMetrics: RESTING_METRICS,
    scores: [
      movementScore("eyebrow-raise", 0.95),
      movementScore("eye-close", 0.8),
      movementScore("open-smile", 0.7),
      movementScore("nose-wrinkle", 0.5),
    ],
  });

  assert.equal(result.status, "estimated");
  assert.equal(result.coverage.usableMovementCount, 4);
  assert.equal(result.coverage.requiredMovementCount, 5);
  assert.equal(result.evidence.tier, "minimum-standard-assessment");
  assert.equal(result.evidence.label, "Minimum standard-assessment evidence");
  assert.deepEqual(result.coverage.missingExerciseIds, ["pucker"]);
  assert.deepEqual(result.evidence.estimatedMovementExerciseIds, ["eyebrow-raise", "eye-close", "open-smile", "nose-wrinkle"]);
  assert.deepEqual(result.evidence.omittedMovementExerciseIds, ["pucker"]);
  assert.equal(result.scales.sunnybrook.inputCompleteness.complete, false);
  assert.deepEqual(result.scales.sunnybrook.inputCompleteness.omittedExerciseIds, ["pucker"]);
  assert.equal(result.scales.houseBrackmann.grade, "IV");
  assert.equal(result.evidence.scaleInputCompleteness.houseBrackmann.complete, true);
});

test("clinical scale estimates omit House-Brackmann when eye closure is missing", () => {
  const result = estimateClinicalScaleGrades({
    restingMetrics: RESTING_METRICS,
    scores: [
      movementScore("eyebrow-raise", 0.95),
      movementScore("open-smile", 0.7),
      movementScore("nose-wrinkle", 0.5),
      movementScore("pucker", 0.3),
    ],
  });

  assert.equal(result.status, "estimated");
  assert.equal(result.coverage.usableMovementCount, 4);
  assert.equal(result.evidence.tier, "minimum-standard-assessment");
  assert.deepEqual(result.evidence.omittedMovementExerciseIds, ["eye-close"]);
  assert.equal(result.scales.houseBrackmann, undefined);
  assert.ok(result.scales.sunnybrook);
  assert.ok(result.scales.eface);
  assert.equal(result.scales.sunnybrook.voluntaryItems.gentleEyeClosure, undefined);
  assert.equal(result.scales.eface.dynamicItems.gentleEyeClosure, undefined);
  assert.equal(result.evidence.scaleInputCompleteness.houseBrackmann.complete, false);
  assert.deepEqual(result.evidence.scaleInputCompleteness.houseBrackmann.missingRequiredExerciseIds, ["eye-close"]);
});

test("clinical scale estimates do not use weak-capture movements in minimum evidence formulas", () => {
  const result = estimateClinicalScaleGrades({
    restingMetrics: RESTING_METRICS,
    scores: [
      movementScore("eyebrow-raise", 0.5),
      movementScore("eye-close", 0.5),
      movementScore("open-smile", 0.5),
      movementScore("nose-wrinkle", 0.5),
      movementScore("pucker", 1, { captureQuality: { key: "weak" } }),
    ],
  });

  assert.equal(result.status, "estimated");
  assert.equal(result.coverage.usableMovementCount, 4);
  assert.equal(result.evidence.tier, "minimum-standard-assessment");
  assert.deepEqual(result.coverage.unusableExerciseIds, ["pucker"]);
  assert.equal(result.evidence.calculationUsesOnlyUsableMovements, true);
  assert.deepEqual(result.evidence.estimatedMovementExerciseIds, ["eyebrow-raise", "eye-close", "open-smile", "nose-wrinkle"]);
  assert.equal(result.scales.sunnybrook.voluntaryItems.lipPucker, undefined);
  assert.equal(result.scales.eface.dynamicItems.lipPucker, undefined);
  assert.equal(result.scales.sunnybrook.voluntaryMovementScore, 60);
  assert.equal(result.scales.eface.dynamicScore, 50);
});

test("clinical scale estimates clamp score outputs to clinical score ranges", () => {
  const result = estimateClinicalScaleGrades({
    restingMetrics: RESTING_METRICS,
    scores: [
      movementScore("eyebrow-raise", 1.4),
      movementScore("eye-close", 1.3),
      movementScore("open-smile", 1.25),
      movementScore("nose-wrinkle", 1.1),
      movementScore("pucker", 1.2),
    ],
  });

  assert.equal(result.status, "estimated");
  assert.equal(result.scales.sunnybrook.compositeScore <= 100, true);
  assert.equal(result.scales.eface.dynamicScore, 100);
  assert.equal(result.scales.eface.totalScore <= 100, true);
  assert.equal(result.scales.eface.dynamicItems.browElevation.score, 100);
  assert.equal(result.scales.houseBrackmann.basis.averageMovementPercent, 100);
});

test("clinical scale estimates fail closed without resting metrics", () => {
  const result = estimateClinicalScaleGrades({
    scores: [
      movementScore("eyebrow-raise", 1),
      movementScore("eye-close", 1),
      movementScore("open-smile", 1),
      movementScore("nose-wrinkle", 1),
      movementScore("pucker", 1),
    ],
  });

  assert.equal(result.status, "insufficient-data");
  assert.equal(result.evidence.tier, "insufficient-standard-evidence");
  assert.match(result.reasons.join(" "), /complete resting asymmetry metrics/);
  assert.equal(result.evidence.completeRestingMetrics, false);
  assert.deepEqual(result.evidence.missingRestingMetricKeys, ["palpebralFissure", "nasolabialMidface", "oralCommissure"]);
});

test("clinical scale estimates fail closed with partial resting metrics", () => {
  const result = estimateClinicalScaleGrades({
    restingMetrics: {
      version: 1,
      metrics: {
        palpebralFissure: RESTING_METRICS.metrics.palpebralFissure,
        oralCommissure: RESTING_METRICS.metrics.oralCommissure,
      },
    },
    scores: [
      movementScore("eyebrow-raise", 1),
      movementScore("eye-close", 1),
      movementScore("open-smile", 1),
      movementScore("nose-wrinkle", 1),
      movementScore("pucker", 1),
    ],
  });

  assert.equal(result.status, "insufficient-data");
  assert.equal(result.coverage.standardMet, true);
  assert.equal(result.evidence.completeRestingMetrics, false);
  assert.deepEqual(result.evidence.availableRestingMetricKeys, ["palpebralFissure", "oralCommissure"]);
  assert.deepEqual(result.evidence.missingRestingMetricKeys, ["nasolabialMidface"]);
  assert.match(result.reasons.join(" "), /Nasolabial\/midface proxy/);
  assert.equal(result.scales, null);
});
