#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_STATUS_PATH = "docs/validation-status.json";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_MIN_CLINICAL_SCALE_REVIEWED_ASSESSMENTS = 30;

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNonNegativeInteger(value, field) {
  assertCondition(Number.isInteger(value) && value >= 0, `${field} must be a non-negative integer`);
}

function assertStringArray(value, field) {
  assertCondition(Array.isArray(value), `${field} must be an array`);
  for (const [index, item] of value.entries()) {
    assertCondition(typeof item === "string" && item.length > 0, `${field}[${index}] must be a non-empty string`);
  }
}

function assertClinicalScaleMinimumStandard(value) {
  assertCondition(value && typeof value === "object" && !Array.isArray(value), "clinicalScaleMinimumStandard must be an object");
  assertCondition(value.minAgreementRate === 0.8, "clinicalScaleMinimumStandard.minAgreementRate must be 0.8");
  assertCondition(
    Number.isInteger(value.minReviewedAssessments) && value.minReviewedAssessments >= DEFAULT_MIN_CLINICAL_SCALE_REVIEWED_ASSESSMENTS,
    `clinicalScaleMinimumStandard.minReviewedAssessments must be at least ${DEFAULT_MIN_CLINICAL_SCALE_REVIEWED_ASSESSMENTS}`,
  );
  assertCondition(value.confidenceInterval === "wilson-95", "clinicalScaleMinimumStandard.confidenceInterval must be wilson-95");
}

function validateStatus(status) {
  assertCondition(status && typeof status === "object" && !Array.isArray(status), "validation status must be an object");
  assertCondition(status.schemaVersion === 1, "validation status schemaVersion must be 1");
  assertCondition(typeof status.updatedAt === "string" && ISO_DATE_RE.test(status.updatedAt), "updatedAt must use YYYY-MM-DD");
  assertCondition(typeof status.status === "string" && status.status.length > 0, "status is required");
  assertNonNegativeInteger(status.reviewedDatasetCount, "reviewedDatasetCount");
  assertNonNegativeInteger(status.reviewedFrameCount, "reviewedFrameCount");
  assertNonNegativeInteger(status.reviewedClinicalScaleAssessmentCount, "reviewedClinicalScaleAssessmentCount");
  assertNonNegativeInteger(status.readyExerciseCount, "readyExerciseCount");
  assertClinicalScaleMinimumStandard(status.clinicalScaleMinimumStandard);
  assertStringArray(status.clinicalScaleAgreementReports, "clinicalScaleAgreementReports");
  assertStringArray(status.thresholdCalibrationReports, "thresholdCalibrationReports");
  if (status.notes !== undefined) assertStringArray(status.notes, "notes");
  assertCondition(typeof status.productionThresholdConstantsCalibrated === "boolean", "productionThresholdConstantsCalibrated must be boolean");
  assertCondition(typeof status.clinicalFacingScoresAllowed === "boolean", "clinicalFacingScoresAllowed must be boolean");

  if (status.productionThresholdConstantsCalibrated) {
    assertCondition(status.reviewedDatasetCount > 0, "threshold constants cannot be marked calibrated without reviewed datasets");
    assertCondition(status.reviewedFrameCount > 0, "threshold constants cannot be marked calibrated without reviewed frame coverage");
    assertCondition(status.readyExerciseCount > 0, "threshold constants cannot be marked calibrated without ready exercise coverage");
    assertCondition(status.thresholdCalibrationReports.length > 0, "threshold constants cannot be marked calibrated without calibration reports");
  }
  if (status.clinicalScaleAgreementReports.length > 0) {
    assertCondition(status.reviewedDatasetCount > 0, "clinical scale agreement reports require reviewed datasets");
    assertCondition(
      status.reviewedClinicalScaleAssessmentCount >= status.clinicalScaleMinimumStandard.minReviewedAssessments,
      "clinical scale agreement reports require reviewed clinical-scale assessment coverage meeting the minimum standard",
    );
  }
  if (status.clinicalFacingScoresAllowed) {
    assertCondition(status.productionThresholdConstantsCalibrated, "clinical-facing scores require calibrated production thresholds");
    assertCondition(status.reviewedFrameCount > 0, "clinical-facing scores require reviewed frame coverage");
    assertCondition(
      status.reviewedClinicalScaleAssessmentCount >= status.clinicalScaleMinimumStandard.minReviewedAssessments,
      "clinical-facing scores require reviewed clinical-scale assessment coverage meeting the minimum standard",
    );
    assertCondition(status.clinicalScaleAgreementReports.length > 0, "clinical-facing scores require clinical scale agreement reports");
  }
  return status;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const statusPath = process.argv[2] ?? DEFAULT_STATUS_PATH;
  const status = validateStatus(JSON.parse(await readFile(statusPath, "utf8")));
  console.log(`validation status: ${status.status} (${status.reviewedDatasetCount} reviewed datasets, ${status.reviewedFrameCount} reviewed frames, ${status.reviewedClinicalScaleAssessmentCount} reviewed clinical-scale assessments)`);
}

export { validateStatus };
