const LABEL_COLUMNS = [
  "rowType",
  "sampleId",
  "assessmentId",
  "sessionId",
  "sessionTs",
  "date",
  "exerciseId",
  "phase",
  "ts",
  "repIndex",
  "sampleIndex",
  "intendedMovement",
  "affectedSide",
  "quality",
  "visibleMovementLevel",
  "coactivationNotes",
  "estimateStatus",
  "estimateEvidenceTier",
  "estimateUsableMovementCoverageRatio",
  "estimateUsableMovementCount",
  "estimateRequiredMovementCount",
  "estimateUsedMovementExerciseIds",
  "estimateOmittedMovementExerciseIds",
  "estimateCalculationUsesOnlyUsableMovements",
  "estimateHouseBrackmannInputComplete",
  "estimateHouseBrackmannRequiredExerciseIds",
  "estimateHouseBrackmannUsedExerciseIds",
  "estimateHouseBrackmannMissingRequiredExerciseIds",
  "estimateRequiredRestingMetricKeys",
  "estimateAvailableRestingMetricKeys",
  "estimateMissingRestingMetricKeys",
  "estimateCalculationUsesCompleteRestingMetrics",
  "clinicalScaleEstimateVersion",
  "estimatedHouseBrackmannGrade",
  "estimatedHouseBrackmannNumericGrade",
  "estimatedSunnybrookComposite",
  "estimatedEfaceTotal",
  "estimatedEfaceStatic",
  "estimatedEfaceDynamic",
  "estimatedEfaceSynkinesis",
  "houseBrackmannGrade",
  "sunnybrookComposite",
  "efaceTotal",
  "efaceStatic",
  "efaceDynamic",
  "efaceSynkinesis",
  "clinicianConfidence",
  "sourceLabelSheetMode",
  "reviewBlinded",
  "labelSource",
  "reviewerRole",
  "reviewedAt",
  "notes",
];

const FRAME_LABEL_FIELDS = [
  "intendedMovement",
  "affectedSide",
  "quality",
  "visibleMovementLevel",
  "coactivationNotes",
  "reviewerRole",
  "reviewedAt",
  "notes",
];

const ASSESSMENT_CLINICAL_LABEL_FIELDS = [
  "houseBrackmannGrade",
  "sunnybrookComposite",
  "efaceTotal",
  "efaceStatic",
  "efaceDynamic",
  "efaceSynkinesis",
  "clinicianConfidence",
  "sourceLabelSheetMode",
  "reviewBlinded",
  "labelSource",
  "reviewerRole",
  "reviewedAt",
  "notes",
];

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseCsv(text = "") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function recordArray(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

function frameSampleRecords(records = []) {
  return recordArray(records).filter((line) => line.section === "frameSample" && line.record && typeof line.record === "object");
}

function assessmentClinicalScaleRecords(records = []) {
  return recordArray(records).filter((line) => line.section === "assessmentClinicalScale" && line.record && typeof line.record === "object");
}

function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : "";
}

function formatList(value) {
  return Array.isArray(value) ? value.filter(Boolean).join("|") : String(value ?? "");
}

function formatBoolean(value) {
  return typeof value === "boolean" ? String(value) : "";
}

function frameLabelRowFromRecord(line) {
  const record = line.record;
  const frame = record.frame ?? {};
  const label = record.label ?? {};
  return {
    rowType: "frameSample",
    sampleId: record.id ?? frame.id ?? "",
    assessmentId: "",
    sessionId: record.sessionId ?? frame.sessionId ?? "",
    sessionTs: frame.sessionTs ?? "",
    date: "",
    exerciseId: record.exerciseId ?? frame.exerciseId ?? "",
    phase: record.phase ?? frame.phase ?? "",
    ts: record.ts ?? frame.ts ?? "",
    repIndex: record.repIndex ?? frame.repIndex ?? "",
    sampleIndex: record.sampleIndex ?? frame.sampleIndex ?? "",
    intendedMovement: label.intendedMovement ?? record.exerciseId ?? frame.exerciseId ?? "",
    affectedSide: label.affectedSide ?? "",
    quality: label.quality ?? "",
    visibleMovementLevel: label.visibleMovementLevel ?? "",
    coactivationNotes: label.coactivationNotes ?? "",
    sourceLabelSheetMode: "",
    estimateStatus: "",
    estimateEvidenceTier: "",
    estimateUsableMovementCoverageRatio: "",
    estimateUsableMovementCount: "",
    estimateRequiredMovementCount: "",
    estimateUsedMovementExerciseIds: "",
    estimateOmittedMovementExerciseIds: "",
    estimateCalculationUsesOnlyUsableMovements: "",
    estimateHouseBrackmannInputComplete: "",
    estimateHouseBrackmannRequiredExerciseIds: "",
    estimateHouseBrackmannUsedExerciseIds: "",
    estimateHouseBrackmannMissingRequiredExerciseIds: "",
    estimateRequiredRestingMetricKeys: "",
    estimateAvailableRestingMetricKeys: "",
    estimateMissingRestingMetricKeys: "",
    estimateCalculationUsesCompleteRestingMetrics: "",
    clinicalScaleEstimateVersion: "",
    estimatedHouseBrackmannGrade: "",
    estimatedHouseBrackmannNumericGrade: "",
    estimatedSunnybrookComposite: "",
    estimatedEfaceTotal: "",
    estimatedEfaceStatic: "",
    estimatedEfaceDynamic: "",
    estimatedEfaceSynkinesis: "",
    houseBrackmannGrade: "",
    sunnybrookComposite: "",
    efaceTotal: "",
    efaceStatic: "",
    efaceDynamic: "",
    efaceSynkinesis: "",
    clinicianConfidence: "",
    reviewBlinded: "",
    labelSource: "",
    reviewerRole: label.reviewerRole ?? "",
    reviewedAt: label.reviewedAt ?? "",
    notes: label.notes ?? "",
  };
}

function assessmentClinicalLabelRowFromRecord(line, options = {}) {
  const includeEstimateColumns = options.includeEstimateColumns !== false;
  const record = line.record;
  const label = record.label ?? {};
  const estimate = record.estimate ?? {};
  const sourceSummary = record.sourceSummary ?? {};
  const evidence = estimate.evidence ?? {};
  const coverage = estimate.coverage ?? {};
  const houseBrackmannInput = evidence.scaleInputCompleteness?.houseBrackmann ?? {};
  const scales = includeEstimateColumns && estimate.status === "estimated" ? estimate.scales ?? {} : {};
  const houseBrackmann = scales.houseBrackmann ?? {};
  const sunnybrook = scales.sunnybrook ?? {};
  const eface = scales.eface ?? {};
  return {
    rowType: "assessmentClinicalScale",
    sampleId: "",
    assessmentId: record.id ?? "",
    sessionId: record.sessionId ?? "",
    sessionTs: record.sessionTs ?? "",
    date: record.date ?? "",
    exerciseId: "",
    phase: "",
    ts: "",
    repIndex: "",
    sampleIndex: "",
    intendedMovement: "",
    affectedSide: "",
    quality: "",
    visibleMovementLevel: "",
    coactivationNotes: "",
    sourceLabelSheetMode: label.sourceLabelSheetMode ?? (includeEstimateColumns ? "unblinded" : "blinded"),
    estimateStatus: estimate.status ?? "",
    estimateEvidenceTier: evidence.tier ?? sourceSummary.clinicalScaleEvidenceTier ?? "",
    estimateUsableMovementCoverageRatio: formatNumber(coverage.ratio ?? sourceSummary.usableMovementCoverageRatio, 4),
    estimateUsableMovementCount: coverage.usableMovementCount ?? sourceSummary.usableMovementCount ?? "",
    estimateRequiredMovementCount: coverage.requiredMovementCount ?? sourceSummary.requiredMovementCount ?? "",
    estimateUsedMovementExerciseIds: formatList(evidence.estimatedMovementExerciseIds ?? sourceSummary.estimateUsedMovementExerciseIds),
    estimateOmittedMovementExerciseIds: formatList(evidence.omittedMovementExerciseIds ?? sourceSummary.estimateOmittedMovementExerciseIds),
    estimateCalculationUsesOnlyUsableMovements: formatBoolean(evidence.calculationUsesOnlyUsableMovements ?? sourceSummary.estimateCalculationUsesOnlyUsableMovements),
    estimateHouseBrackmannInputComplete: formatBoolean(houseBrackmannInput.complete ?? sourceSummary.estimateHouseBrackmannInputComplete),
    estimateHouseBrackmannRequiredExerciseIds: formatList(houseBrackmannInput.requiredExerciseIds ?? sourceSummary.estimateHouseBrackmannRequiredExerciseIds),
    estimateHouseBrackmannUsedExerciseIds: formatList(houseBrackmannInput.usedExerciseIds ?? sourceSummary.estimateHouseBrackmannUsedExerciseIds),
    estimateHouseBrackmannMissingRequiredExerciseIds: formatList(houseBrackmannInput.missingRequiredExerciseIds ?? sourceSummary.estimateHouseBrackmannMissingRequiredExerciseIds),
    estimateRequiredRestingMetricKeys: formatList(evidence.requiredRestingMetricKeys ?? sourceSummary.estimateRequiredRestingMetricKeys),
    estimateAvailableRestingMetricKeys: formatList(evidence.availableRestingMetricKeys ?? sourceSummary.estimateAvailableRestingMetricKeys),
    estimateMissingRestingMetricKeys: formatList(evidence.missingRestingMetricKeys ?? sourceSummary.estimateMissingRestingMetricKeys),
    estimateCalculationUsesCompleteRestingMetrics: formatBoolean(evidence.calculationUsesCompleteRestingMetrics ?? sourceSummary.estimateCalculationUsesCompleteRestingMetrics),
    clinicalScaleEstimateVersion: estimate.version ?? "",
    estimatedHouseBrackmannGrade: houseBrackmann.grade ?? "",
    estimatedHouseBrackmannNumericGrade: houseBrackmann.numericGrade ?? "",
    estimatedSunnybrookComposite: formatNumber(sunnybrook.compositeScore),
    estimatedEfaceTotal: formatNumber(eface.totalScore),
    estimatedEfaceStatic: formatNumber(eface.staticScore),
    estimatedEfaceDynamic: formatNumber(eface.dynamicScore),
    estimatedEfaceSynkinesis: formatNumber(eface.synkinesisScore),
    houseBrackmannGrade: label.houseBrackmannGrade ?? "",
    sunnybrookComposite: label.sunnybrookComposite ?? "",
    efaceTotal: label.efaceTotal ?? "",
    efaceStatic: label.efaceStatic ?? "",
    efaceDynamic: label.efaceDynamic ?? "",
    efaceSynkinesis: label.efaceSynkinesis ?? "",
    clinicianConfidence: label.clinicianConfidence ?? "",
    reviewBlinded: label.reviewBlinded ?? "",
    labelSource: label.labelSource ?? "",
    reviewerRole: label.reviewerRole ?? "",
    reviewedAt: label.reviewedAt ?? "",
    notes: label.notes ?? "",
  };
}

function validationLabelRows(records = [], options = {}) {
  return [
    ...frameSampleRecords(records).map(frameLabelRowFromRecord),
    ...assessmentClinicalScaleRecords(records).map((line) => assessmentClinicalLabelRowFromRecord(line, options)),
  ];
}

function createValidationLabelCsv(records = [], options = {}) {
  const rows = [LABEL_COLUMNS, ...validationLabelRows(records, options).map((row) => LABEL_COLUMNS.map((column) => row[column] ?? ""))];
  return `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
}

function valueFromRow(row, indexByHeader, column) {
  const index = indexByHeader[column];
  return index == null ? "" : row[index] ?? "";
}

function csvRowsByRecordId(csvText = "") {
  const rows = parseCsv(csvText).filter((row) => row.some((cell) => String(cell ?? "").trim()));
  const frameRowsById = new Map();
  const assessmentRowsById = new Map();
  if (!rows.length) return { frameRowsById, assessmentRowsById };
  const headers = rows[0];
  const indexByHeader = Object.fromEntries(headers.map((header, index) => [header, index]));
  for (const row of rows.slice(1)) {
    const next = {};
    for (const column of LABEL_COLUMNS) next[column] = valueFromRow(row, indexByHeader, column);
    const rowType = next.rowType?.trim() || (next.assessmentId?.trim() ? "assessmentClinicalScale" : "frameSample");
    if (rowType === "assessmentClinicalScale") {
      const assessmentId = next.assessmentId?.trim();
      if (assessmentId) assessmentRowsById.set(assessmentId, next);
      continue;
    }
    const sampleId = next.sampleId?.trim();
    if (sampleId) frameRowsById.set(sampleId, next);
  }
  return { frameRowsById, assessmentRowsById };
}

function mergeLabelFields(existingLabel, row, fields) {
  const label = { ...(existingLabel ?? {}) };
  for (const field of fields) {
    const value = row[field]?.trim();
    if (value) label[field] = value;
  }
  return label;
}

function mergeValidationLabels(records = [], csvText = "") {
  const { frameRowsById, assessmentRowsById } = csvRowsByRecordId(csvText);
  let updatedFrameCount = 0;
  let updatedAssessmentClinicalScaleCount = 0;
  const nextRecords = recordArray(records).map((line) => {
    if (line.section === "frameSample" && line.record && typeof line.record === "object") {
      const sampleId = line.record.id ?? line.record.frame?.id ?? "";
      const row = frameRowsById.get(sampleId);
      if (!row) return line;
      updatedFrameCount += 1;
      return { ...line, record: { ...line.record, label: mergeLabelFields(line.record.label, row, FRAME_LABEL_FIELDS) } };
    }
    if (line.section === "assessmentClinicalScale" && line.record && typeof line.record === "object") {
      const assessmentId = line.record.id ?? "";
      const row = assessmentRowsById.get(assessmentId);
      if (!row) return line;
      updatedAssessmentClinicalScaleCount += 1;
      return { ...line, record: { ...line.record, label: mergeLabelFields(line.record.label, row, ASSESSMENT_CLINICAL_LABEL_FIELDS) } };
    }
    return line;
  });
  return {
    records: nextRecords,
    updatedCount: updatedFrameCount + updatedAssessmentClinicalScaleCount,
    updatedFrameCount,
    updatedAssessmentClinicalScaleCount,
  };
}

export {
  ASSESSMENT_CLINICAL_LABEL_FIELDS,
  FRAME_LABEL_FIELDS,
  LABEL_COLUMNS,
  createValidationLabelCsv,
  mergeValidationLabels,
  parseCsv,
  validationLabelRows,
};
