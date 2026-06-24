import assert from "node:assert/strict";
import test from "node:test";
import { assessClinicalScaleReadiness, clinicalValidationReportFrom } from "../src/ml/clinicalScaleReadiness.js";

function scaleReport({ labeledCount, withinToleranceCount, agreementRate = withinToleranceCount / labeledCount }) {
  return {
    labeledCount,
    comparableCount: labeledCount,
    missingEstimateCount: 0,
    withinToleranceCount,
    agreementRate,
    agreementConfidenceInterval: {
      method: "wilson-score",
      confidenceLevel: 0.95,
      lower: 0.63,
      upper: 0.9,
    },
    meanAbsDelta: 2,
  };
}

function clinicalValidationReport(overrides = {}) {
  return {
    kind: "mirror-clinical-scale-validation-report",
    generatedAt: "2026-06-24T00:00:00.000Z",
    standard: {
      minAgreementRate: 0.8,
      minReviewedAssessments: 30,
      sunnybrookTolerance: 10,
      efaceTolerance: 10,
    },
    summary: {
      assessmentClinicalScaleRecords: 30,
      reviewedAssessmentCount: 30,
      excludedClinicalLabelCount: 0,
      excludedClinicalLabelReasons: {},
      estimatedAssessmentCount: 30,
      meetsMinimumStandard: true,
    },
    byScale: {
      houseBrackmann: scaleReport({ labeledCount: 30, withinToleranceCount: 24 }),
      sunnybrookComposite: scaleReport({ labeledCount: 30, withinToleranceCount: 24 }),
      efaceTotal: scaleReport({ labeledCount: 30, withinToleranceCount: 24 }),
    },
    ...overrides,
  };
}

test("clinical scale readiness fails closed with insufficient reviewed assessment coverage", () => {
  const report = assessClinicalScaleReadiness(clinicalValidationReport({
    summary: {
      assessmentClinicalScaleRecords: 12,
      reviewedAssessmentCount: 12,
      estimatedAssessmentCount: 12,
      meetsMinimumStandard: false,
    },
    byScale: {
      houseBrackmann: scaleReport({ labeledCount: 12, withinToleranceCount: 12, agreementRate: 1 }),
      sunnybrookComposite: scaleReport({ labeledCount: 12, withinToleranceCount: 12, agreementRate: 1 }),
      efaceTotal: scaleReport({ labeledCount: 12, withinToleranceCount: 12, agreementRate: 1 }),
    },
  }), { generatedAt: "2026-06-24T00:00:00.000Z" });

  assert.equal(report.status, "needs-reviewed-clinical-scale-data");
  assert.equal(report.validationSummary.readyForClinicalFacingScoring, false);
  assert.match(report.blockingReasons.join("\n"), /needs at least 30 reviewed clinical-scale assessments/);
  assert.equal(report.byScale.houseBrackmann.status, "not-ready");
});

test("clinical scale readiness accepts a raw clinical scale validation report", () => {
  const source = clinicalValidationReport();
  const report = clinicalValidationReportFrom(source);

  assert.equal(report, source);
});

test("clinical scale readiness reports observed standard without enabling clinical-facing scores by itself", () => {
  const report = assessClinicalScaleReadiness(clinicalValidationReport(), { generatedAt: "2026-06-24T00:00:00.000Z" });

  assert.equal(report.status, "meets-clinical-scale-observed-standard");
  assert.equal(report.recommendation, "allow-controlled-estimate-availability-after-human-review");
  assert.equal(report.validationSummary.readyPrimaryScaleCount, 3);
  assert.equal(report.validationSummary.readyForClinicalFacingScoring, false);
  assert.equal(report.validationSummary.clinicalFacingScoresAllowedByReportAlone, false);
  assert.equal(report.validationSummary.excludedClinicalLabelCount, 0);
  assert.equal(report.byScale.houseBrackmann.agreementRate, 0.8);
  assert.deepEqual(report.thresholds.confidenceInterval, { method: "wilson-score", confidenceLevel: 0.95 });
});
