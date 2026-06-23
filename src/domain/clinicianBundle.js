import { summarizeAssessmentSession } from "./assessment";
import { summarizeSessionDiagnostics } from "./sessionDiagnostics";

const CLINICIAN_BUNDLE_LINES_KIND = "mirror-clinician-review-bundle-jsonl";
const CLINICIAN_BUNDLE_VERSION = 1;
const CLINICIAN_BUNDLE_APP_ID = "mirror-bells-palsy";
const DEFAULT_RECENT_SESSION_LIMIT = 12;
const IMAGE_ROLES_FOR_BUNDLE = new Set(["sessionBaseline", "baseline", "rep"]);

function recordArray(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

function firstAppState(stores = {}) {
  return recordArray(stores.appState)[0] ?? null;
}

function storesFromSource(source = {}) {
  if (source?.stores && typeof source.stores === "object") return source.stores;
  return {
    appState: [source],
    sessions: source.sessions ?? [],
    sessionImages: [],
    sessionFrameSamples: [],
  };
}

function sessionKey(session) {
  return session?.id ?? (session?.ts != null ? `ts:${session.ts}` : null);
}

function sourceSessionKeys(assessment) {
  return [
    assessment?.sourceSessionId ?? null,
    assessment?.sourceSessionTs != null ? `ts:${assessment.sourceSessionTs}` : null,
  ].filter(Boolean);
}

function sessionMatchesAssessment(session, assessment) {
  return sourceSessionKeys(assessment).includes(session?.id) || sourceSessionKeys(assessment).includes(session?.ts != null ? `ts:${session.ts}` : null);
}

function sortedByTsDesc(items) {
  return [...items].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
}

function sortedByTsAsc(items) {
  return [...items].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
}

function dateRange(records) {
  const dates = records
    .map((record) => record?.date ?? (record?.ts ? new Date(record.ts).toISOString().slice(0, 10) : null))
    .filter(Boolean)
    .sort();
  return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
}

function compactProgress(progress) {
  if (!progress || typeof progress !== "object") return null;
  return {
    affectedSide: progress.affectedSide ?? null,
    limitedSide: progress.limitedSide ?? null,
    affectedProgressRatio: progress.affectedProgressRatio ?? progress.ratio ?? null,
    sideConvention: progress.sideConvention ?? null,
  };
}

function compactExerciseScore(score = {}) {
  return {
    exerciseId: score.exerciseId ?? null,
    avg: Number.isFinite(score.avg) ? score.avg : null,
    reps: Array.isArray(score.scores) ? score.scores.length : null,
    baselineProgress: compactProgress(score.baselineProgress),
    initialBaselineProgress: compactProgress(score.initialBaselineProgress),
    movementProgress: compactProgress(score.movementProgress),
    initialMovementProgress: compactProgress(score.initialMovementProgress),
    captureQuality: score.captureQuality ?? null,
    coactivation: score.movementFeatures?.coactivation ?? score.coactivation ?? null,
    dropReasonCounts: score.dropReasonCounts ?? null,
  };
}

function compactSession(session = {}) {
  const diagnostics = summarizeSessionDiagnostics(session);
  return {
    id: session.id ?? null,
    ts: session.ts ?? null,
    date: session.date ?? null,
    kind: session.kind ?? "session",
    duration: session.duration ?? null,
    comfortLevel: session.comfortLevel ?? null,
    scoringModelVersion: session.scoringModelVersion ?? null,
    sessionAvg: Number.isFinite(session.sessionAvg) ? session.sessionAvg : null,
    setupQuality: session.setupQuality ?? null,
    captureQuality: session.captureQuality ?? null,
    restingMetrics: session.restingMetrics ?? null,
    progress: {
      baselineProgress: compactProgress(session.baselineProgress),
      initialBaselineProgress: compactProgress(session.initialBaselineProgress),
      movementProgress: compactProgress(session.movementProgress),
      initialMovementProgress: compactProgress(session.initialMovementProgress),
    },
    exercises: recordArray(session.scores).map(compactExerciseScore),
    diagnostics: {
      captureQualityNote: diagnostics.captureQualityNote,
      topDropReasons: diagnostics.topDropReasons,
      coactivation: diagnostics.coactivation,
      safetyPrompts: diagnostics.safetyPrompts,
    },
    imageRefs: {
      baselineImageId: session.baselineImageId ?? null,
      hasBaselineSnapshot: Boolean(session.hasBaselineSnapshot),
      imageCount: session.imageCount ?? null,
      snapshotCount: session.snapshotCount ?? null,
    },
    frameSampleCount: session.frameSampleCount ?? null,
  };
}

function compactAssessment(assessment = {}, sessions = []) {
  const sourceSession = sessions.find((session) => sessionMatchesAssessment(session, assessment)) ?? null;
  const normalized = assessment.zones ? assessment : summarizeAssessmentSession(sourceSession ?? assessment);
  return {
    ts: normalized.ts ?? null,
    date: normalized.date ?? null,
    sourceSessionId: normalized.sourceSessionId ?? null,
    sourceSessionTs: normalized.sourceSessionTs ?? null,
    averageVoluntaryMovement: normalized.averageVoluntaryMovement ?? null,
    coactivationRisk: normalized.coactivationRisk ?? null,
    captureQuality: normalized.captureQuality ?? null,
    resting: normalized.resting ?? null,
    zones: recordArray(normalized.zones).map((zone) => ({
      zone: zone.zone,
      label: zone.label,
      exerciseIds: zone.exerciseIds ?? [],
      voluntaryMovement: zone.voluntaryMovement ?? null,
      movementSource: zone.movementSource ?? null,
      coactivationRisk: zone.coactivationRisk ?? null,
      captureQuality: zone.captureQuality ?? null,
    })),
  };
}

function compactJournalEntry(entry = {}) {
  return {
    date: entry.date ?? null,
    ts: entry.ts ?? null,
    symmetry: Number.isFinite(entry.symmetry) ? entry.symmetry : null,
    mood: entry.mood ?? null,
    notes: entry.notes ?? "",
  };
}

function imageBelongsToSessions(image, sessionKeys) {
  if (!image?.sessionId || !sessionKeys.has(image.sessionId)) return false;
  return !image.role || IMAGE_ROLES_FOR_BUNDLE.has(image.role);
}

function compactImageRecord(image = {}) {
  return {
    id: image.id ?? null,
    sessionId: image.sessionId ?? null,
    exerciseId: image.exerciseId ?? null,
    role: image.role ?? null,
    scoreIndex: image.scoreIndex ?? null,
    repIndex: image.repIndex ?? null,
    ts: image.ts ?? null,
    mime: image.mime ?? null,
    dataUrl: image.dataUrl ?? null,
  };
}

function compactFrameSample(sample = {}) {
  return {
    id: sample.id ?? null,
    sessionId: sample.sessionId ?? null,
    exerciseId: sample.exerciseId ?? null,
    phase: sample.phase ?? null,
    ts: sample.ts ?? null,
    sampleIndex: sample.sampleIndex ?? null,
    scoringModelVersion: sample.scoringModelVersion ?? sample.scoring?.scoringModelVersion ?? null,
    frame: sample,
  };
}

function includedSessionsForBundle(sessions, assessments, recentSessionLimit) {
  const recent = sortedByTsDesc(sessions).slice(0, recentSessionLimit);
  const assessmentSources = sessions.filter((session) => assessments.some((assessment) => sessionMatchesAssessment(session, assessment)));
  const byKey = new Map();
  for (const session of [...recent, ...assessmentSources]) {
    const key = sessionKey(session);
    if (key) byKey.set(key, session);
  }
  return sortedByTsAsc([...byKey.values()]);
}

function buildClinicianBundleRecords(source = {}, options = {}) {
  const stores = storesFromSource(source);
  const appState = firstAppState(stores) ?? source;
  const sessions = recordArray(stores.sessions ?? appState?.sessions);
  const assessments = recordArray(appState?.assessments);
  const journal = recordArray(appState?.journal);
  const recentSessionLimit = Number.isFinite(options.recentSessionLimit)
    ? Math.max(0, Math.round(options.recentSessionLimit))
    : DEFAULT_RECENT_SESSION_LIMIT;
  const includedSessions = includedSessionsForBundle(sessions, assessments, recentSessionLimit);
  const includedKeys = new Set(includedSessions.map(sessionKey).filter(Boolean));

  const images = recordArray(stores.sessionImages).filter((image) => imageBelongsToSessions(image, includedKeys));
  const frameSamples = recordArray(stores.sessionFrameSamples).filter((sample) => sample.sessionId && includedKeys.has(sample.sessionId));
  const scoringVersions = [...new Set(includedSessions.map((session) => session.scoringModelVersion).filter(Boolean))];
  const manifest = {
    kind: CLINICIAN_BUNDLE_LINES_KIND,
    appId: CLINICIAN_BUNDLE_APP_ID,
    version: CLINICIAN_BUNDLE_VERSION,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    summary: {
      sessions: includedSessions.length,
      assessments: assessments.length,
      journalEntries: journal.length,
      images: images.length,
      frameSamples: frameSamples.length,
      dateRange: dateRange([...includedSessions, ...assessments, ...journal]),
      scoringModelVersions: scoringVersions,
      recentSessionLimit,
      localOnly: true,
      containsImageDataUrls: images.some((image) => typeof image.dataUrl === "string"),
      containsFrameSamples: frameSamples.length > 0,
    },
    sections: ["assessmentTrend", "session", "journal", "image", "frameSample"],
    note: "Mirror practice metrics are not validated clinical grades. Share only by explicit user export.",
  };

  const records = [manifest];
  for (const assessment of sortedByTsAsc(assessments)) records.push({ section: "assessmentTrend", record: compactAssessment(assessment, sessions) });
  for (const session of includedSessions) records.push({ section: "session", record: compactSession(session) });
  for (const entry of sortedByTsAsc(journal)) records.push({ section: "journal", record: compactJournalEntry(entry) });
  for (const image of images) records.push({ section: "image", record: compactImageRecord(image) });
  for (const sample of frameSamples) records.push({ section: "frameSample", record: compactFrameSample(sample) });
  return records;
}

function createClinicianBundleExportBlob(records) {
  const parts = [];
  for (const record of records ?? []) parts.push(JSON.stringify(record), "\n");
  return new Blob(parts, { type: "application/x-ndjson" });
}

export {
  CLINICIAN_BUNDLE_APP_ID,
  CLINICIAN_BUNDLE_LINES_KIND,
  CLINICIAN_BUNDLE_VERSION,
  buildClinicianBundleRecords,
  createClinicianBundleExportBlob,
};
