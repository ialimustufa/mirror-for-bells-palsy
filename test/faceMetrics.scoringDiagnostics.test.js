import assert from "node:assert/strict";
import test from "node:test";
import {
  SCORE_DROP_REASONS,
  SCORING_MODEL_VERSION,
  computeExerciseSymmetryDiagnostic,
} from "../src/ml/faceMetrics.js";

const LEFT_SMILE = [61, 84, 91, 146, 78, 95, 88, 178, 39, 40, 181];
const RIGHT_SMILE = [291, 314, 321, 375, 308, 324, 318, 402, 269, 270, 405];

function landmark(x, y, z = 0) {
  return { x, y, z };
}

function setGroup(lm, idxs, x, y) {
  for (const idx of idxs) lm[idx] = landmark(x, y);
}

function cloneLandmarks(lm) {
  return lm.map((point) => ({ ...point }));
}

function moveGroup(lm, idxs, dx, dy) {
  for (const idx of idxs) lm[idx] = landmark(lm[idx].x + dx, lm[idx].y + dy, lm[idx].z ?? 0);
}

function makeNeutralFace() {
  const lm = Array.from({ length: 478 }, () => landmark(0.5, 0.5));
  lm[1] = landmark(0.5, 0.5);
  lm[33] = landmark(0.3, 0.5);
  lm[263] = landmark(0.7, 0.5);
  setGroup(lm, LEFT_SMILE, 0.43, 0.58);
  setGroup(lm, RIGHT_SMILE, 0.57, 0.58);
  return lm;
}

test("diagnostic wrapper tags successful scored frames with the scoring model version", () => {
  const neutral = makeNeutralFace();
  const current = cloneLandmarks(neutral);
  moveGroup(current, LEFT_SMILE, -0.012, 0);
  moveGroup(current, RIGHT_SMILE, 0.012, 0);

  const diagnostic = computeExerciseSymmetryDiagnostic("closed-smile", current, neutral);

  assert.equal(diagnostic.scoringModelVersion, SCORING_MODEL_VERSION);
  assert.equal(diagnostic.scored, true);
  assert.equal(diagnostic.dropReason, null);
  assert.ok(diagnostic.result);
  assert.equal(diagnostic.normalizationMethod, "eye-line");
});

test("diagnostic wrapper reports missing neutral calibration", () => {
  const current = makeNeutralFace();
  const diagnostic = computeExerciseSymmetryDiagnostic("closed-smile", current, null);

  assert.equal(diagnostic.scored, false);
  assert.equal(diagnostic.result, null);
  assert.equal(diagnostic.dropReason, SCORE_DROP_REASONS.missingNeutral);
});

test("diagnostic wrapper reports below-gate frames without changing legacy scorer contract", () => {
  const neutral = makeNeutralFace();
  const current = cloneLandmarks(neutral);
  moveGroup(current, LEFT_SMILE, -0.0001, 0);
  moveGroup(current, RIGHT_SMILE, 0.0001, 0);

  const diagnostic = computeExerciseSymmetryDiagnostic("closed-smile", current, neutral);

  assert.equal(diagnostic.scored, false);
  assert.equal(diagnostic.result, null);
  assert.equal(diagnostic.dropReason, SCORE_DROP_REASONS.belowSignalGate);
});
