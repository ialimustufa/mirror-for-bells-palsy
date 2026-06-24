import assert from "node:assert/strict";
import test from "node:test";
import {
  compareClinicalScaleReviewerLabels,
  createClinicalScaleAdjudicationCsv,
} from "../src/ml/clinicalScaleReviewerAgreement.js";
import { CLINICAL_SCALE_ESTIMATE_VERSION } from "../src/domain/clinicalScales.js";
import { mergeValidationLabels, parseCsv } from "../src/ml/validationLabels.js";

const CURRENT_ESTIMATOR_VERSION_KEY = `v${CLINICAL_SCALE_ESTIMATE_VERSION}`;
const PREVIOUS_ESTIMATOR_VERSION_KEY = `v${CLINICAL_SCALE_ESTIMATE_VERSION - 1}`;
const REQUIRED_RESTING_METRIC_KEYS = "palpebralFissure|nasolabialMidface|oralCommissure";

function reviewerCsv(rows) {
  return [
    "rowType,sampleId,assessmentId,sessionId,sessionTs,date,estimateStatus,estimateEvidenceTier,estimateUsableMovementCoverageRatio,estimateUsableMovementCount,estimateRequiredMovementCount,estimateUsedMovementExerciseIds,estimateOmittedMovementExerciseIds,estimateCalculationUsesOnlyUsableMovements,estimateHouseBrackmannInputComplete,estimateHouseBrackmannRequiredExerciseIds,estimateHouseBrackmannUsedExerciseIds,estimateHouseBrackmannMissingRequiredExerciseIds,estimateSunnybrookInputComplete,estimateSunnybrookUsedExerciseIds,estimateSunnybrookOmittedExerciseIds,estimateEfaceInputComplete,estimateEfaceUsedExerciseIds,estimateEfaceOmittedExerciseIds,estimateRequiredRestingMetricKeys,estimateAvailableRestingMetricKeys,estimateMissingRestingMetricKeys,estimateCalculationUsesCompleteRestingMetrics,clinicalScaleEstimateVersion,houseBrackmannGrade,sunnybrookComposite,efaceTotal,efaceStatic,efaceDynamic,efaceSynkinesis,clinicianConfidence,sourceLabelSheetMode,reviewBlinded,labelSource,reviewerRole,reviewedAt,notes",
    ...rows.map((row) => [
      "assessmentClinicalScale",
      "",
      row.assessmentId,
      row.sessionId ?? row.assessmentId.replace(":clinical-scale", ""),
      row.sessionTs ?? "",
      row.date ?? "2026-06-24",
      row.estimateStatus ?? "estimated",
      row.estimateEvidenceTier ?? "complete-standard-assessment",
      row.estimateUsableMovementCoverageRatio ?? 1,
      row.estimateUsableMovementCount ?? 5,
      row.estimateRequiredMovementCount ?? 5,
      row.estimateUsedMovementExerciseIds ?? "eyebrow-raise|eye-close|open-smile|nose-wrinkle|pucker",
      row.estimateOmittedMovementExerciseIds ?? "",
      row.estimateCalculationUsesOnlyUsableMovements ?? "true",
      row.estimateHouseBrackmannInputComplete ?? "true",
      row.estimateHouseBrackmannRequiredExerciseIds ?? "eye-close",
      row.estimateHouseBrackmannUsedExerciseIds ?? (row.estimateUsedMovementExerciseIds ?? "eyebrow-raise|eye-close|open-smile|nose-wrinkle|pucker"),
      row.estimateHouseBrackmannMissingRequiredExerciseIds ?? "",
      row.estimateSunnybrookInputComplete ?? (row.estimateOmittedMovementExerciseIds ? "false" : "true"),
      row.estimateSunnybrookUsedExerciseIds ?? (row.estimateUsedMovementExerciseIds ?? "eyebrow-raise|eye-close|open-smile|nose-wrinkle|pucker"),
      row.estimateSunnybrookOmittedExerciseIds ?? (row.estimateOmittedMovementExerciseIds ?? ""),
      row.estimateEfaceInputComplete ?? (row.estimateOmittedMovementExerciseIds ? "false" : "true"),
      row.estimateEfaceUsedExerciseIds ?? (row.estimateUsedMovementExerciseIds ?? "eyebrow-raise|eye-close|open-smile|nose-wrinkle|pucker"),
      row.estimateEfaceOmittedExerciseIds ?? (row.estimateOmittedMovementExerciseIds ?? ""),
      row.estimateRequiredRestingMetricKeys ?? REQUIRED_RESTING_METRIC_KEYS,
      row.estimateAvailableRestingMetricKeys ?? REQUIRED_RESTING_METRIC_KEYS,
      row.estimateMissingRestingMetricKeys ?? "",
      row.estimateCalculationUsesCompleteRestingMetrics ?? "true",
      row.clinicalScaleEstimateVersion ?? CLINICAL_SCALE_ESTIMATE_VERSION,
      row.houseBrackmannGrade ?? "",
      row.sunnybrookComposite ?? "",
      row.efaceTotal ?? "",
      row.efaceStatic ?? "",
      row.efaceDynamic ?? "",
      row.efaceSynkinesis ?? "",
      row.clinicianConfidence ?? "high",
      row.sourceLabelSheetMode ?? "blinded",
      row.reviewBlinded ?? "yes",
      row.labelSource ?? "clinician-assigned",
      row.reviewerRole ?? "clinician",
      "2026-06-24T10:00:00.000Z",
      row.notes ?? "",
    ].join(",")),
  ].join("\n");
}

function legacyReviewerCsvWithoutMovementProvenance(rows) {
  return [
    "rowType,sampleId,assessmentId,sessionId,sessionTs,date,estimateStatus,estimateEvidenceTier,estimateUsableMovementCoverageRatio,estimateUsableMovementCount,estimateRequiredMovementCount,clinicalScaleEstimateVersion,houseBrackmannGrade,sunnybrookComposite,efaceTotal,efaceStatic,efaceDynamic,efaceSynkinesis,clinicianConfidence,sourceLabelSheetMode,reviewBlinded,labelSource,reviewerRole,reviewedAt,notes",
    ...rows.map((row) => [
      "assessmentClinicalScale",
      "",
      row.assessmentId,
      row.sessionId ?? row.assessmentId.replace(":clinical-scale", ""),
      row.sessionTs ?? "",
      row.date ?? "2026-06-24",
      row.estimateStatus ?? "estimated",
      row.estimateEvidenceTier ?? "complete-standard-assessment",
      row.estimateUsableMovementCoverageRatio ?? 1,
      row.estimateUsableMovementCount ?? 5,
      row.estimateRequiredMovementCount ?? 5,
      row.clinicalScaleEstimateVersion ?? CLINICAL_SCALE_ESTIMATE_VERSION,
      row.houseBrackmannGrade ?? "",
      row.sunnybrookComposite ?? "",
      row.efaceTotal ?? "",
      row.efaceStatic ?? "",
      row.efaceDynamic ?? "",
      row.efaceSynkinesis ?? "",
      row.clinicianConfidence ?? "high",
      row.sourceLabelSheetMode ?? "blinded",
      row.reviewBlinded ?? "yes",
      row.labelSource ?? "clinician-assigned",
      row.reviewerRole ?? "clinician",
      "2026-06-24T10:00:00.000Z",
      row.notes ?? "",
    ].join(",")),
  ].join("\n");
}

function legacyReviewerCsvWithoutScaleInputProvenance(rows) {
  return [
    "rowType,sampleId,assessmentId,sessionId,sessionTs,date,estimateStatus,estimateEvidenceTier,estimateUsableMovementCoverageRatio,estimateUsableMovementCount,estimateRequiredMovementCount,estimateUsedMovementExerciseIds,estimateOmittedMovementExerciseIds,estimateCalculationUsesOnlyUsableMovements,estimateHouseBrackmannInputComplete,estimateHouseBrackmannRequiredExerciseIds,estimateHouseBrackmannUsedExerciseIds,estimateHouseBrackmannMissingRequiredExerciseIds,estimateRequiredRestingMetricKeys,estimateAvailableRestingMetricKeys,estimateMissingRestingMetricKeys,estimateCalculationUsesCompleteRestingMetrics,clinicalScaleEstimateVersion,houseBrackmannGrade,sunnybrookComposite,efaceTotal,efaceStatic,efaceDynamic,efaceSynkinesis,clinicianConfidence,sourceLabelSheetMode,reviewBlinded,labelSource,reviewerRole,reviewedAt,notes",
    ...rows.map((row) => [
      "assessmentClinicalScale",
      "",
      row.assessmentId,
      row.sessionId ?? row.assessmentId.replace(":clinical-scale", ""),
      row.sessionTs ?? "",
      row.date ?? "2026-06-24",
      row.estimateStatus ?? "estimated",
      row.estimateEvidenceTier ?? "complete-standard-assessment",
      row.estimateUsableMovementCoverageRatio ?? 1,
      row.estimateUsableMovementCount ?? 5,
      row.estimateRequiredMovementCount ?? 5,
      row.estimateUsedMovementExerciseIds ?? "eyebrow-raise|eye-close|open-smile|nose-wrinkle|pucker",
      row.estimateOmittedMovementExerciseIds ?? "",
      row.estimateCalculationUsesOnlyUsableMovements ?? "true",
      row.estimateHouseBrackmannInputComplete ?? "true",
      row.estimateHouseBrackmannRequiredExerciseIds ?? "eye-close",
      row.estimateHouseBrackmannUsedExerciseIds ?? (row.estimateUsedMovementExerciseIds ?? "eyebrow-raise|eye-close|open-smile|nose-wrinkle|pucker"),
      row.estimateHouseBrackmannMissingRequiredExerciseIds ?? "",
      row.estimateRequiredRestingMetricKeys ?? REQUIRED_RESTING_METRIC_KEYS,
      row.estimateAvailableRestingMetricKeys ?? REQUIRED_RESTING_METRIC_KEYS,
      row.estimateMissingRestingMetricKeys ?? "",
      row.estimateCalculationUsesCompleteRestingMetrics ?? "true",
      row.clinicalScaleEstimateVersion ?? CLINICAL_SCALE_ESTIMATE_VERSION,
      row.houseBrackmannGrade ?? "",
      row.sunnybrookComposite ?? "",
      row.efaceTotal ?? "",
      row.efaceStatic ?? "",
      row.efaceDynamic ?? "",
      row.efaceSynkinesis ?? "",
      row.clinicianConfidence ?? "high",
      row.sourceLabelSheetMode ?? "blinded",
      row.reviewBlinded ?? "yes",
      row.labelSource ?? "clinician-assigned",
      row.reviewerRole ?? "clinician",
      "2026-06-24T10:00:00.000Z",
      row.notes ?? "",
    ].join(",")),
  ].join("\n");
}

test("clinical-scale reviewer agreement reports per-scale agreement and adjudication rows", () => {
  const reviewerA = reviewerCsv([
    { assessmentId: "assessment-1:clinical-scale", houseBrackmannGrade: "III", sunnybrookComposite: 76, efaceTotal: 73, efaceStatic: 80 },
    { assessmentId: "assessment-2:clinical-scale", houseBrackmannGrade: "II", sunnybrookComposite: 88, efaceTotal: 86 },
    { assessmentId: "assessment-3:clinical-scale", houseBrackmannGrade: "V", sunnybrookComposite: 48, efaceTotal: 51 },
  ]);
  const reviewerB = reviewerCsv([
    { assessmentId: "assessment-1:clinical-scale", houseBrackmannGrade: "III", sunnybrookComposite: 80, efaceTotal: 79, efaceStatic: 82 },
    { assessmentId: "assessment-2:clinical-scale", houseBrackmannGrade: "IV", sunnybrookComposite: 72, efaceTotal: 70 },
    { assessmentId: "assessment-4:clinical-scale", houseBrackmannGrade: "II", sunnybrookComposite: 91, efaceTotal: 87 },
  ]);

  const report = compareClinicalScaleReviewerLabels(reviewerA, reviewerB, {
    generatedAt: "2026-06-24T12:00:00.000Z",
    reviewerA: "clinician-a",
    reviewerB: "clinician-b",
  });

  assert.equal(report.kind, "mirror-clinical-scale-reviewer-agreement-report");
  assert.equal(report.summary.reviewerAAssessmentCount, 3);
  assert.equal(report.summary.reviewerBAssessmentCount, 3);
  assert.equal(report.summary.comparedAssessmentCount, 4);
  assert.equal(report.summary.eligibleReviewerPairCount, 2);
  assert.equal(report.summary.excludedReviewerPairCount, 2);
  assert.equal(report.summary.excludedReviewerPairReasons["missing reviewer B row"], 1);
  assert.equal(report.summary.excludedReviewerPairReasons["missing reviewer A row"], 1);
  assert.equal(report.summary.adjudicationRequiredCount, 4);
  assert.equal(report.summary.requiredClinicalScaleEstimateVersion, CLINICAL_SCALE_ESTIMATE_VERSION);
  assert.equal(report.standard.minAgreementRate, 0.8);
  assert.equal(report.standard.minAgreementWilsonLowerBound, 0.8);
  assert.equal(report.standard.minUsableMovementCoverageRatio, 0.8);
  assert.equal(report.standard.requiresV3MovementProvenance, true);
  assert.equal(report.standard.requiresV4RestingMetricProvenance, true);
  assert.equal(report.standard.requiresHouseBrackmannRequiredInput, true);
  assert.equal(report.standard.requiresV5ScaleInputProvenance, true);
  assert.deepEqual(report.standard.confidenceInterval, { method: "wilson-score", confidenceLevel: 0.95 });
  assert.equal(report.summary.reviewerAEligibleAssessmentCount, 3);
  assert.equal(report.summary.reviewerBEligibleAssessmentCount, 3);
  assert.equal(report.summary.reviewerAIneligibleAssessmentCount, 0);
  assert.equal(report.summary.reviewerBIneligibleAssessmentCount, 0);
  assert.equal(report.summary.reviewerAEstimateVersionCounts[CURRENT_ESTIMATOR_VERSION_KEY], 3);
  assert.equal(report.summary.reviewerBEstimateVersionCounts[CURRENT_ESTIMATOR_VERSION_KEY], 3);
  assert.equal(report.summary.reviewerAInsufficientEstimateEvidenceCount, 0);
  assert.equal(report.summary.reviewerBInsufficientEstimateEvidenceCount, 0);
  assert.equal(report.summary.estimateVersionMismatchCount, 0);
  assert.equal(report.summary.estimateEvidenceMismatchCount, 0);
  assert.deepEqual(report.estimateVersionMismatches, []);
  assert.deepEqual(report.estimateEvidenceMismatches, []);
  assert.deepEqual(report.reviewerSheetIssues, []);
  assert.equal(report.byScale.houseBrackmannGrade.pairedCount, 2);
  assert.equal(report.byScale.houseBrackmannGrade.exactMatchCount, 1);
  assert.equal(report.byScale.houseBrackmannGrade.withinToleranceCount, 1);
  assert.equal(report.byScale.houseBrackmannGrade.withinToleranceRate, 0.5);
  assert.equal(report.byScale.houseBrackmannGrade.meetsMinimumStandard, false);
  assert.equal(report.byScale.houseBrackmannGrade.withinToleranceConfidenceInterval.method, "wilson-score");
  assert.equal(report.byScale.sunnybrookComposite.withinToleranceCount, 1);
  assert.equal(report.byScale.sunnybrookComposite.missingReviewerBCount, 0);
  assert.equal(report.byScale.efaceStatic.pairedCount, 1);
  assert.equal(report.summary.readyPrimaryScaleCount, 0);
  assert.match(report.blockingReasons.join("\n"), /Wilson lower bound/);
  assert.match(report.adjudicationRows.find((row) => row.assessmentId === "assessment-2:clinical-scale").disagreementSummary, /outside tolerance/);
});

test("clinical-scale reviewer agreement passes only with enough high-confidence paired agreement", () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({
    assessmentId: `assessment-${index + 1}:clinical-scale`,
    houseBrackmannGrade: index % 3 === 0 ? "II" : index % 3 === 1 ? "III" : "V",
    sunnybrookComposite: index % 3 === 0 ? 88 : index % 3 === 1 ? 72 : 48,
    efaceTotal: index % 3 === 0 ? 86 : index % 3 === 1 ? 70 : 51,
  }));

  const report = compareClinicalScaleReviewerLabels(reviewerCsv(rows), reviewerCsv(rows), {
    generatedAt: "2026-06-24T12:00:00.000Z",
  });

  assert.equal(report.summary.comparedAssessmentCount, 30);
  assert.equal(report.summary.eligibleReviewerPairCount, 30);
  assert.equal(report.summary.excludedReviewerPairCount, 0);
  assert.equal(report.summary.readyPrimaryScaleCount, 3);
  assert.equal(report.summary.reviewerAInsufficientEstimateEvidenceCount, 0);
  assert.equal(report.summary.reviewerBInsufficientEstimateEvidenceCount, 0);
  assert.equal(report.summary.estimateEvidenceMismatchCount, 0);
  assert.equal(report.byScale.houseBrackmannGrade.withinToleranceRate, 1);
  assert.ok(report.byScale.houseBrackmannGrade.withinToleranceConfidenceInterval.lower >= 0.8);
  assert.equal(report.byScale.sunnybrookComposite.meetsMinimumStandard, true);
  assert.equal(report.byScale.efaceTotal.meetsMinimumStandard, true);
  assert.deepEqual(report.blockingReasons, []);
});

test("clinical-scale reviewer agreement lets primary scales meet evidence independently", () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({
    assessmentId: `assessment-${index + 1}:clinical-scale`,
    houseBrackmannGrade: index % 3 === 0 ? "II" : index % 3 === 1 ? "III" : "V",
  }));

  const report = compareClinicalScaleReviewerLabels(reviewerCsv(rows), reviewerCsv(rows), {
    generatedAt: "2026-06-24T12:00:00.000Z",
  });

  assert.equal(report.summary.comparedAssessmentCount, 30);
  assert.equal(report.summary.eligibleReviewerPairCount, 30);
  assert.equal(report.summary.excludedReviewerPairCount, 0);
  assert.equal(report.summary.reviewerAEligibleAssessmentCount, 30);
  assert.equal(report.summary.reviewerBEligibleAssessmentCount, 30);
  assert.equal(report.summary.reviewerAIneligibleAssessmentCount, 0);
  assert.equal(report.summary.reviewerBIneligibleAssessmentCount, 0);
  assert.equal(report.summary.readyPrimaryScaleCount, 1);
  assert.equal(report.summary.reviewerAPrimaryScaleLabelIssueReasons["missing valid sunnybrookComposite label"], 30);
  assert.equal(report.summary.reviewerBPrimaryScaleLabelIssueReasons["missing valid efaceTotal label"], 30);
  assert.equal(report.byScale.houseBrackmannGrade.pairedCount, 30);
  assert.equal(report.byScale.houseBrackmannGrade.withinToleranceRate, 1);
  assert.equal(report.byScale.houseBrackmannGrade.meetsMinimumStandard, true);
  assert.equal(report.byScale.sunnybrookComposite.pairedCount, 0);
  assert.equal(report.byScale.sunnybrookComposite.meetsMinimumStandard, false);
  assert.equal(report.byScale.efaceTotal.pairedCount, 0);
  assert.equal(report.byScale.efaceTotal.meetsMinimumStandard, false);
  assert.match(report.blockingReasons.join("\n"), /sunnybrookComposite/);
  assert.match(report.blockingReasons.join("\n"), /efaceTotal/);
});

test("clinical-scale adjudication CSV preserves raw reviewer labels and can be merged after adjudication", () => {
  const reviewerA = reviewerCsv([
    { assessmentId: "assessment-1:clinical-scale", houseBrackmannGrade: "III", sunnybrookComposite: 76, efaceTotal: 73, notes: "A note" },
  ]);
  const reviewerB = reviewerCsv([
    { assessmentId: "assessment-1:clinical-scale", houseBrackmannGrade: "IV", sunnybrookComposite: 70, efaceTotal: 62, notes: "B note" },
  ]);
  const report = compareClinicalScaleReviewerLabels(reviewerA, reviewerB);
  const adjudicationCsv = createClinicalScaleAdjudicationCsv(report);
  const parsed = parseCsv(adjudicationCsv);
  const header = parsed[0];
  const row = parsed[1];
  const index = Object.fromEntries(header.map((column, columnIndex) => [column, columnIndex]));

  assert.equal(row[index.assessmentId], "assessment-1:clinical-scale");
  assert.equal(row[index.houseBrackmannGrade], "");
  assert.equal(row[index.clinicalScaleEstimateVersion], String(CLINICAL_SCALE_ESTIMATE_VERSION));
  assert.equal(row[index.estimateStatus], "estimated");
  assert.equal(row[index.estimateEvidenceTier], "complete-standard-assessment");
  assert.equal(row[index.estimateUsableMovementCoverageRatio], "1");
  assert.equal(row[index.estimateUsedMovementExerciseIds], "eyebrow-raise|eye-close|open-smile|nose-wrinkle|pucker");
  assert.equal(row[index.estimateOmittedMovementExerciseIds], "");
  assert.equal(row[index.estimateCalculationUsesOnlyUsableMovements], "true");
  assert.equal(row[index.estimateSunnybrookInputComplete], "true");
  assert.equal(row[index.estimateSunnybrookUsedExerciseIds], "eyebrow-raise|eye-close|open-smile|nose-wrinkle|pucker");
  assert.equal(row[index.estimateSunnybrookOmittedExerciseIds], "");
  assert.equal(row[index.estimateEfaceInputComplete], "true");
  assert.equal(row[index.estimateEfaceUsedExerciseIds], "eyebrow-raise|eye-close|open-smile|nose-wrinkle|pucker");
  assert.equal(row[index.estimateEfaceOmittedExerciseIds], "");
  assert.equal(row[index.reviewerAClinicalScaleEstimateVersion], String(CLINICAL_SCALE_ESTIMATE_VERSION));
  assert.equal(row[index.reviewerBClinicalScaleEstimateVersion], String(CLINICAL_SCALE_ESTIMATE_VERSION));
  assert.equal(row[index.reviewerAEstimateStatus], "estimated");
  assert.equal(row[index.reviewerBEstimateStatus], "estimated");
  assert.equal(row[index.reviewerAEstimateEvidenceTier], "complete-standard-assessment");
  assert.equal(row[index.reviewerBEstimateEvidenceTier], "complete-standard-assessment");
  assert.equal(row[index.reviewerAEstimateUsedMovementExerciseIds], "eyebrow-raise|eye-close|open-smile|nose-wrinkle|pucker");
  assert.equal(row[index.reviewerBEstimateUsedMovementExerciseIds], "eyebrow-raise|eye-close|open-smile|nose-wrinkle|pucker");
  assert.equal(row[index.reviewerAEstimateCalculationUsesOnlyUsableMovements], "true");
  assert.equal(row[index.reviewerBEstimateCalculationUsesOnlyUsableMovements], "true");
  assert.equal(row[index.reviewerAEstimateSunnybrookInputComplete], "true");
  assert.equal(row[index.reviewerBEstimateSunnybrookInputComplete], "true");
  assert.equal(row[index.reviewerAEstimateSunnybrookUsedExerciseIds], "eyebrow-raise|eye-close|open-smile|nose-wrinkle|pucker");
  assert.equal(row[index.reviewerBEstimateSunnybrookUsedExerciseIds], "eyebrow-raise|eye-close|open-smile|nose-wrinkle|pucker");
  assert.equal(row[index.reviewerAEstimateEfaceInputComplete], "true");
  assert.equal(row[index.reviewerBEstimateEfaceInputComplete], "true");
  assert.equal(row[index.reviewerAEstimateEfaceUsedExerciseIds], "eyebrow-raise|eye-close|open-smile|nose-wrinkle|pucker");
  assert.equal(row[index.reviewerBEstimateEfaceUsedExerciseIds], "eyebrow-raise|eye-close|open-smile|nose-wrinkle|pucker");
  assert.equal(row[index.reviewerAHouseBrackmannGrade], "III");
  assert.equal(row[index.reviewerBHouseBrackmannGrade], "IV");
  assert.equal(row[index.reviewerANotes], "A note");
  assert.equal(row[index.reviewerBNotes], "B note");
  assert.match(row[index.disagreementSummary], /House-Brackmann/);

  row[index.houseBrackmannGrade] = "III";
  row[index.sunnybrookComposite] = "74";
  row[index.efaceTotal] = "70";
  row[index.clinicianConfidence] = "high";
  row[index.sourceLabelSheetMode] = "blinded";
  row[index.reviewBlinded] = "yes";
  row[index.labelSource] = "adjudicated-consensus";
  row[index.reviewerRole] = "clinician";
  row[index.notes] = "adjudicated consensus";
  const filledCsv = [header, row].map((cells) => cells.join(",")).join("\n");
  const merged = mergeValidationLabels([
    { kind: "mirror-validation-dataset-jsonl" },
    {
      section: "assessmentClinicalScale",
      record: {
        id: "assessment-1:clinical-scale",
        label: {},
      },
    },
  ], filledCsv);

  assert.equal(merged.updatedAssessmentClinicalScaleCount, 1);
  assert.equal(merged.records[1].record.label.houseBrackmannGrade, "III");
  assert.equal(merged.records[1].record.label.sunnybrookComposite, "74");
  assert.equal(merged.records[1].record.label.efaceTotal, "70");
  assert.equal(merged.records[1].record.label.sourceLabelSheetMode, "blinded");
  assert.equal(merged.records[1].record.label.reviewBlinded, "yes");
  assert.equal(merged.records[1].record.label.labelSource, "adjudicated-consensus");
  assert.equal(merged.records[1].record.label.notes, "adjudicated consensus");
});

test("clinical-scale reviewer agreement blocks stale or mismatched estimator provenance", () => {
  const reviewerA = reviewerCsv([
    { assessmentId: "assessment-1:clinical-scale", clinicalScaleEstimateVersion: CLINICAL_SCALE_ESTIMATE_VERSION, houseBrackmannGrade: "III", sunnybrookComposite: 76, efaceTotal: 73 },
    { assessmentId: "assessment-2:clinical-scale", clinicalScaleEstimateVersion: "", houseBrackmannGrade: "II", sunnybrookComposite: 88, efaceTotal: 86 },
  ]);
  const reviewerB = reviewerCsv([
    { assessmentId: "assessment-1:clinical-scale", clinicalScaleEstimateVersion: CLINICAL_SCALE_ESTIMATE_VERSION - 1, houseBrackmannGrade: "III", sunnybrookComposite: 76, efaceTotal: 73 },
    { assessmentId: "assessment-2:clinical-scale", clinicalScaleEstimateVersion: CLINICAL_SCALE_ESTIMATE_VERSION, houseBrackmannGrade: "II", sunnybrookComposite: 88, efaceTotal: 86 },
  ]);

  const report = compareClinicalScaleReviewerLabels(reviewerA, reviewerB, {
    generatedAt: "2026-06-24T12:00:00.000Z",
  });

  assert.equal(report.summary.reviewerAEstimateVersionCounts[CURRENT_ESTIMATOR_VERSION_KEY], 1);
  assert.equal(report.summary.reviewerAEstimateVersionCounts.missing, 1);
  assert.equal(report.summary.reviewerBEstimateVersionCounts[PREVIOUS_ESTIMATOR_VERSION_KEY], 1);
  assert.equal(report.summary.reviewerBEstimateVersionCounts[CURRENT_ESTIMATOR_VERSION_KEY], 1);
  assert.equal(report.summary.reviewerAStaleOrMissingEstimateVersionCount, 1);
  assert.equal(report.summary.reviewerBStaleOrMissingEstimateVersionCount, 1);
  assert.equal(report.summary.reviewerAInsufficientEstimateEvidenceCount, 0);
  assert.equal(report.summary.reviewerBInsufficientEstimateEvidenceCount, 0);
  assert.equal(report.summary.eligibleReviewerPairCount, 0);
  assert.equal(report.summary.excludedReviewerPairCount, 2);
  assert.equal(report.summary.excludedReviewerPairReasons["reviewer sheets have mismatched estimator versions"], 2);
  assert.equal(report.summary.estimateVersionMismatchCount, 2);
  assert.equal(report.summary.estimateEvidenceMismatchCount, 0);
  assert.equal(report.estimateVersionMismatches.length, 2);
  assert.match(report.blockingReasons.join("\n"), new RegExp(`reviewerA: 1 labels are missing or not estimator v${CLINICAL_SCALE_ESTIMATE_VERSION}`));
  assert.match(report.blockingReasons.join("\n"), new RegExp(`reviewerB: 1 labels are missing or not estimator v${CLINICAL_SCALE_ESTIMATE_VERSION}`));
  assert.match(report.blockingReasons.join("\n"), /reviewer sheets disagree for 2 assessment labels/);
  assert.match(report.adjudicationRows[0].disagreementSummary, /Estimator version/);
  assert.equal(report.adjudicationRows.find((row) => row.assessmentId === "assessment-1:clinical-scale").clinicalScaleEstimateVersion, "");
});

test("clinical-scale reviewer agreement blocks insufficient estimate evidence provenance", () => {
  const reviewerA = reviewerCsv([
    {
      assessmentId: "assessment-1:clinical-scale",
      estimateStatus: "insufficient-data",
      houseBrackmannGrade: "III",
      sunnybrookComposite: 76,
      efaceTotal: 73,
    },
  ]);
  const reviewerB = reviewerCsv([
    {
      assessmentId: "assessment-1:clinical-scale",
      estimateEvidenceTier: "insufficient-standard-evidence",
      estimateUsableMovementCoverageRatio: 0.6,
      estimateUsableMovementCount: 3,
      houseBrackmannGrade: "III",
      sunnybrookComposite: 76,
      efaceTotal: 73,
    },
  ]);

  const report = compareClinicalScaleReviewerLabels(reviewerA, reviewerB, {
    generatedAt: "2026-06-24T12:00:00.000Z",
  });

  assert.equal(report.summary.reviewerAInsufficientEstimateEvidenceCount, 1);
  assert.equal(report.summary.reviewerBInsufficientEstimateEvidenceCount, 1);
  assert.equal(report.summary.eligibleReviewerPairCount, 0);
  assert.equal(report.byScale.houseBrackmannGrade.pairedCount, 0);
  assert.equal(report.summary.estimateEvidenceMismatchCount, 1);
  assert.equal(report.summary.reviewerAIneligibleReasons["clinical scale estimate status is not estimated"], 1);
  assert.equal(report.summary.reviewerBIneligibleReasons["clinical scale estimate evidence tier is missing or insufficient"], 1);
  assert.equal(report.summary.reviewerBIneligibleReasons["clinical scale estimate movement coverage is below the minimum standard"], 1);
  assert.match(report.blockingReasons.join("\n"), /estimate evidence gates/);
  assert.match(report.blockingReasons.join("\n"), /estimateEvidence: reviewer sheets disagree/);
  assert.match(report.adjudicationRows[0].disagreementSummary, /Estimate evidence/);
});

test("clinical-scale reviewer agreement blocks reviewer sheets without movement provenance columns", () => {
  const rows = [{
    assessmentId: "assessment-1:clinical-scale",
    houseBrackmannGrade: "III",
    sunnybrookComposite: 76,
    efaceTotal: 73,
  }];

  const report = compareClinicalScaleReviewerLabels(
    legacyReviewerCsvWithoutMovementProvenance(rows),
    legacyReviewerCsvWithoutMovementProvenance(rows),
    { generatedAt: "2026-06-24T12:00:00.000Z" },
  );

  assert.equal(report.summary.reviewerAEligibleAssessmentCount, 0);
  assert.equal(report.summary.reviewerBEligibleAssessmentCount, 0);
  assert.equal(report.summary.reviewerAInsufficientEstimateEvidenceCount, 1);
  assert.equal(report.summary.reviewerBInsufficientEstimateEvidenceCount, 1);
  assert.equal(report.summary.eligibleReviewerPairCount, 0);
  assert.equal(report.summary.excludedReviewerPairCount, 1);
  assert.equal(report.summary.estimateEvidenceMismatchCount, 0);
  assert.equal(report.summary.reviewerAIneligibleReasons["clinical scale estimate movement provenance is missing"], 1);
  assert.equal(report.summary.reviewerBIneligibleReasons["clinical scale estimate usable-movement calculation flag is missing or false"], 1);
  assert.equal(report.summary.excludedReviewerPairReasons["reviewer A: clinical scale estimate movement provenance is missing"], 1);
  assert.equal(report.summary.excludedReviewerPairReasons["reviewer B: clinical scale estimate movement provenance is missing"], 1);
  assert.equal(report.byScale.houseBrackmannGrade.pairedCount, 0);
  assert.match(report.blockingReasons.join("\n"), /estimate evidence gates/);
});

test("clinical-scale reviewer agreement blocks reviewer sheets without scale input provenance columns", () => {
  const rows = [{
    assessmentId: "assessment-1:clinical-scale",
    houseBrackmannGrade: "III",
    sunnybrookComposite: 76,
    efaceTotal: 73,
  }];

  const report = compareClinicalScaleReviewerLabels(
    legacyReviewerCsvWithoutScaleInputProvenance(rows),
    legacyReviewerCsvWithoutScaleInputProvenance(rows),
    { generatedAt: "2026-06-24T12:00:00.000Z" },
  );

  assert.equal(report.summary.reviewerAEligibleAssessmentCount, 0);
  assert.equal(report.summary.reviewerBEligibleAssessmentCount, 0);
  assert.equal(report.summary.reviewerAInsufficientEstimateEvidenceCount, 1);
  assert.equal(report.summary.reviewerBInsufficientEstimateEvidenceCount, 1);
  assert.equal(report.summary.eligibleReviewerPairCount, 0);
  assert.equal(report.summary.excludedReviewerPairCount, 1);
  assert.equal(report.summary.estimateEvidenceMismatchCount, 0);
  assert.equal(report.summary.reviewerAIneligibleReasons["clinical scale estimate Sunnybrook input provenance is missing"], 1);
  assert.equal(report.summary.reviewerAIneligibleReasons["clinical scale estimate eFACE input provenance is missing"], 1);
  assert.equal(report.summary.reviewerBIneligibleReasons["clinical scale estimate Sunnybrook input complete flag is missing"], 1);
  assert.equal(report.summary.excludedReviewerPairReasons["reviewer A: clinical scale estimate Sunnybrook input provenance is missing"], 1);
  assert.equal(report.summary.excludedReviewerPairReasons["reviewer B: clinical scale estimate eFACE input provenance is missing"], 1);
  assert.equal(report.byScale.sunnybrookComposite.pairedCount, 0);
  assert.equal(report.byScale.efaceTotal.pairedCount, 0);
  assert.match(report.blockingReasons.join("\n"), /estimate evidence gates/);
});

test("clinical-scale reviewer agreement blocks incomplete resting-metric provenance", () => {
  const reviewerA = reviewerCsv([
    {
      assessmentId: "assessment-1:clinical-scale",
      estimateAvailableRestingMetricKeys: "palpebralFissure|oralCommissure",
      estimateMissingRestingMetricKeys: "nasolabialMidface",
      estimateCalculationUsesCompleteRestingMetrics: "false",
      houseBrackmannGrade: "III",
      sunnybrookComposite: 76,
      efaceTotal: 73,
    },
  ]);
  const reviewerB = reviewerCsv([
    {
      assessmentId: "assessment-1:clinical-scale",
      houseBrackmannGrade: "III",
      sunnybrookComposite: 76,
      efaceTotal: 73,
    },
  ]);

  const report = compareClinicalScaleReviewerLabels(reviewerA, reviewerB, {
    generatedAt: "2026-06-24T12:00:00.000Z",
  });

  assert.equal(report.summary.reviewerAEligibleAssessmentCount, 0);
  assert.equal(report.summary.reviewerBEligibleAssessmentCount, 1);
  assert.equal(report.summary.reviewerAInsufficientEstimateEvidenceCount, 1);
  assert.equal(report.summary.eligibleReviewerPairCount, 0);
  assert.equal(report.summary.estimateEvidenceMismatchCount, 1);
  assert.equal(report.summary.reviewerAIneligibleReasons["clinical scale estimate complete-resting-metrics flag is missing or false"], 1);
  assert.equal(report.summary.reviewerAIneligibleReasons["clinical scale estimate resting-metric provenance is inconsistent"], 1);
  assert.equal(report.summary.excludedReviewerPairReasons["reviewer A: clinical scale estimate resting-metric provenance is inconsistent"], 1);
  assert.match(report.adjudicationRows[0].disagreementSummary, /Estimate evidence/);
});

test("clinical-scale reviewer agreement blocks mismatched omitted movement provenance", () => {
  const reviewerA = reviewerCsv([
    {
      assessmentId: "assessment-1:clinical-scale",
      estimateEvidenceTier: "minimum-standard-assessment",
      estimateUsableMovementCoverageRatio: 0.8,
      estimateUsableMovementCount: 4,
      estimateRequiredMovementCount: 5,
      estimateUsedMovementExerciseIds: "eyebrow-raise|eye-close|open-smile|nose-wrinkle",
      estimateOmittedMovementExerciseIds: "pucker",
      houseBrackmannGrade: "III",
      sunnybrookComposite: 76,
      efaceTotal: 73,
    },
  ]);
  const reviewerB = reviewerCsv([
    {
      assessmentId: "assessment-1:clinical-scale",
      estimateEvidenceTier: "minimum-standard-assessment",
      estimateUsableMovementCoverageRatio: 0.8,
      estimateUsableMovementCount: 4,
      estimateRequiredMovementCount: 5,
      estimateUsedMovementExerciseIds: "eye-close|open-smile|nose-wrinkle|pucker",
      estimateOmittedMovementExerciseIds: "eyebrow-raise",
      houseBrackmannGrade: "III",
      sunnybrookComposite: 76,
      efaceTotal: 73,
    },
  ]);

  const report = compareClinicalScaleReviewerLabels(reviewerA, reviewerB, {
    generatedAt: "2026-06-24T12:00:00.000Z",
  });

  assert.equal(report.summary.eligibleReviewerPairCount, 0);
  assert.equal(report.summary.excludedReviewerPairCount, 1);
  assert.equal(report.summary.excludedReviewerPairReasons["reviewer sheets have mismatched estimate evidence"], 1);
  assert.equal(report.summary.estimateEvidenceMismatchCount, 1);
  assert.equal(report.byScale.houseBrackmannGrade.pairedCount, 0);
  assert.match(report.blockingReasons.join("\n"), /estimateEvidence: reviewer sheets disagree for 1 assessment labels/);
  assert.match(report.adjudicationRows[0].disagreementSummary, /Estimate evidence/);
  assert.equal(report.adjudicationRows[0].estimateUsedMovementExerciseIds, "");
  assert.equal(report.adjudicationRows[0].reviewerAEstimateOmittedMovementExerciseIds, "pucker");
  assert.equal(report.adjudicationRows[0].reviewerBEstimateOmittedMovementExerciseIds, "eyebrow-raise");
});

test("clinical-scale reviewer agreement skips incomplete Sunnybrook and eFACE estimate inputs by scale", () => {
  const partialEstimate = {
    assessmentId: "assessment-1:clinical-scale",
    estimateEvidenceTier: "minimum-standard-assessment",
    estimateUsableMovementCoverageRatio: 0.8,
    estimateUsableMovementCount: 4,
    estimateRequiredMovementCount: 5,
    estimateUsedMovementExerciseIds: "eyebrow-raise|eye-close|open-smile|nose-wrinkle",
    estimateOmittedMovementExerciseIds: "pucker",
    houseBrackmannGrade: "III",
    sunnybrookComposite: 76,
    efaceTotal: 73,
  };
  const report = compareClinicalScaleReviewerLabels(
    reviewerCsv([partialEstimate]),
    reviewerCsv([partialEstimate]),
    {
      generatedAt: "2026-06-24T12:00:00.000Z",
      minPairedLabels: 1,
      minAgreementWilsonLowerBound: 0,
    },
  );

  assert.equal(report.summary.eligibleReviewerPairCount, 1);
  assert.equal(report.summary.excludedReviewerPairCount, 0);
  assert.equal(report.byScale.houseBrackmannGrade.pairedCount, 1);
  assert.equal(report.byScale.houseBrackmannGrade.meetsMinimumStandard, true);
  assert.equal(report.byScale.sunnybrookComposite.pairedCount, 0);
  assert.equal(report.byScale.sunnybrookComposite.incompleteEstimateInputCount, 1);
  assert.equal(report.byScale.efaceTotal.pairedCount, 0);
  assert.equal(report.byScale.efaceTotal.incompleteEstimateInputCount, 1);
  assert.equal(report.summary.readyPrimaryScaleCount, 1);
  assert.match(report.blockingReasons.join("\n"), /sunnybrookComposite:.*incomplete scale-specific estimate input/);
  assert.match(report.blockingReasons.join("\n"), /efaceTotal:.*incomplete scale-specific estimate input/);
});

test("clinical-scale reviewer agreement blocks missing House-Brackmann input provenance", () => {
  const reviewerA = reviewerCsv([
    {
      assessmentId: "assessment-1:clinical-scale",
      estimateEvidenceTier: "minimum-standard-assessment",
      estimateUsableMovementCoverageRatio: 0.8,
      estimateUsableMovementCount: 4,
      estimateRequiredMovementCount: 5,
      estimateUsedMovementExerciseIds: "eyebrow-raise|open-smile|nose-wrinkle|pucker",
      estimateOmittedMovementExerciseIds: "eye-close",
      estimateHouseBrackmannInputComplete: "false",
      estimateHouseBrackmannUsedExerciseIds: "eyebrow-raise|open-smile|nose-wrinkle|pucker",
      estimateHouseBrackmannMissingRequiredExerciseIds: "eye-close",
      houseBrackmannGrade: "III",
      sunnybrookComposite: 76,
      efaceTotal: 73,
    },
  ]);
  const reviewerB = reviewerCsv([
    {
      assessmentId: "assessment-1:clinical-scale",
      houseBrackmannGrade: "III",
      sunnybrookComposite: 76,
      efaceTotal: 73,
    },
  ]);

  const report = compareClinicalScaleReviewerLabels(reviewerA, reviewerB, {
    generatedAt: "2026-06-24T12:00:00.000Z",
  });

  assert.equal(report.summary.reviewerAEligibleAssessmentCount, 0);
  assert.equal(report.summary.reviewerBEligibleAssessmentCount, 1);
  assert.equal(report.summary.reviewerAInsufficientEstimateEvidenceCount, 1);
  assert.equal(report.summary.eligibleReviewerPairCount, 0);
  assert.equal(report.summary.excludedReviewerPairCount, 1);
  assert.equal(report.summary.reviewerAIneligibleReasons["clinical scale estimate House-Brackmann input complete flag is missing or false"], 1);
  assert.equal(report.summary.reviewerAIneligibleReasons["clinical scale estimate House-Brackmann input provenance is inconsistent"], 1);
  assert.equal(report.summary.excludedReviewerPairReasons["reviewer A: clinical scale estimate House-Brackmann input complete flag is missing or false"], 1);
  assert.match(report.adjudicationRows[0].disagreementSummary, /Estimate evidence/);
});

test("clinical-scale reviewer agreement blocks unblinded or non-independent reviewer sheets", () => {
  const reviewerA = reviewerCsv([
    {
      assessmentId: "assessment-1:clinical-scale",
      houseBrackmannGrade: "III",
      sunnybrookComposite: 76,
      efaceTotal: 73,
      sourceLabelSheetMode: "unblinded",
      reviewBlinded: "no",
      labelSource: "copied from Mirror estimate",
      reviewerRole: "developer rehearsal",
    },
  ]);
  const reviewerB = reviewerCsv([
    {
      assessmentId: "assessment-1:clinical-scale",
      houseBrackmannGrade: "III",
      sunnybrookComposite: 76,
      efaceTotal: 73,
      clinicianConfidence: "uncertain",
      labelSource: "",
    },
  ]);

  const report = compareClinicalScaleReviewerLabels(reviewerA, reviewerB, {
    generatedAt: "2026-06-24T12:00:00.000Z",
  });

  assert.equal(report.summary.reviewerAEligibleAssessmentCount, 0);
  assert.equal(report.summary.reviewerBEligibleAssessmentCount, 0);
  assert.equal(report.summary.eligibleReviewerPairCount, 0);
  assert.equal(report.summary.excludedReviewerPairCount, 1);
  assert.equal(report.byScale.houseBrackmannGrade.pairedCount, 0);
  assert.equal(report.summary.reviewerAIneligibleAssessmentCount, 1);
  assert.equal(report.summary.reviewerBIneligibleAssessmentCount, 1);
  assert.equal(report.summary.reviewerAIneligibleReasons["reviewer role is marked non-clinical or rehearsal"], 1);
  assert.equal(report.summary.reviewerAIneligibleReasons["source label sheet was not generated in blinded mode"], 1);
  assert.equal(report.summary.reviewerAIneligibleReasons["review was not marked blinded to Mirror estimates"], 1);
  assert.equal(report.summary.reviewerAIneligibleReasons["label source is marked non-independent or copied"], 1);
  assert.equal(report.summary.reviewerBIneligibleReasons["clinician confidence is uncertain"], 1);
  assert.equal(report.summary.reviewerBIneligibleReasons["missing independent clinical label source"], 1);
  assert.equal(report.reviewerSheetIssues.length, 2);
  assert.match(report.blockingReasons.join("\n"), /reviewerA: 1 labels do not meet blinded independent clinical review metadata/);
  assert.match(report.blockingReasons.join("\n"), /reviewerB: 1 labels do not meet blinded independent clinical review metadata/);
});
