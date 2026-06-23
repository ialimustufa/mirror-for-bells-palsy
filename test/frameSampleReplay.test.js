import assert from "node:assert/strict";
import test from "node:test";
import { computeQuietRegionCoactivation } from "../src/ml/faceMetrics.js";
import { replayFrameSamples } from "../src/ml/frameSampleReplay.js";

const LEFT_SMILE = [61, 84, 91, 146, 78, 95, 88, 178, 39, 40, 181];
const RIGHT_SMILE = [291, 314, 321, 375, 308, 324, 318, 402, 269, 270, 405];
const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];

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
  setGroup(lm, LEFT_EYE, 0.34, 0.42);
  setGroup(lm, RIGHT_EYE, 0.66, 0.42);
  return lm;
}

test("quiet-region coactivation rises when smile includes eye movement", () => {
  const neutral = makeNeutralFace();
  const cleanSmile = cloneLandmarks(neutral);
  const eyeLeakSmile = cloneLandmarks(neutral);
  moveGroup(cleanSmile, LEFT_SMILE, -0.012, 0);
  moveGroup(cleanSmile, RIGHT_SMILE, 0.012, 0);
  moveGroup(eyeLeakSmile, LEFT_SMILE, -0.012, 0);
  moveGroup(eyeLeakSmile, RIGHT_SMILE, 0.012, 0);
  moveGroup(eyeLeakSmile, [...LEFT_EYE, ...RIGHT_EYE], 0, 0.01);

  const clean = computeQuietRegionCoactivation("closed-smile", cleanSmile, neutral, null, null, null, 0.25);
  const leaked = computeQuietRegionCoactivation("closed-smile", eyeLeakSmile, neutral, null, null, null, 0.25);

  assert.ok(clean);
  assert.ok(leaked);
  assert.ok(leaked.score > clean.score);
  assert.ok(leaked.regions.some((item) => item.region === "eyes"));
});

test("frame sample replay reconstructs calibration and scores hold frames", () => {
  const neutral = makeNeutralFace();
  const hold = cloneLandmarks(neutral);
  moveGroup(hold, LEFT_SMILE, -0.012, 0);
  moveGroup(hold, RIGHT_SMILE, 0.012, 0);
  const samples = [
    { phase: "calibrate", ts: 1, landmarks: neutral, blendshapes: {}, scoringNoiseMode: "normal" },
    { phase: "calibrate", ts: 2, landmarks: neutral, blendshapes: {}, scoringNoiseMode: "normal" },
    { phase: "calibrate", ts: 3, landmarks: neutral, blendshapes: {}, scoringNoiseMode: "normal" },
    {
      phase: "hold",
      exerciseId: "closed-smile",
      repIndex: 0,
      ts: 4,
      landmarks: hold,
      blendshapes: {},
      scoringNoiseMode: "normal",
      scoring: { activated: true, rawSymmetry: 1 },
    },
  ];

  const replay = replayFrameSamples(samples);

  assert.equal(replay.sampleCount, 4);
  assert.equal(replay.holdFrameCount, 1);
  assert.equal(replay.scoredFrameCount, 1);
  assert.equal(replay.frames[0].replayScored, true);
  assert.equal(replay.frames[0].calibrationSampleCount, 3);
});
