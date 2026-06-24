import assert from "node:assert/strict";
import test from "node:test";
import {
  calibrateThresholdsFromValidationSamples,
  evaluateClinicalScaleEstimates,
  evaluateValidationFrameSamples,
  extractAssessmentClinicalScaleRecords,
  extractValidationFrameRecords,
  movementClassFromLabel,
} from "../src/ml/validationEvaluation.js";
import { CLINICAL_SCALE_ESTIMATE_VERSION, STANDARD_SCALE_MOVEMENTS } from "../src/domain/clinicalScales.js";

const CURRENT_ESTIMATOR_VERSION_KEY = `v${CLINICAL_SCALE_ESTIMATE_VERSION}`;
const PREVIOUS_ESTIMATOR_VERSION_KEY = `v${CLINICAL_SCALE_ESTIMATE_VERSION - 1}`;
const STANDARD_SCALE_MOVEMENT_IDS = STANDARD_SCALE_MOVEMENTS.map((movement) => movement.exerciseId);
const REQUIRED_RESTING_METRIC_KEYS = ["palpebralFissure", "nasolabialMidface", "oralCommissure"];

const LEFT_SMILE = [61, 84, 91, 146, 78, 95, 88, 178, 39, 40, 181];
const RIGHT_SMILE = [291, 314, 321, 375, 308, 324, 318, 402, 269, 270, 405];

function landmark(x, y, z = 0) {
  return { x, y, z };
}

function setGroup(lm, idxs, x, y) {
  for (const idx of idxs) lm[idx] = landmark(x, y);
}

function cloneLandmarks(lm) {
  return lm.map((point) => ({ ...point }));
}

function moveGroup(lm, idxs, dx, dy) {
  for (const idx of idxs) lm[idx] = landmark(lm[idx].x + dx, lm[idx].y + dy, lm[idx].z ?? 0);
}

function makeNeutralFace() {
  const lm = Array.from({ length: 478 }, () => landmark(0.5, 0.5));
  lm[1] = landmark(0.5, 0.5);
  lm[33] = landmark(0.3, 0.5);
  lm[263] = landmark(0.7, 0.5);
  setGroup(lm, LEFT_SMILE, 0.43, 0.58);
  setGroup(lm, RIGHT_SMILE, 0.57, 0.58);
  return lm;
}

test("validation evaluation reports labeled replay accuracy and error rates", () => {
  const neutral = makeNeutralFace();
  const smile = cloneLandmarks(neutral);
  moveGroup(smile, LEFT_SMILE, -0.012, 0);
  moveGroup(smile, RIGHT_SMILE, 0.012, 0);
  const samples = [
    { id: "cal-1", phase: "calibrate", ts: 1, landmarks: neutral, blendshapes: {}, scoringNoiseMode: "normal" },
    { id: "cal-2", phase: "calibrate", ts: 2, landmarks: neutral, blendshapes: {}, scoringNoiseMode: "normal" },
    { id: "cal-3", phase: "calibrate", ts: 3, landmarks: neutral, blendshapes: {}, scoringNoiseMode: "normal" },
    {
      id: "positive",
      sessionId: "session-1",
      phase: "hold",
      exerciseId: "closed-smile",
      repIndex: 0,
      sampleIndex: 0,
      ts: 4,
      landmarks: smile,
      blendshapes: {},
      scoringNoiseMode: "normal",
      scoring: {
        activated: true,
        rawSymmetry: 1,
        peak: 0.024,
        thresholdBands: { minimumVisible: 0.004, reliableMovement: 0.007, baselineTarget: 0.02 },
      },
      label: { quality: "strong", visibleMovementLevel: "moderate" },
    },
    {
      id: "negative",
      sessionId: "session-1",
      phase: "hold",
      exerciseId: "closed-smile",
      repIndex: 0,
      sampleIndex: 1,
      ts: 5,
      landmarks: neutral,
      blendshapes: {},
      scoringNoiseMode: "normal",
      scoring: {
        activated: false,
        peak: 0,
        dropReason: "below-signal-gate",
        thresholdBands: { minimumVisible: 0.004, reliableMovement: 0.007, baselineTarget: 0.02 },
      },
      label: { quality: "strong", visibleMovementLevel: "none" },
    },
  ];

  const result = evaluateValidationFrameSamples(samples);

  assert.equal(result.holdFrameCount, 2);
  assert.equal(result.validation.labeledFrameCount, 2);
  assert.equal(result.validation.truePositive, 1);
  assert.equal(result.validation.trueNegative, 1);
  assert.equal(result.validation.falsePositiveRate, 0);
  assert.equal(result.validation.falseNegativeRate, 0);
  assert.equal(result.validation.accuracy, 1);
  assert.deepEqual(result.validation.byExercise, [{
    exerciseId: "closed-smile",
    labeledFrameCount: 2,
    positiveCount: 1,
    negativeCount: 1,
    truePositive: 1,
    trueNegative: 1,
    falsePositive: 0,
    falseNegative: 0,
    accuracy: 1,
    falsePositiveRate: 0,
    falseNegativeRate: 0,
  }]);
  assert.deepEqual(result.validation.thresholdBandCounts, {
    withBands: 2,
    aboveMinimumVisible: 1,
    aboveReliableMovement: 1,
    aboveBaselineTarget: 1,
    belowMinimumVisible: 1,
  });
});

test("validation evaluation extracts frame records from JSONL records", () => {
  const records = [
    { kind: "mirror-validation-dataset-jsonl" },
    {
      section: "frameSample",
      record: {
        id: "sample-1",
        label: { quality: "usable", visibleMovementLevel: "trace" },
        frame: { phase: "hold", exerciseId: "eye-close", landmarks: [] },
      },
    },
  ];

  const samples = extractValidationFrameRecords(records);

  assert.equal(samples.length, 1);
  assert.equal(samples[0].id, "sample-1");
  assert.equal(samples[0].label.visibleMovementLevel, "trace");
  assert.equal(movementClassFromLabel(samples[0].label), true);
  assert.equal(movementClassFromLabel({ quality: "unusable", visibleMovementLevel: "strong" }), null);
});

test("threshold calibration recommends bands from reviewed positive and negative peaks", () => {
  const samples = [
    { id: "neg-1", phase: "hold", exerciseId: "closed-smile", ts: 1, scoring: { peak: 0.001 }, label: { quality: "strong", visibleMovementLevel: "none" } },
    { id: "neg-2", phase: "hold", exerciseId: "closed-smile", ts: 2, scoring: { peak: 0.002 }, label: { quality: "strong", visibleMovementLevel: "none" } },
    { id: "neg-3", phase: "hold", exerciseId: "closed-smile", ts: 3, scoring: { peak: 0.003 }, label: { quality: "strong", visibleMovementLevel: "none" } },
    { id: "pos-1", phase: "hold", exerciseId: "closed-smile", ts: 4, scoring: { peak: 0.012, thresholdBands: { reliableMovement: 0.006 } }, label: { quality: "strong", visibleMovementLevel: "low" } },
    { id: "pos-2", phase: "hold", exerciseId: "closed-smile", ts: 5, scoring: { peak: 0.014, thresholdBands: { reliableMovement: 0.006 } }, label: { quality: "strong", visibleMovementLevel: "moderate" } },
    { id: "pos-3", phase: "hold", exerciseId: "closed-smile", ts: 6, scoring: { peak: 0.016, thresholdBands: { reliableMovement: 0.006 } }, label: { quality: "strong", visibleMovementLevel: "strong" } },
  ];

  const report = calibrateThresholdsFromValidationSamples(samples, { generatedAt: "2026-06-23T00:00:00.000Z" });
  const exercise = report.exercises[0];

  assert.equal(report.summary.readyExercises, 1);
  assert.equal(exercise.status, "ready");
  assert.deepEqual(exercise.recommendedThresholdBands, {
    minimumVisible: 0.0075,
    reliableMovement: 0.0075,
    baselineTarget: 0.016,
  });
  assert.equal(exercise.currentReliableThreshold, 0.006);
  assert.equal(exercise.projectedAtRecommended.falsePositiveRate, 0);
  assert.equal(exercise.projectedAtRecommended.falseNegativeRate, 0);
});

function clinicalRecord(id, estimate, label) {
  const usableMovementCount = estimate.usableMovementCount ?? 5;
  const requiredMovementCount = estimate.requiredMovementCount ?? 5;
  const defaultUsedMovementExerciseIds = STANDARD_SCALE_MOVEMENT_IDS.slice(0, usableMovementCount);
  const defaultOmittedMovementExerciseIds = STANDARD_SCALE_MOVEMENT_IDS.filter((exerciseId) => !defaultUsedMovementExerciseIds.includes(exerciseId));
  const usedMovementExerciseIds = estimate.usedMovementExerciseIds ?? defaultUsedMovementExerciseIds;
  const houseBrackmannRequiredExerciseIds = estimate.houseBrackmannRequiredExerciseIds ?? ["eye-close"];
  const houseBrackmannUsedExerciseIds = estimate.houseBrackmannUsedExerciseIds ?? usedMovementExerciseIds;
  const houseBrackmannMissingRequiredExerciseIds = estimate.houseBrackmannMissingRequiredExerciseIds
    ?? houseBrackmannRequiredExerciseIds.filter((exerciseId) => !houseBrackmannUsedExerciseIds.includes(exerciseId));
  const houseBrackmannInputComplete = estimate.houseBrackmannInputComplete ?? houseBrackmannMissingRequiredExerciseIds.length === 0;
  return {
    section: "assessmentClinicalScale",
    record: {
      id,
      sessionId: id.replace(":clinical-scale", ""),
      kind: "assessment-clinical-scale",
      estimate: {
        status: "estimated",
        version: estimate.version ?? CLINICAL_SCALE_ESTIMATE_VERSION,
        evidence: {
          tier: estimate.evidenceTier ?? "complete-standard-assessment",
          label: estimate.evidenceLabel ?? "Complete standard-assessment evidence",
          estimatedMovementExerciseIds: usedMovementExerciseIds,
          omittedMovementExerciseIds: estimate.omittedMovementExerciseIds ?? defaultOmittedMovementExerciseIds,
          calculationUsesOnlyUsableMovements: estimate.calculationUsesOnlyUsableMovements ?? true,
          scaleInputCompleteness: {
            houseBrackmann: {
              requiredExerciseIds: houseBrackmannRequiredExerciseIds,
              usedExerciseIds: houseBrackmannUsedExerciseIds,
              missingRequiredExerciseIds: houseBrackmannMissingRequiredExerciseIds,
              complete: houseBrackmannInputComplete,
            },
            sunnybrook: {
              usedExerciseIds: estimate.sunnybrookUsedExerciseIds ?? usedMovementExerciseIds,
              omittedExerciseIds: estimate.sunnybrookOmittedExerciseIds ?? (estimate.omittedMovementExerciseIds ?? defaultOmittedMovementExerciseIds),
              complete: estimate.sunnybrookInputComplete ?? (estimate.omittedMovementExerciseIds ?? defaultOmittedMovementExerciseIds).length === 0,
            },
            eface: {
              usedExerciseIds: estimate.efaceUsedExerciseIds ?? usedMovementExerciseIds,
              omittedExerciseIds: estimate.efaceOmittedExerciseIds ?? (estimate.omittedMovementExerciseIds ?? defaultOmittedMovementExerciseIds),
              complete: estimate.efaceInputComplete ?? (estimate.omittedMovementExerciseIds ?? defaultOmittedMovementExerciseIds).length === 0,
            },
          },
          requiredRestingMetricKeys: estimate.requiredRestingMetricKeys ?? REQUIRED_RESTING_METRIC_KEYS,
          availableRestingMetricKeys: estimate.availableRestingMetricKeys ?? REQUIRED_RESTING_METRIC_KEYS,
          missingRestingMetricKeys: estimate.missingRestingMetricKeys ?? [],
          calculationUsesCompleteRestingMetrics: estimate.calculationUsesCompleteRestingMetrics ?? true,
        },
        coverage: {
          usableMovementCount,
          requiredMovementCount,
          ratio: estimate.usableMovementCoverageRatio ?? 1,
        },
        scales: {
          houseBrackmann: { numericGrade: estimate.hb, grade: ["I", "II", "III", "IV", "V", "VI"][estimate.hb - 1] },
          sunnybrook: { compositeScore: estimate.sunnybrook },
          eface: {
            totalScore: estimate.eface,
            staticScore: estimate.efaceStatic ?? estimate.eface,
            dynamicScore: estimate.efaceDynamic ?? estimate.eface,
            synkinesisScore: estimate.efaceSynkinesis ?? estimate.eface,
          },
        },
      },
      label: {
        validationCaseId: label.validationCaseId ?? id.replace(":clinical-scale", ""),
        houseBrackmannGrade: label.hb,
        sunnybrookComposite: label.sunnybrook,
        efaceTotal: label.eface,
        efaceStatic: label.efaceStatic ?? label.eface,
        efaceDynamic: label.efaceDynamic ?? label.eface,
        efaceSynkinesis: label.efaceSynkinesis ?? label.eface,
        clinicianConfidence: label.clinicianConfidence ?? "high",
        sourceLabelSheetMode: label.sourceLabelSheetMode ?? "blinded",
        reviewBlinded: label.reviewBlinded ?? "yes",
        labelSource: label.labelSource ?? "clinician-assigned",
        reviewerId: label.reviewerId ?? "reviewer-1",
        reviewerRole: label.reviewerRole ?? "clinician",
        reviewedAt: label.reviewedAt ?? "2026-06-24T10:00:00.000Z",
      },
    },
  };
}

function clinicalAgreementRecords(total, successCount) {
  const caseProfiles = [
    {
      estimate: { hb: 2, sunnybrook: 88, eface: 86 },
      successLabel: { hb: "II", sunnybrook: 90, eface: 88 },
      failLabel: { hb: "IV", sunnybrook: 66, eface: 64 },
    },
    {
      estimate: { hb: 3, sunnybrook: 72, eface: 70 },
      successLabel: { hb: "III", sunnybrook: 74, eface: 72 },
      failLabel: { hb: "V", sunnybrook: 55, eface: 52 },
    },
    {
      estimate: { hb: 5, sunnybrook: 35, eface: 38 },
      successLabel: { hb: "V", sunnybrook: 32, eface: 35 },
      failLabel: { hb: "III", sunnybrook: 56, eface: 59 },
    },
  ];
  return Array.from({ length: total }, (_, index) => {
    const success = index < successCount;
    const profile = caseProfiles[index % caseProfiles.length];
    return clinicalRecord(`assessment-${index + 1}:clinical-scale`, profile.estimate, success ? profile.successLabel : profile.failLabel);
  });
}

test("clinical scale evaluation passes only when Wilson lower-bound agreement clears 80 percent", () => {
  const records = clinicalAgreementRecords(30, 30);

  const extracted = extractAssessmentClinicalScaleRecords(records);
  const report = evaluateClinicalScaleEstimates(records, { generatedAt: "2026-06-23T00:00:00.000Z" });

  assert.equal(extracted.length, 30);
  assert.equal(report.summary.reviewedAssessmentCount, 30);
  assert.equal(report.summary.distinctClinicalCaseCount, 30);
  assert.equal(report.summary.meetsMinimumStandard, true);
  assert.equal(report.summary.readyForClinicalFacingScoring, true);
  assert.equal(report.caseMix.representedSeverityBandCount, 3);
  assert.equal(report.caseMix.severityBands.mild.count, 10);
  assert.equal(report.caseMix.severityBands.moderate.count, 10);
  assert.equal(report.caseMix.severityBands.severe.count, 10);
  assert.equal(report.standard.minAgreementRate, 0.8);
  assert.equal(report.standard.minAgreementWilsonLowerBound, 0.8);
  assert.equal(report.standard.minReviewedAssessments, 30);
  assert.equal(report.standard.minDistinctClinicalCases, 10);
  assert.equal(report.standard.clinicalScaleEstimateVersion, CLINICAL_SCALE_ESTIMATE_VERSION);
  assert.equal(report.summary.estimateVersionCounts[CURRENT_ESTIMATOR_VERSION_KEY], 30);
  assert.equal(report.summary.currentClinicalScaleEstimateVersionAssessmentCount, 30);
  assert.deepEqual(report.standard.confidenceInterval, { method: "wilson-score", confidenceLevel: 0.95 });
  assert.equal(report.byScale.houseBrackmann.labeledCount, 30);
  assert.equal(report.byScale.houseBrackmann.withinToleranceCount, 30);
  assert.equal(report.byScale.houseBrackmann.agreementRate, 1);
  assert.equal(report.byScale.houseBrackmann.agreementSamplePlan.additionalPerfectLabelsToReachStandard, 0);
  assert.ok(report.byScale.houseBrackmann.agreementConfidenceInterval.lower >= 0.8);
  assert.equal(report.byScale.sunnybrookComposite.withinToleranceCount, 30);
  assert.equal(report.byScale.sunnybrookComposite.agreementRate, 1);
  assert.equal(report.byScale.efaceTotal.withinToleranceCount, 30);
  assert.equal(report.byScale.efaceTotal.meetsMinimumStandard, true);
});

test("clinical scale evaluation lets primary scales meet evidence independently", () => {
  const records = clinicalAgreementRecords(30, 30).map((line) => ({
    ...line,
    record: {
      ...line.record,
      label: {
        ...line.record.label,
        sunnybrookComposite: "",
        efaceTotal: "",
        efaceStatic: "",
        efaceDynamic: "",
        efaceSynkinesis: "",
      },
    },
  }));

  const report = evaluateClinicalScaleEstimates(records, { generatedAt: "2026-06-23T00:00:00.000Z" });

  assert.equal(report.summary.reviewedAssessmentCount, 30);
  assert.equal(report.summary.readyPrimaryScaleCount, 1);
  assert.equal(report.summary.meetsMinimumStandard, false);
  assert.equal(report.summary.readyForClinicalFacingScoring, false);
  assert.equal(report.byScale.houseBrackmann.labeledCount, 30);
  assert.equal(report.byScale.houseBrackmann.withinToleranceCount, 30);
  assert.equal(report.byScale.houseBrackmann.meetsMinimumStandard, true);
  assert.equal(report.byScale.sunnybrookComposite.labeledCount, 0);
  assert.equal(report.byScale.sunnybrookComposite.meetsMinimumStandard, false);
  assert.equal(report.byScale.efaceTotal.labeledCount, 0);
  assert.equal(report.byScale.efaceTotal.meetsMinimumStandard, false);
  assert.equal(report.summary.primaryScaleLabelIssueReasons["missing valid sunnybrookComposite label"], 30);
  assert.equal(report.summary.primaryScaleLabelIssueReasons["missing valid efaceTotal label"], 30);
  assert.match(report.blockingReasons.join("\n"), /sunnybrookComposite/);
  assert.match(report.blockingReasons.join("\n"), /efaceTotal/);
});

test("clinical scale evaluation fails closed when 80 percent observed agreement has a low Wilson lower bound", () => {
  const records = clinicalAgreementRecords(30, 24);

  const report = evaluateClinicalScaleEstimates(records, { generatedAt: "2026-06-23T00:00:00.000Z" });

  assert.equal(report.summary.reviewedAssessmentCount, 30);
  assert.equal(report.summary.meetsMinimumStandard, false);
  assert.equal(report.summary.readyForClinicalFacingScoring, false);
  assert.equal(report.caseMix.representedSeverityBandCount, 3);
  assert.equal(report.caseMix.severityBands.mild.count, 8);
  assert.equal(report.caseMix.severityBands.moderate.count, 12);
  assert.equal(report.caseMix.severityBands.severe.count, 10);
  assert.equal(report.byScale.houseBrackmann.labeledCount, 30);
  assert.equal(report.byScale.houseBrackmann.withinToleranceCount, 24);
  assert.equal(report.byScale.houseBrackmann.agreementRate, 0.8);
  assert.equal(report.byScale.houseBrackmann.agreementSamplePlan.currentReviewedLabels, 30);
  assert.equal(report.byScale.houseBrackmann.agreementSamplePlan.currentWithinToleranceCount, 24);
  assert.equal(report.byScale.houseBrackmann.agreementSamplePlan.requiredWithinToleranceAtCurrentLabelCount > 24, true);
  assert.equal(report.byScale.houseBrackmann.agreementSamplePlan.additionalPerfectLabelsToReachStandard > 0, true);
  assert.equal(report.byScale.houseBrackmann.agreementConfidenceInterval.method, "wilson-score");
  assert.ok(report.byScale.houseBrackmann.agreementConfidenceInterval.lower < 0.8);
  assert.ok(report.byScale.houseBrackmann.agreementConfidenceInterval.upper > 0.8);
  assert.equal(report.byScale.sunnybrookComposite.withinToleranceCount, 24);
  assert.equal(report.byScale.sunnybrookComposite.agreementRate, 0.8);
  assert.equal(report.byScale.efaceTotal.withinToleranceCount, 24);
  assert.equal(report.byScale.efaceTotal.meetsMinimumStandard, false);
  assert.match(report.blockingReasons.join("\n"), /Wilson lower bound/);
});

test("clinical scale evaluation fails closed when reviewed labels do not span HB case mix", () => {
  const estimate = { hb: 3, sunnybrook: 72, eface: 70 };
  const label = { hb: "III", sunnybrook: 74, eface: 72 };
  const records = Array.from({ length: 30 }, (_, index) => clinicalRecord(`assessment-${index + 1}:clinical-scale`, estimate, label));

  const report = evaluateClinicalScaleEstimates(records, { generatedAt: "2026-06-23T00:00:00.000Z" });

  assert.equal(report.summary.reviewedAssessmentCount, 30);
  assert.equal(report.byScale.houseBrackmann.agreementRate, 1);
  assert.equal(report.caseMix.representedSeverityBandCount, 1);
  assert.equal(report.caseMix.meetsMinimumStandard, false);
  assert.equal(report.summary.meetsMinimumStandard, false);
  assert.match(report.blockingReasons.join("\n"), /House-Brackmann severity bands/);
});

test("clinical scale evaluation fails closed when reviewed labels come from too few validation cases", () => {
  const records = clinicalAgreementRecords(30, 30).map((line) => ({
    ...line,
    record: {
      ...line.record,
      label: {
        ...line.record.label,
        validationCaseId: "case-single",
      },
    },
  }));

  const report = evaluateClinicalScaleEstimates(records, { generatedAt: "2026-06-23T00:00:00.000Z" });

  assert.equal(report.summary.reviewedAssessmentCount, 30);
  assert.equal(report.summary.distinctClinicalCaseCount, 1);
  assert.equal(report.byScale.houseBrackmann.agreementRate, 1);
  assert.equal(report.summary.meetsMinimumStandard, false);
  assert.match(report.blockingReasons.join("\n"), /needs at least 10 distinct validation cases/);
});

test("clinical scale evaluation fails closed without enough reviewed assessments", () => {
  const report = evaluateClinicalScaleEstimates(clinicalAgreementRecords(29, 29), { generatedAt: "2026-06-23T00:00:00.000Z" });

  assert.equal(report.summary.reviewedAssessmentCount, 29);
  assert.equal(report.summary.meetsMinimumStandard, false);
  assert.equal(report.byScale.houseBrackmann.agreementSamplePlan.additionalPerfectLabelsToReachStandard, 1);
  assert.match(report.blockingReasons.join("\n"), /needs at least 30 reviewed clinical-scale assessments/);
  assert.equal(report.byScale.houseBrackmann.meetsMinimumStandard, false);
});

test("clinical scale evaluation excludes duplicated assessment ids from reviewed denominators", () => {
  const records = clinicalAgreementRecords(30, 30);
  const duplicate = JSON.parse(JSON.stringify(records[0]));
  const report = evaluateClinicalScaleEstimates([...records, duplicate], {
    generatedAt: "2026-06-23T00:00:00.000Z",
  });

  assert.equal(report.summary.assessmentClinicalScaleRecords, 31);
  assert.equal(report.summary.uniqueAssessmentClinicalScaleRecords, 29);
  assert.deepEqual(report.summary.duplicateClinicalScaleAssessmentIds, ["assessment-1:clinical-scale"]);
  assert.equal(report.summary.duplicateClinicalScaleAssessmentIdCount, 1);
  assert.equal(report.summary.duplicateClinicalScaleAssessmentRecordCount, 2);
  assert.equal(report.summary.reviewedAssessmentCount, 29);
  assert.equal(report.summary.excludedClinicalLabelCount, 2);
  assert.equal(report.summary.excludedClinicalLabelReasons["duplicate clinical-scale assessment id"], 2);
  assert.equal(report.byScale.houseBrackmann.labeledCount, 29);
  assert.equal(report.summary.meetsMinimumStandard, false);
  assert.match(report.blockingReasons.join("\n"), /duplicateAssessmentIds/);
});

test("clinical scale evaluation only counts eligible clinician-reviewed primary labels", () => {
  const estimate = { hb: 3, sunnybrook: 72, eface: 70 };
  const validLabel = { hb: "III", sunnybrook: 74, eface: 72 };
  const records = [
    clinicalRecord("assessment-dev:clinical-scale", estimate, { ...validLabel, reviewerRole: "developer rehearsal" }),
    clinicalRecord("assessment-uncertain:clinical-scale", estimate, { ...validLabel, clinicianConfidence: "uncertain" }),
    clinicalRecord("assessment-missing-confidence:clinical-scale", estimate, { ...validLabel, clinicianConfidence: "" }),
    clinicalRecord("assessment-missing-reviewed-at:clinical-scale", estimate, { ...validLabel, reviewedAt: "" }),
    clinicalRecord("assessment-invalid-reviewed-at:clinical-scale", estimate, { ...validLabel, reviewedAt: "2026-06-24" }),
    clinicalRecord("assessment-missing-primary:clinical-scale", estimate, { hb: "III", sunnybrook: 74, eface: "" }),
    clinicalRecord("assessment-out-of-range:clinical-scale", estimate, { hb: "III", sunnybrook: 140, eface: 72 }),
    clinicalRecord("assessment-all-invalid:clinical-scale", estimate, { hb: "VII", sunnybrook: 140, eface: -4 }),
    clinicalRecord("assessment-unblinded-sheet:clinical-scale", estimate, { ...validLabel, sourceLabelSheetMode: "unblinded" }),
    clinicalRecord("assessment-unblinded:clinical-scale", estimate, { ...validLabel, reviewBlinded: "no" }),
    clinicalRecord("assessment-copied:clinical-scale", estimate, { ...validLabel, labelSource: "copied from Mirror estimate" }),
    clinicalRecord("assessment-adjudicated:clinical-scale", estimate, { ...validLabel, reviewerRole: "adjudicated clinician consensus" }),
  ];

  const report = evaluateClinicalScaleEstimates(records, {
    generatedAt: "2026-06-23T00:00:00.000Z",
    minReviewedAssessments: 1,
    minDistinctClinicalCases: 1,
    minAgreementWilsonLowerBound: 0,
    minHouseBrackmannSeverityBands: 1,
    minAssessmentsPerSeverityBand: 1,
  });

  assert.equal(report.summary.assessmentClinicalScaleRecords, 12);
  assert.equal(report.summary.reviewedAssessmentCount, 3);
  assert.equal(report.summary.excludedClinicalLabelCount, 9);
  assert.equal(report.summary.excludedClinicalLabelReasons["reviewer role is marked non-clinical or rehearsal"], 1);
  assert.equal(report.summary.excludedClinicalLabelReasons["clinician confidence is uncertain"], 1);
  assert.equal(report.summary.excludedClinicalLabelReasons["missing clinician confidence"], 1);
  assert.equal(report.summary.excludedClinicalLabelReasons["missing review timestamp"], 1);
  assert.equal(report.summary.excludedClinicalLabelReasons["review timestamp must be a UTC ISO timestamp"], 1);
  assert.equal(report.summary.excludedClinicalLabelReasons["source label sheet was not generated in blinded mode"], 1);
  assert.equal(report.summary.excludedClinicalLabelReasons["review was not marked blinded to Mirror estimates"], 1);
  assert.equal(report.summary.excludedClinicalLabelReasons["label source is marked non-independent or copied"], 1);
  assert.equal(report.summary.excludedClinicalLabelReasons["missing valid houseBrackmann label"], 1);
  assert.equal(report.summary.primaryScaleLabelIssueReasons["missing valid sunnybrookComposite label"], 1);
  assert.equal(report.summary.primaryScaleLabelIssueReasons["missing valid efaceTotal label"], 1);
  assert.equal(report.summary.excludedClinicalLabelReasons["missing valid efaceTotal label"], 1);
  assert.equal(report.summary.excludedClinicalLabelReasons["missing valid sunnybrookComposite label"], 1);
  assert.equal(report.byScale.houseBrackmann.labeledCount, 3);
  assert.equal(report.byScale.sunnybrookComposite.labeledCount, 2);
  assert.equal(report.byScale.efaceTotal.labeledCount, 2);
  assert.equal(report.byScale.houseBrackmann.agreementRate, 1);
  assert.equal(report.summary.readyForClinicalFacingScoring, true);
  assert.equal(report.standard.requiresExplicitClinicalConfidence, true);
  assert.equal(report.standard.requiresIsoReviewTimestamp, true);
});

test("clinical scale evaluation excludes stale or missing estimator-version labels", () => {
  const estimate = { hb: 3, sunnybrook: 72, eface: 70 };
  const validLabel = { hb: "III", sunnybrook: 74, eface: 72 };
  const records = [
    clinicalRecord("assessment-current:clinical-scale", estimate, validLabel),
    clinicalRecord("assessment-stale:clinical-scale", { ...estimate, version: CLINICAL_SCALE_ESTIMATE_VERSION - 1 }, validLabel),
    clinicalRecord("assessment-missing:clinical-scale", { ...estimate, version: null }, validLabel),
  ];
  delete records[2].record.estimate.version;

  const report = evaluateClinicalScaleEstimates(records, {
    generatedAt: "2026-06-23T00:00:00.000Z",
    minReviewedAssessments: 1,
    minDistinctClinicalCases: 1,
    minAgreementWilsonLowerBound: 0,
    minHouseBrackmannSeverityBands: 1,
    minAssessmentsPerSeverityBand: 1,
  });

  assert.equal(report.summary.assessmentClinicalScaleRecords, 3);
  assert.equal(report.summary.reviewedAssessmentCount, 1);
  assert.equal(report.summary.excludedClinicalLabelCount, 2);
  assert.equal(report.summary.excludedClinicalLabelReasons["clinical scale estimate version is missing or stale"], 2);
  assert.equal(report.summary.estimateVersionCounts[CURRENT_ESTIMATOR_VERSION_KEY], 1);
  assert.equal(report.summary.estimateVersionCounts[PREVIOUS_ESTIMATOR_VERSION_KEY], 1);
  assert.equal(report.summary.estimateVersionCounts.missing, 1);
  assert.equal(report.summary.currentClinicalScaleEstimateVersionAssessmentCount, 1);
  assert.equal(report.byScale.houseBrackmann.labeledCount, 1);
  assert.equal(report.byScale.houseBrackmann.agreementRate, 1);
});

test("clinical scale evaluation excludes labels paired with insufficient estimate evidence", () => {
  const validLabel = { hb: "III", sunnybrook: 74, eface: 72 };
  const records = [
    clinicalRecord("assessment-current:clinical-scale", { hb: 3, sunnybrook: 72, eface: 70 }, validLabel),
    clinicalRecord("assessment-insufficient-status:clinical-scale", {
      hb: 3,
      sunnybrook: 72,
      eface: 70,
      evidenceTier: "insufficient-standard-evidence",
      usableMovementCoverageRatio: 0.6,
    }, validLabel),
    clinicalRecord("assessment-out-of-range-estimate:clinical-scale", {
      hb: 3,
      sunnybrook: 72,
      eface: 130,
    }, validLabel),
  ];
  records[1].record.estimate.status = "insufficient-data";

  const report = evaluateClinicalScaleEstimates(records, {
    generatedAt: "2026-06-23T00:00:00.000Z",
    minReviewedAssessments: 1,
    minDistinctClinicalCases: 1,
    minAgreementWilsonLowerBound: 0,
    minHouseBrackmannSeverityBands: 1,
    minAssessmentsPerSeverityBand: 1,
  });

  assert.equal(report.summary.reviewedAssessmentCount, 2);
  assert.equal(report.summary.excludedClinicalLabelCount, 1);
  assert.equal(report.summary.excludedClinicalLabelReasons["clinical scale estimate status is not estimated"], 1);
  assert.equal(report.summary.excludedClinicalLabelReasons["clinical scale estimate evidence tier is missing or insufficient"], 1);
  assert.equal(report.summary.excludedClinicalLabelReasons["clinical scale estimate movement coverage is below the minimum standard"], 1);
  assert.equal(report.summary.primaryScaleEstimateIssueReasons["missing valid efaceTotal estimate"], 1);
  assert.equal(report.byScale.efaceTotal.labeledCount, 2);
  assert.equal(report.byScale.efaceTotal.missingEstimateCount, 1);
  assert.equal(report.byScale.efaceTotal.agreementRate, 0.5);
});

test("clinical scale evaluation counts minimum evidence only for scales with complete inputs", () => {
  const validLabel = { hb: "III", sunnybrook: 74, eface: 72 };
  const records = [
    clinicalRecord("assessment-minimum:clinical-scale", {
      hb: 3,
      sunnybrook: 72,
      eface: 70,
      evidenceTier: "minimum-standard-assessment",
      usableMovementCoverageRatio: 0.8,
      usableMovementCount: 4,
      requiredMovementCount: 5,
      usedMovementExerciseIds: ["eyebrow-raise", "eye-close", "open-smile", "nose-wrinkle"],
      omittedMovementExerciseIds: ["pucker"],
    }, validLabel),
  ];

  const report = evaluateClinicalScaleEstimates(records, {
    generatedAt: "2026-06-23T00:00:00.000Z",
    minReviewedAssessments: 1,
    minDistinctClinicalCases: 1,
    minAgreementWilsonLowerBound: 0,
    minHouseBrackmannSeverityBands: 1,
    minAssessmentsPerSeverityBand: 1,
  });

  assert.equal(report.summary.reviewedAssessmentCount, 1);
  assert.equal(report.summary.excludedClinicalLabelCount, 0);
  assert.equal(report.summary.primaryScaleEstimateIssueReasons["missing valid sunnybrookComposite estimate"], 1);
  assert.equal(report.summary.primaryScaleEstimateIssueReasons["missing valid efaceTotal estimate"], 1);
  assert.equal(report.byScale.houseBrackmann.labeledCount, 1);
  assert.equal(report.byScale.houseBrackmann.agreementRate, 1);
  assert.equal(report.byScale.sunnybrookComposite.labeledCount, 1);
  assert.equal(report.byScale.sunnybrookComposite.comparableCount, 0);
  assert.equal(report.byScale.sunnybrookComposite.missingEstimateCount, 1);
  assert.equal(report.byScale.sunnybrookComposite.agreementRate, 0);
  assert.equal(report.byScale.efaceTotal.labeledCount, 1);
  assert.equal(report.byScale.efaceTotal.comparableCount, 0);
  assert.equal(report.byScale.efaceTotal.missingEstimateCount, 1);
  assert.equal(report.byScale.efaceTotal.agreementRate, 0);
  assert.equal(report.standard.requiresV3MovementProvenance, true);
  assert.equal(report.standard.requiresV5ScaleInputProvenance, true);
});

test("clinical scale evaluation treats HB estimate as missing without required eye-closure input", () => {
  const validLabel = { hb: "III", sunnybrook: 74, eface: 72 };
  const records = [
    clinicalRecord("assessment-missing-hb-input:clinical-scale", {
      hb: 3,
      sunnybrook: 72,
      eface: 70,
      evidenceTier: "minimum-standard-assessment",
      usableMovementCoverageRatio: 0.8,
      usableMovementCount: 4,
      requiredMovementCount: 5,
      usedMovementExerciseIds: ["eyebrow-raise", "open-smile", "nose-wrinkle", "pucker"],
      omittedMovementExerciseIds: ["eye-close"],
      houseBrackmannInputComplete: false,
      houseBrackmannUsedExerciseIds: ["eyebrow-raise", "open-smile", "nose-wrinkle", "pucker"],
      houseBrackmannMissingRequiredExerciseIds: ["eye-close"],
    }, validLabel),
  ];

  const report = evaluateClinicalScaleEstimates(records, {
    generatedAt: "2026-06-23T00:00:00.000Z",
    minReviewedAssessments: 1,
    minDistinctClinicalCases: 1,
    minAgreementWilsonLowerBound: 0,
    minHouseBrackmannSeverityBands: 1,
    minAssessmentsPerSeverityBand: 1,
  });

  assert.equal(report.summary.reviewedAssessmentCount, 1);
  assert.equal(report.summary.primaryScaleEstimateIssueReasons["missing valid houseBrackmann estimate"], 1);
  assert.equal(report.byScale.houseBrackmann.labeledCount, 1);
  assert.equal(report.byScale.houseBrackmann.comparableCount, 0);
  assert.equal(report.byScale.houseBrackmann.missingEstimateCount, 1);
  assert.equal(report.byScale.houseBrackmann.agreementRate, 0);
  assert.equal(report.caseMix.representedSeverityBandCount, 0);
  assert.equal(report.caseMix.severityBands.moderate.count, 0);
  assert.equal(report.caseMix.meetsMinimumStandard, false);
  assert.match(report.blockingReasons.join("\n"), /House-Brackmann severity bands/);
  assert.equal(report.summary.primaryScaleEstimateIssueReasons["missing valid sunnybrookComposite estimate"], 1);
  assert.equal(report.summary.primaryScaleEstimateIssueReasons["missing valid efaceTotal estimate"], 1);
  assert.equal(report.byScale.sunnybrookComposite.comparableCount, 0);
  assert.equal(report.byScale.sunnybrookComposite.missingEstimateCount, 1);
  assert.equal(report.byScale.efaceTotal.comparableCount, 0);
  assert.equal(report.byScale.efaceTotal.missingEstimateCount, 1);
  assert.equal(report.standard.requiresHouseBrackmannRequiredInput, true);
});

test("clinical scale evaluation excludes labels without movement provenance", () => {
  const validLabel = { hb: "III", sunnybrook: 74, eface: 72 };
  const missingProvenance = clinicalRecord("assessment-missing-provenance:clinical-scale", {
    hb: 3,
    sunnybrook: 72,
    eface: 70,
  }, validLabel);
  delete missingProvenance.record.estimate.evidence.estimatedMovementExerciseIds;
  delete missingProvenance.record.estimate.evidence.omittedMovementExerciseIds;
  delete missingProvenance.record.estimate.evidence.calculationUsesOnlyUsableMovements;
  const inconsistentProvenance = clinicalRecord("assessment-inconsistent-provenance:clinical-scale", {
    hb: 3,
    sunnybrook: 72,
    eface: 70,
    usableMovementCount: 4,
    usableMovementCoverageRatio: 0.8,
    usedMovementExerciseIds: ["eyebrow-raise", "eye-close", "open-smile", "nose-wrinkle"],
    omittedMovementExerciseIds: ["eye-close"],
  }, validLabel);
  const records = [
    clinicalRecord("assessment-current:clinical-scale", { hb: 3, sunnybrook: 72, eface: 70 }, validLabel),
    missingProvenance,
    inconsistentProvenance,
  ];

  const report = evaluateClinicalScaleEstimates(records, {
    generatedAt: "2026-06-23T00:00:00.000Z",
    minReviewedAssessments: 1,
    minDistinctClinicalCases: 1,
    minAgreementWilsonLowerBound: 0,
    minHouseBrackmannSeverityBands: 1,
    minAssessmentsPerSeverityBand: 1,
  });

  assert.equal(report.summary.reviewedAssessmentCount, 1);
  assert.equal(report.summary.excludedClinicalLabelCount, 2);
  assert.equal(report.summary.excludedClinicalLabelReasons["clinical scale estimate movement provenance is missing"], 1);
  assert.equal(report.summary.excludedClinicalLabelReasons["clinical scale estimate usable-movement calculation flag is missing or false"], 1);
  assert.equal(report.summary.excludedClinicalLabelReasons["clinical scale estimate movement provenance is inconsistent"], 2);
  assert.equal(report.byScale.houseBrackmann.labeledCount, 1);
  assert.equal(report.byScale.houseBrackmann.agreementRate, 1);
});

test("clinical scale evaluation excludes labels without scale input provenance", () => {
  const validLabel = { hb: "III", sunnybrook: 74, eface: 72 };
  const missingProvenance = clinicalRecord("assessment-missing-scale-input:clinical-scale", {
    hb: 3,
    sunnybrook: 72,
    eface: 70,
  }, validLabel);
  delete missingProvenance.record.estimate.evidence.scaleInputCompleteness.sunnybrook;
  delete missingProvenance.record.estimate.evidence.scaleInputCompleteness.eface;
  const inconsistentProvenance = clinicalRecord("assessment-inconsistent-scale-input:clinical-scale", {
    hb: 3,
    sunnybrook: 72,
    eface: 70,
    efaceOmittedExerciseIds: ["pucker"],
  }, validLabel);
  const records = [
    clinicalRecord("assessment-current:clinical-scale", { hb: 3, sunnybrook: 72, eface: 70 }, validLabel),
    missingProvenance,
    inconsistentProvenance,
  ];

  const report = evaluateClinicalScaleEstimates(records, {
    generatedAt: "2026-06-23T00:00:00.000Z",
    minReviewedAssessments: 1,
    minDistinctClinicalCases: 1,
    minAgreementWilsonLowerBound: 0,
    minHouseBrackmannSeverityBands: 1,
    minAssessmentsPerSeverityBand: 1,
  });

  assert.equal(report.summary.reviewedAssessmentCount, 1);
  assert.equal(report.summary.excludedClinicalLabelCount, 2);
  assert.equal(report.summary.excludedClinicalLabelReasons["clinical scale estimate Sunnybrook input provenance is missing"], 1);
  assert.equal(report.summary.excludedClinicalLabelReasons["clinical scale estimate eFACE input complete flag is missing"], 1);
  assert.equal(report.summary.excludedClinicalLabelReasons["clinical scale estimate eFACE input provenance is inconsistent"], 2);
  assert.equal(report.byScale.sunnybrookComposite.labeledCount, 1);
  assert.equal(report.byScale.efaceTotal.labeledCount, 1);
  assert.equal(report.standard.requiresV5ScaleInputProvenance, true);
});

test("clinical scale evaluation excludes labels without complete resting-metric provenance", () => {
  const validLabel = { hb: "III", sunnybrook: 74, eface: 72 };
  const missingProvenance = clinicalRecord("assessment-missing-rest-provenance:clinical-scale", {
    hb: 3,
    sunnybrook: 72,
    eface: 70,
  }, validLabel);
  delete missingProvenance.record.estimate.evidence.requiredRestingMetricKeys;
  delete missingProvenance.record.estimate.evidence.availableRestingMetricKeys;
  delete missingProvenance.record.estimate.evidence.missingRestingMetricKeys;
  delete missingProvenance.record.estimate.evidence.calculationUsesCompleteRestingMetrics;
  const partialRestingProvenance = clinicalRecord("assessment-partial-rest-provenance:clinical-scale", {
    hb: 3,
    sunnybrook: 72,
    eface: 70,
    availableRestingMetricKeys: ["palpebralFissure", "oralCommissure"],
    missingRestingMetricKeys: ["nasolabialMidface"],
    calculationUsesCompleteRestingMetrics: false,
  }, validLabel);
  const records = [
    clinicalRecord("assessment-current:clinical-scale", { hb: 3, sunnybrook: 72, eface: 70 }, validLabel),
    missingProvenance,
    partialRestingProvenance,
  ];

  const report = evaluateClinicalScaleEstimates(records, {
    generatedAt: "2026-06-23T00:00:00.000Z",
    minReviewedAssessments: 1,
    minDistinctClinicalCases: 1,
    minAgreementWilsonLowerBound: 0,
    minHouseBrackmannSeverityBands: 1,
    minAssessmentsPerSeverityBand: 1,
  });

  assert.equal(report.summary.reviewedAssessmentCount, 1);
  assert.equal(report.summary.excludedClinicalLabelCount, 2);
  assert.equal(report.summary.excludedClinicalLabelReasons["clinical scale estimate resting-metric provenance is missing"], 1);
  assert.equal(report.summary.excludedClinicalLabelReasons["clinical scale estimate complete-resting-metrics flag is missing or false"], 2);
  assert.equal(report.summary.excludedClinicalLabelReasons["clinical scale estimate resting-metric provenance is inconsistent"], 2);
  assert.equal(report.byScale.houseBrackmann.labeledCount, 1);
  assert.equal(report.byScale.houseBrackmann.agreementRate, 1);
  assert.equal(report.standard.requiresV4RestingMetricProvenance, true);
});

test("clinical scale evaluation rejects filled labels that lack clinical reviewer roles", () => {
  const records = clinicalAgreementRecords(30, 30).map((line) => ({
    ...line,
    record: {
      ...line.record,
      label: {
        ...line.record.label,
        reviewerRole: "",
      },
    },
  }));

  const report = evaluateClinicalScaleEstimates(records, { generatedAt: "2026-06-23T00:00:00.000Z" });

  assert.equal(report.summary.reviewedAssessmentCount, 0);
  assert.equal(report.summary.excludedClinicalLabelCount, 30);
  assert.equal(report.summary.excludedClinicalLabelReasons["missing clinician reviewer role"], 30);
  assert.equal(report.summary.readyForClinicalFacingScoring, false);
  assert.match(report.blockingReasons.join("\n"), /needs at least 30 reviewed clinical-scale assessments/);
});

test("clinical scale evaluation rejects labels without blinded independent source metadata", () => {
  const records = clinicalAgreementRecords(30, 30).map((line) => {
    const labelWithoutReviewMetadata = { ...line.record.label };
    delete labelWithoutReviewMetadata.sourceLabelSheetMode;
    delete labelWithoutReviewMetadata.reviewBlinded;
    delete labelWithoutReviewMetadata.labelSource;
    return {
      ...line,
      record: {
        ...line.record,
        label: labelWithoutReviewMetadata,
      },
    };
  });

  const report = evaluateClinicalScaleEstimates(records, { generatedAt: "2026-06-23T00:00:00.000Z" });

  assert.equal(report.summary.reviewedAssessmentCount, 0);
  assert.equal(report.summary.excludedClinicalLabelCount, 30);
  assert.equal(report.summary.excludedClinicalLabelReasons["source label sheet was not generated in blinded mode"], 30);
  assert.equal(report.summary.excludedClinicalLabelReasons["review was not marked blinded to Mirror estimates"], 30);
  assert.equal(report.summary.excludedClinicalLabelReasons["missing independent clinical label source"], 30);
  assert.equal(report.summary.readyForClinicalFacingScoring, false);
});
