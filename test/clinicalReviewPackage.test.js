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
  verifyClinicalReviewPackage,
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

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsvRows(rows) {
  return `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
}

function reviewedPackageCsv(reviewPackage) {
  const rows = parseCsv(reviewPackage.labelSheetCsv);
  const header = rows[0];
  const clinicalRow = rows.find((row) => row[0] === "assessmentClinicalScale");
  const index = Object.fromEntries(header.map((column, columnIndex) => [column, columnIndex]));
  clinicalRow[index.validationCaseId] = "case-001";
  clinicalRow[index.houseBrackmannGrade] = "II";
  clinicalRow[index.sunnybrookComposite] = "82";
  clinicalRow[index.efaceTotal] = "79";
  clinicalRow[index.clinicianConfidence] = "high";
  clinicalRow[index.reviewBlinded] = "yes";
  clinicalRow[index.labelSource] = "clinician-assigned";
  clinicalRow[index.reviewerId] = "reviewer-001";
  clinicalRow[index.reviewerRole] = "clinician";
  clinicalRow[index.reviewedAt] = "2026-06-24T11:00:00.000Z";
  return writeCsvRows(rows);
}

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

test("clinical review package verification accepts reviewed mutable fields", () => {
  const reviewPackage = buildClinicalReviewPackage(sampleRecords(), {
    createdAt: "2026-06-24T10:00:00.000Z",
    packageId: "review-pack-001",
    sourceDatasetPath: "validation-dataset.jsonl",
    sourceDatasetSha256: SAMPLE_DATASET_SHA256,
  });
  const report = verifyClinicalReviewPackage(sampleRecords(), reviewPackage.manifest, reviewedPackageCsv(reviewPackage), {
    generatedAt: "2026-06-24T12:00:00.000Z",
    sourceDatasetSha256: SAMPLE_DATASET_SHA256,
  });

  assert.equal(report.status, "passed");
  assert.deepEqual(report.errors, []);
  assert.equal(report.controls.sourceHashMatches, true);
  assert.equal(report.controls.estimateValuesHidden, true);
  assert.equal(report.controls.readOnlyColumnsMatch, true);
  assert.equal(report.summary.assessmentClinicalScaleRows, 1);
});

test("clinical review package verification rejects source hash mismatches", () => {
  const reviewPackage = buildClinicalReviewPackage(sampleRecords(), {
    createdAt: "2026-06-24T10:00:00.000Z",
    packageId: "review-pack-001",
    sourceDatasetPath: "validation-dataset.jsonl",
    sourceDatasetSha256: SAMPLE_DATASET_SHA256,
  });
  const report = verifyClinicalReviewPackage(sampleRecords(), reviewPackage.manifest, reviewPackage.labelSheetCsv, {
    generatedAt: "2026-06-24T12:00:00.000Z",
    sourceDatasetSha256: "b".repeat(64),
  });

  assert.equal(report.status, "failed");
  assert.match(report.errors.join("\n"), /sourceDataset\.sha256/);
  assert.equal(report.controls.sourceHashMatches, false);
});

test("clinical review package verification rejects unblinded estimate values", () => {
  const reviewPackage = buildClinicalReviewPackage(sampleRecords(), {
    createdAt: "2026-06-24T10:00:00.000Z",
    packageId: "review-pack-001",
    sourceDatasetPath: "validation-dataset.jsonl",
    sourceDatasetSha256: SAMPLE_DATASET_SHA256,
  });
  const rows = parseCsv(reviewPackage.labelSheetCsv);
  const header = rows[0];
  const clinicalRow = rows.find((row) => row[0] === "assessmentClinicalScale");
  const index = Object.fromEntries(header.map((column, columnIndex) => [column, columnIndex]));
  clinicalRow[index.estimatedSunnybrookComposite] = "82";

  const report = verifyClinicalReviewPackage(sampleRecords(), reviewPackage.manifest, writeCsvRows(rows), {
    generatedAt: "2026-06-24T12:00:00.000Z",
    sourceDatasetSha256: SAMPLE_DATASET_SHA256,
  });

  assert.equal(report.status, "failed");
  assert.match(report.errors.join("\n"), /estimatedSunnybrookComposite must remain hidden/);
  assert.equal(report.controls.estimateValuesHidden, false);
});

test("clinical review package verification rejects a loosened release standard in the manifest", () => {
  const reviewPackage = buildClinicalReviewPackage(sampleRecords(), {
    createdAt: "2026-06-24T10:00:00.000Z",
    packageId: "review-pack-001",
    sourceDatasetPath: "validation-dataset.jsonl",
    sourceDatasetSha256: SAMPLE_DATASET_SHA256,
  });
  const tamperedManifest = JSON.parse(JSON.stringify(reviewPackage.manifest));
  tamperedManifest.releaseReadinessStandard.minReviewedAssessments = 1;
  tamperedManifest.controls.requiresPseudonymousReviewerId = false;

  const report = verifyClinicalReviewPackage(sampleRecords(), tamperedManifest, reviewedPackageCsv(reviewPackage), {
    generatedAt: "2026-06-24T12:00:00.000Z",
    sourceDatasetSha256: SAMPLE_DATASET_SHA256,
  });

  assert.equal(report.status, "failed");
  assert.match(report.errors.join("\n"), /releaseReadinessStandard\.minReviewedAssessments must match/);
  assert.match(report.errors.join("\n"), /controls\.requiresPseudonymousReviewerId must match/);
});

test("clinical review package verification rejects an extra fabricated manifest field", () => {
  const reviewPackage = buildClinicalReviewPackage(sampleRecords(), {
    createdAt: "2026-06-24T10:00:00.000Z",
    packageId: "review-pack-001",
    sourceDatasetPath: "validation-dataset.jsonl",
    sourceDatasetSha256: SAMPLE_DATASET_SHA256,
  });
  const tamperedManifest = JSON.parse(JSON.stringify(reviewPackage.manifest));
  tamperedManifest.controls.clinicalFacingScoresAllowedByThisPackage = true;

  const report = verifyClinicalReviewPackage(sampleRecords(), tamperedManifest, reviewedPackageCsv(reviewPackage), {
    generatedAt: "2026-06-24T12:00:00.000Z",
    sourceDatasetSha256: SAMPLE_DATASET_SHA256,
  });

  assert.equal(report.status, "failed");
  assert.match(report.errors.join("\n"), /controls\.clinicalFacingScoresAllowedByThisPackage must match/);
});

test("clinical review package verification accepts an uppercase source hash", () => {
  const reviewPackage = buildClinicalReviewPackage(sampleRecords(), {
    createdAt: "2026-06-24T10:00:00.000Z",
    packageId: "review-pack-001",
    sourceDatasetPath: "validation-dataset.jsonl",
    sourceDatasetSha256: SAMPLE_DATASET_SHA256,
  });
  const report = verifyClinicalReviewPackage(sampleRecords(), reviewPackage.manifest, reviewedPackageCsv(reviewPackage), {
    generatedAt: "2026-06-24T12:00:00.000Z",
    sourceDatasetSha256: SAMPLE_DATASET_SHA256.toUpperCase(),
  });

  assert.equal(report.status, "passed");
  assert.equal(report.controls.sourceHashMatches, true);
  assert.equal(report.sourceDatasetSha256, SAMPLE_DATASET_SHA256);
});

test("clinical review package verification rejects a truncated label row", () => {
  const reviewPackage = buildClinicalReviewPackage(sampleRecords(), {
    createdAt: "2026-06-24T10:00:00.000Z",
    packageId: "review-pack-001",
    sourceDatasetPath: "validation-dataset.jsonl",
    sourceDatasetSha256: SAMPLE_DATASET_SHA256,
  });
  const rows = parseCsv(reviewPackage.labelSheetCsv);
  const clinicalRow = rows.find((row) => row[0] === "assessmentClinicalScale");
  clinicalRow.pop();

  const report = verifyClinicalReviewPackage(sampleRecords(), reviewPackage.manifest, writeCsvRows(rows), {
    generatedAt: "2026-06-24T12:00:00.000Z",
    sourceDatasetSha256: SAMPLE_DATASET_SHA256,
  });

  assert.equal(report.status, "failed");
  assert.match(report.errors.join("\n"), /label sheet row must have/);
  assert.equal(report.controls.rowIdentityMatches, false);
});

test("clinical review package verification rejects changed read-only provenance", () => {
  const reviewPackage = buildClinicalReviewPackage(sampleRecords(), {
    createdAt: "2026-06-24T10:00:00.000Z",
    packageId: "review-pack-001",
    sourceDatasetPath: "validation-dataset.jsonl",
    sourceDatasetSha256: SAMPLE_DATASET_SHA256,
  });
  const rows = parseCsv(reviewPackage.labelSheetCsv);
  const header = rows[0];
  const clinicalRow = rows.find((row) => row[0] === "assessmentClinicalScale");
  const index = Object.fromEntries(header.map((column, columnIndex) => [column, columnIndex]));
  clinicalRow[index.clinicalScaleEstimateVersion] = String(CLINICAL_SCALE_ESTIMATE_VERSION - 1);

  const report = verifyClinicalReviewPackage(sampleRecords(), reviewPackage.manifest, writeCsvRows(rows), {
    generatedAt: "2026-06-24T12:00:00.000Z",
    sourceDatasetSha256: SAMPLE_DATASET_SHA256,
  });

  assert.equal(report.status, "failed");
  assert.match(report.errors.join("\n"), /read-only column clinicalScaleEstimateVersion/);
  assert.equal(report.controls.readOnlyColumnsMatch, false);
});
