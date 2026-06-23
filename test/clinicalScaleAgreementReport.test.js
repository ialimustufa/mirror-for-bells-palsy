import assert from "node:assert/strict";
import test from "node:test";
import { buildClinicalScaleAgreementMarkdown } from "../src/ml/clinicalScaleAgreementReport.js";

function scaleReport({ labeledCount, withinToleranceCount, agreementRate = withinToleranceCount / labeledCount, mismatches = [] }) {
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
    mismatches,
  };
}

function validationReport(overrides = {}) {
  return {
    kind: "mirror-clinical-scale-validation-report",
    generatedAt: "2026-06-24T00:00:00.000Z",
    standard: {
      minAgreementRate: 0.8,
      minReviewedAssessments: 30,
      sunnybrookTolerance: 10,
      efaceTolerance: 10,
      confidenceInterval: {
        method: "wilson-score",
        confidenceLevel: 0.95,
      },
    },
    summary: {
      assessmentClinicalScaleRecords: 30,
      reviewedAssessmentCount: 30,
      estimatedAssessmentCount: 30,
      meetsMinimumStandard: true,
    },
    byScale: {
      houseBrackmann: scaleReport({ labeledCount: 30, withinToleranceCount: 24 }),
      sunnybrookComposite: scaleReport({ labeledCount: 30, withinToleranceCount: 24 }),
      efaceTotal: scaleReport({ labeledCount: 30, withinToleranceCount: 24 }),
      efaceStatic: scaleReport({ labeledCount: 30, withinToleranceCount: 25 }),
    },
    blockingReasons: [],
    ...overrides,
  };
}

test("clinical scale agreement markdown summarizes primary scale readiness", () => {
  const markdown = buildClinicalScaleAgreementMarkdown(validationReport(), { generatedAt: "2026-06-24T12:00:00.000Z" });

  assert.match(markdown, /# Mirror Clinical Scale Agreement Report/);
  assert.match(markdown, /Status: meets-clinical-scale-observed-standard/);
  assert.match(markdown, /House-Brackmann \| within one grade \| 30 \| 0 \| 24 \| 80\.0%/);
  assert.match(markdown, /Sunnybrook composite \| within 10 points/);
  assert.match(markdown, /eFACE total \| within 10 points/);
  assert.match(markdown, /eFACE static/);
  assert.match(markdown, /95% Wilson score interval/);
  assert.match(markdown, /human-reviewed release decision/);
  assert.match(markdown, /TRIPOD\+AI/);
  assert.match(markdown, /STARD 2015/);
});

test("clinical scale agreement markdown includes blockers and mismatch review rows", () => {
  const markdown = buildClinicalScaleAgreementMarkdown(validationReport({
    summary: {
      assessmentClinicalScaleRecords: 12,
      reviewedAssessmentCount: 12,
      estimatedAssessmentCount: 12,
      meetsMinimumStandard: false,
    },
    byScale: {
      houseBrackmann: scaleReport({
        labeledCount: 12,
        withinToleranceCount: 8,
        agreementRate: 0.6667,
        mismatches: [{
          assessmentId: "assessment-7:clinical-scale",
          sessionId: "session-7",
          estimate: 3,
          label: 5,
          delta: -2,
        }],
      }),
      sunnybrookComposite: scaleReport({ labeledCount: 12, withinToleranceCount: 11, agreementRate: 0.9167 }),
      efaceTotal: scaleReport({ labeledCount: 12, withinToleranceCount: 10, agreementRate: 0.8333 }),
    },
    blockingReasons: ["needs at least 30 reviewed clinical-scale assessments"],
  }));

  assert.match(markdown, /Status: needs-reviewed-clinical-scale-data/);
  assert.match(markdown, /needs at least 30 reviewed clinical-scale assessments/);
  assert.match(markdown, /assessment-7:clinical-scale/);
  assert.match(markdown, /session-7/);
  assert.match(markdown, /-2\.00/);
});
