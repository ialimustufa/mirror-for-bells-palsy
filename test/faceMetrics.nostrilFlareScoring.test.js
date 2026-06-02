import assert from "node:assert/strict";
import test from "node:test";
import { computeExerciseSymmetry } from "../src/ml/faceMetrics.js";

const MIDLINE = [1, 2, 4, 5, 195, 197];
const LEFT_RIM = [49, 48, 64];
const RIGHT_RIM = [279, 278, 294];
const LEFT_ALA = [102, 219, 218];
const RIGHT_ALA = [331, 439, 438];
const LEFT_NOSE = [...LEFT_RIM, ...LEFT_ALA];
const RIGHT_NOSE = [...RIGHT_RIM, ...RIGHT_ALA];

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
  setGroup(lm, LEFT_RIM, 0.462, 0.55);
  setGroup(lm, LEFT_ALA, 0.455, 0.545);
  setGroup(lm, RIGHT_RIM, 0.538, 0.55);
  setGroup(lm, RIGHT_ALA, 0.545, 0.545);
  return lm;
}

test("nostril flare scores outward widening from rest", () => {
  const neutral = makeNeutralFace();
  const current = cloneLandmarks(neutral);

  for (const idx of LEFT_NOSE) current[idx] = landmark(current[idx].x - 0.006, current[idx].y);
  for (const idx of RIGHT_NOSE) current[idx] = landmark(current[idx].x + 0.006, current[idx].y);

  const result = computeExerciseSymmetry("nose-wrinkle", current, neutral);

  assert.ok(result);
  assert.ok(result.symmetry > 0.95);
  assert.ok(result.peak > 0.01);
});

test("nostril flare does not score inward narrowing as flare", () => {
  const neutral = makeNeutralFace();
  const current = cloneLandmarks(neutral);

  for (const idx of LEFT_NOSE) current[idx] = landmark(current[idx].x + 0.006, current[idx].y);
  for (const idx of RIGHT_NOSE) current[idx] = landmark(current[idx].x - 0.006, current[idx].y);

  assert.equal(computeExerciseSymmetry("nose-wrinkle", current, neutral), null);
});

test("nostril flare does not score upward nose scrunch as flare", () => {
  const neutral = makeNeutralFace();
  const current = cloneLandmarks(neutral);

  for (const idx of [...LEFT_NOSE, ...RIGHT_NOSE]) {
    current[idx] = landmark(current[idx].x, current[idx].y - 0.006);
  }

  assert.equal(computeExerciseSymmetry("nose-wrinkle", current, neutral), null);
  assert.ok(computeExerciseSymmetry("emoji-nose-scrunch", current, neutral));
});
