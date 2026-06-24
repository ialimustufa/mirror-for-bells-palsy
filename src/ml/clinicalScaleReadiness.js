import { DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD, evaluateClinicalScaleEstimates } from "./validationEvaluation.js";

const PRIMARY_CLINICAL_SCALE_CONFIG = Object.freeze({
  houseBrackmann: {
    availabilityKey: "houseBrackmann",
    label: "House-Brackmann",
  },
  sunnybrookComposite: {
    availabilityKey: "sunnybrook",
    label: "Sunnybrook composite",
  },
  efaceTotal: {
    availabilityKey: "eface",
    label: "eFACE total",
  },
});
const PRIMARY_CLINICAL_SCALE_KEYS = Object.freeze(Object.keys(PRIMARY_CLINICAL_SCALE_CONFIG));

function finiteOrNull(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function normalizeThresholds(options = {}) {
  return {
    minAgreementRate: options.minAgreementRate ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minAgreementRate,
    minAgreementWilsonLowerBound: options.minAgreementWilsonLowerBound ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minAgreementWilsonLowerBound,
    minReviewedAssessments: Math.max(1, Math.round(options.minReviewedAssessments ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minReviewedAssessments)),
    minHouseBrackmannSeverityBands: Math.max(1, Math.round(options.minHouseBrackmannSeverityBands ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minHouseBrackmannSeverityBands)),
    minAssessmentsPerSeverityBand: Math.max(1, Math.round(options.minAssessmentsPerSeverityBand ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minAssessmentsPerSeverityBand)),
    minUsableMovementCoverageRatio: options.minUsableMovementCoverageRatio ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minUsableMovementCoverageRatio,
    confidenceLevel: options.confidenceLevel ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.confidenceLevel,
    clinicalScaleEstimateVersion: options.clinicalScaleEstimateVersion ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.clinicalScaleEstimateVersion,
  };
}

function clinicalValidationReportFrom(input = {}, options = {}) {
  if (input?.kind === "mirror-clinical-scale-validation-report") return input;
  if (input?.clinicalScales?.kind === "mirror-clinical-scale-validation-report") return input.clinicalScales;
  if (Array.isArray(input)) return evaluateClinicalScaleEstimates(input, options);
  return evaluateClinicalScaleEstimates([input], options);
}

function summarizeScaleReadiness(scaleKey, scaleReport = {}, thresholds) {
  const labeledCount = scaleReport.labeledCount ?? 0;
  const agreementRate = scaleReport.agreementRate;
  const confidenceInterval = scaleReport.agreementConfidenceInterval ?? null;
  const confidenceLowerBound = confidenceInterval?.lower;
  const blockingReasons = [];
  if (labeledCount < thresholds.minReviewedAssessments) {
    blockingReasons.push(`needs at least ${thresholds.minReviewedAssessments} reviewed labels`);
  }
  if (!Number.isFinite(agreementRate) || agreementRate < thresholds.minAgreementRate) {
    blockingReasons.push(`needs at least ${Math.round(thresholds.minAgreementRate * 100)}% observed agreement`);
  }
  if (!Number.isFinite(confidenceLowerBound) || confidenceLowerBound < thresholds.minAgreementWilsonLowerBound) {
    blockingReasons.push(`needs ${Math.round(thresholds.confidenceLevel * 100)}% Wilson lower bound at least ${Math.round(thresholds.minAgreementWilsonLowerBound * 100)}%`);
  }
  if ((scaleReport.missingEstimateCount ?? 0) > 0) {
    blockingReasons.push("has reviewed labels without Mirror estimates");
  }
  return {
    scale: scaleKey,
    availabilityKey: PRIMARY_CLINICAL_SCALE_CONFIG[scaleKey]?.availabilityKey ?? scaleKey,
    label: PRIMARY_CLINICAL_SCALE_CONFIG[scaleKey]?.label ?? scaleKey,
    status: blockingReasons.length ? "not-ready" : "meets-confidence-standard",
    labeledCount,
    agreementRate: finiteOrNull(agreementRate),
    agreementConfidenceInterval: confidenceInterval,
    withinToleranceCount: scaleReport.withinToleranceCount ?? 0,
    missingEstimateCount: scaleReport.missingEstimateCount ?? 0,
    meanAbsDelta: finiteOrNull(scaleReport.meanAbsDelta),
    blockingReasons,
  };
}

function scaleAvailabilityRecommendation(byScale, commonBlockingReasons = []) {
  return Object.fromEntries(PRIMARY_CLINICAL_SCALE_KEYS.map((scaleKey) => {
    const scale = byScale[scaleKey];
    const evidenceMeetsMinimum = commonBlockingReasons.length === 0 && scale?.status === "meets-confidence-standard";
    const blockingReasons = [
      ...commonBlockingReasons,
      ...(scale?.blockingReasons ?? []),
    ];
    return [
      PRIMARY_CLINICAL_SCALE_CONFIG[scaleKey].availabilityKey,
      {
        scale: scaleKey,
        label: PRIMARY_CLINICAL_SCALE_CONFIG[scaleKey].label,
        evidenceMeetsMinimum,
        recommendedClinicalFacingScoresAllowed: evidenceMeetsMinimum,
        releaseRecommendation: evidenceMeetsMinimum ? "eligible-after-human-review" : "keep-as-estimate",
        rationale: evidenceMeetsMinimum
          ? ["Scale-specific evidence meets the reviewed-label, observed-agreement, and Wilson lower-bound standards."]
          : blockingReasons,
      },
    ];
  }));
}

function assessClinicalScaleReadiness(input = {}, options = {}) {
  const thresholds = normalizeThresholds(options);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const clinicalValidation = clinicalValidationReportFrom(input, thresholds);
  const byScale = Object.fromEntries(
    PRIMARY_CLINICAL_SCALE_KEYS.map((scaleKey) => [
      scaleKey,
      summarizeScaleReadiness(scaleKey, clinicalValidation.byScale?.[scaleKey], thresholds),
    ]),
  );
  const commonBlockingReasons = [];
  if ((clinicalValidation.summary?.reviewedAssessmentCount ?? 0) < thresholds.minReviewedAssessments) {
    commonBlockingReasons.push(`needs at least ${thresholds.minReviewedAssessments} reviewed clinical-scale assessments`);
  }
  if (clinicalValidation.standard?.clinicalScaleEstimateVersion !== thresholds.clinicalScaleEstimateVersion) {
    commonBlockingReasons.push(`clinicalScaleEstimateVersion: needs validation report for estimator v${thresholds.clinicalScaleEstimateVersion}`);
  }
  if (clinicalValidation.standard?.requiresV3MovementProvenance !== true) {
    commonBlockingReasons.push("estimateMovementProvenance: needs validation report with used/omitted movement input controls");
  }
  if (clinicalValidation.standard?.requiresV4RestingMetricProvenance !== true) {
    commonBlockingReasons.push("estimateRestingMetricProvenance: needs validation report with complete resting-metric input controls");
  }
  if (!clinicalValidation.caseMix) {
    commonBlockingReasons.push("caseMix: needs House-Brackmann severity-band coverage report");
  } else if (clinicalValidation.caseMix.blockingReasons?.length) {
    commonBlockingReasons.push(`caseMix: ${clinicalValidation.caseMix.blockingReasons.join("; ")}`);
  }
  const clinicalScaleAvailabilityRecommendation = scaleAvailabilityRecommendation(byScale, commonBlockingReasons);
  const readyScaleCount = Object.values(clinicalScaleAvailabilityRecommendation).filter((scale) => scale.evidenceMeetsMinimum).length;
  const blockingReasons = [...commonBlockingReasons];
  for (const scaleKey of PRIMARY_CLINICAL_SCALE_KEYS) {
    const scale = byScale[scaleKey];
    if (scale.blockingReasons.length) blockingReasons.push(`${scaleKey}: ${scale.blockingReasons.join("; ")}`);
  }

  const status = blockingReasons.length ? "needs-reviewed-clinical-scale-data" : "meets-clinical-scale-confidence-standard";
  const recommendation = readyScaleCount === 0
    ? "collect-reviewed-clinical-scale-labels"
    : blockingReasons.length
      ? "allow-scale-specific-estimate-availability-after-human-review"
      : "allow-controlled-estimate-availability-after-human-review";
  return {
    kind: "mirror-clinical-scale-readiness-report",
    generatedAt,
    status,
    recommendation,
    thresholds: {
      ...thresholds,
      primaryScales: PRIMARY_CLINICAL_SCALE_KEYS,
      houseBrackmannAgreement: "within one grade",
      sunnybrookTolerance: clinicalValidation.standard?.sunnybrookTolerance ?? 10,
      efaceTolerance: clinicalValidation.standard?.efaceTolerance ?? 10,
      caseMix: clinicalValidation.standard?.caseMix ?? {
        minHouseBrackmannSeverityBands: thresholds.minHouseBrackmannSeverityBands,
        minAssessmentsPerSeverityBand: thresholds.minAssessmentsPerSeverityBand,
      },
      confidenceInterval: {
        method: "wilson-score",
        confidenceLevel: thresholds.confidenceLevel,
      },
    },
    validationSummary: {
      reviewedAssessmentCount: clinicalValidation.summary?.reviewedAssessmentCount ?? 0,
      excludedClinicalLabelCount: clinicalValidation.summary?.excludedClinicalLabelCount ?? 0,
      excludedClinicalLabelReasons: clinicalValidation.summary?.excludedClinicalLabelReasons ?? {},
      primaryScaleLabelIssueReasons: clinicalValidation.summary?.primaryScaleLabelIssueReasons ?? {},
      primaryScaleEstimateIssueReasons: clinicalValidation.summary?.primaryScaleEstimateIssueReasons ?? {},
      assessmentClinicalScaleRecords: clinicalValidation.summary?.assessmentClinicalScaleRecords ?? 0,
      estimateVersionCounts: clinicalValidation.summary?.estimateVersionCounts ?? {},
      currentClinicalScaleEstimateVersionAssessmentCount: clinicalValidation.summary?.currentClinicalScaleEstimateVersionAssessmentCount ?? 0,
      readyPrimaryScaleCount: readyScaleCount,
      primaryScaleCount: PRIMARY_CLINICAL_SCALE_KEYS.length,
      clinicalScaleAvailabilityRecommendation,
      caseMix: clinicalValidation.caseMix ?? null,
      readyForClinicalFacingScoring: false,
      clinicalFacingScoresAllowedByReportAlone: false,
    },
    byScale,
    blockingReasons,
    findings: blockingReasons.length
      ? ["Clinical scale readiness cannot be claimed until reviewed assessment labels meet the configured coverage and agreement standard."]
      : ["Reviewed clinical-scale labels meet the configured observed and Wilson confidence lower-bound standard for all primary scales."],
    nextActions: blockingReasons.length
      ? [
        "Collect clinician-reviewed House-Brackmann, Sunnybrook, and eFACE target labels from standard assessments.",
        "Re-run validation:clinical-readiness on the reviewed dataset or validation report.",
      ]
      : [
        "Review the validation dataset and agreement report with a clinician before changing docs/validation-status.json.",
        "Keep UI copy as Mirror estimates unless a clinician-reviewed release process explicitly enables clinical-facing scores.",
      ],
    sourceValidationReport: clinicalValidation,
    note: "This report is a release-readiness decision for Mirror estimates. It does not convert estimates into clinician-assigned grades.",
  };
}

export {
  PRIMARY_CLINICAL_SCALE_KEYS,
  assessClinicalScaleReadiness,
  clinicalValidationReportFrom,
};
