import assert from "node:assert/strict";
import test from "node:test";
import validationStatus from "../docs/validation-status.json" with { type: "json" };
import {
  clinicalFacingScaleStatusEligible,
  clinicalFacingStatusEligible,
  clinicalScaleReleaseEvidenceBlockers,
  clinicalScaleReleaseEvidenceEligible,
  clinicalScaleReleaseStatusBlockers,
  clinicalScaleReleaseStatusEligible,
  clinicalScaleValidationStandardBlockers,
  clinicalScaleValidationStandardEligible,
  compactClinicalScaleValueLabel,
  clinicalScalePresentationPolicy,
  DEFAULT_VALIDATION_STATUS,
  scaleNounForClinicalScale,
} from "../src/domain/clinicalScalePresentation.js";
import { buildSessionReportHtml, clinicalScaleEstimateRows } from "../src/reports/sessionReport.js";

const RESTING_METRICS = {
  version: 1,
  averageAsymmetryRatio: 0.08,
  metrics: {
    palpebralFissure: { label: "Palpebral fissure", userLeft: 0.044, userRight: 0.046, asymmetryRatio: 0.04, narrowerSide: "left" },
    nasolabialMidface: { label: "Nasolabial/midface proxy", userLeft: 0.062, userRight: 0.064, asymmetryRatio: 0.03, smallerSide: "left" },
    oralCommissure: { label: "Oral commissure vertical position", userLeft: 0.58, userRight: 0.59, asymmetryRatio: 0.02, lowerSide: "left" },
  },
};

function movementScore(exerciseId, ratio) {
  return {
    exerciseId,
    initialMovementProgress: { affectedProgressRatio: ratio },
    captureQuality: { key: "strong" },
    movementFeatures: { coactivation: { risk: "low", score: 0.02 } },
    scores: [ratio],
  };
}

function clinicalScaleMinimumStandard(overrides = {}) {
  return {
    ...validationStatus.clinicalScaleMinimumStandard,
    ...overrides,
  };
}

function reviewedClinicalScaleStatus(clinicalScaleAvailability) {
  return {
    schemaVersion: 1,
    updatedAt: "2026-06-24",
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleMinimumStandard: clinicalScaleMinimumStandard(),
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability,
  };
}

test("clinical scale presentation policy defaults to the repo validation status", () => {
  assert.equal(DEFAULT_VALIDATION_STATUS.clinicalFacingScoresAllowed, validationStatus.clinicalFacingScoresAllowed);
  assert.equal(validationStatus.clinicalFacingScoresAllowed, false);
  assert.equal(clinicalFacingStatusEligible(), false);
  assert.equal(clinicalFacingScaleStatusEligible(undefined, "houseBrackmann"), false);
  assert.equal(clinicalScaleValidationStandardEligible(), true);
  assert.deepEqual(clinicalScaleValidationStandardBlockers(), []);

  const policy = clinicalScalePresentationPolicy();

  assert.equal(policy.mode, "mirror-estimate");
  assert.equal(policy.requestedClinicalFacingScoresAllowed, false);
  assert.equal(policy.primaryClinicalScaleSupportCount, 0);
  assert.equal(policy.scaleAvailability.houseBrackmann.clinicalFacingScoresAllowed, false);
  assert.equal(policy.badgeLabel, "Estimate");
  assert.match(policy.shortNotice, /not clinician-assigned/);
  assert.match(policy.reportNotice, /not clinician-assigned or validated clinical grades/);
});

test("clinical scale presentation policy does not switch copy for a boolean-only status change", () => {
  const policy = clinicalScalePresentationPolicy({
    status: "validated-clinical-scale-support",
    clinicalFacingScoresAllowed: true,
  });

  assert.equal(policy.requestedClinicalFacingScoresAllowed, true);
  assert.equal(policy.clinicalFacingScoresAllowed, false);
  assert.equal(policy.mode, "mirror-estimate");
  assert.equal(policy.badgeLabel, "Estimate");
  assert.match(policy.shortNotice, /not clinician-assigned/);
});

test("clinical scale presentation policy switches copy only with complete release status evidence", () => {
  const status = {
    schemaVersion: 1,
    updatedAt: "2026-06-24",
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleMinimumStandard: clinicalScaleMinimumStandard(),
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: {
      houseBrackmann: { clinicalFacingScoresAllowed: true },
      sunnybrook: { clinicalFacingScoresAllowed: true },
      eface: { clinicalFacingScoresAllowed: true },
    },
  };
  const policy = clinicalScalePresentationPolicy(status);

  assert.equal(clinicalFacingStatusEligible(status), true);
  assert.equal(policy.mode, "clinical-facing-supported");
  assert.equal(policy.validationReleaseStatusEligible, true);
  assert.equal(policy.validationReleaseEvidenceEligible, true);
  assert.equal(policy.validationStandardEligible, true);
  assert.equal(policy.badgeLabel, "Validated");
  assert.equal(policy.scaleNoun, "support value");
  assert.match(policy.shortNotice, /validation gate/);
  assert.match(policy.reportNotice, /clinician interpretation/);
});

test("clinical scale presentation policy fails closed when release evidence is incomplete", () => {
  const passingStatus = reviewedClinicalScaleStatus({
    houseBrackmann: { clinicalFacingScoresAllowed: true },
    sunnybrook: { clinicalFacingScoresAllowed: true },
    eface: { clinicalFacingScoresAllowed: true },
  });

  const weakEvidence = [
    { schemaVersion: 2, blocker: /schemaVersion/ },
    { updatedAt: "06-24-2026", blocker: /updatedAt/ },
    { reviewedDatasetCount: 0, blocker: /reviewedDatasetCount/ },
    { reviewedFrameCount: 0, blocker: /reviewedFrameCount/ },
    { readyExerciseCount: 0, blocker: /readyExerciseCount/ },
    { reviewedClinicalScaleAssessmentCount: 29, blocker: /reviewedClinicalScaleAssessmentCount/ },
    { clinicalScaleAgreementReports: [], blocker: /clinicalScaleAgreementReports/ },
    { clinicalScaleReviewerAgreementReports: [], blocker: /clinicalScaleReviewerAgreementReports/ },
    { thresholdCalibrationReports: [], blocker: /thresholdCalibrationReports/ },
  ];

  for (const weakStatusFields of weakEvidence) {
    const { blocker, ...override } = weakStatusFields;
    const status = {
      ...passingStatus,
      ...override,
    };
    const policy = clinicalScalePresentationPolicy(status);

    assert.equal(clinicalFacingStatusEligible(status), false);
    assert.equal(clinicalScaleReleaseEvidenceEligible(status), false);
    assert.match(clinicalScaleReleaseEvidenceBlockers(status).join("\n"), blocker);
    assert.equal(policy.validationReleaseEvidenceEligible, false);
    assert.match(policy.validationReleaseEvidenceBlockers.join("\n"), blocker);
    assert.equal(policy.mode, "mirror-estimate");
    assert.equal(policy.anyClinicalScaleSupportAllowed, false);
    assert.equal(policy.badgeLabel, "Estimate");
  }
});

test("clinical scale presentation policy fails closed when release status is contradictory", () => {
  const status = {
    ...reviewedClinicalScaleStatus({
      houseBrackmann: { clinicalFacingScoresAllowed: true },
      sunnybrook: { clinicalFacingScoresAllowed: true },
      eface: { clinicalFacingScoresAllowed: true },
    }),
    status: "tooling-ready-needs-reviewed-data",
  };
  const policy = clinicalScalePresentationPolicy(status);

  assert.equal(clinicalFacingStatusEligible(status), false);
  assert.equal(clinicalScaleReleaseStatusEligible(status), false);
  assert.match(clinicalScaleReleaseStatusBlockers(status).join("\n"), /clinical-scale-agreement-reviewed/);
  assert.equal(policy.validationReleaseStatusEligible, false);
  assert.match(policy.validationReleaseStatusBlockers.join("\n"), /clinical-scale-agreement-reviewed/);
  assert.equal(policy.mode, "mirror-estimate");
  assert.equal(policy.anyClinicalScaleSupportAllowed, false);
  assert.equal(policy.badgeLabel, "Estimate");
  assert.match(policy.shortNotice, /not clinician-assigned/);
});

test("clinical scale presentation policy fails closed when the runtime validation standard is weak", () => {
  const passingStatus = reviewedClinicalScaleStatus({
    houseBrackmann: { clinicalFacingScoresAllowed: true },
    sunnybrook: { clinicalFacingScoresAllowed: true },
    eface: { clinicalFacingScoresAllowed: true },
  });

  const weakStandards = [
    { minReviewedAssessments: 29, blocker: /minReviewedAssessments/ },
    { minDistinctClinicalCases: 9, blocker: /minDistinctClinicalCases/ },
    { minAgreementRate: 0.79, blocker: /minAgreementRate/ },
    { minAgreementWilsonLowerBound: 0.79, blocker: /minAgreementWilsonLowerBound/ },
    { minUsableMovementCoverageRatio: 0.79, blocker: /minUsableMovementCoverageRatio/ },
    { minHouseBrackmannSeverityBands: 2, blocker: /minHouseBrackmannSeverityBands/ },
    { minAssessmentsPerSeverityBand: 2, blocker: /minAssessmentsPerSeverityBand/ },
    { confidenceInterval: "wald-95", blocker: /confidenceInterval/ },
    { clinicalScaleEstimateVersion: validationStatus.clinicalScaleMinimumStandard.clinicalScaleEstimateVersion - 1, blocker: /clinicalScaleEstimateVersion/ },
    { reviewProtocol: "docs/other-protocol.md", blocker: /reviewProtocol/ },
  ];

  for (const weakStandard of weakStandards) {
    const { blocker, ...override } = weakStandard;
    const status = {
      ...passingStatus,
      clinicalScaleMinimumStandard: clinicalScaleMinimumStandard(override),
    };
    const policy = clinicalScalePresentationPolicy(status);

    assert.equal(clinicalFacingStatusEligible(status), false);
    assert.equal(clinicalScaleValidationStandardEligible(status), false);
    assert.match(clinicalScaleValidationStandardBlockers(status).join("\n"), blocker);
    assert.equal(policy.validationStandardEligible, false);
    assert.match(policy.validationStandardBlockers.join("\n"), blocker);
    assert.equal(policy.mode, "mirror-estimate");
    assert.equal(policy.anyClinicalScaleSupportAllowed, false);
    assert.equal(policy.badgeLabel, "Estimate");
  }
});

test("clinical scale presentation policy requires explicit per-scale availability flags", () => {
  const status = {
    schemaVersion: 1,
    updatedAt: "2026-06-24",
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleMinimumStandard: clinicalScaleMinimumStandard(),
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
  };
  const policy = clinicalScalePresentationPolicy(status);

  assert.equal(clinicalFacingStatusEligible(status), true);
  assert.equal(clinicalFacingScaleStatusEligible(status, "houseBrackmann"), false);
  assert.equal(policy.mode, "mirror-estimate");
  assert.equal(policy.anyClinicalScaleSupportAllowed, false);
  assert.equal(policy.primaryClinicalScaleSupportCount, 0);
  assert.equal(policy.scaleAvailability.houseBrackmann.requestedClinicalFacingScoresAllowed, false);
  assert.match(policy.shortNotice, /not clinician-assigned/);
});

test("clinical scale presentation policy can keep individual scales as estimates", () => {
  const status = {
    schemaVersion: 1,
    updatedAt: "2026-06-24",
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleMinimumStandard: clinicalScaleMinimumStandard(),
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: {
      houseBrackmann: { clinicalFacingScoresAllowed: true },
      sunnybrook: { clinicalFacingScoresAllowed: false },
      eface: { clinicalFacingScoresAllowed: true },
    },
  };
  const policy = clinicalScalePresentationPolicy(status);

  assert.equal(policy.mode, "mixed-clinical-scale-support");
  assert.equal(policy.clinicalFacingScoresAllowed, false);
  assert.equal(policy.anyClinicalScaleSupportAllowed, true);
  assert.equal(policy.primaryClinicalScaleSupportCount, 2);
  assert.equal(clinicalFacingScaleStatusEligible(status, "sunnybrook"), false);
  assert.equal(clinicalFacingScaleStatusEligible(status, "houseBrackmann"), true);
  assert.equal(scaleNounForClinicalScale(policy, "houseBrackmann"), "support value");
  assert.equal(scaleNounForClinicalScale(policy, "sunnybrook"), "estimate");
  assert.match(policy.shortNotice, /remaining values are Mirror estimates/);
});

test("compact clinical scale labels include validation-aware per-scale nouns", () => {
  const scales = {
    houseBrackmann: { grade: "II", label: "Mild dysfunction" },
    sunnybrook: {
      compositeScore: 86,
      voluntaryMovementScore: 88,
      restingSymmetryScore: 0,
      synkinesisScore: 2,
    },
    eface: {
      totalScore: 89,
      staticScore: 93,
      dynamicScore: 84,
      synkinesisScore: 90,
    },
  };

  assert.equal(compactClinicalScaleValueLabel(scales), "HB II estimate · SB 86 estimate · eFACE 89 estimate");

  const mixedPolicy = clinicalScalePresentationPolicy(reviewedClinicalScaleStatus({
    houseBrackmann: { clinicalFacingScoresAllowed: true },
    sunnybrook: { clinicalFacingScoresAllowed: false },
    eface: { clinicalFacingScoresAllowed: true },
  }));

  assert.equal(compactClinicalScaleValueLabel(scales, mixedPolicy), "HB II support · SB 86 estimate · eFACE 89 support");
});

test("clinical scale report rows and printable reports use the validation-aware estimate wording", () => {
  const clinicalScales = {
    status: "estimated",
    coverage: {
      usableMovementCount: 5,
      requiredMovementCount: 5,
      ratio: 1,
    },
    evidence: {
      tier: "complete-standard-assessment",
      label: "Complete standard-assessment evidence",
      requiredRestingMetricKeys: ["palpebralFissure", "nasolabialMidface", "oralCommissure"],
      availableRestingMetricKeys: ["palpebralFissure", "nasolabialMidface", "oralCommissure"],
      missingRestingMetricKeys: [],
      completeRestingMetrics: true,
    },
    scales: {
      houseBrackmann: { grade: "II", label: "Mild dysfunction" },
      sunnybrook: {
        compositeScore: 86,
        voluntaryMovementScore: 88,
        restingSymmetryScore: 0,
        synkinesisScore: 2,
      },
      eface: {
        totalScore: 89,
        staticScore: 93,
        dynamicScore: 84,
        synkinesisScore: 90,
      },
    },
  };

  const rows = clinicalScaleEstimateRows(clinicalScales);
  assert.match(rows[0], /House-Brackmann estimate/);
  assert.match(rows[1], /Sunnybrook estimate/);
  assert.match(rows.join(" "), /Evidence tier: Complete standard-assessment evidence/);
  assert.match(rows.join(" "), /Resting evidence: 3\/3 required resting metrics available/);

  const minimumRows = clinicalScaleEstimateRows({
    ...clinicalScales,
    coverage: {
      usableMovementCount: 4,
      requiredMovementCount: 5,
      ratio: 0.8,
      unusableExerciseIds: ["pucker"],
    },
    evidence: {
      tier: "minimum-standard-assessment",
      label: "Minimum standard-assessment evidence",
      omittedMovementExerciseIds: ["pucker"],
      requiredRestingMetricKeys: ["palpebralFissure", "nasolabialMidface", "oralCommissure"],
      availableRestingMetricKeys: ["palpebralFissure", "nasolabialMidface", "oralCommissure"],
      missingRestingMetricKeys: [],
      completeRestingMetrics: true,
      scaleInputCompleteness: {
        houseBrackmann: {
          requiredExerciseIds: ["eye-close"],
          usedExerciseIds: ["eyebrow-raise", "eye-close", "open-smile", "nose-wrinkle"],
          missingRequiredExerciseIds: [],
          complete: true,
        },
        sunnybrook: {
          usedMovementCount: 4,
          requiredMovementCount: 5,
          usedExerciseIds: ["eyebrow-raise", "eye-close", "open-smile", "nose-wrinkle"],
          omittedExerciseIds: ["pucker"],
          complete: false,
        },
        eface: {
          usedMovementCount: 4,
          requiredMovementCount: 5,
          usedExerciseIds: ["eyebrow-raise", "eye-close", "open-smile", "nose-wrinkle"],
          omittedExerciseIds: ["pucker"],
          complete: false,
        },
      },
    },
  });
  assert.match(minimumRows.join(" "), /Omitted from scale formulas: Lip pucker/);
  assert.match(minimumRows.join(" "), /Sunnybrook input: 4\/5 standard movements used; omitted Lip pucker/);
  assert.match(minimumRows.join(" "), /eFACE-style input: 4\/5 standard movements used; omitted Lip pucker/);

  const houseBrackmannGapRows = clinicalScaleEstimateRows({
    ...clinicalScales,
    coverage: {
      usableMovementCount: 4,
      requiredMovementCount: 5,
      ratio: 0.8,
      unusableExerciseIds: ["eye-close"],
    },
    evidence: {
      tier: "minimum-standard-assessment",
      label: "Minimum standard-assessment evidence",
      omittedMovementExerciseIds: ["eye-close"],
      requiredRestingMetricKeys: ["palpebralFissure", "nasolabialMidface", "oralCommissure"],
      availableRestingMetricKeys: ["palpebralFissure", "nasolabialMidface", "oralCommissure"],
      missingRestingMetricKeys: [],
      completeRestingMetrics: true,
      scaleInputCompleteness: {
        houseBrackmann: {
          requiredExerciseIds: ["eye-close"],
          usedExerciseIds: ["eyebrow-raise", "open-smile", "nose-wrinkle", "pucker"],
          missingRequiredExerciseIds: ["eye-close"],
          complete: false,
        },
        sunnybrook: {
          usedMovementCount: 4,
          requiredMovementCount: 5,
          usedExerciseIds: ["eyebrow-raise", "open-smile", "nose-wrinkle", "pucker"],
          omittedExerciseIds: ["eye-close"],
          complete: false,
        },
        eface: {
          usedMovementCount: 4,
          requiredMovementCount: 5,
          usedExerciseIds: ["eyebrow-raise", "open-smile", "nose-wrinkle", "pucker"],
          omittedExerciseIds: ["eye-close"],
          complete: false,
        },
      },
    },
    scales: {
      sunnybrook: clinicalScales.scales.sunnybrook,
      eface: clinicalScales.scales.eface,
    },
  });
  assert.doesNotMatch(houseBrackmannGapRows.join(" "), /House-Brackmann estimate: Grade/);
  assert.match(houseBrackmannGapRows.join(" "), /House-Brackmann estimate unavailable: requires Gentle eye closure/);
  assert.match(houseBrackmannGapRows.join(" "), /Sunnybrook estimate/);
  assert.match(houseBrackmannGapRows.join(" "), /eFACE-style estimate/);
  assert.match(houseBrackmannGapRows.join(" "), /Sunnybrook input: 4\/5 standard movements used; omitted Gentle eye closure/);

  const supportedRows = clinicalScaleEstimateRows(clinicalScales, clinicalScalePresentationPolicy({
    schemaVersion: 1,
    updatedAt: "2026-06-24",
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleMinimumStandard: clinicalScaleMinimumStandard(),
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: {
      houseBrackmann: { clinicalFacingScoresAllowed: true },
      sunnybrook: { clinicalFacingScoresAllowed: true },
      eface: { clinicalFacingScoresAllowed: true },
    },
  }));
  assert.match(supportedRows[0], /House-Brackmann support value/);

  const mixedRows = clinicalScaleEstimateRows(clinicalScales, clinicalScalePresentationPolicy({
    schemaVersion: 1,
    updatedAt: "2026-06-24",
    status: "clinical-scale-agreement-reviewed",
    reviewedDatasetCount: 2,
    reviewedFrameCount: 1200,
    reviewedClinicalScaleAssessmentCount: 30,
    readyExerciseCount: 5,
    clinicalScaleMinimumStandard: clinicalScaleMinimumStandard(),
    clinicalScaleAgreementReports: ["docs/validation/clinical-scale-agreement-2026-06-24.md"],
    clinicalScaleReviewerAgreementReports: ["docs/validation/clinical-scale-reviewer-agreement-2026-06-24.json"],
    thresholdCalibrationReports: ["docs/validation/threshold-calibration-2026-06-23.json"],
    productionThresholdConstantsCalibrated: true,
    clinicalFacingScoresAllowed: true,
    clinicalScaleAvailability: {
      houseBrackmann: { clinicalFacingScoresAllowed: true },
      sunnybrook: { clinicalFacingScoresAllowed: false },
      eface: { clinicalFacingScoresAllowed: true },
    },
  }));
  assert.match(mixedRows[0], /House-Brackmann support value/);
  assert.match(mixedRows[1], /Sunnybrook estimate/);
  assert.match(mixedRows[2], /eFACE-style support value/);

  const html = buildSessionReportHtml({
    kind: "assessment",
    date: "2026-06-24",
    ts: Date.parse("2026-06-24T09:00:00Z"),
    duration: 70,
    sessionAvg: 0.82,
    restingMetrics: RESTING_METRICS,
    scores: [
      movementScore("eyebrow-raise", 0.94),
      movementScore("eye-close", 0.92),
      movementScore("open-smile", 0.88),
      movementScore("nose-wrinkle", 0.84),
      movementScore("pucker", 0.86),
    ],
  });

  assert.match(html, /Clinical scale estimates/);
  assert.match(html, /House-Brackmann estimate/);
  assert.match(html, /Evidence tier: Complete standard-assessment evidence/);
  assert.match(html, /Resting evidence: 3\/3 required resting metrics available/);
  assert.match(html, /These are Mirror estimates only/);

  const missingEyeClosureHtml = buildSessionReportHtml({
    kind: "assessment",
    date: "2026-06-24",
    ts: Date.parse("2026-06-24T09:00:00Z"),
    duration: 70,
    sessionAvg: 0.82,
    restingMetrics: RESTING_METRICS,
    scores: [
      movementScore("eyebrow-raise", 0.94),
      movementScore("open-smile", 0.88),
      movementScore("nose-wrinkle", 0.84),
      movementScore("pucker", 0.86),
    ],
  });

  assert.doesNotMatch(missingEyeClosureHtml, /House-Brackmann estimate: Grade/);
  assert.match(missingEyeClosureHtml, /House-Brackmann estimate unavailable: requires Gentle eye closure/);
  assert.match(missingEyeClosureHtml, /Sunnybrook estimate/);
  assert.match(missingEyeClosureHtml, /eFACE-style estimate/);
  assert.match(missingEyeClosureHtml, /Sunnybrook input: 4\/5 standard movements used; omitted Gentle eye closure/);
  assert.match(missingEyeClosureHtml, /eFACE-style input: 4\/5 standard movements used; omitted Gentle eye closure/);

  const hiddenHtml = buildSessionReportHtml({
    kind: "assessment",
    date: "2026-06-24",
    ts: Date.parse("2026-06-24T09:00:00Z"),
    duration: 70,
    sessionAvg: 0.82,
    restingMetrics: RESTING_METRICS,
    scores: [
      movementScore("eyebrow-raise", 0.94),
      movementScore("eye-close", 0.92),
      movementScore("open-smile", 0.88),
      movementScore("nose-wrinkle", 0.84),
      movementScore("pucker", 0.86),
    ],
  }, { includeClinicalScaleEstimates: false });

  assert.doesNotMatch(hiddenHtml, /Clinical scale estimates/);
  assert.doesNotMatch(hiddenHtml, /House-Brackmann estimate/);
});
