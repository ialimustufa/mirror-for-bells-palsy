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
import { LABEL_COLUMNS, createValidationLabelCsv, validationLabelRows } from "./validationLabels.js";

const CLINICAL_REVIEW_PACKAGE_KIND = "mirror-clinical-scale-review-package";
const CLINICAL_REVIEW_PACKAGE_SCHEMA_VERSION = 1;
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
- Leave uncertain rows marked \`clinicianConfidence: uncertain\` or blank; uncertain rows are excluded from release counts.

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

export {
  BLINDED_LABEL_SHEET_FILE,
  CLINICAL_REVIEW_PACKAGE_KIND,
  CLINICAL_REVIEW_PACKAGE_SCHEMA_VERSION,
  MANIFEST_FILE,
  REVIEWER_INSTRUCTIONS_FILE,
  buildClinicalReviewManifest,
  buildClinicalReviewPackage,
  createReviewerInstructionsMarkdown,
};
