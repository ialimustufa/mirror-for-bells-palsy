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

function numberAtLeast(value, minimum) {
  return Number.isFinite(Number(value)) && Number(value) >= minimum;
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

function clinicalFacingStatusEligible(status = DEFAULT_VALIDATION_STATUS) {
  const standard = status?.clinicalScaleMinimumStandard ?? {};
  const minReviewedAssessments = Number.isInteger(standard.minReviewedAssessments)
    ? standard.minReviewedAssessments
    : REQUIRED_MIN_REVIEWED_ASSESSMENTS;
  return Boolean(
    clinicalScaleValidationStandardEligible(status)
      && clinicalScaleReleaseStatusEligible(status)
      && status?.clinicalFacingScoresAllowed === true
      && status?.productionThresholdConstantsCalibrated === true
      && Number(status?.reviewedDatasetCount) > 0
      && Number(status?.reviewedFrameCount) > 0
      && Number(status?.reviewedClinicalScaleAssessmentCount) >= minReviewedAssessments
      && Array.isArray(status?.clinicalScaleAgreementReports)
      && status.clinicalScaleAgreementReports.length > 0
      && Array.isArray(status?.clinicalScaleReviewerAgreementReports)
      && status.clinicalScaleReviewerAgreementReports.length > 0
      && Array.isArray(status?.thresholdCalibrationReports)
      && status.thresholdCalibrationReports.length > 0
  );
}

function requestedScaleAvailability(status = DEFAULT_VALIDATION_STATUS, scaleKey) {
  const scaleConfig = status?.clinicalScaleAvailability?.[scaleKey];
  if (scaleConfig && typeof scaleConfig === "object" && "clinicalFacingScoresAllowed" in scaleConfig) {
    return scaleConfig.clinicalFacingScoresAllowed === true;
  }
  return false;
}

function clinicalFacingScaleStatusEligible(status = DEFAULT_VALIDATION_STATUS, scaleKey) {
  return clinicalFacingStatusEligible(status) && requestedScaleAvailability(status, scaleKey);
}

function clinicalScaleAvailabilityPolicy(status = DEFAULT_VALIDATION_STATUS) {
  return Object.fromEntries(
    CLINICAL_SCALE_PRESENTATION_KEYS.map((scaleKey) => [
      scaleKey,
      {
        clinicalFacingScoresAllowed: clinicalFacingScaleStatusEligible(status, scaleKey),
        requestedClinicalFacingScoresAllowed: requestedScaleAvailability(status, scaleKey),
      },
    ]),
  );
}

function scaleNounForClinicalScale(presentation, scaleKey) {
  return presentation?.scaleAvailability?.[scaleKey]?.clinicalFacingScoresAllowed ? "support value" : "estimate";
}

function compactNounForClinicalScale(presentation, scaleKey) {
  return scaleNounForClinicalScale(presentation, scaleKey) === "support value" ? "support" : "estimate";
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
  const primaryClinicalScaleSupportCount = Object.values(scaleAvailability).filter((item) => item.clinicalFacingScoresAllowed).length;
  const anyClinicalScaleSupportAllowed = primaryClinicalScaleSupportCount > 0;
  const clinicalFacingScoresAllowed = primaryClinicalScaleSupportCount === CLINICAL_SCALE_PRESENTATION_KEYS.length;
  const mixedClinicalScaleSupport = anyClinicalScaleSupportAllowed && !clinicalFacingScoresAllowed;
  return {
    validationStatus: status?.status ?? null,
    clinicalFacingScoresAllowed,
    anyClinicalScaleSupportAllowed,
    mixedClinicalScaleSupport,
    validationStandardEligible: clinicalScaleValidationStandardEligible(status),
    validationStandardBlockers: clinicalScaleValidationStandardBlockers(status),
    validationReleaseStatusEligible: clinicalScaleReleaseStatusEligible(status),
    validationReleaseStatusBlockers: clinicalScaleReleaseStatusBlockers(status),
    primaryClinicalScaleSupportCount,
    primaryClinicalScaleCount: CLINICAL_SCALE_PRESENTATION_KEYS.length,
    scaleAvailability,
    requestedClinicalFacingScoresAllowed: status?.clinicalFacingScoresAllowed === true,
    mode: clinicalFacingScoresAllowed ? "clinical-facing-supported" : mixedClinicalScaleSupport ? "mixed-clinical-scale-support" : "mirror-estimate",
    panelTitle: anyClinicalScaleSupportAllowed ? "Clinical scale support" : "Clinical scale estimates",
    availableLabel: clinicalFacingScoresAllowed
      ? "Validated support values available"
      : mixedClinicalScaleSupport
        ? `${primaryClinicalScaleSupportCount}/${CLINICAL_SCALE_PRESENTATION_KEYS.length} support values available`
        : "Assessment-grade estimates available",
    unavailableLabel: clinicalFacingScoresAllowed ? "Clinical scale support unavailable" : "Not enough assessment evidence",
    badgeLabel: clinicalFacingScoresAllowed ? "Validated" : mixedClinicalScaleSupport ? "Mixed" : "Estimate",
    reportHeading: anyClinicalScaleSupportAllowed ? "Clinical scale support" : "Clinical scale estimates",
    scaleNoun: clinicalFacingScoresAllowed ? "support value" : "estimate",
    shortNotice: clinicalFacingScoresAllowed
      ? "Clinical-facing support mode is enabled by the validation gate; clinician interpretation is still required."
      : mixedClinicalScaleSupport
        ? "Only named support values enabled by the validation gate should be treated as clinical-scale support; remaining values are Mirror estimates."
      : "Mirror estimate only; not clinician-assigned, diagnostic, or treatment guidance.",
    reportNotice: clinicalFacingScoresAllowed
      ? "Clinical-facing scale support is enabled by the repo validation gate; these values still require clinician interpretation."
      : mixedClinicalScaleSupport
        ? "Only scale rows marked as support values are enabled by the repo validation gate; other rows remain Mirror estimates only."
      : "These are Mirror estimates only, not clinician-assigned or validated clinical grades.",
    comparisonNote: clinicalFacingScoresAllowed
      ? "Comparison uses Mirror clinical-scale support values enabled by the validation gate; clinician interpretation is still required."
      : mixedClinicalScaleSupport
        ? "Comparison may include scale-specific support values only where enabled by the validation gate; other values remain Mirror estimates."
      : "Comparison uses Mirror practice metrics only; it is not a validated clinical grade.",
    footerNotice: clinicalFacingScoresAllowed
      ? "Mirror clinical-scale support is generated from practice data and still requires clinician interpretation."
      : mixedClinicalScaleSupport
        ? "Mirror clinical-scale support is scale-specific and still requires clinician interpretation."
      : "Mirror metrics are practice feedback, not validated clinical grades.",
  };
}

export {
  CLINICAL_SCALE_PRESENTATION_KEYS,
  DEFAULT_VALIDATION_STATUS,
  clinicalFacingScaleStatusEligible,
  clinicalFacingStatusEligible,
  clinicalScaleReleaseStatusBlockers,
  clinicalScaleReleaseStatusEligible,
  clinicalScaleValidationStandardBlockers,
  clinicalScaleValidationStandardEligible,
  compactClinicalScaleValueLabel,
  clinicalScaleAvailabilityPolicy,
  clinicalScalePresentationPolicy,
  scaleNounForClinicalScale,
};
