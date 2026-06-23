import { LABEL_COLUMNS, parseCsv } from "./validationLabels.js";

const PRIMARY_REVIEW_SCALE_KEYS = Object.freeze(["houseBrackmannGrade", "sunnybrookComposite", "efaceTotal"]);

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

const ADJUDICATION_EXTRA_COLUMNS = Object.freeze([
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

function reviewerRowsByAssessmentId(csvText = "") {
  const rows = parseCsv(csvText).filter((row) => row.some((cell) => String(cell ?? "").trim()));
  const out = new Map();
  if (!rows.length) return out;
  const headers = rows[0];
  const indexByHeader = Object.fromEntries(headers.map((header, index) => [header, index]));
  for (const row of rows.slice(1)) {
    const rowType = valueFromRow(row, indexByHeader, "rowType").trim();
    const assessmentId = valueFromRow(row, indexByHeader, "assessmentId").trim();
    if (rowType && rowType !== "assessmentClinicalScale") continue;
    if (!assessmentId) continue;
    const next = {};
    for (const column of LABEL_COLUMNS) next[column] = valueFromRow(row, indexByHeader, column);
    out.set(assessmentId, next);
  }
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
    absoluteDeltas: [],
    disagreements: [],
  };
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

function summarizeScale(accumulator) {
  const meanAbsDelta = accumulator.absoluteDeltas.length
    ? accumulator.absoluteDeltas.reduce((sum, value) => sum + value, 0) / accumulator.absoluteDeltas.length
    : null;
  return {
    scale: accumulator.scale,
    label: accumulator.label,
    agreementLabel: accumulator.agreementLabel,
    tolerance: accumulator.tolerance,
    pairedCount: accumulator.pairedCount,
    missingReviewerACount: accumulator.missingReviewerACount,
    missingReviewerBCount: accumulator.missingReviewerBCount,
    exactMatchCount: accumulator.exactMatchCount,
    withinToleranceCount: accumulator.withinToleranceCount,
    exactAgreementRate: compactRate(accumulator.exactMatchCount, accumulator.pairedCount),
    withinToleranceRate: compactRate(accumulator.withinToleranceCount, accumulator.pairedCount),
    meanAbsDelta: compactNumber(meanAbsDelta, 2),
    disagreementCount: accumulator.disagreements.length,
    disagreements: accumulator.disagreements.slice(0, 20),
  };
}

function reviewerValue(row, scaleKey) {
  if (!row) return "";
  return row[scaleKey] ?? "";
}

function disagreementSummaryForAssessment(assessmentId, reviewerA, reviewerB) {
  const parts = [];
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
  row.sessionId = source.sessionId ?? "";
  row.sessionTs = source.sessionTs ?? "";
  row.date = source.date ?? "";
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
  return REVIEW_SCALE_KEYS.some((scaleKey) => {
    const a = scaleValue(scaleKey, reviewerValue(reviewerA, scaleKey));
    const b = scaleValue(scaleKey, reviewerValue(reviewerB, scaleKey));
    if (a == null && b == null) return false;
    if (a == null || b == null) return true;
    return Math.abs(a - b) > 0;
  });
}

function compareClinicalScaleReviewerLabels(reviewerACsv = "", reviewerBCsv = "", options = {}) {
  const reviewerAById = reviewerRowsByAssessmentId(reviewerACsv);
  const reviewerBById = reviewerRowsByAssessmentId(reviewerBCsv);
  const assessmentIds = [...new Set([...reviewerAById.keys(), ...reviewerBById.keys()])].sort();
  const accumulators = Object.fromEntries(REVIEW_SCALE_KEYS.map((scaleKey) => [scaleKey, createScaleAccumulator(scaleKey)]));
  const adjudicationRows = [];
  for (const assessmentId of assessmentIds) {
    const reviewerA = reviewerAById.get(assessmentId) ?? null;
    const reviewerB = reviewerBById.get(assessmentId) ?? null;
    for (const scaleKey of REVIEW_SCALE_KEYS) {
      updateScaleAccumulator(accumulators[scaleKey], assessmentId, reviewerValue(reviewerA, scaleKey), reviewerValue(reviewerB, scaleKey));
    }
    if (needsAdjudication(reviewerA, reviewerB)) adjudicationRows.push(adjudicationRow(assessmentId, reviewerA, reviewerB));
  }
  const byScale = Object.fromEntries(Object.entries(accumulators).map(([scaleKey, accumulator]) => [scaleKey, summarizeScale(accumulator)]));
  const primaryScaleSummaries = PRIMARY_REVIEW_SCALE_KEYS.map((scaleKey) => byScale[scaleKey]);
  const blockingReasons = [];
  if (!assessmentIds.length) blockingReasons.push("no shared clinical-scale assessment labels found");
  for (const scale of primaryScaleSummaries) {
    if (scale.pairedCount === 0) blockingReasons.push(`${scale.scale}: no paired reviewer labels`);
  }
  return {
    kind: "mirror-clinical-scale-reviewer-agreement-report",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    reviewerA: options.reviewerA ?? "reviewer-a",
    reviewerB: options.reviewerB ?? "reviewer-b",
    summary: {
      reviewerAAssessmentCount: reviewerAById.size,
      reviewerBAssessmentCount: reviewerBById.size,
      comparedAssessmentCount: assessmentIds.length,
      adjudicationRequiredCount: adjudicationRows.length,
      primaryScaleCount: PRIMARY_REVIEW_SCALE_KEYS.length,
    },
    byScale,
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
  PRIMARY_REVIEW_SCALE_KEYS,
  REVIEW_SCALE_CONFIG,
  REVIEW_SCALE_KEYS,
  compareClinicalScaleReviewerLabels,
  createClinicalScaleAdjudicationCsv,
};
