import assert from "node:assert/strict";
import test from "node:test";
import { assessValidationModelReadiness } from "../src/ml/modelReadiness.js";

function makeValidation(overrides = {}) {
  return {
    labeledFrameCount: 120,
    positiveCount: 60,
    negativeCount: 60,
    accuracy: 0.95,
    falsePositiveRate: 0.05,
    falseNegativeRate: 0.05,
    meanAbsScoreDelta: 0.01,
    byExercise: [
      { exerciseId: "closed-smile", labeledFrameCount: 40, falsePositiveRate: 0.04, falseNegativeRate: 0.05 },
      { exerciseId: "eye-close", labeledFrameCount: 40, falsePositiveRate: 0.02, falseNegativeRate: 0.03 },
      { exerciseId: "lip-pucker", labeledFrameCount: 40, falsePositiveRate: 0.06, falseNegativeRate: 0.04 },
    ],
    ...overrides,
  };
}

test("model readiness fails closed without enough reviewed data", () => {
  const report = assessValidationModelReadiness({
    validation: makeValidation({
      labeledFrameCount: 12,
      positiveCount: 8,
      negativeCount: 4,
      byExercise: [{ exerciseId: "closed-smile", labeledFrameCount: 12, falsePositiveRate: 0, falseNegativeRate: 0 }],
    }),
  }, { generatedAt: "2026-06-23T00:00:00.000Z" });

  assert.equal(report.status, "needs-reviewed-data");
  assert.equal(report.recommendation, "collect-reviewed-validation-data");
  assert.equal(report.modelJustification.lightweightCorrectionModel, "not-justified");
  assert.equal(report.blockingReasons.length > 0, true);
});

test("model readiness keeps current scorer when reviewed replay metrics are acceptable", () => {
  const report = assessValidationModelReadiness({
    validation: makeValidation(),
  }, { generatedAt: "2026-06-23T00:00:00.000Z" });

  assert.equal(report.status, "current-scorer-acceptable");
  assert.equal(report.recommendation, "keep-current-scorer-and-threshold-workflow");
  assert.equal(report.blockingReasons.length, 0);
});

test("model readiness recommends lightweight correction review for high replay disagreement", () => {
  const report = assessValidationModelReadiness({
    validation: makeValidation({
      accuracy: 0.72,
      falseNegativeRate: 0.32,
      byExercise: [
        { exerciseId: "closed-smile", labeledFrameCount: 40, falsePositiveRate: 0.04, falseNegativeRate: 0.35 },
        { exerciseId: "eye-close", labeledFrameCount: 40, falsePositiveRate: 0.02, falseNegativeRate: 0.03 },
        { exerciseId: "lip-pucker", labeledFrameCount: 40, falsePositiveRate: 0.06, falseNegativeRate: 0.04 },
      ],
    }),
  }, { generatedAt: "2026-06-23T00:00:00.000Z" });

  assert.equal(report.status, "review-lightweight-correction-model");
  assert.equal(report.modelJustification.lightweightCorrectionModel, "review");
  assert.equal(report.modelJustification.clinicalDomainLandmarkModel, "not-justified-without-reviewed-landmark-annotations");
  assert.equal(report.exerciseRisks.find((exercise) => exercise.exerciseId === "closed-smile").highRisk, true);
});
