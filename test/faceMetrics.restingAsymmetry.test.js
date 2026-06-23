import assert from "node:assert/strict";
import test from "node:test";
import { summarizeRestingAsymmetry } from "../src/ml/faceMetrics.js";

const LEFT_EYE_TOP = [173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYE_TOP = [398, 384, 385, 386, 387, 388, 466];
const LEFT_EYE_BOTTOM = [7, 163, 144, 145, 153, 154, 155];
const RIGHT_EYE_BOTTOM = [249, 390, 373, 374, 380, 381, 382];
const MIDLINE = [1, 4, 5, 195, 197];
const LEFT_MIDFACE = [50, 187, 205, 207, 216, 61, 84, 91, 146];
const RIGHT_MIDFACE = [280, 411, 425, 427, 436, 291, 314, 321, 375];
const LEFT_COMMISSURE = [61, 84];
const RIGHT_COMMISSURE = [291, 314];

function landmark(x, y, z = 0) {
  return { x, y, z };
}

function setGroup(lm, idxs, x, y) {
  for (const idx of idxs) lm[idx] = landmark(x, y);
}

function makeNeutralFace() {
  const lm = Array.from({ length: 478 }, () => landmark(0.5, 0.5));
  lm[33] = landmark(0.3, 0.46);
  lm[263] = landmark(0.7, 0.46);
  setGroup(lm, MIDLINE, 0.5, 0.5);
  setGroup(lm, LEFT_EYE_TOP, 0.34, 0.42);
  setGroup(lm, LEFT_EYE_BOTTOM, 0.34, 0.49);
  setGroup(lm, RIGHT_EYE_TOP, 0.66, 0.43);
  setGroup(lm, RIGHT_EYE_BOTTOM, 0.66, 0.47);
  setGroup(lm, LEFT_MIDFACE, 0.40, 0.56);
  setGroup(lm, RIGHT_MIDFACE, 0.58, 0.56);
  setGroup(lm, LEFT_COMMISSURE, 0.43, 0.58);
  setGroup(lm, RIGHT_COMMISSURE, 0.57, 0.61);
  return lm;
}

test("resting asymmetry metrics use user-anatomical side convention", () => {
  const metrics = summarizeRestingAsymmetry(makeNeutralFace());

  assert.equal(metrics.version, 1);
  assert.equal(metrics.coordinateFrame, "eye-line-face-local-v1");
  assert.equal(metrics.metrics.palpebralFissure.narrowerSide, "left");
  assert.equal(metrics.metrics.nasolabialMidface.smallerSide, "left");
  assert.equal(metrics.metrics.oralCommissure.lowerSide, "left");
  assert.ok(metrics.metrics.palpebralFissure.absoluteDifference > 0);
  assert.ok(metrics.averageAsymmetryRatio > 0);
});

test("resting asymmetry returns null without a usable face frame", () => {
  assert.equal(summarizeRestingAsymmetry([]), null);
});
