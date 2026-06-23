import assert from "node:assert/strict";
import test from "node:test";
import { computeExerciseSymmetry, computeNoiseFloor } from "../src/ml/faceMetrics.js";

const LEFT_SMILE = [61, 84, 91, 146, 78, 95, 88, 178, 39, 40, 181];
const RIGHT_SMILE = [291, 314, 321, 375, 308, 324, 318, 402, 269, 270, 405];
const LEFT_OPEN_SMILE = [61, 84, 91, 146, 78, 95, 88, 178, 39, 40, 185, 181];
const RIGHT_OPEN_SMILE = [291, 314, 321, 375, 308, 324, 318, 402, 269, 270, 409, 405];
const LEFT_PUCKER = [61, 91, 146, 78, 185, 95, 88, 178, 40, 39, 37, 0];
const RIGHT_PUCKER = [291, 321, 375, 308, 409, 324, 318, 402, 270, 269, 267, 0];
const LEFT_CHEEK = [205, 192, 213, 50, 187, 147, 36, 142, 207, 216];
const RIGHT_CHEEK = [425, 416, 433, 280, 411, 376, 266, 371, 427, 436];
const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const LEFT_EYE_TOP = [173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYE_TOP = [398, 384, 385, 386, 387, 388, 466];
const LEFT_EYE_BOTTOM = [7, 163, 144, 145, 153, 154, 155];
const RIGHT_EYE_BOTTOM = [249, 390, 373, 374, 380, 381, 382];
const LEFT_VOWEL_A = [61, 84, 91, 146, 78, 95, 88, 178, 40, 17, 200];
const RIGHT_VOWEL_A = [291, 314, 321, 375, 308, 324, 318, 402, 270, 17, 200];
const MOUTH_UPPER = [61, 291, 78, 308, 40, 270];
const MOUTH_LOWER = [91, 146, 88, 178, 321, 375, 318, 402, 17, 200];

function landmark(x, y, z = 0) {
  return { x, y, z };
}

function cloneLandmarks(lm) {
  return lm.map((point) => ({ ...point }));
}

function setGroup(lm, idxs, x, y) {
  for (const idx of idxs) lm[idx] = landmark(x, y);
}

function moveGroup(lm, idxs, dx, dy) {
  for (const idx of idxs) lm[idx] = landmark(lm[idx].x + dx, lm[idx].y + dy, lm[idx].z ?? 0);
}

function makeNeutralFace() {
  const lm = Array.from({ length: 478 }, () => landmark(0.5, 0.5));
  lm[33] = landmark(0.3, 0.46);
  lm[263] = landmark(0.7, 0.46);
  lm[0] = landmark(0.5, 0.57);
  setGroup(lm, LEFT_SMILE, 0.43, 0.58);
  setGroup(lm, RIGHT_SMILE, 0.57, 0.58);
  setGroup(lm, LEFT_OPEN_SMILE, 0.43, 0.58);
  setGroup(lm, RIGHT_OPEN_SMILE, 0.57, 0.58);
  lm[17] = landmark(0.5, 0.62);
  setGroup(lm, LEFT_PUCKER, 0.44, 0.58);
  setGroup(lm, RIGHT_PUCKER, 0.56, 0.58);
  setGroup(lm, LEFT_CHEEK, 0.36, 0.54);
  setGroup(lm, RIGHT_CHEEK, 0.64, 0.54);
  setGroup(lm, LEFT_EYE, 0.34, 0.46);
  setGroup(lm, RIGHT_EYE, 0.66, 0.46);
  setGroup(lm, LEFT_EYE_TOP, 0.34, 0.43);
  setGroup(lm, RIGHT_EYE_TOP, 0.66, 0.43);
  setGroup(lm, LEFT_EYE_BOTTOM, 0.34, 0.49);
  setGroup(lm, RIGHT_EYE_BOTTOM, 0.66, 0.49);
  setGroup(lm, [...LEFT_VOWEL_A, ...RIGHT_VOWEL_A], 0.5, 0.58);
  setGroup(lm, MOUTH_UPPER, 0.5, 0.56);
  setGroup(lm, MOUTH_LOWER, 0.5, 0.6);
  return lm;
}

test("smile scoring requires outward-up mouth movement", () => {
  const neutral = makeNeutralFace();
  const smile = cloneLandmarks(neutral);
  moveGroup(smile, LEFT_SMILE, -0.004, -0.003);
  moveGroup(smile, RIGHT_SMILE, 0.004, -0.003);
  const pucker = cloneLandmarks(neutral);
  moveGroup(pucker, LEFT_SMILE, 0.005, 0);
  moveGroup(pucker, RIGHT_SMILE, -0.005, 0);

  const scored = computeExerciseSymmetry("closed-smile", smile, neutral);

  assert.ok(scored);
  assert.ok(scored.symmetry > 0.95);
  assert.equal(computeExerciseSymmetry("closed-smile", pucker, neutral), null);
});

test("pucker scoring requires inward lip movement", () => {
  const neutral = makeNeutralFace();
  const pucker = cloneLandmarks(neutral);
  moveGroup(pucker, LEFT_PUCKER, 0.004, 0);
  moveGroup(pucker, RIGHT_PUCKER, -0.004, 0);
  const smile = cloneLandmarks(neutral);
  moveGroup(smile, LEFT_PUCKER, -0.004, -0.002);
  moveGroup(smile, RIGHT_PUCKER, 0.004, -0.002);

  const scored = computeExerciseSymmetry("pucker", pucker, neutral);

  assert.ok(scored);
  assert.ok(scored.symmetry > 0.95);
  assert.equal(computeExerciseSymmetry("pucker", smile, neutral), null);
});

test("cheek puff and cheek suck use opposite horizontal directions", () => {
  const neutral = makeNeutralFace();
  const puff = cloneLandmarks(neutral);
  moveGroup(puff, LEFT_CHEEK, -0.004, 0);
  moveGroup(puff, RIGHT_CHEEK, 0.004, 0);
  const suck = cloneLandmarks(neutral);
  moveGroup(suck, LEFT_CHEEK, 0.004, 0);
  moveGroup(suck, RIGHT_CHEEK, -0.004, 0);

  assert.ok(computeExerciseSymmetry("cheek-puff", puff, neutral));
  assert.equal(computeExerciseSymmetry("cheek-puff", suck, neutral), null);
  assert.ok(computeExerciseSymmetry("cheek-suck", suck, neutral));
  assert.equal(computeExerciseSymmetry("cheek-suck", puff, neutral), null);
});

test("eye closure uses aperture decrease instead of generic eye drift", () => {
  const neutral = makeNeutralFace();
  const closed = cloneLandmarks(neutral);
  moveGroup(closed, [...LEFT_EYE_TOP, ...RIGHT_EYE_TOP], 0, 0.015);
  moveGroup(closed, [...LEFT_EYE_BOTTOM, ...RIGHT_EYE_BOTTOM], 0, -0.015);
  const lateralDrift = cloneLandmarks(neutral);
  moveGroup(lateralDrift, LEFT_EYE, -0.01, 0);
  moveGroup(lateralDrift, RIGHT_EYE, 0.01, 0);

  assert.ok(computeExerciseSymmetry("eye-close", closed, neutral));
  assert.equal(computeExerciseSymmetry("eye-close", lateralDrift, neutral), null);
});

test("eye closure family scores soft movement below the generic pairwise gate", () => {
  const neutral = makeNeutralFace();
  const current = cloneLandmarks(neutral);
  moveGroup(current, [...LEFT_EYE_TOP, ...RIGHT_EYE_TOP], 0, 0.003);
  moveGroup(current, [...LEFT_EYE_BOTTOM, ...RIGHT_EYE_BOTTOM], 0, -0.003);

  for (const exerciseId of ["eye-close", "blink", "wink", "emoji-wink"]) {
    const result = computeExerciseSymmetry(exerciseId, current, neutral);
    assert.ok(result, `${exerciseId} should score below the generic pairwise gate`);
    assert.ok(result.peak < 0.02, `${exerciseId} regression sample should stay below the old generic gate`);
  }
});

test("cheek suck and open smile use their directional gates below the generic pairwise gate", () => {
  const neutral = makeNeutralFace();
  const cheekSuck = cloneLandmarks(neutral);
  moveGroup(cheekSuck, LEFT_CHEEK, 0.00055, 0);
  moveGroup(cheekSuck, RIGHT_CHEEK, -0.00055, 0);

  const openSmile = cloneLandmarks(neutral);
  moveGroup(openSmile, LEFT_OPEN_SMILE, -0.00045, -0.00025);
  moveGroup(openSmile, RIGHT_OPEN_SMILE, 0.00045, -0.00025);

  for (const [exerciseId, current] of [["cheek-suck", cheekSuck], ["open-smile", openSmile]]) {
    const result = computeExerciseSymmetry(exerciseId, current, neutral);
    assert.ok(result, `${exerciseId} should score below the generic pairwise gate`);
    assert.ok(result.peak < 0.02, `${exerciseId} regression sample should stay below the old generic gate`);
  }
});

test("vowel-a uses mouth aperture increase and rejects smile-only movement", () => {
  const neutral = makeNeutralFace();
  const open = cloneLandmarks(neutral);
  moveGroup(open, MOUTH_UPPER, 0, -0.012);
  moveGroup(open, MOUTH_LOWER, 0, 0.018);
  const smile = cloneLandmarks(neutral);
  moveGroup(smile, LEFT_VOWEL_A, -0.006, 0);
  moveGroup(smile, RIGHT_VOWEL_A, 0.006, 0);

  assert.ok(computeExerciseSymmetry("vowel-a", open, neutral));
  assert.equal(computeExerciseSymmetry("vowel-a", smile, neutral), null);
});

test("calibration records directional noise for mouth, cheek, eye, and vowel families", () => {
  const neutral = makeNeutralFace();
  const samples = [-0.00016, -0.00008, 0, 0.00006, 0.00012, 0.00018].map((shift) => {
    const sample = cloneLandmarks(neutral);
    moveGroup(sample, LEFT_SMILE, shift, shift / 2);
    moveGroup(sample, RIGHT_SMILE, -shift, shift / 2);
    moveGroup(sample, LEFT_PUCKER, -shift, 0);
    moveGroup(sample, RIGHT_PUCKER, shift, 0);
    moveGroup(sample, LEFT_CHEEK, shift, 0);
    moveGroup(sample, RIGHT_CHEEK, -shift, 0);
    moveGroup(sample, LEFT_EYE_TOP, 0, shift);
    moveGroup(sample, RIGHT_EYE_TOP, 0, shift);
    moveGroup(sample, MOUTH_LOWER, 0, shift);
    return sample;
  });

  const noise = computeNoiseFloor(samples, neutral);

  assert.ok(noise?.directional?.smilePull);
  assert.ok(noise.directional.puckerInward);
  assert.ok(noise.directional.cheekPuffOutward);
  assert.ok(noise.directional.cheekSuckInward);
  assert.ok(noise.directional.eyeClosure);
  assert.ok(noise.directional.mouthOpen);
});
