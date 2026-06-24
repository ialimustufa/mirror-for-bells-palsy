import assert from "node:assert/strict";
import test from "node:test";
import { CLINICAL_SCALE_ESTIMATE_VERSION } from "../src/domain/clinicalScales.js";
import {
  BLINDED_LABEL_SHEET_FILE,
  CLINICAL_REVIEW_PACKAGE_KIND,
  CLINICAL_REVIEW_PACKAGE_SCHEMA_VERSION,
  MANIFEST_FILE,
  REVIEWER_INSTRUCTIONS_FILE,
  buildClinicalReviewPackage,
} from "../src/ml/clinicalReviewPackage.js";
import { parseCsv } from "../src/ml/validationLabels.js";

function sampleRecords() {
  return [
    {
      kind: "mirror-validation-dataset-jsonl",
      appId: "mirror-bells-palsy",
      version: 1,
      exportedAt: "2026-06-24T09:00:00.000Z",
      summary: {
        frameSamples: 1,
        assessmentClinicalScaleRecords: 1,
        dateRange: { from: "2026-06-23", to: "2026-06-23" },
      },
      labelSchema: { version: 7 },
    },
    {
      section: "frameSample",
      record: {
        id: "sample-1",
        sessionId: "session-1",
        exerciseId: "closed-smile",
        phase: "hold",
        ts: 100,
        frame: { id: "sample-1", sessionId: "session-1", exerciseId: "closed-smile", phase: "hold" },
        label: { intendedMovement: "closed-smile" },
      },
    },
    {
      section: "assessmentClinicalScale",
      record: {
        id: "assessment-1:clinical-scale",
        sessionId: "assessment-1",
        sessionTs: 200,
        date: "2026-06-23",
        kind: "assessment-clinical-scale",
        estimate: {
          status: "estimated",
          version: CLINICAL_SCALE_ESTIMATE_VERSION,
          evidence: {
            tier: "complete-standard-assessment",
            estimatedMovementExerciseIds: ["eyebrow-raise", "eye-close", "open-smile", "nose-wrinkle", "pucker"],
            omittedMovementExerciseIds: [],
            calculationUsesOnlyUsableMovements: true,
            scaleInputCompleteness: {
              houseBrackmann: {
                requiredExerciseIds: ["eye-close"],
                usedExerciseIds: ["eye-close"],
                missingRequiredExerciseIds: [],
                complete: true,
              },
              sunnybrook: {
                usedExerciseIds: ["eyebrow-raise", "eye-close", "open-smile", "nose-wrinkle", "pucker"],
                omittedExerciseIds: [],
                complete: true,
              },
              eface: {
                usedExerciseIds: ["eyebrow-raise", "eye-close", "open-smile", "nose-wrinkle", "pucker"],
                omittedExerciseIds: [],
                complete: true,
              },
            },
            requiredRestingMetricKeys: ["palpebralFissure", "nasolabialMidface", "oralCommissure"],
            availableRestingMetricKeys: ["palpebralFissure", "nasolabialMidface", "oralCommissure"],
            missingRestingMetricKeys: [],
            calculationUsesCompleteRestingMetrics: true,
          },
          coverage: { usableMovementCount: 5, requiredMovementCount: 5, ratio: 1 },
          scales: {
            houseBrackmann: { grade: "II", numericGrade: 2 },
            sunnybrook: { compositeScore: 82 },
            eface: { totalScore: 79, staticScore: 91, dynamicScore: 77, synkinesisScore: 69 },
          },
        },
        label: {
          validationCaseId: null,
          houseBrackmannGrade: null,
          sunnybrookComposite: null,
          efaceTotal: null,
          reviewBlinded: null,
          labelSource: null,
          reviewerId: null,
        },
      },
    },
  ];
}

const SAMPLE_DATASET_SHA256 = "a".repeat(64);

test("clinical review package creates a blinded sheet and audit manifest", () => {
  const reviewPackage = buildClinicalReviewPackage(sampleRecords(), {
    createdAt: "2026-06-24T10:00:00.000Z",
    packageId: "review-pack-001",
    sourceDatasetPath: "validation-dataset.jsonl",
    sourceDatasetSha256: SAMPLE_DATASET_SHA256,
  });
  const { manifest } = reviewPackage;
  const rows = parseCsv(reviewPackage.labelSheetCsv);
  const header = rows[0];
  const clinicalRow = rows[2];
  const index = Object.fromEntries(header.map((column, columnIndex) => [column, columnIndex]));

  assert.equal(manifest.kind, CLINICAL_REVIEW_PACKAGE_KIND);
  assert.equal(manifest.schemaVersion, CLINICAL_REVIEW_PACKAGE_SCHEMA_VERSION);
  assert.equal(manifest.packageId, "review-pack-001");
  assert.equal(manifest.sourceDataset.sha256, SAMPLE_DATASET_SHA256);
  assert.equal(manifest.sourceDataset.path, "validation-dataset.jsonl");
  assert.equal(manifest.sourceDataset.exportedAt, "2026-06-24T09:00:00.000Z");
  assert.equal(manifest.files.manifest, MANIFEST_FILE);
  assert.equal(manifest.files.blindedLabelSheet, BLINDED_LABEL_SHEET_FILE);
  assert.equal(manifest.files.reviewerInstructions, REVIEWER_INSTRUCTIONS_FILE);
  assert.equal(manifest.labelSheet.blinded, true);
  assert.equal(manifest.labelSheet.includeEstimateValueColumns, false);
  assert.equal(manifest.labelSheet.preservesEstimateProvenanceColumns, true);
  assert.equal(manifest.labelSheet.assessmentClinicalScaleRows, 1);
  assert.equal(manifest.labelSheet.frameSampleRows, 1);
  assert.equal(manifest.labelSheet.primaryTargetFields.join("|"), "houseBrackmannGrade|sunnybrookComposite|efaceTotal");
  assert.equal(manifest.clinicalScaleEstimator.version, CLINICAL_SCALE_ESTIMATE_VERSION);
  assert.equal(manifest.clinicalScaleEstimator.currentVersionComparableRows, 1);
  assert.equal(manifest.clinicalScaleEstimator.completeStandardEvidenceRows, 1);
  assert.equal(manifest.releaseReadinessStandard.minAgreementRate, 0.8);
  assert.equal(manifest.releaseReadinessStandard.minAgreementWilsonLowerBound, 0.8);
  assert.equal(manifest.controls.clinicalFacingScoresAllowedByThisPackage, false);
  assert.equal(manifest.controls.reviewerMustNotSeeMirrorEstimateValuesBeforePrimaryTargetAssignment, true);

  assert.equal(clinicalRow[index.rowType], "assessmentClinicalScale");
  assert.equal(clinicalRow[index.sourceLabelSheetMode], "blinded");
  assert.equal(clinicalRow[index.estimatedHouseBrackmannGrade], "");
  assert.equal(clinicalRow[index.estimatedSunnybrookComposite], "");
  assert.equal(clinicalRow[index.estimatedEfaceTotal], "");
  assert.equal(clinicalRow[index.estimateStatus], "estimated");
  assert.equal(clinicalRow[index.estimateUsableMovementCoverageRatio], "1");
  assert.equal(clinicalRow[index.clinicalScaleEstimateVersion], String(CLINICAL_SCALE_ESTIMATE_VERSION));
  assert.match(reviewPackage.reviewerInstructionsMarkdown, /Mirror estimate values are hidden/);
  assert.match(reviewPackage.reviewerInstructionsMarkdown, /Wilson 95% lower bound/);
});

test("clinical review package rejects datasets without clinical-scale assessment rows", () => {
  const records = sampleRecords().filter((line) => line.section !== "assessmentClinicalScale");
  assert.throws(
    () => buildClinicalReviewPackage(records, { createdAt: "2026-06-24T10:00:00.000Z", sourceDatasetSha256: SAMPLE_DATASET_SHA256 }),
    /requires at least one assessmentClinicalScale record/,
  );
});

test("clinical review package requires a source dataset SHA-256 hash", () => {
  assert.throws(
    () => buildClinicalReviewPackage(sampleRecords(), { createdAt: "2026-06-24T10:00:00.000Z" }),
    /requires sourceDatasetSha256/,
  );
});
