import { replayFrameSamples } from "./frameSampleReplay.js";
import { CLINICAL_SCALE_ESTIMATE_VERSION, HOUSE_BRACKMANN_REQUIRED_MOVEMENT_IDS, REQUIRED_RESTING_METRIC_KEYS, STANDARD_SCALE_MOVEMENTS } from "../domain/clinicalScales.js";

const POSITIVE_VISIBLE_MOVEMENT_LEVELS = new Set(["trace", "low", "moderate", "strong"]);
const NEGATIVE_VISIBLE_MOVEMENT_LEVELS = new Set(["none"]);
const EXCLUDED_QUALITY_LABELS = new Set(["unusable", "uncertain"]);
const RELIABLE_VISIBLE_MOVEMENT_LEVELS = new Set(["low", "moderate", "strong"]);
const HOUSE_BRACKMANN_GRADE_NUMBERS = Object.freeze({
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
});
const PRIMARY_CLINICAL_SCALE_LABELS = Object.freeze(["houseBrackmann", "sunnybrookComposite", "efaceTotal"]);
const VALID_CLINICAL_SCALE_EVIDENCE_TIERS = new Set(["complete-standard-assessment", "minimum-standard-assessment"]);
const STANDARD_SCALE_MOVEMENT_IDS = Object.freeze(STANDARD_SCALE_MOVEMENTS.map((movement) => movement.exerciseId));
const STANDARD_SCALE_MOVEMENT_ID_SET = new Set(STANDARD_SCALE_MOVEMENT_IDS);
const REQUIRED_RESTING_METRIC_KEY_SET = new Set(REQUIRED_RESTING_METRIC_KEYS);
const HOUSE_BRACKMANN_SEVERITY_BANDS = Object.freeze({
  mild: { label: "HB I-II mild/normal", min: 1, max: 2 },
  moderate: { label: "HB III-IV moderate", min: 3, max: 4 },
  severe: { label: "HB V-VI severe/complete", min: 5, max: 6 },
});
const CLINICAL_REVIEWER_ROLE_PATTERN = /\b(clinician|physician|doctor|otolaryngologist|neurologist|surgeon|therapist|physiotherapist|pathologist|adjudicated|consensus)\b|\bent\b|\bslp\b/i;
const NON_CLINICAL_REVIEWER_ROLE_PATTERN = /\b(non[-\s]?clinician|developer|engineer|user|self|patient|caregiver|demo|test|rehearsal|practice)\b/i;
const UNCERTAIN_CLINICAL_CONFIDENCE_PATTERN = /\b(uncertain|low|unusable|not[-\s]?confident|insufficient)\b/i;
const BLINDED_REVIEW_PATTERN = /^(true|yes|y|1|blinded|mirror[-\s]?hidden|estimate[-\s]?hidden)$/i;
const BLINDED_LABEL_SHEET_PATTERN = /^(blinded|mirror[-\s]?hidden|estimate[-\s]?hidden)$/i;
const INDEPENDENT_CLINICAL_LABEL_SOURCE_PATTERN = /\b(clinician[-\s]?assigned|clinician|independent|adjudicated|consensus|reference[-\s]?standard)\b/i;
const NON_INDEPENDENT_LABEL_SOURCE_PATTERN = /\b(mirror|estimate|algorithm|model|app|copied|auto|automated|self|patient|caregiver|demo|test|rehearsal|practice|unblinded)\b/i;
const CLINICAL_LABEL_SOURCE_FIELDS = Object.freeze([
  "houseBrackmannGrade",
  "sunnybrookComposite",
  "efaceTotal",
  "efaceStatic",
  "efaceDynamic",
  "efaceSynkinesis",
]);
const DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD = Object.freeze({
  minAgreementRate: 0.8,
  minAgreementWilsonLowerBound: 0.8,
  minReviewedAssessments: 30,
  minHouseBrackmannSeverityBands: 3,
  minAssessmentsPerSeverityBand: 3,
  minUsableMovementCoverageRatio: 0.8,
  confidenceLevel: 0.95,
  clinicalScaleEstimateVersion: CLINICAL_SCALE_ESTIMATE_VERSION,
});
const WILSON_Z_BY_CONFIDENCE_LEVEL = Object.freeze({
  0.9: 1.6448536269514722,
  0.95: 1.959963984540054,
  0.99: 2.5758293035489004,
});

function compactRate(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

function compactNumber(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function incrementReasonCount(counts, reason) {
  counts[reason] = (counts[reason] ?? 0) + 1;
}

function incrementReasonCounts(counts, reasons = []) {
  for (const reason of reasons) incrementReasonCount(counts, reason);
}

function zScoreForConfidenceLevel(confidenceLevel) {
  return WILSON_Z_BY_CONFIDENCE_LEVEL[confidenceLevel] ?? WILSON_Z_BY_CONFIDENCE_LEVEL[DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.confidenceLevel];
}

function wilsonScoreInterval(successes, total, confidenceLevel = DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.confidenceLevel) {
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

function createValidationCounts() {
  return {
    labeledFrameCount: 0,
    truePositive: 0,
    trueNegative: 0,
    falsePositive: 0,
    falseNegative: 0,
  };
}

function recordValidationPrediction(counts, expectedPositive, replayScored) {
  counts.labeledFrameCount += 1;
  if (expectedPositive && replayScored) counts.truePositive += 1;
  else if (!expectedPositive && !replayScored) counts.trueNegative += 1;
  else if (!expectedPositive && replayScored) counts.falsePositive += 1;
  else if (expectedPositive && !replayScored) counts.falseNegative += 1;
}

function summarizeValidationCounts(counts) {
  const positiveCount = counts.truePositive + counts.falseNegative;
  const negativeCount = counts.trueNegative + counts.falsePositive;
  return {
    labeledFrameCount: counts.labeledFrameCount,
    positiveCount,
    negativeCount,
    truePositive: counts.truePositive,
    trueNegative: counts.trueNegative,
    falsePositive: counts.falsePositive,
    falseNegative: counts.falseNegative,
    accuracy: compactRate(counts.truePositive + counts.trueNegative, counts.labeledFrameCount),
    falsePositiveRate: compactRate(counts.falsePositive, negativeCount),
    falseNegativeRate: compactRate(counts.falseNegative, positiveCount),
  };
}

function frameKey(frame = {}) {
  return [
    frame.id ?? "",
    frame.sessionId ?? "",
    frame.exerciseId ?? "",
    frame.repIndex ?? "",
    frame.sampleIndex ?? "",
    frame.ts ?? "",
  ].join("|");
}

function movementClassFromLabel(label = {}) {
  if (!label || typeof label !== "object") return null;
  if (EXCLUDED_QUALITY_LABELS.has(label.quality)) return null;
  if (POSITIVE_VISIBLE_MOVEMENT_LEVELS.has(label.visibleMovementLevel)) return true;
  if (NEGATIVE_VISIBLE_MOVEMENT_LEVELS.has(label.visibleMovementLevel)) return false;
  return null;
}

function visibleMovementLevelFromLabel(label = {}) {
  if (!label || typeof label !== "object") return null;
  if (EXCLUDED_QUALITY_LABELS.has(label.quality)) return null;
  const level = label.visibleMovementLevel;
  return POSITIVE_VISIBLE_MOVEMENT_LEVELS.has(level) || NEGATIVE_VISIBLE_MOVEMENT_LEVELS.has(level) ? level : null;
}

function extractValidationFrameRecords(records = []) {
  if (!Array.isArray(records)) return [];
  return records
    .map((item) => {
      if (item?.section === "frameSample" && item.record?.frame) {
        return {
          ...item.record.frame,
          id: item.record.id ?? item.record.frame.id ?? null,
          label: item.record.label ?? null,
        };
      }
      if (item?.frame) return { ...item.frame, id: item.id ?? item.frame.id ?? null, label: item.label ?? null };
      if (item?.landmarks || item?.rawLandmarks) return item;
      return null;
    })
    .filter(Boolean);
}

function extractAssessmentClinicalScaleRecords(records = []) {
  if (!Array.isArray(records)) return [];
  return records
    .map((item) => {
      if (item?.section === "assessmentClinicalScale" && item.record) return item.record;
      if (item?.kind === "assessment-clinical-scale" || item?.estimate?.scales || item?.clinicalScales?.scales) return item;
      return null;
    })
    .filter(Boolean);
}

function numericLabel(value) {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boundedNumericLabel(value, min = 0, max = 100) {
  const number = numericLabel(value);
  return number != null && number >= min && number <= max ? number : null;
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

function createHouseBrackmannCaseMixCounts() {
  return Object.fromEntries(Object.keys(HOUSE_BRACKMANN_SEVERITY_BANDS).map((key) => [key, 0]));
}

function clinicalScaleLabels(record = {}) {
  const label = record.label ?? {};
  return {
    houseBrackmann: parseHouseBrackmannGrade(label.houseBrackmannGrade),
    sunnybrookComposite: boundedNumericLabel(label.sunnybrookComposite),
    efaceTotal: boundedNumericLabel(label.efaceTotal),
    efaceStatic: boundedNumericLabel(label.efaceStatic),
    efaceDynamic: boundedNumericLabel(label.efaceDynamic),
    efaceSynkinesis: boundedNumericLabel(label.efaceSynkinesis),
  };
}

function clinicalScaleEstimateVersion(record = {}) {
  const estimate = record.estimate ?? record.clinicalScales ?? {};
  const version = Number(
    estimate.version
    ?? record.clinicalScaleEstimateVersion
    ?? record.sourceSummary?.clinicalScaleEstimateVersion,
  );
  return Number.isInteger(version) ? version : null;
}

function clinicalScaleEstimateMetadata(record = {}) {
  const estimate = record.estimate ?? record.clinicalScales ?? {};
  const evidence = estimate.evidence ?? {};
  const coverage = estimate.coverage ?? {};
  const sourceSummary = record.sourceSummary ?? {};
  const usedMovementExerciseIds = listValueWithPresence(firstPresent(
    evidence.estimatedMovementExerciseIds,
    evidence.usedMovementExerciseIds,
    sourceSummary.estimateUsedMovementExerciseIds,
    record.estimateUsedMovementExerciseIds,
  ));
  const omittedMovementExerciseIds = listValueWithPresence(firstPresent(
    evidence.omittedMovementExerciseIds,
    sourceSummary.estimateOmittedMovementExerciseIds,
    record.estimateOmittedMovementExerciseIds,
  ));
  const calculationUsesOnlyUsableMovements = booleanValueWithPresence(firstPresent(
    evidence.calculationUsesOnlyUsableMovements,
    sourceSummary.estimateCalculationUsesOnlyUsableMovements,
    record.estimateCalculationUsesOnlyUsableMovements,
  ));
  const requiredRestingMetricKeys = listValueWithPresence(firstPresent(
    evidence.requiredRestingMetricKeys,
    sourceSummary.estimateRequiredRestingMetricKeys,
    record.estimateRequiredRestingMetricKeys,
  ));
  const availableRestingMetricKeys = listValueWithPresence(firstPresent(
    evidence.availableRestingMetricKeys,
    sourceSummary.estimateAvailableRestingMetricKeys,
    record.estimateAvailableRestingMetricKeys,
  ));
  const missingRestingMetricKeys = listValueWithPresence(firstPresent(
    evidence.missingRestingMetricKeys,
    sourceSummary.estimateMissingRestingMetricKeys,
    record.estimateMissingRestingMetricKeys,
  ));
  const calculationUsesCompleteRestingMetrics = booleanValueWithPresence(firstPresent(
    evidence.calculationUsesCompleteRestingMetrics,
    sourceSummary.estimateCalculationUsesCompleteRestingMetrics,
    record.estimateCalculationUsesCompleteRestingMetrics,
  ));
  const houseBrackmannInput = evidence.scaleInputCompleteness?.houseBrackmann ?? {};
  const houseBrackmannInputComplete = booleanValueWithPresence(firstPresent(
    houseBrackmannInput.complete,
    sourceSummary.estimateHouseBrackmannInputComplete,
    record.estimateHouseBrackmannInputComplete,
  ));
  const houseBrackmannRequiredExerciseIds = listValueWithPresence(firstPresent(
    houseBrackmannInput.requiredExerciseIds,
    sourceSummary.estimateHouseBrackmannRequiredExerciseIds,
    record.estimateHouseBrackmannRequiredExerciseIds,
  ));
  const houseBrackmannUsedExerciseIds = listValueWithPresence(firstPresent(
    houseBrackmannInput.usedExerciseIds,
    sourceSummary.estimateHouseBrackmannUsedExerciseIds,
    record.estimateHouseBrackmannUsedExerciseIds,
  ));
  const houseBrackmannMissingRequiredExerciseIds = listValueWithPresence(firstPresent(
    houseBrackmannInput.missingRequiredExerciseIds,
    sourceSummary.estimateHouseBrackmannMissingRequiredExerciseIds,
    record.estimateHouseBrackmannMissingRequiredExerciseIds,
  ));
  return {
    status: estimate.status ?? record.estimateStatus ?? null,
    evidenceTier: evidence.tier ?? sourceSummary.clinicalScaleEvidenceTier ?? record.estimateEvidenceTier ?? null,
    usableMovementCoverageRatio: numberOrNull(firstPresent(coverage.ratio, sourceSummary.usableMovementCoverageRatio, record.estimateUsableMovementCoverageRatio)),
    usableMovementCount: integerOrNull(coverage.usableMovementCount ?? sourceSummary.usableMovementCount ?? record.estimateUsableMovementCount),
    requiredMovementCount: integerOrNull(coverage.requiredMovementCount ?? sourceSummary.requiredMovementCount ?? record.estimateRequiredMovementCount),
    usedMovementExerciseIds,
    omittedMovementExerciseIds,
    calculationUsesOnlyUsableMovements,
    requiredRestingMetricKeys,
    availableRestingMetricKeys,
    missingRestingMetricKeys,
    calculationUsesCompleteRestingMetrics,
    houseBrackmannInputComplete,
    houseBrackmannRequiredExerciseIds,
    houseBrackmannUsedExerciseIds,
    houseBrackmannMissingRequiredExerciseIds,
  };
}

function estimateVersionCountKey(version) {
  return version == null ? "missing" : `v${version}`;
}

function incrementEstimateVersionCount(counts, version) {
  const key = estimateVersionCountKey(version);
  counts[key] = (counts[key] ?? 0) + 1;
}

function firstPresent(...values) {
  return values.find((value) => value != null);
}

function integerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function listValueWithPresence(value) {
  if (Array.isArray(value)) {
    return {
      provided: true,
      values: value.map((item) => String(item ?? "").trim()).filter(Boolean),
    };
  }
  if (typeof value === "string") {
    return {
      provided: true,
      values: value.split("|").map((item) => item.trim()).filter(Boolean),
    };
  }
  return { provided: false, values: [] };
}

function booleanValueWithPresence(value) {
  if (typeof value === "boolean") return { provided: true, value };
  if (typeof value === "string" && value.trim()) {
    if (/^(true|yes|y|1)$/i.test(value.trim())) return { provided: true, value: true };
    if (/^(false|no|n|0)$/i.test(value.trim())) return { provided: true, value: false };
  }
  return { provided: false, value: null };
}

function hasDuplicates(values = []) {
  return new Set(values).size !== values.length;
}

function estimateMovementProvenanceReasons(metadata = {}) {
  const reasons = [];
  const used = metadata.usedMovementExerciseIds?.values ?? [];
  const omitted = metadata.omittedMovementExerciseIds?.values ?? [];
  const usedSet = new Set(used);
  const omittedSet = new Set(omitted);
  const usableCount = metadata.usableMovementCount;
  const requiredCount = metadata.requiredMovementCount ?? STANDARD_SCALE_MOVEMENT_IDS.length;
  if (!metadata.usedMovementExerciseIds?.provided || !metadata.omittedMovementExerciseIds?.provided) {
    reasons.push("clinical scale estimate movement provenance is missing");
  }
  if (!metadata.calculationUsesOnlyUsableMovements?.provided || metadata.calculationUsesOnlyUsableMovements.value !== true) {
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

function estimateRestingMetricProvenanceReasons(metadata = {}) {
  const reasons = [];
  const required = metadata.requiredRestingMetricKeys?.values ?? [];
  const available = metadata.availableRestingMetricKeys?.values ?? [];
  const missing = metadata.missingRestingMetricKeys?.values ?? [];
  if (
    !metadata.requiredRestingMetricKeys?.provided
    || !metadata.availableRestingMetricKeys?.provided
    || !metadata.missingRestingMetricKeys?.provided
  ) {
    reasons.push("clinical scale estimate resting-metric provenance is missing");
  }
  if (!metadata.calculationUsesCompleteRestingMetrics?.provided || metadata.calculationUsesCompleteRestingMetrics.value !== true) {
    reasons.push("clinical scale estimate complete-resting-metrics flag is missing or false");
  }
  const requiredSet = new Set(required);
  const availableSet = new Set(available);
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

function clinicalLabelEligibility(record = {}, labels = clinicalScaleLabels(record), estimate = clinicalScaleEstimate(record), options = {}) {
  const label = record.label ?? {};
  const reviewerRole = String(label.reviewerRole ?? "").trim();
  const confidence = String(label.clinicianConfidence ?? "").trim();
  const sourceLabelSheetMode = String(label.sourceLabelSheetMode ?? "").trim();
  const reviewBlinded = String(label.reviewBlinded ?? "").trim();
  const labelSource = String(label.labelSource ?? "").trim();
  const requiredClinicalScaleEstimateVersion = options.clinicalScaleEstimateVersion
    ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.clinicalScaleEstimateVersion;
  const requiredPrimaryScales = options.requiredPrimaryScales ?? PRIMARY_CLINICAL_SCALE_LABELS;
  const estimateVersion = clinicalScaleEstimateVersion(record);
  const estimateMetadata = clinicalScaleEstimateMetadata(record);
  const minUsableMovementCoverageRatio = options.minUsableMovementCoverageRatio
    ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minUsableMovementCoverageRatio;
  const reasons = [];
  if (estimateVersion !== requiredClinicalScaleEstimateVersion) {
    reasons.push("clinical scale estimate version is missing or stale");
  }
  if (estimateMetadata.status !== "estimated") {
    reasons.push("clinical scale estimate status is not estimated");
  }
  if (!VALID_CLINICAL_SCALE_EVIDENCE_TIERS.has(estimateMetadata.evidenceTier)) {
    reasons.push("clinical scale estimate evidence tier is missing or insufficient");
  }
  if (!Number.isFinite(estimateMetadata.usableMovementCoverageRatio) || estimateMetadata.usableMovementCoverageRatio < minUsableMovementCoverageRatio) {
    reasons.push("clinical scale estimate movement coverage is below the minimum standard");
  }
  reasons.push(...estimateMovementProvenanceReasons(estimateMetadata));
  reasons.push(...estimateRestingMetricProvenanceReasons(estimateMetadata));
  if (!reviewerRole) {
    reasons.push("missing clinician reviewer role");
  } else if (NON_CLINICAL_REVIEWER_ROLE_PATTERN.test(reviewerRole)) {
    reasons.push("reviewer role is marked non-clinical or rehearsal");
  } else if (!CLINICAL_REVIEWER_ROLE_PATTERN.test(reviewerRole)) {
    reasons.push("reviewer role is not recognized as clinical/adjudicated");
  }
  if (confidence && UNCERTAIN_CLINICAL_CONFIDENCE_PATTERN.test(confidence)) {
    reasons.push("clinician confidence is uncertain");
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
    reasons.push("label source is not recognized as independent clinical/adjudicated");
  }
  for (const scale of requiredPrimaryScales) {
    if (estimate[scale] == null) reasons.push(`missing valid ${scale} estimate`);
    if (labels[scale] == null) reasons.push(`missing valid ${scale} label`);
  }
  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

function clinicalScaleEstimate(record = {}) {
  const estimate = record.estimate ?? record.clinicalScales ?? {};
  const scales = estimate.status === "estimated" ? estimate.scales ?? {} : estimate.scales ?? estimate;
  const houseBrackmann = scales.houseBrackmann ?? {};
  const sunnybrook = scales.sunnybrook ?? {};
  const eface = scales.eface ?? {};
  const metadata = clinicalScaleEstimateMetadata(record);
  const houseBrackmannValue = parseHouseBrackmannGrade(houseBrackmann.numericGrade ?? houseBrackmann.grade);
  return {
    houseBrackmann: houseBrackmannValue != null && houseBrackmannEstimateHasRequiredInput(metadata) ? houseBrackmannValue : null,
    sunnybrookComposite: boundedNumericLabel(sunnybrook.compositeScore),
    efaceTotal: boundedNumericLabel(eface.totalScore),
    efaceStatic: boundedNumericLabel(eface.staticScore),
    efaceDynamic: boundedNumericLabel(eface.dynamicScore),
    efaceSynkinesis: boundedNumericLabel(eface.synkinesisScore),
  };
}

function houseBrackmannEstimateHasRequiredInput(metadata = {}) {
  const requiredIds = metadata.houseBrackmannRequiredExerciseIds?.provided
    ? metadata.houseBrackmannRequiredExerciseIds.values
    : HOUSE_BRACKMANN_REQUIRED_MOVEMENT_IDS;
  const missingIds = metadata.houseBrackmannMissingRequiredExerciseIds?.provided
    ? metadata.houseBrackmannMissingRequiredExerciseIds.values
    : [];
  const usedIds = metadata.houseBrackmannUsedExerciseIds?.provided
    ? metadata.houseBrackmannUsedExerciseIds.values
    : metadata.usedMovementExerciseIds?.values ?? [];
  const inputComplete = metadata.houseBrackmannInputComplete?.provided
    ? metadata.houseBrackmannInputComplete.value
    : null;
  const requiredSet = new Set(requiredIds.length ? requiredIds : HOUSE_BRACKMANN_REQUIRED_MOVEMENT_IDS);
  const usedSet = new Set(usedIds);
  const allRequiredUsed = [...requiredSet].every((exerciseId) => usedSet.has(exerciseId));
  const noneRequiredMissing = missingIds.every((exerciseId) => !requiredSet.has(exerciseId));
  if (inputComplete != null) return inputComplete === true && allRequiredUsed && noneRequiredMissing;
  return allRequiredUsed && noneRequiredMissing;
}

function hasAnyClinicalLabel(labels = {}) {
  return Object.values(labels).some((value) => value != null);
}

function hasAnyRawClinicalLabel(record = {}) {
  const label = record.label ?? {};
  return CLINICAL_LABEL_SOURCE_FIELDS.some((field) => String(label[field] ?? "").trim());
}

function validPrimaryClinicalScaleLabels(labels = {}) {
  return PRIMARY_CLINICAL_SCALE_LABELS.filter((scale) => labels[scale] != null);
}

function primaryScaleLabelIssueReasons(labels = {}, scales = PRIMARY_CLINICAL_SCALE_LABELS) {
  return scales
    .filter((scale) => labels[scale] == null)
    .map((scale) => `missing valid ${scale} label`);
}

function primaryScaleEstimateIssueReasons(estimate = {}, scales = PRIMARY_CLINICAL_SCALE_LABELS) {
  return scales
    .filter((scale) => estimate[scale] == null)
    .map((scale) => `missing valid ${scale} estimate`);
}

function createAgreementAccumulator(scale, agreementLabel, tolerance) {
  return {
    scale,
    agreementLabel,
    tolerance,
    labeledCount: 0,
    missingEstimateCount: 0,
    exactMatchCount: 0,
    withinToleranceCount: 0,
    absoluteDeltas: [],
    mismatches: [],
  };
}

function recordAgreementCase(accumulator, record, estimateValue, labelValue) {
  if (labelValue == null) return;
  if (estimateValue == null) {
    accumulator.missingEstimateCount += 1;
    return;
  }
  const delta = estimateValue - labelValue;
  const absDelta = Math.abs(delta);
  accumulator.labeledCount += 1;
  accumulator.absoluteDeltas.push(absDelta);
  if (absDelta === 0) accumulator.exactMatchCount += 1;
  if (absDelta <= accumulator.tolerance) accumulator.withinToleranceCount += 1;
  if (absDelta > accumulator.tolerance) {
    accumulator.mismatches.push({
      assessmentId: record.id ?? null,
      sessionId: record.sessionId ?? null,
      estimate: compactNumber(estimateValue, 2),
      label: compactNumber(labelValue, 2),
      delta: compactNumber(delta, 2),
    });
  }
}

function summarizeAgreement(accumulator, options = {}) {
  const minAgreementRate = options.minAgreementRate ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minAgreementRate;
  const minAgreementWilsonLowerBound = options.minAgreementWilsonLowerBound ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minAgreementWilsonLowerBound;
  const minReviewedAssessments = Math.max(1, Math.round(options.minReviewedAssessments ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minReviewedAssessments));
  const confidenceLevel = options.confidenceLevel ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.confidenceLevel;
  const comparableCount = accumulator.labeledCount;
  const denominator = comparableCount + accumulator.missingEstimateCount;
  const agreementRate = compactRate(accumulator.withinToleranceCount, denominator);
  const exactAgreementRate = compactRate(accumulator.exactMatchCount, denominator);
  const confidenceInterval = wilsonScoreInterval(accumulator.withinToleranceCount, denominator, confidenceLevel);
  const meanAbsDelta = accumulator.absoluteDeltas.length
    ? accumulator.absoluteDeltas.reduce((sum, value) => sum + value, 0) / accumulator.absoluteDeltas.length
    : null;
  const blockingReasons = [];
  if (denominator < minReviewedAssessments) blockingReasons.push(`needs at least ${minReviewedAssessments} reviewed assessment labels`);
  if (agreementRate == null || agreementRate < minAgreementRate) blockingReasons.push(`needs at least ${Math.round(minAgreementRate * 100)}% ${accumulator.agreementLabel}`);
  if (confidenceInterval?.lower == null || confidenceInterval.lower < minAgreementWilsonLowerBound) {
    blockingReasons.push(`needs ${Math.round(confidenceLevel * 100)}% Wilson lower bound at least ${Math.round(minAgreementWilsonLowerBound * 100)}% for ${accumulator.agreementLabel}`);
  }
  return {
    scale: accumulator.scale,
    agreementLabel: accumulator.agreementLabel,
    tolerance: accumulator.tolerance,
    labeledCount: denominator,
    comparableCount,
    missingEstimateCount: accumulator.missingEstimateCount,
    exactMatchCount: accumulator.exactMatchCount,
    withinToleranceCount: accumulator.withinToleranceCount,
    exactAgreementRate,
    agreementRate,
    agreementConfidenceInterval: confidenceInterval,
    meanAbsDelta: compactNumber(meanAbsDelta, 2),
    meetsMinimumStandard: blockingReasons.length === 0,
    blockingReasons,
    mismatches: accumulator.mismatches.slice(0, 20),
  };
}

function summarizeHouseBrackmannCaseMix(counts = {}, options = {}) {
  const minHouseBrackmannSeverityBands = Math.min(
    Object.keys(HOUSE_BRACKMANN_SEVERITY_BANDS).length,
    Math.max(1, Math.round(options.minHouseBrackmannSeverityBands ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minHouseBrackmannSeverityBands)),
  );
  const minAssessmentsPerSeverityBand = Math.max(1, Math.round(options.minAssessmentsPerSeverityBand ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minAssessmentsPerSeverityBand));
  const severityBands = Object.fromEntries(
    Object.entries(HOUSE_BRACKMANN_SEVERITY_BANDS).map(([key, band]) => [
      key,
      {
        ...band,
        count: counts[key] ?? 0,
        meetsMinimum: (counts[key] ?? 0) >= minAssessmentsPerSeverityBand,
      },
    ]),
  );
  const representedSeverityBands = Object.entries(severityBands)
    .filter(([, band]) => band.meetsMinimum)
    .map(([key]) => key);
  const blockingReasons = [];
  if (representedSeverityBands.length < minHouseBrackmannSeverityBands) {
    blockingReasons.push(`needs at least ${minHouseBrackmannSeverityBands} House-Brackmann severity bands with at least ${minAssessmentsPerSeverityBand} reviewed labels each`);
  }
  return {
    scale: "houseBrackmann",
    minHouseBrackmannSeverityBands,
    minAssessmentsPerSeverityBand,
    severityBands,
    representedSeverityBands,
    representedSeverityBandCount: representedSeverityBands.length,
    meetsMinimumStandard: blockingReasons.length === 0,
    blockingReasons,
  };
}

function evaluateClinicalScaleEstimates(records = [], options = {}) {
  const assessmentRecords = extractAssessmentClinicalScaleRecords(records);
  const minAgreementRate = options.minAgreementRate ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minAgreementRate;
  const minAgreementWilsonLowerBound = options.minAgreementWilsonLowerBound ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minAgreementWilsonLowerBound;
  const minReviewedAssessments = Math.max(1, Math.round(options.minReviewedAssessments ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minReviewedAssessments));
  const confidenceLevel = options.confidenceLevel ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.confidenceLevel;
  const sunnybrookTolerance = Number.isFinite(options.sunnybrookTolerance) ? options.sunnybrookTolerance : 10;
  const efaceTolerance = Number.isFinite(options.efaceTolerance) ? options.efaceTolerance : 10;
  const minUsableMovementCoverageRatio = Number.isFinite(options.minUsableMovementCoverageRatio)
    ? options.minUsableMovementCoverageRatio
    : DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minUsableMovementCoverageRatio;
  const minHouseBrackmannSeverityBands = Math.min(
    Object.keys(HOUSE_BRACKMANN_SEVERITY_BANDS).length,
    Math.max(1, Math.round(options.minHouseBrackmannSeverityBands ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minHouseBrackmannSeverityBands)),
  );
  const minAssessmentsPerSeverityBand = Math.max(1, Math.round(options.minAssessmentsPerSeverityBand ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minAssessmentsPerSeverityBand));
  const agreementOptions = { minAgreementRate, minAgreementWilsonLowerBound, minReviewedAssessments, confidenceLevel };
  const caseMixOptions = { minHouseBrackmannSeverityBands, minAssessmentsPerSeverityBand };
  const accumulators = {
    houseBrackmann: createAgreementAccumulator("houseBrackmann", "within-one-grade agreement", 1),
    sunnybrookComposite: createAgreementAccumulator("sunnybrookComposite", `within-${sunnybrookTolerance}-point agreement`, sunnybrookTolerance),
    efaceTotal: createAgreementAccumulator("efaceTotal", `within-${efaceTolerance}-point agreement`, efaceTolerance),
    efaceStatic: createAgreementAccumulator("efaceStatic", `within-${efaceTolerance}-point agreement`, efaceTolerance),
    efaceDynamic: createAgreementAccumulator("efaceDynamic", `within-${efaceTolerance}-point agreement`, efaceTolerance),
    efaceSynkinesis: createAgreementAccumulator("efaceSynkinesis", `within-${efaceTolerance}-point agreement`, efaceTolerance),
  };
  let reviewedAssessmentCount = 0;
  let estimatedAssessmentCount = 0;
  let excludedClinicalLabelCount = 0;
  const excludedClinicalLabelReasons = {};
  const primaryScaleLabelIssueReasonCounts = {};
  const primaryScaleEstimateIssueReasonCounts = {};
  const estimateVersionCounts = {};
  const requiredClinicalScaleEstimateVersion = options.clinicalScaleEstimateVersion
    ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.clinicalScaleEstimateVersion;
  const houseBrackmannCaseMixCounts = createHouseBrackmannCaseMixCounts();
  for (const record of assessmentRecords) {
    const labels = clinicalScaleLabels(record);
    const estimate = clinicalScaleEstimate(record);
    const estimateVersion = clinicalScaleEstimateVersion(record);
    if (Object.values(estimate).some((value) => value != null)) {
      estimatedAssessmentCount += 1;
      incrementEstimateVersionCount(estimateVersionCounts, estimateVersion);
    }
    if (!hasAnyClinicalLabel(labels) && !hasAnyRawClinicalLabel(record)) continue;
    const eligibility = clinicalLabelEligibility(record, labels, estimate, {
      clinicalScaleEstimateVersion: requiredClinicalScaleEstimateVersion,
      minUsableMovementCoverageRatio,
      requiredPrimaryScales: [],
    });
    if (!eligibility.eligible) {
      excludedClinicalLabelCount += 1;
      incrementReasonCounts(excludedClinicalLabelReasons, eligibility.reasons);
      continue;
    }
    const validPrimaryScales = validPrimaryClinicalScaleLabels(labels);
    if (!validPrimaryScales.length) {
      excludedClinicalLabelCount += 1;
      incrementReasonCounts(excludedClinicalLabelReasons, primaryScaleLabelIssueReasons(labels));
      continue;
    }
    incrementReasonCounts(primaryScaleLabelIssueReasonCounts, primaryScaleLabelIssueReasons(labels));
    incrementReasonCounts(primaryScaleEstimateIssueReasonCounts, primaryScaleEstimateIssueReasons(estimate, validPrimaryScales));
    reviewedAssessmentCount += 1;
    const severityBand = houseBrackmannSeverityBand(labels.houseBrackmann);
    if (severityBand) houseBrackmannCaseMixCounts[severityBand] += 1;
    for (const [scale, accumulator] of Object.entries(accumulators)) {
      recordAgreementCase(accumulator, record, estimate[scale], labels[scale]);
    }
  }

  const byScale = Object.fromEntries(
    Object.entries(accumulators).map(([scale, accumulator]) => [scale, summarizeAgreement(accumulator, agreementOptions)]),
  );
  const primaryScales = PRIMARY_CLINICAL_SCALE_LABELS;
  const evaluatedPrimaryScales = primaryScales.filter((scale) => byScale[scale].labeledCount > 0);
  const readyPrimaryScales = primaryScales.filter((scale) => byScale[scale].meetsMinimumStandard);
  const caseMix = summarizeHouseBrackmannCaseMix(houseBrackmannCaseMixCounts, caseMixOptions);
  const blockingReasons = [];
  if (reviewedAssessmentCount < minReviewedAssessments) {
    blockingReasons.push(`needs at least ${minReviewedAssessments} reviewed clinical-scale assessments`);
  }
  if (!caseMix.meetsMinimumStandard) {
    blockingReasons.push(`caseMix: ${caseMix.blockingReasons.join("; ")}`);
  }
  for (const scale of primaryScales) {
    if (!byScale[scale].meetsMinimumStandard) blockingReasons.push(`${scale}: ${byScale[scale].blockingReasons.join("; ")}`);
  }

  return {
    kind: "mirror-clinical-scale-validation-report",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    standard: {
      minAgreementRate,
      minAgreementWilsonLowerBound,
      minReviewedAssessments,
      confidenceInterval: {
        method: "wilson-score",
        confidenceLevel,
      },
      houseBrackmannAgreement: "estimate must be within one House-Brackmann grade of the reviewed label",
      sunnybrookTolerance,
      efaceTolerance,
      minUsableMovementCoverageRatio,
      requiresV3MovementProvenance: true,
      requiresV4RestingMetricProvenance: true,
      caseMix: {
        houseBrackmannSeverityBands: Object.fromEntries(Object.entries(HOUSE_BRACKMANN_SEVERITY_BANDS).map(([key, band]) => [key, band.label])),
        minHouseBrackmannSeverityBands,
        minAssessmentsPerSeverityBand,
      },
      clinicalScaleEstimateVersion: requiredClinicalScaleEstimateVersion,
      requiresHouseBrackmannRequiredInput: true,
    },
    summary: {
      assessmentClinicalScaleRecords: assessmentRecords.length,
      reviewedAssessmentCount,
      excludedClinicalLabelCount,
      excludedClinicalLabelReasons,
      primaryScaleLabelIssueReasons: primaryScaleLabelIssueReasonCounts,
      primaryScaleEstimateIssueReasons: primaryScaleEstimateIssueReasonCounts,
      estimatedAssessmentCount,
      estimateVersionCounts,
      currentClinicalScaleEstimateVersionAssessmentCount: estimateVersionCounts[estimateVersionCountKey(requiredClinicalScaleEstimateVersion)] ?? 0,
      primaryScaleCount: primaryScales.length,
      evaluatedPrimaryScaleCount: evaluatedPrimaryScales.length,
      readyPrimaryScaleCount: readyPrimaryScales.length,
      meetsMinimumStandard: blockingReasons.length === 0,
      readyForClinicalFacingScoring: blockingReasons.length === 0 && readyPrimaryScales.length === primaryScales.length,
    },
    blockingReasons,
    byScale,
    caseMix,
    note: "This report evaluates Mirror estimates against reviewed clinical labels. It does not make the estimates clinician-assigned grades.",
  };
}

function evaluateValidationFrameSamples(samples = [], options = {}) {
  const replay = replayFrameSamples(samples, options);
  const labels = new Map();
  for (const sample of samples) {
    const label = sample?.label ?? null;
    if (!label) continue;
    labels.set(frameKey(sample), movementClassFromLabel(label));
  }

  const aggregateCounts = createValidationCounts();
  const byExerciseCounts = new Map();
  const thresholdBandCounts = {
    withBands: 0,
    aboveMinimumVisible: 0,
    aboveReliableMovement: 0,
    aboveBaselineTarget: 0,
    belowMinimumVisible: 0,
  };
  for (const frame of replay.frames) {
    const expectedPositive = labels.get(frameKey(frame));
    if (expectedPositive == null) continue;
    recordValidationPrediction(aggregateCounts, expectedPositive, frame.replayScored);
    const exerciseId = frame.exerciseId ?? "unknown";
    const exerciseCounts = byExerciseCounts.get(exerciseId) ?? createValidationCounts();
    recordValidationPrediction(exerciseCounts, expectedPositive, frame.replayScored);
    byExerciseCounts.set(exerciseId, exerciseCounts);
    if (frame.thresholdBands && Number.isFinite(frame.bandPeak)) {
      thresholdBandCounts.withBands += 1;
      const minimumVisible = frame.thresholdBands.minimumVisible;
      const reliableMovement = frame.thresholdBands.reliableMovement;
      const baselineTarget = frame.thresholdBands.baselineTarget;
      if (Number.isFinite(minimumVisible) && frame.bandPeak >= minimumVisible) thresholdBandCounts.aboveMinimumVisible += 1;
      if (Number.isFinite(reliableMovement) && frame.bandPeak >= reliableMovement) thresholdBandCounts.aboveReliableMovement += 1;
      if (Number.isFinite(baselineTarget) && frame.bandPeak >= baselineTarget) thresholdBandCounts.aboveBaselineTarget += 1;
      if (Number.isFinite(minimumVisible) && frame.bandPeak < minimumVisible) thresholdBandCounts.belowMinimumVisible += 1;
    }
  }

  return {
    ...replay,
    validation: {
      ...summarizeValidationCounts(aggregateCounts),
      meanAbsScoreDelta: replay.meanAbsScoreDelta,
      thresholdBandCounts,
      byExercise: [...byExerciseCounts.entries()]
        .map(([exerciseId, counts]) => ({ exerciseId, ...summarizeValidationCounts(counts) }))
        .sort((a, b) => a.exerciseId.localeCompare(b.exerciseId)),
    },
  };
}

function percentile(values, pct) {
  const valid = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const idx = Math.min(valid.length - 1, Math.max(0, Math.ceil(valid.length * pct) - 1));
  return Number(valid[idx].toFixed(5));
}

function midpoint(low, high) {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  return Number(((low + high) / 2).toFixed(5));
}

function bandRecommendationFromPeaks({ negativePeaks, positivePeaks, reliablePositivePeaks }) {
  const negativeMax = percentile(negativePeaks, 1);
  const negativeP95 = percentile(negativePeaks, 0.95);
  const positiveP10 = percentile(positivePeaks, 0.1);
  const reliableP10 = percentile(reliablePositivePeaks.length ? reliablePositivePeaks : positivePeaks, 0.1);
  const reliableP75 = percentile(reliablePositivePeaks.length ? reliablePositivePeaks : positivePeaks, 0.75);
  const minimumVisible = negativeMax != null && positiveP10 != null && negativeMax < positiveP10
    ? midpoint(negativeMax, positiveP10)
    : positiveP10;
  const reliableMovement = negativeP95 != null && reliableP10 != null && negativeP95 < reliableP10
    ? midpoint(negativeP95, reliableP10)
    : reliableP10;
  return {
    minimumVisible,
    reliableMovement,
    baselineTarget: reliableP75,
  };
}

function countAtThreshold(peaks, threshold) {
  if (!Number.isFinite(threshold)) return null;
  return peaks.filter((peak) => peak >= threshold).length;
}

function calibrateThresholdsFromValidationSamples(samples = [], options = {}) {
  const minPositive = Math.max(1, Math.round(options.minPositive ?? 3));
  const minNegative = Math.max(1, Math.round(options.minNegative ?? 3));
  const replay = replayFrameSamples(samples, options);
  const labels = new Map();
  for (const sample of samples) {
    const label = sample?.label ?? null;
    if (!label) continue;
    labels.set(frameKey(sample), label);
  }
  const byExercise = new Map();
  for (const frame of replay.frames) {
    const label = labels.get(frameKey(frame));
    const level = visibleMovementLevelFromLabel(label);
    if (!level || !Number.isFinite(frame.bandPeak)) continue;
    const exerciseId = frame.exerciseId ?? "unknown";
    const entry = byExercise.get(exerciseId) ?? {
      exerciseId,
      labeledFrameCount: 0,
      positivePeaks: [],
      negativePeaks: [],
      reliablePositivePeaks: [],
      currentReliableThresholds: [],
    };
    entry.labeledFrameCount += 1;
    if (frame.thresholdBands?.reliableMovement != null) entry.currentReliableThresholds.push(frame.thresholdBands.reliableMovement);
    if (NEGATIVE_VISIBLE_MOVEMENT_LEVELS.has(level)) entry.negativePeaks.push(frame.bandPeak);
    else {
      entry.positivePeaks.push(frame.bandPeak);
      if (RELIABLE_VISIBLE_MOVEMENT_LEVELS.has(level)) entry.reliablePositivePeaks.push(frame.bandPeak);
    }
    byExercise.set(exerciseId, entry);
  }

  const exercises = [...byExercise.values()].map((entry) => {
    const recommendation = bandRecommendationFromPeaks(entry);
    const currentReliable = percentile(entry.currentReliableThresholds, 0.5);
    const hasEnoughData = entry.positivePeaks.length >= minPositive && entry.negativePeaks.length >= minNegative;
    const falsePositiveAtRecommended = countAtThreshold(entry.negativePeaks, recommendation.reliableMovement);
    const falseNegativeAtRecommended = Number.isFinite(recommendation.reliableMovement)
      ? entry.positivePeaks.filter((peak) => peak < recommendation.reliableMovement).length
      : null;
    return {
      exerciseId: entry.exerciseId,
      status: hasEnoughData ? "ready" : "needs-more-labels",
      labeledFrameCount: entry.labeledFrameCount,
      positiveCount: entry.positivePeaks.length,
      negativeCount: entry.negativePeaks.length,
      currentReliableThreshold: currentReliable,
      peakStats: {
        negativeMax: percentile(entry.negativePeaks, 1),
        negativeP95: percentile(entry.negativePeaks, 0.95),
        positiveP10: percentile(entry.positivePeaks, 0.1),
        positiveMedian: percentile(entry.positivePeaks, 0.5),
        reliablePositiveP10: percentile(entry.reliablePositivePeaks.length ? entry.reliablePositivePeaks : entry.positivePeaks, 0.1),
      },
      recommendedThresholdBands: hasEnoughData ? recommendation : null,
      projectedAtRecommended: hasEnoughData ? {
        falsePositiveCount: falsePositiveAtRecommended,
        falseNegativeCount: falseNegativeAtRecommended,
        falsePositiveRate: compactRate(falsePositiveAtRecommended, entry.negativePeaks.length),
        falseNegativeRate: compactRate(falseNegativeAtRecommended, entry.positivePeaks.length),
      } : null,
    };
  }).sort((a, b) => a.exerciseId.localeCompare(b.exerciseId));

  return {
    kind: "mirror-threshold-calibration-report",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    minPositive,
    minNegative,
    summary: {
      exercises: exercises.length,
      readyExercises: exercises.filter((exercise) => exercise.status === "ready").length,
      needsMoreLabels: exercises.filter((exercise) => exercise.status !== "ready").length,
    },
    exercises,
    note: "Recommendations require clinician/user/developer-reviewed labels and should be reviewed before changing production constants.",
  };
}

export {
  DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD,
  HOUSE_BRACKMANN_SEVERITY_BANDS,
  calibrateThresholdsFromValidationSamples,
  evaluateClinicalScaleEstimates,
  evaluateValidationFrameSamples,
  extractAssessmentClinicalScaleRecords,
  extractValidationFrameRecords,
  movementClassFromLabel,
  visibleMovementLevelFromLabel,
};
