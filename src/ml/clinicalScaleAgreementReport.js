import { assessClinicalScaleReadiness, clinicalValidationReportFrom } from "./clinicalScaleReadiness.js";

const PRIMARY_SCALE_LABELS = Object.freeze({
  houseBrackmann: "House-Brackmann",
  sunnybrookComposite: "Sunnybrook composite",
  efaceTotal: "eFACE total",
});

const SUPPLEMENTARY_SCALE_LABELS = Object.freeze({
  efaceStatic: "eFACE static",
  efaceDynamic: "eFACE dynamic",
  efaceSynkinesis: "eFACE synkinesis",
});

const REPORTING_REFERENCES = Object.freeze([
  {
    label: "TRIPOD+AI clinical prediction model reporting guidance",
    url: "https://www.bmj.com/content/385/bmj-2023-078378",
  },
  {
    label: "STARD 2015 diagnostic accuracy reporting guidance",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5128957/",
  },
  {
    label: "Wilson score interval for binomial agreement estimates",
    url: "https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm",
  },
  {
    label: "FDA Good Machine Learning Practice guiding principles",
    url: "https://www.fda.gov/medical-devices/software-medical-device-samd/good-machine-learning-practice-medical-device-development-guiding-principles",
  },
  {
    label: "FDA/Health Canada/MHRA PCCP guiding principles for ML-enabled medical devices",
    url: "https://www.fda.gov/medical-devices/software-medical-device-samd/predetermined-change-control-plans-machine-learning-enabled-medical-devices-guiding-principles",
  },
]);

function formatPercent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

function formatInterval(interval) {
  if (!interval) return "n/a";
  return `${formatPercent(interval.lower)}-${formatPercent(interval.upper)} ${Math.round((interval.confidenceLevel ?? 0.95) * 100)}% ${interval.method ?? "confidence"} CI`;
}

function formatEstimateVersionCounts(counts = {}) {
  const entries = Object.entries(counts).filter(([, count]) => Number(count) > 0);
  if (!entries.length) return "none";
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([version, count]) => `${version}: ${count}`)
    .join(", ");
}

function markdownEscape(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function scaleStatus(scaleReport = {}) {
  return scaleReport.status ?? (scaleReport.meetsMinimumStandard ? "meets-confidence-standard" : "not-ready");
}

function scaleTolerance(scaleKey, scaleReport = {}, readiness = {}) {
  if (scaleKey === "houseBrackmann") return readiness.thresholds?.houseBrackmannAgreement ?? "within one grade";
  if (scaleKey.startsWith("eface")) return `within ${readiness.thresholds?.efaceTolerance ?? scaleReport.tolerance ?? 10} points`;
  return `within ${readiness.thresholds?.sunnybrookTolerance ?? scaleReport.tolerance ?? 10} points`;
}

function scaleTable(scaleEntries, readiness, validation) {
  const rows = [
    "| Scale | Tolerance | Labels | Missing estimates | Within tolerance | Agreement | Wilson interval | Mean absolute delta | Status |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |",
  ];
  for (const [scaleKey, label] of Object.entries(scaleEntries)) {
    const readinessScale = readiness.byScale?.[scaleKey] ?? {};
    const validationScale = validation.byScale?.[scaleKey] ?? {};
    const source = Object.keys(readinessScale).length ? readinessScale : validationScale;
    rows.push([
      markdownEscape(label),
      markdownEscape(scaleTolerance(scaleKey, validationScale, readiness)),
      source.labeledCount ?? validationScale.labeledCount ?? 0,
      source.missingEstimateCount ?? validationScale.missingEstimateCount ?? 0,
      source.withinToleranceCount ?? validationScale.withinToleranceCount ?? 0,
      formatPercent(source.agreementRate ?? validationScale.agreementRate),
      markdownEscape(formatInterval(source.agreementConfidenceInterval ?? validationScale.agreementConfidenceInterval)),
      formatNumber(source.meanAbsDelta ?? validationScale.meanAbsDelta),
      markdownEscape(scaleStatus(source)),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  return rows.join("\n");
}

function scaleAgreementRow(scaleKey, label, readiness, validation) {
  const readinessScale = readiness.byScale?.[scaleKey] ?? {};
  const validationScale = validation.byScale?.[scaleKey] ?? {};
  const source = Object.keys(readinessScale).length ? readinessScale : validationScale;
  const agreementConfidenceInterval = source.agreementConfidenceInterval ?? validationScale.agreementConfidenceInterval ?? null;
  return {
    scaleKey,
    label,
    tolerance: scaleTolerance(scaleKey, validationScale, readiness),
    labeledCount: source.labeledCount ?? validationScale.labeledCount ?? 0,
    missingEstimateCount: source.missingEstimateCount ?? validationScale.missingEstimateCount ?? 0,
    withinToleranceCount: source.withinToleranceCount ?? validationScale.withinToleranceCount ?? 0,
    agreementRate: source.agreementRate ?? validationScale.agreementRate ?? null,
    agreementConfidenceInterval,
    agreementWilsonLowerBound: agreementConfidenceInterval?.lower ?? null,
    meanAbsDelta: source.meanAbsDelta ?? validationScale.meanAbsDelta ?? null,
    status: scaleStatus(source),
    agreementSamplePlan: validationScale.agreementSamplePlan ?? null,
  };
}

function scaleAgreementRows(scaleEntries, readiness, validation) {
  return Object.fromEntries(Object.entries(scaleEntries).map(([scaleKey, label]) => [
    scaleKey,
    scaleAgreementRow(scaleKey, label, readiness, validation),
  ]));
}

function formatPlanCount(value) {
  return Number.isFinite(value) ? String(value) : "n/a";
}

function agreementSamplePlanTable(scaleEntries, validation = {}) {
  const rows = [
    "| Scale | Current labels | Within tolerance | Required within tolerance now | Additional perfect labels needed | Projected labels | Projected within tolerance |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const [scaleKey, label] of Object.entries(scaleEntries)) {
    const plan = validation.byScale?.[scaleKey]?.agreementSamplePlan ?? {};
    rows.push([
      markdownEscape(label),
      formatPlanCount(plan.currentReviewedLabels),
      formatPlanCount(plan.currentWithinToleranceCount),
      formatPlanCount(plan.requiredWithinToleranceAtCurrentLabelCount),
      formatPlanCount(plan.additionalPerfectLabelsToReachStandard),
      formatPlanCount(plan.projectedReviewedLabelsAtStandard),
      formatPlanCount(plan.projectedWithinToleranceAtStandard),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  rows.push("", "Additional-perfect-label planning assumes future rows are eligible, current-version, non-missing estimates within tolerance; it is not a substitute for collecting reviewed clinical data.");
  return rows.join("\n");
}

function mismatchRows(validation, scaleKeys) {
  const rows = [];
  for (const scaleKey of scaleKeys) {
    const label = PRIMARY_SCALE_LABELS[scaleKey] ?? SUPPLEMENTARY_SCALE_LABELS[scaleKey] ?? scaleKey;
    const mismatches = validation.byScale?.[scaleKey]?.mismatches ?? [];
    for (const mismatch of mismatches.slice(0, 10)) {
      rows.push([
        markdownEscape(label),
        markdownEscape(mismatch.assessmentId ?? "n/a"),
        markdownEscape(mismatch.sessionId ?? "n/a"),
        formatNumber(mismatch.estimate, 2),
        formatNumber(mismatch.label, 2),
        formatNumber(mismatch.delta, 2),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
  }
  if (!rows.length) return "No out-of-tolerance primary-scale mismatches were included in the report.";
  return [
    "| Scale | Assessment | Session | Estimate | Label | Delta |",
    "| --- | --- | --- | ---: | ---: | ---: |",
    ...rows,
  ].join("\n");
}

function sourceValidationFrom(input, options) {
  if (input?.kind === "mirror-clinical-scale-readiness-report") {
    assertClinicalScaleReadinessReport(input);
    return input.sourceValidationReport;
  }
  return clinicalValidationReportFrom(input, options);
}

function assertClinicalScaleReadinessReport(input = {}) {
  if (input.schemaVersion !== 1) {
    throw new Error("clinical readiness report schemaVersion must be 1");
  }
  if (!input.sourceValidationReport || typeof input.sourceValidationReport !== "object") {
    throw new Error("clinical readiness report must include sourceValidationReport");
  }
}

function excludedLabelReasonLines(validation = {}, readiness = {}) {
  const reasons = validation.summary?.excludedClinicalLabelReasons ?? readiness.validationSummary?.excludedClinicalLabelReasons ?? {};
  const entries = Object.entries(reasons).filter(([, count]) => Number(count) > 0);
  if (!entries.length) return [];
  return [
    "",
    "## Excluded Clinical-Label Rows",
    "",
    ...entries.map(([reason, count]) => `- ${reason}: ${count}`),
  ];
}

function caseMixLines(validation = {}, readiness = {}) {
  const caseMix = validation.caseMix ?? readiness.validationSummary?.caseMix;
  if (!caseMix?.severityBands) return [];
  const rows = [
    "",
    "## House-Brackmann Case Mix",
    "",
    `- Required severity bands: ${caseMix.minHouseBrackmannSeverityBands ?? "n/a"}`,
    `- Minimum labels per represented band: ${caseMix.minAssessmentsPerSeverityBand ?? "n/a"}`,
    `- Represented severity bands: ${caseMix.representedSeverityBandCount ?? 0}`,
    "",
    "| Band | Labels | Minimum met |",
    "| --- | ---: | --- |",
  ];
  for (const [key, band] of Object.entries(caseMix.severityBands)) {
    rows.push(`| ${markdownEscape(band.label ?? key)} | ${band.count ?? 0} | ${band.meetsMinimum ? "yes" : "no"} |`);
  }
  return rows;
}

function referenceStandardControlLines(validation = {}, readiness = {}) {
  const minUsableMovementCoverageRatio = readiness.thresholds?.minUsableMovementCoverageRatio
    ?? validation.standard?.minUsableMovementCoverageRatio
    ?? 0.8;
  return [
    "## Reference Standard Controls",
    "",
    `- Eligible blinded independent clinical labels: ${validation.summary?.reviewedAssessmentCount ?? readiness.validationSummary?.reviewedAssessmentCount ?? 0}`,
    `- Case identity control: counted labels require a pseudonymous \`validationCaseId\`; at least ${readiness.thresholds?.minDistinctClinicalCases ?? validation.standard?.minDistinctClinicalCases ?? 10} distinct validation cases are required so repeated assessments from one person cannot satisfy the 80% agreement gate alone.`,
    "- Blinding control: counted labels require `sourceLabelSheetMode: blinded` and `reviewBlinded` to show Mirror estimates were hidden before target assignment.",
    "- Unique assessment control: counted labels require one stable assessment id per reviewed clinical-scale row; duplicate or missing assessment ids are excluded and block release readiness.",
    `- Estimator version control: counted labels require clinical-scale estimator version v${readiness.thresholds?.clinicalScaleEstimateVersion ?? validation.standard?.clinicalScaleEstimateVersion ?? "n/a"}.`,
    `- Estimate evidence control: counted rows require Mirror estimates with status \`estimated\`, complete/minimum evidence tier, at least ${Math.round(minUsableMovementCoverageRatio * 100)}% usable movement coverage, used/omitted movement IDs, the usable-movements-only calculation flag, Sunnybrook/eFACE input-completeness provenance, complete resting-metric keys, and the complete-resting-metrics calculation flag. House-Brackmann estimates require the gentle eye-closure input. Sunnybrook/eFACE primary comparisons require complete scale-specific movement input. Scale-specific rows with missing, incomplete-input, or invalid estimates are reported in that scale's denominator as missing estimates.`,
    "- Source dataset control: counted agreement evidence requires `sourceDatasetSha256` matching a verified blinded clinical review package.",
    "- Independence control: counted labels require clinician-assigned or adjudicated `labelSource` metadata, not Mirror/copied/algorithmic labels.",
    "- Reviewer identity control: counted labels require a pseudonymous `reviewerId`; reviewer-agreement sheets must use distinct reviewer ids to support independent-review evidence.",
    "- Reviewer control: counted labels require a recognized clinical/adjudication role and `clinicianConfidence` set to high or medium; blank, low, or uncertain confidence rows are excluded.",
    "- Review timestamp control: counted labels require `reviewedAt` as a UTC ISO timestamp.",
    "- Validity control: counted scale labels require a valid in-range target for that specific primary scale; missing targets do not remove otherwise valid labels from other scale denominators.",
  ];
}

function availabilityRecommendationLines(readiness = {}) {
  const recommendations = readiness.validationSummary?.clinicalScaleAvailabilityRecommendation ?? {};
  const entries = Object.entries(recommendations);
  if (!entries.length) return [];
  const rows = [
    "",
    "## Scale-Specific Availability Recommendation",
    "",
    "| Status key | Scale | Evidence status | Recommended clinical-facing flag | Rationale |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const [availabilityKey, recommendation] of entries) {
    rows.push([
      markdownEscape(availabilityKey),
      markdownEscape(recommendation.label ?? recommendation.scale ?? availabilityKey),
      recommendation.evidenceMeetsMinimum ? "meets minimum" : "not ready",
      recommendation.recommendedClinicalFacingScoresAllowed ? "true after human review" : "false",
      markdownEscape((recommendation.rationale ?? []).join("; ") || recommendation.releaseRecommendation),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  rows.push("", "This recommendation does not update `docs/validation-status.json`; a human-reviewed release decision is still required.");
  return rows;
}

function readinessFrom(input, options) {
  if (input?.kind === "mirror-clinical-scale-readiness-report") {
    assertClinicalScaleReadinessReport(input);
    return input;
  }
  return assessClinicalScaleReadiness(input, options);
}

function reportCaseMix(validation = {}, readiness = {}) {
  const caseMix = validation.caseMix ?? readiness.validationSummary?.caseMix ?? {};
  const severityBands = caseMix.severityBands ?? {};
  const severityBandCounts = Object.values(severityBands).map((band) => band?.count ?? 0);
  return {
    scale: caseMix.scale ?? "houseBrackmann",
    minHouseBrackmannSeverityBands: caseMix.minHouseBrackmannSeverityBands ?? readiness.thresholds?.minHouseBrackmannSeverityBands ?? 3,
    minAssessmentsPerSeverityBand: caseMix.minAssessmentsPerSeverityBand ?? readiness.thresholds?.minAssessmentsPerSeverityBand ?? 3,
    representedSeverityBandCount: caseMix.representedSeverityBandCount ?? 0,
    minimumLabelsPerRepresentedSeverityBand: severityBandCounts.length ? Math.min(...severityBandCounts) : 0,
    severityBands,
    meetsMinimumStandard: caseMix.meetsMinimumStandard === true,
    blockingReasons: caseMix.blockingReasons ?? [],
  };
}

function buildClinicalScaleAgreementReport(input = {}, options = {}) {
  const validation = sourceValidationFrom(input, options);
  const readiness = readinessFrom(input, options);
  const generatedAt = options.generatedAt ?? readiness.generatedAt ?? validation.generatedAt ?? new Date().toISOString();
  const sourceDatasetSha256 = readiness.sourceDatasetSha256 ?? validation.sourceDatasetSha256 ?? null;
  const supplementaryScaleKeys = Object.keys(SUPPLEMENTARY_SCALE_LABELS)
    .filter((scaleKey) => (validation.byScale?.[scaleKey]?.labeledCount ?? 0) > 0);
  const supplementaryEntries = Object.fromEntries(supplementaryScaleKeys.map((scaleKey) => [scaleKey, SUPPLEMENTARY_SCALE_LABELS[scaleKey]]));
  const minUsableMovementCoverageRatio = readiness.thresholds?.minUsableMovementCoverageRatio
    ?? validation.standard?.minUsableMovementCoverageRatio
    ?? 0.8;
  const blockingReasons = readiness.blockingReasons?.length
    ? readiness.blockingReasons
    : validation.blockingReasons ?? [];

  return {
    kind: "mirror-clinical-scale-agreement-report",
    schemaVersion: 1,
    generatedAt,
    sourceDatasetSha256,
    status: readiness.status ?? "unknown",
    recommendation: readiness.recommendation ?? "unknown",
    evidenceStandard: {
      minReviewedAssessments: readiness.thresholds?.minReviewedAssessments ?? validation.standard?.minReviewedAssessments ?? 30,
      minDistinctClinicalCases: readiness.thresholds?.minDistinctClinicalCases ?? validation.standard?.minDistinctClinicalCases ?? 10,
      minAgreementRate: readiness.thresholds?.minAgreementRate ?? validation.standard?.minAgreementRate ?? 0.8,
      minAgreementWilsonLowerBound: readiness.thresholds?.minAgreementWilsonLowerBound ?? validation.standard?.minAgreementWilsonLowerBound ?? 0.8,
      minUsableMovementCoverageRatio,
      houseBrackmannAgreement: readiness.thresholds?.houseBrackmannAgreement ?? validation.standard?.houseBrackmannAgreement ?? "within one grade",
      sunnybrookTolerance: readiness.thresholds?.sunnybrookTolerance ?? validation.standard?.sunnybrookTolerance ?? 10,
      efaceTolerance: readiness.thresholds?.efaceTolerance ?? validation.standard?.efaceTolerance ?? 10,
      confidenceInterval: {
        method: readiness.thresholds?.confidenceInterval?.method ?? validation.standard?.confidenceInterval?.method ?? "wilson-score",
        confidenceLevel: readiness.thresholds?.confidenceInterval?.confidenceLevel ?? validation.standard?.confidenceInterval?.confidenceLevel ?? 0.95,
      },
      clinicalScaleEstimateVersion: readiness.thresholds?.clinicalScaleEstimateVersion ?? validation.standard?.clinicalScaleEstimateVersion ?? null,
      requiresExplicitClinicalConfidence: validation.standard?.requiresExplicitClinicalConfidence === true,
      requiresIsoReviewTimestamp: validation.standard?.requiresIsoReviewTimestamp === true,
      requiresSourceDatasetSha256: true,
    },
    summary: {
      assessmentClinicalScaleRecords: validation.summary?.assessmentClinicalScaleRecords ?? readiness.validationSummary?.assessmentClinicalScaleRecords ?? 0,
      uniqueAssessmentClinicalScaleRecords: validation.summary?.uniqueAssessmentClinicalScaleRecords ?? readiness.validationSummary?.uniqueAssessmentClinicalScaleRecords ?? 0,
      duplicateClinicalScaleAssessmentIdCount: validation.summary?.duplicateClinicalScaleAssessmentIdCount ?? readiness.validationSummary?.duplicateClinicalScaleAssessmentIdCount ?? 0,
      missingClinicalScaleAssessmentIdCount: validation.summary?.missingClinicalScaleAssessmentIdCount ?? readiness.validationSummary?.missingClinicalScaleAssessmentIdCount ?? 0,
      reviewedClinicalScaleAssessmentCount: validation.summary?.reviewedAssessmentCount ?? readiness.validationSummary?.reviewedAssessmentCount ?? 0,
      distinctClinicalCaseCount: validation.summary?.distinctClinicalCaseCount ?? readiness.validationSummary?.distinctClinicalCaseCount ?? 0,
      eligibleBlindedIndependentLabelCount: validation.summary?.reviewedAssessmentCount ?? readiness.validationSummary?.reviewedAssessmentCount ?? 0,
      excludedClinicalLabelCount: validation.summary?.excludedClinicalLabelCount ?? readiness.validationSummary?.excludedClinicalLabelCount ?? 0,
      excludedClinicalLabelReasons: validation.summary?.excludedClinicalLabelReasons ?? readiness.validationSummary?.excludedClinicalLabelReasons ?? {},
      estimatedAssessmentCount: validation.summary?.estimatedAssessmentCount ?? 0,
      estimateVersionCounts: validation.summary?.estimateVersionCounts ?? readiness.validationSummary?.estimateVersionCounts ?? {},
      readyPrimaryScaleCount: readiness.validationSummary?.readyPrimaryScaleCount ?? 0,
      primaryScaleCount: readiness.validationSummary?.primaryScaleCount ?? Object.keys(PRIMARY_SCALE_LABELS).length,
    },
    primaryScaleAgreementRows: scaleAgreementRows(PRIMARY_SCALE_LABELS, readiness, validation),
    supplementaryScaleAgreementRows: scaleAgreementRows(supplementaryEntries, readiness, validation),
    houseBrackmannCaseMix: reportCaseMix(validation, readiness),
    clinicalScaleAvailabilityRecommendation: readiness.validationSummary?.clinicalScaleAvailabilityRecommendation ?? {},
    referenceStandardControls: {
      pseudonymousValidationCaseId: true,
      sourceLabelSheetModeBlinded: true,
      reviewBlinded: true,
      uniqueAssessmentId: true,
      currentEstimatorVersion: true,
      mirrorEstimateStatusEstimated: true,
      completeOrMinimumEvidenceTier: true,
      minUsableMovementCoverageRatio,
      movementInputProvenance: true,
      usableMovementsOnlyCalculation: true,
      houseBrackmannRequiredInput: true,
      sunnybrookEfaceInputCompleteness: true,
      completeRestingMetricKeys: true,
      completeRestingMetricsCalculation: true,
      missingInvalidEstimatesInDenominator: true,
      independentClinicianOrAdjudicatedLabelSource: true,
      pseudonymousReviewerId: true,
      recognizedClinicalReviewerRole: true,
      explicitClinicalConfidence: true,
      isoReviewTimestamp: true,
      sourceDatasetHashTraceability: true,
    },
    blockingReasons,
    note: "This report packages reviewed agreement evidence for Mirror clinical-scale estimates. It does not convert estimates into clinician-assigned grades and does not provide diagnosis, prognosis, or treatment advice.",
  };
}

function buildClinicalScaleAgreementMarkdown(input = {}, options = {}) {
  const validation = sourceValidationFrom(input, options);
  const readiness = readinessFrom(input, options);
  const generatedAt = options.generatedAt ?? readiness.generatedAt ?? validation.generatedAt ?? new Date().toISOString();
  const sourceDatasetSha256 = readiness.sourceDatasetSha256 ?? validation.sourceDatasetSha256 ?? "n/a";
  const blockingReasons = readiness.blockingReasons?.length
    ? readiness.blockingReasons
    : validation.blockingReasons ?? [];
  const supplementaryScaleKeys = Object.keys(SUPPLEMENTARY_SCALE_LABELS)
    .filter((scaleKey) => (validation.byScale?.[scaleKey]?.labeledCount ?? 0) > 0);
  const lines = [
    "# Mirror Clinical Scale Agreement Report",
    "",
    `Generated: ${generatedAt}`,
    `Status: ${readiness.status ?? "unknown"}`,
    `Recommendation: ${readiness.recommendation ?? "unknown"}`,
    "",
    "This report packages reviewed agreement evidence for Mirror clinical-scale estimates. It does not convert estimates into clinician-assigned grades and does not provide diagnosis, prognosis, or treatment advice.",
    "",
    "## Evidence Standard",
    "",
    `- Reviewed assessment minimum: ${readiness.thresholds?.minReviewedAssessments ?? validation.standard?.minReviewedAssessments ?? 30}`,
    `- Distinct validation case minimum: ${readiness.thresholds?.minDistinctClinicalCases ?? validation.standard?.minDistinctClinicalCases ?? 10}`,
    `- Minimum observed agreement: ${formatPercent(readiness.thresholds?.minAgreementRate ?? validation.standard?.minAgreementRate ?? 0.8)}`,
    `- Minimum Wilson lower-bound agreement: ${formatPercent(readiness.thresholds?.minAgreementWilsonLowerBound ?? validation.standard?.minAgreementWilsonLowerBound ?? 0.8)}`,
    `- House-Brackmann target: ${readiness.thresholds?.houseBrackmannAgreement ?? "within one grade"}`,
    `- Sunnybrook target: within ${readiness.thresholds?.sunnybrookTolerance ?? validation.standard?.sunnybrookTolerance ?? 10} composite points`,
    `- eFACE total target: within ${readiness.thresholds?.efaceTolerance ?? validation.standard?.efaceTolerance ?? 10} points`,
    `- Confidence interval: ${Math.round((readiness.thresholds?.confidenceInterval?.confidenceLevel ?? validation.standard?.confidenceInterval?.confidenceLevel ?? 0.95) * 100)}% Wilson score interval`,
    `- Clinical-scale estimator version: v${readiness.thresholds?.clinicalScaleEstimateVersion ?? validation.standard?.clinicalScaleEstimateVersion ?? "n/a"}`,
    `- Source dataset SHA-256: ${sourceDatasetSha256}`,
    `- Minimum usable movement coverage: ${formatPercent(readiness.thresholds?.minUsableMovementCoverageRatio ?? validation.standard?.minUsableMovementCoverageRatio ?? 0.8)}`,
    "- Estimator input provenance: counted current-version rows preserve used/omitted movement IDs, the usable-movements-only calculation flag, House-Brackmann required-input provenance, Sunnybrook/eFACE input-completeness provenance, required/available/missing resting metric keys, and the complete-resting-metrics calculation flag.",
    "",
    "## Dataset Summary",
    "",
    `- Assessment clinical-scale records: ${validation.summary?.assessmentClinicalScaleRecords ?? readiness.validationSummary?.assessmentClinicalScaleRecords ?? 0}`,
    `- Unique assessment clinical-scale records: ${validation.summary?.uniqueAssessmentClinicalScaleRecords ?? "n/a"}`,
    `- Duplicate assessment IDs: ${validation.summary?.duplicateClinicalScaleAssessmentIdCount ?? 0}`,
    `- Rows missing assessment IDs: ${validation.summary?.missingClinicalScaleAssessmentIdCount ?? 0}`,
    `- Reviewed clinical-scale assessments: ${validation.summary?.reviewedAssessmentCount ?? readiness.validationSummary?.reviewedAssessmentCount ?? 0}`,
    `- Distinct validation cases: ${validation.summary?.distinctClinicalCaseCount ?? readiness.validationSummary?.distinctClinicalCaseCount ?? 0}`,
    `- Excluded clinical-label rows: ${validation.summary?.excludedClinicalLabelCount ?? readiness.validationSummary?.excludedClinicalLabelCount ?? 0}`,
    `- Assessments with Mirror estimates: ${validation.summary?.estimatedAssessmentCount ?? 0}`,
    `- Estimate version counts: ${formatEstimateVersionCounts(validation.summary?.estimateVersionCounts ?? readiness.validationSummary?.estimateVersionCounts ?? {})}`,
    `- Ready primary scales: ${readiness.validationSummary?.readyPrimaryScaleCount ?? 0}/${readiness.validationSummary?.primaryScaleCount ?? Object.keys(PRIMARY_SCALE_LABELS).length}`,
    "",
    "## Primary Scale Agreement",
    "",
    scaleTable(PRIMARY_SCALE_LABELS, readiness, validation),
    "",
    "## Agreement Sample Plan",
    "",
    agreementSamplePlanTable(PRIMARY_SCALE_LABELS, validation),
    ...availabilityRecommendationLines(readiness),
    ...caseMixLines(validation, readiness),
    "",
    ...referenceStandardControlLines(validation, readiness),
    ...excludedLabelReasonLines(validation, readiness),
  ];

  if (supplementaryScaleKeys.length) {
    const supplementaryEntries = Object.fromEntries(supplementaryScaleKeys.map((scaleKey) => [scaleKey, SUPPLEMENTARY_SCALE_LABELS[scaleKey]]));
    lines.push("", "## Supplementary eFACE Domain Agreement", "", scaleTable(supplementaryEntries, readiness, validation));
  }

  lines.push(
    "",
    "## Blocking Reasons",
    "",
    blockingReasons.length ? blockingReasons.map((reason) => `- ${reason}`).join("\n") : "- None. The primary-scale confidence standard is met, but a human-reviewed release decision is still required before changing `docs/validation-status.json`.",
    "",
    "## Out-Of-Tolerance Review Sample",
    "",
    mismatchRows(validation, Object.keys(PRIMARY_SCALE_LABELS)),
    "",
    "## Reporting Checklist",
    "",
    "- Index estimate: Mirror standard-assessment clinical-scale estimates generated from local practice data.",
    "- Reference standard: blinded clinician-assigned House-Brackmann, Sunnybrook, and eFACE labels from `docs/clinical-scale-review-protocol.md`.",
    "- Reference standard controls: `sourceLabelSheetMode`, `reviewBlinded`, `clinicianConfidence`, `reviewedAt`, `sourceDatasetSha256`, estimator `version`, estimate evidence tier/coverage/input-provenance controls, `labelSource`, and clinical `reviewerRole` must pass before any row counts. Primary target fields then count only for the scale where a valid target is present.",
    "- Primary performance measures: tolerance-based agreement rate, missing-estimate count, mean absolute delta, and Wilson confidence interval.",
    "- Error review: out-of-tolerance assessment rows listed above for adjudication and scorer review.",
    "- Release control: this report alone cannot enable clinical-facing scores; `docs/validation-status.json` must be reviewed and updated separately.",
    "",
    "## Research And Reporting References",
    "",
    REPORTING_REFERENCES.map((item) => `- ${item.label}: ${item.url}`).join("\n"),
    "",
  );

  return `${lines.join("\n")}\n`;
}

export {
  REPORTING_REFERENCES,
  buildClinicalScaleAgreementReport,
  buildClinicalScaleAgreementMarkdown,
};
