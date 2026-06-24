import validationStatus from "../../docs/validation-status.json" with { type: "json" };

const DEFAULT_VALIDATION_STATUS = Object.freeze(validationStatus);
const CLINICAL_SCALE_PRESENTATION_KEYS = Object.freeze(["houseBrackmann", "sunnybrook", "eface"]);

function clinicalFacingStatusEligible(status = DEFAULT_VALIDATION_STATUS) {
  const standard = status?.clinicalScaleMinimumStandard ?? {};
  const minReviewedAssessments = Number.isInteger(standard.minReviewedAssessments)
    ? standard.minReviewedAssessments
    : 30;
  return Boolean(
    status?.clinicalFacingScoresAllowed === true
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
  return status?.clinicalFacingScoresAllowed === true;
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
  clinicalScaleAvailabilityPolicy,
  clinicalScalePresentationPolicy,
  scaleNounForClinicalScale,
};
