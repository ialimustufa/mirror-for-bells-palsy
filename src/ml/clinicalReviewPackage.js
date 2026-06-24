import { CLINICAL_SCALE_ESTIMATE_VERSION } from "../domain/clinicalScales.js";
import {
  VALIDATION_DATASET_APP_ID,
  VALIDATION_DATASET_KIND,
  VALIDATION_DATASET_VERSION,
  VALIDATION_LABEL_SCHEMA_VERSION,
} from "../domain/validationDataset.js";
import {
  DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD,
  HOUSE_BRACKMANN_SEVERITY_BANDS,
} from "./validationEvaluation.js";
import { LABEL_COLUMNS, createValidationLabelCsv, parseCsv, validationLabelRows } from "./validationLabels.js";

const CLINICAL_REVIEW_PACKAGE_KIND = "mirror-clinical-scale-review-package";
const CLINICAL_REVIEW_PACKAGE_SCHEMA_VERSION = 1;
const CLINICAL_REVIEW_PACKAGE_VERIFICATION_KIND = "mirror-clinical-scale-review-package-verification";
const CLINICAL_REVIEW_PACKAGE_VERIFICATION_SCHEMA_VERSION = 1;
const BLINDED_LABEL_SHEET_FILE = "blinded-labels.csv";
const REVIEWER_INSTRUCTIONS_FILE = "reviewer-instructions.md";
const MANIFEST_FILE = "manifest.json";

const PRIMARY_TARGET_FIELDS = Object.freeze([
  "houseBrackmannGrade",
  "sunnybrookComposite",
  "efaceTotal",
]);

const OPTIONAL_DOMAIN_TARGET_FIELDS = Object.freeze([
  "efaceStatic",
  "efaceDynamic",
  "efaceSynkinesis",
]);

const REQUIRED_REVIEW_METADATA_FIELDS = Object.freeze([
  "validationCaseId",
  "sourceLabelSheetMode",
  "reviewBlinded",
  "labelSource",
  "reviewerId",
  "reviewerRole",
  "clinicianConfidence",
  "reviewedAt",
]);

const ESTIMATE_VALUE_COLUMNS = Object.freeze([
  "estimatedHouseBrackmannGrade",
  "estimatedHouseBrackmannNumericGrade",
  "estimatedSunnybrookComposite",
  "estimatedEfaceTotal",
  "estimatedEfaceStatic",
  "estimatedEfaceDynamic",
  "estimatedEfaceSynkinesis",
]);

const FRAME_REVIEW_MUTABLE_COLUMNS = new Set([
  "intendedMovement",
  "affectedSide",
  "quality",
  "visibleMovementLevel",
  "coactivationNotes",
  "reviewerId",
  "reviewerRole",
  "reviewedAt",
  "notes",
]);

const ASSESSMENT_REVIEW_MUTABLE_COLUMNS = new Set([
  "validationCaseId",
  "houseBrackmannGrade",
  "sunnybrookComposite",
  "efaceTotal",
  "efaceStatic",
  "efaceDynamic",
  "efaceSynkinesis",
  "clinicianConfidence",
  "reviewBlinded",
  "labelSource",
  "reviewerId",
  "reviewerRole",
  "reviewedAt",
  "notes",
]);

function recordArray(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

function validationDatasetManifest(records = []) {
  const [manifest] = recordArray(records);
  return manifest?.kind === VALIDATION_DATASET_KIND ? manifest : null;
}

function assessmentClinicalScaleRecords(records = []) {
  return recordArray(records).filter((line) => line.section === "assessmentClinicalScale" && line.record && typeof line.record === "object");
}

function frameSampleRecords(records = []) {
  return recordArray(records).filter((line) => line.section === "frameSample" && line.record && typeof line.record === "object");
}

function currentClinicalEstimate(record = {}) {
  const estimate = record.estimate ?? {};
  const coverage = estimate.coverage ?? {};
  const evidence = estimate.evidence ?? {};
  return Boolean(
    estimate.status === "estimated"
      && estimate.version === CLINICAL_SCALE_ESTIMATE_VERSION
      && DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minUsableMovementCoverageRatio <= coverage.ratio
      && ["complete-standard-assessment", "minimum-standard-assessment"].includes(evidence.tier)
  );
}

function estimateEvidenceTier(record = {}) {
  return record.estimate?.evidence?.tier ?? null;
}

function countClinicalEstimateRows(records = []) {
  const rows = assessmentClinicalScaleRecords(records);
  return {
    total: rows.length,
    currentVersionComparable: rows.filter((line) => currentClinicalEstimate(line.record)).length,
    completeStandardEvidence: rows.filter((line) => estimateEvidenceTier(line.record) === "complete-standard-assessment").length,
    minimumStandardEvidence: rows.filter((line) => estimateEvidenceTier(line.record) === "minimum-standard-assessment").length,
    insufficientEvidence: rows.filter((line) => !currentClinicalEstimate(line.record)).length,
  };
}

function defaultPackageId(createdAt) {
  return `clinical-review-${String(createdAt).replace(/\.\d{3}Z$/, "Z").replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "")}`;
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function addError(errors, condition, message) {
  if (!condition) errors.push(message);
}

function addCategorizedError(errors, controls, controlKey, condition, message) {
  if (!condition) {
    errors.push(message);
    if (controlKey) controls[controlKey] = false;
  }
}

function compactValue(value) {
  return value == null ? "" : String(value);
}

function normalizeSha256(value) {
  return compactValue(value).trim().toLowerCase();
}

// Walk the manifest the package SHOULD have (rebuilt from the dataset) against the
// one that was shipped and report every leaf that differs, including fields absent on
// either side. This replaces the previous cherry-picked field checks so a hand-edited
// manifest cannot loosen any release-standard or control value and still verify.
function collectManifestMismatches(expected, actual, skip, path = "", mismatches = []) {
  if (skip.has(path)) return mismatches;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      mismatches.push(path);
      return mismatches;
    }
    expected.forEach((item, index) => collectManifestMismatches(item, actual[index], skip, `${path}[${index}]`, mismatches));
    return mismatches;
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
      mismatches.push(path);
      return mismatches;
    }
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const key of keys) {
      const childPath = path ? `${path}.${key}` : key;
      if (skip.has(childPath)) continue;
      if (!(key in expected) || !(key in actual)) {
        mismatches.push(childPath);
        continue;
      }
      collectManifestMismatches(expected[key], actual[key], skip, childPath, mismatches);
    }
    return mismatches;
  }
  if (expected !== actual) mismatches.push(path);
  return mismatches;
}

function rowKey(row = {}) {
  const rowType = compactValue(row.rowType).trim();
  if (rowType === "assessmentClinicalScale") return `${rowType}:${compactValue(row.assessmentId).trim()}`;
  if (rowType === "frameSample") return `${rowType}:${compactValue(row.sampleId).trim()}`;
  return `${rowType}:`;
}

function mutableColumnsForRowType(rowType) {
  if (rowType === "assessmentClinicalScale") return ASSESSMENT_REVIEW_MUTABLE_COLUMNS;
  if (rowType === "frameSample") return FRAME_REVIEW_MUTABLE_COLUMNS;
  return new Set();
}

function csvObjects(csvText = "", errors = []) {
  const rows = parseCsv(csvText).filter((row) => row.some((cell) => compactValue(cell).trim()));
  if (!rows.length) {
    errors.push("label sheet CSV is empty");
    return [];
  }
  const header = rows[0];
  addError(errors, header.length === LABEL_COLUMNS.length, `label sheet header must have ${LABEL_COLUMNS.length} columns`);
  for (let index = 0; index < LABEL_COLUMNS.length; index += 1) {
    addError(errors, header[index] === LABEL_COLUMNS[index], `label sheet column ${index + 1} must be ${LABEL_COLUMNS[index]}`);
  }
  const indexByHeader = Object.fromEntries(header.map((column, index) => [column, index]));
  return rows.slice(1).map((row) => {
    addError(errors, row.length === LABEL_COLUMNS.length, `label sheet row must have ${LABEL_COLUMNS.length} columns`);
    return Object.fromEntries(LABEL_COLUMNS.map((column) => [column, row[indexByHeader[column]] ?? ""]));
  });
}

function rowsByKey(rows = [], errors = [], label = "rows") {
  const byKey = new Map();
  for (const row of rows) {
    const key = rowKey(row);
    addError(errors, !key.endsWith(":"), `${label} contain a row without a stable id`);
    if (byKey.has(key)) errors.push(`${label} contain duplicate ${key}`);
    byKey.set(key, row);
  }
  return byKey;
}

function countRowsByType(rows = [], rowType) {
  return rows.filter((row) => row.rowType === rowType).length;
}

function buildClinicalReviewManifest(records = [], options = {}) {
  const datasetManifest = validationDatasetManifest(records);
  const clinicalRows = assessmentClinicalScaleRecords(records);
  const frameRows = frameSampleRecords(records);
  const labelRows = validationLabelRows(records, { includeEstimateColumns: false });
  const createdAt = options.createdAt ?? new Date().toISOString();
  const packageId = options.packageId ?? defaultPackageId(createdAt);
  const sourceDatasetSha256 = String(options.sourceDatasetSha256 ?? "").trim();
  const clinicalEstimateRows = countClinicalEstimateRows(records);
  assertCondition(clinicalRows.length > 0, "clinical review package requires at least one assessmentClinicalScale record");
  assertCondition(/^[a-f0-9]{64}$/i.test(sourceDatasetSha256), "clinical review package requires sourceDatasetSha256");

  return {
    kind: CLINICAL_REVIEW_PACKAGE_KIND,
    schemaVersion: CLINICAL_REVIEW_PACKAGE_SCHEMA_VERSION,
    packageId,
    createdAt,
    sourceDataset: {
      path: options.sourceDatasetPath ?? null,
      sha256: sourceDatasetSha256,
      kind: datasetManifest?.kind ?? null,
      appId: datasetManifest?.appId ?? VALIDATION_DATASET_APP_ID,
      version: datasetManifest?.version ?? VALIDATION_DATASET_VERSION,
      exportedAt: datasetManifest?.exportedAt ?? null,
      summary: datasetManifest?.summary ?? null,
    },
    files: {
      manifest: MANIFEST_FILE,
      blindedLabelSheet: BLINDED_LABEL_SHEET_FILE,
      reviewerInstructions: REVIEWER_INSTRUCTIONS_FILE,
    },
    labelSheet: {
      file: BLINDED_LABEL_SHEET_FILE,
      blinded: true,
      sourceLabelSheetMode: "blinded",
      includeEstimateValueColumns: false,
      preservesEstimateProvenanceColumns: true,
      labelSchemaVersion: datasetManifest?.labelSchema?.version ?? VALIDATION_LABEL_SCHEMA_VERSION,
      columnCount: LABEL_COLUMNS.length,
      rowCount: labelRows.length,
      frameSampleRows: frameRows.length,
      assessmentClinicalScaleRows: clinicalRows.length,
      primaryTargetFields: PRIMARY_TARGET_FIELDS,
      optionalDomainTargetFields: OPTIONAL_DOMAIN_TARGET_FIELDS,
      requiredReviewMetadataFields: REQUIRED_REVIEW_METADATA_FIELDS,
    },
    clinicalScaleEstimator: {
      version: CLINICAL_SCALE_ESTIMATE_VERSION,
      currentVersionComparableRows: clinicalEstimateRows.currentVersionComparable,
      completeStandardEvidenceRows: clinicalEstimateRows.completeStandardEvidence,
      minimumStandardEvidenceRows: clinicalEstimateRows.minimumStandardEvidence,
      insufficientEvidenceRows: clinicalEstimateRows.insufficientEvidence,
    },
    releaseReadinessStandard: {
      minAgreementRate: DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minAgreementRate,
      minAgreementWilsonLowerBound: DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minAgreementWilsonLowerBound,
      confidenceInterval: "wilson-95",
      minReviewedAssessments: DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minReviewedAssessments,
      minDistinctClinicalCases: DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minDistinctClinicalCases,
      minHouseBrackmannSeverityBands: DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minHouseBrackmannSeverityBands,
      minAssessmentsPerSeverityBand: DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minAssessmentsPerSeverityBand,
      minUsableMovementCoverageRatio: DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minUsableMovementCoverageRatio,
      houseBrackmannSeverityBands: HOUSE_BRACKMANN_SEVERITY_BANDS,
      tolerances: {
        houseBrackmannGrade: "within one House-Brackmann grade",
        sunnybrookComposite: "within 10 points",
        efaceTotal: "within 10 points",
      },
    },
    controls: {
      clinicalFacingScoresAllowedByThisPackage: false,
      reviewerMustNotSeeMirrorEstimateValuesBeforePrimaryTargetAssignment: true,
      requiresIndependentClinicianOrAdjudicatedLabels: true,
      requiresPseudonymousValidationCaseId: true,
      requiresPseudonymousReviewerId: true,
      requiresCurrentEstimatorVersionForReleaseCounts: true,
      sourceDatasetHashRequiredForReleaseAudit: true,
    },
  };
}

function createReviewerInstructionsMarkdown(manifest) {
  return `# Mirror Clinical Scale Review Package

Package: ${manifest.packageId}
Created: ${manifest.createdAt}

## Files

- \`${manifest.files.blindedLabelSheet}\`: blinded review sheet. Mirror estimate values are hidden.
- \`${manifest.files.manifest}\`: package manifest with source dataset hash, estimator version, schema versions, and release standard.

## Review Rules

- Fill clinical-scale target fields only from the review material, not from Mirror estimates.
- Keep \`sourceLabelSheetMode\` as \`blinded\` and set \`reviewBlinded\` to \`yes\` only if the reviewer did not see Mirror estimate values before assigning targets.
- Use a pseudonymous \`validationCaseId\` for each participant/case and a pseudonymous \`reviewerId\` for the reviewer or adjudication panel.
- Use \`labelSource\` values such as \`clinician-assigned\` or \`adjudicated-consensus\`; copied, automated, self-reported, demo, test, or rehearsal labels do not count toward release readiness.
- Set \`clinicianConfidence\` to \`high\` or \`medium\` only when the reviewer is confident enough for the row to count. Leave uncertain rows marked \`uncertain\` or blank; those rows are excluded from release counts.
- Set \`reviewedAt\` to the UTC ISO timestamp when the reviewer assigned the label. Rows without a valid review timestamp are excluded from release counts.

## Target Fields

- \`houseBrackmannGrade\`: I-VI or 1-6.
- \`sunnybrookComposite\`: 0-100.
- \`efaceTotal\`: 0-100.
- Optional eFACE domain fields: \`efaceStatic\`, \`efaceDynamic\`, and \`efaceSynkinesis\`, each 0-100.

## After Review

Run:

\`\`\`bash
npm run validation:merge-labels -- validation-dataset.jsonl ${manifest.files.blindedLabelSheet} reviewed-dataset.jsonl
npm run validate:dataset -- reviewed-dataset.jsonl validation-report.json
npm run validation:clinical-readiness -- validation-report.json clinical-readiness-report.json
\`\`\`

This package does not enable clinical-facing scores by itself. Release readiness still requires at least ${manifest.releaseReadinessStandard.minReviewedAssessments} eligible reviewed labels, ${manifest.releaseReadinessStandard.minDistinctClinicalCases} distinct pseudonymous validation cases, at least ${Math.round(manifest.releaseReadinessStandard.minAgreementRate * 100)}% observed agreement, and a Wilson 95% lower bound of at least ${Math.round(manifest.releaseReadinessStandard.minAgreementWilsonLowerBound * 100)}% for every enabled primary scale.
`;
}

function buildClinicalReviewPackage(records = [], options = {}) {
  const manifest = buildClinicalReviewManifest(records, options);
  return {
    manifest,
    labelSheetCsv: createValidationLabelCsv(records, { includeEstimateColumns: false }),
    reviewerInstructionsMarkdown: createReviewerInstructionsMarkdown(manifest),
  };
}

function verifyClinicalReviewPackage(records = [], manifest = {}, labelSheetCsv = "", options = {}) {
  const errors = [];
  const controls = { estimateValuesHidden: true, readOnlyColumnsMatch: true };
  const sourceDatasetSha256 = normalizeSha256(options.sourceDatasetSha256);
  const manifestSourceSha256 = normalizeSha256(manifest?.sourceDataset?.sha256);
  const sourceHashIsHex = /^[a-f0-9]{64}$/.test(sourceDatasetSha256);
  const sourceHashMatches = sourceHashIsHex && manifestSourceSha256 === sourceDatasetSha256;

  addError(errors, manifest?.kind === CLINICAL_REVIEW_PACKAGE_KIND, `manifest kind must be ${CLINICAL_REVIEW_PACKAGE_KIND}`);
  addError(errors, manifest?.schemaVersion === CLINICAL_REVIEW_PACKAGE_SCHEMA_VERSION, `manifest schemaVersion must be ${CLINICAL_REVIEW_PACKAGE_SCHEMA_VERSION}`);
  addError(errors, sourceHashIsHex, "sourceDatasetSha256 must be a SHA-256 hex string");
  addError(errors, sourceHashMatches, "manifest sourceDataset.sha256 must match the validation dataset SHA-256");

  // Rebuild the manifest the dataset implies and compare every field, so no shipped
  // field (release-standard floors, control flags, counts) can be loosened undetected.
  // Build with the manifest's own hash placeholder so a malformed source hash does not
  // block the structural comparison — the hash itself is verified separately above.
  let expectedManifest = null;
  try {
    expectedManifest = buildClinicalReviewManifest(records, {
      createdAt: manifest?.createdAt ?? options.generatedAt ?? new Date().toISOString(),
      packageId: manifest?.packageId ?? "clinical-review-package",
      sourceDatasetPath: manifest?.sourceDataset?.path ?? null,
      sourceDatasetSha256: sourceHashIsHex ? sourceDatasetSha256 : "0".repeat(64),
    });
  } catch (error) {
    errors.push(error.message);
  }
  if (expectedManifest) {
    const skip = new Set(["kind", "schemaVersion", "createdAt", "packageId", "sourceDataset.path", "sourceDataset.sha256"]);
    for (const path of collectManifestMismatches(expectedManifest, manifest, skip)) {
      errors.push(`manifest field ${path || "(root)"} must match the package derived from the dataset`);
    }
  }

  const identityErrorStart = errors.length;
  const expectedRows = validationLabelRows(records, { includeEstimateColumns: false });
  const actualRows = csvObjects(labelSheetCsv, errors);
  const expectedByKey = rowsByKey(expectedRows, errors, "expected label sheet rows");
  const actualByKey = rowsByKey(actualRows, errors, "actual label sheet rows");

  addError(errors, actualRows.length === expectedRows.length, "label sheet row count must match the package manifest");
  addError(errors, countRowsByType(actualRows, "frameSample") === frameSampleRecords(records).length, "label sheet frame sample row count must match the dataset");
  addError(errors, countRowsByType(actualRows, "assessmentClinicalScale") === assessmentClinicalScaleRecords(records).length, "label sheet clinical-scale row count must match the dataset");

  for (const key of expectedByKey.keys()) addError(errors, actualByKey.has(key), `label sheet is missing ${key}`);
  for (const key of actualByKey.keys()) addError(errors, expectedByKey.has(key), `label sheet has unexpected ${key}`);
  const rowIdentityMatches = errors.length === identityErrorStart;

  for (const [key, expectedRow] of expectedByKey.entries()) {
    const actualRow = actualByKey.get(key);
    if (!actualRow) continue;
    const mutableColumns = mutableColumnsForRowType(expectedRow.rowType);
    for (const column of LABEL_COLUMNS) {
      if (mutableColumns.has(column)) continue;
      addCategorizedError(
        errors,
        controls,
        "readOnlyColumnsMatch",
        compactValue(actualRow[column]) === compactValue(expectedRow[column]),
        `${key} read-only column ${column} must match the blinded package`,
      );
    }
    if (expectedRow.rowType === "assessmentClinicalScale") {
      addError(errors, actualRow.sourceLabelSheetMode === "blinded", `${key} sourceLabelSheetMode must remain blinded`);
      for (const column of ESTIMATE_VALUE_COLUMNS) {
        addCategorizedError(errors, controls, "estimateValuesHidden", compactValue(actualRow[column]) === "", `${key} ${column} must remain hidden in blinded review`);
      }
    }
  }

  const status = errors.length === 0 ? "passed" : "failed";
  return {
    kind: CLINICAL_REVIEW_PACKAGE_VERIFICATION_KIND,
    schemaVersion: CLINICAL_REVIEW_PACKAGE_VERIFICATION_SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status,
    packageId: manifest?.packageId ?? null,
    sourceDatasetSha256,
    summary: {
      labelRows: actualRows.length,
      frameSampleRows: countRowsByType(actualRows, "frameSample"),
      assessmentClinicalScaleRows: countRowsByType(actualRows, "assessmentClinicalScale"),
      expectedLabelRows: expectedRows.length,
      expectedFrameSampleRows: frameSampleRecords(records).length,
      expectedAssessmentClinicalScaleRows: assessmentClinicalScaleRecords(records).length,
    },
    controls: {
      sourceHashMatches,
      blindedManifest: manifest?.labelSheet?.blinded === true && manifest?.labelSheet?.includeEstimateValueColumns === false,
      rowIdentityMatches,
      estimateValuesHidden: controls.estimateValuesHidden,
      readOnlyColumnsMatch: controls.readOnlyColumnsMatch,
    },
    errors,
  };
}

export {
  BLINDED_LABEL_SHEET_FILE,
  CLINICAL_REVIEW_PACKAGE_KIND,
  CLINICAL_REVIEW_PACKAGE_SCHEMA_VERSION,
  CLINICAL_REVIEW_PACKAGE_VERIFICATION_KIND,
  CLINICAL_REVIEW_PACKAGE_VERIFICATION_SCHEMA_VERSION,
  MANIFEST_FILE,
  REVIEWER_INSTRUCTIONS_FILE,
  buildClinicalReviewManifest,
  buildClinicalReviewPackage,
  createReviewerInstructionsMarkdown,
  verifyClinicalReviewPackage,
};
