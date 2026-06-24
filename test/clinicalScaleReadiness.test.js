import assert from "node:assert/strict";
import test from "node:test";
import { assessClinicalScaleReadiness, clinicalValidationReportFrom } from "../src/ml/clinicalScaleReadiness.js";
import { CLINICAL_SCALE_ESTIMATE_VERSION } from "../src/domain/clinicalScales.js";

const CURRENT_ESTIMATOR_VERSION_KEY = `v${CLINICAL_SCALE_ESTIMATE_VERSION}`;

function scaleReport({ labeledCount, withinToleranceCount, agreementRate = withinToleranceCount / labeledCount, lower = 0.82, upper = 1 }) {
  return {
    labeledCount,
    comparableCount: labeledCount,
    missingEstimateCount: 0,
    withinToleranceCount,
    agreementRate,
    agreementConfidenceInterval: {
      method: "wilson-score",
      confidenceLevel: 0.95,
      lower,
      upper,
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
      minAgreementWilsonLowerBound: 0.8,
      minReviewedAssessments: 30,
      sunnybrookTolerance: 10,
      efaceTolerance: 10,
      clinicalScaleEstimateVersion: CLINICAL_SCALE_ESTIMATE_VERSION,
      requiresV3MovementProvenance: true,
      requiresV4RestingMetricProvenance: true,
    },
    summary: {
      assessmentClinicalScaleRecords: 30,
      reviewedAssessmentCount: 30,
      excludedClinicalLabelCount: 0,
      excludedClinicalLabelReasons: {},
      estimatedAssessmentCount: 30,
      estimateVersionCounts: { [CURRENT_ESTIMATOR_VERSION_KEY]: 30 },
      currentClinicalScaleEstimateVersionAssessmentCount: 30,
      meetsMinimumStandard: true,
    },
    byScale: {
      houseBrackmann: scaleReport({ labeledCount: 30, withinToleranceCount: 30 }),
      sunnybrookComposite: scaleReport({ labeledCount: 30, withinToleranceCount: 30 }),
      efaceTotal: scaleReport({ labeledCount: 30, withinToleranceCount: 30 }),
    },
    caseMix: {
      scale: "houseBrackmann",
      minHouseBrackmannSeverityBands: 3,
      minAssessmentsPerSeverityBand: 3,
      severityBands: {
        mild: { label: "HB I-II mild/normal", min: 1, max: 2, count: 10, meetsMinimum: true },
        moderate: { label: "HB III-IV moderate", min: 3, max: 4, count: 10, meetsMinimum: true },
        severe: { label: "HB V-VI severe/complete", min: 5, max: 6, count: 10, meetsMinimum: true },
      },
      representedSeverityBands: ["mild", "moderate", "severe"],
      representedSeverityBandCount: 3,
      meetsMinimumStandard: true,
      blockingReasons: [],
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

test("clinical scale readiness fails closed without House-Brackmann case-mix evidence", () => {
  const report = assessClinicalScaleReadiness(clinicalValidationReport({ caseMix: null }), { generatedAt: "2026-06-24T00:00:00.000Z" });

  assert.equal(report.status, "needs-reviewed-clinical-scale-data");
  assert.match(report.blockingReasons.join("\n"), /severity-band coverage/);
});

test("clinical scale readiness fails closed when observed agreement passes but Wilson lower bound does not", () => {
  const report = assessClinicalScaleReadiness(clinicalValidationReport({
    byScale: {
      houseBrackmann: scaleReport({ labeledCount: 30, withinToleranceCount: 24, agreementRate: 0.8, lower: 0.63, upper: 0.9 }),
      sunnybrookComposite: scaleReport({ labeledCount: 30, withinToleranceCount: 24, agreementRate: 0.8, lower: 0.63, upper: 0.9 }),
      efaceTotal: scaleReport({ labeledCount: 30, withinToleranceCount: 24, agreementRate: 0.8, lower: 0.63, upper: 0.9 }),
    },
  }), { generatedAt: "2026-06-24T00:00:00.000Z" });

  assert.equal(report.status, "needs-reviewed-clinical-scale-data");
  assert.match(report.blockingReasons.join("\n"), /Wilson lower bound/);
});

test("clinical scale readiness recommends only scale-specific availability when one primary scale meets evidence", () => {
  const report = assessClinicalScaleReadiness(clinicalValidationReport({
    byScale: {
      houseBrackmann: scaleReport({ labeledCount: 30, withinToleranceCount: 30, agreementRate: 1, lower: 0.887 }),
      sunnybrookComposite: scaleReport({ labeledCount: 30, withinToleranceCount: 24, agreementRate: 0.8, lower: 0.63, upper: 0.9 }),
      efaceTotal: scaleReport({ labeledCount: 30, withinToleranceCount: 24, agreementRate: 0.8, lower: 0.63, upper: 0.9 }),
    },
  }), { generatedAt: "2026-06-24T00:00:00.000Z" });

  assert.equal(report.status, "needs-reviewed-clinical-scale-data");
  assert.equal(report.recommendation, "allow-scale-specific-estimate-availability-after-human-review");
  assert.equal(report.validationSummary.readyPrimaryScaleCount, 1);
  assert.equal(report.validationSummary.clinicalScaleAvailabilityRecommendation.houseBrackmann.recommendedClinicalFacingScoresAllowed, true);
  assert.equal(report.validationSummary.clinicalScaleAvailabilityRecommendation.sunnybrook.recommendedClinicalFacingScoresAllowed, false);
  assert.equal(report.validationSummary.clinicalScaleAvailabilityRecommendation.eface.recommendedClinicalFacingScoresAllowed, false);
});

test("clinical scale readiness fails closed without current estimator-version evidence", () => {
  const report = assessClinicalScaleReadiness(clinicalValidationReport({
    standard: {
      minAgreementRate: 0.8,
      minAgreementWilsonLowerBound: 0.8,
      minReviewedAssessments: 30,
      sunnybrookTolerance: 10,
      efaceTolerance: 10,
      clinicalScaleEstimateVersion: CLINICAL_SCALE_ESTIMATE_VERSION - 1,
      requiresV3MovementProvenance: true,
      requiresV4RestingMetricProvenance: true,
    },
  }), { generatedAt: "2026-06-24T00:00:00.000Z" });

  assert.equal(report.status, "needs-reviewed-clinical-scale-data");
  assert.match(report.blockingReasons.join("\n"), new RegExp(`validation report for estimator v${CLINICAL_SCALE_ESTIMATE_VERSION}`));
});

test("clinical scale readiness fails closed without movement provenance controls", () => {
  const source = clinicalValidationReport();
  delete source.standard.requiresV3MovementProvenance;

  const report = assessClinicalScaleReadiness(source, { generatedAt: "2026-06-24T00:00:00.000Z" });

  assert.equal(report.status, "needs-reviewed-clinical-scale-data");
  assert.match(report.blockingReasons.join("\n"), /used\/omitted movement input controls/);
});

test("clinical scale readiness fails closed without v4 resting-metric provenance controls", () => {
  const source = clinicalValidationReport();
  delete source.standard.requiresV4RestingMetricProvenance;

  const report = assessClinicalScaleReadiness(source, { generatedAt: "2026-06-24T00:00:00.000Z" });

  assert.equal(report.status, "needs-reviewed-clinical-scale-data");
  assert.match(report.blockingReasons.join("\n"), /v4 complete resting-metric input controls/);
});

test("clinical scale readiness reports confidence standard without enabling clinical-facing scores by itself", () => {
  const report = assessClinicalScaleReadiness(clinicalValidationReport(), { generatedAt: "2026-06-24T00:00:00.000Z" });

  assert.equal(report.status, "meets-clinical-scale-confidence-standard");
  assert.equal(report.recommendation, "allow-controlled-estimate-availability-after-human-review");
  assert.equal(report.validationSummary.readyPrimaryScaleCount, 3);
  assert.equal(report.validationSummary.clinicalScaleAvailabilityRecommendation.houseBrackmann.releaseRecommendation, "eligible-after-human-review");
  assert.equal(report.validationSummary.clinicalScaleAvailabilityRecommendation.sunnybrook.recommendedClinicalFacingScoresAllowed, true);
  assert.equal(report.validationSummary.readyForClinicalFacingScoring, false);
  assert.equal(report.validationSummary.clinicalFacingScoresAllowedByReportAlone, false);
  assert.equal(report.validationSummary.excludedClinicalLabelCount, 0);
  assert.equal(report.validationSummary.caseMix.representedSeverityBandCount, 3);
  assert.equal(report.byScale.houseBrackmann.agreementRate, 1);
  assert.equal(report.thresholds.clinicalScaleEstimateVersion, CLINICAL_SCALE_ESTIMATE_VERSION);
  assert.deepEqual(report.thresholds.confidenceInterval, { method: "wilson-score", confidenceLevel: 0.95 });
});
