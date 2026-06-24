import assert from "node:assert/strict";
import test from "node:test";
import { validateStatus, validateStatusArtifacts } from "../scripts/validation-status-check.mjs";

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
    confidenceInterval: "wilson-95",
    reviewProtocol: "docs/clinical-scale-review-protocol.md",
  },
  clinicalScaleAgreementReports: [],
  thresholdCalibrationReports: [],
  productionThresholdConstantsCalibrated: false,
  clinicalFacingScoresAllowed: false,
};

function passingClinicalAgreementReport({ reviewedCount = 30, readyPrimaryScales = 3, representedSeverityBands = 3 } = {}) {
  return `# Mirror Clinical Scale Agreement Report

Generated: 2026-06-24T00:00:00.000Z
Status: meets-clinical-scale-confidence-standard
Recommendation: allow-controlled-estimate-availability-after-human-review

## Dataset Summary

- Reviewed clinical-scale assessments: ${reviewedCount}
- Ready primary scales: ${readyPrimaryScales}/3

## Primary Scale Agreement

| Scale | Tolerance | Labels | Missing estimates | Within tolerance | Agreement | Wilson interval | Mean absolute delta | Status |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| House-Brackmann | within one grade | 30 | 0 | 30 | 100.0% | 88.7%-100.0% 95% Wilson CI | 0.5 | meets-confidence-standard |
| Sunnybrook composite | within 10 points | 30 | 0 | 30 | 100.0% | 88.7%-100.0% 95% Wilson CI | 4.0 | meets-confidence-standard |
| eFACE total | within 10 points | 30 | 0 | 30 | 100.0% | 88.7%-100.0% 95% Wilson CI | 4.0 | meets-confidence-standard |

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
- Independence control: counted labels require clinician-assigned or adjudicated \`labelSource\` metadata, not Mirror/copied/algorithmic labels.
- Reviewer control: counted labels require a recognized clinical/adjudication role and are excluded when confidence is uncertain.
- Validity control: counted labels require valid primary House-Brackmann, Sunnybrook composite, and eFACE total targets.

## Reporting Checklist

- Reference standard: blinded clinician-assigned House-Brackmann, Sunnybrook, and eFACE labels from \`docs/clinical-scale-review-protocol.md\`.
- Reference standard controls: \`sourceLabelSheetMode\`, \`reviewBlinded\`, \`labelSource\`, clinical \`reviewerRole\`, and valid primary target fields must be present before rows count toward readiness.
- Release control: this report alone cannot enable clinical-facing scores; \`docs/validation-status.json\` must be reviewed and updated separately.
`;
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

function artifactReader(artifacts) {
  return async (path) => {
    if (Object.hasOwn(artifacts, path)) return artifacts[path];
    throw new Error(`missing fixture: ${path}`);
  };
}

test("validation status accepts explicit unvalidated tooling-ready state", () => {
  const status = validateStatus(BASE_STATUS);
  assert.equal(status.status, "tooling-ready-needs-reviewed-data");
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.md"],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
  };

  const result = await validateStatusArtifacts(status, {
    readArtifactText: artifactReader({
      "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport(),
      "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
    }),
  });

  assert.equal(result.status.clinicalFacingScoresAllowed, true);
  assert.equal(result.artifacts.clinicalAgreementReports[0].reviewedClinicalScaleAssessmentCount, 30);
  assert.equal(result.artifacts.clinicalAgreementReports[0].eligibleBlindedIndependentLabelCount, 30);
  assert.equal(result.artifacts.clinicalAgreementReports[0].representedHouseBrackmannSeverityBandCount, 3);
  assert.equal(result.artifacts.thresholdCalibrationReports[0].readyExerciseCount, 5);
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
        confidenceInterval: "wilson-95",
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
        confidenceInterval: "wilson-95",
      },
    }),
    /reviewProtocol/,
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
        confidenceInterval: "wilson-95",
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
        confidenceInterval: "wilson-95",
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
        confidenceInterval: "wilson-95",
        reviewProtocol: "docs/clinical-scale-review-protocol.md",
      },
    }),
    /minAssessmentsPerSeverityBand/,
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
    }),
    /calibrated production thresholds/,
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
    }),
    /clinical scale agreement reports/,
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport().replace("Status: meets-clinical-scale-confidence-standard", "Status: needs-reviewed-clinical-scale-data"),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /passing clinical-scale readiness status/,
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport().replace(/## Reference Standard Controls[\s\S]*?## Reporting Checklist/, "## Reporting Checklist"),
        "docs/validation/threshold-calibration-2026-06-23.json": passingThresholdReport(),
      }),
    }),
    /reference-standard controls section/,
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport().replace("Eligible blinded independent clinical labels: 30", "Eligible blinded independent clinical labels: 12"),
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport().replaceAll("88.7%-100.0% 95% Wilson CI", "63.1%-90.0% 95% Wilson CI"),
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport({ representedSeverityBands: 2 }),
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
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
  };

  await assert.rejects(
    () => validateStatusArtifacts(status, {
      readArtifactText: artifactReader({
        "docs/validation/clinical-scale-agreement-2026-06-24.md": passingClinicalAgreementReport().replace("HB I-II mild/normal | 10 | yes", "HB I-II mild/normal | 2 | no"),
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
