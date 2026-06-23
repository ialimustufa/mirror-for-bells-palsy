import assert from "node:assert/strict";
import test from "node:test";
import { validateStatus } from "../scripts/validation-status-check.mjs";

const BASE_STATUS = {
  schemaVersion: 1,
  updatedAt: "2026-06-23",
  status: "tooling-ready-needs-reviewed-data",
  reviewedDatasetCount: 0,
  reviewedFrameCount: 0,
  readyExerciseCount: 0,
  thresholdCalibrationReports: [],
  productionThresholdConstantsCalibrated: false,
  clinicalFacingScoresAllowed: false,
};

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

test("validation status rejects non-date updatedAt values", () => {
  assert.throws(
    () => validateStatus({
      ...BASE_STATUS,
      updatedAt: "June 23, 2026",
    }),
    /YYYY-MM-DD/,
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
