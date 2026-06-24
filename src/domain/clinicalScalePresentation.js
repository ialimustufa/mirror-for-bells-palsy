import validationStatus from "../../docs/validation-status.json" with { type: "json" };
import { CLINICAL_SCALE_ESTIMATE_VERSION, MIN_USABLE_ASSESSMENT_COVERAGE_RATIO } from "./clinicalScales.js";

const DEFAULT_VALIDATION_STATUS = Object.freeze(validationStatus);
const CLINICAL_SCALE_PRESENTATION_KEYS = Object.freeze(["houseBrackmann", "sunnybrook", "eface"]);
const REQUIRED_MIN_REVIEWED_ASSESSMENTS = 30;
const REQUIRED_MIN_DISTINCT_CLINICAL_CASES = 10;
const REQUIRED_MIN_AGREEMENT_RATE = 0.8;
const REQUIRED_MIN_AGREEMENT_WILSON_LOWER_BOUND = 0.8;
const REQUIRED_HOUSE_BRACKMANN_SEVERITY_BANDS = 3;
const REQUIRED_MIN_ASSESSMENTS_PER_SEVERITY_BAND = 3;
const REQUIRED_CONFIDENCE_INTERVAL = "wilson-95";
const REQUIRED_REVIEW_PROTOCOL = "docs/clinical-scale-review-protocol.md";
const CLINICAL_SCALE_RELEASE_STATUS = "clinical-scale-agreement-reviewed";
const ESTIMATE_ONLY_PRESENTATION = true;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;

function numberAtLeast(value, minimum) {
  return Number.isFinite(Number(value)) && Number(value) >= minimum;
}

function nonEmptyStringArray(value) {
  return Array.isArray(value) && value.some((item) => typeof item === "string" && item.length > 0);
}

function nonEmptySha256Array(value) {
  return Array.isArray(value) && value.some((item) => SHA256_HEX_RE.test(String(item ?? "")));
}

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function stringArrayIncludes(value, item) {
  return Array.isArray(value) && nonEmptyString(item) && value.includes(item);
}

function sha256ArrayIncludes(value, item) {
  return Array.isArray(value)
    && typeof item === "string"
    && value.some((hash) => String(hash ?? "").toLowerCase() === item.toLowerCase());
}

function clinicalScaleValidationStandardBlockers(status = DEFAULT_VALIDATION_STATUS) {
  const standard = status?.clinicalScaleMinimumStandard;
  const blockers = [];
  if (!standard || typeof standard !== "object") {
    return ["missing clinical-scale minimum standard"];
  }
  if (!numberAtLeast(standard.minReviewedAssessments, REQUIRED_MIN_REVIEWED_ASSESSMENTS)) {
    blockers.push(`minReviewedAssessments must be at least ${REQUIRED_MIN_REVIEWED_ASSESSMENTS}`);
  }
  if (!numberAtLeast(standard.minDistinctClinicalCases, REQUIRED_MIN_DISTINCT_CLINICAL_CASES)) {
    blockers.push(`minDistinctClinicalCases must be at least ${REQUIRED_MIN_DISTINCT_CLINICAL_CASES}`);
  }
  if (!numberAtLeast(standard.minAgreementRate, REQUIRED_MIN_AGREEMENT_RATE)) {
    blockers.push(`minAgreementRate must be at least ${REQUIRED_MIN_AGREEMENT_RATE}`);
  }
  if (!numberAtLeast(standard.minAgreementWilsonLowerBound, REQUIRED_MIN_AGREEMENT_WILSON_LOWER_BOUND)) {
    blockers.push(`minAgreementWilsonLowerBound must be at least ${REQUIRED_MIN_AGREEMENT_WILSON_LOWER_BOUND}`);
  }
  if (!numberAtLeast(standard.minUsableMovementCoverageRatio, MIN_USABLE_ASSESSMENT_COVERAGE_RATIO)) {
    blockers.push(`minUsableMovementCoverageRatio must be at least ${MIN_USABLE_ASSESSMENT_COVERAGE_RATIO}`);
  }
  if (!numberAtLeast(standard.minHouseBrackmannSeverityBands, REQUIRED_HOUSE_BRACKMANN_SEVERITY_BANDS)) {
    blockers.push(`minHouseBrackmannSeverityBands must be at least ${REQUIRED_HOUSE_BRACKMANN_SEVERITY_BANDS}`);
  }
  if (!numberAtLeast(standard.minAssessmentsPerSeverityBand, REQUIRED_MIN_ASSESSMENTS_PER_SEVERITY_BAND)) {
    blockers.push(`minAssessmentsPerSeverityBand must be at least ${REQUIRED_MIN_ASSESSMENTS_PER_SEVERITY_BAND}`);
  }
  if (standard.confidenceInterval !== REQUIRED_CONFIDENCE_INTERVAL) {
    blockers.push(`confidenceInterval must be ${REQUIRED_CONFIDENCE_INTERVAL}`);
  }
  if (standard.clinicalScaleEstimateVersion !== CLINICAL_SCALE_ESTIMATE_VERSION) {
    blockers.push(`clinicalScaleEstimateVersion must be ${CLINICAL_SCALE_ESTIMATE_VERSION}`);
  }
  if (standard.reviewProtocol !== REQUIRED_REVIEW_PROTOCOL) {
    blockers.push(`reviewProtocol must be ${REQUIRED_REVIEW_PROTOCOL}`);
  }
  if (standard.requiresExplicitClinicalConfidence !== true) {
    blockers.push("requiresExplicitClinicalConfidence must be true");
  }
  if (standard.requiresIsoReviewTimestamp !== true) {
    blockers.push("requiresIsoReviewTimestamp must be true");
  }
  if (standard.requiresSourceDatasetSha256 !== true) {
    blockers.push("requiresSourceDatasetSha256 must be true");
  }
  return blockers;
}

function clinicalScaleValidationStandardEligible(status = DEFAULT_VALIDATION_STATUS) {
  return clinicalScaleValidationStandardBlockers(status).length === 0;
}

function clinicalScaleReleaseStatusBlockers(status = DEFAULT_VALIDATION_STATUS) {
  return status?.status === CLINICAL_SCALE_RELEASE_STATUS
    ? []
    : [`status must be ${CLINICAL_SCALE_RELEASE_STATUS}`];
}

function clinicalScaleReleaseStatusEligible(status = DEFAULT_VALIDATION_STATUS) {
  return clinicalScaleReleaseStatusBlockers(status).length === 0;
}

function clinicalScaleReleaseEvidenceBlockers(status = DEFAULT_VALIDATION_STATUS) {
  const standard = status?.clinicalScaleMinimumStandard ?? {};
  const minReviewedAssessments = Number.isInteger(standard.minReviewedAssessments)
    ? standard.minReviewedAssessments
    : REQUIRED_MIN_REVIEWED_ASSESSMENTS;
  const blockers = [];
  if (status?.schemaVersion !== 1) blockers.push("schemaVersion must be 1");
  if (typeof status?.updatedAt !== "string" || !ISO_DATE_RE.test(status.updatedAt)) blockers.push("updatedAt must use YYYY-MM-DD");
  if (status?.clinicalFacingScoresAllowed !== true) blockers.push("clinicalFacingScoresAllowed must be true");
  if (status?.productionThresholdConstantsCalibrated !== true) blockers.push("productionThresholdConstantsCalibrated must be true");
  if (!numberAtLeast(status?.reviewedDatasetCount, 1)) blockers.push("reviewedDatasetCount must be greater than 0");
  if (!numberAtLeast(status?.reviewedFrameCount, 1)) blockers.push("reviewedFrameCount must be greater than 0");
  if (!numberAtLeast(status?.readyExerciseCount, 1)) blockers.push("readyExerciseCount must be greater than 0");
  if (!numberAtLeast(status?.reviewedClinicalScaleAssessmentCount, minReviewedAssessments)) {
    blockers.push(`reviewedClinicalScaleAssessmentCount must be at least ${minReviewedAssessments}`);
  }
  if (!nonEmptyStringArray(status?.clinicalScaleAgreementReports)) blockers.push("clinicalScaleAgreementReports must list at least one report");
  if (!nonEmptyStringArray(status?.clinicalScaleReviewerAgreementReports)) blockers.push("clinicalScaleReviewerAgreementReports must list at least one report");
  if (!nonEmptyStringArray(status?.clinicalScaleReviewPackageVerificationReports)) blockers.push("clinicalScaleReviewPackageVerificationReports must list at least one report");
  if (!nonEmptySha256Array(status?.clinicalScaleAgreementSourceDatasetSha256s)) blockers.push("clinicalScaleAgreementSourceDatasetSha256s must list at least one source dataset hash");
  if (!nonEmptySha256Array(status?.clinicalScaleReviewerAgreementSourceDatasetSha256s)) blockers.push("clinicalScaleReviewerAgreementSourceDatasetSha256s must list at least one source dataset hash");
  if (!nonEmptySha256Array(status?.clinicalScaleReviewPackageVerificationSourceDatasetSha256s)) blockers.push("clinicalScaleReviewPackageVerificationSourceDatasetSha256s must list at least one source dataset hash");
  if (!nonEmptyStringArray(status?.thresholdCalibrationReports)) blockers.push("thresholdCalibrationReports must list at least one report");
  if (!nonEmptySha256Array(status?.thresholdCalibrationSourceDatasetSha256s)) blockers.push("thresholdCalibrationSourceDatasetSha256s must list at least one source dataset hash");
  return blockers;
}

function clinicalScaleReleaseEvidenceEligible(status = DEFAULT_VALIDATION_STATUS) {
  return clinicalScaleReleaseEvidenceBlockers(status).length === 0;
}

function clinicalFacingStatusEligible(status = DEFAULT_VALIDATION_STATUS) {
  if (ESTIMATE_ONLY_PRESENTATION) return false;
  return Boolean(
    clinicalScaleValidationStandardEligible(status)
      && clinicalScaleReleaseStatusEligible(status)
      && clinicalScaleReleaseEvidenceEligible(status)
  );
}

function requestedScaleAvailability(status = DEFAULT_VALIDATION_STATUS, scaleKey) {
  const scaleConfig = status?.clinicalScaleAvailability?.[scaleKey];
  if (scaleConfig && typeof scaleConfig === "object" && "clinicalFacingScoresAllowed" in scaleConfig) {
    return scaleConfig.clinicalFacingScoresAllowed === true;
  }
  return false;
}

function clinicalScaleAvailabilityEvidenceBlockers(status = DEFAULT_VALIDATION_STATUS, scaleKey) {
  const scaleConfig = status?.clinicalScaleAvailability?.[scaleKey];
  if (!scaleConfig?.clinicalFacingScoresAllowed) return [];
  const standard = status?.clinicalScaleMinimumStandard ?? {};
  const minReviewedAssessments = Number.isInteger(standard.minReviewedAssessments)
    ? standard.minReviewedAssessments
    : REQUIRED_MIN_REVIEWED_ASSESSMENTS;
  const minDistinctClinicalCases = Number.isInteger(standard.minDistinctClinicalCases)
    ? standard.minDistinctClinicalCases
    : REQUIRED_MIN_DISTINCT_CLINICAL_CASES;
  const minAgreementRate = Number.isFinite(Number(standard.minAgreementRate))
    ? Number(standard.minAgreementRate)
    : REQUIRED_MIN_AGREEMENT_RATE;
  const minWilsonLowerBound = Number.isFinite(Number(standard.minAgreementWilsonLowerBound))
    ? Number(standard.minAgreementWilsonLowerBound)
    : REQUIRED_MIN_AGREEMENT_WILSON_LOWER_BOUND;
  const blockers = [];
  if (!stringArrayIncludes(status?.clinicalScaleAgreementReports, scaleConfig.clinicalAgreementReport)) {
    blockers.push(`${scaleKey}.clinicalAgreementReport must reference a listed clinical-scale agreement report`);
  }
  if (!stringArrayIncludes(status?.clinicalScaleReviewerAgreementReports, scaleConfig.reviewerAgreementReport)) {
    blockers.push(`${scaleKey}.reviewerAgreementReport must reference a listed reviewer-agreement report`);
  }
  if (!SHA256_HEX_RE.test(String(scaleConfig.sourceDatasetSha256 ?? ""))) {
    blockers.push(`${scaleKey}.sourceDatasetSha256 must be a SHA-256 hex string`);
  }
  if (!sha256ArrayIncludes(status?.clinicalScaleAgreementSourceDatasetSha256s, scaleConfig.sourceDatasetSha256)) {
    blockers.push(`${scaleKey}.sourceDatasetSha256 must be listed in clinicalScaleAgreementSourceDatasetSha256s`);
  }
  if (!sha256ArrayIncludes(status?.clinicalScaleReviewerAgreementSourceDatasetSha256s, scaleConfig.sourceDatasetSha256)) {
    blockers.push(`${scaleKey}.sourceDatasetSha256 must be listed in clinicalScaleReviewerAgreementSourceDatasetSha256s`);
  }
  if (!sha256ArrayIncludes(status?.clinicalScaleReviewPackageVerificationSourceDatasetSha256s, scaleConfig.sourceDatasetSha256)) {
    blockers.push(`${scaleKey}.sourceDatasetSha256 must be listed in clinicalScaleReviewPackageVerificationSourceDatasetSha256s`);
  }
  if (!stringArrayIncludes(status?.clinicalScaleReviewPackageVerificationReports, scaleConfig.clinicalReviewPackageVerificationReport)) {
    blockers.push(`${scaleKey}.clinicalReviewPackageVerificationReport must reference a listed clinical review package verification report`);
  }
  if (scaleConfig.clinicalScaleEstimateVersion !== CLINICAL_SCALE_ESTIMATE_VERSION) {
    blockers.push(`${scaleKey}.clinicalScaleEstimateVersion must be ${CLINICAL_SCALE_ESTIMATE_VERSION}`);
  }
  if (!numberAtLeast(scaleConfig.reviewedLabelCount, minReviewedAssessments)) {
    blockers.push(`${scaleKey}.reviewedLabelCount must be at least ${minReviewedAssessments}`);
  }
  if (!numberAtLeast(scaleConfig.distinctValidationCaseCount, minDistinctClinicalCases)) {
    blockers.push(`${scaleKey}.distinctValidationCaseCount must be at least ${minDistinctClinicalCases}`);
  }
  if (!numberAtLeast(scaleConfig.observedAgreementRate, minAgreementRate)) {
    blockers.push(`${scaleKey}.observedAgreementRate must be at least ${minAgreementRate}`);
  }
  if (!numberAtLeast(scaleConfig.agreementWilsonLowerBound, minWilsonLowerBound)) {
    blockers.push(`${scaleKey}.agreementWilsonLowerBound must be at least ${minWilsonLowerBound}`);
  }
  if (!numberAtLeast(scaleConfig.reviewerPairedLabelCount, minReviewedAssessments)) {
    blockers.push(`${scaleKey}.reviewerPairedLabelCount must be at least ${minReviewedAssessments}`);
  }
  if (!numberAtLeast(scaleConfig.reviewerDistinctValidationCaseCount, minDistinctClinicalCases)) {
    blockers.push(`${scaleKey}.reviewerDistinctValidationCaseCount must be at least ${minDistinctClinicalCases}`);
  }
  if (!numberAtLeast(scaleConfig.reviewerObservedAgreementRate, minAgreementRate)) {
    blockers.push(`${scaleKey}.reviewerObservedAgreementRate must be at least ${minAgreementRate}`);
  }
  if (!numberAtLeast(scaleConfig.reviewerAgreementWilsonLowerBound, minWilsonLowerBound)) {
    blockers.push(`${scaleKey}.reviewerAgreementWilsonLowerBound must be at least ${minWilsonLowerBound}`);
  }
  return blockers;
}

function clinicalScaleAvailabilityEvidenceEligible(status = DEFAULT_VALIDATION_STATUS, scaleKey) {
  return clinicalScaleAvailabilityEvidenceBlockers(status, scaleKey).length === 0;
}

function clinicalFacingScaleStatusEligible(status = DEFAULT_VALIDATION_STATUS, scaleKey) {
  return clinicalFacingStatusEligible(status)
    && requestedScaleAvailability(status, scaleKey)
    && clinicalScaleAvailabilityEvidenceEligible(status, scaleKey);
}

function clinicalScaleAvailabilityPolicy(status = DEFAULT_VALIDATION_STATUS) {
  return Object.fromEntries(
    CLINICAL_SCALE_PRESENTATION_KEYS.map((scaleKey) => [
      scaleKey,
      {
        clinicalFacingScoresAllowed: false,
        requestedClinicalFacingScoresAllowed: requestedScaleAvailability(status, scaleKey),
        availabilityEvidenceEligible: clinicalScaleAvailabilityEvidenceEligible(status, scaleKey),
        availabilityEvidenceBlockers: clinicalScaleAvailabilityEvidenceBlockers(status, scaleKey),
      },
    ]),
  );
}

function scaleNounForClinicalScale() {
  return "self-tracking estimate";
}

function compactNounForClinicalScale() {
  return "estimate";
}

function compactClinicalScaleValueLabel(scales, presentation = clinicalScalePresentationPolicy()) {
  if (!scales) return null;
  return [
    scales.houseBrackmann ? `HB ${scales.houseBrackmann.grade} ${compactNounForClinicalScale(presentation, "houseBrackmann")}` : null,
    scales.sunnybrook ? `SB ${Math.round(scales.sunnybrook.compositeScore)} ${compactNounForClinicalScale(presentation, "sunnybrook")}` : null,
    scales.eface ? `eFACE ${Math.round(scales.eface.totalScore)} ${compactNounForClinicalScale(presentation, "eface")}` : null,
  ].filter(Boolean).join(" · ") || null;
}

function clinicalScalePresentationPolicy(status = DEFAULT_VALIDATION_STATUS) {
  const scaleAvailability = clinicalScaleAvailabilityPolicy(status);
  const futureEligibleScaleCount = Object.values(scaleAvailability).filter((item) => item.availabilityEvidenceEligible).length;
  const primaryClinicalScaleSupportCount = 0;
  const anyClinicalScaleSupportAllowed = false;
  const clinicalFacingScoresAllowed = false;
  const mixedClinicalScaleSupport = false;
  return {
    validationStatus: status?.status ?? null,
    clinicalFacingScoresAllowed,
    anyClinicalScaleSupportAllowed,
    mixedClinicalScaleSupport,
    validationStandardEligible: clinicalScaleValidationStandardEligible(status),
    validationStandardBlockers: clinicalScaleValidationStandardBlockers(status),
    validationReleaseStatusEligible: clinicalScaleReleaseStatusEligible(status),
    validationReleaseStatusBlockers: clinicalScaleReleaseStatusBlockers(status),
    validationReleaseEvidenceEligible: clinicalScaleReleaseEvidenceEligible(status),
    validationReleaseEvidenceBlockers: clinicalScaleReleaseEvidenceBlockers(status),
    primaryClinicalScaleSupportCount,
    primaryClinicalScaleCount: CLINICAL_SCALE_PRESENTATION_KEYS.length,
    futureEligibleScaleCount,
    scaleAvailability,
    requestedClinicalFacingScoresAllowed: status?.clinicalFacingScoresAllowed === true,
    mode: "mirror-estimate",
    panelTitle: "Scale-inspired estimates",
    availableLabel: "Self-tracking estimates available",
    unavailableLabel: "Not enough assessment evidence",
    badgeLabel: "Estimate",
    reportHeading: "Scale-inspired self-tracking estimates",
    scaleNoun: "self-tracking estimate",
    shortNotice: "Mirror estimate for self-tracking only; scale-inspired, not clinician-assigned, diagnostic, prognostic, or treatment guidance.",
    reportNotice: "These are scale-inspired Mirror estimates for self-tracking only. They are not clinician-assigned grades, diagnosis, prognosis, or treatment guidance.",
    comparisonNote: "Comparison uses scale-inspired Mirror estimates for self-tracking only; it is not a clinical grade.",
    footerNotice: "Mirror metrics are self-tracking feedback, not clinician-assigned clinical grades.",
  };
}

export {
  CLINICAL_SCALE_PRESENTATION_KEYS,
  DEFAULT_VALIDATION_STATUS,
  clinicalFacingScaleStatusEligible,
  clinicalFacingStatusEligible,
  clinicalScaleAvailabilityEvidenceBlockers,
  clinicalScaleAvailabilityEvidenceEligible,
  clinicalScaleReleaseEvidenceBlockers,
  clinicalScaleReleaseEvidenceEligible,
  clinicalScaleReleaseStatusBlockers,
  clinicalScaleReleaseStatusEligible,
  clinicalScaleValidationStandardBlockers,
  clinicalScaleValidationStandardEligible,
  compactClinicalScaleValueLabel,
  clinicalScaleAvailabilityPolicy,
  clinicalScalePresentationPolicy,
  scaleNounForClinicalScale,
};
