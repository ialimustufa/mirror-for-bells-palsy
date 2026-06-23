const LABEL_COLUMNS = [
  "sampleId",
  "sessionId",
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
  "reviewerRole",
  "reviewedAt",
  "notes",
];

const LABEL_FIELDS = [
  "intendedMovement",
  "affectedSide",
  "quality",
  "visibleMovementLevel",
  "coactivationNotes",
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

function labelRowFromRecord(line) {
  const record = line.record;
  const frame = record.frame ?? {};
  const label = record.label ?? {};
  return {
    sampleId: record.id ?? frame.id ?? "",
    sessionId: record.sessionId ?? frame.sessionId ?? "",
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
    reviewerRole: label.reviewerRole ?? "",
    reviewedAt: label.reviewedAt ?? "",
    notes: label.notes ?? "",
  };
}

function validationLabelRows(records = []) {
  return frameSampleRecords(records).map(labelRowFromRecord);
}

function createValidationLabelCsv(records = []) {
  const rows = [LABEL_COLUMNS, ...validationLabelRows(records).map((row) => LABEL_COLUMNS.map((column) => row[column] ?? ""))];
  return `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
}

function csvRowsBySampleId(csvText = "") {
  const rows = parseCsv(csvText).filter((row) => row.some((cell) => String(cell ?? "").trim()));
  if (!rows.length) return new Map();
  const headers = rows[0];
  const indexByHeader = Object.fromEntries(headers.map((header, index) => [header, index]));
  const byId = new Map();
  for (const row of rows.slice(1)) {
    const sampleId = row[indexByHeader.sampleId]?.trim();
    if (!sampleId) continue;
    const next = {};
    for (const column of LABEL_COLUMNS) next[column] = row[indexByHeader[column]] ?? "";
    byId.set(sampleId, next);
  }
  return byId;
}

function mergeValidationLabels(records = [], csvText = "") {
  const labelsById = csvRowsBySampleId(csvText);
  let updatedCount = 0;
  const nextRecords = recordArray(records).map((line) => {
    if (line.section !== "frameSample" || !line.record || typeof line.record !== "object") return line;
    const sampleId = line.record.id ?? line.record.frame?.id ?? "";
    const row = labelsById.get(sampleId);
    if (!row) return line;
    const label = { ...(line.record.label ?? {}) };
    for (const field of LABEL_FIELDS) {
      const value = row[field]?.trim();
      if (value) label[field] = value;
    }
    updatedCount += 1;
    return { ...line, record: { ...line.record, label } };
  });
  return { records: nextRecords, updatedCount };
}

export {
  LABEL_COLUMNS,
  createValidationLabelCsv,
  mergeValidationLabels,
  parseCsv,
  validationLabelRows,
};
