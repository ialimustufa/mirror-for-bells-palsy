import assert from "node:assert/strict";
import test from "node:test";
import { computeExerciseSymmetry } from "../src/ml/faceMetrics.js";

const LEFT_BROW = [70, 63, 105, 66, 107, 46, 53, 52, 65, 55];
const RIGHT_BROW = [300, 293, 334, 296, 336, 276, 283, 282, 295, 285];
const LEFT_INNER_BROW = [107, 66, 65, 55];
const RIGHT_INNER_BROW = [336, 296, 295, 285];
const LEFT_EYE_TOP = [159, 158, 157, 160, 161];
const RIGHT_EYE_TOP = [386, 385, 384, 387, 388];
const MIDLINE = [1, 4, 5, 195, 197];

function landmark(x, y, z = 0) {
  return { x, y, z };
}

function setGroup(lm, idxs, x, y) {
  for (const idx of idxs) lm[idx] = landmark(x, y);
}

function cloneLandmarks(lm) {
  return lm.map((point) => ({ ...point }));
}

function makeNeutralFace() {
  const lm = Array.from({ length: 478 }, () => landmark(0.5, 0.5));
  setGroup(lm, MIDLINE, 0.5, 0.5);
  lm[33] = landmark(0.3, 0.5);
  lm[263] = landmark(0.7, 0.5);

  setGroup(lm, LEFT_EYE_TOP, 0.38, 0.41);
  setGroup(lm, RIGHT_EYE_TOP, 0.62, 0.41);
  setGroup(lm, LEFT_BROW, 0.38, 0.34);
  setGroup(lm, RIGHT_BROW, 0.62, 0.34);
  setGroup(lm, LEFT_INNER_BROW, 0.445, 0.34);
  setGroup(lm, RIGHT_INNER_BROW, 0.555, 0.34);
  return lm;
}

test("gentle frown scores downward and inward brow motion", () => {
  const neutral = makeNeutralFace();
  const current = cloneLandmarks(neutral);

  for (const idx of LEFT_INNER_BROW) {
    current[idx] = landmark(current[idx].x + 0.003, current[idx].y + 0.004);
  }
  for (const idx of RIGHT_INNER_BROW) {
    current[idx] = landmark(current[idx].x - 0.003, current[idx].y + 0.004);
  }

  const result = computeExerciseSymmetry("gentle-frown", current, neutral);

  assert.ok(result);
  assert.ok(result.symmetry > 0.95);
  assert.ok(result.peak > 0.01);
});

test("gentle frown does not score an eyebrow raise as a valid frown", () => {
  const neutral = makeNeutralFace();
  const current = cloneLandmarks(neutral);

  for (const idx of [...LEFT_BROW, ...RIGHT_BROW]) {
    current[idx] = landmark(current[idx].x, current[idx].y - 0.006);
  }

  assert.equal(computeExerciseSymmetry("gentle-frown", current, neutral), null);
});
