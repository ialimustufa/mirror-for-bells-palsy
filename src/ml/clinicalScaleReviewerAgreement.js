import { LABEL_COLUMNS, parseCsv } from "./validationLabels.js";
import { CLINICAL_SCALE_ESTIMATE_VERSION, HOUSE_BRACKMANN_REQUIRED_MOVEMENT_IDS, REQUIRED_RESTING_METRIC_KEYS, STANDARD_SCALE_MOVEMENTS } from "../domain/clinicalScales.js";

const PRIMARY_REVIEW_SCALE_KEYS = Object.freeze(["houseBrackmannGrade", "sunnybrookComposite", "efaceTotal"]);
const VALID_CLINICAL_SCALE_EVIDENCE_TIERS = new Set(["complete-standard-assessment", "minimum-standard-assessment"]);
const STANDARD_SCALE_MOVEMENT_IDS = Object.freeze(STANDARD_SCALE_MOVEMENTS.map((movement) => movement.exerciseId));
const STANDARD_SCALE_MOVEMENT_ID_SET = new Set(STANDARD_SCALE_MOVEMENT_IDS);
const REQUIRED_RESTING_METRIC_KEY_SET = new Set(REQUIRED_RESTING_METRIC_KEYS);
const MOVEMENT_SCALE_INPUT_PROVENANCE = Object.freeze([
  {
    label: "Sunnybrook",
    completeKey: "estimateSunnybrookInputComplete",
    usedKey: "estimateSunnybrookUsedExerciseIds",
    omittedKey: "estimateSunnybrookOmittedExerciseIds",
  },
  {
    label: "eFACE",
    completeKey: "estimateEfaceInputComplete",
    usedKey: "estimateEfaceUsedExerciseIds",
    omittedKey: "estimateEfaceOmittedExerciseIds",
  },
]);
const CLINICAL_REVIEWER_ROLE_PATTERN = /\b(clinician|physician|doctor|otolaryngologist|neurologist|surgeon|therapist|physiotherapist|pathologist)\b|\bent\b|\bslp\b/i;
const NON_CLINICAL_REVIEWER_ROLE_PATTERN = /\b(non[-\s]?clinician|developer|engineer|user|self|patient|caregiver|demo|test|rehearsal|practice)\b/i;
const ACCEPTED_CLINICAL_CONFIDENCE_PATTERN = /\b(high|medium|confident|adequate|sufficient)\b/i;
const UNCERTAIN_CLINICAL_CONFIDENCE_PATTERN = /\b(uncertain|low|unusable|not[-\s]?confident|insufficient)\b/i;
const ISO_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;
const BLINDED_REVIEW_PATTERN = /^(true|yes|y|1|blinded|mirror[-\s]?hidden|estimate[-\s]?hidden)$/i;
const BLINDED_LABEL_SHEET_PATTERN = /^(blinded|mirror[-\s]?hidden|estimate[-\s]?hidden)$/i;
const INDEPENDENT_CLINICAL_LABEL_SOURCE_PATTERN = /\b(clinician[-\s]?assigned|clinician|independent|reference[-\s]?standard)\b/i;
const NON_INDEPENDENT_LABEL_SOURCE_PATTERN = /\b(mirror|estimate|algorithm|model|app|copied|auto|automated|self|patient|caregiver|demo|test|rehearsal|practice|unblinded)\b/i;
const DEFAULT_REVIEWER_AGREEMENT_STANDARD = Object.freeze({
  minAgreementRate: 0.8,
  minAgreementWilsonLowerBound: 0.8,
  minPairedLabels: 30,
  minDistinctClinicalCases: 10,
  minHouseBrackmannSeverityBands: 3,
  minAssessmentsPerSeverityBand: 3,
  minUsableMovementCoverageRatio: 0.8,
  confidenceLevel: 0.95,
});
const WILSON_Z_BY_CONFIDENCE_LEVEL = Object.freeze({
  0.9: 1.6448536269514722,
  0.95: 1.959963984540054,
  0.99: 2.5758293035489004,
});

const REVIEW_SCALE_CONFIG = Object.freeze({
  houseBrackmannGrade: {
    label: "House-Brackmann",
    tolerance: 1,
    agreementLabel: "within one grade",
  },
  sunnybrookComposite: {
    label: "Sunnybrook composite",
    tolerance: 10,
    agreementLabel: "within 10 points",
  },
  efaceTotal: {
    label: "eFACE total",
    tolerance: 10,
    agreementLabel: "within 10 points",
  },
  efaceStatic: {
    label: "eFACE static",
    tolerance: 10,
    agreementLabel: "within 10 points",
  },
  efaceDynamic: {
    label: "eFACE dynamic",
    tolerance: 10,
    agreementLabel: "within 10 points",
  },
  efaceSynkinesis: {
    label: "eFACE synkinesis",
    tolerance: 10,
    agreementLabel: "within 10 points",
  },
});

const REVIEW_SCALE_KEYS = Object.freeze(Object.keys(REVIEW_SCALE_CONFIG));
const SCALE_ESTIMATE_INPUT_COMPLETE_KEYS = Object.freeze({
  houseBrackmannGrade: "estimateHouseBrackmannInputComplete",
  sunnybrookComposite: "estimateSunnybrookInputComplete",
  efaceTotal: "estimateEfaceInputComplete",
  efaceDynamic: "estimateEfaceInputComplete",
  efaceSynkinesis: "estimateEfaceInputComplete",
});

const ADJUDICATION_EXTRA_COLUMNS = Object.freeze([
  "reviewerAClinicalScaleEstimateVersion",
  "reviewerBClinicalScaleEstimateVersion",
  "reviewerAEstimateStatus",
  "reviewerBEstimateStatus",
  "reviewerAEstimateEvidenceTier",
  "reviewerBEstimateEvidenceTier",
  "reviewerAEstimateUsableMovementCoverageRatio",
  "reviewerBEstimateUsableMovementCoverageRatio",
  "reviewerAEstimateUsedMovementExerciseIds",
  "reviewerBEstimateUsedMovementExerciseIds",
  "reviewerAEstimateOmittedMovementExerciseIds",
  "reviewerBEstimateOmittedMovementExerciseIds",
  "reviewerAEstimateCalculationUsesOnlyUsableMovements",
  "reviewerBEstimateCalculationUsesOnlyUsableMovements",
  "reviewerAEstimateSunnybrookInputComplete",
  "reviewerBEstimateSunnybrookInputComplete",
  "reviewerAEstimateSunnybrookUsedExerciseIds",
  "reviewerBEstimateSunnybrookUsedExerciseIds",
  "reviewerAEstimateSunnybrookOmittedExerciseIds",
  "reviewerBEstimateSunnybrookOmittedExerciseIds",
  "reviewerAEstimateEfaceInputComplete",
  "reviewerBEstimateEfaceInputComplete",
  "reviewerAEstimateEfaceUsedExerciseIds",
  "reviewerBEstimateEfaceUsedExerciseIds",
  "reviewerAEstimateEfaceOmittedExerciseIds",
  "reviewerBEstimateEfaceOmittedExerciseIds",
  "reviewerAEstimateRequiredRestingMetricKeys",
  "reviewerBEstimateRequiredRestingMetricKeys",
  "reviewerAEstimateAvailableRestingMetricKeys",
  "reviewerBEstimateAvailableRestingMetricKeys",
  "reviewerAEstimateMissingRestingMetricKeys",
  "reviewerBEstimateMissingRestingMetricKeys",
  "reviewerAEstimateCalculationUsesCompleteRestingMetrics",
  "reviewerBEstimateCalculationUsesCompleteRestingMetrics",
  "reviewerAHouseBrackmannGrade",
  "reviewerBHouseBrackmannGrade",
  "reviewerASunnybrookComposite",
  "reviewerBSunnybrookComposite",
  "reviewerAEfaceTotal",
  "reviewerBEfaceTotal",
  "reviewerAEfaceStatic",
  "reviewerBEfaceStatic",
  "reviewerAEfaceDynamic",
  "reviewerBEfaceDynamic",
  "reviewerAEfaceSynkinesis",
  "reviewerBEfaceSynkinesis",
  "reviewerAReviewerId",
  "reviewerBReviewerId",
  "reviewerAClinicianConfidence",
  "reviewerBClinicianConfidence",
  "reviewerANotes",
  "reviewerBNotes",
  "adjudicationRequired",
  "disagreementSummary",
]);

const ADJUDICATION_COLUMNS = Object.freeze([...LABEL_COLUMNS, ...ADJUDICATION_EXTRA_COLUMNS]);

const HOUSE_BRACKMANN_GRADE_NUMBERS = Object.freeze({
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
});
const HOUSE_BRACKMANN_SEVERITY_BANDS = Object.freeze({
  mild: { label: "HB I-II mild/normal", min: 1, max: 2 },
  moderate: { label: "HB III-IV moderate", min: 3, max: 4 },
  severe: { label: "HB V-VI severe/complete", min: 5, max: 6 },
});

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function valueFromRow(row, indexByHeader, column) {
  const index = indexByHeader[column];
  return index == null ? "" : row[index] ?? "";
}

function parseHouseBrackmannGrade(value) {
  if (value == null) return null;
  if (Number.isFinite(value)) {
    const rounded = Math.round(value);
    return rounded >= 1 && rounded <= 6 ? rounded : null;
  }
  const text = String(value).trim().toUpperCase().replace(/^GRADE\s+/, "");
  if (!text) return null;
  if (HOUSE_BRACKMANN_GRADE_NUMBERS[text]) return HOUSE_BRACKMANN_GRADE_NUMBERS[text];
  const number = Number(text);
  return Number.isFinite(number) && number >= 1 && number <= 6 ? Math.round(number) : null;
}

function houseBrackmannSeverityBand(grade) {
  for (const [key, band] of Object.entries(HOUSE_BRACKMANN_SEVERITY_BANDS)) {
    if (Number.isFinite(grade) && grade >= band.min && grade <= band.max) return key;
  }
  return null;
}

function numericLabel(value) {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scaleValue(scaleKey, value) {
  if (scaleKey === "houseBrackmannGrade") return parseHouseBrackmannGrade(value);
  return numericLabel(value);
}

function formatHouseBrackmann(value) {
  const numeric = parseHouseBrackmannGrade(value);
  if (numeric == null) return "";
  return ["I", "II", "III", "IV", "V", "VI"][numeric - 1];
}

function compactRate(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

function compactNumber(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function sourceDatasetSha256FromOptions(options = {}) {
  const value = String(options.sourceDatasetSha256 ?? "").trim();
  if (!value) return null;
  if (!SHA256_HEX_PATTERN.test(value)) {
    throw new Error("sourceDatasetSha256 must be a SHA-256 hex string");
  }
  return value.toLowerCase();
}

function zScoreForConfidenceLevel(confidenceLevel) {
  return WILSON_Z_BY_CONFIDENCE_LEVEL[confidenceLevel] ?? WILSON_Z_BY_CONFIDENCE_LEVEL[DEFAULT_REVIEWER_AGREEMENT_STANDARD.confidenceLevel];
}

function wilsonScoreInterval(successes, total, confidenceLevel = DEFAULT_REVIEWER_AGREEMENT_STANDARD.confidenceLevel) {
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

function clinicalScaleEstimateVersion(row = {}) {
  const rawVersion = row?.clinicalScaleEstimateVersion;
  if (rawVersion == null || String(rawVersion).trim() === "") return null;
  const version = Number(rawVersion);
  return Number.isInteger(version) ? version : null;
}

function estimateStatus(row = {}) {
  return String(row?.estimateStatus ?? "").trim();
}

function estimateEvidenceTier(row = {}) {
  return String(row?.estimateEvidenceTier ?? "").trim();
}

function estimateUsableMovementCoverageRatio(row = {}) {
  const ratio = Number(row?.estimateUsableMovementCoverageRatio);
  return Number.isFinite(ratio) ? ratio : null;
}

function validationCaseId(row = {}) {
  return String(row?.validationCaseId ?? "").trim();
}

function reviewerId(row = {}) {
  return String(row?.reviewerId ?? "").trim();
}

function isIsoUtcTimestamp(value) {
  return typeof value === "string" && ISO_UTC_TIMESTAMP_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

function estimateMovementCount(row = {}, key) {
  const count = Number(row?.[key]);
  return Number.isInteger(count) ? count : null;
}

function normalizedEstimateEvidenceText(row = {}, key) {
  return String(row?.[key] ?? "").trim();
}

function estimateEvidenceColumnPresent(row = {}, key) {
  const presenceKey = `__${key}ColumnPresent`;
  return row?.[presenceKey] !== false;
}

function estimateMovementIdList(row = {}, key) {
  return normalizedEstimateEvidenceText(row, key)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function estimateRestingMetricKeyList(row = {}, key) {
  return normalizedEstimateEvidenceText(row, key)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function estimateBooleanValue(row = {}, key) {
  const text = normalizedEstimateEvidenceText(row, key);
  if (/^(true|yes|y|1)$/i.test(text)) return true;
  if (/^(false|no|n|0)$/i.test(text)) return false;
  return null;
}

function hasDuplicates(values = []) {
  return new Set(values).size !== values.length;
}

function estimateMovementProvenanceReasons(row = {}) {
  const reasons = [];
  const usedText = normalizedEstimateEvidenceText(row, "estimateUsedMovementExerciseIds");
  const used = estimateMovementIdList(row, "estimateUsedMovementExerciseIds");
  const omitted = estimateMovementIdList(row, "estimateOmittedMovementExerciseIds");
  const usedSet = new Set(used);
  const omittedSet = new Set(omitted);
  const usableCount = estimateMovementCount(row, "estimateUsableMovementCount");
  const requiredCount = estimateMovementCount(row, "estimateRequiredMovementCount");
  const calculationUsesOnlyUsableMovements = estimateBooleanValue(row, "estimateCalculationUsesOnlyUsableMovements");
  if (
    !estimateEvidenceColumnPresent(row, "estimateUsedMovementExerciseIds")
    || !estimateEvidenceColumnPresent(row, "estimateOmittedMovementExerciseIds")
    || !usedText
  ) {
    reasons.push("clinical scale estimate movement provenance is missing");
  }
  if (
    !estimateEvidenceColumnPresent(row, "estimateCalculationUsesOnlyUsableMovements")
    || calculationUsesOnlyUsableMovements !== true
  ) {
    reasons.push("clinical scale estimate usable-movement calculation flag is missing or false");
  }
  const hasUnknownIds = [...used, ...omitted].some((exerciseId) => !STANDARD_SCALE_MOVEMENT_ID_SET.has(exerciseId));
  const hasOverlap = used.some((exerciseId) => omittedSet.has(exerciseId));
  const hasAllStandardIds = STANDARD_SCALE_MOVEMENT_IDS.every((exerciseId) => usedSet.has(exerciseId) || omittedSet.has(exerciseId));
  const hasExpectedUsedCount = usableCount == null || used.length === usableCount;
  const hasExpectedOmittedCount = usableCount == null || requiredCount == null || omitted.length === Math.max(0, requiredCount - usableCount);
  if (
    hasUnknownIds
    || hasDuplicates(used)
    || hasDuplicates(omitted)
    || hasOverlap
    || !hasAllStandardIds
    || !hasExpectedUsedCount
    || !hasExpectedOmittedCount
    || requiredCount !== STANDARD_SCALE_MOVEMENT_IDS.length
  ) {
    reasons.push("clinical scale estimate movement provenance is inconsistent");
  }
  return reasons;
}

function estimateRestingMetricProvenanceReasons(row = {}) {
  const reasons = [];
  const required = estimateRestingMetricKeyList(row, "estimateRequiredRestingMetricKeys");
  const available = estimateRestingMetricKeyList(row, "estimateAvailableRestingMetricKeys");
  const missing = estimateRestingMetricKeyList(row, "estimateMissingRestingMetricKeys");
  const requiredSet = new Set(required);
  const availableSet = new Set(available);
  const calculationUsesCompleteRestingMetrics = estimateBooleanValue(row, "estimateCalculationUsesCompleteRestingMetrics");
  if (
    !estimateEvidenceColumnPresent(row, "estimateRequiredRestingMetricKeys")
    || !estimateEvidenceColumnPresent(row, "estimateAvailableRestingMetricKeys")
    || !estimateEvidenceColumnPresent(row, "estimateMissingRestingMetricKeys")
  ) {
    reasons.push("clinical scale estimate resting-metric provenance is missing");
  }
  if (
    !estimateEvidenceColumnPresent(row, "estimateCalculationUsesCompleteRestingMetrics")
    || calculationUsesCompleteRestingMetrics !== true
  ) {
    reasons.push("clinical scale estimate complete-resting-metrics flag is missing or false");
  }
  const hasUnknownKeys = [...required, ...available, ...missing].some((key) => !REQUIRED_RESTING_METRIC_KEY_SET.has(key));
  const hasExpectedRequiredKeys = REQUIRED_RESTING_METRIC_KEYS.every((key) => requiredSet.has(key)) && required.length === REQUIRED_RESTING_METRIC_KEYS.length;
  const hasAllRequiredAvailable = REQUIRED_RESTING_METRIC_KEYS.every((key) => availableSet.has(key)) && available.length === REQUIRED_RESTING_METRIC_KEYS.length;
  if (
    hasUnknownKeys
    || hasDuplicates(required)
    || hasDuplicates(available)
    || hasDuplicates(missing)
    || !hasExpectedRequiredKeys
    || !hasAllRequiredAvailable
    || missing.length !== 0
  ) {
    reasons.push("clinical scale estimate resting-metric provenance is inconsistent");
  }
  return reasons;
}

function estimateHouseBrackmannInputProvenanceReasons(row = {}) {
  const reasons = [];
  const inputComplete = estimateBooleanValue(row, "estimateHouseBrackmannInputComplete");
  const required = estimateMovementIdList(row, "estimateHouseBrackmannRequiredExerciseIds");
  const used = estimateMovementIdList(row, "estimateHouseBrackmannUsedExerciseIds");
  const missingRequired = estimateMovementIdList(row, "estimateHouseBrackmannMissingRequiredExerciseIds");
  const requiredSet = new Set(required);
  const usedSet = new Set(used);
  if (
    !estimateEvidenceColumnPresent(row, "estimateHouseBrackmannInputComplete")
    || !estimateEvidenceColumnPresent(row, "estimateHouseBrackmannRequiredExerciseIds")
    || !estimateEvidenceColumnPresent(row, "estimateHouseBrackmannUsedExerciseIds")
    || !estimateEvidenceColumnPresent(row, "estimateHouseBrackmannMissingRequiredExerciseIds")
  ) {
    reasons.push("clinical scale estimate House-Brackmann input provenance is missing");
  }
  if (inputComplete !== true) {
    reasons.push("clinical scale estimate House-Brackmann input complete flag is missing or false");
  }
  const hasUnknownIds = [...required, ...used, ...missingRequired].some((exerciseId) => !STANDARD_SCALE_MOVEMENT_ID_SET.has(exerciseId));
  const hasRequiredIds = HOUSE_BRACKMANN_REQUIRED_MOVEMENT_IDS.every((exerciseId) => requiredSet.has(exerciseId));
  const allRequiredUsed = required.every((exerciseId) => usedSet.has(exerciseId));
  const noRequiredMissing = missingRequired.every((exerciseId) => !requiredSet.has(exerciseId));
  if (
    hasUnknownIds
    || hasDuplicates(required)
    || hasDuplicates(used)
    || hasDuplicates(missingRequired)
    || !hasRequiredIds
    || !allRequiredUsed
    || !noRequiredMissing
  ) {
    reasons.push("clinical scale estimate House-Brackmann input provenance is inconsistent");
  }
  return reasons;
}

function sameExerciseIdSet(a = [], b = []) {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((exerciseId) => bSet.has(exerciseId));
}

function estimateMovementScaleInputProvenanceReasons(row = {}) {
  const reasons = [];
  const globalUsed = estimateMovementIdList(row, "estimateUsedMovementExerciseIds");
  const globalOmitted = estimateMovementIdList(row, "estimateOmittedMovementExerciseIds");
  const usableCount = estimateMovementCount(row, "estimateUsableMovementCount");
  const requiredCount = estimateMovementCount(row, "estimateRequiredMovementCount");
  for (const config of MOVEMENT_SCALE_INPUT_PROVENANCE) {
    const inputComplete = estimateBooleanValue(row, config.completeKey);
    const used = estimateMovementIdList(row, config.usedKey);
    const omitted = estimateMovementIdList(row, config.omittedKey);
    const usedSet = new Set(used);
    const omittedSet = new Set(omitted);
    if (
      !estimateEvidenceColumnPresent(row, config.completeKey)
      || !estimateEvidenceColumnPresent(row, config.usedKey)
      || !estimateEvidenceColumnPresent(row, config.omittedKey)
    ) {
      reasons.push(`clinical scale estimate ${config.label} input provenance is missing`);
    }
    if (inputComplete == null) {
      reasons.push(`clinical scale estimate ${config.label} input complete flag is missing`);
    }
    const hasUnknownIds = [...used, ...omitted].some((exerciseId) => !STANDARD_SCALE_MOVEMENT_ID_SET.has(exerciseId));
    const hasOverlap = used.some((exerciseId) => omittedSet.has(exerciseId));
    const hasAllStandardIds = STANDARD_SCALE_MOVEMENT_IDS.every((exerciseId) => usedSet.has(exerciseId) || omittedSet.has(exerciseId));
    const hasExpectedUsedCount = usableCount == null || used.length === usableCount;
    const hasExpectedOmittedCount = usableCount == null || requiredCount == null || omitted.length === Math.max(0, requiredCount - usableCount);
    const completeMatchesInputs = inputComplete == null || inputComplete === (used.length === STANDARD_SCALE_MOVEMENT_IDS.length && omitted.length === 0);
    if (
      hasUnknownIds
      || hasDuplicates(used)
      || hasDuplicates(omitted)
      || hasOverlap
      || !hasAllStandardIds
      || !hasExpectedUsedCount
      || !hasExpectedOmittedCount
      || requiredCount !== STANDARD_SCALE_MOVEMENT_IDS.length
      || !sameExerciseIdSet(used, globalUsed)
      || !sameExerciseIdSet(omitted, globalOmitted)
      || !completeMatchesInputs
    ) {
      reasons.push(`clinical scale estimate ${config.label} input provenance is inconsistent`);
    }
  }
  return reasons;
}

function estimateEvidenceReasons(row = {}, options = {}) {
  const minUsableMovementCoverageRatio = options.minUsableMovementCoverageRatio
    ?? DEFAULT_REVIEWER_AGREEMENT_STANDARD.minUsableMovementCoverageRatio;
  const reasons = [];
  if (estimateStatus(row) !== "estimated") {
    reasons.push("clinical scale estimate status is not estimated");
  }
  if (!VALID_CLINICAL_SCALE_EVIDENCE_TIERS.has(estimateEvidenceTier(row))) {
    reasons.push("clinical scale estimate evidence tier is missing or insufficient");
  }
  const coverageRatio = estimateUsableMovementCoverageRatio(row);
  if (!Number.isFinite(coverageRatio) || coverageRatio < minUsableMovementCoverageRatio) {
    reasons.push("clinical scale estimate movement coverage is below the minimum standard");
  }
  reasons.push(...estimateMovementProvenanceReasons(row));
  reasons.push(...estimateMovementScaleInputProvenanceReasons(row));
  reasons.push(...estimateHouseBrackmannInputProvenanceReasons(row));
  reasons.push(...estimateRestingMetricProvenanceReasons(row));
  return reasons;
}

function estimateEvidenceIssueCount(rowsById, options = {}) {
  return [...rowsById.values()].filter((row) => estimateEvidenceReasons(row, options).length > 0).length;
}

function estimateVersionCountKey(version) {
  return version == null ? "missing" : `v${version}`;
}

function incrementEstimateVersionCount(counts, version) {
  const key = estimateVersionCountKey(version);
  counts[key] = (counts[key] ?? 0) + 1;
}

function estimateVersionCounts(rowsById) {
  const counts = {};
  for (const row of rowsById.values()) incrementEstimateVersionCount(counts, clinicalScaleEstimateVersion(row));
  return counts;
}

function reviewerIds(rowsById) {
  return [...new Set([...rowsById.values()].map(reviewerId).filter(Boolean))].sort();
}

function incrementReasonCount(counts, reason) {
  counts[reason] = (counts[reason] ?? 0) + 1;
}

function incrementReasonCounts(counts, reasons = []) {
  for (const reason of reasons) incrementReasonCount(counts, reason);
}

function validPrimaryReviewScaleKeys(row = {}) {
  return PRIMARY_REVIEW_SCALE_KEYS.filter((scaleKey) => scaleValue(scaleKey, row[scaleKey]) != null);
}

function primaryReviewScaleLabelIssueReasons(row = {}, scaleKeys = PRIMARY_REVIEW_SCALE_KEYS) {
  return scaleKeys
    .filter((scaleKey) => scaleValue(scaleKey, row[scaleKey]) == null)
    .map((scaleKey) => `missing valid ${scaleKey} label`);
}

function hasAnyPairedPrimaryReviewScale(reviewerA = {}, reviewerB = {}) {
  return PRIMARY_REVIEW_SCALE_KEYS.some((scaleKey) => (
    scaleValue(scaleKey, reviewerA?.[scaleKey]) != null
    && scaleValue(scaleKey, reviewerB?.[scaleKey]) != null
  ));
}

function reviewerRowEligibility(row = {}, options = {}) {
  const reviewerRole = String(row.reviewerRole ?? "").trim();
  const confidence = String(row.clinicianConfidence ?? "").trim();
  const sourceLabelSheetMode = String(row.sourceLabelSheetMode ?? "").trim();
  const reviewBlinded = String(row.reviewBlinded ?? "").trim();
  const labelSource = String(row.labelSource ?? "").trim();
  const reviewedAt = String(row.reviewedAt ?? "").trim();
  const requiredPrimaryScaleKeys = options.requiredPrimaryScaleKeys ?? PRIMARY_REVIEW_SCALE_KEYS;
  const reasons = [];
  reasons.push(...estimateEvidenceReasons(row, options));
  if (!reviewerRole) {
    reasons.push("missing clinical reviewer role");
  } else if (NON_CLINICAL_REVIEWER_ROLE_PATTERN.test(reviewerRole)) {
    reasons.push("reviewer role is marked non-clinical or rehearsal");
  } else if (!CLINICAL_REVIEWER_ROLE_PATTERN.test(reviewerRole)) {
    reasons.push("reviewer role is not recognized as clinical");
  }
  if (!confidence) {
    reasons.push("missing clinician confidence");
  } else if (UNCERTAIN_CLINICAL_CONFIDENCE_PATTERN.test(confidence)) {
    reasons.push("clinician confidence is uncertain");
  } else if (!ACCEPTED_CLINICAL_CONFIDENCE_PATTERN.test(confidence)) {
    reasons.push("clinician confidence is not recognized as high or medium");
  }
  if (!BLINDED_LABEL_SHEET_PATTERN.test(sourceLabelSheetMode)) {
    reasons.push("source label sheet was not generated in blinded mode");
  }
  if (!BLINDED_REVIEW_PATTERN.test(reviewBlinded)) {
    reasons.push("review was not marked blinded to Mirror estimates");
  }
  if (!labelSource) {
    reasons.push("missing independent clinical label source");
  } else if (NON_INDEPENDENT_LABEL_SOURCE_PATTERN.test(labelSource)) {
    reasons.push("label source is marked non-independent or copied");
  } else if (!INDEPENDENT_CLINICAL_LABEL_SOURCE_PATTERN.test(labelSource)) {
    reasons.push("label source is not recognized as independent clinical");
  }
  if (!validationCaseId(row)) {
    reasons.push("missing validation case id");
  }
  if (!reviewerId(row)) {
    reasons.push("missing reviewer id");
  }
  if (!reviewedAt) {
    reasons.push("missing review timestamp");
  } else if (!isIsoUtcTimestamp(reviewedAt)) {
    reasons.push("review timestamp must be a UTC ISO timestamp");
  }
  for (const scaleKey of requiredPrimaryScaleKeys) {
    if (scaleValue(scaleKey, row[scaleKey]) == null) reasons.push(`missing valid ${scaleKey} label`);
  }
  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

function reviewerSheetEligibility(rowsById, reviewer, options = {}) {
  const reasonCounts = {};
  const primaryScaleLabelIssueReasonCounts = {};
  const issues = [];
  let eligibleAssessmentCount = 0;
  for (const [assessmentId, row] of rowsById.entries()) {
    const eligibility = reviewerRowEligibility(row, {
      ...options,
      requiredPrimaryScaleKeys: [],
    });
    if (eligibility.eligible && validPrimaryReviewScaleKeys(row).length) {
      eligibleAssessmentCount += 1;
      incrementReasonCounts(primaryScaleLabelIssueReasonCounts, primaryReviewScaleLabelIssueReasons(row));
      continue;
    }
    const reasons = eligibility.eligible
      ? primaryReviewScaleLabelIssueReasons(row)
      : eligibility.reasons;
    incrementReasonCounts(reasonCounts, reasons);
    issues.push({ reviewer, assessmentId, reasons });
  }
  return {
    eligibleAssessmentCount,
    ineligibleAssessmentCount: issues.length,
    ineligibleReasons: reasonCounts,
    primaryScaleLabelIssueReasons: primaryScaleLabelIssueReasonCounts,
    issues: issues.slice(0, 20),
  };
}

function reviewerPairEligibility(assessmentId, reviewerA, reviewerB, options = {}) {
  const requiredClinicalScaleEstimateVersion = options.clinicalScaleEstimateVersion ?? CLINICAL_SCALE_ESTIMATE_VERSION;
  const reasons = [];
  if (!reviewerA) reasons.push("missing reviewer A row");
  if (!reviewerB) reasons.push("missing reviewer B row");
  if (!reviewerA || !reviewerB) {
    return { assessmentId, eligible: false, reasons };
  }

  const reviewerAEligibility = reviewerRowEligibility(reviewerA, {
    ...options,
    requiredPrimaryScaleKeys: [],
  });
  const reviewerBEligibility = reviewerRowEligibility(reviewerB, {
    ...options,
    requiredPrimaryScaleKeys: [],
  });
  reasons.push(...reviewerAEligibility.reasons.map((reason) => `reviewer A: ${reason}`));
  reasons.push(...reviewerBEligibility.reasons.map((reason) => `reviewer B: ${reason}`));

  const reviewerAVersion = clinicalScaleEstimateVersion(reviewerA);
  const reviewerBVersion = clinicalScaleEstimateVersion(reviewerB);
  if (reviewerAVersion !== requiredClinicalScaleEstimateVersion) {
    reasons.push(`reviewer A estimator version is not v${requiredClinicalScaleEstimateVersion}`);
  }
  if (reviewerBVersion !== requiredClinicalScaleEstimateVersion) {
    reasons.push(`reviewer B estimator version is not v${requiredClinicalScaleEstimateVersion}`);
  }
  if (reviewerAVersion !== reviewerBVersion) {
    reasons.push("reviewer sheets have mismatched estimator versions");
  }
  const reviewerACaseId = validationCaseId(reviewerA);
  const reviewerBCaseId = validationCaseId(reviewerB);
  if (reviewerACaseId && reviewerBCaseId && reviewerACaseId !== reviewerBCaseId) {
    reasons.push("reviewer sheets have mismatched validation case ids");
  }
  const reviewerAId = reviewerId(reviewerA);
  const reviewerBId = reviewerId(reviewerB);
  if (reviewerAId && reviewerBId && reviewerAId === reviewerBId) {
    reasons.push("reviewer sheets use the same reviewer id");
  }
  if (estimateEvidenceSummaryPart(reviewerA, reviewerB)) {
    reasons.push("reviewer sheets have mismatched estimate evidence");
  }
  if (options.requirePairedPrimaryLabels !== false && !hasAnyPairedPrimaryReviewScale(reviewerA, reviewerB)) {
    reasons.push("missing paired primary reviewer labels");
  }

  return {
    assessmentId,
    eligible: reasons.length === 0,
    reasons,
  };
}

function reviewerRowsByAssessmentId(csvText = "") {
  const rows = parseCsv(csvText).filter((row) => row.some((cell) => String(cell ?? "").trim()));
  const out = new Map();
  if (!rows.length) return out;
  const headers = rows[0];
  const indexByHeader = Object.fromEntries(headers.map((header, index) => [header, index]));
  const assessmentIdCounts = new Map();
  let missingAssessmentIdRowCount = 0;
  for (const row of rows.slice(1)) {
    const rowType = valueFromRow(row, indexByHeader, "rowType").trim();
    const assessmentId = valueFromRow(row, indexByHeader, "assessmentId").trim();
    if (rowType && rowType !== "assessmentClinicalScale") continue;
    if (!assessmentId) {
      missingAssessmentIdRowCount += 1;
      continue;
    }
    assessmentIdCounts.set(assessmentId, (assessmentIdCounts.get(assessmentId) ?? 0) + 1);
    if (out.has(assessmentId)) continue;
    const next = {};
    for (const column of LABEL_COLUMNS) next[column] = valueFromRow(row, indexByHeader, column);
    next.__estimateUsedMovementExerciseIdsColumnPresent = indexByHeader.estimateUsedMovementExerciseIds != null;
    next.__estimateOmittedMovementExerciseIdsColumnPresent = indexByHeader.estimateOmittedMovementExerciseIds != null;
    next.__estimateCalculationUsesOnlyUsableMovementsColumnPresent = indexByHeader.estimateCalculationUsesOnlyUsableMovements != null;
    next.__estimateHouseBrackmannInputCompleteColumnPresent = indexByHeader.estimateHouseBrackmannInputComplete != null;
    next.__estimateHouseBrackmannRequiredExerciseIdsColumnPresent = indexByHeader.estimateHouseBrackmannRequiredExerciseIds != null;
    next.__estimateHouseBrackmannUsedExerciseIdsColumnPresent = indexByHeader.estimateHouseBrackmannUsedExerciseIds != null;
    next.__estimateHouseBrackmannMissingRequiredExerciseIdsColumnPresent = indexByHeader.estimateHouseBrackmannMissingRequiredExerciseIds != null;
    next.__estimateSunnybrookInputCompleteColumnPresent = indexByHeader.estimateSunnybrookInputComplete != null;
    next.__estimateSunnybrookUsedExerciseIdsColumnPresent = indexByHeader.estimateSunnybrookUsedExerciseIds != null;
    next.__estimateSunnybrookOmittedExerciseIdsColumnPresent = indexByHeader.estimateSunnybrookOmittedExerciseIds != null;
    next.__estimateEfaceInputCompleteColumnPresent = indexByHeader.estimateEfaceInputComplete != null;
    next.__estimateEfaceUsedExerciseIdsColumnPresent = indexByHeader.estimateEfaceUsedExerciseIds != null;
    next.__estimateEfaceOmittedExerciseIdsColumnPresent = indexByHeader.estimateEfaceOmittedExerciseIds != null;
    next.__estimateRequiredRestingMetricKeysColumnPresent = indexByHeader.estimateRequiredRestingMetricKeys != null;
    next.__estimateAvailableRestingMetricKeysColumnPresent = indexByHeader.estimateAvailableRestingMetricKeys != null;
    next.__estimateMissingRestingMetricKeysColumnPresent = indexByHeader.estimateMissingRestingMetricKeys != null;
    next.__estimateCalculationUsesCompleteRestingMetricsColumnPresent = indexByHeader.estimateCalculationUsesCompleteRestingMetrics != null;
    out.set(assessmentId, next);
  }
  const duplicateAssessmentIds = [...assessmentIdCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([assessmentId]) => assessmentId)
    .sort();
  out.duplicateAssessmentIds = duplicateAssessmentIds;
  out.duplicateAssessmentIdCount = duplicateAssessmentIds.length;
  out.duplicateAssessmentRowCount = duplicateAssessmentIds.reduce((sum, assessmentId) => sum + (assessmentIdCounts.get(assessmentId) ?? 0), 0);
  out.missingAssessmentIdRowCount = missingAssessmentIdRowCount;
  return out;
}

function createScaleAccumulator(scaleKey) {
  const config = REVIEW_SCALE_CONFIG[scaleKey];
  return {
    scale: scaleKey,
    label: config.label,
    agreementLabel: config.agreementLabel,
    tolerance: config.tolerance,
    pairedCount: 0,
    missingReviewerACount: 0,
    missingReviewerBCount: 0,
    exactMatchCount: 0,
    withinToleranceCount: 0,
    incompleteEstimateInputCount: 0,
    absoluteDeltas: [],
    disagreements: [],
  };
}

function scaleEstimateInputComplete(row = {}, scaleKey) {
  const completeKey = SCALE_ESTIMATE_INPUT_COMPLETE_KEYS[scaleKey];
  return !completeKey || estimateBooleanValue(row, completeKey) === true;
}

function recordIncompleteEstimateInput(accumulator, assessmentId, reviewerAComplete, reviewerBComplete) {
  accumulator.incompleteEstimateInputCount += 1;
  accumulator.disagreements.push({
    assessmentId,
    reviewerA: null,
    reviewerB: null,
    reason: reviewerAComplete === reviewerBComplete
      ? "incomplete scale-specific estimate input"
      : `incomplete scale-specific estimate input for ${reviewerAComplete ? "reviewer B" : "reviewer A"}`,
  });
}

function updateScaleAccumulator(accumulator, assessmentId, reviewerAValue, reviewerBValue) {
  const a = scaleValue(accumulator.scale, reviewerAValue);
  const b = scaleValue(accumulator.scale, reviewerBValue);
  if (a == null && b == null) return;
  if (a == null) {
    accumulator.missingReviewerACount += 1;
    accumulator.disagreements.push({ assessmentId, reviewerA: null, reviewerB: b, reason: "missing reviewer A label" });
    return;
  }
  if (b == null) {
    accumulator.missingReviewerBCount += 1;
    accumulator.disagreements.push({ assessmentId, reviewerA: a, reviewerB: null, reason: "missing reviewer B label" });
    return;
  }
  const delta = a - b;
  const absDelta = Math.abs(delta);
  accumulator.pairedCount += 1;
  accumulator.absoluteDeltas.push(absDelta);
  if (absDelta === 0) accumulator.exactMatchCount += 1;
  if (absDelta <= accumulator.tolerance) accumulator.withinToleranceCount += 1;
  if (absDelta > accumulator.tolerance || absDelta > 0) {
    accumulator.disagreements.push({
      assessmentId,
      reviewerA: compactNumber(a, 2),
      reviewerB: compactNumber(b, 2),
      delta: compactNumber(delta, 2),
      withinTolerance: absDelta <= accumulator.tolerance,
      reason: absDelta <= accumulator.tolerance ? "different labels within tolerance" : `outside ${accumulator.agreementLabel}`,
    });
  }
}

function summarizeScale(accumulator, options = {}) {
  const minAgreementRate = options.minAgreementRate ?? DEFAULT_REVIEWER_AGREEMENT_STANDARD.minAgreementRate;
  const minAgreementWilsonLowerBound = options.minAgreementWilsonLowerBound ?? DEFAULT_REVIEWER_AGREEMENT_STANDARD.minAgreementWilsonLowerBound;
  const minPairedLabels = Math.max(1, Math.round(options.minPairedLabels ?? DEFAULT_REVIEWER_AGREEMENT_STANDARD.minPairedLabels));
  const confidenceLevel = options.confidenceLevel ?? DEFAULT_REVIEWER_AGREEMENT_STANDARD.confidenceLevel;
  const meanAbsDelta = accumulator.absoluteDeltas.length
    ? accumulator.absoluteDeltas.reduce((sum, value) => sum + value, 0) / accumulator.absoluteDeltas.length
    : null;
  const withinToleranceRate = compactRate(accumulator.withinToleranceCount, accumulator.pairedCount);
  const confidenceInterval = wilsonScoreInterval(accumulator.withinToleranceCount, accumulator.pairedCount, confidenceLevel);
  const blockingReasons = [];
  if (accumulator.pairedCount < minPairedLabels) blockingReasons.push(`needs at least ${minPairedLabels} paired reviewer labels`);
  if (accumulator.incompleteEstimateInputCount > 0 && accumulator.pairedCount < minPairedLabels) {
    blockingReasons.push(`${accumulator.incompleteEstimateInputCount} paired labels skipped for incomplete scale-specific estimate input`);
  }
  if (withinToleranceRate == null || withinToleranceRate < minAgreementRate) {
    blockingReasons.push(`needs at least ${Math.round(minAgreementRate * 100)}% ${accumulator.agreementLabel}`);
  }
  if (confidenceInterval?.lower == null || confidenceInterval.lower < minAgreementWilsonLowerBound) {
    blockingReasons.push(`needs ${Math.round(confidenceLevel * 100)}% Wilson lower bound at least ${Math.round(minAgreementWilsonLowerBound * 100)}% for ${accumulator.agreementLabel}`);
  }
  return {
    scale: accumulator.scale,
    label: accumulator.label,
    agreementLabel: accumulator.agreementLabel,
    tolerance: accumulator.tolerance,
    pairedCount: accumulator.pairedCount,
    missingReviewerACount: accumulator.missingReviewerACount,
    missingReviewerBCount: accumulator.missingReviewerBCount,
    incompleteEstimateInputCount: accumulator.incompleteEstimateInputCount,
    exactMatchCount: accumulator.exactMatchCount,
    withinToleranceCount: accumulator.withinToleranceCount,
    exactAgreementRate: compactRate(accumulator.exactMatchCount, accumulator.pairedCount),
    withinToleranceRate,
    withinToleranceConfidenceInterval: confidenceInterval,
    meanAbsDelta: compactNumber(meanAbsDelta, 2),
    meetsMinimumStandard: blockingReasons.length === 0,
    blockingReasons,
    disagreementCount: accumulator.disagreements.length,
    disagreements: accumulator.disagreements.slice(0, 20),
  };
}

function reviewerValue(row, scaleKey) {
  if (!row) return "";
  return row[scaleKey] ?? "";
}

function estimateVersionSummaryPart(reviewerA, reviewerB) {
  const aVersion = clinicalScaleEstimateVersion(reviewerA);
  const bVersion = clinicalScaleEstimateVersion(reviewerB);
  if (aVersion === bVersion) return null;
  return `Estimator version: reviewer A ${estimateVersionCountKey(aVersion)} vs reviewer B ${estimateVersionCountKey(bVersion)}`;
}

function estimateEvidenceKey(row = {}) {
  const coverage = estimateUsableMovementCoverageRatio(row);
  const usableCount = estimateMovementCount(row, "estimateUsableMovementCount");
  const requiredCount = estimateMovementCount(row, "estimateRequiredMovementCount");
  const usedMovementIds = normalizedEstimateEvidenceText(row, "estimateUsedMovementExerciseIds");
  const omittedMovementIds = normalizedEstimateEvidenceText(row, "estimateOmittedMovementExerciseIds");
  const calculationUsesOnlyUsableMovements = normalizedEstimateEvidenceText(row, "estimateCalculationUsesOnlyUsableMovements");
  const houseBrackmannInputComplete = normalizedEstimateEvidenceText(row, "estimateHouseBrackmannInputComplete");
  const houseBrackmannRequiredExerciseIds = normalizedEstimateEvidenceText(row, "estimateHouseBrackmannRequiredExerciseIds");
  const houseBrackmannUsedExerciseIds = normalizedEstimateEvidenceText(row, "estimateHouseBrackmannUsedExerciseIds");
  const houseBrackmannMissingRequiredExerciseIds = normalizedEstimateEvidenceText(row, "estimateHouseBrackmannMissingRequiredExerciseIds");
  const sunnybrookInputComplete = normalizedEstimateEvidenceText(row, "estimateSunnybrookInputComplete");
  const sunnybrookUsedExerciseIds = normalizedEstimateEvidenceText(row, "estimateSunnybrookUsedExerciseIds");
  const sunnybrookOmittedExerciseIds = normalizedEstimateEvidenceText(row, "estimateSunnybrookOmittedExerciseIds");
  const efaceInputComplete = normalizedEstimateEvidenceText(row, "estimateEfaceInputComplete");
  const efaceUsedExerciseIds = normalizedEstimateEvidenceText(row, "estimateEfaceUsedExerciseIds");
  const efaceOmittedExerciseIds = normalizedEstimateEvidenceText(row, "estimateEfaceOmittedExerciseIds");
  const requiredRestingMetricKeys = normalizedEstimateEvidenceText(row, "estimateRequiredRestingMetricKeys");
  const availableRestingMetricKeys = normalizedEstimateEvidenceText(row, "estimateAvailableRestingMetricKeys");
  const missingRestingMetricKeys = normalizedEstimateEvidenceText(row, "estimateMissingRestingMetricKeys");
  const calculationUsesCompleteRestingMetrics = normalizedEstimateEvidenceText(row, "estimateCalculationUsesCompleteRestingMetrics");
  return [
    estimateStatus(row) || "missing-status",
    estimateEvidenceTier(row) || "missing-tier",
    Number.isFinite(coverage) ? coverage.toFixed(4) : "missing-coverage",
    usableCount == null ? "missing-usable-count" : usableCount,
    requiredCount == null ? "missing-required-count" : requiredCount,
    usedMovementIds || "missing-used-movements",
    omittedMovementIds || "missing-omitted-movements",
    calculationUsesOnlyUsableMovements || "missing-calculation-input-filter",
    houseBrackmannInputComplete || "missing-hb-input-complete",
    houseBrackmannRequiredExerciseIds || "missing-hb-required-inputs",
    houseBrackmannUsedExerciseIds || "missing-hb-used-inputs",
    houseBrackmannMissingRequiredExerciseIds || "no-missing-hb-required-inputs",
    sunnybrookInputComplete || "missing-sunnybrook-input-complete",
    sunnybrookUsedExerciseIds || "missing-sunnybrook-used-inputs",
    sunnybrookOmittedExerciseIds || "missing-sunnybrook-omitted-inputs",
    efaceInputComplete || "missing-eface-input-complete",
    efaceUsedExerciseIds || "missing-eface-used-inputs",
    efaceOmittedExerciseIds || "missing-eface-omitted-inputs",
    requiredRestingMetricKeys || "missing-required-resting-metrics",
    availableRestingMetricKeys || "missing-available-resting-metrics",
    missingRestingMetricKeys || "no-missing-resting-metrics",
    calculationUsesCompleteRestingMetrics || "missing-complete-resting-metrics-flag",
  ].join("/");
}

function estimateEvidenceSummaryPart(reviewerA, reviewerB) {
  const aEvidence = estimateEvidenceKey(reviewerA);
  const bEvidence = estimateEvidenceKey(reviewerB);
  if (aEvidence === bEvidence) return null;
  return `Estimate evidence: reviewer A ${aEvidence} vs reviewer B ${bEvidence}`;
}

function disagreementSummaryForAssessment(assessmentId, reviewerA, reviewerB) {
  const parts = [];
  const reviewerACaseId = validationCaseId(reviewerA);
  const reviewerBCaseId = validationCaseId(reviewerB);
  if (reviewerACaseId && reviewerBCaseId && reviewerACaseId !== reviewerBCaseId) {
    parts.push(`Validation case id: reviewer A ${reviewerACaseId} vs reviewer B ${reviewerBCaseId}`);
  }
  const reviewerAId = reviewerId(reviewerA);
  const reviewerBId = reviewerId(reviewerB);
  if (reviewerAId && reviewerBId && reviewerAId === reviewerBId) {
    parts.push(`Reviewer id: both sheets use ${reviewerAId}`);
  }
  const versionPart = estimateVersionSummaryPart(reviewerA, reviewerB);
  if (versionPart) parts.push(versionPart);
  const evidencePart = estimateEvidenceSummaryPart(reviewerA, reviewerB);
  if (evidencePart) parts.push(evidencePart);
  for (const scaleKey of REVIEW_SCALE_KEYS) {
    const config = REVIEW_SCALE_CONFIG[scaleKey];
    const a = scaleValue(scaleKey, reviewerValue(reviewerA, scaleKey));
    const b = scaleValue(scaleKey, reviewerValue(reviewerB, scaleKey));
    if (a == null && b == null) continue;
    if (a == null || b == null) {
      parts.push(`${config.label}: missing ${a == null ? "reviewer A" : "reviewer B"}`);
      continue;
    }
    const delta = Math.abs(a - b);
    if (delta > 0) parts.push(`${config.label}: ${a} vs ${b}${delta <= config.tolerance ? " within tolerance" : " outside tolerance"}`);
  }
  return parts.length ? parts.join("; ") : `No reviewer disagreement detected for ${assessmentId}`;
}

function adjudicationRow(assessmentId, reviewerA, reviewerB) {
  const row = Object.fromEntries(ADJUDICATION_COLUMNS.map((column) => [column, ""]));
  const source = reviewerA ?? reviewerB ?? {};
  row.rowType = "assessmentClinicalScale";
  row.assessmentId = assessmentId;
  row.validationCaseId = validationCaseId(reviewerA) === validationCaseId(reviewerB) ? validationCaseId(reviewerA) : "";
  row.sessionId = source.sessionId ?? "";
  row.sessionTs = source.sessionTs ?? "";
  row.date = source.date ?? "";
  const reviewerAVersion = clinicalScaleEstimateVersion(reviewerA);
  const reviewerBVersion = clinicalScaleEstimateVersion(reviewerB);
  const reviewerAEvidence = estimateEvidenceKey(reviewerA);
  const reviewerBEvidence = estimateEvidenceKey(reviewerB);
  row.clinicalScaleEstimateVersion = reviewerAVersion === reviewerBVersion && reviewerAVersion != null ? reviewerAVersion : "";
  row.estimateStatus = estimateStatus(reviewerA) === estimateStatus(reviewerB) ? estimateStatus(reviewerA) : "";
  row.estimateEvidenceTier = estimateEvidenceTier(reviewerA) === estimateEvidenceTier(reviewerB) ? estimateEvidenceTier(reviewerA) : "";
  row.estimateUsableMovementCoverageRatio = reviewerAEvidence === reviewerBEvidence ? estimateUsableMovementCoverageRatio(reviewerA) ?? "" : "";
  row.estimateUsableMovementCount = reviewerAEvidence === reviewerBEvidence ? reviewerA?.estimateUsableMovementCount ?? "" : "";
  row.estimateRequiredMovementCount = reviewerAEvidence === reviewerBEvidence ? reviewerA?.estimateRequiredMovementCount ?? "" : "";
  row.estimateUsedMovementExerciseIds = reviewerAEvidence === reviewerBEvidence ? reviewerA?.estimateUsedMovementExerciseIds ?? "" : "";
  row.estimateOmittedMovementExerciseIds = reviewerAEvidence === reviewerBEvidence ? reviewerA?.estimateOmittedMovementExerciseIds ?? "" : "";
  row.estimateCalculationUsesOnlyUsableMovements = reviewerAEvidence === reviewerBEvidence ? reviewerA?.estimateCalculationUsesOnlyUsableMovements ?? "" : "";
  row.estimateSunnybrookInputComplete = reviewerAEvidence === reviewerBEvidence ? reviewerA?.estimateSunnybrookInputComplete ?? "" : "";
  row.estimateSunnybrookUsedExerciseIds = reviewerAEvidence === reviewerBEvidence ? reviewerA?.estimateSunnybrookUsedExerciseIds ?? "" : "";
  row.estimateSunnybrookOmittedExerciseIds = reviewerAEvidence === reviewerBEvidence ? reviewerA?.estimateSunnybrookOmittedExerciseIds ?? "" : "";
  row.estimateEfaceInputComplete = reviewerAEvidence === reviewerBEvidence ? reviewerA?.estimateEfaceInputComplete ?? "" : "";
  row.estimateEfaceUsedExerciseIds = reviewerAEvidence === reviewerBEvidence ? reviewerA?.estimateEfaceUsedExerciseIds ?? "" : "";
  row.estimateEfaceOmittedExerciseIds = reviewerAEvidence === reviewerBEvidence ? reviewerA?.estimateEfaceOmittedExerciseIds ?? "" : "";
  row.estimateRequiredRestingMetricKeys = reviewerAEvidence === reviewerBEvidence ? reviewerA?.estimateRequiredRestingMetricKeys ?? "" : "";
  row.estimateAvailableRestingMetricKeys = reviewerAEvidence === reviewerBEvidence ? reviewerA?.estimateAvailableRestingMetricKeys ?? "" : "";
  row.estimateMissingRestingMetricKeys = reviewerAEvidence === reviewerBEvidence ? reviewerA?.estimateMissingRestingMetricKeys ?? "" : "";
  row.estimateCalculationUsesCompleteRestingMetrics = reviewerAEvidence === reviewerBEvidence ? reviewerA?.estimateCalculationUsesCompleteRestingMetrics ?? "" : "";
  row.reviewerAClinicalScaleEstimateVersion = reviewerAVersion ?? "";
  row.reviewerBClinicalScaleEstimateVersion = reviewerBVersion ?? "";
  row.reviewerAEstimateStatus = estimateStatus(reviewerA);
  row.reviewerBEstimateStatus = estimateStatus(reviewerB);
  row.reviewerAEstimateEvidenceTier = estimateEvidenceTier(reviewerA);
  row.reviewerBEstimateEvidenceTier = estimateEvidenceTier(reviewerB);
  row.reviewerAEstimateUsableMovementCoverageRatio = estimateUsableMovementCoverageRatio(reviewerA) ?? "";
  row.reviewerBEstimateUsableMovementCoverageRatio = estimateUsableMovementCoverageRatio(reviewerB) ?? "";
  row.reviewerAEstimateUsedMovementExerciseIds = reviewerA?.estimateUsedMovementExerciseIds ?? "";
  row.reviewerBEstimateUsedMovementExerciseIds = reviewerB?.estimateUsedMovementExerciseIds ?? "";
  row.reviewerAEstimateOmittedMovementExerciseIds = reviewerA?.estimateOmittedMovementExerciseIds ?? "";
  row.reviewerBEstimateOmittedMovementExerciseIds = reviewerB?.estimateOmittedMovementExerciseIds ?? "";
  row.reviewerAEstimateCalculationUsesOnlyUsableMovements = reviewerA?.estimateCalculationUsesOnlyUsableMovements ?? "";
  row.reviewerBEstimateCalculationUsesOnlyUsableMovements = reviewerB?.estimateCalculationUsesOnlyUsableMovements ?? "";
  row.reviewerAEstimateSunnybrookInputComplete = reviewerA?.estimateSunnybrookInputComplete ?? "";
  row.reviewerBEstimateSunnybrookInputComplete = reviewerB?.estimateSunnybrookInputComplete ?? "";
  row.reviewerAEstimateSunnybrookUsedExerciseIds = reviewerA?.estimateSunnybrookUsedExerciseIds ?? "";
  row.reviewerBEstimateSunnybrookUsedExerciseIds = reviewerB?.estimateSunnybrookUsedExerciseIds ?? "";
  row.reviewerAEstimateSunnybrookOmittedExerciseIds = reviewerA?.estimateSunnybrookOmittedExerciseIds ?? "";
  row.reviewerBEstimateSunnybrookOmittedExerciseIds = reviewerB?.estimateSunnybrookOmittedExerciseIds ?? "";
  row.reviewerAEstimateEfaceInputComplete = reviewerA?.estimateEfaceInputComplete ?? "";
  row.reviewerBEstimateEfaceInputComplete = reviewerB?.estimateEfaceInputComplete ?? "";
  row.reviewerAEstimateEfaceUsedExerciseIds = reviewerA?.estimateEfaceUsedExerciseIds ?? "";
  row.reviewerBEstimateEfaceUsedExerciseIds = reviewerB?.estimateEfaceUsedExerciseIds ?? "";
  row.reviewerAEstimateEfaceOmittedExerciseIds = reviewerA?.estimateEfaceOmittedExerciseIds ?? "";
  row.reviewerBEstimateEfaceOmittedExerciseIds = reviewerB?.estimateEfaceOmittedExerciseIds ?? "";
  row.reviewerAEstimateRequiredRestingMetricKeys = reviewerA?.estimateRequiredRestingMetricKeys ?? "";
  row.reviewerBEstimateRequiredRestingMetricKeys = reviewerB?.estimateRequiredRestingMetricKeys ?? "";
  row.reviewerAEstimateAvailableRestingMetricKeys = reviewerA?.estimateAvailableRestingMetricKeys ?? "";
  row.reviewerBEstimateAvailableRestingMetricKeys = reviewerB?.estimateAvailableRestingMetricKeys ?? "";
  row.reviewerAEstimateMissingRestingMetricKeys = reviewerA?.estimateMissingRestingMetricKeys ?? "";
  row.reviewerBEstimateMissingRestingMetricKeys = reviewerB?.estimateMissingRestingMetricKeys ?? "";
  row.reviewerAEstimateCalculationUsesCompleteRestingMetrics = reviewerA?.estimateCalculationUsesCompleteRestingMetrics ?? "";
  row.reviewerBEstimateCalculationUsesCompleteRestingMetrics = reviewerB?.estimateCalculationUsesCompleteRestingMetrics ?? "";
  row.reviewerAHouseBrackmannGrade = formatHouseBrackmann(reviewerA?.houseBrackmannGrade);
  row.reviewerBHouseBrackmannGrade = formatHouseBrackmann(reviewerB?.houseBrackmannGrade);
  row.reviewerASunnybrookComposite = reviewerA?.sunnybrookComposite ?? "";
  row.reviewerBSunnybrookComposite = reviewerB?.sunnybrookComposite ?? "";
  row.reviewerAEfaceTotal = reviewerA?.efaceTotal ?? "";
  row.reviewerBEfaceTotal = reviewerB?.efaceTotal ?? "";
  row.reviewerAEfaceStatic = reviewerA?.efaceStatic ?? "";
  row.reviewerBEfaceStatic = reviewerB?.efaceStatic ?? "";
  row.reviewerAEfaceDynamic = reviewerA?.efaceDynamic ?? "";
  row.reviewerBEfaceDynamic = reviewerB?.efaceDynamic ?? "";
  row.reviewerAEfaceSynkinesis = reviewerA?.efaceSynkinesis ?? "";
  row.reviewerBEfaceSynkinesis = reviewerB?.efaceSynkinesis ?? "";
  row.reviewerAReviewerId = reviewerA?.reviewerId ?? "";
  row.reviewerBReviewerId = reviewerB?.reviewerId ?? "";
  row.reviewerAClinicianConfidence = reviewerA?.clinicianConfidence ?? "";
  row.reviewerBClinicianConfidence = reviewerB?.clinicianConfidence ?? "";
  row.reviewerANotes = reviewerA?.notes ?? "";
  row.reviewerBNotes = reviewerB?.notes ?? "";
  row.adjudicationRequired = "yes";
  row.disagreementSummary = disagreementSummaryForAssessment(assessmentId, reviewerA, reviewerB);
  return row;
}

function needsAdjudication(reviewerA, reviewerB) {
  if (!reviewerA || !reviewerB) return true;
  if (clinicalScaleEstimateVersion(reviewerA) !== clinicalScaleEstimateVersion(reviewerB)) return true;
  if (validationCaseId(reviewerA) && validationCaseId(reviewerB) && validationCaseId(reviewerA) !== validationCaseId(reviewerB)) return true;
  if (reviewerId(reviewerA) && reviewerId(reviewerB) && reviewerId(reviewerA) === reviewerId(reviewerB)) return true;
  if (estimateEvidenceSummaryPart(reviewerA, reviewerB)) return true;
  return REVIEW_SCALE_KEYS.some((scaleKey) => {
    const a = scaleValue(scaleKey, reviewerValue(reviewerA, scaleKey));
    const b = scaleValue(scaleKey, reviewerValue(reviewerB, scaleKey));
    if (a == null && b == null) return false;
    if (a == null || b == null) return true;
    return Math.abs(a - b) > 0;
  });
}

function createHouseBrackmannCaseMixAccumulator() {
  return {
    pairedHouseBrackmannCount: 0,
    crossSeverityBandDisagreementCount: 0,
    crossSeverityBandDisagreements: [],
    severityBands: Object.fromEntries(Object.entries(HOUSE_BRACKMANN_SEVERITY_BANDS).map(([key, band]) => [
      key,
      {
        label: band.label,
        reviewerAPairedCount: 0,
        reviewerBPairedCount: 0,
        sameBandPairedCount: 0,
      },
    ])),
  };
}

function recordHouseBrackmannCaseMix(accumulator, assessmentId, reviewerA = {}, reviewerB = {}) {
  const reviewerAGrade = scaleValue("houseBrackmannGrade", reviewerA?.houseBrackmannGrade);
  const reviewerBGrade = scaleValue("houseBrackmannGrade", reviewerB?.houseBrackmannGrade);
  const reviewerABand = houseBrackmannSeverityBand(reviewerAGrade);
  const reviewerBBand = houseBrackmannSeverityBand(reviewerBGrade);
  if (!reviewerABand || !reviewerBBand) return;
  accumulator.pairedHouseBrackmannCount += 1;
  accumulator.severityBands[reviewerABand].reviewerAPairedCount += 1;
  accumulator.severityBands[reviewerBBand].reviewerBPairedCount += 1;
  if (reviewerABand === reviewerBBand) {
    accumulator.severityBands[reviewerABand].sameBandPairedCount += 1;
    return;
  }
  accumulator.crossSeverityBandDisagreementCount += 1;
  accumulator.crossSeverityBandDisagreements.push({
    assessmentId,
    reviewerA: formatHouseBrackmann(reviewerAGrade),
    reviewerB: formatHouseBrackmann(reviewerBGrade),
    reviewerASeverityBand: HOUSE_BRACKMANN_SEVERITY_BANDS[reviewerABand].label,
    reviewerBSeverityBand: HOUSE_BRACKMANN_SEVERITY_BANDS[reviewerBBand].label,
  });
}

function summarizeHouseBrackmannCaseMix(accumulator, options = {}) {
  const minHouseBrackmannSeverityBands = Math.max(
    1,
    Math.round(options.minHouseBrackmannSeverityBands ?? DEFAULT_REVIEWER_AGREEMENT_STANDARD.minHouseBrackmannSeverityBands),
  );
  const minAssessmentsPerSeverityBand = Math.max(
    1,
    Math.round(options.minAssessmentsPerSeverityBand ?? DEFAULT_REVIEWER_AGREEMENT_STANDARD.minAssessmentsPerSeverityBand),
  );
  const severityBands = Object.fromEntries(Object.entries(accumulator.severityBands).map(([key, band]) => [
    key,
    {
      ...band,
      meetsMinimum: band.sameBandPairedCount >= minAssessmentsPerSeverityBand,
    },
  ]));
  const representedSeverityBandCount = Object.values(severityBands)
    .filter((band) => band.meetsMinimum)
    .length;
  const minimumSameBandPairedLabelCount = Math.min(
    ...Object.values(severityBands).map((band) => band.sameBandPairedCount),
  );
  const blockingReasons = [];
  if (representedSeverityBandCount < minHouseBrackmannSeverityBands) {
    blockingReasons.push(`needs ${minHouseBrackmannSeverityBands} House-Brackmann severity bands with at least ${minAssessmentsPerSeverityBand} same-band paired reviewer labels`);
  }
  if (accumulator.crossSeverityBandDisagreementCount > 0) {
    blockingReasons.push(`requires adjudication for ${accumulator.crossSeverityBandDisagreementCount} House-Brackmann cross-severity band reviewer disagreement${accumulator.crossSeverityBandDisagreementCount === 1 ? "" : "s"}`);
  }
  return {
    minHouseBrackmannSeverityBands,
    minAssessmentsPerSeverityBand,
    pairedHouseBrackmannCount: accumulator.pairedHouseBrackmannCount,
    representedSeverityBandCount,
    minimumSameBandPairedLabelCount: Number.isFinite(minimumSameBandPairedLabelCount) ? minimumSameBandPairedLabelCount : 0,
    crossSeverityBandDisagreementCount: accumulator.crossSeverityBandDisagreementCount,
    severityBands,
    crossSeverityBandDisagreements: accumulator.crossSeverityBandDisagreements.slice(0, 20),
    blockingReasons,
  };
}

function compareClinicalScaleReviewerLabels(reviewerACsv = "", reviewerBCsv = "", options = {}) {
  const reviewerAById = reviewerRowsByAssessmentId(reviewerACsv);
  const reviewerBById = reviewerRowsByAssessmentId(reviewerBCsv);
  const reviewerADuplicateAssessmentIds = reviewerAById.duplicateAssessmentIds ?? [];
  const reviewerBDuplicateAssessmentIds = reviewerBById.duplicateAssessmentIds ?? [];
  const reviewerADuplicateAssessmentRowCount = reviewerAById.duplicateAssessmentRowCount ?? 0;
  const reviewerBDuplicateAssessmentRowCount = reviewerBById.duplicateAssessmentRowCount ?? 0;
  const reviewerAMissingAssessmentIdRowCount = reviewerAById.missingAssessmentIdRowCount ?? 0;
  const reviewerBMissingAssessmentIdRowCount = reviewerBById.missingAssessmentIdRowCount ?? 0;
  const requiredClinicalScaleEstimateVersion = options.clinicalScaleEstimateVersion ?? CLINICAL_SCALE_ESTIMATE_VERSION;
  const minAgreementRate = options.minAgreementRate ?? DEFAULT_REVIEWER_AGREEMENT_STANDARD.minAgreementRate;
  const minAgreementWilsonLowerBound = options.minAgreementWilsonLowerBound ?? DEFAULT_REVIEWER_AGREEMENT_STANDARD.minAgreementWilsonLowerBound;
  const minPairedLabels = Math.max(1, Math.round(options.minPairedLabels ?? DEFAULT_REVIEWER_AGREEMENT_STANDARD.minPairedLabels));
  const minDistinctClinicalCases = Math.max(1, Math.round(options.minDistinctClinicalCases ?? DEFAULT_REVIEWER_AGREEMENT_STANDARD.minDistinctClinicalCases));
  const minHouseBrackmannSeverityBands = Math.max(1, Math.round(options.minHouseBrackmannSeverityBands ?? DEFAULT_REVIEWER_AGREEMENT_STANDARD.minHouseBrackmannSeverityBands));
  const minAssessmentsPerSeverityBand = Math.max(1, Math.round(options.minAssessmentsPerSeverityBand ?? DEFAULT_REVIEWER_AGREEMENT_STANDARD.minAssessmentsPerSeverityBand));
  const minUsableMovementCoverageRatio = options.minUsableMovementCoverageRatio ?? DEFAULT_REVIEWER_AGREEMENT_STANDARD.minUsableMovementCoverageRatio;
  const confidenceLevel = options.confidenceLevel ?? DEFAULT_REVIEWER_AGREEMENT_STANDARD.confidenceLevel;
  const sourceDatasetSha256 = sourceDatasetSha256FromOptions(options);
  const agreementOptions = {
    minAgreementRate,
    minAgreementWilsonLowerBound,
    minPairedLabels,
    minDistinctClinicalCases,
    minHouseBrackmannSeverityBands,
    minAssessmentsPerSeverityBand,
    confidenceLevel,
  };
  const estimateEvidenceOptions = { minUsableMovementCoverageRatio };
  const assessmentIds = [...new Set([...reviewerAById.keys(), ...reviewerBById.keys()])].sort();
  const accumulators = Object.fromEntries(REVIEW_SCALE_KEYS.map((scaleKey) => [scaleKey, createScaleAccumulator(scaleKey)]));
  const houseBrackmannCaseMixAccumulator = createHouseBrackmannCaseMixAccumulator();
  const adjudicationRows = [];
  const estimateVersionMismatches = [];
  const estimateEvidenceMismatches = [];
  const excludedReviewerPairReasons = {};
  const excludedReviewerPairs = [];
  const distinctValidationCaseIds = new Set();
  let eligibleReviewerPairCount = 0;
  for (const assessmentId of assessmentIds) {
    const reviewerA = reviewerAById.get(assessmentId) ?? null;
    const reviewerB = reviewerBById.get(assessmentId) ?? null;
    const pairEligibility = reviewerPairEligibility(assessmentId, reviewerA, reviewerB, {
      ...estimateEvidenceOptions,
      clinicalScaleEstimateVersion: requiredClinicalScaleEstimateVersion,
      requirePairedPrimaryLabels: false,
    });
    if (reviewerA && reviewerB && clinicalScaleEstimateVersion(reviewerA) !== clinicalScaleEstimateVersion(reviewerB)) {
      estimateVersionMismatches.push({
        assessmentId,
        reviewerA: estimateVersionCountKey(clinicalScaleEstimateVersion(reviewerA)),
        reviewerB: estimateVersionCountKey(clinicalScaleEstimateVersion(reviewerB)),
      });
    }
    if (reviewerA && reviewerB && estimateEvidenceSummaryPart(reviewerA, reviewerB)) {
      estimateEvidenceMismatches.push({
        assessmentId,
        reviewerA: estimateEvidenceKey(reviewerA),
        reviewerB: estimateEvidenceKey(reviewerB),
      });
    }
    if (pairEligibility.eligible) {
      recordHouseBrackmannCaseMix(houseBrackmannCaseMixAccumulator, assessmentId, reviewerA, reviewerB);
      for (const scaleKey of REVIEW_SCALE_KEYS) {
        const reviewerAInputComplete = scaleEstimateInputComplete(reviewerA, scaleKey);
        const reviewerBInputComplete = scaleEstimateInputComplete(reviewerB, scaleKey);
        if (!reviewerAInputComplete || !reviewerBInputComplete) {
          recordIncompleteEstimateInput(accumulators[scaleKey], assessmentId, reviewerAInputComplete, reviewerBInputComplete);
          continue;
        }
        updateScaleAccumulator(accumulators[scaleKey], assessmentId, reviewerValue(reviewerA, scaleKey), reviewerValue(reviewerB, scaleKey));
      }
      if (hasAnyPairedPrimaryReviewScale(reviewerA, reviewerB)) {
        eligibleReviewerPairCount += 1;
        distinctValidationCaseIds.add(validationCaseId(reviewerA));
      } else {
        const excludedPair = {
          assessmentId,
          eligible: false,
          reasons: ["missing paired primary reviewer labels"],
        };
        incrementReasonCounts(excludedReviewerPairReasons, excludedPair.reasons);
        excludedReviewerPairs.push(excludedPair);
      }
    } else {
      incrementReasonCounts(excludedReviewerPairReasons, pairEligibility.reasons);
      excludedReviewerPairs.push(pairEligibility);
    }
    if (needsAdjudication(reviewerA, reviewerB)) adjudicationRows.push(adjudicationRow(assessmentId, reviewerA, reviewerB));
  }
  const byScale = Object.fromEntries(Object.entries(accumulators).map(([scaleKey, accumulator]) => [scaleKey, summarizeScale(accumulator, agreementOptions)]));
  const houseBrackmannCaseMix = summarizeHouseBrackmannCaseMix(houseBrackmannCaseMixAccumulator, agreementOptions);
  const primaryScaleSummaries = PRIMARY_REVIEW_SCALE_KEYS.map((scaleKey) => byScale[scaleKey]);
  const reviewerAEstimateVersionCounts = estimateVersionCounts(reviewerAById);
  const reviewerBEstimateVersionCounts = estimateVersionCounts(reviewerBById);
  const reviewerAReviewerIds = reviewerIds(reviewerAById);
  const reviewerBReviewerIds = reviewerIds(reviewerBById);
  const reviewerIdOverlap = reviewerAReviewerIds.filter((id) => reviewerBReviewerIds.includes(id));
  const reviewerAEligibility = reviewerSheetEligibility(reviewerAById, "reviewerA", estimateEvidenceOptions);
  const reviewerBEligibility = reviewerSheetEligibility(reviewerBById, "reviewerB", estimateEvidenceOptions);
  const reviewerAStaleOrMissingEstimateVersionCount = [...reviewerAById.values()].filter((row) => clinicalScaleEstimateVersion(row) !== requiredClinicalScaleEstimateVersion).length;
  const reviewerBStaleOrMissingEstimateVersionCount = [...reviewerBById.values()].filter((row) => clinicalScaleEstimateVersion(row) !== requiredClinicalScaleEstimateVersion).length;
  const reviewerAInsufficientEstimateEvidenceCount = estimateEvidenceIssueCount(reviewerAById, estimateEvidenceOptions);
  const reviewerBInsufficientEstimateEvidenceCount = estimateEvidenceIssueCount(reviewerBById, estimateEvidenceOptions);
  const blockingReasons = [];
  if (!assessmentIds.length) blockingReasons.push("no shared clinical-scale assessment labels found");
  if (reviewerADuplicateAssessmentIds.length) {
    blockingReasons.push(`reviewerA: ${reviewerADuplicateAssessmentIds.length} duplicate assessment id${reviewerADuplicateAssessmentIds.length === 1 ? "" : "s"} in reviewer sheet`);
  }
  if (reviewerBDuplicateAssessmentIds.length) {
    blockingReasons.push(`reviewerB: ${reviewerBDuplicateAssessmentIds.length} duplicate assessment id${reviewerBDuplicateAssessmentIds.length === 1 ? "" : "s"} in reviewer sheet`);
  }
  if (reviewerAMissingAssessmentIdRowCount > 0) {
    blockingReasons.push(`reviewerA: ${reviewerAMissingAssessmentIdRowCount} rows are missing assessment ids`);
  }
  if (reviewerBMissingAssessmentIdRowCount > 0) {
    blockingReasons.push(`reviewerB: ${reviewerBMissingAssessmentIdRowCount} rows are missing assessment ids`);
  }
  if (reviewerAEligibility.ineligibleAssessmentCount > 0) {
    blockingReasons.push(`reviewerA: ${reviewerAEligibility.ineligibleAssessmentCount} labels do not meet blinded independent clinical review metadata/evidence gates`);
  }
  if (reviewerBEligibility.ineligibleAssessmentCount > 0) {
    blockingReasons.push(`reviewerB: ${reviewerBEligibility.ineligibleAssessmentCount} labels do not meet blinded independent clinical review metadata/evidence gates`);
  }
  if (reviewerAInsufficientEstimateEvidenceCount > 0) {
    blockingReasons.push(`reviewerA: ${reviewerAInsufficientEstimateEvidenceCount} labels do not meet estimate evidence gates`);
  }
  if (reviewerBInsufficientEstimateEvidenceCount > 0) {
    blockingReasons.push(`reviewerB: ${reviewerBInsufficientEstimateEvidenceCount} labels do not meet estimate evidence gates`);
  }
  if (reviewerAStaleOrMissingEstimateVersionCount > 0) {
    blockingReasons.push(`reviewerA: ${reviewerAStaleOrMissingEstimateVersionCount} labels are missing or not estimator v${requiredClinicalScaleEstimateVersion}`);
  }
  if (reviewerBStaleOrMissingEstimateVersionCount > 0) {
    blockingReasons.push(`reviewerB: ${reviewerBStaleOrMissingEstimateVersionCount} labels are missing or not estimator v${requiredClinicalScaleEstimateVersion}`);
  }
  if (estimateVersionMismatches.length) {
    blockingReasons.push(`clinicalScaleEstimateVersion: reviewer sheets disagree for ${estimateVersionMismatches.length} assessment labels`);
  }
  if (estimateEvidenceMismatches.length) {
    blockingReasons.push(`estimateEvidence: reviewer sheets disagree for ${estimateEvidenceMismatches.length} assessment labels`);
  }
  if (reviewerAReviewerIds.length !== 1) {
    blockingReasons.push(`reviewerA: expected exactly one pseudonymous reviewer id, found ${reviewerAReviewerIds.length}`);
  }
  if (reviewerBReviewerIds.length !== 1) {
    blockingReasons.push(`reviewerB: expected exactly one pseudonymous reviewer id, found ${reviewerBReviewerIds.length}`);
  }
  if (reviewerIdOverlap.length) {
    blockingReasons.push("reviewerIdentity: reviewer sheets must use distinct pseudonymous reviewer ids");
  }
  if (distinctValidationCaseIds.size < minDistinctClinicalCases) {
    blockingReasons.push(`validationCases: needs at least ${minDistinctClinicalCases} distinct validation cases`);
  }
  if (houseBrackmannCaseMix.blockingReasons.length) {
    blockingReasons.push(`houseBrackmannCaseMix: ${houseBrackmannCaseMix.blockingReasons.join("; ")}`);
  }
  for (const scale of primaryScaleSummaries) {
    if (!scale.meetsMinimumStandard) blockingReasons.push(`${scale.scale}: ${scale.blockingReasons.join("; ")}`);
  }
  return {
    kind: "mirror-clinical-scale-reviewer-agreement-report",
    schemaVersion: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    sourceDatasetSha256,
    reviewerA: options.reviewerA ?? "reviewer-a",
    reviewerB: options.reviewerB ?? "reviewer-b",
    standard: {
      minAgreementRate,
      minAgreementWilsonLowerBound,
      minPairedLabels,
      minDistinctClinicalCases,
      minHouseBrackmannSeverityBands,
      minAssessmentsPerSeverityBand,
      minUsableMovementCoverageRatio,
      requiresV3MovementProvenance: true,
      requiresV4RestingMetricProvenance: true,
      requiresHouseBrackmannRequiredInput: true,
      requiresV5ScaleInputProvenance: true,
      requiresExplicitClinicalConfidence: true,
      requiresIsoReviewTimestamp: true,
      requiresSourceDatasetSha256: true,
      confidenceInterval: {
        method: "wilson-score",
        confidenceLevel,
      },
      primaryScales: PRIMARY_REVIEW_SCALE_KEYS,
    },
    summary: {
      reviewerAAssessmentCount: reviewerAById.size,
      reviewerBAssessmentCount: reviewerBById.size,
      comparedAssessmentCount: assessmentIds.length,
      eligibleReviewerPairCount,
      distinctValidationCaseCount: distinctValidationCaseIds.size,
      excludedReviewerPairCount: excludedReviewerPairs.length,
      excludedReviewerPairReasons,
      adjudicationRequiredCount: adjudicationRows.length,
      primaryScaleCount: PRIMARY_REVIEW_SCALE_KEYS.length,
      requiredClinicalScaleEstimateVersion,
      reviewerAEligibleAssessmentCount: reviewerAEligibility.eligibleAssessmentCount,
      reviewerBEligibleAssessmentCount: reviewerBEligibility.eligibleAssessmentCount,
      reviewerAIneligibleAssessmentCount: reviewerAEligibility.ineligibleAssessmentCount,
      reviewerBIneligibleAssessmentCount: reviewerBEligibility.ineligibleAssessmentCount,
      reviewerAIneligibleReasons: reviewerAEligibility.ineligibleReasons,
      reviewerBIneligibleReasons: reviewerBEligibility.ineligibleReasons,
      reviewerAPrimaryScaleLabelIssueReasons: reviewerAEligibility.primaryScaleLabelIssueReasons,
      reviewerBPrimaryScaleLabelIssueReasons: reviewerBEligibility.primaryScaleLabelIssueReasons,
      reviewerAEstimateVersionCounts,
      reviewerBEstimateVersionCounts,
      reviewerAReviewerIds,
      reviewerBReviewerIds,
      reviewerIdOverlapCount: reviewerIdOverlap.length,
      reviewerADuplicateAssessmentIdCount: reviewerADuplicateAssessmentIds.length,
      reviewerBDuplicateAssessmentIdCount: reviewerBDuplicateAssessmentIds.length,
      reviewerADuplicateAssessmentRowCount,
      reviewerBDuplicateAssessmentRowCount,
      reviewerAMissingAssessmentIdRowCount,
      reviewerBMissingAssessmentIdRowCount,
      reviewerADuplicateAssessmentIds: reviewerADuplicateAssessmentIds.slice(0, 20),
      reviewerBDuplicateAssessmentIds: reviewerBDuplicateAssessmentIds.slice(0, 20),
      reviewerAStaleOrMissingEstimateVersionCount,
      reviewerBStaleOrMissingEstimateVersionCount,
      reviewerAInsufficientEstimateEvidenceCount,
      reviewerBInsufficientEstimateEvidenceCount,
      estimateVersionMismatchCount: estimateVersionMismatches.length,
      estimateEvidenceMismatchCount: estimateEvidenceMismatches.length,
      houseBrackmannRepresentedSeverityBandCount: houseBrackmannCaseMix.representedSeverityBandCount,
      houseBrackmannMinimumSameBandPairedLabelCount: houseBrackmannCaseMix.minimumSameBandPairedLabelCount,
      houseBrackmannCrossSeverityBandDisagreementCount: houseBrackmannCaseMix.crossSeverityBandDisagreementCount,
      readyPrimaryScaleCount: primaryScaleSummaries.filter((scale) => scale.meetsMinimumStandard).length,
    },
    byScale,
    houseBrackmannCaseMix,
    estimateVersionMismatches,
    estimateEvidenceMismatches,
    excludedReviewerPairs: excludedReviewerPairs.slice(0, 40),
    reviewerSheetIssues: [
      ...reviewerADuplicateAssessmentIds.map((assessmentId) => ({
        reviewer: "reviewerA",
        assessmentId,
        reasons: ["duplicate assessment id in reviewer sheet"],
      })),
      ...reviewerBDuplicateAssessmentIds.map((assessmentId) => ({
        reviewer: "reviewerB",
        assessmentId,
        reasons: ["duplicate assessment id in reviewer sheet"],
      })),
      ...(reviewerAMissingAssessmentIdRowCount > 0 ? [{
        reviewer: "reviewerA",
        assessmentId: "",
        reasons: [`${reviewerAMissingAssessmentIdRowCount} rows are missing assessment ids`],
      }] : []),
      ...(reviewerBMissingAssessmentIdRowCount > 0 ? [{
        reviewer: "reviewerB",
        assessmentId: "",
        reasons: [`${reviewerBMissingAssessmentIdRowCount} rows are missing assessment ids`],
      }] : []),
      ...reviewerAEligibility.issues,
      ...reviewerBEligibility.issues,
    ].slice(0, 40),
    adjudicationRows,
    blockingReasons,
    note: "Reviewer agreement is a reference-standard quality check. Resolve adjudication rows before merging final clinical-scale labels into a reviewed dataset.",
  };
}

function createClinicalScaleAdjudicationCsv(report) {
  const rows = [
    ADJUDICATION_COLUMNS,
    ...(report?.adjudicationRows ?? []).map((row) => ADJUDICATION_COLUMNS.map((column) => row[column] ?? "")),
  ];
  return `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
}

export {
  ADJUDICATION_COLUMNS,
  DEFAULT_REVIEWER_AGREEMENT_STANDARD,
  PRIMARY_REVIEW_SCALE_KEYS,
  REVIEW_SCALE_CONFIG,
  REVIEW_SCALE_KEYS,
  compareClinicalScaleReviewerLabels,
  createClinicalScaleAdjudicationCsv,
};
