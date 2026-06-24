import assert from "node:assert/strict";
import test from "node:test";
import { diagnosticReasonLabel, summarizeSessionDiagnostics } from "../src/domain/sessionDiagnostics.js";

test("session diagnostics summarizes capture quality and top drop reasons", () => {
  const diagnostics = summarizeSessionDiagnostics({
    scoringModelVersion: 2,
    scores: [{
      exerciseId: "closed-smile",
      name: "Closed Smile",
      repDiagnostics: [
        {
          scoringModelVersion: 2,
          observedFrameCount: 10,
          holdFrameCount: 8,
          validScoredFrameCount: 6,
          rejectedFrameCount: 4,
          alignedFrameRatio: 0.9,
          scoreDistribution: { count: 6, median: 0.7 },
          dropReasonCounts: { "below-signal-gate": 3, alignment: 1 },
        },
      ],
    }],
  });

  assert.equal(diagnostics.scoringModelVersion, 2);
  assert.equal(diagnostics.captureQuality.key, "usable");
  assert.deepEqual(diagnostics.topDropReasons[0], {
    reason: "below-signal-gate",
    label: "Low signal",
    count: 3,
  });
  assert.equal(diagnostics.exercises[0].observedFrameCount, 10);
});

test("session diagnostics raises weak quality and coactivation caveats", () => {
  const diagnostics = summarizeSessionDiagnostics({
    scores: [
      {
        exerciseId: "closed-smile",
        name: "Closed Smile",
        avg: 0.7,
        captureQuality: {
          key: "weak",
          label: "Weak",
          score: 0.4,
          observedFrameCount: 12,
          validScoredFrameCount: 4,
          rejectedFrameCount: 8,
          dropReasonCounts: { alignment: 8 },
        },
        movementFeatures: {
          coactivation: {
            score: 0.41,
            maxScore: 0.48,
            risk: "high",
            sampleCount: 5,
            regions: [{ region: "eyes", movement: 0.03 }],
          },
        },
      },
      {
        exerciseId: "eye-close",
        name: "Soft Eye Closure",
        avg: 0.45,
        scores: [0.45],
      },
    ],
  });

  assert.equal(diagnostics.captureQuality.key, "weak");
  assert.equal(diagnostics.coactivation.risk, "high");
  assert.equal(diagnostics.exercises[0].coactivationPenalty.adjustedAvg, 0.525);
  assert.match(diagnostics.exercises[0].coactivationPenalty.note, /raw symmetry score is unchanged/);
  assert.equal(diagnostics.safetyPrompts.length, 3);
  assert.ok(diagnostics.safetyPrompts.some((text) => text.includes("eye-protection")));
});

test("session diagnostics includes weak setup quality safety prompts", () => {
  const diagnostics = summarizeSessionDiagnostics({
    setupQuality: {
      key: "weak",
      label: "Setup needs attention",
      score: 0.42,
      actionItems: ["Add light to your face before starting."],
    },
    scores: [],
  });

  assert.equal(diagnostics.setupQuality.key, "weak");
  assert.equal(diagnostics.hasDiagnostics, true);
  assert.ok(diagnostics.safetyPrompts.some((text) => text.includes("Camera setup was weak")));
});

test("diagnostic reason labels fall back safely", () => {
  assert.equal(diagnosticReasonLabel("head-pose"), "Head pose");
  assert.equal(diagnosticReasonLabel("future-reason"), "future-reason");
});
