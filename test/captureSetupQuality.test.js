import assert from "node:assert/strict";
import test from "node:test";
import { SETUP_SAMPLE_TARGET, summarizeCaptureSetupQuality } from "../src/domain/captureSetupQuality.js";

function samples(count, overrides = {}) {
  return Array.from({ length: count }, (_, index) => ({
    ts: index * 50,
    facePresent: true,
    aligned: true,
    stabilityDelta: 0.002,
    brightness: 0.52,
    contrast: 0.22,
    eyeDistance: 0.34,
    ...overrides,
  }));
}

test("capture setup quality marks stable centered capture as strong", () => {
  const summary = summarizeCaptureSetupQuality(samples(SETUP_SAMPLE_TARGET));

  assert.equal(summary.key, "strong");
  assert.equal(summary.ready, true);
  assert.equal(summary.actionItems.length, 0);
  assert.ok(summary.score >= 0.82);
  assert.ok(summary.fps >= 18);
});

test("capture setup quality reports actionable weak setup causes", () => {
  const summary = summarizeCaptureSetupQuality(samples(SETUP_SAMPLE_TARGET, {
    facePresent: true,
    aligned: false,
    stabilityDelta: 0.03,
    brightness: 0.12,
    eyeDistance: 0.18,
  }));

  assert.equal(summary.key, "weak");
  assert.equal(summary.ready, true);
  assert.ok(summary.actionItems.includes("Center your face and keep your eyes level."));
  assert.ok(summary.actionItems.some((item) => item.includes("light")));
});

test("capture setup quality stays collecting before enough samples", () => {
  const summary = summarizeCaptureSetupQuality(samples(3));

  assert.equal(summary.key, "collecting");
  assert.equal(summary.ready, false);
});
