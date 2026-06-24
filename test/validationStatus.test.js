import assert from "node:assert/strict";
import test from "node:test";
import { validateStatus, validateStatusArtifacts } from "../scripts/validation-status-check.mjs";
import { CLINICAL_SCALE_ESTIMATE_VERSION } from "../src/domain/clinicalScales.js";

const CURRENT_ESTIMATOR_VERSION_KEY = `v${CLINICAL_SCALE_ESTIMATE_VERSION}`;
const DISABLED_CLINICAL_SCALE_AVAILABILITY = {
  houseBrackmann: { clinicalFacingScoresAllowed: false },
  sunnybrook: { clinicalFacingScoresAllowed: false },
  eface: { clinicalFacingScoresAllowed: false },
};
const ENABLED_CLINICAL_SCALE_AVAILABILITY = {
  houseBrackmann: { clinicalFacingScoresAllowed: true },
  sunnybrook: { clinicalFacingScoresAllowed: true },
  eface: { clinicalFacingScoresAllowed: true },
};
const HOUSE_BRACKMANN_ONLY_CLINICAL_SCALE_AVAILABILITY = {
  houseBrackmann: { clinicalFacingScoresAllowed: true },
  sunnybrook: { clinicalFacingScoresAllowed: false },
  eface: { clinicalFacingScoresAllowed: false },
};

const BASE_STATUS = {
  schemaVersion: 1,
  updatedAt: "2026-06-23",
  status: "tooling-ready-needs-reviewed-data",
  reviewedDatasetCount: 0,
  reviewedFrameCount: 0,
  reviewedClinicalScaleAssessmentCount: 0,
  readyExerciseCount: 0,
  clinicalScaleMinimumStandard: {
    minAgreementRate: 0.8,
    minAgreementWilsonLowerBound: 0.8,
    minReviewedAssessments: 30,
    minHouseBrackmannSeverityBands: 3,
    minAssessmentsPerSeverityBand: 3,
    minUsableMovementCoverageRatio: 0.8,
    confidenceInterval: "wilson-95",
    clinicalScaleEstimateVersion: CLINICAL_SCALE_ESTIMATE_VERSION,
    reviewProtocol: "docs/clinical-scale-review-protocol.md",
  },
  clinicalScaleAgreementReports: [],
  clinicalScaleReviewerAgreementReports: [],
  thresholdCalibrationReports: [],
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
- Minimum usable movement coverage: 80.0%
- Estimator input provenance: counted current-version rows preserve used/omitted movement IDs, the usable-movements-only calculation flag, House-Brackmann required-input provenance, Sunnybrook/eFACE input-completeness provenance, required/available/missing resting metric keys, and the complete-resting-metrics calculation flag.

## Dataset Summary

- Assessment clinical-scale records: ${reviewedCount}
- Unique assessment clinical-scale records: ${reviewedCount}
- Duplicate assessment IDs: 0
- Rows missing assessment IDs: 0
- Reviewed clinical-scale assessments: ${reviewedCount}
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
- Blinding control: counted labels require \`sourceLabelSheetMode: blinded\` and \`reviewBlinded\` to show Mirror estimates were hidden before target assignment.
- Unique assessment control: counted labels require one stable assessment id per reviewed clinical-scale row; duplicate or missing assessment ids are excluded and block release readiness.
- Estimator version control: counted labels require clinical-scale estimator version v${CLINICAL_SCALE_ESTIMATE_VERSION}.
- Estimate evidence control: counted rows require Mirror estimates with status \`estimated\`, complete/minimum evidence tier, at least 80% usable movement coverage, used/omitted movement IDs, the usable-movements-only calculation flag, Sunnybrook/eFACE input-completeness provenance, complete resting-metric keys, and the complete-resting-metrics calculation flag. House-Brackmann estimates require the gentle eye-closure input. Sunnybrook/eFACE primary comparisons require complete scale-specific movement input. Scale-specific rows with missing, incomplete-input, or invalid estimates are reported in that scale's denominator as missing estimates.
- Independence control: counted labels require clinician-assigned or adjudicated \`labelSource\` metadata, not Mirror/copied/algorithmic labels.
- Reviewer control: counted labels require a recognized clinical/adjudication role and are excluded when confidence is uncertain.
- Validity control: counted scale labels require a valid in-range target for that specific primary scale; missing targets do not remove otherwise valid labels from other scale denominators.

## Reporting Checklist

- Reference standard: blinded clinician-assigned House-Brackmann, Sunnybrook, and eFACE labels from \`docs/clinical-scale-review-protocol.md\`.
- Reference standard controls: \`sourceLabelSheetMode\`, \`reviewBlinded\`, estimator \`version\`, estimate evidence tier/coverage/input-provenance controls, \`labelSource\`, and clinical \`reviewerRole\` must pass before any row counts. Primary target fields then count only for the scale where a valid target is present.
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

function passingThresholdReport({ readyExercises = 5 } = {}) {
  return JSON.stringify({
    kind: "mirror-threshold-calibration-report",
    generatedAt: "2026-06-24T00:00:00.000Z",
    summary: {
      exercises: readyExercises,
      readyExercises,
      needsMoreLabels: 0,
    },
    exercises: [],
    note: "Recommendations require clinician/user/developer-reviewed labels and should be reviewed before changing production constants.",
  });
}

function passingClinicalReviewerAgreementReport({
  comparedCount = 30,
  primaryPairedCount = 30,
  blockingReasons = [],
  withinToleranceRate = 1,
  wilsonLower = 0.887,
} = {}) {
  const withinToleranceCount = Math.round(primaryPairedCount * withinToleranceRate);
  const sameBandCount = Math.floor(primaryPairedCount / 3);
  const representedSeverityBandCount = sameBandCount >= 3 ? 3 : 0;
  return JSON.stringify({
    kind: "mirror-clinical-scale-reviewer-agreement-report",
    generatedAt: "2026-06-24T00:00:00.000Z",
    reviewerA: "clinician-a",
    reviewerB: "clinician-b",
    standard: {
      minAgreementRate: 0.8,
      minAgreementWilsonLowerBound: 0.8,
      minPairedLabels: 30,
      minHouseBrackmannSeverityBands: 3,
      minAssessmentsPerSeverityBand: 3,
      minUsableMovementCoverageRatio: 0.8,
      requiresV3MovementProvenance: true,
      requiresV4RestingMetricProvenance: true,
      requiresHouseBrackmannRequiredInput: true,
      requiresV5ScaleInputProvenance: true,
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
        withinToleranceConfidenceInterval: { method: "wilson-score", confidenceLevel: 0.95, lower: wilsonLower, upper: 1 },
        meetsMinimumStandard: withinToleranceRate >= 0.8 && wilsonLower >= 0.8,
        blockingReasons: [],
      },
      sunnybrookComposite: {
        pairedCount: primaryPairedCount,
        incompleteEstimateInputCount: 0,
        exactMatchCount: withinToleranceCount,
        withinToleranceCount,
        withinToleranceRate,
        withinToleranceConfidenceInterval: { method: "wilson-score", confidenceLevel: 0.95, lower: wilsonLower, upper: 1 },
        meetsMinimumStandard: withinToleranceRate >= 0.8 && wilsonLower >= 0.8,
        blockingReasons: [],
      },
      efaceTotal: {
        pairedCount: primaryPairedCount,
        incompleteEstimateInputCount: 0,
        exactMatchCount: withinToleranceCount,
        withinToleranceCount,
        withinToleranceRate,
        withinToleranceConfidenceInterval: { method: "wilson-score", confidenceLevel: 0.95, lower: wilsonLower, upper: 1 },
        meetsMinimumStandard: withinToleranceRate >= 0.8 && wilsonLower >= 0.8,
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
      withinToleranceCount: 20,
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.md"],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
  });
  assert.equal(status.clinicalFacingScoresAllowed, true);
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
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
  assert.equal(result.artifacts.clinicalAgreementReports[0].eligibleBlindedIndependentLabelCount, 30);
  assert.equal(result.artifacts.clinicalAgreementReports[0].clinicalScaleEstimateVersion, CLINICAL_SCALE_ESTIMATE_VERSION);
  assert.equal(result.artifacts.clinicalAgreementReports[0].minimumUsableMovementCoverageRatio, 0.8);
  assert.equal(result.artifacts.clinicalAgreementReports[0].representedHouseBrackmannSeverityBandCount, 3);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].comparedAssessmentCount, 30);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].eligibleReviewerPairCount, 30);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].excludedReviewerPairCount, 0);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].minimumPrimaryPairedCount, 30);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].minimumPrimaryAgreementRate, 1);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].minimumPrimaryAgreementWilsonLowerBound, 0.887);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].reviewerAInsufficientEstimateEvidenceCount, 0);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].reviewerBInsufficientEstimateEvidenceCount, 0);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].estimateEvidenceMismatchCount, 0);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].representedHouseBrackmannSeverityBandCount, 3);
  assert.equal(result.artifacts.clinicalReviewerAgreementReports[0].minimumHouseBrackmannSeverityBandLabelCount, 10);
  assert.equal(result.artifacts.thresholdCalibrationReports[0].readyExerciseCount, 5);
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
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
          wilsonLower: 0.63,
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
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
        minAgreementRate: 0.8,
        minAgreementWilsonLowerBound: 0.7,
        minReviewedAssessments: 30,
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
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
      reviewedDatasetCount: 1,
      reviewedFrameCount: 1200,
      reviewedClinicalScaleAssessmentCount: 30,
      readyExerciseCount: 5,
      clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
      clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
      thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.md"],
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
      reviewedDatasetCount: 1,
      reviewedFrameCount: 1200,
      reviewedClinicalScaleAssessmentCount: 30,
      readyExerciseCount: 5,
      thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.md"],
      productionThresholdConstantsCalibrated: true,
      clinicalFacingScoresAllowed: true,
      clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
    }),
    /clinical scale agreement reports/,
  );
});

test("validation status rejects clinical-facing scores without reviewer agreement reports", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      reviewedDatasetCount: 1,
      reviewedFrameCount: 1200,
      reviewedClinicalScaleAssessmentCount: 30,
      readyExerciseCount: 5,
      clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
      thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.md"],
      productionThresholdConstantsCalibrated: true,
      clinicalFacingScoresAllowed: true,
      clinicalScaleAvailability: ENABLED_CLINICAL_SCALE_AVAILABILITY,
    }),
    /clinical scale reviewer agreement reports/,
  );
});

test("validation status rejects clinical agreement reports without reviewed assessment coverage", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
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
    /Wilson lower-bound agreement/,
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
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
