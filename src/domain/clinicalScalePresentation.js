import validationStatus from "../../docs/validation-status.json" with { type: "json" };

const DEFAULT_VALIDATION_STATUS = Object.freeze(validationStatus);

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

function clinicalScalePresentationPolicy(status = DEFAULT_VALIDATION_STATUS) {
  const clinicalFacingScoresAllowed = clinicalFacingStatusEligible(status);
  return {
    validationStatus: status?.status ?? null,
    clinicalFacingScoresAllowed,
    requestedClinicalFacingScoresAllowed: status?.clinicalFacingScoresAllowed === true,
    mode: clinicalFacingScoresAllowed ? "clinical-facing-supported" : "mirror-estimate",
    panelTitle: clinicalFacingScoresAllowed ? "Clinical scale support" : "Clinical scale estimates",
    availableLabel: clinicalFacingScoresAllowed ? "Validated support values available" : "Assessment-grade estimates available",
    unavailableLabel: clinicalFacingScoresAllowed ? "Clinical scale support unavailable" : "Not enough assessment evidence",
    badgeLabel: clinicalFacingScoresAllowed ? "Validated" : "Estimate",
    reportHeading: clinicalFacingScoresAllowed ? "Clinical scale support" : "Clinical scale estimates",
    scaleNoun: clinicalFacingScoresAllowed ? "support value" : "estimate",
    shortNotice: clinicalFacingScoresAllowed
      ? "Clinical-facing support mode is enabled by the validation gate; clinician interpretation is still required."
      : "Mirror estimate only; not clinician-assigned, diagnostic, or treatment guidance.",
    reportNotice: clinicalFacingScoresAllowed
      ? "Clinical-facing scale support is enabled by the repo validation gate; these values still require clinician interpretation."
      : "These are Mirror estimates only, not clinician-assigned or validated clinical grades.",
    comparisonNote: clinicalFacingScoresAllowed
      ? "Comparison uses Mirror clinical-scale support values enabled by the validation gate; clinician interpretation is still required."
      : "Comparison uses Mirror practice metrics only; it is not a validated clinical grade.",
    footerNotice: clinicalFacingScoresAllowed
      ? "Mirror clinical-scale support is generated from practice data and still requires clinician interpretation."
      : "Mirror metrics are practice feedback, not validated clinical grades.",
  };
}

export { DEFAULT_VALIDATION_STATUS, clinicalFacingStatusEligible, clinicalScalePresentationPolicy };
