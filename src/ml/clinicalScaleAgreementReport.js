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

function markdownEscape(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function scaleStatus(scaleReport = {}) {
  return scaleReport.status ?? (scaleReport.meetsMinimumStandard ? "meets-observed-standard" : "not-ready");
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
  if (input?.kind === "mirror-clinical-scale-readiness-report" && input.sourceValidationReport) {
    return input.sourceValidationReport;
  }
  return clinicalValidationReportFrom(input, options);
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

function referenceStandardControlLines(validation = {}, readiness = {}) {
  return [
    "## Reference Standard Controls",
    "",
    `- Eligible blinded independent clinical labels: ${validation.summary?.reviewedAssessmentCount ?? readiness.validationSummary?.reviewedAssessmentCount ?? 0}`,
    "- Blinding control: counted labels require `sourceLabelSheetMode: blinded` and `reviewBlinded` to show Mirror estimates were hidden before target assignment.",
    "- Independence control: counted labels require clinician-assigned or adjudicated `labelSource` metadata, not Mirror/copied/algorithmic labels.",
    "- Reviewer control: counted labels require a recognized clinical/adjudication role and are excluded when confidence is uncertain.",
    "- Validity control: counted labels require valid primary House-Brackmann, Sunnybrook composite, and eFACE total targets.",
  ];
}

function readinessFrom(input, options) {
  if (input?.kind === "mirror-clinical-scale-readiness-report") return input;
  return assessClinicalScaleReadiness(input, options);
}

function buildClinicalScaleAgreementMarkdown(input = {}, options = {}) {
  const validation = sourceValidationFrom(input, options);
  const readiness = readinessFrom(input, options);
  const generatedAt = options.generatedAt ?? readiness.generatedAt ?? validation.generatedAt ?? new Date().toISOString();
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
    `- Minimum observed agreement: ${formatPercent(readiness.thresholds?.minAgreementRate ?? validation.standard?.minAgreementRate ?? 0.8)}`,
    `- House-Brackmann target: ${readiness.thresholds?.houseBrackmannAgreement ?? "within one grade"}`,
    `- Sunnybrook target: within ${readiness.thresholds?.sunnybrookTolerance ?? validation.standard?.sunnybrookTolerance ?? 10} composite points`,
    `- eFACE total target: within ${readiness.thresholds?.efaceTolerance ?? validation.standard?.efaceTolerance ?? 10} points`,
    `- Confidence interval: ${Math.round((readiness.thresholds?.confidenceInterval?.confidenceLevel ?? validation.standard?.confidenceInterval?.confidenceLevel ?? 0.95) * 100)}% Wilson score interval`,
    "",
    "## Dataset Summary",
    "",
    `- Assessment clinical-scale records: ${validation.summary?.assessmentClinicalScaleRecords ?? readiness.validationSummary?.assessmentClinicalScaleRecords ?? 0}`,
    `- Reviewed clinical-scale assessments: ${validation.summary?.reviewedAssessmentCount ?? readiness.validationSummary?.reviewedAssessmentCount ?? 0}`,
    `- Excluded clinical-label rows: ${validation.summary?.excludedClinicalLabelCount ?? readiness.validationSummary?.excludedClinicalLabelCount ?? 0}`,
    `- Assessments with Mirror estimates: ${validation.summary?.estimatedAssessmentCount ?? 0}`,
    `- Ready primary scales: ${readiness.validationSummary?.readyPrimaryScaleCount ?? 0}/${readiness.validationSummary?.primaryScaleCount ?? Object.keys(PRIMARY_SCALE_LABELS).length}`,
    "",
    "## Primary Scale Agreement",
    "",
    scaleTable(PRIMARY_SCALE_LABELS, readiness, validation),
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
    blockingReasons.length ? blockingReasons.map((reason) => `- ${reason}`).join("\n") : "- None. The observed primary-scale standard is met, but a human-reviewed release decision is still required before changing `docs/validation-status.json`.",
    "",
    "## Out-Of-Tolerance Review Sample",
    "",
    mismatchRows(validation, Object.keys(PRIMARY_SCALE_LABELS)),
    "",
    "## Reporting Checklist",
    "",
    "- Index estimate: Mirror standard-assessment clinical-scale estimates generated from local practice data.",
    "- Reference standard: blinded clinician-assigned House-Brackmann, Sunnybrook, and eFACE labels from `docs/clinical-scale-review-protocol.md`.",
    "- Reference standard controls: `sourceLabelSheetMode`, `reviewBlinded`, `labelSource`, clinical `reviewerRole`, and valid primary target fields must be present before rows count toward readiness.",
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
  buildClinicalScaleAgreementMarkdown,
};
