const VALIDATION_DATASET_KIND = "mirror-validation-dataset-jsonl";
const VALIDATION_DATASET_VERSION = 1;
const VALIDATION_LABEL_SCHEMA_VERSION = 1;
const VALIDATION_DATASET_APP_ID = "mirror-bells-palsy";

const QUALITY_LABELS = ["strong", "usable", "weak", "unusable", "uncertain"];
const VISIBLE_MOVEMENT_LEVELS = ["none", "trace", "low", "moderate", "strong", "uncertain"];

function recordArray(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

function storesFromSource(source = {}) {
  if (source?.stores && typeof source.stores === "object") return source.stores;
  return {
    appState: [source],
    sessions: source.sessions ?? [],
    sessionFrameSamples: source.sessionFrameSamples ?? source.frameSamples ?? [],
  };
}

function firstAppState(stores = {}) {
  return recordArray(stores.appState)[0] ?? null;
}

function sampleTs(sample) {
  return Number.isFinite(sample?.ts) ? sample.ts : 0;
}

function sortedByTsAsc(items) {
  return [...items].sort((a, b) => sampleTs(a) - sampleTs(b));
}

function dateFromTs(ts) {
  return Number.isFinite(ts) && ts > 0 ? new Date(ts).toISOString().slice(0, 10) : null;
}

function dateRange(records) {
  const dates = records
    .map((record) => record?.date ?? dateFromTs(record?.ts))
    .filter(Boolean)
    .sort();
  return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
}

function sessionKey(session) {
  return session?.id ?? (session?.ts != null ? `ts:${session.ts}` : null);
}

function sampleSessionKeys(sample) {
  return [
    sample?.sessionId ?? null,
    sample?.sessionTs != null ? `ts:${sample.sessionTs}` : null,
  ].filter(Boolean);
}

function compactSessionContext(session = {}) {
  return {
    id: session.id ?? null,
    ts: session.ts ?? null,
    date: session.date ?? dateFromTs(session.ts),
    kind: session.kind ?? "session",
    scoringModelVersion: session.scoringModelVersion ?? null,
    setupQuality: session.setupQuality ?? null,
    captureQuality: session.captureQuality ?? null,
    exerciseIds: Array.isArray(session.exercises)
      ? session.exercises
      : recordArray(session.scores).map((score) => score.exerciseId).filter(Boolean),
  };
}

function buildLabelSchema() {
  return {
    version: VALIDATION_LABEL_SCHEMA_VERSION,
    requiredFields: ["intendedMovement", "affectedSide", "quality", "visibleMovementLevel", "coactivationNotes"],
    fields: {
      intendedMovement: { type: "exercise-id", default: "frameSample.exerciseId" },
      affectedSide: { type: "left|right|unknown|null", default: "profile.affectedSide" },
      quality: { type: "enum|null", values: QUALITY_LABELS },
      visibleMovementLevel: { type: "enum|null", values: VISIBLE_MOVEMENT_LEVELS },
      coactivationNotes: { type: "string", default: "" },
      reviewerRole: { type: "clinician|user|developer|null", default: null },
      reviewedAt: { type: "iso-date-time|null", default: null },
      notes: { type: "string", default: "" },
    },
  };
}

function buildLabelTemplate(sample = {}, appState = {}) {
  return {
    intendedMovement: sample.exerciseId ?? null,
    affectedSide: appState?.movementProfile?.affectedSide ?? appState?.initialMovementProfile?.affectedSide ?? null,
    quality: null,
    visibleMovementLevel: null,
    coactivationNotes: "",
    reviewerRole: null,
    reviewedAt: null,
    notes: "",
  };
}

function compactFrameSample(sample = {}, appState = {}) {
  return {
    id: sample.id ?? null,
    sessionId: sample.sessionId ?? null,
    exerciseId: sample.exerciseId ?? null,
    phase: sample.phase ?? null,
    ts: sample.ts ?? null,
    sampleIndex: sample.sampleIndex ?? null,
    exerciseIndex: sample.exerciseIndex ?? null,
    repIndex: sample.repIndex ?? null,
    scoringModelVersion: sample.scoringModelVersion ?? sample.scoring?.scoringModelVersion ?? null,
    scoringNoiseMode: sample.scoringNoiseMode ?? sample.scoring?.scoringNoiseMode ?? null,
    label: buildLabelTemplate(sample, appState),
    frame: sample,
  };
}

function includedSessionContexts(sessions, samples) {
  const sampleKeys = new Set(samples.flatMap(sampleSessionKeys));
  return sessions.filter((session) => sampleKeys.has(sessionKey(session)));
}

function buildValidationDatasetRecords(source = {}, options = {}) {
  const stores = storesFromSource(source);
  const appState = firstAppState(stores) ?? source;
  const sessions = recordArray(stores.sessions ?? appState?.sessions);
  const allSamples = sortedByTsAsc(recordArray(stores.sessionFrameSamples ?? stores.frameSamples ?? appState?.sessionFrameSamples ?? appState?.frameSamples));
  const sampleLimit = Number.isFinite(options.sampleLimit) ? Math.max(0, Math.round(options.sampleLimit)) : 5000;
  const samples = allSamples.slice(Math.max(0, allSamples.length - sampleLimit));
  const sessionContexts = includedSessionContexts(sessions, samples);
  const exercises = [...new Set(samples.map((sample) => sample.exerciseId).filter(Boolean))].sort();
  const manifest = {
    kind: VALIDATION_DATASET_KIND,
    appId: VALIDATION_DATASET_APP_ID,
    version: VALIDATION_DATASET_VERSION,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    summary: {
      frameSamples: samples.length,
      calibrationSamples: samples.filter((sample) => sample.phase === "calibrate").length,
      holdSamples: samples.filter((sample) => sample.phase === "hold").length,
      sessionContexts: sessionContexts.length,
      assessmentSessions: sessionContexts.filter((session) => session.kind === "assessment").length,
      exercises,
      dateRange: dateRange([...sessionContexts, ...samples]),
      sampleLimit,
      containsLandmarks: samples.some((sample) => Array.isArray(sample.landmarks) || Array.isArray(sample.rawLandmarks)),
      containsBlendshapes: samples.some((sample) => sample.blendshapes && typeof sample.blendshapes === "object"),
    },
    labelSchema: buildLabelSchema(),
    sections: ["sessionContext", "frameSample"],
    note: "Opt-in local validation export. Labels are templates until a user, clinician, or developer reviews them.",
  };

  const records = [manifest];
  for (const session of sessionContexts) records.push({ section: "sessionContext", record: compactSessionContext(session) });
  for (const sample of samples) records.push({ section: "frameSample", record: compactFrameSample(sample, appState) });
  return records;
}

function createValidationDatasetExportBlob(records) {
  const parts = [];
  for (const record of records ?? []) parts.push(JSON.stringify(record), "\n");
  return new Blob(parts, { type: "application/x-ndjson" });
}

export {
  VALIDATION_DATASET_APP_ID,
  VALIDATION_DATASET_KIND,
  VALIDATION_DATASET_VERSION,
  buildValidationDatasetRecords,
  createValidationDatasetExportBlob,
};
