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
  return {
    section: "assessmentClinicalScale",
    record: {
      id,
      sessionId: id.replace(":clinical-scale", ""),
      kind: "assessment-clinical-scale",
      estimate: {
        status: "estimated",
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
        houseBrackmannGrade: label.hb,
        sunnybrookComposite: label.sunnybrook,
        efaceTotal: label.eface,
        efaceStatic: label.efaceStatic ?? label.eface,
        efaceDynamic: label.efaceDynamic ?? label.eface,
        efaceSynkinesis: label.efaceSynkinesis ?? label.eface,
        reviewerRole: "clinician",
      },
    },
  };
}

test("clinical scale evaluation reports 80 percent reviewed agreement", () => {
  const records = [
    clinicalRecord("assessment-1:clinical-scale", { hb: 2, sunnybrook: 82, eface: 80 }, { hb: "II", sunnybrook: 84, eface: 79 }),
    clinicalRecord("assessment-2:clinical-scale", { hb: 3, sunnybrook: 70, eface: 68 }, { hb: "III", sunnybrook: 72, eface: 66 }),
    clinicalRecord("assessment-3:clinical-scale", { hb: 4, sunnybrook: 48, eface: 52 }, { hb: "III", sunnybrook: 42, eface: 45 }),
    clinicalRecord("assessment-4:clinical-scale", { hb: 5, sunnybrook: 28, eface: 30 }, { hb: "V", sunnybrook: 34, eface: 37 }),
    clinicalRecord("assessment-5:clinical-scale", { hb: 2, sunnybrook: 91, eface: 88 }, { hb: "IV", sunnybrook: 74, eface: 70 }),
  ];

  const extracted = extractAssessmentClinicalScaleRecords(records);
  const report = evaluateClinicalScaleEstimates(records, { generatedAt: "2026-06-23T00:00:00.000Z" });

  assert.equal(extracted.length, 5);
  assert.equal(report.summary.reviewedAssessmentCount, 5);
  assert.equal(report.summary.meetsMinimumStandard, true);
  assert.equal(report.summary.readyForClinicalFacingScoring, true);
  assert.equal(report.byScale.houseBrackmann.labeledCount, 5);
  assert.equal(report.byScale.houseBrackmann.withinToleranceCount, 4);
  assert.equal(report.byScale.houseBrackmann.agreementRate, 0.8);
  assert.equal(report.byScale.sunnybrookComposite.withinToleranceCount, 4);
  assert.equal(report.byScale.sunnybrookComposite.agreementRate, 0.8);
  assert.equal(report.byScale.efaceTotal.withinToleranceCount, 4);
  assert.equal(report.byScale.efaceTotal.meetsMinimumStandard, true);
});

test("clinical scale evaluation fails closed without enough reviewed assessments", () => {
  const report = evaluateClinicalScaleEstimates([
    clinicalRecord("assessment-1:clinical-scale", { hb: 2, sunnybrook: 82, eface: 80 }, { hb: "II", sunnybrook: 84, eface: 79 }),
  ], { generatedAt: "2026-06-23T00:00:00.000Z" });

  assert.equal(report.summary.reviewedAssessmentCount, 1);
  assert.equal(report.summary.meetsMinimumStandard, false);
  assert.match(report.blockingReasons.join("\n"), /needs at least 5 reviewed clinical-scale assessments/);
  assert.equal(report.byScale.houseBrackmann.meetsMinimumStandard, false);
});
