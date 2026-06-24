#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { CLINICAL_SCALE_ESTIMATE_VERSION } from "../src/domain/clinicalScales.js";

const DEFAULT_STATUS_PATH = "docs/validation-status.json";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_MIN_CLINICAL_SCALE_REVIEWED_ASSESSMENTS = 30;
const DEFAULT_MIN_AGREEMENT_WILSON_LOWER_BOUND = 0.8;
const DEFAULT_MIN_USABLE_MOVEMENT_COVERAGE_RATIO = 0.8;
const PRIMARY_CLINICAL_SCALE_COUNT = 3;
const PRIMARY_CLINICAL_REVIEW_SCALE_KEYS = Object.freeze(["houseBrackmannGrade", "sunnybrookComposite", "efaceTotal"]);
const CLINICAL_SCALE_AVAILABILITY_KEYS = Object.freeze(["houseBrackmann", "sunnybrook", "eface"]);
const DEFAULT_MIN_HOUSE_BRACKMANN_SEVERITY_BANDS = 3;
const DEFAULT_MIN_ASSESSMENTS_PER_HOUSE_BRACKMANN_SEVERITY_BAND = 3;

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNonNegativeInteger(value, field) {
  assertCondition(Number.isInteger(value) && value >= 0, `${field} must be a non-negative integer`);
}

function assertFiniteNumber(value, field) {
  assertCondition(Number.isFinite(value), `${field} must be a finite number`);
}

function assertStringArray(value, field) {
  assertCondition(Array.isArray(value), `${field} must be an array`);
  for (const [index, item] of value.entries()) {
    assertCondition(typeof item === "string" && item.length > 0, `${field}[${index}] must be a non-empty string`);
  }
}

function assertClinicalScaleAvailability(value, status) {
  assertCondition(value && typeof value === "object" && !Array.isArray(value), "clinicalScaleAvailability must be an object");
  for (const key of Object.keys(value)) {
    assertCondition(CLINICAL_SCALE_AVAILABILITY_KEYS.includes(key), `clinicalScaleAvailability.${key} is not a recognized primary clinical scale`);
  }
  const enabledScaleKeys = [];
  for (const scaleKey of CLINICAL_SCALE_AVAILABILITY_KEYS) {
    const scale = value[scaleKey];
    assertCondition(scale && typeof scale === "object" && !Array.isArray(scale), `clinicalScaleAvailability.${scaleKey} must be an object`);
    assertCondition(
      typeof scale.clinicalFacingScoresAllowed === "boolean",
      `clinicalScaleAvailability.${scaleKey}.clinicalFacingScoresAllowed must be boolean`,
    );
    if (scale.clinicalFacingScoresAllowed) {
      enabledScaleKeys.push(scaleKey);
      assertCondition(
        status.clinicalFacingScoresAllowed === true,
        `clinicalScaleAvailability.${scaleKey}.clinicalFacingScoresAllowed requires clinicalFacingScoresAllowed true`,
      );
    }
  }
  if (status.clinicalFacingScoresAllowed) {
    assertCondition(
      enabledScaleKeys.length > 0,
      "clinicalFacingScoresAllowed true requires at least one clinicalScaleAvailability entry to allow clinical-facing scores",
    );
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertClinicalScaleMinimumStandard(value) {
  assertCondition(value && typeof value === "object" && !Array.isArray(value), "clinicalScaleMinimumStandard must be an object");
  assertCondition(value.minAgreementRate === 0.8, "clinicalScaleMinimumStandard.minAgreementRate must be 0.8");
  assertCondition(
    value.minAgreementWilsonLowerBound === DEFAULT_MIN_AGREEMENT_WILSON_LOWER_BOUND,
    `clinicalScaleMinimumStandard.minAgreementWilsonLowerBound must be ${DEFAULT_MIN_AGREEMENT_WILSON_LOWER_BOUND}`,
  );
  assertCondition(
    Number.isInteger(value.minReviewedAssessments) && value.minReviewedAssessments >= DEFAULT_MIN_CLINICAL_SCALE_REVIEWED_ASSESSMENTS,
    `clinicalScaleMinimumStandard.minReviewedAssessments must be at least ${DEFAULT_MIN_CLINICAL_SCALE_REVIEWED_ASSESSMENTS}`,
  );
  assertCondition(
    value.minHouseBrackmannSeverityBands === DEFAULT_MIN_HOUSE_BRACKMANN_SEVERITY_BANDS,
    `clinicalScaleMinimumStandard.minHouseBrackmannSeverityBands must be ${DEFAULT_MIN_HOUSE_BRACKMANN_SEVERITY_BANDS}`,
  );
  assertCondition(
    Number.isInteger(value.minAssessmentsPerSeverityBand) && value.minAssessmentsPerSeverityBand >= DEFAULT_MIN_ASSESSMENTS_PER_HOUSE_BRACKMANN_SEVERITY_BAND,
    `clinicalScaleMinimumStandard.minAssessmentsPerSeverityBand must be at least ${DEFAULT_MIN_ASSESSMENTS_PER_HOUSE_BRACKMANN_SEVERITY_BAND}`,
  );
  assertCondition(
    value.minUsableMovementCoverageRatio === DEFAULT_MIN_USABLE_MOVEMENT_COVERAGE_RATIO,
    `clinicalScaleMinimumStandard.minUsableMovementCoverageRatio must be ${DEFAULT_MIN_USABLE_MOVEMENT_COVERAGE_RATIO}`,
  );
  assertCondition(value.confidenceInterval === "wilson-95", "clinicalScaleMinimumStandard.confidenceInterval must be wilson-95");
  assertCondition(
    value.clinicalScaleEstimateVersion === CLINICAL_SCALE_ESTIMATE_VERSION,
    `clinicalScaleMinimumStandard.clinicalScaleEstimateVersion must be ${CLINICAL_SCALE_ESTIMATE_VERSION}`,
  );
  assertCondition(value.reviewProtocol === "docs/clinical-scale-review-protocol.md", "clinicalScaleMinimumStandard.reviewProtocol must reference docs/clinical-scale-review-protocol.md");
}

function assertTextMatches(text, pattern, artifactPath, description) {
  assertCondition(pattern.test(text), `${artifactPath} must include ${description}`);
}

function integerFromMatch(text, pattern) {
  const match = text.match(pattern);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) ? value : null;
}

function percentFromMatch(text, pattern) {
  const match = text.match(pattern);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value / 100 : null;
}

function primaryScaleWilsonLowerBound(text, scaleLabel) {
  const rowPattern = new RegExp(`^\\|\\s*${escapeRegExp(scaleLabel)}\\s*\\|`, "i");
  const row = text.split(/\r?\n/).find((line) => rowPattern.test(line));
  if (!row) return null;
  const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
  const interval = cells[6] ?? "";
  const match = interval.match(/(\d+(?:\.\d+)?)%\s*-/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value / 100 : null;
}

function validateClinicalScaleAgreementReportText(text, artifactPath) {
  assertTextMatches(text, /# Mirror Clinical Scale Agreement Report/i, artifactPath, "the Mirror clinical-scale agreement report heading");
  assertTextMatches(text, /Status:\s*meets-clinical-scale-confidence-standard/i, artifactPath, "a passing clinical-scale readiness status");
  assertTextMatches(text, /House-Brackmann\s*\|/i, artifactPath, "House-Brackmann agreement row");
  assertTextMatches(text, /Sunnybrook composite\s*\|/i, artifactPath, "Sunnybrook composite agreement row");
  assertTextMatches(text, /eFACE total\s*\|/i, artifactPath, "eFACE total agreement row");
  assertTextMatches(text, /## House-Brackmann Case Mix/i, artifactPath, "the House-Brackmann case-mix section");
  assertTextMatches(text, /HB I-II mild\/normal\s*\|/i, artifactPath, "mild House-Brackmann case-mix row");
  assertTextMatches(text, /HB III-IV moderate\s*\|/i, artifactPath, "moderate House-Brackmann case-mix row");
  assertTextMatches(text, /HB V-VI severe\/complete\s*\|/i, artifactPath, "severe House-Brackmann case-mix row");
  assertTextMatches(text, /Wilson/i, artifactPath, "Wilson confidence interval reporting");
  assertTextMatches(text, new RegExp(`Clinical-scale estimator version:\\s*v?${CLINICAL_SCALE_ESTIMATE_VERSION}\\b`, "i"), artifactPath, `clinical-scale estimator version v${CLINICAL_SCALE_ESTIMATE_VERSION}`);
  assertTextMatches(text, /Minimum usable movement coverage:\s*80\.0%/i, artifactPath, "the 80% usable movement coverage estimate-evidence floor");
  assertTextMatches(text, /Reference standard:\s*blinded clinician-assigned/i, artifactPath, "the blinded clinician reference-standard statement");
  assertTextMatches(text, /## Reference Standard Controls/i, artifactPath, "the reference-standard controls section");
  assertTextMatches(text, /Eligible blinded independent clinical labels:\s*\d+/i, artifactPath, "eligible blinded independent clinical label count");
  assertTextMatches(text, /Blinding control:\s*counted labels require `sourceLabelSheetMode:\s*blinded` and `reviewBlinded`/i, artifactPath, "the explicit blinded-review control");
  assertTextMatches(text, new RegExp(`Estimator version control:\\s*counted labels require clinical-scale estimator version v${CLINICAL_SCALE_ESTIMATE_VERSION}`, "i"), artifactPath, "the explicit estimator-version control");
  assertTextMatches(text, /Estimate evidence control:\s*counted rows require Mirror estimates with status `estimated`/i, artifactPath, "the explicit estimate status control");
  assertTextMatches(text, /complete\/minimum evidence tier/i, artifactPath, "the complete/minimum estimate evidence-tier control");
  assertTextMatches(text, /at least 80% usable movement coverage/i, artifactPath, "the estimate movement coverage control");
  assertTextMatches(text, /valid in-range primary estimate values/i, artifactPath, "the in-range primary estimate value control");
  assertTextMatches(text, /Independence control:\s*counted labels require clinician-assigned or adjudicated `labelSource`/i, artifactPath, "the explicit independent-label-source control");
  assertTextMatches(text, /Reviewer control:\s*counted labels require a recognized clinical\/adjudication role/i, artifactPath, "the explicit reviewer-role control");
  assertTextMatches(text, /Release control:/i, artifactPath, "the release-control statement");
  const reviewedClinicalScaleAssessmentCount = integerFromMatch(text, /Reviewed clinical-scale assessments:\s*(\d+)/i);
  const eligibleBlindedIndependentLabelCount = integerFromMatch(text, /Eligible blinded independent clinical labels:\s*(\d+)/i);
  const clinicalScaleEstimateVersion = integerFromMatch(text, /Clinical-scale estimator version:\s*v?(\d+)/i);
  const minimumUsableMovementCoverageRatio = percentFromMatch(text, /Minimum usable movement coverage:\s*(\d+(?:\.\d+)?)%/i);
  const minimumLabelsPerRepresentedSeverityBand = integerFromMatch(text, /Minimum labels per represented band:\s*(\d+)/i);
  const representedHouseBrackmannSeverityBandCount = integerFromMatch(text, /Represented severity bands:\s*(\d+)/i);
  const houseBrackmannSeverityBandCounts = [
    integerFromMatch(text, /HB I-II mild\/normal\s*\|\s*(\d+)\s*\|\s*yes/i),
    integerFromMatch(text, /HB III-IV moderate\s*\|\s*(\d+)\s*\|\s*yes/i),
    integerFromMatch(text, /HB V-VI severe\/complete\s*\|\s*(\d+)\s*\|\s*yes/i),
  ];
  const minimumHouseBrackmannSeverityBandLabelCount = Math.min(...houseBrackmannSeverityBandCounts.map((count) => count ?? 0));
  const primaryScaleWilsonLowerBounds = {
    houseBrackmann: primaryScaleWilsonLowerBound(text, "House-Brackmann"),
    sunnybrookComposite: primaryScaleWilsonLowerBound(text, "Sunnybrook composite"),
    efaceTotal: primaryScaleWilsonLowerBound(text, "eFACE total"),
  };
  const minimumPrimaryScaleWilsonLowerBound = Math.min(...Object.values(primaryScaleWilsonLowerBounds).map((value) => value ?? 0));
  const readyPrimaryScaleCount = integerFromMatch(text, /Ready primary scales:\s*(\d+)\/\d+/i);
  return {
    path: artifactPath,
    reviewedClinicalScaleAssessmentCount,
    eligibleBlindedIndependentLabelCount,
    clinicalScaleEstimateVersion,
    minimumUsableMovementCoverageRatio,
    minimumLabelsPerRepresentedSeverityBand,
    representedHouseBrackmannSeverityBandCount,
    minimumHouseBrackmannSeverityBandLabelCount,
    primaryScaleWilsonLowerBounds,
    minimumPrimaryScaleWilsonLowerBound,
    readyPrimaryScaleCount,
  };
}

function validateThresholdCalibrationReportText(text, artifactPath) {
  let report;
  try {
    report = JSON.parse(text);
  } catch (error) {
    throw new Error(`${artifactPath} must be a JSON threshold calibration report: ${error.message}`);
  }
  assertCondition(report?.kind === "mirror-threshold-calibration-report", `${artifactPath} must be a mirror-threshold-calibration-report`);
  assertCondition(report.summary && typeof report.summary === "object", `${artifactPath} must include a summary object`);
  assertNonNegativeInteger(report.summary.readyExercises, `${artifactPath}.summary.readyExercises`);
  assertCondition(Array.isArray(report.exercises), `${artifactPath} must include an exercises array`);
  assertTextMatches(report.note ?? "", /reviewed labels/i, artifactPath, "the reviewed-labels calibration note");
  return {
    path: artifactPath,
    readyExerciseCount: report.summary.readyExercises,
  };
}

function validateClinicalScaleReviewerAgreementReportText(text, artifactPath) {
  let report;
  try {
    report = JSON.parse(text);
  } catch (error) {
    throw new Error(`${artifactPath} must be a JSON clinical-scale reviewer-agreement report: ${error.message}`);
  }
  assertCondition(report?.kind === "mirror-clinical-scale-reviewer-agreement-report", `${artifactPath} must be a mirror-clinical-scale-reviewer-agreement-report`);
  assertCondition(report.standard && typeof report.standard === "object", `${artifactPath} must include a reviewer agreement standard object`);
  assertCondition(report.standard.minAgreementRate === 0.8, `${artifactPath}.standard.minAgreementRate must be 0.8`);
  assertCondition(
    report.standard.minAgreementWilsonLowerBound === DEFAULT_MIN_AGREEMENT_WILSON_LOWER_BOUND,
    `${artifactPath}.standard.minAgreementWilsonLowerBound must be ${DEFAULT_MIN_AGREEMENT_WILSON_LOWER_BOUND}`,
  );
  assertCondition(
    Number.isInteger(report.standard.minPairedLabels) && report.standard.minPairedLabels >= DEFAULT_MIN_CLINICAL_SCALE_REVIEWED_ASSESSMENTS,
    `${artifactPath}.standard.minPairedLabels must be at least ${DEFAULT_MIN_CLINICAL_SCALE_REVIEWED_ASSESSMENTS}`,
  );
  assertCondition(
    report.standard.minUsableMovementCoverageRatio === DEFAULT_MIN_USABLE_MOVEMENT_COVERAGE_RATIO,
    `${artifactPath}.standard.minUsableMovementCoverageRatio must be ${DEFAULT_MIN_USABLE_MOVEMENT_COVERAGE_RATIO}`,
  );
  assertCondition(report.standard.confidenceInterval?.method === "wilson-score", `${artifactPath}.standard.confidenceInterval.method must be wilson-score`);
  assertCondition(report.standard.confidenceInterval?.confidenceLevel === 0.95, `${artifactPath}.standard.confidenceInterval.confidenceLevel must be 0.95`);
  assertCondition(report.summary && typeof report.summary === "object", `${artifactPath} must include a summary object`);
  assertNonNegativeInteger(report.summary.reviewerAAssessmentCount, `${artifactPath}.summary.reviewerAAssessmentCount`);
  assertNonNegativeInteger(report.summary.reviewerBAssessmentCount, `${artifactPath}.summary.reviewerBAssessmentCount`);
  assertNonNegativeInteger(report.summary.comparedAssessmentCount, `${artifactPath}.summary.comparedAssessmentCount`);
  assertNonNegativeInteger(report.summary.eligibleReviewerPairCount, `${artifactPath}.summary.eligibleReviewerPairCount`);
  assertNonNegativeInteger(report.summary.excludedReviewerPairCount, `${artifactPath}.summary.excludedReviewerPairCount`);
  assertNonNegativeInteger(report.summary.reviewerAEligibleAssessmentCount, `${artifactPath}.summary.reviewerAEligibleAssessmentCount`);
  assertNonNegativeInteger(report.summary.reviewerBEligibleAssessmentCount, `${artifactPath}.summary.reviewerBEligibleAssessmentCount`);
  assertNonNegativeInteger(report.summary.reviewerAIneligibleAssessmentCount, `${artifactPath}.summary.reviewerAIneligibleAssessmentCount`);
  assertNonNegativeInteger(report.summary.reviewerBIneligibleAssessmentCount, `${artifactPath}.summary.reviewerBIneligibleAssessmentCount`);
  assertNonNegativeInteger(report.summary.reviewerAStaleOrMissingEstimateVersionCount, `${artifactPath}.summary.reviewerAStaleOrMissingEstimateVersionCount`);
  assertNonNegativeInteger(report.summary.reviewerBStaleOrMissingEstimateVersionCount, `${artifactPath}.summary.reviewerBStaleOrMissingEstimateVersionCount`);
  assertNonNegativeInteger(report.summary.reviewerAInsufficientEstimateEvidenceCount, `${artifactPath}.summary.reviewerAInsufficientEstimateEvidenceCount`);
  assertNonNegativeInteger(report.summary.reviewerBInsufficientEstimateEvidenceCount, `${artifactPath}.summary.reviewerBInsufficientEstimateEvidenceCount`);
  assertNonNegativeInteger(report.summary.estimateVersionMismatchCount, `${artifactPath}.summary.estimateVersionMismatchCount`);
  assertNonNegativeInteger(report.summary.estimateEvidenceMismatchCount, `${artifactPath}.summary.estimateEvidenceMismatchCount`);
  assertCondition(
    report.summary.requiredClinicalScaleEstimateVersion === CLINICAL_SCALE_ESTIMATE_VERSION,
    `${artifactPath}.summary.requiredClinicalScaleEstimateVersion must be ${CLINICAL_SCALE_ESTIMATE_VERSION}`,
  );
  assertCondition(Array.isArray(report.blockingReasons), `${artifactPath} must include blockingReasons array`);
  assertCondition(report.blockingReasons.length === 0, `${artifactPath} must have no reviewer-agreement blocking reasons`);
  assertCondition(Array.isArray(report.reviewerSheetIssues), `${artifactPath} must include reviewerSheetIssues array`);
  assertCondition(report.reviewerSheetIssues.length === 0, `${artifactPath} must have no reviewer-sheet metadata issues`);
  assertCondition(report.byScale && typeof report.byScale === "object", `${artifactPath} must include byScale reviewer agreement results`);
  const primaryPairedCounts = PRIMARY_CLINICAL_REVIEW_SCALE_KEYS.map((scaleKey) => {
    const scale = report.byScale?.[scaleKey];
    assertCondition(scale && typeof scale === "object", `${artifactPath} must include ${scaleKey} reviewer agreement row`);
    assertNonNegativeInteger(scale.pairedCount, `${artifactPath}.byScale.${scaleKey}.pairedCount`);
    assertNonNegativeInteger(scale.withinToleranceCount, `${artifactPath}.byScale.${scaleKey}.withinToleranceCount`);
    assertFiniteNumber(scale.withinToleranceRate, `${artifactPath}.byScale.${scaleKey}.withinToleranceRate`);
    assertCondition(scale.withinToleranceConfidenceInterval?.method === "wilson-score", `${artifactPath}.byScale.${scaleKey}.withinToleranceConfidenceInterval.method must be wilson-score`);
    assertFiniteNumber(scale.withinToleranceConfidenceInterval?.lower, `${artifactPath}.byScale.${scaleKey}.withinToleranceConfidenceInterval.lower`);
    assertFiniteNumber(scale.withinToleranceConfidenceInterval?.upper, `${artifactPath}.byScale.${scaleKey}.withinToleranceConfidenceInterval.upper`);
    return scale.pairedCount;
  });
  const primaryAgreementRates = PRIMARY_CLINICAL_REVIEW_SCALE_KEYS.map((scaleKey) => report.byScale?.[scaleKey]?.withinToleranceRate ?? 0);
  const primaryAgreementWilsonLowerBounds = PRIMARY_CLINICAL_REVIEW_SCALE_KEYS.map((scaleKey) => report.byScale?.[scaleKey]?.withinToleranceConfidenceInterval?.lower ?? 0);
  assertTextMatches(report.note ?? "", /reference-standard quality check/i, artifactPath, "the reference-standard reviewer-agreement note");
  return {
    path: artifactPath,
    reviewerAAssessmentCount: report.summary.reviewerAAssessmentCount,
    reviewerBAssessmentCount: report.summary.reviewerBAssessmentCount,
    comparedAssessmentCount: report.summary.comparedAssessmentCount,
    eligibleReviewerPairCount: report.summary.eligibleReviewerPairCount,
    excludedReviewerPairCount: report.summary.excludedReviewerPairCount,
    reviewerAEligibleAssessmentCount: report.summary.reviewerAEligibleAssessmentCount,
    reviewerBEligibleAssessmentCount: report.summary.reviewerBEligibleAssessmentCount,
    reviewerAIneligibleAssessmentCount: report.summary.reviewerAIneligibleAssessmentCount,
    reviewerBIneligibleAssessmentCount: report.summary.reviewerBIneligibleAssessmentCount,
    reviewerAStaleOrMissingEstimateVersionCount: report.summary.reviewerAStaleOrMissingEstimateVersionCount,
    reviewerBStaleOrMissingEstimateVersionCount: report.summary.reviewerBStaleOrMissingEstimateVersionCount,
    reviewerAInsufficientEstimateEvidenceCount: report.summary.reviewerAInsufficientEstimateEvidenceCount,
    reviewerBInsufficientEstimateEvidenceCount: report.summary.reviewerBInsufficientEstimateEvidenceCount,
    estimateVersionMismatchCount: report.summary.estimateVersionMismatchCount,
    estimateEvidenceMismatchCount: report.summary.estimateEvidenceMismatchCount,
    requiredClinicalScaleEstimateVersion: report.summary.requiredClinicalScaleEstimateVersion,
    minimumPrimaryPairedCount: Math.min(...primaryPairedCounts),
    minimumPrimaryAgreementRate: Math.min(...primaryAgreementRates),
    minimumPrimaryAgreementWilsonLowerBound: Math.min(...primaryAgreementWilsonLowerBounds),
  };
}

async function readArtifactText(path, options = {}) {
  if (options.readArtifactText) return options.readArtifactText(path);
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`validation artifact not found or unreadable: ${path} (${error.message})`);
  }
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
  assertStringArray(status.clinicalScaleReviewerAgreementReports, "clinicalScaleReviewerAgreementReports");
  assertStringArray(status.thresholdCalibrationReports, "thresholdCalibrationReports");
  if (status.notes !== undefined) assertStringArray(status.notes, "notes");
  assertCondition(typeof status.productionThresholdConstantsCalibrated === "boolean", "productionThresholdConstantsCalibrated must be boolean");
  assertCondition(typeof status.clinicalFacingScoresAllowed === "boolean", "clinicalFacingScoresAllowed must be boolean");
  assertClinicalScaleAvailability(status.clinicalScaleAvailability, status);

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
  if (status.clinicalScaleReviewerAgreementReports.length > 0) {
    assertCondition(status.reviewedDatasetCount > 0, "clinical scale reviewer agreement reports require reviewed datasets");
    assertCondition(
      status.reviewedClinicalScaleAssessmentCount >= status.clinicalScaleMinimumStandard.minReviewedAssessments,
      "clinical scale reviewer agreement reports require reviewed clinical-scale assessment coverage meeting the minimum standard",
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
    assertCondition(status.clinicalScaleReviewerAgreementReports.length > 0, "clinical-facing scores require clinical scale reviewer agreement reports");
  }
  return status;
}

async function validateStatusArtifacts(status, options = {}) {
  validateStatus(status);
  const clinicalAgreementReports = [];
  for (const artifactPath of status.clinicalScaleAgreementReports) {
    const text = await readArtifactText(artifactPath, options);
    clinicalAgreementReports.push(validateClinicalScaleAgreementReportText(text, artifactPath));
  }
  const clinicalReviewerAgreementReports = [];
  for (const artifactPath of status.clinicalScaleReviewerAgreementReports) {
    const text = await readArtifactText(artifactPath, options);
    clinicalReviewerAgreementReports.push(validateClinicalScaleReviewerAgreementReportText(text, artifactPath));
  }
  const thresholdCalibrationReports = [];
  for (const artifactPath of status.thresholdCalibrationReports) {
    const text = await readArtifactText(artifactPath, options);
    thresholdCalibrationReports.push(validateThresholdCalibrationReportText(text, artifactPath));
  }
  if (status.clinicalScaleAgreementReports.length > 0) {
    const reportMeetingMinimum = clinicalAgreementReports.find((report) => (
      (report.reviewedClinicalScaleAssessmentCount ?? 0) >= status.clinicalScaleMinimumStandard.minReviewedAssessments
      && (report.eligibleBlindedIndependentLabelCount ?? 0) >= status.clinicalScaleMinimumStandard.minReviewedAssessments
      && report.clinicalScaleEstimateVersion === status.clinicalScaleMinimumStandard.clinicalScaleEstimateVersion
      && (report.minimumUsableMovementCoverageRatio ?? 0) >= status.clinicalScaleMinimumStandard.minUsableMovementCoverageRatio
      && (report.representedHouseBrackmannSeverityBandCount ?? 0) >= status.clinicalScaleMinimumStandard.minHouseBrackmannSeverityBands
      && (report.minimumLabelsPerRepresentedSeverityBand ?? 0) >= status.clinicalScaleMinimumStandard.minAssessmentsPerSeverityBand
      && (report.minimumHouseBrackmannSeverityBandLabelCount ?? 0) >= status.clinicalScaleMinimumStandard.minAssessmentsPerSeverityBand
      && (report.minimumPrimaryScaleWilsonLowerBound ?? 0) >= status.clinicalScaleMinimumStandard.minAgreementWilsonLowerBound
      && (report.readyPrimaryScaleCount ?? 0) >= PRIMARY_CLINICAL_SCALE_COUNT
    ));
    assertCondition(
      reportMeetingMinimum,
      "clinical scale agreement report artifacts must document reviewed assessment coverage, eligible blinded independent clinical labels, current estimator version, 80% estimate evidence coverage, 80% Wilson lower-bound agreement, House-Brackmann severity-band case mix, and 3/3 ready primary scales meeting the minimum standard",
    );
  }
  if (status.clinicalScaleReviewerAgreementReports.length > 0) {
    const reviewerReportMeetingMinimum = clinicalReviewerAgreementReports.find((report) => (
      report.requiredClinicalScaleEstimateVersion === status.clinicalScaleMinimumStandard.clinicalScaleEstimateVersion
      && (report.comparedAssessmentCount ?? 0) >= status.clinicalScaleMinimumStandard.minReviewedAssessments
      && (report.eligibleReviewerPairCount ?? 0) >= status.clinicalScaleMinimumStandard.minReviewedAssessments
      && (report.excludedReviewerPairCount ?? 0) === 0
      && (report.reviewerAEligibleAssessmentCount ?? 0) >= status.clinicalScaleMinimumStandard.minReviewedAssessments
      && (report.reviewerBEligibleAssessmentCount ?? 0) >= status.clinicalScaleMinimumStandard.minReviewedAssessments
      && (report.reviewerAIneligibleAssessmentCount ?? 0) === 0
      && (report.reviewerBIneligibleAssessmentCount ?? 0) === 0
      && (report.reviewerAStaleOrMissingEstimateVersionCount ?? 0) === 0
      && (report.reviewerBStaleOrMissingEstimateVersionCount ?? 0) === 0
      && (report.reviewerAInsufficientEstimateEvidenceCount ?? 0) === 0
      && (report.reviewerBInsufficientEstimateEvidenceCount ?? 0) === 0
      && (report.estimateVersionMismatchCount ?? 0) === 0
      && (report.estimateEvidenceMismatchCount ?? 0) === 0
      && (report.minimumPrimaryPairedCount ?? 0) >= status.clinicalScaleMinimumStandard.minReviewedAssessments
      && (report.minimumPrimaryAgreementRate ?? 0) >= status.clinicalScaleMinimumStandard.minAgreementRate
      && (report.minimumPrimaryAgreementWilsonLowerBound ?? 0) >= status.clinicalScaleMinimumStandard.minAgreementWilsonLowerBound
    ));
    assertCondition(
      reviewerReportMeetingMinimum,
      "clinical scale reviewer agreement report artifacts must document at least 30 eligible current-version reviewer pairs with complete/minimum evidence and 80% usable movement coverage, blinded independent reviewer sheets with paired primary labels, 80% reviewer agreement, 80% Wilson lower-bound reviewer agreement, and no excluded reviewer-pair or metadata blockers",
    );
  }
  if (status.productionThresholdConstantsCalibrated) {
    const readyExerciseCount = thresholdCalibrationReports.reduce((sum, report) => sum + report.readyExerciseCount, 0);
    assertCondition(
      readyExerciseCount >= status.readyExerciseCount,
      "threshold calibration report artifacts must document ready exercise coverage matching validation status",
    );
  }
  return {
    status,
    artifacts: {
      clinicalAgreementReports,
      clinicalReviewerAgreementReports,
      thresholdCalibrationReports,
    },
  };
}

async function validateStatusFile(statusPath = DEFAULT_STATUS_PATH, options = {}) {
  const status = validateStatus(JSON.parse(await readFile(statusPath, "utf8")));
  return validateStatusArtifacts(status, options);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const statusPath = process.argv[2] ?? DEFAULT_STATUS_PATH;
  const { status } = await validateStatusFile(statusPath);
  console.log(`validation status: ${status.status} (${status.reviewedDatasetCount} reviewed datasets, ${status.reviewedFrameCount} reviewed frames, ${status.reviewedClinicalScaleAssessmentCount} reviewed clinical-scale assessments)`);
}

export {
  validateClinicalScaleAgreementReportText,
  validateClinicalScaleReviewerAgreementReportText,
  validateStatus,
  validateStatusArtifacts,
  validateStatusFile,
  validateThresholdCalibrationReportText,
};
