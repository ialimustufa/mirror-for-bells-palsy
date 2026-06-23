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
  assert.match(result.reasons.join(" "), /resting asymmetry metrics/);
});
