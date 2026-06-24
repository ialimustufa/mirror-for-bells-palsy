import assert from "node:assert/strict";
import test from "node:test";
import { buildValidationDatasetRecords, createValidationDatasetExportBlob, VALIDATION_DATASET_KIND } from "../src/domain/validationDataset.js";
import { CLINICAL_SCALE_ESTIMATE_VERSION } from "../src/domain/clinicalScales.js";

function recordsBySection(records, section) {
  return records.filter((line) => line.section === section).map((line) => line.record);
}

test("validation dataset exports labeled frame sample templates", async () => {
  const source = {
    stores: {
      appState: [{
        id: "appState",
        movementProfile: { affectedSide: "left" },
      }],
      sessions: [
        {
          id: "session-a",
          date: "2026-06-20",
          ts: 200,
          kind: "assessment",
          scoringModelVersion: 2,
          captureQuality: { key: "strong" },
          scores: [{ exerciseId: "eye-close" }],
        },
        {
          id: "session-b",
          date: "2026-06-21",
          ts: 100,
          kind: "session",
          scores: [{ exerciseId: "closed-smile" }],
        },
      ],
      sessionFrameSamples: [
        {
          id: "sample-old",
          sessionId: "session-b",
          exerciseId: "closed-smile",
          phase: "hold",
          ts: 100,
          landmarks: [{ x: 0.1, y: 0.2, z: 0 }],
          blendshapes: { smileLeft: 0.2 },
        },
        {
          id: "sample-calibrate",
          sessionId: "session-a",
          exerciseId: "eye-close",
          phase: "calibrate",
          ts: 210,
          landmarks: [{ x: 0.3, y: 0.4, z: 0 }],
        },
        {
          id: "sample-hold",
          sessionId: "session-a",
          exerciseId: "eye-close",
          phase: "hold",
          ts: 220,
          repIndex: 0,
          sampleIndex: 2,
          scoringNoiseMode: "normal",
          scoring: { scoringModelVersion: 2 },
          landmarks: [{ x: 0.5, y: 0.6, z: 0 }],
        },
      ],
    },
  };

  const records = buildValidationDatasetRecords(source, { sampleLimit: 2, exportedAt: "2026-06-23T00:00:00.000Z" });
  const manifest = records[0];
  const sessions = recordsBySection(records, "sessionContext");
  const samples = recordsBySection(records, "frameSample");
  const clinicalScaleAssessments = recordsBySection(records, "assessmentClinicalScale");

  assert.equal(manifest.kind, VALIDATION_DATASET_KIND);
  assert.equal(manifest.summary.frameSamples, 2);
  assert.equal(manifest.summary.calibrationSamples, 1);
  assert.equal(manifest.summary.holdSamples, 1);
  assert.equal(manifest.summary.assessmentClinicalScaleRecords, 1);
  assert.deepEqual(manifest.summary.exercises, ["eye-close"]);
  assert.equal(manifest.summary.containsLandmarks, true);
  assert.equal(manifest.labelSchema.version, 5);
  assert.deepEqual(manifest.labelSchema.requiredFields, ["intendedMovement", "affectedSide", "quality", "visibleMovementLevel", "coactivationNotes"]);
  assert.deepEqual(manifest.labelSchema.assessmentClinicalScale.requiredFields, []);
  assert.deepEqual(manifest.labelSchema.assessmentClinicalScale.primaryTargetFields, ["houseBrackmannGrade", "sunnybrookComposite", "efaceTotal"]);
  assert.equal(manifest.labelSchema.assessmentClinicalScale.minimumValidPrimaryTargetsForCounting, 1);
  assert.equal(manifest.labelSchema.assessmentClinicalScale.targetCounting, "scale-by-scale");
  assert.equal(manifest.labelSchema.assessmentClinicalScale.fields.estimateStatus.default, "record.estimate.status");
  assert.deepEqual(manifest.labelSchema.assessmentClinicalScale.fields.estimateUsableMovementCoverageRatio.range, [0, 1]);
  assert.equal(manifest.labelSchema.assessmentClinicalScale.fields.estimateUsedMovementExerciseIds.default, "record.estimate.evidence.estimatedMovementExerciseIds");
  assert.equal(manifest.labelSchema.assessmentClinicalScale.fields.estimateOmittedMovementExerciseIds.default, "record.estimate.evidence.omittedMovementExerciseIds");
  assert.equal(manifest.labelSchema.assessmentClinicalScale.fields.estimateCalculationUsesOnlyUsableMovements.default, "record.estimate.evidence.calculationUsesOnlyUsableMovements");
  assert.equal(manifest.labelSchema.assessmentClinicalScale.fields.estimateHouseBrackmannInputComplete.default, "record.estimate.evidence.scaleInputCompleteness.houseBrackmann.complete");
  assert.equal(manifest.labelSchema.assessmentClinicalScale.fields.estimateHouseBrackmannRequiredExerciseIds.default, "record.estimate.evidence.scaleInputCompleteness.houseBrackmann.requiredExerciseIds");
  assert.equal(manifest.labelSchema.assessmentClinicalScale.fields.estimateHouseBrackmannUsedExerciseIds.default, "record.estimate.evidence.scaleInputCompleteness.houseBrackmann.usedExerciseIds");
  assert.equal(manifest.labelSchema.assessmentClinicalScale.fields.estimateHouseBrackmannMissingRequiredExerciseIds.default, "record.estimate.evidence.scaleInputCompleteness.houseBrackmann.missingRequiredExerciseIds");
  assert.equal(manifest.labelSchema.assessmentClinicalScale.fields.estimateSunnybrookInputComplete.default, "record.estimate.evidence.scaleInputCompleteness.sunnybrook.complete");
  assert.equal(manifest.labelSchema.assessmentClinicalScale.fields.estimateSunnybrookUsedExerciseIds.default, "record.estimate.evidence.scaleInputCompleteness.sunnybrook.usedExerciseIds");
  assert.equal(manifest.labelSchema.assessmentClinicalScale.fields.estimateSunnybrookOmittedExerciseIds.default, "record.estimate.evidence.scaleInputCompleteness.sunnybrook.omittedExerciseIds");
  assert.equal(manifest.labelSchema.assessmentClinicalScale.fields.estimateEfaceInputComplete.default, "record.estimate.evidence.scaleInputCompleteness.eface.complete");
  assert.equal(manifest.labelSchema.assessmentClinicalScale.fields.estimateEfaceUsedExerciseIds.default, "record.estimate.evidence.scaleInputCompleteness.eface.usedExerciseIds");
  assert.equal(manifest.labelSchema.assessmentClinicalScale.fields.estimateEfaceOmittedExerciseIds.default, "record.estimate.evidence.scaleInputCompleteness.eface.omittedExerciseIds");
  assert.equal(manifest.labelSchema.assessmentClinicalScale.fields.estimateRequiredRestingMetricKeys.default, "record.estimate.evidence.requiredRestingMetricKeys");
  assert.equal(manifest.labelSchema.assessmentClinicalScale.fields.estimateAvailableRestingMetricKeys.default, "record.estimate.evidence.availableRestingMetricKeys");
  assert.equal(manifest.labelSchema.assessmentClinicalScale.fields.estimateMissingRestingMetricKeys.default, "record.estimate.evidence.missingRestingMetricKeys");
  assert.equal(manifest.labelSchema.assessmentClinicalScale.fields.estimateCalculationUsesCompleteRestingMetrics.default, "record.estimate.evidence.calculationUsesCompleteRestingMetrics");
  assert.deepEqual(manifest.sections, ["sessionContext", "assessmentClinicalScale", "frameSample"]);
  assert.deepEqual(sessions.map((session) => session.id), ["session-a"]);
  assert.deepEqual(clinicalScaleAssessments.map((assessment) => assessment.id), ["session-a:clinical-scale"]);
  assert.equal(clinicalScaleAssessments[0].estimate.status, "insufficient-data");
  assert.equal(clinicalScaleAssessments[0].estimate.version, CLINICAL_SCALE_ESTIMATE_VERSION);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.clinicalScaleEstimateVersion, CLINICAL_SCALE_ESTIMATE_VERSION);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.clinicalScaleEvidenceTier, "insufficient-standard-evidence");
  assert.deepEqual(clinicalScaleAssessments[0].sourceSummary.estimateUsedMovementExerciseIds, []);
  assert.deepEqual(clinicalScaleAssessments[0].sourceSummary.estimateOmittedMovementExerciseIds, ["eyebrow-raise", "eye-close", "open-smile", "nose-wrinkle", "pucker"]);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.estimateCalculationUsesOnlyUsableMovements, true);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.estimateHouseBrackmannInputComplete, null);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.estimateHouseBrackmannRequiredExerciseIds, null);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.estimateHouseBrackmannUsedExerciseIds, null);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.estimateHouseBrackmannMissingRequiredExerciseIds, null);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.estimateSunnybrookInputComplete, null);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.estimateSunnybrookUsedExerciseIds, null);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.estimateSunnybrookOmittedExerciseIds, null);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.estimateEfaceInputComplete, null);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.estimateEfaceUsedExerciseIds, null);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.estimateEfaceOmittedExerciseIds, null);
  assert.deepEqual(clinicalScaleAssessments[0].sourceSummary.estimateRequiredRestingMetricKeys, ["palpebralFissure", "nasolabialMidface", "oralCommissure"]);
  assert.deepEqual(clinicalScaleAssessments[0].sourceSummary.estimateAvailableRestingMetricKeys, []);
  assert.deepEqual(clinicalScaleAssessments[0].sourceSummary.estimateMissingRestingMetricKeys, ["palpebralFissure", "nasolabialMidface", "oralCommissure"]);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.estimateCalculationUsesCompleteRestingMetrics, false);
  assert.equal(clinicalScaleAssessments[0].label.houseBrackmannGrade, null);
  assert.deepEqual(samples.map((sample) => sample.id), ["sample-calibrate", "sample-hold"]);
  assert.equal(samples[1].label.intendedMovement, "eye-close");
  assert.equal(samples[1].label.affectedSide, "left");
  assert.equal(samples[1].label.quality, null);
  assert.equal(samples[1].label.visibleMovementLevel, null);
  assert.equal(samples[1].frame.landmarks.length, 1);

  const blobText = await createValidationDatasetExportBlob(records).text();
  const lines = blobText.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines[0].kind, VALIDATION_DATASET_KIND);
  assert.equal(lines.some((line) => line.section === "assessmentClinicalScale"), true);
  assert.equal(lines.some((line) => line.section === "frameSample"), true);
});

test("validation dataset exports clinical-scale assessment rows without frame samples", async () => {
  const source = {
    stores: {
      appState: [{
        id: "appState",
        movementProfile: { affectedSide: "right" },
      }],
      sessions: [
        {
          id: "assessment-only",
          date: "2026-06-24",
          ts: 300,
          kind: "assessment",
          scoringModelVersion: 2,
          captureQuality: { key: "usable" },
          restingMetrics: {
            version: 1,
            averageAsymmetryRatio: 0.08,
            metrics: {
              palpebralFissure: { label: "Palpebral fissure", userLeft: 0.04, userRight: 0.05, asymmetryRatio: 0.1 },
              nasolabialMidface: { label: "Nasolabial/midface proxy", userLeft: 0.04, userRight: 0.05, asymmetryRatio: 0.12 },
              oralCommissure: { label: "Oral commissure vertical position", userLeft: 0.58, userRight: 0.6, asymmetryRatio: 0.04 },
            },
          },
          scores: [
            { exerciseId: "eyebrow-raise", initialMovementProgress: { affectedProgressRatio: 0.9 }, captureQuality: { key: "strong" } },
            { exerciseId: "eye-close", initialMovementProgress: { affectedProgressRatio: 0.8 }, captureQuality: { key: "strong" } },
            { exerciseId: "open-smile", initialMovementProgress: { affectedProgressRatio: 0.7 }, captureQuality: { key: "strong" } },
            { exerciseId: "nose-wrinkle", initialMovementProgress: { affectedProgressRatio: 0.6 }, captureQuality: { key: "usable" } },
            { exerciseId: "pucker", initialMovementProgress: { affectedProgressRatio: 0.5 }, captureQuality: { key: "usable" } },
          ],
        },
      ],
      sessionFrameSamples: [],
    },
  };

  const records = buildValidationDatasetRecords(source, { exportedAt: "2026-06-24T00:00:00.000Z" });
  const manifest = records[0];
  const sessions = recordsBySection(records, "sessionContext");
  const clinicalScaleAssessments = recordsBySection(records, "assessmentClinicalScale");
  const samples = recordsBySection(records, "frameSample");

  assert.equal(manifest.summary.frameSamples, 0);
  assert.equal(manifest.summary.sessionContexts, 1);
  assert.equal(manifest.summary.assessmentSessions, 1);
  assert.equal(manifest.summary.assessmentClinicalScaleRecords, 1);
  assert.deepEqual(manifest.summary.exercises, []);
  assert.equal(manifest.summary.containsLandmarks, false);
  assert.deepEqual(sessions.map((session) => session.id), ["assessment-only"]);
  assert.deepEqual(clinicalScaleAssessments.map((assessment) => assessment.id), ["assessment-only:clinical-scale"]);
  assert.equal(clinicalScaleAssessments[0].estimate.status, "estimated");
  assert.equal(clinicalScaleAssessments[0].estimate.version, CLINICAL_SCALE_ESTIMATE_VERSION);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.clinicalScaleEstimateVersion, CLINICAL_SCALE_ESTIMATE_VERSION);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.clinicalScaleEvidenceTier, "complete-standard-assessment");
  assert.equal(clinicalScaleAssessments[0].sourceSummary.usableMovementCount, 5);
  assert.deepEqual(clinicalScaleAssessments[0].sourceSummary.estimateUsedMovementExerciseIds, ["eyebrow-raise", "eye-close", "open-smile", "nose-wrinkle", "pucker"]);
  assert.deepEqual(clinicalScaleAssessments[0].sourceSummary.estimateOmittedMovementExerciseIds, []);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.estimateCalculationUsesOnlyUsableMovements, true);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.estimateHouseBrackmannInputComplete, true);
  assert.deepEqual(clinicalScaleAssessments[0].sourceSummary.estimateHouseBrackmannRequiredExerciseIds, ["eye-close"]);
  assert.deepEqual(clinicalScaleAssessments[0].sourceSummary.estimateHouseBrackmannUsedExerciseIds, ["eyebrow-raise", "eye-close", "open-smile", "nose-wrinkle", "pucker"]);
  assert.deepEqual(clinicalScaleAssessments[0].sourceSummary.estimateHouseBrackmannMissingRequiredExerciseIds, []);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.estimateSunnybrookInputComplete, true);
  assert.deepEqual(clinicalScaleAssessments[0].sourceSummary.estimateSunnybrookUsedExerciseIds, ["eyebrow-raise", "eye-close", "open-smile", "nose-wrinkle", "pucker"]);
  assert.deepEqual(clinicalScaleAssessments[0].sourceSummary.estimateSunnybrookOmittedExerciseIds, []);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.estimateEfaceInputComplete, true);
  assert.deepEqual(clinicalScaleAssessments[0].sourceSummary.estimateEfaceUsedExerciseIds, ["eyebrow-raise", "eye-close", "open-smile", "nose-wrinkle", "pucker"]);
  assert.deepEqual(clinicalScaleAssessments[0].sourceSummary.estimateEfaceOmittedExerciseIds, []);
  assert.deepEqual(clinicalScaleAssessments[0].sourceSummary.estimateRequiredRestingMetricKeys, ["palpebralFissure", "nasolabialMidface", "oralCommissure"]);
  assert.deepEqual(clinicalScaleAssessments[0].sourceSummary.estimateAvailableRestingMetricKeys, ["palpebralFissure", "nasolabialMidface", "oralCommissure"]);
  assert.deepEqual(clinicalScaleAssessments[0].sourceSummary.estimateMissingRestingMetricKeys, []);
  assert.equal(clinicalScaleAssessments[0].sourceSummary.estimateCalculationUsesCompleteRestingMetrics, true);
  assert.equal(clinicalScaleAssessments[0].label.houseBrackmannGrade, null);
  assert.equal(samples.length, 0);

  const blobText = await createValidationDatasetExportBlob(records).text();
  const lines = blobText.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines.some((line) => line.section === "assessmentClinicalScale"), true);
  assert.equal(lines.some((line) => line.section === "frameSample"), false);
});
