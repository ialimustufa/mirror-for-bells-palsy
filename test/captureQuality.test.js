import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCaptureQualityFromFeatures, summarizeSessionCaptureQuality } from "../src/domain/captureQuality.js";

test("capture quality summarizes valid, rejected, and aligned frames", () => {
  const quality = summarizeCaptureQualityFromFeatures([
    {
      observedFrameCount: 10,
      holdFrameCount: 9,
      validScoredFrameCount: 8,
      rejectedFrameCount: 2,
      alignedFrameRatio: 0.9,
      scoreDistribution: { count: 8, mean: 0.82, median: 0.84 },
      dropReasonCounts: { "below-signal-gate": 2 },
    },
  ]);

  assert.equal(quality.key, "usable");
  assert.equal(quality.observedFrameCount, 10);
  assert.equal(quality.validScoredFrameCount, 8);
  assert.equal(quality.rejectedFrameCount, 2);
  assert.deepEqual(quality.dropReasonCounts, { "below-signal-gate": 2 });
});

test("session capture quality aggregates exercise quality records", () => {
  const sessionQuality = summarizeSessionCaptureQuality([
    {
      captureQuality: {
        score: 0.9,
        observedFrameCount: 10,
        holdFrameCount: 10,
        validScoredFrameCount: 9,
        rejectedFrameCount: 1,
        alignedFrameRatio: 1,
        dropReasonCounts: { "below-signal-gate": 1 },
      },
    },
    {
      captureQuality: {
        score: 0.5,
        observedFrameCount: 10,
        holdFrameCount: 8,
        validScoredFrameCount: 4,
        rejectedFrameCount: 6,
        alignedFrameRatio: 0.75,
        dropReasonCounts: { alignment: 3, "below-signal-gate": 3 },
      },
    },
  ]);

  assert.equal(sessionQuality.exerciseCount, 2);
  assert.equal(sessionQuality.observedFrameCount, 20);
  assert.equal(sessionQuality.validScoredFrameCount, 13);
  assert.deepEqual(sessionQuality.dropReasonCounts, { "below-signal-gate": 4, alignment: 3 });
  assert.equal(sessionQuality.key, "usable");
});
