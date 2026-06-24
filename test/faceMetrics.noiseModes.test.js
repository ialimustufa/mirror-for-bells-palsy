import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMovementProfile,
  computeExerciseSymmetry,
  computeNoiseFloor,
  normalizeScoringNoiseMode,
  scoringOptionsFrom,
  thresholdBandsForExercise,
} from "../src/ml/faceMetrics.js";

const MIDLINE = [1, 2, 4, 5, 195, 197];
const LEFT_RIM = [49, 48, 64];
const RIGHT_RIM = [279, 278, 294];
const LEFT_ALA = [102, 219, 218];
const RIGHT_ALA = [331, 439, 438];
const LEFT_NOSE = [...LEFT_RIM, ...LEFT_ALA];
const RIGHT_NOSE = [...RIGHT_RIM, ...RIGHT_ALA];
const LEFT_BROW = [70, 63, 105, 66, 107, 46, 53, 52, 65, 55];
const RIGHT_BROW = [300, 293, 334, 296, 336, 276, 283, 282, 295, 285];
const LEFT_INNER_BROW = [107, 66, 65, 55];
const RIGHT_INNER_BROW = [336, 296, 295, 285];
const LEFT_EYE_TOP = [159, 158, 157, 160, 161];
const RIGHT_EYE_TOP = [386, 385, 384, 387, 388];
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

function makeNeutralFace() {
  const lm = Array.from({ length: 478 }, () => landmark(0.5, 0.5));
  setGroup(lm, MIDLINE, 0.5, 0.5);
  lm[33] = landmark(0.3, 0.5);
  lm[263] = landmark(0.7, 0.5);
  setGroup(lm, LEFT_RIM, 0.462, 0.55);
  setGroup(lm, LEFT_ALA, 0.455, 0.545);
  setGroup(lm, RIGHT_RIM, 0.538, 0.55);
  setGroup(lm, RIGHT_ALA, 0.545, 0.545);
  setGroup(lm, LEFT_EYE_TOP, 0.38, 0.41);
  setGroup(lm, RIGHT_EYE_TOP, 0.62, 0.41);
  setGroup(lm, LEFT_BROW, 0.38, 0.34);
  setGroup(lm, RIGHT_BROW, 0.62, 0.34);
  setGroup(lm, LEFT_INNER_BROW, 0.445, 0.34);
  setGroup(lm, RIGHT_INNER_BROW, 0.555, 0.34);
  setGroup(lm, LEFT_SMILE, 0.43, 0.58);
  setGroup(lm, RIGHT_SMILE, 0.57, 0.58);
  return lm;
}

function noiseFloorWithDirectional(directional = {}, pointNoise = 0) {
  const noise = new Float32Array(478);
  if (pointNoise > 0) noise.fill(pointNoise);
  Object.defineProperty(noise, "directional", { value: directional });
  if (directional.nostrilOutward) {
    Object.defineProperty(noise, "nostrilOutward", { value: directional.nostrilOutward });
  }
  return noise;
}

function moveGroup(lm, idxs, dx, dy) {
  for (const idx of idxs) lm[idx] = landmark(lm[idx].x + dx, lm[idx].y + dy, lm[idx].z ?? 0);
}

test("normal mode blocks tiny generic jitter while soft and raw expose low movement", () => {
  const neutral = makeNeutralFace();
  const current = cloneLandmarks(neutral);
  moveGroup(current, LEFT_SMILE, -0.002, 0);
  moveGroup(current, RIGHT_SMILE, 0.002, 0);
  const noise = noiseFloorWithDirectional({}, 0.006);

  const normal = computeExerciseSymmetry("closed-smile", current, neutral, noise, null, null, null, null, { scoringNoiseMode: "normal" });
  const soft = computeExerciseSymmetry("closed-smile", current, neutral, noise, null, null, null, null, { scoringNoiseMode: "soft" });
  const raw = computeExerciseSymmetry("closed-smile", current, neutral, noise, null, null, null, null, { scoringNoiseMode: "raw" });

  assert.equal(normal, null);
  assert.ok(soft);
  assert.ok(raw);
  assert.ok(raw.peak > soft.peak);
});

test("nose scrunch soft mode scores low upward ala movement under directional jitter", () => {
  const neutral = makeNeutralFace();
  const current = cloneLandmarks(neutral);
  moveGroup(current, [...LEFT_NOSE, ...RIGHT_NOSE], 0, -0.002);
  const noise = noiseFloorWithDirectional({ noseScrunchLift: { left: 0.006, right: 0.006 } });

  const normal = computeExerciseSymmetry("emoji-nose-scrunch", current, neutral, noise, null, null, null, null, { scoringNoiseMode: "normal" });
  const soft = computeExerciseSymmetry("emoji-nose-scrunch", current, neutral, noise, null, null, null, null, { scoringNoiseMode: "soft" });

  assert.equal(normal, null);
  assert.ok(soft);
  assert.ok(soft.symmetry > 0.95);
});

test("brow raise and gentle frown use movement-specific neutral jitter", () => {
  const neutral = makeNeutralFace();
  const browRaise = cloneLandmarks(neutral);
  moveGroup(browRaise, [...LEFT_BROW, ...RIGHT_BROW], 0, -0.003);
  const frown = cloneLandmarks(neutral);
  moveGroup(frown, LEFT_INNER_BROW, 0.002, 0.0025);
  moveGroup(frown, RIGHT_INNER_BROW, -0.002, 0.0025);
  const noise = noiseFloorWithDirectional({
    browGap: { left: 0.006, right: 0.006 },
    frown: { left: 0.006, right: 0.006 },
  });

  assert.equal(computeExerciseSymmetry("eyebrow-raise", browRaise, neutral, noise, null, null, null, null, { scoringNoiseMode: "normal" }), null);
  assert.ok(computeExerciseSymmetry("eyebrow-raise", browRaise, neutral, noise, null, null, null, null, { scoringNoiseMode: "soft" }));
  assert.equal(computeExerciseSymmetry("gentle-frown", frown, neutral, noise, null, null, null, null, { scoringNoiseMode: "normal" }), null);
  assert.ok(computeExerciseSymmetry("gentle-frown", frown, neutral, noise, null, null, null, null, { scoringNoiseMode: "soft" }));
});

test("calibration records movement-specific directional jitter", () => {
  const neutral = makeNeutralFace();
  const samples = [-0.00012, -0.00006, 0, 0.00008, 0.00014, 0.0001].map((shift) => {
    const sample = cloneLandmarks(neutral);
    moveGroup(sample, LEFT_NOSE, shift, -Math.max(0, shift));
    moveGroup(sample, RIGHT_NOSE, -shift, -Math.max(0, shift));
    moveGroup(sample, [...LEFT_BROW, ...RIGHT_BROW], 0, shift);
    moveGroup(sample, LEFT_INNER_BROW, Math.max(0, shift), Math.max(0, shift));
    moveGroup(sample, RIGHT_INNER_BROW, -Math.max(0, shift), Math.max(0, shift));
    return sample;
  });

  const noise = computeNoiseFloor(samples, neutral);

  assert.ok(noise?.directional?.nostrilOutward);
  assert.ok(noise.directional.noseScrunchLift);
  assert.ok(noise.directional.browGap);
  assert.ok(noise.directional.frown);
});

test("movement profiles tag scoring mode and save compact directional noise", () => {
  const neutral = makeNeutralFace();
  const noise = noiseFloorWithDirectional({ browGap: { left: 0.001234, right: 0.001111 } }, 0.001);
  const profile = buildMovementProfile({
    neutral,
    noise,
    neutralFacialTransformationMatrix: null,
    affectedSide: "right",
    comfortLevel: "gentle",
    scoringNoiseMode: "soft",
    setupQuality: { key: "usable", score: 0.76, sampleCount: 24 },
    exerciseStats: [{
      exerciseId: "eyebrow-raise",
      name: "Eyebrow raise",
      region: "Brow",
      frames: 12,
      holdFrames: 12,
      alignedFrames: 12,
      neutralFrames: 8,
      leftAvg: 0.01,
      rightAvg: 0.01,
      symAvg: 1,
      leftPeak: 0.015,
      rightPeak: 0.015,
      quality: { key: "strong" },
    }],
  });

  assert.equal(profile.scoringNoiseMode, "soft");
  assert.deepEqual(profile.setupQuality, { key: "usable", score: 0.76, sampleCount: 24 });
  assert.ok(Array.isArray(profile.noiseFloor.values));
  assert.deepEqual(profile.noiseFloor.directional.browGap, { left: 0.001234, right: 0.001111 });
  assert.deepEqual(profile.exercises["eyebrow-raise"].thresholdBands, {
    minimumVisible: 0.003,
    reliableMovement: 0.0052,
    baselineTarget: 0.015,
  });
  assert.equal(profile.exercises["eyebrow-raise"].activationThreshold, profile.exercises["eyebrow-raise"].thresholdBands.reliableMovement);
});

test("threshold bands separate minimum visible, reliable, and baseline target movement", () => {
  assert.deepEqual(thresholdBandsForExercise("closed-smile", 0.02), {
    minimumVisible: 0.004,
    reliableMovement: 0.007,
    baselineTarget: 0.02,
  });
  assert.deepEqual(thresholdBandsForExercise("nose-wrinkle", 0.006), {
    minimumVisible: 0.0009,
    reliableMovement: 0.0015,
    baselineTarget: 0.006,
  });
});

test("scoring mode normalization falls back to normal", () => {
  assert.equal(normalizeScoringNoiseMode("raw"), "raw");
  assert.equal(normalizeScoringNoiseMode("unknown"), "normal");
  assert.equal(scoringOptionsFrom({ scoringNoiseMode: "soft" }).scoringNoiseMode, "soft");
});
