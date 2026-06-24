import { DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD, evaluateClinicalScaleEstimates } from "./validationEvaluation.js";

const PRIMARY_CLINICAL_SCALE_KEYS = Object.freeze(["houseBrackmann", "sunnybrookComposite", "efaceTotal"]);

function finiteOrNull(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function normalizeThresholds(options = {}) {
  return {
    minAgreementRate: options.minAgreementRate ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minAgreementRate,
    minReviewedAssessments: Math.max(1, Math.round(options.minReviewedAssessments ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minReviewedAssessments)),
    minHouseBrackmannSeverityBands: Math.max(1, Math.round(options.minHouseBrackmannSeverityBands ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minHouseBrackmannSeverityBands)),
    minAssessmentsPerSeverityBand: Math.max(1, Math.round(options.minAssessmentsPerSeverityBand ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.minAssessmentsPerSeverityBand)),
    confidenceLevel: options.confidenceLevel ?? DEFAULT_CLINICAL_SCALE_VALIDATION_STANDARD.confidenceLevel,
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
  const blockingReasons = [];
  if (labeledCount < thresholds.minReviewedAssessments) {
    blockingReasons.push(`needs at least ${thresholds.minReviewedAssessments} reviewed labels`);
  }
  if (!Number.isFinite(agreementRate) || agreementRate < thresholds.minAgreementRate) {
    blockingReasons.push(`needs at least ${Math.round(thresholds.minAgreementRate * 100)}% agreement`);
  }
  if ((scaleReport.missingEstimateCount ?? 0) > 0) {
    blockingReasons.push("has reviewed labels without Mirror estimates");
  }
  return {
    scale: scaleKey,
    status: blockingReasons.length ? "not-ready" : "meets-observed-standard",
    labeledCount,
    agreementRate: finiteOrNull(agreementRate),
    agreementConfidenceInterval: confidenceInterval,
    withinToleranceCount: scaleReport.withinToleranceCount ?? 0,
    missingEstimateCount: scaleReport.missingEstimateCount ?? 0,
    meanAbsDelta: finiteOrNull(scaleReport.meanAbsDelta),
    blockingReasons,
  };
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
  const blockingReasons = [];
  if ((clinicalValidation.summary?.reviewedAssessmentCount ?? 0) < thresholds.minReviewedAssessments) {
    blockingReasons.push(`needs at least ${thresholds.minReviewedAssessments} reviewed clinical-scale assessments`);
  }
  if (!clinicalValidation.caseMix) {
    blockingReasons.push("caseMix: needs House-Brackmann severity-band coverage report");
  } else if (clinicalValidation.caseMix.blockingReasons?.length) {
    blockingReasons.push(`caseMix: ${clinicalValidation.caseMix.blockingReasons.join("; ")}`);
  }
  for (const scaleKey of PRIMARY_CLINICAL_SCALE_KEYS) {
    const scale = byScale[scaleKey];
    if (scale.blockingReasons.length) blockingReasons.push(`${scaleKey}: ${scale.blockingReasons.join("; ")}`);
  }

  const status = blockingReasons.length ? "needs-reviewed-clinical-scale-data" : "meets-clinical-scale-observed-standard";
  return {
    kind: "mirror-clinical-scale-readiness-report",
    generatedAt,
    status,
    recommendation: blockingReasons.length ? "collect-reviewed-clinical-scale-labels" : "allow-controlled-estimate-availability-after-human-review",
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
      assessmentClinicalScaleRecords: clinicalValidation.summary?.assessmentClinicalScaleRecords ?? 0,
      readyPrimaryScaleCount: Object.values(byScale).filter((scale) => scale.status === "meets-observed-standard").length,
      primaryScaleCount: PRIMARY_CLINICAL_SCALE_KEYS.length,
      caseMix: clinicalValidation.caseMix ?? null,
      readyForClinicalFacingScoring: false,
      clinicalFacingScoresAllowedByReportAlone: false,
    },
    byScale,
    blockingReasons,
    findings: blockingReasons.length
      ? ["Clinical scale readiness cannot be claimed until reviewed assessment labels meet the configured coverage and agreement standard."]
      : ["Reviewed clinical-scale labels meet the configured observed agreement standard for all primary scales."],
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
