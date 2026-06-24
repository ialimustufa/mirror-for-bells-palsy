import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClinicalScaleAvailabilityEvidence,
  buildClinicalScaleStatusEvidencePatch,
  validateClinicalScaleAgreementReportText,
  validateClinicalScaleReviewerAgreementReportText,
  validateClinicalScaleReviewPackageVerificationReportText,
  validateStatus,
  validateStatusArtifacts,
  validateThresholdCalibrationReportText,
} from "../scripts/validation-status-check.mjs";
import { CLINICAL_SCALE_ESTIMATE_VERSION } from "../src/domain/clinicalScales.js";

const CURRENT_ESTIMATOR_VERSION_KEY = `v${CLINICAL_SCALE_ESTIMATE_VERSION}`;
const CLINICAL_AGREEMENT_REPORT_PATH = "docs/validation/clinical-scale-agreement-2026-06-24.md";
const STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH = "docs/validation/clinical-scale-agreement-2026-06-24.json";
const REVIEWER_AGREEMENT_REPORT_PATH = "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json";
const REVIEW_PACKAGE_VERIFICATION_REPORT_PATH = "docs/validation/clinical-scale-review-package-verification-2026-06-24.json";
const THRESHOLD_CALIBRATION_REPORT_PATH = "docs/validation/threshold-calibration-2026-06-23.json";
const TEST_WILSON_Z_95 = 1.959963984540054;
const SOURCE_DATASET_SHA256 = "a".repeat(64);

function enabledScaleEvidence(overrides = {}) {
  return {
    clinicalFacingScoresAllowed: true,
    clinicalAgreementReport: CLINICAL_AGREEMENT_REPORT_PATH,
    reviewerAgreementReport: REVIEWER_AGREEMENT_REPORT_PATH,
    clinicalReviewPackageVerificationReport: REVIEW_PACKAGE_VERIFICATION_REPORT_PATH,
    sourceDatasetSha256: SOURCE_DATASET_SHA256,
    clinicalScaleEstimateVersion: CLINICAL_SCALE_ESTIMATE_VERSION,
    reviewedLabelCount: 30,
    distinctValidationCaseCount: 30,
    observedAgreementRate: 1,
    agreementWilsonLowerBound: 0.887,
    reviewerPairedLabelCount: 30,
    reviewerDistinctValidationCaseCount: 30,
    reviewerObservedAgreementRate: 1,
    reviewerAgreementWilsonLowerBound: testWilsonScoreInterval(30, 30).lower,
    ...overrides,
  };
}

const DISABLED_CLINICAL_SCALE_AVAILABILITY = {
  houseBrackmann: { clinicalFacingScoresAllowed: false },
  sunnybrook: { clinicalFacingScoresAllowed: false },
  eface: { clinicalFacingScoresAllowed: false },
};
const ENABLED_CLINICAL_SCALE_AVAILABILITY = {
  houseBrackmann: enabledScaleEvidence(),
  sunnybrook: enabledScaleEvidence(),
  eface: enabledScaleEvidence(),
};
const HOUSE_BRACKMANN_ONLY_CLINICAL_SCALE_AVAILABILITY = {
  houseBrackmann: enabledScaleEvidence(),
  sunnybrook: { clinicalFacingScoresAllowed: false },
  eface: { clinicalFacingScoresAllowed: false },
};

const BASE_STATUS = {
  schemaVersion: 1,
  updatedAt: "2026-06-24",
  status: "tooling-ready-needs-reviewed-data",
  reviewedDatasetCount: 0,
  reviewedFrameCount: 0,
  reviewedClinicalScaleAssessmentCount: 0,
  readyExerciseCount: 0,
  clinicalScaleMinimumStandard: {
    minAgreementRate: 0.8,
    minAgreementWilsonLowerBound: 0.8,
    minReviewedAssessments: 30,
    minDistinctClinicalCases: 10,
    minHouseBrackmannSeverityBands: 3,
    minAssessmentsPerSeverityBand: 3,
    minUsableMovementCoverageRatio: 0.8,
    confidenceInterval: "wilson-95",
    clinicalScaleEstimateVersion: CLINICAL_SCALE_ESTIMATE_VERSION,
    reviewProtocol: "docs/clinical-scale-review-protocol.md",
    requiresExplicitClinicalConfidence: true,
    requiresIsoReviewTimestamp: true,
    requiresSourceDatasetSha256: true,
  },
  clinicalScaleAgreementReports: [],
  clinicalScaleReviewerAgreementReports: [],
  clinicalScaleReviewPackageVerificationReports: [],
  thresholdCalibrationReports: [],
  thresholdCalibrationSourceDatasetSha256s: [],
  productionThresholdConstantsCalibrated: false,
  clinicalFacingScoresAllowed: false,
  clinicalScaleAvailability: DISABLED_CLINICAL_SCALE_AVAILABILITY,
};

function passingClinicalAgreementReport({ reviewedCount = 30, readyPrimaryScales = 3, representedSeverityBands = 3 } = {}) {
  return `# Mirror Clinical Scale Agreement Report

Generated: 2026-06-24T00:00:00.000Z
Status: meets-clinical-scale-confidence-standard
Recommendation: allow-controlled-estimate-availability-after-human-review

## Evidence Standard

- Clinical-scale estimator version: v${CLINICAL_SCALE_ESTIMATE_VERSION}
- Source dataset SHA-256: ${SOURCE_DATASET_SHA256}
- Distinct validation case minimum: 10
- Minimum usable movement coverage: 80.0%
- Estimator input provenance: counted current-version rows preserve used/omitted movement IDs, the usable-movements-only calculation flag, House-Brackmann required-input provenance, Sunnybrook/eFACE input-completeness provenance, required/available/missing resting metric keys, and the complete-resting-metrics calculation flag.

## Dataset Summary

- Assessment clinical-scale records: ${reviewedCount}
- Unique assessment clinical-scale records: ${reviewedCount}
- Duplicate assessment IDs: 0
- Rows missing assessment IDs: 0
- Reviewed clinical-scale assessments: ${reviewedCount}
- Distinct validation cases: ${reviewedCount}
- Ready primary scales: ${readyPrimaryScales}/3

## Primary Scale Agreement

| Scale | Tolerance | Labels | Missing estimates | Within tolerance | Agreement | Wilson interval | Mean absolute delta | Status |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| House-Brackmann | within one grade | 30 | 0 | 30 | 100.0% | 88.7%-100.0% 95% Wilson CI | 0.5 | meets-confidence-standard |
| Sunnybrook composite | within 10 points | 30 | 0 | 30 | 100.0% | 88.7%-100.0% 95% Wilson CI | 4.0 | meets-confidence-standard |
| eFACE total | within 10 points | 30 | 0 | 30 | 100.0% | 88.7%-100.0% 95% Wilson CI | 4.0 | meets-confidence-standard |

## Agreement Sample Plan

| Scale | Current labels | Within tolerance | Required within tolerance now | Additional perfect labels needed | Projected labels | Projected within tolerance |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| House-Brackmann | 30 | 30 | 29 | 0 | 30 | 30 |
| Sunnybrook composite | 30 | 30 | 29 | 0 | 30 | 30 |
| eFACE total | 30 | 30 | 29 | 0 | 30 | 30 |

Additional-perfect-label planning assumes future rows are eligible, current-version, non-missing estimates within tolerance; it is not a substitute for collecting reviewed clinical data.

## House-Brackmann Case Mix

- Required severity bands: 3
- Minimum labels per represented band: 3
- Represented severity bands: ${representedSeverityBands}

| Band | Labels | Minimum met |
| --- | ---: | --- |
| HB I-II mild/normal | 10 | yes |
| HB III-IV moderate | 10 | yes |
| HB V-VI severe/complete | 10 | yes |

## Reference Standard Controls

- Eligible blinded independent clinical labels: ${reviewedCount}
- Case identity control: counted labels require a pseudonymous \`validationCaseId\`; at least 10 distinct validation cases are required so repeated assessments from one person cannot satisfy the 80% agreement gate alone.
- Blinding control: counted labels require \`sourceLabelSheetMode: blinded\` and \`reviewBlinded\` to show Mirror estimates were hidden before target assignment.
- Unique assessment control: counted labels require one stable assessment id per reviewed clinical-scale row; duplicate or missing assessment ids are excluded and block release readiness.
- Estimator version control: counted labels require clinical-scale estimator version v${CLINICAL_SCALE_ESTIMATE_VERSION}.
- Estimate evidence control: counted rows require Mirror estimates with status \`estimated\`, complete/minimum evidence tier, at least 80% usable movement coverage, used/omitted movement IDs, the usable-movements-only calculation flag, Sunnybrook/eFACE input-completeness provenance, complete resting-metric keys, and the complete-resting-metrics calculation flag. House-Brackmann estimates require the gentle eye-closure input. Sunnybrook/eFACE primary comparisons require complete scale-specific movement input. Scale-specific rows with missing, incomplete-input, or invalid estimates are reported in that scale's denominator as missing estimates.
- Source dataset control: counted agreement evidence requires \`sourceDatasetSha256\` matching a verified blinded clinical review package.
- Independence control: counted labels require clinician-assigned or adjudicated \`labelSource\` metadata, not Mirror/copied/algorithmic labels.
- Reviewer identity control: counted labels require a pseudonymous \`reviewerId\`; reviewer-agreement sheets must use distinct reviewer ids to support independent-review evidence.
- Reviewer control: counted labels require a recognized clinical/adjudication role and \`clinicianConfidence\` set to high or medium; blank, low, or uncertain confidence rows are excluded.
- Review timestamp control: counted labels require \`reviewedAt\` as a UTC ISO timestamp.
- Validity control: counted scale labels require a valid in-range target for that specific primary scale; missing targets do not remove otherwise valid labels from other scale denominators.

## Reporting Checklist

- Reference standard: blinded clinician-assigned House-Brackmann, Sunnybrook, and eFACE labels from \`docs/clinical-scale-review-protocol.md\`.
- Reference standard controls: \`sourceLabelSheetMode\`, \`reviewBlinded\`, \`clinicianConfidence\`, \`reviewedAt\`, \`sourceDatasetSha256\`, estimator \`version\`, estimate evidence tier/coverage/input-provenance controls, \`labelSource\`, pseudonymous \`reviewerId\`, and clinical \`reviewerRole\` must pass before any row counts. Primary target fields then count only for the scale where a valid target is present.
- Release control: this report alone cannot enable clinical-facing scores; \`docs/validation-status.json\` must be reviewed and updated separately.
`;
}

function houseBrackmannOnlyClinicalAgreementReport() {
  return passingClinicalAgreementReport({ readyPrimaryScales: 1 })
    .replace("Status: meets-clinical-scale-confidence-standard", "Status: needs-scale-specific-release-review")
    .replace(
      "| Sunnybrook composite | within 10 points | 30 | 0 | 30 | 100.0% | 88.7%-100.0% 95% Wilson CI | 4.0 | meets-confidence-standard |",
      "| Sunnybrook composite | within 10 points | 30 | 0 | 20 | 66.7% | 48.8%-80.8% 95% Wilson CI | 14.0 | not-ready |",
    )
    .replace(
      "| eFACE total | within 10 points | 30 | 0 | 30 | 100.0% | 88.7%-100.0% 95% Wilson CI | 4.0 | meets-confidence-standard |",
      "| eFACE total | within 10 points | 30 | 0 | 20 | 66.7% | 48.8%-80.8% 95% Wilson CI | 14.0 | not-ready |",
    );
}

function passingStructuredClinicalAgreementReport(overrides = {}) {
  const report = {
    kind: "mirror-clinical-scale-agreement-report",
    schemaVersion: 1,
    generatedAt: "2026-06-24T00:00:00.000Z",
    sourceDatasetSha256: SOURCE_DATASET_SHA256,
    status: "meets-clinical-scale-confidence-standard",
    recommendation: "allow-controlled-estimate-availability-after-human-review",
    evidenceStandard: {
      minReviewedAssessments: 30,
      minDistinctClinicalCases: 10,
      minAgreementRate: 0.8,
      minAgreementWilsonLowerBound: 0.8,
      minUsableMovementCoverageRatio: 0.8,
      confidenceInterval: {
        method: "wilson-score",
        confidenceLevel: 0.95,
      },
      clinicalScaleEstimateVersion: CLINICAL_SCALE_ESTIMATE_VERSION,
      requiresExplicitClinicalConfidence: true,
      requiresIsoReviewTimestamp: true,
      requiresSourceDatasetSha256: true,
    },
    summary: {
      reviewedClinicalScaleAssessmentCount: 30,
      distinctClinicalCaseCount: 30,
      eligibleBlindedIndependentLabelCount: 30,
      duplicateClinicalScaleAssessmentIdCount: 0,
      missingClinicalScaleAssessmentIdCount: 0,
      readyPrimaryScaleCount: 3,
    },
    primaryScaleAgreementRows: {
      houseBrackmann: {
        label: "House-Brackmann",
        labeledCount: 30,
        missingEstimateCount: 0,
        withinToleranceCount: 30,
        agreementRate: 1,
        agreementWilsonLowerBound: 0.887,
        status: "meets-confidence-standard",
      },
      sunnybrook: {
        label: "Sunnybrook composite",
        labeledCount: 30,
        missingEstimateCount: 0,
        withinToleranceCount: 30,
        agreementRate: 1,
        agreementWilsonLowerBound: 0.887,
        status: "meets-confidence-standard",
      },
      eface: {
        label: "eFACE total",
        labeledCount: 30,
        missingEstimateCount: 0,
        withinToleranceCount: 30,
        agreementRate: 1,
        agreementWilsonLowerBound: 0.887,
        status: "meets-confidence-standard",
      },
    },
    houseBrackmannCaseMix: {
      minHouseBrackmannSeverityBands: 3,
      minAssessmentsPerSeverityBand: 3,
      representedSeverityBandCount: 3,
      minimumLabelsPerRepresentedSeverityBand: 10,
      severityBands: {
        mild: { label: "HB I-II mild/normal", count: 10, meetsMinimum: true },
        moderate: { label: "HB III-IV moderate", count: 10, meetsMinimum: true },
        severe: { label: "HB V-VI severe/complete", count: 10, meetsMinimum: true },
      },
    },
    referenceStandardControls: {
      pseudonymousValidationCaseId: true,
      sourceLabelSheetModeBlinded: true,
      reviewBlinded: true,
      uniqueAssessmentId: true,
      currentEstimatorVersion: true,
      mirrorEstimateStatusEstimated: true,
      completeOrMinimumEvidenceTier: true,
      minUsableMovementCoverageRatio: 0.8,
      movementInputProvenance: true,
      usableMovementsOnlyCalculation: true,
      houseBrackmannRequiredInput: true,
      sunnybrookEfaceInputCompleteness: true,
      completeRestingMetricKeys: true,
      completeRestingMetricsCalculation: true,
      missingInvalidEstimatesInDenominator: true,
      independentClinicianOrAdjudicatedLabelSource: true,
      pseudonymousReviewerId: true,
      recognizedClinicalReviewerRole: true,
      explicitClinicalConfidence: true,
      isoReviewTimestamp: true,
      sourceDatasetHashTraceability: true,
    },
    note: "This report packages reviewed agreement evidence for Mirror clinical-scale estimates. It does not convert estimates into clinician-assigned grades and does not provide diagnosis, prognosis, or treatment advice.",
  };
  return JSON.stringify({
    ...report,
    ...overrides,
  });
}

function passingThresholdReport({ readyExercises = 5, sourceDatasetSha256 = SOURCE_DATASET_SHA256 } = {}) {
  return JSON.stringify({
    kind: "mirror-threshold-calibration-report",
    schemaVersion: 1,
    generatedAt: "2026-06-24T00:00:00.000Z",
    sourceDatasetSha256,
    summary: {
      exercises: readyExercises,
      readyExercises,
      needsMoreLabels: 0,
    },
    exercises: [],
    note: "Recommendations require clinician/user/developer-reviewed labels and should be reviewed before changing production constants.",
  });
}

function passingClinicalReviewPackageVerificationReport({
  assessmentClinicalScaleRows = 30,
  generatedAt = "2026-06-24T00:00:00.000Z",
  sourceDatasetSha256 = SOURCE_DATASET_SHA256,
  controls = {},
  errors = [],
  status = "passed",
} = {}) {
  return JSON.stringify({
    kind: "mirror-clinical-scale-review-package-verification",
    schemaVersion: 1,
    generatedAt,
    status,
    packageId: "clinical-review-2026-06-24",
    sourceDatasetSha256,
    summary: {
      labelRows: assessmentClinicalScaleRows,
      frameSampleRows: 0,
      assessmentClinicalScaleRows,
      expectedLabelRows: assessmentClinicalScaleRows,
      expectedFrameSampleRows: 0,
      expectedAssessmentClinicalScaleRows: assessmentClinicalScaleRows,
    },
    controls: {
      sourceHashMatches: true,
      blindedManifest: true,
      rowIdentityMatches: true,
      estimateValuesHidden: true,
      readOnlyColumnsMatch: true,
      ...controls,
    },
    errors,
  });
}

function testWilsonScoreInterval(successes, total) {
  const phat = successes / total;
  const z2 = TEST_WILSON_Z_95 * TEST_WILSON_Z_95;
  const denominator = 1 + z2 / total;
  const center = (phat + z2 / (2 * total)) / denominator;
  const margin = (TEST_WILSON_Z_95 / denominator) * Math.sqrt((phat * (1 - phat) / total) + (z2 / (4 * total * total)));
  return {
    method: "wilson-score",
    confidenceLevel: 0.95,
    lower: Number(Math.max(0, center - margin).toFixed(4)),
    upper: Number(Math.min(1, center + margin).toFixed(4)),
  };
}

function passingClinicalReviewerAgreementReport({
  comparedCount = 30,
  primaryPairedCount = 30,
  blockingReasons = [],
  withinToleranceRate = 1,
  sourceDatasetSha256 = SOURCE_DATASET_SHA256,
} = {}) {
  const withinToleranceCount = Math.round(primaryPairedCount * withinToleranceRate);
  const wilsonInterval = testWilsonScoreInterval(withinToleranceCount, primaryPairedCount);
  const sameBandCount = Math.floor(primaryPairedCount / 3);
  const representedSeverityBandCount = sameBandCount >= 3 ? 3 : 0;
  return JSON.stringify({
    kind: "mirror-clinical-scale-reviewer-agreement-report",
    schemaVersion: 1,
    generatedAt: "2026-06-24T00:00:00.000Z",
    sourceDatasetSha256,
    reviewerA: "clinician-a",
    reviewerB: "clinician-b",
    standard: {
      minAgreementRate: 0.8,
      minAgreementWilsonLowerBound: 0.8,
      minPairedLabels: 30,
      minDistinctClinicalCases: 10,
      minHouseBrackmannSeverityBands: 3,
      minAssessmentsPerSeverityBand: 3,
      minUsableMovementCoverageRatio: 0.8,
      requiresV3MovementProvenance: true,
      requiresV4RestingMetricProvenance: true,
      requiresHouseBrackmannRequiredInput: true,
      requiresV5ScaleInputProvenance: true,
      requiresExplicitClinicalConfidence: true,
      requiresIsoReviewTimestamp: true,
      requiresSourceDatasetSha256: true,
      confidenceInterval: {
        method: "wilson-score",
        confidenceLevel: 0.95,
      },
      primaryScales: ["houseBrackmannGrade", "sunnybrookComposite", "efaceTotal"],
    },
    summary: {
      reviewerAAssessmentCount: comparedCount,
      reviewerBAssessmentCount: comparedCount,
      comparedAssessmentCount: comparedCount,
      eligibleReviewerPairCount: comparedCount,
      distinctValidationCaseCount: comparedCount,
      excludedReviewerPairCount: 0,
      excludedReviewerPairReasons: {},
      adjudicationRequiredCount: 4,
      primaryScaleCount: 3,
      requiredClinicalScaleEstimateVersion: CLINICAL_SCALE_ESTIMATE_VERSION,
      reviewerAEligibleAssessmentCount: comparedCount,
      reviewerBEligibleAssessmentCount: comparedCount,
      reviewerAIneligibleAssessmentCount: 0,
      reviewerBIneligibleAssessmentCount: 0,
      reviewerAIneligibleReasons: {},
      reviewerBIneligibleReasons: {},
      reviewerAEstimateVersionCounts: { [CURRENT_ESTIMATOR_VERSION_KEY]: comparedCount },
      reviewerBEstimateVersionCounts: { [CURRENT_ESTIMATOR_VERSION_KEY]: comparedCount },
      reviewerAReviewerIds: ["reviewer-a"],
      reviewerBReviewerIds: ["reviewer-b"],
      reviewerIdOverlapCount: 0,
      reviewerADuplicateAssessmentIdCount: 0,
      reviewerBDuplicateAssessmentIdCount: 0,
      reviewerADuplicateAssessmentRowCount: 0,
      reviewerBDuplicateAssessmentRowCount: 0,
      reviewerAMissingAssessmentIdRowCount: 0,
      reviewerBMissingAssessmentIdRowCount: 0,
      reviewerADuplicateAssessmentIds: [],
      reviewerBDuplicateAssessmentIds: [],
      reviewerAStaleOrMissingEstimateVersionCount: 0,
      reviewerBStaleOrMissingEstimateVersionCount: 0,
      reviewerAInsufficientEstimateEvidenceCount: 0,
      reviewerBInsufficientEstimateEvidenceCount: 0,
      estimateVersionMismatchCount: 0,
      estimateEvidenceMismatchCount: 0,
      houseBrackmannRepresentedSeverityBandCount: representedSeverityBandCount,
      houseBrackmannMinimumSameBandPairedLabelCount: sameBandCount,
      houseBrackmannCrossSeverityBandDisagreementCount: 0,
      readyPrimaryScaleCount: 3,
    },
    byScale: {
      houseBrackmannGrade: {
        pairedCount: primaryPairedCount,
        incompleteEstimateInputCount: 0,
        exactMatchCount: withinToleranceCount,
        withinToleranceCount,
        withinToleranceRate,
        withinToleranceConfidenceInterval: wilsonInterval,
        meetsMinimumStandard: withinToleranceRate >= 0.8 && wilsonInterval.lower >= 0.8,
        blockingReasons: [],
      },
      sunnybrookComposite: {
        pairedCount: primaryPairedCount,
        incompleteEstimateInputCount: 0,
        exactMatchCount: withinToleranceCount,
        withinToleranceCount,
        withinToleranceRate,
        withinToleranceConfidenceInterval: wilsonInterval,
        meetsMinimumStandard: withinToleranceRate >= 0.8 && wilsonInterval.lower >= 0.8,
        blockingReasons: [],
      },
      efaceTotal: {
        pairedCount: primaryPairedCount,
        incompleteEstimateInputCount: 0,
        exactMatchCount: withinToleranceCount,
        withinToleranceCount,
        withinToleranceRate,
        withinToleranceConfidenceInterval: wilsonInterval,
        meetsMinimumStandard: withinToleranceRate >= 0.8 && wilsonInterval.lower >= 0.8,
        blockingReasons: [],
      },
    },
    houseBrackmannCaseMix: {
      minHouseBrackmannSeverityBands: 3,
      minAssessmentsPerSeverityBand: 3,
      pairedHouseBrackmannCount: primaryPairedCount,
      representedSeverityBandCount,
      minimumSameBandPairedLabelCount: sameBandCount,
      crossSeverityBandDisagreementCount: 0,
      severityBands: {
        mild: {
          label: "HB I-II mild/normal",
          reviewerAPairedCount: sameBandCount,
          reviewerBPairedCount: sameBandCount,
          sameBandPairedCount: sameBandCount,
          meetsMinimum: sameBandCount >= 3,
        },
        moderate: {
          label: "HB III-IV moderate",
          reviewerAPairedCount: sameBandCount,
          reviewerBPairedCount: sameBandCount,
          sameBandPairedCount: sameBandCount,
          meetsMinimum: sameBandCount >= 3,
        },
        severe: {
          label: "HB V-VI severe/complete",
          reviewerAPairedCount: sameBandCount,
          reviewerBPairedCount: sameBandCount,
          sameBandPairedCount: sameBandCount,
          meetsMinimum: sameBandCount >= 3,
        },
      },
      crossSeverityBandDisagreements: [],
      blockingReasons: representedSeverityBandCount >= 3 ? [] : [
        "needs 3 House-Brackmann severity bands with at least 3 same-band paired reviewer labels",
      ],
    },
    estimateVersionMismatches: [],
    estimateEvidenceMismatches: [],
    reviewerSheetIssues: [],
    adjudicationRows: [],
    blockingReasons,
    note: "Reviewer agreement is a reference-standard quality check. Resolve adjudication rows before merging final clinical-scale labels into a reviewed dataset.",
  });
}

function houseBrackmannOnlyClinicalReviewerAgreementReport() {
  const report = JSON.parse(passingClinicalReviewerAgreementReport());
  report.summary.readyPrimaryScaleCount = 1;
  for (const scaleKey of ["sunnybrookComposite", "efaceTotal"]) {
    report.byScale[scaleKey] = {
      ...report.byScale[scaleKey],
      exactMatchCount: 20,
      withinToleranceCount: 20,
      exactAgreementRate: 0.6667,
      withinToleranceRate: 0.6667,
      withinToleranceConfidenceInterval: {
        method: "wilson-score",
        confidenceLevel: 0.95,
        lower: 0.488,
        upper: 0.808,
      },
      meetsMinimumStandard: false,
      blockingReasons: [
        "needs at least 80% within 10 points",
        "needs 95% Wilson lower bound at least 80% for within 10 points",
      ],
    };
  }
  report.blockingReasons = [
    "sunnybrookComposite: needs at least 80% within 10 points; needs 95% Wilson lower bound at least 80% for within 10 points",
    "efaceTotal: needs at least 80% within 10 points; needs 95% Wilson lower bound at least 80% for within 10 points",
  ];
  return JSON.stringify(report);
}

function artifactReader(artifacts) {
  return async (path) => {
    if (Object.hasOwn(artifacts, path)) return artifacts[path];
    if (path === REVIEW_PACKAGE_VERIFICATION_REPORT_PATH) return passingClinicalReviewPackageVerificationReport();
    throw new Error(`missing fixture: ${path}`);
  };
}

test("validation status accepts explicit unvalidated tooling-ready state", () => {
  const status = validateStatus(BASE_STATUS);
  assert.equal(status.status, "tooling-ready-needs-reviewed-data");
  assert.equal(status.clinicalScaleAvailability.houseBrackmann.clinicalFacingScoresAllowed, false);
});

test("validation status accepts documented reviewed calibration state", () => {
  const status = validateStatus({
    ...BASE_STATUS,
    status: "production-thresholds-calibrated",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    readyExerciseCount: 5,
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.md"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
  });
  assert.equal(status.productionThresholdConstantsCalibrated, true);
});

test("validation status accepts documented clinical agreement state", () => {
  const status = validateStatus({
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.md"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  });
  assert.equal(status.clinicalFacingScoresAllowed, true);
});

test("validation status rejects enabled per-scale availability without evidence summaries", () => {
  const passingStatus = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: [CLINICAL_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewerAgreementReports: [REVIEWER_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: [THRESHOLD_CALIBRATION_REPORT_PATH],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: HOUSE_BRACKMANN_ONLY_CLINICAL_SCALE_AVAILABILITY,
  };

  assert.throws(
    () => validateStatus({
      ...passingStatus,
      clinicalScaleAvailability: {
        ...HOUSE_BRACKMANN_ONLY_CLINICAL_SCALE_AVAILABILITY,
        houseBrackmann: { clinicalFacingScoresAllowed: true },
      },
    }),
    /houseBrackmann\.clinicalAgreementReport/,
  );

  const weakEvidence = [
    { override: { clinicalAgreementReport: "docs/validation/other-report.md" }, blocker: /houseBrackmann\.clinicalAgreementReport/ },
    { override: { reviewerAgreementReport: "docs/validation/other-reviewer-report.json" }, blocker: /houseBrackmann\.reviewerAgreementReport/ },
    { override: { clinicalReviewPackageVerificationReport: "docs/validation/other-review-package.json" }, blocker: /houseBrackmann\.clinicalReviewPackageVerificationReport/ },
    { override: { sourceDatasetSha256: "not-a-sha256" }, blocker: /houseBrackmann\.sourceDatasetSha256/ },
    { override: { clinicalScaleEstimateVersion: CLINICAL_SCALE_ESTIMATE_VERSION - 1 }, blocker: /houseBrackmann\.clinicalScaleEstimateVersion/ },
    { override: { reviewedLabelCount: 29 }, blocker: /houseBrackmann\.reviewedLabelCount/ },
    { override: { distinctValidationCaseCount: 9 }, blocker: /houseBrackmann\.distinctValidationCaseCount/ },
    { override: { observedAgreementRate: 0.79 }, blocker: /houseBrackmann\.observedAgreementRate/ },
    { override: { agreementWilsonLowerBound: 0.79 }, blocker: /houseBrackmann\.agreementWilsonLowerBound/ },
    { override: { reviewerPairedLabelCount: 29 }, blocker: /houseBrackmann\.reviewerPairedLabelCount/ },
    { override: { reviewerDistinctValidationCaseCount: 9 }, blocker: /houseBrackmann\.reviewerDistinctValidationCaseCount/ },
    { override: { reviewerObservedAgreementRate: 0.79 }, blocker: /houseBrackmann\.reviewerObservedAgreementRate/ },
    { override: { reviewerAgreementWilsonLowerBound: 0.79 }, blocker: /houseBrackmann\.reviewerAgreementWilsonLowerBound/ },
  ];

  for (const { override, blocker } of weakEvidence) {
    assert.throws(
      () => validateStatus({
        ...passingStatus,
        clinicalScaleAvailability: {
          ...HOUSE_BRACKMANN_ONLY_CLINICAL_SCALE_AVAILABILITY,
          houseBrackmann: enabledScaleEvidence(override),
        },
      }),
      blocker,
    );
  }
});

test("validation status rejects unknown status values", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      status: "maybe-clinical-someday",
    }),
    /status must be one of/,
  );
});

test("validation status rejects clinical artifacts under non-clinical status", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      status: "production-thresholds-calibrated",
      reviewedDatasetCount: 2,
      reviewedFrameCount: 1200,
      reviewedClinicalScaleAssessmentCount: 30,
      readyExerciseCount: 5,
      clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
      thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.md"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
      productionThresholdConstantsCalibrated: true,
    }),
    /clinical scale agreement reports require status clinical-scale-agreement-reviewed/,
  );
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      status: "production-thresholds-calibrated",
      reviewedDatasetCount: 2,
      reviewedFrameCount: 1200,
      reviewedClinicalScaleAssessmentCount: 30,
      readyExerciseCount: 5,
      clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
      clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
      thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.md"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
      productionThresholdConstantsCalibrated: true,
    }),
    /clinical scale reviewer agreement reports require status clinical-scale-agreement-reviewed/,
  );
});

test("validation status rejects clinical-facing support under non-clinical status", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      status: "production-thresholds-calibrated",
      reviewedDatasetCount: 2,
      reviewedFrameCount: 1200,
      reviewedClinicalScaleAssessmentCount: 30,
      readyExerciseCount: 5,
      clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
      clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
      clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
      thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.md"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
      productionThresholdConstantsCalibrated: true,
      clinicalFacingScoresAllowed: true,
      clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
    }),
    /clinical scale agreement reports require status clinical-scale-agreement-reviewed|clinical-facing scores require status clinical-scale-agreement-reviewed/,
  );
});

test("clinical review package verification report validates pass controls", () => {
  const report = validateClinicalScaleReviewPackageVerificationReportText(
    passingClinicalReviewPackageVerificationReport(),
    REVIEW_PACKAGE_VERIFICATION_REPORT_PATH,
  );

  assert.equal(report.status, "passed");
  assert.equal(report.assessmentClinicalScaleRows, 30);
  assert.equal(report.expectedAssessmentClinicalScaleRows, 30);
  assert.equal(report.controls.sourceHashMatches, true);
  assert.equal(report.controls.estimateValuesHidden, true);
});

test("clinical review package verification report rejects failed controls", () => {
  assert.throws(
    () => validateClinicalScaleReviewPackageVerificationReportText(
      passingClinicalReviewPackageVerificationReport({
        controls: { estimateValuesHidden: false },
        errors: ["assessmentClinicalScale:assessment-1 estimatedSunnybrookComposite must remain hidden"],
      }),
      REVIEW_PACKAGE_VERIFICATION_REPORT_PATH,
    ),
    /controls\.estimateValuesHidden must be true/,
  );
});

test("validation status artifacts accept documented clinical and calibration reports", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  const result = await validateStatusArtifacts(status, {
    readArtifactText: artifactReader({
      "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport(),
      "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": passingClinicalReviewerAgreementReport(),
      "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
    }),
  });

  assert.equal(result.status.clinicalFacingScoresAllowed, true);
  assert.equal(result.artifacts.clinicalAgreementReports[0].reviewedClinicalScaleAssessmentCount, 30);
  assert.equal(result.artifacts.clinicalAgreementReports[0].generatedAt, "2026-06-24T00:00:00.000Z");
  assert.equal(result.artifacts.clinicalAgreementReports[0].distinctClinicalCaseCount, 30);
  assert.equal(result.artifacts.clinicalAgreementReports[0].eligibleBlindedIndependentLabelCount, 30);
  assert.equal(result.artifacts.clinicalAgreementReports[0].clinicalScaleEstimateVersion, CLINICAL_SCALE_ESTIMATE_VERSION);
  assert.equal(result.artifacts.clinicalAgreementReports[0].minimumUsableMovementCoverageRatio, 0.8);
  assert.equal(result.artifacts.clinicalAgreementReports[0].representedHouseBrackmannSeverityBandCount, 3);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].comparedAssessmentCount, 30);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].generatedAt, "2026-06-24T00:00:00.000Z");
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].eligibleReviewerPairCount, 30);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].distinctValidationCaseCount, 30);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].excludedReviewerPairCount, 0);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].minimumPrimaryPairedCount, 30);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].minimumPrimaryAgreementRate, 1);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].minimumPrimaryAgreementWilsonLowerBound, testWilsonScoreInterval(30, 30).lower);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].reviewerAInsufficientEstimateEvidenceCount, 0);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].reviewerBInsufficientEstimateEvidenceCount, 0);
  assert.deepEqual(result.artifacts.clinicalReviewerAgreementReports[0].reviewerAReviewerIds, ["reviewer-a"]);
  assert.deepEqual(result.artifacts.clinicalReviewerAgreementReports[0].reviewerBReviewerIds, ["reviewer-b"]);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].reviewerIdOverlapCount, 0);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].estimateEvidenceMismatchCount, 0);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].representedHouseBrackmannSeverityBandCount, 3);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].minimumHouseBrackmannSeverityBandLabelCount, 10);
  assert.equal(result.artifacts.thresholdCalibrationReports[0].readyExerciseCount, 5);
  assert.equal(result.artifacts.thresholdCalibrationReports[0].generatedAt, "2026-06-24T00:00:00.000Z");
});

test("validation status artifacts accept scale-specific clinical availability for a passing primary scale", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: HOUSE_BRACKMANN_ONLY_CLINICAL_SCALE_AVAILABILITY,
  };

  const result = await validateStatusArtifacts(status, {
    readArtifactText: artifactReader({
      "docs/validation/clinical-scale-agreement-2026-06-24.md": houseBrackmannOnlyClinicalAgreementReport(),
      "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": houseBrackmannOnlyClinicalReviewerAgreementReport(),
      "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
    }),
  });

  assert.equal(result.status.clinicalScaleAvailability.houseBrackmann.clinicalFacingScoresAllowed, true);
  assert.equal(result.artifacts.clinicalAgreementReports[0].primaryScaleAgreementRows.houseBrackmann.agreementWilsonLowerBound, 0.887);
  assert.equal(result.artifacts.clinicalAgreementReports[0].primaryScaleAgreementRows.sunnybrook.agreementWilsonLowerBound, 0.488);
  assert.equal(result.artifacts.clinicalAgreementReports[0].primaryScaleAgreementRows.sunnybrook.status, "not-ready");
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].byScale.sunnybrookComposite.meetsMinimumStandard, false);
});

test("validation status artifacts accept structured clinical agreement reports", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: [STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewerAgreementReports: [REVIEWER_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: [THRESHOLD_CALIBRATION_REPORT_PATH],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: {
      houseBrackmann: enabledScaleEvidence({ clinicalAgreementReport: STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH }),
      sunnybrook: enabledScaleEvidence({ clinicalAgreementReport: STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH }),
      eface: enabledScaleEvidence({ clinicalAgreementReport: STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH }),
    },
  };

  const result = await validateStatusArtifacts(status, {
    readArtifactText: artifactReader({
      [STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH]: passingStructuredClinicalAgreementReport(),
      [REVIEWER_AGREEMENT_REPORT_PATH]: passingClinicalReviewerAgreementReport(),
      [THRESHOLD_CALIBRATION_REPORT_PATH]: passingThresholdReport(),
    }),
  });

  assert.equal(result.artifacts.clinicalAgreementReports[0].primaryScaleAgreementRows.houseBrackmann.agreementWilsonLowerBound, 0.887);
  assert.equal(result.artifacts.clinicalAgreementReports[0].primaryScaleAgreementRows.sunnybrook.agreementWilsonLowerBound, 0.887);
  assert.equal(result.artifacts.clinicalAgreementReports[0].representedHouseBrackmannSeverityBandCount, 3);
});

test("validation status artifacts reject unversioned structured clinical agreement reports", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: [STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewerAgreementReports: [REVIEWER_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: [THRESHOLD_CALIBRATION_REPORT_PATH],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: {
      houseBrackmann: enabledScaleEvidence({ clinicalAgreementReport: STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH }),
      sunnybrook: enabledScaleEvidence({ clinicalAgreementReport: STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH }),
      eface: enabledScaleEvidence({ clinicalAgreementReport: STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH }),
    },
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        [STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH]: passingStructuredClinicalAgreementReport({ schemaVersion: 2 }),
        [REVIEWER_AGREEMENT_REPORT_PATH]: passingClinicalReviewerAgreementReport(),
        [THRESHOLD_CALIBRATION_REPORT_PATH]: passingThresholdReport(),
      }),
    }),
    /clinical-scale-agreement-2026-06-24\.json\.schemaVersion must be 1/,
  );
});

test("validation status artifacts reject unversioned clinical reviewer agreement reports", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: [CLINICAL_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewerAgreementReports: [REVIEWER_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: [THRESHOLD_CALIBRATION_REPORT_PATH],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };
  const reviewerReport = JSON.parse(passingClinicalReviewerAgreementReport());
  delete reviewerReport.schemaVersion;

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        [CLINICAL_AGREEMENT_REPORT_PATH]: passingClinicalAgreementReport(),
        [REVIEWER_AGREEMENT_REPORT_PATH]: JSON.stringify(reviewerReport),
        [THRESHOLD_CALIBRATION_REPORT_PATH]: passingThresholdReport(),
      }),
    }),
    /clinical-scale-reviewer-agreement-2026-06-24\.json\.schemaVersion must be 1/,
  );
});

test("validation status rejects structured clinical agreement rates that do not match counts", () => {
  const structuredReport = JSON.parse(passingStructuredClinicalAgreementReport());
  structuredReport.primaryScaleAgreementRows.houseBrackmann.withinToleranceCount = 24;
  structuredReport.primaryScaleAgreementRows.houseBrackmann.agreementRate = 1;

  assert.throws(
    () => validateClinicalScaleAgreementReportText(JSON.stringify(structuredReport), STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH),
    /primaryScaleAgreementRows\.houseBrackmann\.agreementRate must match 24\/30/,
  );
});

test("validation status rejects reviewer agreement rates that do not match counts", () => {
  const reviewerReport = JSON.parse(passingClinicalReviewerAgreementReport());
  reviewerReport.byScale.houseBrackmannGrade.withinToleranceCount = 24;
  reviewerReport.byScale.houseBrackmannGrade.exactMatchCount = 24;
  reviewerReport.byScale.houseBrackmannGrade.exactAgreementRate = 0.8;
  reviewerReport.byScale.houseBrackmannGrade.withinToleranceRate = 1;

  assert.throws(
    () => validateClinicalScaleReviewerAgreementReportText(JSON.stringify(reviewerReport), REVIEWER_AGREEMENT_REPORT_PATH),
    /byScale\.houseBrackmannGrade\.withinToleranceRate must match 24\/30/,
  );
});

test("validation status rejects reviewer agreement reports without source hash controls", () => {
  const reviewerReport = JSON.parse(passingClinicalReviewerAgreementReport());
  delete reviewerReport.sourceDatasetSha256;

  assert.throws(
    () => validateClinicalScaleReviewerAgreementReportText(JSON.stringify(reviewerReport), REVIEWER_AGREEMENT_REPORT_PATH),
    /sourceDatasetSha256/,
  );

  const reportWithoutStandardControl = JSON.parse(passingClinicalReviewerAgreementReport());
  delete reportWithoutStandardControl.standard.requiresSourceDatasetSha256;

  assert.throws(
    () => validateClinicalScaleReviewerAgreementReportText(JSON.stringify(reportWithoutStandardControl), REVIEWER_AGREEMENT_REPORT_PATH),
    /standard\.requiresSourceDatasetSha256/,
  );
});

test("validation status rejects structured clinical agreement Wilson bounds that do not match counts", () => {
  const structuredReport = JSON.parse(passingStructuredClinicalAgreementReport());
  structuredReport.primaryScaleAgreementRows.houseBrackmann.agreementWilsonLowerBound = 0.8;

  assert.throws(
    () => validateClinicalScaleAgreementReportText(JSON.stringify(structuredReport), STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH),
    /primaryScaleAgreementRows\.houseBrackmann\.agreementConfidenceInterval\.lower must match Wilson score lower bound for 30\/30/,
  );
});

test("validation status rejects Markdown clinical agreement Wilson bounds that do not match counts", () => {
  const markdownReport = passingClinicalAgreementReport()
    .replace("| House-Brackmann | within one grade | 30 | 0 | 30 | 100.0% | 88.7%-100.0% 95% Wilson CI |", "| House-Brackmann | within one grade | 30 | 0 | 30 | 100.0% | 80.0%-100.0% 95% Wilson CI |");

  assert.throws(
    () => validateClinicalScaleAgreementReportText(markdownReport, CLINICAL_AGREEMENT_REPORT_PATH),
    /House-Brackmann agreement row\.agreementConfidenceInterval\.lower must match Wilson score lower bound for 30\/30/,
  );
});

test("validation status rejects reviewer agreement Wilson bounds that do not match counts", () => {
  const reviewerReport = JSON.parse(passingClinicalReviewerAgreementReport());
  reviewerReport.byScale.houseBrackmannGrade.withinToleranceConfidenceInterval.lower = 0.8;

  assert.throws(
    () => validateClinicalScaleReviewerAgreementReportText(JSON.stringify(reviewerReport), REVIEWER_AGREEMENT_REPORT_PATH),
    /byScale\.houseBrackmannGrade\.withinToleranceConfidenceInterval\.lower must match Wilson score lower bound for 30\/30/,
  );
});

test("validation status rejects clinical agreement artifacts without ISO generated timestamps", () => {
  const markdownReport = passingClinicalAgreementReport()
    .replace("Generated: 2026-06-24T00:00:00.000Z", "Generated: June 24, 2026");
  assert.throws(
    () => validateClinicalScaleAgreementReportText(markdownReport, CLINICAL_AGREEMENT_REPORT_PATH),
    /Generated must be a UTC ISO timestamp/,
  );

  const structuredReport = JSON.parse(passingStructuredClinicalAgreementReport({ generatedAt: "June 24, 2026" }));
  assert.throws(
    () => validateClinicalScaleAgreementReportText(JSON.stringify(structuredReport), STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH),
    /generatedAt must be a UTC ISO timestamp/,
  );
});

test("validation status rejects reviewer and threshold artifacts without ISO generated timestamps", () => {
  const reviewerReport = JSON.parse(passingClinicalReviewerAgreementReport());
  reviewerReport.generatedAt = "June 24, 2026";
  assert.throws(
    () => validateClinicalScaleReviewerAgreementReportText(JSON.stringify(reviewerReport), REVIEWER_AGREEMENT_REPORT_PATH),
    /generatedAt must be a UTC ISO timestamp/,
  );

  const thresholdReport = JSON.parse(passingThresholdReport());
  thresholdReport.generatedAt = "June 24, 2026";
  assert.throws(
    () => validateThresholdCalibrationReportText(JSON.stringify(thresholdReport), THRESHOLD_CALIBRATION_REPORT_PATH),
    /generatedAt must be a UTC ISO timestamp/,
  );
});

test("validation status rejects unversioned threshold calibration reports", () => {
  const thresholdReport = JSON.parse(passingThresholdReport());
  delete thresholdReport.schemaVersion;

  assert.throws(
    () => validateThresholdCalibrationReportText(JSON.stringify(thresholdReport), THRESHOLD_CALIBRATION_REPORT_PATH),
    /threshold-calibration-2026-06-23\.json\.schemaVersion must be 1/,
  );
});

test("validation status rejects threshold calibration reports without source hash controls", () => {
  const thresholdReport = JSON.parse(passingThresholdReport());
  delete thresholdReport.sourceDatasetSha256;

  assert.throws(
    () => validateThresholdCalibrationReportText(JSON.stringify(thresholdReport), THRESHOLD_CALIBRATION_REPORT_PATH),
    /sourceDatasetSha256/,
  );
});

test("validation status artifacts reject reports generated after the status decision date", async () => {
  const status = {
    ...BASE_STATUS,
    updatedAt: "2026-06-23",
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: [CLINICAL_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewerAgreementReports: [REVIEWER_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: [THRESHOLD_CALIBRATION_REPORT_PATH],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        [CLINICAL_AGREEMENT_REPORT_PATH]: passingClinicalAgreementReport(),
        [REVIEWER_AGREEMENT_REPORT_PATH]: passingClinicalReviewerAgreementReport(),
        [THRESHOLD_CALIBRATION_REPORT_PATH]: passingThresholdReport(),
      }),
    }),
    /generatedAt must not be after validation status updatedAt 2026-06-23/,
  );
});

test("validation status artifacts reject review package verification without reviewed assessment coverage", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: [CLINICAL_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewerAgreementReports: [REVIEWER_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: [THRESHOLD_CALIBRATION_REPORT_PATH],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        [CLINICAL_AGREEMENT_REPORT_PATH]: passingClinicalAgreementReport(),
        [REVIEWER_AGREEMENT_REPORT_PATH]: passingClinicalReviewerAgreementReport(),
        [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH]: passingClinicalReviewPackageVerificationReport({ assessmentClinicalScaleRows: 29 }),
        [THRESHOLD_CALIBRATION_REPORT_PATH]: passingThresholdReport(),
      }),
    }),
    /review package verification reports must document a passed blinded package check/,
  );
});

test("validation status artifacts reject structured clinical agreement reports without required controls", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: [STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewerAgreementReports: [REVIEWER_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: [THRESHOLD_CALIBRATION_REPORT_PATH],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: {
      houseBrackmann: enabledScaleEvidence({ clinicalAgreementReport: STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH }),
      sunnybrook: enabledScaleEvidence({ clinicalAgreementReport: STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH }),
      eface: enabledScaleEvidence({ clinicalAgreementReport: STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH }),
    },
  };
  const structuredReport = JSON.parse(passingStructuredClinicalAgreementReport());
  structuredReport.referenceStandardControls.reviewBlinded = false;

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        [STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH]: JSON.stringify(structuredReport),
        [REVIEWER_AGREEMENT_REPORT_PATH]: passingClinicalReviewerAgreementReport(),
        [THRESHOLD_CALIBRATION_REPORT_PATH]: passingThresholdReport(),
      }),
    }),
    /referenceStandardControls\.reviewBlinded/,
  );
});

test("validation status artifacts reject structured clinical agreement reports without explicit confidence controls", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: [STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewerAgreementReports: [REVIEWER_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: [THRESHOLD_CALIBRATION_REPORT_PATH],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: {
      houseBrackmann: enabledScaleEvidence({ clinicalAgreementReport: STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH }),
      sunnybrook: enabledScaleEvidence({ clinicalAgreementReport: STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH }),
      eface: enabledScaleEvidence({ clinicalAgreementReport: STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH }),
    },
  };
  const structuredReport = JSON.parse(passingStructuredClinicalAgreementReport());
  delete structuredReport.evidenceStandard.requiresExplicitClinicalConfidence;

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        [STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH]: JSON.stringify(structuredReport),
        [REVIEWER_AGREEMENT_REPORT_PATH]: passingClinicalReviewerAgreementReport(),
        [THRESHOLD_CALIBRATION_REPORT_PATH]: passingThresholdReport(),
      }),
    }),
    /evidenceStandard\.requiresExplicitClinicalConfidence/,
  );

  const reportWithoutReferenceControl = JSON.parse(passingStructuredClinicalAgreementReport());
  delete reportWithoutReferenceControl.referenceStandardControls.explicitClinicalConfidence;

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        [STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH]: JSON.stringify(reportWithoutReferenceControl),
        [REVIEWER_AGREEMENT_REPORT_PATH]: passingClinicalReviewerAgreementReport(),
        [THRESHOLD_CALIBRATION_REPORT_PATH]: passingThresholdReport(),
      }),
    }),
    /referenceStandardControls\.explicitClinicalConfidence/,
  );
});

test("validation status artifacts reject structured clinical agreement reports without review timestamp controls", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: [STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewerAgreementReports: [REVIEWER_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: [THRESHOLD_CALIBRATION_REPORT_PATH],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: {
      houseBrackmann: enabledScaleEvidence({ clinicalAgreementReport: STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH }),
      sunnybrook: enabledScaleEvidence({ clinicalAgreementReport: STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH }),
      eface: enabledScaleEvidence({ clinicalAgreementReport: STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH }),
    },
  };
  const structuredReport = JSON.parse(passingStructuredClinicalAgreementReport());
  delete structuredReport.evidenceStandard.requiresIsoReviewTimestamp;

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        [STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH]: JSON.stringify(structuredReport),
        [REVIEWER_AGREEMENT_REPORT_PATH]: passingClinicalReviewerAgreementReport(),
        [THRESHOLD_CALIBRATION_REPORT_PATH]: passingThresholdReport(),
      }),
    }),
    /evidenceStandard\.requiresIsoReviewTimestamp/,
  );

  const reportWithoutReferenceControl = JSON.parse(passingStructuredClinicalAgreementReport());
  delete reportWithoutReferenceControl.referenceStandardControls.isoReviewTimestamp;

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        [STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH]: JSON.stringify(reportWithoutReferenceControl),
        [REVIEWER_AGREEMENT_REPORT_PATH]: passingClinicalReviewerAgreementReport(),
        [THRESHOLD_CALIBRATION_REPORT_PATH]: passingThresholdReport(),
      }),
    }),
    /referenceStandardControls\.isoReviewTimestamp/,
  );
});

test("validation status artifacts reject clinical agreement reports without source hash controls", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: [STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewerAgreementReports: [REVIEWER_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: [THRESHOLD_CALIBRATION_REPORT_PATH],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: {
      houseBrackmann: enabledScaleEvidence({ clinicalAgreementReport: STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH }),
      sunnybrook: enabledScaleEvidence({ clinicalAgreementReport: STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH }),
      eface: enabledScaleEvidence({ clinicalAgreementReport: STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH }),
    },
  };
  const structuredReport = JSON.parse(passingStructuredClinicalAgreementReport());
  delete structuredReport.sourceDatasetSha256;

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        [STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH]: JSON.stringify(structuredReport),
        [REVIEWER_AGREEMENT_REPORT_PATH]: passingClinicalReviewerAgreementReport(),
        [THRESHOLD_CALIBRATION_REPORT_PATH]: passingThresholdReport(),
      }),
    }),
    /sourceDatasetSha256/,
  );

  const reportWithoutReferenceControl = JSON.parse(passingStructuredClinicalAgreementReport());
  delete reportWithoutReferenceControl.referenceStandardControls.sourceDatasetHashTraceability;

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        [STRUCTURED_CLINICAL_AGREEMENT_REPORT_PATH]: JSON.stringify(reportWithoutReferenceControl),
        [REVIEWER_AGREEMENT_REPORT_PATH]: passingClinicalReviewerAgreementReport(),
        [THRESHOLD_CALIBRATION_REPORT_PATH]: passingThresholdReport(),
      }),
    }),
    /referenceStandardControls\.sourceDatasetHashTraceability/,
  );
});

test("validation status artifacts reject clinical agreement reports without a matching verified review package source hash", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: [CLINICAL_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewerAgreementReports: [REVIEWER_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: [THRESHOLD_CALIBRATION_REPORT_PATH],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        [CLINICAL_AGREEMENT_REPORT_PATH]: passingClinicalAgreementReport(),
        [REVIEWER_AGREEMENT_REPORT_PATH]: passingClinicalReviewerAgreementReport(),
        [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH]: passingClinicalReviewPackageVerificationReport({ sourceDatasetSha256: "b".repeat(64) }),
        [THRESHOLD_CALIBRATION_REPORT_PATH]: passingThresholdReport(),
      }),
    }),
    /sourceDatasetSha256 must match a listed passed clinical review package verification report/,
  );
});

test("validation status artifacts reject reviewer agreement reports with a mismatched source hash", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: [CLINICAL_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewerAgreementReports: [REVIEWER_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: [THRESHOLD_CALIBRATION_REPORT_PATH],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        [CLINICAL_AGREEMENT_REPORT_PATH]: passingClinicalAgreementReport(),
        [REVIEWER_AGREEMENT_REPORT_PATH]: passingClinicalReviewerAgreementReport({ sourceDatasetSha256: "b".repeat(64) }),
        [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH]: passingClinicalReviewPackageVerificationReport(),
        [THRESHOLD_CALIBRATION_REPORT_PATH]: passingThresholdReport(),
      }),
    }),
    /reviewerAgreementReport sourceDatasetSha256 must match the clinical agreement report/,
  );
});

test("validation status evidence helper derives per-scale status summaries from reports", () => {
  const clinicalAgreementReport = validateClinicalScaleAgreementReportText(passingClinicalAgreementReport(), CLINICAL_AGREEMENT_REPORT_PATH);
  const reviewerAgreementReport = validateClinicalScaleReviewerAgreementReportText(passingClinicalReviewerAgreementReport(), REVIEWER_AGREEMENT_REPORT_PATH);
  const reviewPackageVerificationReport = validateClinicalScaleReviewPackageVerificationReportText(passingClinicalReviewPackageVerificationReport(), REVIEW_PACKAGE_VERIFICATION_REPORT_PATH);
  const clinicalScaleAvailability = buildClinicalScaleAvailabilityEvidence(BASE_STATUS, clinicalAgreementReport, reviewerAgreementReport, {
    clinicalScaleReviewPackageVerificationReports: [reviewPackageVerificationReport],
  });

  assert.equal(clinicalScaleAvailability.houseBrackmann.clinicalFacingScoresAllowed, true);
  assert.equal(clinicalScaleAvailability.houseBrackmann.clinicalAgreementReport, CLINICAL_AGREEMENT_REPORT_PATH);
  assert.equal(clinicalScaleAvailability.houseBrackmann.reviewerAgreementReport, REVIEWER_AGREEMENT_REPORT_PATH);
  assert.equal(clinicalScaleAvailability.houseBrackmann.clinicalReviewPackageVerificationReport, REVIEW_PACKAGE_VERIFICATION_REPORT_PATH);
  assert.equal(clinicalScaleAvailability.houseBrackmann.sourceDatasetSha256, SOURCE_DATASET_SHA256);
  assert.equal(clinicalScaleAvailability.houseBrackmann.reviewedLabelCount, 30);
  assert.equal(clinicalScaleAvailability.houseBrackmann.distinctValidationCaseCount, 30);
  assert.equal(clinicalScaleAvailability.houseBrackmann.observedAgreementRate, 1);
  assert.equal(clinicalScaleAvailability.houseBrackmann.agreementWilsonLowerBound, 0.887);
  assert.equal(clinicalScaleAvailability.houseBrackmann.reviewerPairedLabelCount, 30);
  assert.equal(clinicalScaleAvailability.houseBrackmann.reviewerDistinctValidationCaseCount, 30);
  assert.equal(clinicalScaleAvailability.houseBrackmann.reviewerObservedAgreementRate, 1);
  assert.equal(clinicalScaleAvailability.houseBrackmann.reviewerAgreementWilsonLowerBound, testWilsonScoreInterval(30, 30).lower);
  assert.equal(clinicalScaleAvailability.sunnybrook.clinicalFacingScoresAllowed, true);
  assert.equal(clinicalScaleAvailability.eface.clinicalFacingScoresAllowed, true);
});

test("validation status evidence helper keeps weak scales disabled unless explicitly requested", () => {
  const clinicalAgreementReport = validateClinicalScaleAgreementReportText(houseBrackmannOnlyClinicalAgreementReport(), CLINICAL_AGREEMENT_REPORT_PATH);
  const reviewerAgreementReport = validateClinicalScaleReviewerAgreementReportText(houseBrackmannOnlyClinicalReviewerAgreementReport(), REVIEWER_AGREEMENT_REPORT_PATH);
  const reviewPackageVerificationReport = validateClinicalScaleReviewPackageVerificationReportText(passingClinicalReviewPackageVerificationReport(), REVIEW_PACKAGE_VERIFICATION_REPORT_PATH);
  const evidenceOptions = {
    clinicalScaleReviewPackageVerificationReports: [reviewPackageVerificationReport],
  };
  const clinicalScaleAvailability = buildClinicalScaleAvailabilityEvidence(BASE_STATUS, clinicalAgreementReport, reviewerAgreementReport, evidenceOptions);

  assert.equal(clinicalScaleAvailability.houseBrackmann.clinicalFacingScoresAllowed, true);
  assert.equal(clinicalScaleAvailability.sunnybrook.clinicalFacingScoresAllowed, false);
  assert.equal(clinicalScaleAvailability.eface.clinicalFacingScoresAllowed, false);
  assert.throws(
    () => buildClinicalScaleAvailabilityEvidence(BASE_STATUS, clinicalAgreementReport, reviewerAgreementReport, {
      ...evidenceOptions,
      enabledScaleKeys: ["sunnybrook"],
    }),
    /clinical agreement report cannot support every requested enabled primary scale|clinical reviewer agreement report cannot support every requested enabled primary scale/,
  );
});

test("validation status evidence patch includes report paths and scale summaries", () => {
  const clinicalAgreementReport = validateClinicalScaleAgreementReportText(passingClinicalAgreementReport(), CLINICAL_AGREEMENT_REPORT_PATH);
  const reviewerAgreementReport = validateClinicalScaleReviewerAgreementReportText(passingClinicalReviewerAgreementReport(), REVIEWER_AGREEMENT_REPORT_PATH);
  const reviewPackageVerificationReport = validateClinicalScaleReviewPackageVerificationReportText(passingClinicalReviewPackageVerificationReport(), REVIEW_PACKAGE_VERIFICATION_REPORT_PATH);
  const patch = buildClinicalScaleStatusEvidencePatch({
    ...BASE_STATUS,
    clinicalScaleAgreementReports: ["docs/validation/older-clinical-agreement.md"],
    clinicalScaleReviewerAgreementReports: [REVIEWER_AGREEMENT_REPORT_PATH],
  }, clinicalAgreementReport, reviewerAgreementReport, {
    clinicalScaleReviewPackageVerificationReports: [reviewPackageVerificationReport],
  });

  assert.deepEqual(patch.clinicalScaleAgreementReports, [
    "docs/validation/older-clinical-agreement.md",
    CLINICAL_AGREEMENT_REPORT_PATH,
  ]);
  assert.deepEqual(patch.clinicalScaleReviewerAgreementReports, [REVIEWER_AGREEMENT_REPORT_PATH]);
  assert.deepEqual(patch.clinicalScaleReviewPackageVerificationReports, [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH]);
  assert.equal(patch.clinicalScaleAvailability.houseBrackmann.clinicalFacingScoresAllowed, true);
  assert.equal(patch.clinicalScaleAvailability.houseBrackmann.clinicalAgreementReport, CLINICAL_AGREEMENT_REPORT_PATH);
  assert.equal(patch.clinicalScaleAvailability.houseBrackmann.reviewerAgreementReport, REVIEWER_AGREEMENT_REPORT_PATH);
  assert.equal(patch.clinicalScaleAvailability.houseBrackmann.clinicalReviewPackageVerificationReport, REVIEW_PACKAGE_VERIFICATION_REPORT_PATH);
  assert.equal(patch.clinicalScaleAvailability.houseBrackmann.sourceDatasetSha256, SOURCE_DATASET_SHA256);
});

test("validation status artifacts reject per-scale evidence summaries that do not match their reports", async () => {
  const passingStatus = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: [CLINICAL_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewerAgreementReports: [REVIEWER_AGREEMENT_REPORT_PATH],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: [THRESHOLD_CALIBRATION_REPORT_PATH],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: HOUSE_BRACKMANN_ONLY_CLINICAL_SCALE_AVAILABILITY,
  };
  const mismatchedEvidence = [
    { override: { sourceDatasetSha256: "b".repeat(64) }, blocker: /houseBrackmann\.sourceDatasetSha256 must match the clinical agreement report/ },
    { override: { clinicalReviewPackageVerificationReport: "docs/validation/other-review-package.json" }, blocker: /houseBrackmann\.clinicalReviewPackageVerificationReport/ },
    { override: { reviewedLabelCount: 31 }, blocker: /houseBrackmann\.reviewedLabelCount/ },
    { override: { distinctValidationCaseCount: 31 }, blocker: /houseBrackmann\.distinctValidationCaseCount/ },
    { override: { observedAgreementRate: 0.99 }, blocker: /houseBrackmann\.observedAgreementRate/ },
    { override: { agreementWilsonLowerBound: 0.888 }, blocker: /houseBrackmann\.agreementWilsonLowerBound/ },
    { override: { reviewerPairedLabelCount: 31 }, blocker: /houseBrackmann\.reviewerPairedLabelCount/ },
    { override: { reviewerDistinctValidationCaseCount: 31 }, blocker: /houseBrackmann\.reviewerDistinctValidationCaseCount/ },
    { override: { reviewerObservedAgreementRate: 0.99 }, blocker: /houseBrackmann\.reviewerObservedAgreementRate/ },
    { override: { reviewerAgreementWilsonLowerBound: 0.888 }, blocker: /houseBrackmann\.reviewerAgreementWilsonLowerBound/ },
  ];

  for (const { override, blocker } of mismatchedEvidence) {
    await assert.rejects(
      () => validateStatusArtifacts({
        ...passingStatus,
        clinicalScaleAvailability: {
          ...HOUSE_BRACKMANN_ONLY_CLINICAL_SCALE_AVAILABILITY,
          houseBrackmann: enabledScaleEvidence(override),
        },
      }, {
        readArtifactText: artifactReader({
          [CLINICAL_AGREEMENT_REPORT_PATH]: houseBrackmannOnlyClinicalAgreementReport(),
          [REVIEWER_AGREEMENT_REPORT_PATH]: houseBrackmannOnlyClinicalReviewerAgreementReport(),
          [THRESHOLD_CALIBRATION_REPORT_PATH]: passingThresholdReport(),
        }),
      }),
      blocker,
    );
  }
});

test("validation status artifacts reject reviewer agreement reports with too few paired labels", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport(),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": passingClinicalReviewerAgreementReport({ comparedCount: 12, primaryPairedCount: 12 }),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /clinical scale reviewer agreement report artifacts/,
  );
});

test("validation status artifacts reject reviewer agreement reports with metadata blockers", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport(),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": passingClinicalReviewerAgreementReport({ blockingReasons: ["reviewerA: 1 labels do not meet blinded independent clinical review metadata"] }),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /no excluded reviewer-pair or metadata blockers/,
  );
});

test("validation status artifacts reject reviewer agreement reports with insufficient estimate evidence", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  const reviewerReport = JSON.parse(passingClinicalReviewerAgreementReport());
  reviewerReport.summary.reviewerAInsufficientEstimateEvidenceCount = 1;
  reviewerReport.summary.estimateEvidenceMismatchCount = 1;

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport(),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": JSON.stringify(reviewerReport),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /clinical scale reviewer agreement report artifacts/,
  );
});

test("validation status artifacts reject reviewer agreement reports with duplicate assessment ids", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  const reviewerReport = JSON.parse(passingClinicalReviewerAgreementReport());
  reviewerReport.summary.reviewerADuplicateAssessmentIdCount = 1;
  reviewerReport.summary.reviewerADuplicateAssessmentRowCount = 2;
  reviewerReport.summary.reviewerADuplicateAssessmentIds = ["assessment-1:clinical-scale"];

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport(),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": JSON.stringify(reviewerReport),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /clinical scale reviewer agreement report artifacts/,
  );
});

test("validation status artifacts reject reviewer agreement reports with too few distinct validation cases", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  const reviewerReport = JSON.parse(passingClinicalReviewerAgreementReport());
  reviewerReport.summary.distinctValidationCaseCount = 1;
  reviewerReport.blockingReasons = ["validationCases: needs at least 10 distinct validation cases"];

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport(),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": JSON.stringify(reviewerReport),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /clinical scale reviewer agreement report artifacts/,
  );
});

test("validation status artifacts reject reviewer agreement reports with overlapping reviewer ids", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  const reviewerReport = JSON.parse(passingClinicalReviewerAgreementReport());
  reviewerReport.summary.reviewerBReviewerIds = ["reviewer-a"];
  reviewerReport.summary.reviewerIdOverlapCount = 1;
  reviewerReport.blockingReasons = ["reviewerIdentity: reviewer sheets must use distinct pseudonymous reviewer ids"];

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport(),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": JSON.stringify(reviewerReport),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /reviewer sheets must use distinct pseudonymous reviewer ids|clinical scale reviewer agreement report artifacts/,
  );
});

test("validation status artifacts reject reviewer agreement reports with incomplete enabled-scale inputs", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  const reviewerReport = JSON.parse(passingClinicalReviewerAgreementReport());
  reviewerReport.byScale.sunnybrookComposite.incompleteEstimateInputCount = 1;

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport(),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": JSON.stringify(reviewerReport),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /clinical scale reviewer agreement report artifacts/,
  );
});

test("validation status artifacts reject reviewer agreement reports with excluded reviewer pairs", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  const reviewerReport = JSON.parse(passingClinicalReviewerAgreementReport());
  reviewerReport.summary.eligibleReviewerPairCount = 29;
  reviewerReport.summary.excludedReviewerPairCount = 1;
  reviewerReport.summary.excludedReviewerPairReasons = { "missing reviewer B row": 1 };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport(),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": JSON.stringify(reviewerReport),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /clinical scale reviewer agreement report artifacts/,
  );
});

test("validation status artifacts reject reviewer agreement reports with low Wilson reviewer agreement", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport(),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": passingClinicalReviewerAgreementReport({
          withinToleranceRate: 0.8,
        }),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /clinical scale reviewer agreement report artifacts/,
  );
});

test("validation status artifacts reject reviewer agreement reports with narrow House-Brackmann case mix", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };
  const reviewerReport = JSON.parse(passingClinicalReviewerAgreementReport());
  reviewerReport.summary.houseBrackmannRepresentedSeverityBandCount = 1;
  reviewerReport.summary.houseBrackmannMinimumSameBandPairedLabelCount = 0;
  reviewerReport.houseBrackmannCaseMix.representedSeverityBandCount = 1;
  reviewerReport.houseBrackmannCaseMix.minimumSameBandPairedLabelCount = 0;
  reviewerReport.houseBrackmannCaseMix.severityBands.mild.sameBandPairedCount = 30;
  reviewerReport.houseBrackmannCaseMix.severityBands.moderate.sameBandPairedCount = 0;
  reviewerReport.houseBrackmannCaseMix.severityBands.moderate.meetsMinimum = false;
  reviewerReport.houseBrackmannCaseMix.severityBands.severe.sameBandPairedCount = 0;
  reviewerReport.houseBrackmannCaseMix.severityBands.severe.meetsMinimum = false;
  reviewerReport.houseBrackmannCaseMix.blockingReasons = [
    "needs 3 House-Brackmann severity bands with at least 3 same-band paired reviewer labels",
  ];
  reviewerReport.blockingReasons = [
    "houseBrackmannCaseMix: needs 3 House-Brackmann severity bands with at least 3 same-band paired reviewer labels",
  ];

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport(),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": JSON.stringify(reviewerReport),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /House-Brackmann reviewer severity-band case mix/,
  );
});

test("validation status artifacts reject reviewer agreement reports with cross-severity House-Brackmann disagreements", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };
  const reviewerReport = JSON.parse(passingClinicalReviewerAgreementReport());
  reviewerReport.summary.houseBrackmannCrossSeverityBandDisagreementCount = 1;
  reviewerReport.houseBrackmannCaseMix.crossSeverityBandDisagreementCount = 1;
  reviewerReport.houseBrackmannCaseMix.crossSeverityBandDisagreements = [{
    assessmentId: "assessment-1:clinical-scale",
    reviewerA: "HB II",
    reviewerB: "HB III",
    reviewerASeverityBand: "HB I-II mild/normal",
    reviewerBSeverityBand: "HB III-IV moderate",
  }];

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport(),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": JSON.stringify(reviewerReport),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /House-Brackmann reviewer severity-band case mix/,
  );
});

test("validation status artifacts reject clinical agreement reports with duplicate assessment ids", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport().replace("Duplicate assessment IDs: 0", "Duplicate assessment IDs: 1"),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": passingClinicalReviewerAgreementReport(),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /clinical scale agreement report artifacts/,
  );
});

test("validation status artifacts reject clinical agreement reports with too few distinct validation cases", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport().replace("Distinct validation cases: 30", "Distinct validation cases: 1"),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": passingClinicalReviewerAgreementReport(),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /clinical scale agreement report artifacts/,
  );
});

test("validation status rejects non-date updatedAt values", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      updatedAt: "June 23, 2026",
    }),
    /YYYY-MM-DD/,
  );
});

test("validation status rejects weak clinical scale minimum standards", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      clinicalScaleMinimumStandard: {
        minAgreementRate: 0.8,
        minAgreementWilsonLowerBound: 0.8,
        minReviewedAssessments: 12,
        minDistinctClinicalCases: 10,
        minHouseBrackmannSeverityBands: 3,
        minAssessmentsPerSeverityBand: 3,
        minUsableMovementCoverageRatio: 0.8,
        confidenceInterval: "wilson-95",
        clinicalScaleEstimateVersion: CLINICAL_SCALE_ESTIMATE_VERSION,
        reviewProtocol: "docs/clinical-scale-review-protocol.md",
      },
    }),
    /at least 30/,
  );
});

test("validation status rejects missing clinical scale review protocol", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      clinicalScaleMinimumStandard: {
        minAgreementRate: 0.8,
        minAgreementWilsonLowerBound: 0.8,
        minReviewedAssessments: 30,
        minDistinctClinicalCases: 10,
        minHouseBrackmannSeverityBands: 3,
        minAssessmentsPerSeverityBand: 3,
        minUsableMovementCoverageRatio: 0.8,
        confidenceInterval: "wilson-95",
        clinicalScaleEstimateVersion: CLINICAL_SCALE_ESTIMATE_VERSION,
      },
    }),
    /reviewProtocol/,
  );
});

test("validation status rejects missing clinical review metadata requirements", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      clinicalScaleMinimumStandard: {
        ...BASE_STATUS.clinicalScaleMinimumStandard,
        requiresExplicitClinicalConfidence: false,
      },
    }),
    /requiresExplicitClinicalConfidence/,
  );
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      clinicalScaleMinimumStandard: {
        ...BASE_STATUS.clinicalScaleMinimumStandard,
        requiresIsoReviewTimestamp: false,
      },
    }),
    /requiresIsoReviewTimestamp/,
  );
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      clinicalScaleMinimumStandard: {
        ...BASE_STATUS.clinicalScaleMinimumStandard,
        requiresSourceDatasetSha256: false,
      },
    }),
    /requiresSourceDatasetSha256/,
  );
});

test("validation status rejects stale clinical scale estimator standard", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      clinicalScaleMinimumStandard: {
        ...BASE_STATUS.clinicalScaleMinimumStandard,
        clinicalScaleEstimateVersion: CLINICAL_SCALE_ESTIMATE_VERSION - 1,
      },
    }),
    /clinicalScaleEstimateVersion/,
  );
});

test("validation status rejects weak clinical scale case-mix standards", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      clinicalScaleMinimumStandard: {
        ...BASE_STATUS.clinicalScaleMinimumStandard,
        minDistinctClinicalCases: 3,
      },
    }),
    /minDistinctClinicalCases/,
  );
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      clinicalScaleMinimumStandard: {
        minAgreementRate: 0.8,
        minAgreementWilsonLowerBound: 0.7,
        minReviewedAssessments: 30,
        minDistinctClinicalCases: 10,
        minHouseBrackmannSeverityBands: 3,
        minAssessmentsPerSeverityBand: 3,
        minUsableMovementCoverageRatio: 0.8,
        confidenceInterval: "wilson-95",
        clinicalScaleEstimateVersion: CLINICAL_SCALE_ESTIMATE_VERSION,
        reviewProtocol: "docs/clinical-scale-review-protocol.md",
      },
    }),
    /minAgreementWilsonLowerBound/,
  );
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      clinicalScaleMinimumStandard: {
        minAgreementRate: 0.8,
        minAgreementWilsonLowerBound: 0.8,
        minReviewedAssessments: 30,
        minDistinctClinicalCases: 10,
        minHouseBrackmannSeverityBands: 2,
        minAssessmentsPerSeverityBand: 3,
        minUsableMovementCoverageRatio: 0.8,
        confidenceInterval: "wilson-95",
        clinicalScaleEstimateVersion: CLINICAL_SCALE_ESTIMATE_VERSION,
        reviewProtocol: "docs/clinical-scale-review-protocol.md",
      },
    }),
    /minHouseBrackmannSeverityBands/,
  );
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      clinicalScaleMinimumStandard: {
        minAgreementRate: 0.8,
        minAgreementWilsonLowerBound: 0.8,
        minReviewedAssessments: 30,
        minDistinctClinicalCases: 10,
        minHouseBrackmannSeverityBands: 3,
        minAssessmentsPerSeverityBand: 2,
        minUsableMovementCoverageRatio: 0.8,
        confidenceInterval: "wilson-95",
        clinicalScaleEstimateVersion: CLINICAL_SCALE_ESTIMATE_VERSION,
        reviewProtocol: "docs/clinical-scale-review-protocol.md",
      },
    }),
    /minAssessmentsPerSeverityBand/,
  );
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      clinicalScaleMinimumStandard: {
        ...BASE_STATUS.clinicalScaleMinimumStandard,
        minUsableMovementCoverageRatio: 0.7,
      },
    }),
    /minUsableMovementCoverageRatio/,
  );
});

test("validation status artifacts reject clinical agreement reports for stale estimator versions", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport().replaceAll(`v${CLINICAL_SCALE_ESTIMATE_VERSION}`, `v${CLINICAL_SCALE_ESTIMATE_VERSION - 1}`),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": passingClinicalReviewerAgreementReport(),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /clinical-scale estimator version/,
  );
});

test("validation status rejects calibrated thresholds without reports", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      status: "clinical-scale-agreement-reviewed",
      reviewedDatasetCount: 1,
      reviewedFrameCount: 1200,
      readyExerciseCount: 5,
      productionThresholdConstantsCalibrated: true,
    }),
    /calibration reports/,
  );
});

test("validation status rejects clinical-facing scores without reviewed coverage", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      status: "clinical-scale-agreement-reviewed",
      reviewedDatasetCount: 2,
      reviewedFrameCount: 1200,
      reviewedClinicalScaleAssessmentCount: 30,
      readyExerciseCount: 5,
      clinicalScaleAgreementReports: [CLINICAL_AGREEMENT_REPORT_PATH],
      clinicalScaleReviewerAgreementReports: [REVIEWER_AGREEMENT_REPORT_PATH],
      clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
      thresholdCalibrationReports: [THRESHOLD_CALIBRATION_REPORT_PATH],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
      clinicalFacingScoresAllowed: true,
      clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
    }),
    /calibrated production thresholds/,
  );
});

test("validation status requires explicit per-scale clinical availability decisions", () => {
  const { clinicalScaleAvailability, ...statusWithoutAvailability } = BASE_STATUS;
  assert.equal(clinicalScaleAvailability.houseBrackmann.clinicalFacingScoresAllowed, false);

  assert.throws(
    () => validateStatus(statusWithoutAvailability),
    /clinicalScaleAvailability must be an object/,
  );
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      clinicalScaleAvailability: {
        houseBrackmann: { clinicalFacingScoresAllowed: false },
        sunnybrook: { clinicalFacingScoresAllowed: false },
      },
    }),
    /clinicalScaleAvailability\.eface must be an object/,
  );
});

test("validation status rejects per-scale clinical availability without the global clinical gate", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      clinicalScaleAvailability: {
        houseBrackmann: { clinicalFacingScoresAllowed: true },
        sunnybrook: { clinicalFacingScoresAllowed: false },
        eface: { clinicalFacingScoresAllowed: false },
      },
    }),
    /clinicalScaleAvailability\.houseBrackmann\.clinicalFacingScoresAllowed requires clinicalFacingScoresAllowed true/,
  );
});

test("validation status rejects global clinical-facing availability with no enabled primary scale", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      status: "clinical-scale-agreement-reviewed",
      reviewedDatasetCount: 1,
      reviewedFrameCount: 1200,
      reviewedClinicalScaleAssessmentCount: 30,
      readyExerciseCount: 5,
      clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
      clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
      clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
      thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.md"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
      productionThresholdConstantsCalibrated: true,
      clinicalFacingScoresAllowed: true,
      clinicalScaleAvailability: {
        houseBrackmann: { clinicalFacingScoresAllowed: false },
        sunnybrook: { clinicalFacingScoresAllowed: false },
        eface: { clinicalFacingScoresAllowed: false },
      },
    }),
    /requires at least one clinicalScaleAvailability entry/,
  );
});

test("validation status rejects clinical-facing scores without clinical agreement reports", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      status: "clinical-scale-agreement-reviewed",
      reviewedDatasetCount: 1,
      reviewedFrameCount: 1200,
      reviewedClinicalScaleAssessmentCount: 30,
      readyExerciseCount: 5,
      thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.md"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
      productionThresholdConstantsCalibrated: true,
      clinicalFacingScoresAllowed: true,
      clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
    }),
    /clinicalScaleAvailability\.houseBrackmann\.clinicalAgreementReport/,
  );
});

test("validation status rejects clinical-facing scores without reviewer agreement reports", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      status: "clinical-scale-agreement-reviewed",
      reviewedDatasetCount: 1,
      reviewedFrameCount: 1200,
      reviewedClinicalScaleAssessmentCount: 30,
      readyExerciseCount: 5,
      clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
      thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.md"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
      productionThresholdConstantsCalibrated: true,
      clinicalFacingScoresAllowed: true,
      clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
    }),
    /clinicalScaleAvailability\.houseBrackmann\.reviewerAgreementReport/,
  );
});

test("validation status rejects clinical-facing scores without review package verification reports", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      status: "clinical-scale-agreement-reviewed",
      reviewedDatasetCount: 1,
      reviewedFrameCount: 1200,
      reviewedClinicalScaleAssessmentCount: 30,
      readyExerciseCount: 5,
      clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
      clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
      thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.md"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
      productionThresholdConstantsCalibrated: true,
      clinicalFacingScoresAllowed: true,
      clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
    }),
    /clinicalReviewPackageVerificationReport/,
  );
});

test("validation status rejects clinical agreement reports without reviewed assessment coverage", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      status: "clinical-scale-agreement-reviewed",
      reviewedDatasetCount: 1,
      reviewedClinicalScaleAssessmentCount: 12,
      clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    }),
    /reviewed clinical-scale assessment coverage/,
  );
});

test("validation status artifacts reject clinical agreement reports that do not meet the confidence standard", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport().replace("Status: meets-clinical-scale-confidence-standard", "Status: needs-reviewed-clinical-scale-data"),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": passingClinicalReviewerAgreementReport(),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /every enabled primary scale/,
  );
});

test("validation status artifacts reject clinical agreement reports without blinded independent label controls", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport().replace(/## Reference Standard Controls[\s\S]*?## Reporting Checklist/, "## Reporting Checklist"),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": passingClinicalReviewerAgreementReport(),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /reference-standard controls section/,
  );
});

test("validation status artifacts reject clinical agreement reports without estimate evidence controls", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport()
          .replace("- Minimum usable movement coverage: 80.0%\n", "")
          .replace("- Estimator input provenance: counted current-version rows preserve used/omitted movement IDs, the usable-movements-only calculation flag, House-Brackmann required-input provenance, Sunnybrook/eFACE input-completeness provenance, required/available/missing resting metric keys, and the complete-resting-metrics calculation flag.\n", "")
          .replace("- Estimate evidence control: counted rows require Mirror estimates with status `estimated`, complete/minimum evidence tier, at least 80% usable movement coverage, used/omitted movement IDs, the usable-movements-only calculation flag, Sunnybrook/eFACE input-completeness provenance, complete resting-metric keys, and the complete-resting-metrics calculation flag. House-Brackmann estimates require the gentle eye-closure input. Sunnybrook/eFACE primary comparisons require complete scale-specific movement input. Scale-specific rows with missing, incomplete-input, or invalid estimates are reported in that scale's denominator as missing estimates.\n", ""),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": passingClinicalReviewerAgreementReport(),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /usable movement coverage/,
  );
});

test("validation status artifacts reject clinical agreement reports with too few eligible blinded labels", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport().replace("Eligible blinded independent clinical labels: 30", "Eligible blinded independent clinical labels: 12"),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": passingClinicalReviewerAgreementReport(),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /clinical scale agreement report artifacts/,
  );
});

test("validation status artifacts reject clinical agreement reports with low Wilson lower-bound agreement", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport().replaceAll("88.7%-100.0% 95% Wilson CI", "63.1%-90.0% 95% Wilson CI"),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": passingClinicalReviewerAgreementReport(),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /agreementConfidenceInterval\.lower must match Wilson score lower bound/,
  );
});

test("validation status artifacts reject clinical agreement reports with incomplete HB case mix", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport({ representedSeverityBands: 2 }),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": passingClinicalReviewerAgreementReport(),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /clinical scale agreement report artifacts/,
  );
});

test("validation status artifacts reject clinical agreement reports with too few labels in a required HB band", async () => {
  const status = {
    ...BASE_STATUS,
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    clinicalScaleReviewPackageVerificationReports: [REVIEW_PACKAGE_VERIFICATION_REPORT_PATH],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport().replace("HB I-II mild/normal | 10 | yes", "HB I-II mild/normal | 2 | no"),
        "docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json": passingClinicalReviewerAgreementReport(),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /clinical scale agreement report artifacts/,
  );
});

test("validation status artifacts reject missing calibration artifact coverage", async () => {
  const status = {
    ...BASE_STATUS,
    status: "production-thresholds-calibrated",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    readyExerciseCount: 5,
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: [SOURCE_DATASET_SHA256],
    productionThresholdConstantsCalibrated: true,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport({ readyExercises: 4 }),
      }),
    }),
    /ready exercise coverage/,
  );
});

test("validation status artifacts reject unlisted threshold calibration source hashes", async () => {
  const status = {
    ...BASE_STATUS,
    status: "production-thresholds-calibrated",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    readyExerciseCount: 5,
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    thresholdCalibrationSourceDatasetSha256s: ["b".repeat(64)],
    productionThresholdConstantsCalibrated: true,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /threshold calibration report sourceDatasetSha256 values must be listed/,
  );
});
