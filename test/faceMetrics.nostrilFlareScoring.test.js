import assert from "node:assert/strict";
import test from "node:test";
import { computeExerciseSymmetry, computeNoiseFloor, effectiveProfileThreshold } from "../src/ml/faceMetrics.js";

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

function noseNoiseFloor(sideNoise) {
  const noise = new Float32Array(478);
  const pointNoise = sideNoise * Math.sqrt(LEFT_NOSE.length);
  for (const idx of [...LEFT_NOSE, ...RIGHT_NOSE]) noise[idx] = pointNoise;
  return noise;
}

function noseNoiseFloorWithOutward(sideNoise, outwardNoise) {
  const noise = noseNoiseFloor(sideNoise);
  Object.defineProperty(noise, "nostrilOutward", { value: { left: outwardNoise, right: outwardNoise } });
  return noise;
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

test("nostril flare scores subtle outward widening when nose activation supports it", () => {
  const neutral = makeNeutralFace();
  const current = cloneLandmarks(neutral);

  for (const idx of LEFT_NOSE) current[idx] = landmark(current[idx].x - 0.0002, current[idx].y);
  for (const idx of RIGHT_NOSE) current[idx] = landmark(current[idx].x + 0.0002, current[idx].y);

  const result = computeExerciseSymmetry(
    "nose-wrinkle",
    current,
    neutral,
    null,
    { noseSneerLeft: 0.24, noseSneerRight: 0.24 },
    { noseSneerLeft: 0.04, noseSneerRight: 0.04 },
  );

  assert.ok(result);
  assert.ok(result.symmetry > 0.95);
  assert.ok(result.peak > 0.002);
});

test("nostril flare scores tiny rim-only widening when nose activation supports it", () => {
  const neutral = makeNeutralFace();
  const current = cloneLandmarks(neutral);

  for (const idx of LEFT_RIM) current[idx] = landmark(current[idx].x - 0.00012, current[idx].y);
  for (const idx of RIGHT_RIM) current[idx] = landmark(current[idx].x + 0.00012, current[idx].y);

  const result = computeExerciseSymmetry(
    "nose-wrinkle",
    current,
    neutral,
    null,
    { noseSneerLeft: 0.22, noseSneerRight: 0.22 },
    { noseSneerLeft: 0.04, noseSneerRight: 0.04 },
  );

  assert.ok(result);
  assert.ok(result.symmetry > 0.95);
  assert.ok(result.peak > 0.002);
});

test("nostril flare scores low movement that sits below full calibration noise", () => {
  const neutral = makeNeutralFace();
  const current = cloneLandmarks(neutral);

  for (const idx of LEFT_NOSE) current[idx] = landmark(current[idx].x - 0.0017, current[idx].y);
  for (const idx of RIGHT_NOSE) current[idx] = landmark(current[idx].x + 0.0017, current[idx].y);

  const result = computeExerciseSymmetry("nose-wrinkle", current, neutral, noseNoiseFloor(0.006));

  assert.ok(result);
  assert.ok(result.symmetry > 0.95);
  assert.ok(result.peak > 0.002);
});

test("nostril flare scores asymmetric low movement when shape is clearly outward", () => {
  const neutral = makeNeutralFace();
  const current = cloneLandmarks(neutral);

  for (const idx of LEFT_NOSE) current[idx] = landmark(current[idx].x - 0.00125, current[idx].y);
  for (const idx of RIGHT_NOSE) current[idx] = landmark(current[idx].x + 0.00036, current[idx].y);

  const result = computeExerciseSymmetry("nose-wrinkle", current, neutral, noseNoiseFloor(0.0065));

  assert.ok(result);
  assert.ok(result.symmetry > 0.2);
  assert.ok(result.symmetry < 0.4);
  assert.ok(result.peak > 0.002);
});

test("nostril flare prefers nostril-specific outward noise over broad landmark noise", () => {
  const neutral = makeNeutralFace();
  const current = cloneLandmarks(neutral);

  for (const idx of LEFT_NOSE) current[idx] = landmark(current[idx].x - 0.0004, current[idx].y);
  for (const idx of RIGHT_NOSE) current[idx] = landmark(current[idx].x + 0.0004, current[idx].y);

  assert.equal(computeExerciseSymmetry("nose-wrinkle", current, neutral, noseNoiseFloor(0.006)), null);

  const result = computeExerciseSymmetry("nose-wrinkle", current, neutral, noseNoiseFloorWithOutward(0.006, 0.00015));

  assert.ok(result);
  assert.ok(result.symmetry > 0.95);
  assert.ok(result.peak > 0.0008);
});

test("calibration records nostril-specific outward jitter", () => {
  const neutral = makeNeutralFace();
  const samples = [-0.00018, -0.00008, 0, 0.00008, 0.00018, 0.0001].map((shift) => {
    const sample = cloneLandmarks(neutral);
    for (const idx of LEFT_NOSE) sample[idx] = landmark(sample[idx].x + shift, sample[idx].y);
    for (const idx of RIGHT_NOSE) sample[idx] = landmark(sample[idx].x - shift, sample[idx].y);
    return sample;
  });

  const noise = computeNoiseFloor(samples, neutral);

  assert.ok(noise?.nostrilOutward);
  assert.ok(noise.nostrilOutward.left >= 0);
  assert.ok(noise.nostrilOutward.right >= 0);
  assert.ok(noise.nostrilOutward.left < 0.001);
  assert.ok(noise.nostrilOutward.right < 0.001);
});

test("nostril flare does not score jitter under the weighted noise gate", () => {
  const neutral = makeNeutralFace();
  const current = cloneLandmarks(neutral);

  for (const idx of LEFT_NOSE) current[idx] = landmark(current[idx].x - 0.0004, current[idx].y);
  for (const idx of RIGHT_NOSE) current[idx] = landmark(current[idx].x + 0.0004, current[idx].y);

  assert.equal(computeExerciseSymmetry("nose-wrinkle", current, neutral, noseNoiseFloor(0.006)), null);
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

test("nostril flare does not score nose activation without outward widening", () => {
  const neutral = makeNeutralFace();
  const current = cloneLandmarks(neutral);

  for (const idx of [...LEFT_NOSE, ...RIGHT_NOSE]) {
    current[idx] = landmark(current[idx].x, current[idx].y - 0.006);
  }

  const result = computeExerciseSymmetry(
    "nose-wrinkle",
    current,
    neutral,
    null,
    { noseSneerLeft: 0.4, noseSneerRight: 0.4 },
    { noseSneerLeft: 0.05, noseSneerRight: 0.05 },
  );

  assert.equal(result, null);
});

test("nose profile threshold stays permissive for subtle nostril movement", () => {
  assert.equal(effectiveProfileThreshold("nose-wrinkle", 0.02), 0.0014);
});
