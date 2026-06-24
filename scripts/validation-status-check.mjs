#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { CLINICAL_SCALE_ESTIMATE_VERSION } from "../src/domain/clinicalScales.js";

const DEFAULT_STATUS_PATH = "docs/validation-status.json";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const DEFAULT_MIN_CLINICAL_SCALE_REVIEWED_ASSESSMENTS = 30;
const DEFAULT_MIN_DISTINCT_CLINICAL_CASES = 10;
const DEFAULT_MIN_AGREEMENT_WILSON_LOWER_BOUND = 0.8;
const DEFAULT_MIN_USABLE_MOVEMENT_COVERAGE_RATIO = 0.8;
const VALID_STATUS_VALUES = Object.freeze([
  "tooling-ready-needs-reviewed-data",
  "production-thresholds-calibrated",
  "clinical-scale-agreement-reviewed",
]);
const CLINICAL_SCALE_RELEASE_STATUS = "clinical-scale-agreement-reviewed";
const PRIMARY_CLINICAL_REVIEW_SCALE_KEYS = Object.freeze(["houseBrackmannGrade", "sunnybrookComposite", "efaceTotal"]);
const CLINICAL_SCALE_AVAILABILITY = Object.freeze({
  houseBrackmann: {
    agreementKey: "houseBrackmann",
    agreementLabel: "House-Brackmann",
    reviewerKey: "houseBrackmannGrade",
  },
  sunnybrook: {
    agreementKey: "sunnybrookComposite",
    agreementLabel: "Sunnybrook composite",
    reviewerKey: "sunnybrookComposite",
  },
  eface: {
    agreementKey: "efaceTotal",
    agreementLabel: "eFACE total",
    reviewerKey: "efaceTotal",
  },
});
const CLINICAL_SCALE_AVAILABILITY_KEYS = Object.freeze(Object.keys(CLINICAL_SCALE_AVAILABILITY));
const DEFAULT_MIN_HOUSE_BRACKMANN_SEVERITY_BANDS = 3;
const DEFAULT_MIN_ASSESSMENTS_PER_HOUSE_BRACKMANN_SEVERITY_BAND = 3;
const DEFAULT_CONFIDENCE_LEVEL = 0.95;
const WILSON_Z_BY_CONFIDENCE_LEVEL = Object.freeze({
  0.9: 1.6448536269514722,
  0.95: 1.959963984540054,
  0.99: 2.5758293035489004,
});
const WILSON_INTERVAL_TOLERANCE = 0.0006;

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

function assertIsoTimestamp(value, field) {
  assertCondition(typeof value === "string" && ISO_TIMESTAMP_RE.test(value), `${field} must be a UTC ISO timestamp`);
  assertCondition(!Number.isNaN(Date.parse(value)), `${field} must be a valid UTC ISO timestamp`);
}

function assertIntegerAtLeast(value, minimum, field) {
  assertCondition(Number.isInteger(value) && value >= minimum, `${field} must be an integer at least ${minimum}`);
}

function assertNumberAtLeast(value, minimum, field) {
  assertCondition(Number.isFinite(value) && value >= minimum, `${field} must be at least ${minimum}`);
}

function assertRatioMatches(value, expected, field) {
  assertCondition(
    Number.isFinite(value) && Number.isFinite(expected) && Math.abs(value - expected) <= 0.0005,
    `${field} must match the referenced report artifact value ${expected}`,
  );
}

function assertRatioBetweenZeroAndOne(value, field) {
  assertFiniteNumber(value, field);
  assertCondition(value >= 0 && value <= 1, `${field} must be between 0 and 1`);
}

function assertRatioMatchesCounts(value, numerator, denominator, field) {
  assertRatioBetweenZeroAndOne(value, field);
  assertCondition(Number.isInteger(denominator) && denominator > 0, `${field} denominator must be a positive integer`);
  const expected = numerator / denominator;
  assertCondition(
    Math.abs(value - expected) <= 0.0005,
    `${field} must match ${numerator}/${denominator}`,
  );
}

function compactNumber(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function zScoreForConfidenceLevel(confidenceLevel) {
  return WILSON_Z_BY_CONFIDENCE_LEVEL[confidenceLevel] ?? WILSON_Z_BY_CONFIDENCE_LEVEL[DEFAULT_CONFIDENCE_LEVEL];
}

function wilsonScoreInterval(successes, total, confidenceLevel = DEFAULT_CONFIDENCE_LEVEL) {
  if (!Number.isFinite(successes) || !Number.isFinite(total) || total <= 0) return null;
  const z = zScoreForConfidenceLevel(confidenceLevel);
  const phat = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = (phat + z2 / (2 * total)) / denominator;
  const margin = (z / denominator) * Math.sqrt((phat * (1 - phat) / total) + (z2 / (4 * total * total)));
  return {
    method: "wilson-score",
    confidenceLevel,
    lower: compactNumber(Math.max(0, center - margin), 4),
    upper: compactNumber(Math.min(1, center + margin), 4),
  };
}

function assertWilsonIntervalMatchesCounts(interval, successes, total, field) {
  assertCondition(interval && typeof interval === "object", `${field} must be present`);
  const confidenceLevel = interval.confidenceLevel ?? DEFAULT_CONFIDENCE_LEVEL;
  assertCondition(confidenceLevel === DEFAULT_CONFIDENCE_LEVEL, `${field}.confidenceLevel must be ${DEFAULT_CONFIDENCE_LEVEL}`);
  const expected = wilsonScoreInterval(successes, total, confidenceLevel);
  assertCondition(expected, `${field} must have a positive label denominator`);
  const { lower, upper } = interval;
  const rate = successes / total;
  assertRatioBetweenZeroAndOne(lower, `${field}.lower`);
  assertCondition(lower <= rate + WILSON_INTERVAL_TOLERANCE, `${field}.lower must not exceed the observed agreement rate`);
  assertCondition(
    Math.abs(lower - expected.lower) <= WILSON_INTERVAL_TOLERANCE,
    `${field}.lower must match Wilson score lower bound for ${successes}/${total}`,
  );
  if (upper != null) {
    assertRatioBetweenZeroAndOne(upper, `${field}.upper`);
    assertCondition(lower <= upper + WILSON_INTERVAL_TOLERANCE, `${field}.lower must not exceed ${field}.upper`);
    assertCondition(upper + WILSON_INTERVAL_TOLERANCE >= rate, `${field}.upper must not be below the observed agreement rate`);
    assertCondition(
      Math.abs(upper - expected.upper) <= WILSON_INTERVAL_TOLERANCE,
      `${field}.upper must match Wilson score upper bound for ${successes}/${total}`,
    );
  }
}

function assertClinicalScaleAvailabilityEvidence(status, scaleKey, scale) {
  const fieldPrefix = `clinicalScaleAvailability.${scaleKey}`;
  assertCondition(
    status.clinicalScaleAgreementReports.includes(scale.clinicalAgreementReport),
    `${fieldPrefix}.clinicalAgreementReport must reference a listed clinical scale agreement report`,
  );
  assertCondition(
    status.clinicalScaleReviewerAgreementReports.includes(scale.reviewerAgreementReport),
    `${fieldPrefix}.reviewerAgreementReport must reference a listed clinical scale reviewer agreement report`,
  );
  assertCondition(
    scale.clinicalScaleEstimateVersion === status.clinicalScaleMinimumStandard.clinicalScaleEstimateVersion,
    `${fieldPrefix}.clinicalScaleEstimateVersion must be ${status.clinicalScaleMinimumStandard.clinicalScaleEstimateVersion}`,
  );
  assertIntegerAtLeast(scale.reviewedLabelCount, status.clinicalScaleMinimumStandard.minReviewedAssessments, `${fieldPrefix}.reviewedLabelCount`);
  assertIntegerAtLeast(scale.distinctValidationCaseCount, status.clinicalScaleMinimumStandard.minDistinctClinicalCases, `${fieldPrefix}.distinctValidationCaseCount`);
  assertNumberAtLeast(scale.observedAgreementRate, status.clinicalScaleMinimumStandard.minAgreementRate, `${fieldPrefix}.observedAgreementRate`);
  assertNumberAtLeast(scale.agreementWilsonLowerBound, status.clinicalScaleMinimumStandard.minAgreementWilsonLowerBound, `${fieldPrefix}.agreementWilsonLowerBound`);
  assertIntegerAtLeast(scale.reviewerPairedLabelCount, status.clinicalScaleMinimumStandard.minReviewedAssessments, `${fieldPrefix}.reviewerPairedLabelCount`);
  assertIntegerAtLeast(scale.reviewerDistinctValidationCaseCount, status.clinicalScaleMinimumStandard.minDistinctClinicalCases, `${fieldPrefix}.reviewerDistinctValidationCaseCount`);
  assertNumberAtLeast(scale.reviewerObservedAgreementRate, status.clinicalScaleMinimumStandard.minAgreementRate, `${fieldPrefix}.reviewerObservedAgreementRate`);
  assertNumberAtLeast(scale.reviewerAgreementWilsonLowerBound, status.clinicalScaleMinimumStandard.minAgreementWilsonLowerBound, `${fieldPrefix}.reviewerAgreementWilsonLowerBound`);
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
      assertClinicalScaleAvailabilityEvidence(status, scaleKey, scale);
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
    Number.isInteger(value.minDistinctClinicalCases) && value.minDistinctClinicalCases >= DEFAULT_MIN_DISTINCT_CLINICAL_CASES,
    `clinicalScaleMinimumStandard.minDistinctClinicalCases must be at least ${DEFAULT_MIN_DISTINCT_CLINICAL_CASES}`,
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

function integerFromCell(cell) {
  const value = Number(String(cell ?? "").replace(/,/g, ""));
  return Number.isInteger(value) ? value : null;
}

function percentFromCell(cell) {
  const match = String(cell ?? "").match(/(\d+(?:\.\d+)?)%/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value / 100 : null;
}

function percentIntervalFromCell(cell) {
  const values = [...String(cell ?? "").matchAll(/(\d+(?:\.\d+)?)%/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite)
    .map((value) => value / 100);
  return {
    lower: values[0] ?? null,
    upper: values[1] ?? null,
  };
}

function primaryScaleAgreementRow(text, scaleKey, scaleLabel) {
  const rowPattern = new RegExp(`^\\|\\s*${escapeRegExp(scaleLabel)}\\s*\\|`, "i");
  const row = text.split(/\r?\n/).find((line) => rowPattern.test(line));
  if (!row) return null;
  const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
  const agreementConfidenceInterval = percentIntervalFromCell(cells[6]);
  return {
    scaleKey,
    label: cells[0] ?? scaleLabel,
    labeledCount: integerFromCell(cells[2]),
    missingEstimateCount: integerFromCell(cells[3]),
    withinToleranceCount: integerFromCell(cells[4]),
    agreementRate: percentFromCell(cells[5]),
    agreementConfidenceInterval: {
      method: "wilson-score",
      confidenceLevel: DEFAULT_CONFIDENCE_LEVEL,
      ...agreementConfidenceInterval,
    },
    agreementWilsonLowerBound: agreementConfidenceInterval.lower,
    status: cells[8] ?? "",
  };
}

function assertPrimaryScaleAgreementRowMetrics(row, fieldPrefix) {
  assertCondition(row && typeof row === "object", `${fieldPrefix} must be present`);
  assertNonNegativeInteger(row.labeledCount, `${fieldPrefix}.labeledCount`);
  assertNonNegativeInteger(row.missingEstimateCount, `${fieldPrefix}.missingEstimateCount`);
  assertNonNegativeInteger(row.withinToleranceCount, `${fieldPrefix}.withinToleranceCount`);
  assertCondition(
    row.missingEstimateCount <= row.labeledCount,
    `${fieldPrefix}.missingEstimateCount cannot exceed labeledCount`,
  );
  assertCondition(
    row.withinToleranceCount <= row.labeledCount - row.missingEstimateCount,
    `${fieldPrefix}.withinToleranceCount cannot exceed non-missing labels`,
  );
  assertRatioMatchesCounts(row.agreementRate, row.withinToleranceCount, row.labeledCount, `${fieldPrefix}.agreementRate`);
  const agreementConfidenceInterval = row.agreementConfidenceInterval ?? {
    confidenceLevel: DEFAULT_CONFIDENCE_LEVEL,
    lower: row.agreementWilsonLowerBound,
  };
  assertWilsonIntervalMatchesCounts(
    agreementConfidenceInterval,
    row.withinToleranceCount,
    row.labeledCount,
    `${fieldPrefix}.agreementConfidenceInterval`,
  );
}

function primaryScaleAgreementRowFromJson(report, artifactPath, scaleKey, scaleLabel) {
  const agreementKey = CLINICAL_SCALE_AVAILABILITY[scaleKey]?.agreementKey;
  const row = report.primaryScaleAgreementRows?.[scaleKey] ?? report.primaryScaleAgreementRows?.[agreementKey];
  assertPrimaryScaleAgreementRowMetrics(row, `${artifactPath}.primaryScaleAgreementRows.${scaleKey}`);
  const agreementWilsonLowerBound = row.agreementWilsonLowerBound ?? row.agreementConfidenceInterval?.lower;
  assertCondition(typeof row.status === "string" && row.status.length > 0, `${artifactPath}.primaryScaleAgreementRows.${scaleKey}.status must be present`);
  return {
    scaleKey,
    label: row.label ?? scaleLabel,
    labeledCount: row.labeledCount,
    missingEstimateCount: row.missingEstimateCount,
    withinToleranceCount: row.withinToleranceCount,
    agreementRate: row.agreementRate,
    agreementWilsonLowerBound,
    status: row.status,
  };
}

function validateClinicalScaleAgreementReportJson(report, artifactPath) {
  assertCondition(report?.kind === "mirror-clinical-scale-agreement-report", `${artifactPath} must be a mirror-clinical-scale-agreement-report`);
  assertCondition(report.schemaVersion === 1, `${artifactPath}.schemaVersion must be 1`);
  assertIsoTimestamp(report.generatedAt, `${artifactPath}.generatedAt`);
  assertCondition(typeof report.status === "string" && report.status.length > 0, `${artifactPath}.status must be present`);
  const standard = report.evidenceStandard ?? report.standard;
  assertCondition(standard && typeof standard === "object", `${artifactPath} must include an evidenceStandard object`);
  assertCondition(standard.minAgreementRate === 0.8, `${artifactPath}.evidenceStandard.minAgreementRate must be 0.8`);
  assertCondition(
    standard.minAgreementWilsonLowerBound === DEFAULT_MIN_AGREEMENT_WILSON_LOWER_BOUND,
    `${artifactPath}.evidenceStandard.minAgreementWilsonLowerBound must be ${DEFAULT_MIN_AGREEMENT_WILSON_LOWER_BOUND}`,
  );
  assertCondition(
    Number.isInteger(standard.minReviewedAssessments) && standard.minReviewedAssessments >= DEFAULT_MIN_CLINICAL_SCALE_REVIEWED_ASSESSMENTS,
    `${artifactPath}.evidenceStandard.minReviewedAssessments must be at least ${DEFAULT_MIN_CLINICAL_SCALE_REVIEWED_ASSESSMENTS}`,
  );
  assertCondition(
    Number.isInteger(standard.minDistinctClinicalCases) && standard.minDistinctClinicalCases >= DEFAULT_MIN_DISTINCT_CLINICAL_CASES,
    `${artifactPath}.evidenceStandard.minDistinctClinicalCases must be at least ${DEFAULT_MIN_DISTINCT_CLINICAL_CASES}`,
  );
  assertCondition(
    standard.minUsableMovementCoverageRatio === DEFAULT_MIN_USABLE_MOVEMENT_COVERAGE_RATIO,
    `${artifactPath}.evidenceStandard.minUsableMovementCoverageRatio must be ${DEFAULT_MIN_USABLE_MOVEMENT_COVERAGE_RATIO}`,
  );
  assertCondition(standard.confidenceInterval?.method === "wilson-score", `${artifactPath}.evidenceStandard.confidenceInterval.method must be wilson-score`);
  assertCondition(standard.confidenceInterval?.confidenceLevel === 0.95, `${artifactPath}.evidenceStandard.confidenceInterval.confidenceLevel must be 0.95`);
  assertCondition(
    standard.clinicalScaleEstimateVersion === CLINICAL_SCALE_ESTIMATE_VERSION,
    `${artifactPath}.evidenceStandard.clinicalScaleEstimateVersion must be ${CLINICAL_SCALE_ESTIMATE_VERSION}`,
  );
  const summary = report.summary;
  assertCondition(summary && typeof summary === "object", `${artifactPath} must include a summary object`);
  assertNonNegativeInteger(summary.reviewedClinicalScaleAssessmentCount, `${artifactPath}.summary.reviewedClinicalScaleAssessmentCount`);
  assertNonNegativeInteger(summary.distinctClinicalCaseCount, `${artifactPath}.summary.distinctClinicalCaseCount`);
  assertNonNegativeInteger(summary.eligibleBlindedIndependentLabelCount, `${artifactPath}.summary.eligibleBlindedIndependentLabelCount`);
  assertNonNegativeInteger(summary.duplicateClinicalScaleAssessmentIdCount, `${artifactPath}.summary.duplicateClinicalScaleAssessmentIdCount`);
  assertNonNegativeInteger(summary.missingClinicalScaleAssessmentIdCount, `${artifactPath}.summary.missingClinicalScaleAssessmentIdCount`);
  const caseMix = report.houseBrackmannCaseMix;
  assertCondition(caseMix && typeof caseMix === "object", `${artifactPath} must include houseBrackmannCaseMix`);
  assertNonNegativeInteger(caseMix.representedSeverityBandCount, `${artifactPath}.houseBrackmannCaseMix.representedSeverityBandCount`);
  assertNonNegativeInteger(caseMix.minAssessmentsPerSeverityBand, `${artifactPath}.houseBrackmannCaseMix.minAssessmentsPerSeverityBand`);
  assertNonNegativeInteger(caseMix.minimumLabelsPerRepresentedSeverityBand, `${artifactPath}.houseBrackmannCaseMix.minimumLabelsPerRepresentedSeverityBand`);
  assertCondition(caseMix.severityBands && typeof caseMix.severityBands === "object", `${artifactPath}.houseBrackmannCaseMix.severityBands must be present`);
  for (const bandKey of ["mild", "moderate", "severe"]) {
    assertNonNegativeInteger(caseMix.severityBands?.[bandKey]?.count, `${artifactPath}.houseBrackmannCaseMix.severityBands.${bandKey}.count`);
  }
  const controls = report.referenceStandardControls;
  assertCondition(controls && typeof controls === "object", `${artifactPath} must include referenceStandardControls`);
  for (const controlKey of [
    "pseudonymousValidationCaseId",
    "sourceLabelSheetModeBlinded",
    "reviewBlinded",
    "uniqueAssessmentId",
    "currentEstimatorVersion",
    "mirrorEstimateStatusEstimated",
    "completeOrMinimumEvidenceTier",
    "movementInputProvenance",
    "usableMovementsOnlyCalculation",
    "houseBrackmannRequiredInput",
    "sunnybrookEfaceInputCompleteness",
    "completeRestingMetricKeys",
    "completeRestingMetricsCalculation",
    "missingInvalidEstimatesInDenominator",
    "independentClinicianOrAdjudicatedLabelSource",
    "pseudonymousReviewerId",
    "recognizedClinicalReviewerRole",
  ]) {
    assertCondition(controls[controlKey] === true, `${artifactPath}.referenceStandardControls.${controlKey} must be true`);
  }
  assertCondition(
    controls.minUsableMovementCoverageRatio === DEFAULT_MIN_USABLE_MOVEMENT_COVERAGE_RATIO,
    `${artifactPath}.referenceStandardControls.minUsableMovementCoverageRatio must be ${DEFAULT_MIN_USABLE_MOVEMENT_COVERAGE_RATIO}`,
  );
  assertTextMatches(report.note ?? "", /does not convert estimates into clinician-assigned grades/i, artifactPath, "the non-clinician-assignment note");
  const primaryScaleAgreementRows = Object.fromEntries(
    Object.entries(CLINICAL_SCALE_AVAILABILITY).map(([scaleKey, config]) => [
      scaleKey,
      primaryScaleAgreementRowFromJson(report, artifactPath, scaleKey, config.agreementLabel),
    ]),
  );
  const primaryScaleWilsonLowerBounds = Object.fromEntries(
    Object.entries(primaryScaleAgreementRows).map(([scaleKey, row]) => [scaleKey, row?.agreementWilsonLowerBound ?? null]),
  );
  return {
    path: artifactPath,
    generatedAt: report.generatedAt,
    status: report.status,
    reviewedClinicalScaleAssessmentCount: summary.reviewedClinicalScaleAssessmentCount,
    distinctClinicalCaseCount: summary.distinctClinicalCaseCount,
    eligibleBlindedIndependentLabelCount: summary.eligibleBlindedIndependentLabelCount,
    duplicateClinicalScaleAssessmentIdCount: summary.duplicateClinicalScaleAssessmentIdCount,
    missingClinicalScaleAssessmentIdCount: summary.missingClinicalScaleAssessmentIdCount,
    clinicalScaleEstimateVersion: standard.clinicalScaleEstimateVersion,
    minimumUsableMovementCoverageRatio: standard.minUsableMovementCoverageRatio,
    minimumLabelsPerRepresentedSeverityBand: caseMix.minAssessmentsPerSeverityBand,
    representedHouseBrackmannSeverityBandCount: caseMix.representedSeverityBandCount,
    minimumHouseBrackmannSeverityBandLabelCount: caseMix.minimumLabelsPerRepresentedSeverityBand,
    primaryScaleAgreementRows,
    primaryScaleWilsonLowerBounds,
    minimumPrimaryScaleWilsonLowerBound: Math.min(...Object.values(primaryScaleWilsonLowerBounds).map((value) => value ?? 0)),
    readyPrimaryScaleCount: summary.readyPrimaryScaleCount ?? 0,
  };
}

function enabledClinicalScaleKeys(status = {}) {
  return CLINICAL_SCALE_AVAILABILITY_KEYS.filter((scaleKey) => (
    status.clinicalScaleAvailability?.[scaleKey]?.clinicalFacingScoresAllowed === true
  ));
}

function allPrimaryClinicalScalesEnabled(status = {}) {
  return enabledClinicalScaleKeys(status).length === CLINICAL_SCALE_AVAILABILITY_KEYS.length;
}

function validateClinicalScaleAgreementReportText(text, artifactPath) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      return validateClinicalScaleAgreementReportJson(JSON.parse(trimmed), artifactPath);
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`${artifactPath} must be valid JSON when using structured clinical-scale agreement format: ${error.message}`);
      throw error;
    }
  }
  assertTextMatches(text, /# Mirror Clinical Scale Agreement Report/i, artifactPath, "the Mirror clinical-scale agreement report heading");
  const generatedAt = text.match(/^Generated:\s*([^\s]+)/im)?.[1]?.trim();
  assertIsoTimestamp(generatedAt, `${artifactPath}.Generated`);
  assertTextMatches(text, /Status:\s*\S+/i, artifactPath, "a clinical-scale readiness status");
  assertTextMatches(text, /House-Brackmann\s*\|/i, artifactPath, "House-Brackmann agreement row");
  assertTextMatches(text, /Sunnybrook composite\s*\|/i, artifactPath, "Sunnybrook composite agreement row");
  assertTextMatches(text, /eFACE total\s*\|/i, artifactPath, "eFACE total agreement row");
  assertTextMatches(text, /## Agreement Sample Plan/i, artifactPath, "the agreement sample plan section");
  assertTextMatches(text, /Additional-perfect-label planning assumes future rows are eligible/i, artifactPath, "the agreement sample planning assumption");
  assertTextMatches(text, /## House-Brackmann Case Mix/i, artifactPath, "the House-Brackmann case-mix section");
  assertTextMatches(text, /HB I-II mild\/normal\s*\|/i, artifactPath, "mild House-Brackmann case-mix row");
  assertTextMatches(text, /HB III-IV moderate\s*\|/i, artifactPath, "moderate House-Brackmann case-mix row");
  assertTextMatches(text, /HB V-VI severe\/complete\s*\|/i, artifactPath, "severe House-Brackmann case-mix row");
  assertTextMatches(text, /Wilson/i, artifactPath, "Wilson confidence interval reporting");
  assertTextMatches(text, new RegExp(`Clinical-scale estimator version:\\s*v?${CLINICAL_SCALE_ESTIMATE_VERSION}\\b`, "i"), artifactPath, `clinical-scale estimator version v${CLINICAL_SCALE_ESTIMATE_VERSION}`);
  assertTextMatches(text, /Minimum usable movement coverage:\s*80\.0%/i, artifactPath, "the 80% usable movement coverage estimate-evidence floor");
  assertTextMatches(text, /Distinct validation case minimum:\s*\d+/i, artifactPath, "the distinct validation case minimum");
  assertTextMatches(text, /Distinct validation cases:\s*\d+/i, artifactPath, "the distinct validation case count");
  assertTextMatches(text, /Reference standard:\s*blinded clinician-assigned/i, artifactPath, "the blinded clinician reference-standard statement");
  assertTextMatches(text, /## Reference Standard Controls/i, artifactPath, "the reference-standard controls section");
  assertTextMatches(text, /Eligible blinded independent clinical labels:\s*\d+/i, artifactPath, "eligible blinded independent clinical label count");
  assertTextMatches(text, /Case identity control:\s*counted labels require a pseudonymous `validationCaseId`/i, artifactPath, "the pseudonymous validation-case identity control");
  assertTextMatches(text, /Blinding control:\s*counted labels require `sourceLabelSheetMode:\s*blinded` and `reviewBlinded`/i, artifactPath, "the explicit blinded-review control");
  assertTextMatches(text, /Unique assessment control:\s*counted labels require one stable assessment id per reviewed clinical-scale row/i, artifactPath, "the unique assessment-id control");
  assertTextMatches(text, new RegExp(`Estimator version control:\\s*counted labels require clinical-scale estimator version v${CLINICAL_SCALE_ESTIMATE_VERSION}`, "i"), artifactPath, "the explicit estimator-version control");
  assertTextMatches(text, /Estimate evidence control:\s*counted rows require Mirror estimates with status `estimated`/i, artifactPath, "the explicit estimate status control");
  assertTextMatches(text, /complete\/minimum evidence tier/i, artifactPath, "the complete/minimum estimate evidence-tier control");
  assertTextMatches(text, /at least 80% usable movement coverage/i, artifactPath, "the estimate movement coverage control");
  assertTextMatches(text, /used\/omitted movement IDs/i, artifactPath, "the estimate movement-input provenance control");
  assertTextMatches(text, /usable-movements-only calculation flag/i, artifactPath, "the usable-movements-only calculation control");
  assertTextMatches(text, /House-Brackmann estimates require the gentle eye-closure input/i, artifactPath, "the House-Brackmann input control");
  assertTextMatches(text, /Sunnybrook\/eFACE input-completeness provenance/i, artifactPath, "the Sunnybrook/eFACE input provenance control");
  assertTextMatches(text, /Sunnybrook\/eFACE primary comparisons require complete scale-specific movement input/i, artifactPath, "the complete Sunnybrook/eFACE input comparison control");
  assertTextMatches(text, /complete resting-metric keys/i, artifactPath, "the complete resting-metric provenance control");
  assertTextMatches(text, /complete-resting-metrics calculation flag/i, artifactPath, "the complete-resting-metrics calculation control");
  assertTextMatches(text, /missing.*invalid estimates are reported in that scale'?s denominator/i, artifactPath, "the scale-specific missing-estimate denominator control");
  assertTextMatches(text, /valid in-range target for that specific primary scale/i, artifactPath, "the scale-specific primary target validity control");
  assertTextMatches(text, /Independence control:\s*counted labels require clinician-assigned or adjudicated `labelSource`/i, artifactPath, "the explicit independent-label-source control");
  assertTextMatches(text, /Reviewer identity control:\s*counted labels require a pseudonymous `reviewerId`/i, artifactPath, "the pseudonymous reviewer identity control");
  assertTextMatches(text, /Reviewer control:\s*counted labels require a recognized clinical\/adjudication role/i, artifactPath, "the explicit reviewer-role control");
  assertTextMatches(text, /Release control:/i, artifactPath, "the release-control statement");
  const reviewedClinicalScaleAssessmentCount = integerFromMatch(text, /Reviewed clinical-scale assessments:\s*(\d+)/i);
  const distinctClinicalCaseCount = integerFromMatch(text, /Distinct validation cases:\s*(\d+)/i);
  const eligibleBlindedIndependentLabelCount = integerFromMatch(text, /Eligible blinded independent clinical labels:\s*(\d+)/i);
  const duplicateClinicalScaleAssessmentIdCount = integerFromMatch(text, /Duplicate assessment IDs:\s*(\d+)/i);
  const missingClinicalScaleAssessmentIdCount = integerFromMatch(text, /Rows missing assessment IDs:\s*(\d+)/i);
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
  const primaryScaleAgreementRows = Object.fromEntries(
    Object.entries(CLINICAL_SCALE_AVAILABILITY).map(([scaleKey, config]) => [
      scaleKey,
      primaryScaleAgreementRow(text, config.agreementKey, config.agreementLabel),
    ]),
  );
  for (const [scaleKey, row] of Object.entries(primaryScaleAgreementRows)) {
    const scaleLabel = CLINICAL_SCALE_AVAILABILITY[scaleKey]?.agreementLabel ?? scaleKey;
    assertPrimaryScaleAgreementRowMetrics(row, `${artifactPath}.${scaleLabel} agreement row`);
  }
  const primaryScaleWilsonLowerBounds = Object.fromEntries(
    Object.entries(primaryScaleAgreementRows).map(([scaleKey, row]) => [scaleKey, row?.agreementWilsonLowerBound ?? null]),
  );
  const minimumPrimaryScaleWilsonLowerBound = Math.min(...Object.values(primaryScaleWilsonLowerBounds).map((value) => value ?? 0));
  const readyPrimaryScaleCount = integerFromMatch(text, /Ready primary scales:\s*(\d+)\/\d+/i);
  return {
    path: artifactPath,
    generatedAt,
    status: text.match(/Status:\s*([^\n]+)/i)?.[1]?.trim() ?? null,
    reviewedClinicalScaleAssessmentCount,
    distinctClinicalCaseCount,
    eligibleBlindedIndependentLabelCount,
    duplicateClinicalScaleAssessmentIdCount,
    missingClinicalScaleAssessmentIdCount,
    clinicalScaleEstimateVersion,
    minimumUsableMovementCoverageRatio,
    minimumLabelsPerRepresentedSeverityBand,
    representedHouseBrackmannSeverityBandCount,
    minimumHouseBrackmannSeverityBandLabelCount,
    primaryScaleAgreementRows,
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
  assertIsoTimestamp(report.generatedAt, `${artifactPath}.generatedAt`);
  assertCondition(report.summary && typeof report.summary === "object", `${artifactPath} must include a summary object`);
  assertNonNegativeInteger(report.summary.readyExercises, `${artifactPath}.summary.readyExercises`);
  assertCondition(Array.isArray(report.exercises), `${artifactPath} must include an exercises array`);
  assertTextMatches(report.note ?? "", /reviewed labels/i, artifactPath, "the reviewed-labels calibration note");
  return {
    path: artifactPath,
    generatedAt: report.generatedAt,
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
  assertCondition(report.schemaVersion === 1, `${artifactPath}.schemaVersion must be 1`);
  assertIsoTimestamp(report.generatedAt, `${artifactPath}.generatedAt`);
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
    Number.isInteger(report.standard.minDistinctClinicalCases) && report.standard.minDistinctClinicalCases >= DEFAULT_MIN_DISTINCT_CLINICAL_CASES,
    `${artifactPath}.standard.minDistinctClinicalCases must be at least ${DEFAULT_MIN_DISTINCT_CLINICAL_CASES}`,
  );
  assertCondition(
    report.standard.minHouseBrackmannSeverityBands === DEFAULT_MIN_HOUSE_BRACKMANN_SEVERITY_BANDS,
    `${artifactPath}.standard.minHouseBrackmannSeverityBands must be ${DEFAULT_MIN_HOUSE_BRACKMANN_SEVERITY_BANDS}`,
  );
  assertCondition(
    Number.isInteger(report.standard.minAssessmentsPerSeverityBand) && report.standard.minAssessmentsPerSeverityBand >= DEFAULT_MIN_ASSESSMENTS_PER_HOUSE_BRACKMANN_SEVERITY_BAND,
    `${artifactPath}.standard.minAssessmentsPerSeverityBand must be at least ${DEFAULT_MIN_ASSESSMENTS_PER_HOUSE_BRACKMANN_SEVERITY_BAND}`,
  );
  assertCondition(
    report.standard.minUsableMovementCoverageRatio === DEFAULT_MIN_USABLE_MOVEMENT_COVERAGE_RATIO,
    `${artifactPath}.standard.minUsableMovementCoverageRatio must be ${DEFAULT_MIN_USABLE_MOVEMENT_COVERAGE_RATIO}`,
  );
  assertCondition(report.standard.requiresV3MovementProvenance === true, `${artifactPath}.standard.requiresV3MovementProvenance must be true`);
  assertCondition(report.standard.requiresV4RestingMetricProvenance === true, `${artifactPath}.standard.requiresV4RestingMetricProvenance must be true`);
  assertCondition(report.standard.requiresHouseBrackmannRequiredInput === true, `${artifactPath}.standard.requiresHouseBrackmannRequiredInput must be true`);
  assertCondition(report.standard.requiresV5ScaleInputProvenance === true, `${artifactPath}.standard.requiresV5ScaleInputProvenance must be true`);
  assertCondition(report.standard.confidenceInterval?.method === "wilson-score", `${artifactPath}.standard.confidenceInterval.method must be wilson-score`);
  assertCondition(report.standard.confidenceInterval?.confidenceLevel === 0.95, `${artifactPath}.standard.confidenceInterval.confidenceLevel must be 0.95`);
  assertCondition(report.summary && typeof report.summary === "object", `${artifactPath} must include a summary object`);
  assertNonNegativeInteger(report.summary.reviewerAAssessmentCount, `${artifactPath}.summary.reviewerAAssessmentCount`);
  assertNonNegativeInteger(report.summary.reviewerBAssessmentCount, `${artifactPath}.summary.reviewerBAssessmentCount`);
  assertNonNegativeInteger(report.summary.comparedAssessmentCount, `${artifactPath}.summary.comparedAssessmentCount`);
  assertNonNegativeInteger(report.summary.eligibleReviewerPairCount, `${artifactPath}.summary.eligibleReviewerPairCount`);
  assertNonNegativeInteger(report.summary.distinctValidationCaseCount, `${artifactPath}.summary.distinctValidationCaseCount`);
  assertNonNegativeInteger(report.summary.excludedReviewerPairCount, `${artifactPath}.summary.excludedReviewerPairCount`);
  assertNonNegativeInteger(report.summary.reviewerAEligibleAssessmentCount, `${artifactPath}.summary.reviewerAEligibleAssessmentCount`);
  assertNonNegativeInteger(report.summary.reviewerBEligibleAssessmentCount, `${artifactPath}.summary.reviewerBEligibleAssessmentCount`);
  assertNonNegativeInteger(report.summary.reviewerAIneligibleAssessmentCount, `${artifactPath}.summary.reviewerAIneligibleAssessmentCount`);
  assertNonNegativeInteger(report.summary.reviewerBIneligibleAssessmentCount, `${artifactPath}.summary.reviewerBIneligibleAssessmentCount`);
  assertNonNegativeInteger(report.summary.reviewerAStaleOrMissingEstimateVersionCount, `${artifactPath}.summary.reviewerAStaleOrMissingEstimateVersionCount`);
  assertNonNegativeInteger(report.summary.reviewerBStaleOrMissingEstimateVersionCount, `${artifactPath}.summary.reviewerBStaleOrMissingEstimateVersionCount`);
  assertNonNegativeInteger(report.summary.reviewerADuplicateAssessmentIdCount, `${artifactPath}.summary.reviewerADuplicateAssessmentIdCount`);
  assertNonNegativeInteger(report.summary.reviewerBDuplicateAssessmentIdCount, `${artifactPath}.summary.reviewerBDuplicateAssessmentIdCount`);
  assertNonNegativeInteger(report.summary.reviewerAMissingAssessmentIdRowCount, `${artifactPath}.summary.reviewerAMissingAssessmentIdRowCount`);
  assertNonNegativeInteger(report.summary.reviewerBMissingAssessmentIdRowCount, `${artifactPath}.summary.reviewerBMissingAssessmentIdRowCount`);
  assertNonNegativeInteger(report.summary.reviewerAInsufficientEstimateEvidenceCount, `${artifactPath}.summary.reviewerAInsufficientEstimateEvidenceCount`);
  assertNonNegativeInteger(report.summary.reviewerBInsufficientEstimateEvidenceCount, `${artifactPath}.summary.reviewerBInsufficientEstimateEvidenceCount`);
  assertCondition(Array.isArray(report.summary.reviewerAReviewerIds), `${artifactPath}.summary.reviewerAReviewerIds must be an array`);
  assertCondition(Array.isArray(report.summary.reviewerBReviewerIds), `${artifactPath}.summary.reviewerBReviewerIds must be an array`);
  assertCondition(report.summary.reviewerAReviewerIds.length === 1, `${artifactPath}.summary.reviewerAReviewerIds must contain exactly one pseudonymous reviewer id`);
  assertCondition(report.summary.reviewerBReviewerIds.length === 1, `${artifactPath}.summary.reviewerBReviewerIds must contain exactly one pseudonymous reviewer id`);
  assertCondition(report.summary.reviewerAReviewerIds[0] !== report.summary.reviewerBReviewerIds[0], `${artifactPath} reviewer sheets must use distinct pseudonymous reviewer ids`);
  assertNonNegativeInteger(report.summary.reviewerIdOverlapCount, `${artifactPath}.summary.reviewerIdOverlapCount`);
  assertNonNegativeInteger(report.summary.estimateVersionMismatchCount, `${artifactPath}.summary.estimateVersionMismatchCount`);
  assertNonNegativeInteger(report.summary.estimateEvidenceMismatchCount, `${artifactPath}.summary.estimateEvidenceMismatchCount`);
  assertNonNegativeInteger(report.summary.houseBrackmannRepresentedSeverityBandCount, `${artifactPath}.summary.houseBrackmannRepresentedSeverityBandCount`);
  assertNonNegativeInteger(report.summary.houseBrackmannMinimumSameBandPairedLabelCount, `${artifactPath}.summary.houseBrackmannMinimumSameBandPairedLabelCount`);
  assertNonNegativeInteger(report.summary.houseBrackmannCrossSeverityBandDisagreementCount, `${artifactPath}.summary.houseBrackmannCrossSeverityBandDisagreementCount`);
  assertCondition(
    report.summary.requiredClinicalScaleEstimateVersion === CLINICAL_SCALE_ESTIMATE_VERSION,
    `${artifactPath}.summary.requiredClinicalScaleEstimateVersion must be ${CLINICAL_SCALE_ESTIMATE_VERSION}`,
  );
  assertCondition(Array.isArray(report.blockingReasons), `${artifactPath} must include blockingReasons array`);
  assertCondition(Array.isArray(report.reviewerSheetIssues), `${artifactPath} must include reviewerSheetIssues array`);
  assertCondition(report.reviewerSheetIssues.length === 0, `${artifactPath} must have no reviewer-sheet metadata issues`);
  assertCondition(report.byScale && typeof report.byScale === "object", `${artifactPath} must include byScale reviewer agreement results`);
  const primaryPairedCounts = PRIMARY_CLINICAL_REVIEW_SCALE_KEYS.map((scaleKey) => {
    const scale = report.byScale?.[scaleKey];
    assertCondition(scale && typeof scale === "object", `${artifactPath} must include ${scaleKey} reviewer agreement row`);
    assertNonNegativeInteger(scale.pairedCount, `${artifactPath}.byScale.${scaleKey}.pairedCount`);
    assertNonNegativeInteger(scale.incompleteEstimateInputCount, `${artifactPath}.byScale.${scaleKey}.incompleteEstimateInputCount`);
    assertNonNegativeInteger(scale.withinToleranceCount, `${artifactPath}.byScale.${scaleKey}.withinToleranceCount`);
    assertCondition(
      scale.withinToleranceCount <= scale.pairedCount,
      `${artifactPath}.byScale.${scaleKey}.withinToleranceCount cannot exceed pairedCount`,
    );
    if (scale.exactMatchCount != null) {
      assertNonNegativeInteger(scale.exactMatchCount, `${artifactPath}.byScale.${scaleKey}.exactMatchCount`);
      assertCondition(
        scale.exactMatchCount <= scale.withinToleranceCount,
        `${artifactPath}.byScale.${scaleKey}.exactMatchCount cannot exceed withinToleranceCount`,
      );
    }
    if (scale.exactAgreementRate != null) {
      assertRatioMatchesCounts(scale.exactAgreementRate, scale.exactMatchCount, scale.pairedCount, `${artifactPath}.byScale.${scaleKey}.exactAgreementRate`);
    }
    assertRatioMatchesCounts(scale.withinToleranceRate, scale.withinToleranceCount, scale.pairedCount, `${artifactPath}.byScale.${scaleKey}.withinToleranceRate`);
    assertCondition(scale.withinToleranceConfidenceInterval?.method === "wilson-score", `${artifactPath}.byScale.${scaleKey}.withinToleranceConfidenceInterval.method must be wilson-score`);
    assertWilsonIntervalMatchesCounts(
      scale.withinToleranceConfidenceInterval,
      scale.withinToleranceCount,
      scale.pairedCount,
      `${artifactPath}.byScale.${scaleKey}.withinToleranceConfidenceInterval`,
    );
    return scale.pairedCount;
  });
  const primaryAgreementRates = PRIMARY_CLINICAL_REVIEW_SCALE_KEYS.map((scaleKey) => report.byScale?.[scaleKey]?.withinToleranceRate ?? 0);
  const primaryAgreementWilsonLowerBounds = PRIMARY_CLINICAL_REVIEW_SCALE_KEYS.map((scaleKey) => report.byScale?.[scaleKey]?.withinToleranceConfidenceInterval?.lower ?? 0);
  const caseMix = report.houseBrackmannCaseMix;
  assertCondition(caseMix && typeof caseMix === "object", `${artifactPath} must include houseBrackmannCaseMix`);
  assertCondition(caseMix.minHouseBrackmannSeverityBands === DEFAULT_MIN_HOUSE_BRACKMANN_SEVERITY_BANDS, `${artifactPath}.houseBrackmannCaseMix.minHouseBrackmannSeverityBands must be ${DEFAULT_MIN_HOUSE_BRACKMANN_SEVERITY_BANDS}`);
  assertCondition(
    Number.isInteger(caseMix.minAssessmentsPerSeverityBand) && caseMix.minAssessmentsPerSeverityBand >= DEFAULT_MIN_ASSESSMENTS_PER_HOUSE_BRACKMANN_SEVERITY_BAND,
    `${artifactPath}.houseBrackmannCaseMix.minAssessmentsPerSeverityBand must be at least ${DEFAULT_MIN_ASSESSMENTS_PER_HOUSE_BRACKMANN_SEVERITY_BAND}`,
  );
  assertNonNegativeInteger(caseMix.pairedHouseBrackmannCount, `${artifactPath}.houseBrackmannCaseMix.pairedHouseBrackmannCount`);
  assertNonNegativeInteger(caseMix.representedSeverityBandCount, `${artifactPath}.houseBrackmannCaseMix.representedSeverityBandCount`);
  assertNonNegativeInteger(caseMix.minimumSameBandPairedLabelCount, `${artifactPath}.houseBrackmannCaseMix.minimumSameBandPairedLabelCount`);
  assertNonNegativeInteger(caseMix.crossSeverityBandDisagreementCount, `${artifactPath}.houseBrackmannCaseMix.crossSeverityBandDisagreementCount`);
  assertCondition(caseMix.severityBands && typeof caseMix.severityBands === "object", `${artifactPath}.houseBrackmannCaseMix.severityBands must be an object`);
  const houseBrackmannSeverityBandCounts = ["mild", "moderate", "severe"].map((bandKey) => {
    const band = caseMix.severityBands?.[bandKey];
    assertCondition(band && typeof band === "object", `${artifactPath}.houseBrackmannCaseMix.severityBands.${bandKey} must be present`);
    assertNonNegativeInteger(band.sameBandPairedCount, `${artifactPath}.houseBrackmannCaseMix.severityBands.${bandKey}.sameBandPairedCount`);
    assertNonNegativeInteger(band.reviewerAPairedCount, `${artifactPath}.houseBrackmannCaseMix.severityBands.${bandKey}.reviewerAPairedCount`);
    assertNonNegativeInteger(band.reviewerBPairedCount, `${artifactPath}.houseBrackmannCaseMix.severityBands.${bandKey}.reviewerBPairedCount`);
    return band.sameBandPairedCount;
  });
  assertTextMatches(report.note ?? "", /reference-standard quality check/i, artifactPath, "the reference-standard reviewer-agreement note");
  return {
    path: artifactPath,
    generatedAt: report.generatedAt,
    reviewerAAssessmentCount: report.summary.reviewerAAssessmentCount,
    reviewerBAssessmentCount: report.summary.reviewerBAssessmentCount,
    comparedAssessmentCount: report.summary.comparedAssessmentCount,
    eligibleReviewerPairCount: report.summary.eligibleReviewerPairCount,
    distinctValidationCaseCount: report.summary.distinctValidationCaseCount,
    excludedReviewerPairCount: report.summary.excludedReviewerPairCount,
    reviewerAEligibleAssessmentCount: report.summary.reviewerAEligibleAssessmentCount,
    reviewerBEligibleAssessmentCount: report.summary.reviewerBEligibleAssessmentCount,
    reviewerAIneligibleAssessmentCount: report.summary.reviewerAIneligibleAssessmentCount,
    reviewerBIneligibleAssessmentCount: report.summary.reviewerBIneligibleAssessmentCount,
    reviewerADuplicateAssessmentIdCount: report.summary.reviewerADuplicateAssessmentIdCount,
    reviewerBDuplicateAssessmentIdCount: report.summary.reviewerBDuplicateAssessmentIdCount,
    reviewerAMissingAssessmentIdRowCount: report.summary.reviewerAMissingAssessmentIdRowCount,
    reviewerBMissingAssessmentIdRowCount: report.summary.reviewerBMissingAssessmentIdRowCount,
    reviewerAStaleOrMissingEstimateVersionCount: report.summary.reviewerAStaleOrMissingEstimateVersionCount,
    reviewerBStaleOrMissingEstimateVersionCount: report.summary.reviewerBStaleOrMissingEstimateVersionCount,
    reviewerAInsufficientEstimateEvidenceCount: report.summary.reviewerAInsufficientEstimateEvidenceCount,
    reviewerBInsufficientEstimateEvidenceCount: report.summary.reviewerBInsufficientEstimateEvidenceCount,
    reviewerAReviewerIds: report.summary.reviewerAReviewerIds,
    reviewerBReviewerIds: report.summary.reviewerBReviewerIds,
    reviewerIdOverlapCount: report.summary.reviewerIdOverlapCount,
    estimateVersionMismatchCount: report.summary.estimateVersionMismatchCount,
    estimateEvidenceMismatchCount: report.summary.estimateEvidenceMismatchCount,
    representedHouseBrackmannSeverityBandCount: caseMix.representedSeverityBandCount,
    minimumHouseBrackmannSeverityBandLabelCount: Math.min(...houseBrackmannSeverityBandCounts),
    houseBrackmannCrossSeverityBandDisagreementCount: caseMix.crossSeverityBandDisagreementCount,
    requiredClinicalScaleEstimateVersion: report.summary.requiredClinicalScaleEstimateVersion,
    blockingReasons: report.blockingReasons,
    byScale: report.byScale,
    minimumPrimaryPairedCount: Math.min(...primaryPairedCounts),
    minimumPrimaryAgreementRate: Math.min(...primaryAgreementRates),
    minimumPrimaryAgreementWilsonLowerBound: Math.min(...primaryAgreementWilsonLowerBounds),
  };
}

function clinicalAgreementReportHasCommonEvidence(report, status) {
  return (
    (report.reviewedClinicalScaleAssessmentCount ?? 0) >= status.clinicalScaleMinimumStandard.minReviewedAssessments
    && (report.distinctClinicalCaseCount ?? 0) >= status.clinicalScaleMinimumStandard.minDistinctClinicalCases
    && (report.eligibleBlindedIndependentLabelCount ?? 0) >= status.clinicalScaleMinimumStandard.minReviewedAssessments
    && report.clinicalScaleEstimateVersion === status.clinicalScaleMinimumStandard.clinicalScaleEstimateVersion
    && (report.duplicateClinicalScaleAssessmentIdCount ?? 0) === 0
    && (report.missingClinicalScaleAssessmentIdCount ?? 0) === 0
    && (report.minimumUsableMovementCoverageRatio ?? 0) >= status.clinicalScaleMinimumStandard.minUsableMovementCoverageRatio
    && (report.representedHouseBrackmannSeverityBandCount ?? 0) >= status.clinicalScaleMinimumStandard.minHouseBrackmannSeverityBands
    && (report.minimumLabelsPerRepresentedSeverityBand ?? 0) >= status.clinicalScaleMinimumStandard.minAssessmentsPerSeverityBand
    && (report.minimumHouseBrackmannSeverityBandLabelCount ?? 0) >= status.clinicalScaleMinimumStandard.minAssessmentsPerSeverityBand
  );
}

function clinicalAgreementScaleMeetsMinimum(report, status, scaleKey) {
  const row = report.primaryScaleAgreementRows?.[scaleKey];
  return Boolean(
    row
      && (row.labeledCount ?? 0) >= status.clinicalScaleMinimumStandard.minReviewedAssessments
      && (row.agreementRate ?? 0) >= status.clinicalScaleMinimumStandard.minAgreementRate
      && (row.agreementWilsonLowerBound ?? 0) >= status.clinicalScaleMinimumStandard.minAgreementWilsonLowerBound
      && /meets-confidence-standard/i.test(row.status ?? "")
  );
}

function clinicalAgreementReportMeetsScaleSet(report, status, scaleKeys) {
  return Boolean(
    clinicalAgreementReportHasCommonEvidence(report, status)
      && (!allPrimaryClinicalScalesEnabled(status) || /meets-clinical-scale-confidence-standard/i.test(report.status ?? ""))
      && scaleKeys.every((scaleKey) => clinicalAgreementScaleMeetsMinimum(report, status, scaleKey))
  );
}

function reviewerAgreementReportHasCommonEvidence(report, status) {
  return (
    report.requiredClinicalScaleEstimateVersion === status.clinicalScaleMinimumStandard.clinicalScaleEstimateVersion
    && (report.comparedAssessmentCount ?? 0) >= status.clinicalScaleMinimumStandard.minReviewedAssessments
    && (report.eligibleReviewerPairCount ?? 0) >= status.clinicalScaleMinimumStandard.minReviewedAssessments
    && (report.distinctValidationCaseCount ?? 0) >= status.clinicalScaleMinimumStandard.minDistinctClinicalCases
    && (report.excludedReviewerPairCount ?? 0) === 0
    && (report.reviewerAEligibleAssessmentCount ?? 0) >= status.clinicalScaleMinimumStandard.minReviewedAssessments
    && (report.reviewerBEligibleAssessmentCount ?? 0) >= status.clinicalScaleMinimumStandard.minReviewedAssessments
    && (report.reviewerAIneligibleAssessmentCount ?? 0) === 0
    && (report.reviewerBIneligibleAssessmentCount ?? 0) === 0
    && (report.reviewerAStaleOrMissingEstimateVersionCount ?? 0) === 0
    && (report.reviewerBStaleOrMissingEstimateVersionCount ?? 0) === 0
    && (report.reviewerADuplicateAssessmentIdCount ?? 0) === 0
    && (report.reviewerBDuplicateAssessmentIdCount ?? 0) === 0
    && (report.reviewerAMissingAssessmentIdRowCount ?? 0) === 0
    && (report.reviewerBMissingAssessmentIdRowCount ?? 0) === 0
    && (report.reviewerAInsufficientEstimateEvidenceCount ?? 0) === 0
    && (report.reviewerBInsufficientEstimateEvidenceCount ?? 0) === 0
    && (report.reviewerAReviewerIds?.length ?? 0) === 1
    && (report.reviewerBReviewerIds?.length ?? 0) === 1
    && report.reviewerAReviewerIds?.[0] !== report.reviewerBReviewerIds?.[0]
    && (report.reviewerIdOverlapCount ?? 0) === 0
    && (report.estimateVersionMismatchCount ?? 0) === 0
    && (report.estimateEvidenceMismatchCount ?? 0) === 0
    && (report.representedHouseBrackmannSeverityBandCount ?? 0) >= status.clinicalScaleMinimumStandard.minHouseBrackmannSeverityBands
    && (report.minimumHouseBrackmannSeverityBandLabelCount ?? 0) >= status.clinicalScaleMinimumStandard.minAssessmentsPerSeverityBand
  );
}

function reviewerAgreementScaleMeetsMinimum(report, status, scaleKey) {
  const reviewerKey = CLINICAL_SCALE_AVAILABILITY[scaleKey]?.reviewerKey;
  const scale = reviewerKey ? report.byScale?.[reviewerKey] : null;
  return Boolean(
    scale
      && (scale.pairedCount ?? 0) >= status.clinicalScaleMinimumStandard.minReviewedAssessments
      && (scale.incompleteEstimateInputCount ?? 0) === 0
      && (scale.withinToleranceRate ?? 0) >= status.clinicalScaleMinimumStandard.minAgreementRate
      && (scale.withinToleranceConfidenceInterval?.lower ?? 0) >= status.clinicalScaleMinimumStandard.minAgreementWilsonLowerBound
      && scale.meetsMinimumStandard !== false
  );
}

function reviewerAgreementBlockingReasonsAllowed(report, enabledScaleKeys) {
  const enabledReviewerKeys = new Set(enabledScaleKeys.map((scaleKey) => CLINICAL_SCALE_AVAILABILITY[scaleKey]?.reviewerKey));
  return (report.blockingReasons ?? []).every((reason) => {
    const scaleKey = String(reason ?? "").split(":")[0]?.trim();
    return PRIMARY_CLINICAL_REVIEW_SCALE_KEYS.includes(scaleKey) && !enabledReviewerKeys.has(scaleKey);
  });
}

function reviewerAgreementReportMeetsScaleSet(report, status, scaleKeys) {
  return Boolean(
    reviewerAgreementReportHasCommonEvidence(report, status)
      && reviewerAgreementBlockingReasonsAllowed(report, scaleKeys)
      && scaleKeys.every((scaleKey) => reviewerAgreementScaleMeetsMinimum(report, status, scaleKey))
  );
}

function clinicalScaleAvailabilityMatchesArtifacts(status, clinicalAgreementReports, clinicalReviewerAgreementReports) {
  for (const scaleKey of enabledClinicalScaleKeys(status)) {
    const fieldPrefix = `clinicalScaleAvailability.${scaleKey}`;
    const scale = status.clinicalScaleAvailability[scaleKey];
    const clinicalReport = clinicalAgreementReports.find((report) => report.path === scale.clinicalAgreementReport);
    const reviewerReport = clinicalReviewerAgreementReports.find((report) => report.path === scale.reviewerAgreementReport);
    assertCondition(clinicalReport, `${fieldPrefix}.clinicalAgreementReport must reference a validated clinical scale agreement report artifact`);
    assertCondition(reviewerReport, `${fieldPrefix}.reviewerAgreementReport must reference a validated clinical scale reviewer agreement report artifact`);
    const clinicalRow = clinicalReport.primaryScaleAgreementRows?.[scaleKey];
    const reviewerKey = CLINICAL_SCALE_AVAILABILITY[scaleKey]?.reviewerKey;
    const reviewerRow = reviewerKey ? reviewerReport.byScale?.[reviewerKey] : null;
    assertCondition(clinicalRow, `${fieldPrefix}.clinicalAgreementReport must include a ${scaleKey} agreement row`);
    assertCondition(reviewerRow, `${fieldPrefix}.reviewerAgreementReport must include a ${scaleKey} reviewer agreement row`);
    assertCondition(scale.clinicalScaleEstimateVersion === clinicalReport.clinicalScaleEstimateVersion, `${fieldPrefix}.clinicalScaleEstimateVersion must match the clinical agreement report`);
    assertCondition(scale.clinicalScaleEstimateVersion === reviewerReport.requiredClinicalScaleEstimateVersion, `${fieldPrefix}.clinicalScaleEstimateVersion must match the reviewer agreement report`);
    assertCondition(scale.reviewedLabelCount === clinicalRow.labeledCount, `${fieldPrefix}.reviewedLabelCount must match the referenced clinical agreement report`);
    assertCondition(scale.distinctValidationCaseCount === clinicalReport.distinctClinicalCaseCount, `${fieldPrefix}.distinctValidationCaseCount must match the referenced clinical agreement report`);
    assertRatioMatches(scale.observedAgreementRate, clinicalRow.agreementRate, `${fieldPrefix}.observedAgreementRate`);
    assertRatioMatches(scale.agreementWilsonLowerBound, clinicalRow.agreementWilsonLowerBound, `${fieldPrefix}.agreementWilsonLowerBound`);
    assertCondition(scale.reviewerPairedLabelCount === reviewerRow.pairedCount, `${fieldPrefix}.reviewerPairedLabelCount must match the referenced reviewer agreement report`);
    assertCondition(scale.reviewerDistinctValidationCaseCount === reviewerReport.distinctValidationCaseCount, `${fieldPrefix}.reviewerDistinctValidationCaseCount must match the referenced reviewer agreement report`);
    assertRatioMatches(scale.reviewerObservedAgreementRate, reviewerRow.withinToleranceRate, `${fieldPrefix}.reviewerObservedAgreementRate`);
    assertRatioMatches(scale.reviewerAgreementWilsonLowerBound, reviewerRow.withinToleranceConfidenceInterval?.lower, `${fieldPrefix}.reviewerAgreementWilsonLowerBound`);
  }
}

function assertRecognizedScaleKeys(scaleKeys, field = "enabledScaleKeys") {
  for (const scaleKey of scaleKeys) {
    assertCondition(CLINICAL_SCALE_AVAILABILITY_KEYS.includes(scaleKey), `${field} contains unrecognized primary clinical scale: ${scaleKey}`);
  }
}

function clinicalScaleEvidenceFromReports(clinicalAgreementReport, clinicalReviewerAgreementReport, scaleKey) {
  const clinicalRow = clinicalAgreementReport.primaryScaleAgreementRows?.[scaleKey];
  const reviewerKey = CLINICAL_SCALE_AVAILABILITY[scaleKey]?.reviewerKey;
  const reviewerRow = reviewerKey ? clinicalReviewerAgreementReport.byScale?.[reviewerKey] : null;
  assertCondition(clinicalRow, `${scaleKey} clinical agreement row is missing`);
  assertCondition(reviewerRow, `${scaleKey} reviewer agreement row is missing`);
  return {
    clinicalFacingScoresAllowed: true,
    clinicalAgreementReport: clinicalAgreementReport.path,
    reviewerAgreementReport: clinicalReviewerAgreementReport.path,
    clinicalScaleEstimateVersion: clinicalAgreementReport.clinicalScaleEstimateVersion,
    reviewedLabelCount: clinicalRow.labeledCount,
    distinctValidationCaseCount: clinicalAgreementReport.distinctClinicalCaseCount,
    observedAgreementRate: clinicalRow.agreementRate,
    agreementWilsonLowerBound: clinicalRow.agreementWilsonLowerBound,
    reviewerPairedLabelCount: reviewerRow.pairedCount,
    reviewerDistinctValidationCaseCount: clinicalReviewerAgreementReport.distinctValidationCaseCount,
    reviewerObservedAgreementRate: reviewerRow.withinToleranceRate,
    reviewerAgreementWilsonLowerBound: reviewerRow.withinToleranceConfidenceInterval?.lower,
  };
}

function clinicalScaleMeetsReportEvidence(status, clinicalAgreementReport, clinicalReviewerAgreementReport, scaleKey) {
  return clinicalAgreementReportMeetsScaleSet(clinicalAgreementReport, status, [scaleKey])
    && reviewerAgreementReportMeetsScaleSet(clinicalReviewerAgreementReport, status, [scaleKey]);
}

function buildClinicalScaleAvailabilityEvidence(status, clinicalAgreementReport, clinicalReviewerAgreementReport, options = {}) {
  assertClinicalScaleMinimumStandard(status?.clinicalScaleMinimumStandard);
  const requestedEnabledScaleKeys = options.enabledScaleKeys;
  const enabledScaleKeys = requestedEnabledScaleKeys == null
    ? CLINICAL_SCALE_AVAILABILITY_KEYS.filter((scaleKey) => clinicalScaleMeetsReportEvidence(status, clinicalAgreementReport, clinicalReviewerAgreementReport, scaleKey))
    : requestedEnabledScaleKeys;
  assertCondition(Array.isArray(enabledScaleKeys), "enabledScaleKeys must be an array when provided");
  assertRecognizedScaleKeys(enabledScaleKeys);
  assertCondition(new Set(enabledScaleKeys).size === enabledScaleKeys.length, "enabledScaleKeys must not contain duplicates");
  assertCondition(
    clinicalAgreementReportMeetsScaleSet(clinicalAgreementReport, status, enabledScaleKeys),
    "clinical agreement report cannot support every requested enabled primary scale",
  );
  assertCondition(
    reviewerAgreementReportMeetsScaleSet(clinicalReviewerAgreementReport, status, enabledScaleKeys),
    "clinical reviewer agreement report cannot support every requested enabled primary scale",
  );
  return Object.fromEntries(CLINICAL_SCALE_AVAILABILITY_KEYS.map((scaleKey) => [
    scaleKey,
    enabledScaleKeys.includes(scaleKey)
      ? clinicalScaleEvidenceFromReports(clinicalAgreementReport, clinicalReviewerAgreementReport, scaleKey)
      : { clinicalFacingScoresAllowed: false },
  ]));
}

function uniqueWithAppendedPath(paths = [], path) {
  const next = Array.isArray(paths) ? paths.filter((item) => typeof item === "string" && item.length > 0) : [];
  if (typeof path === "string" && path.length > 0 && !next.includes(path)) next.push(path);
  return next;
}

function buildClinicalScaleStatusEvidencePatch(status, clinicalAgreementReport, clinicalReviewerAgreementReport, options = {}) {
  return {
    clinicalScaleAgreementReports: uniqueWithAppendedPath(status?.clinicalScaleAgreementReports, clinicalAgreementReport.path),
    clinicalScaleReviewerAgreementReports: uniqueWithAppendedPath(status?.clinicalScaleReviewerAgreementReports, clinicalReviewerAgreementReport.path),
    clinicalScaleAvailability: buildClinicalScaleAvailabilityEvidence(status, clinicalAgreementReport, clinicalReviewerAgreementReport, options),
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
  assertCondition(VALID_STATUS_VALUES.includes(status.status), `status must be one of: ${VALID_STATUS_VALUES.join(", ")}`);
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
    assertCondition(status.status === CLINICAL_SCALE_RELEASE_STATUS, `clinical scale agreement reports require status ${CLINICAL_SCALE_RELEASE_STATUS}`);
    assertCondition(status.reviewedDatasetCount > 0, "clinical scale agreement reports require reviewed datasets");
    assertCondition(
      status.reviewedClinicalScaleAssessmentCount >= status.clinicalScaleMinimumStandard.minReviewedAssessments,
      "clinical scale agreement reports require reviewed clinical-scale assessment coverage meeting the minimum standard",
    );
  }
  if (status.clinicalScaleReviewerAgreementReports.length > 0) {
    assertCondition(status.status === CLINICAL_SCALE_RELEASE_STATUS, `clinical scale reviewer agreement reports require status ${CLINICAL_SCALE_RELEASE_STATUS}`);
    assertCondition(status.reviewedDatasetCount > 0, "clinical scale reviewer agreement reports require reviewed datasets");
    assertCondition(
      status.reviewedClinicalScaleAssessmentCount >= status.clinicalScaleMinimumStandard.minReviewedAssessments,
      "clinical scale reviewer agreement reports require reviewed clinical-scale assessment coverage meeting the minimum standard",
    );
  }
  if (status.clinicalFacingScoresAllowed) {
    assertCondition(status.status === CLINICAL_SCALE_RELEASE_STATUS, `clinical-facing scores require status ${CLINICAL_SCALE_RELEASE_STATUS}`);
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
    const requiredScaleKeys = status.clinicalFacingScoresAllowed ? enabledClinicalScaleKeys(status) : CLINICAL_SCALE_AVAILABILITY_KEYS;
    const reportMeetingMinimum = clinicalAgreementReports.find((report) => clinicalAgreementReportMeetsScaleSet(report, status, requiredScaleKeys));
    assertCondition(
      reportMeetingMinimum,
      "clinical scale agreement report artifacts must document reviewed assessment coverage, eligible blinded independent clinical labels, current estimator version, 80% estimate evidence coverage, 80% observed agreement, 80% Wilson lower-bound agreement, House-Brackmann severity-band case mix, and every enabled primary scale meeting the minimum standard",
    );
  }
  if (status.clinicalScaleReviewerAgreementReports.length > 0) {
    const requiredScaleKeys = status.clinicalFacingScoresAllowed ? enabledClinicalScaleKeys(status) : CLINICAL_SCALE_AVAILABILITY_KEYS;
    const reviewerReportMeetingMinimum = clinicalReviewerAgreementReports.find((report) => reviewerAgreementReportMeetsScaleSet(report, status, requiredScaleKeys));
    assertCondition(
      reviewerReportMeetingMinimum,
      "clinical scale reviewer agreement report artifacts must document at least 30 eligible current-version reviewer pairs with complete/minimum evidence and 80% usable movement coverage, distinct pseudonymous reviewer ids, blinded independent reviewer sheets with paired labels for every enabled primary scale, 80% reviewer agreement, 80% Wilson lower-bound reviewer agreement, House-Brackmann reviewer severity-band case mix, and no excluded reviewer-pair or metadata blockers",
    );
    clinicalScaleAvailabilityMatchesArtifacts(status, clinicalAgreementReports, clinicalReviewerAgreementReports);
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
  buildClinicalScaleAvailabilityEvidence,
  buildClinicalScaleStatusEvidencePatch,
  validateClinicalScaleAgreementReportText,
  validateClinicalScaleReviewerAgreementReportText,
  validateStatus,
  validateStatusArtifacts,
  validateStatusFile,
  validateThresholdCalibrationReportText,
};
