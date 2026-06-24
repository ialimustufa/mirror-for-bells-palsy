import assert from "node:assert/strict";
import test from "node:test";
import { buildClinicalScaleAgreementMarkdown } from "../src/ml/clinicalScaleAgreementReport.js";
import { CLINICAL_SCALE_ESTIMATE_VERSION } from "../src/domain/clinicalScales.js";

const CURRENT_ESTIMATOR_VERSION_KEY = `v${CLINICAL_SCALE_ESTIMATE_VERSION}`;

function scaleReport({ labeledCount, withinToleranceCount, agreementRate = withinToleranceCount / labeledCount, lower = 0.887, upper = 1, mismatches = [] }) {
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
    mismatches,
  };
}

function validationReport(overrides = {}) {
  return {
    kind: "mirror-clinical-scale-validation-report",
    generatedAt: "2026-06-24T00:00:00.000Z",
    standard: {
      minAgreementRate: 0.8,
      minAgreementWilsonLowerBound: 0.8,
      minReviewedAssessments: 30,
      minUsableMovementCoverageRatio: 0.8,
      sunnybrookTolerance: 10,
      efaceTolerance: 10,
      confidenceInterval: {
        method: "wilson-score",
        confidenceLevel: 0.95,
      },
      clinicalScaleEstimateVersion: CLINICAL_SCALE_ESTIMATE_VERSION,
    },
    summary: {
      assessmentClinicalScaleRecords: 30,
      reviewedAssessmentCount: 30,
      excludedClinicalLabelCount: 0,
      excludedClinicalLabelReasons: {},
      estimatedAssessmentCount: 30,
      estimateVersionCounts: { [CURRENT_ESTIMATOR_VERSION_KEY]: 30 },
      meetsMinimumStandard: true,
    },
    byScale: {
      houseBrackmann: scaleReport({ labeledCount: 30, withinToleranceCount: 30, agreementRate: 1 }),
      sunnybrookComposite: scaleReport({ labeledCount: 30, withinToleranceCount: 30, agreementRate: 1 }),
      efaceTotal: scaleReport({ labeledCount: 30, withinToleranceCount: 30, agreementRate: 1 }),
      efaceStatic: scaleReport({ labeledCount: 30, withinToleranceCount: 25 }),
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
    blockingReasons: [],
    ...overrides,
  };
}

test("clinical scale agreement markdown summarizes primary scale readiness", () => {
  const markdown = buildClinicalScaleAgreementMarkdown(validationReport(), { generatedAt: "2026-06-24T12:00:00.000Z" });

  assert.match(markdown, /# Mirror Clinical Scale Agreement Report/);
  assert.match(markdown, /Status: meets-clinical-scale-confidence-standard/);
  assert.match(markdown, /Minimum Wilson lower-bound agreement: 80\.0%/);
  assert.match(markdown, new RegExp(`Clinical-scale estimator version: v${CLINICAL_SCALE_ESTIMATE_VERSION}`));
  assert.match(markdown, /Minimum usable movement coverage: 80\.0%/);
  assert.match(markdown, /House-Brackmann \| within one grade \| 30 \| 0 \| 30 \| 100\.0%/);
  assert.match(markdown, /Sunnybrook composite \| within 10 points/);
  assert.match(markdown, /eFACE total \| within 10 points/);
  assert.match(markdown, /Scale-Specific Availability Recommendation/);
  assert.match(markdown, /houseBrackmann \| House-Brackmann \| meets minimum \| true after human review/);
  assert.match(markdown, /sunnybrook \| Sunnybrook composite \| meets minimum \| true after human review/);
  assert.match(markdown, /This recommendation does not update `docs\/validation-status\.json`/);
  assert.match(markdown, /eFACE static/);
  assert.match(markdown, /95% Wilson score interval/);
  assert.match(markdown, /Excluded clinical-label rows: 0/);
  assert.match(markdown, new RegExp(`Estimate version counts: ${CURRENT_ESTIMATOR_VERSION_KEY}: 30`));
  assert.match(markdown, /House-Brackmann Case Mix/);
  assert.match(markdown, /Required severity bands: 3/);
  assert.match(markdown, /HB I-II mild\/normal \| 10 \| yes/);
  assert.match(markdown, /HB III-IV moderate \| 10 \| yes/);
  assert.match(markdown, /HB V-VI severe\/complete \| 10 \| yes/);
  assert.match(markdown, /Reference Standard Controls/);
  assert.match(markdown, /Eligible blinded independent clinical labels: 30/);
  assert.match(markdown, /Blinding control: counted labels require `sourceLabelSheetMode: blinded` and `reviewBlinded`/);
  assert.match(markdown, new RegExp(`Estimator version control: counted labels require clinical-scale estimator version v${CLINICAL_SCALE_ESTIMATE_VERSION}`));
  assert.match(markdown, /Estimate evidence control: counted rows require Mirror estimates with status `estimated`/);
  assert.match(markdown, /complete\/minimum evidence tier/);
  assert.match(markdown, /at least 80% usable movement coverage/);
  assert.match(markdown, /valid in-range primary estimate values/);
  assert.match(markdown, /Independence control: counted labels require clinician-assigned or adjudicated `labelSource`/);
  assert.match(markdown, /Reviewer control: counted labels require a recognized clinical\/adjudication role/);
  assert.match(markdown, /Reference standard controls: `sourceLabelSheetMode`, `reviewBlinded`, estimator `version`, estimate evidence tier\/coverage controls, `labelSource`, clinical `reviewerRole`/);
  assert.match(markdown, /human-reviewed release decision/);
  assert.match(markdown, /TRIPOD\+AI/);
  assert.match(markdown, /STARD 2015/);
  assert.match(markdown, /Good Machine Learning Practice/);
});

test("clinical scale agreement markdown marks non-ready scales as estimate-only recommendations", () => {
  const markdown = buildClinicalScaleAgreementMarkdown(validationReport({
    byScale: {
      houseBrackmann: scaleReport({ labeledCount: 30, withinToleranceCount: 30, agreementRate: 1, lower: 0.887 }),
      sunnybrookComposite: scaleReport({ labeledCount: 30, withinToleranceCount: 24, agreementRate: 0.8, lower: 0.63 }),
      efaceTotal: scaleReport({ labeledCount: 30, withinToleranceCount: 24, agreementRate: 0.8, lower: 0.63 }),
    },
    blockingReasons: [
      "sunnybrookComposite: needs 95% Wilson lower bound at least 80%",
      "efaceTotal: needs 95% Wilson lower bound at least 80%",
    ],
  }));

  assert.match(markdown, /Recommendation: allow-scale-specific-estimate-availability-after-human-review/);
  assert.match(markdown, /houseBrackmann \| House-Brackmann \| meets minimum \| true after human review/);
  assert.match(markdown, /sunnybrook \| Sunnybrook composite \| not ready \| false/);
  assert.match(markdown, /eface \| eFACE total \| not ready \| false/);
});

test("clinical scale agreement markdown includes blockers and mismatch review rows", () => {
  const markdown = buildClinicalScaleAgreementMarkdown(validationReport({
    summary: {
      assessmentClinicalScaleRecords: 12,
      reviewedAssessmentCount: 12,
      excludedClinicalLabelCount: 2,
      excludedClinicalLabelReasons: { "missing clinician reviewer role": 2 },
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
  assert.match(markdown, /Excluded Clinical-Label Rows/);
  assert.match(markdown, /missing clinician reviewer role: 2/);
  assert.match(markdown, /assessment-7:clinical-scale/);
  assert.match(markdown, /session-7/);
  assert.match(markdown, /-2\.00/);
});
