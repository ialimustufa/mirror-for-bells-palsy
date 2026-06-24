#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_STATUS_PATH = "docs/validation-status.json";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_MIN_CLINICAL_SCALE_REVIEWED_ASSESSMENTS = 30;
const DEFAULT_MIN_AGREEMENT_WILSON_LOWER_BOUND = 0.8;
const PRIMARY_CLINICAL_SCALE_COUNT = 3;
const DEFAULT_MIN_HOUSE_BRACKMANN_SEVERITY_BANDS = 3;
const DEFAULT_MIN_ASSESSMENTS_PER_HOUSE_BRACKMANN_SEVERITY_BAND = 3;

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
  assertCondition(value.confidenceInterval === "wilson-95", "clinicalScaleMinimumStandard.confidenceInterval must be wilson-95");
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
  assertTextMatches(text, /Reference standard:\s*blinded clinician-assigned/i, artifactPath, "the blinded clinician reference-standard statement");
  assertTextMatches(text, /## Reference Standard Controls/i, artifactPath, "the reference-standard controls section");
  assertTextMatches(text, /Eligible blinded independent clinical labels:\s*\d+/i, artifactPath, "eligible blinded independent clinical label count");
  assertTextMatches(text, /Blinding control:\s*counted labels require `sourceLabelSheetMode:\s*blinded` and `reviewBlinded`/i, artifactPath, "the explicit blinded-review control");
  assertTextMatches(text, /Independence control:\s*counted labels require clinician-assigned or adjudicated `labelSource`/i, artifactPath, "the explicit independent-label-source control");
  assertTextMatches(text, /Reviewer control:\s*counted labels require a recognized clinical\/adjudication role/i, artifactPath, "the explicit reviewer-role control");
  assertTextMatches(text, /Release control:/i, artifactPath, "the release-control statement");
  const reviewedClinicalScaleAssessmentCount = integerFromMatch(text, /Reviewed clinical-scale assessments:\s*(\d+)/i);
  const eligibleBlindedIndependentLabelCount = integerFromMatch(text, /Eligible blinded independent clinical labels:\s*(\d+)/i);
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

async function validateStatusArtifacts(status, options = {}) {
  validateStatus(status);
  const clinicalAgreementReports = [];
  for (const artifactPath of status.clinicalScaleAgreementReports) {
    const text = await readArtifactText(artifactPath, options);
    clinicalAgreementReports.push(validateClinicalScaleAgreementReportText(text, artifactPath));
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
      && (report.representedHouseBrackmannSeverityBandCount ?? 0) >= status.clinicalScaleMinimumStandard.minHouseBrackmannSeverityBands
      && (report.minimumLabelsPerRepresentedSeverityBand ?? 0) >= status.clinicalScaleMinimumStandard.minAssessmentsPerSeverityBand
      && (report.minimumHouseBrackmannSeverityBandLabelCount ?? 0) >= status.clinicalScaleMinimumStandard.minAssessmentsPerSeverityBand
      && (report.minimumPrimaryScaleWilsonLowerBound ?? 0) >= status.clinicalScaleMinimumStandard.minAgreementWilsonLowerBound
      && (report.readyPrimaryScaleCount ?? 0) >= PRIMARY_CLINICAL_SCALE_COUNT
    ));
    assertCondition(
      reportMeetingMinimum,
      "clinical scale agreement report artifacts must document reviewed assessment coverage, eligible blinded independent clinical labels, 80% Wilson lower-bound agreement, House-Brackmann severity-band case mix, and 3/3 ready primary scales meeting the minimum standard",
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
  validateStatus,
  validateStatusArtifacts,
  validateStatusFile,
  validateThresholdCalibrationReportText,
};
