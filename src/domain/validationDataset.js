import { summarizeAssessmentSession } from "./assessment";

const VALIDATION_DATASET_KIND = "mirror-validation-dataset-jsonl";
const VALIDATION_DATASET_VERSION = 1;
const VALIDATION_LABEL_SCHEMA_VERSION = 8;
const VALIDATION_DATASET_APP_ID = "mirror-bells-palsy";

const QUALITY_LABELS = ["strong", "usable", "weak", "unusable", "uncertain"];
const VISIBLE_MOVEMENT_LEVELS = ["none", "trace", "low", "moderate", "strong", "uncertain"];
const CLINICIAN_CONFIDENCE_LABELS = ["high", "medium", "low", "uncertain"];
const HOUSE_BRACKMANN_LABELS = ["I", "II", "III", "IV", "V", "VI"];
const STANDARD_REVIEWER_ROLES = ["clinician", "user", "developer"];
const FRAME_LABEL_REQUIRED_FIELDS = ["intendedMovement", "affectedSide", "quality", "visibleMovementLevel", "coactivationNotes"];
const ASSESSMENT_CLINICAL_PRIMARY_TARGET_FIELDS = ["houseBrackmannGrade", "sunnybrookComposite", "efaceTotal"];
const ASSESSMENT_CLINICAL_LABEL_REQUIRED_FIELDS = [
  "validationCaseId",
  "clinicianConfidence",
  "sourceLabelSheetMode",
  "reviewBlinded",
  "labelSource",
  "reviewerId",
  "reviewerRole",
];

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

function buildFrameLabelFields() {
  return {
    intendedMovement: { type: "exercise-id", default: "frameSample.exerciseId" },
    affectedSide: { type: "left|right|unknown|null", default: "profile.affectedSide" },
    quality: { type: "enum|null", values: QUALITY_LABELS },
    visibleMovementLevel: { type: "enum|null", values: VISIBLE_MOVEMENT_LEVELS },
    coactivationNotes: { type: "string", default: "" },
    reviewerId: { type: "pseudonymous-string|null", default: null },
    reviewerRole: { type: "clinician|user|developer|null", values: STANDARD_REVIEWER_ROLES, default: null },
    reviewedAt: { type: "iso-date-time|null", default: null },
    notes: { type: "string", default: "" },
  };
}

function buildAssessmentClinicalLabelFields() {
  return {
    estimateStatus: { type: "estimated|insufficient-data|string|null", default: "record.estimate.status" },
    estimateEvidenceTier: { type: "complete-standard-assessment|minimum-standard-assessment|insufficient-standard-evidence|null", default: "record.estimate.evidence.tier" },
    estimateUsableMovementCoverageRatio: { type: "number|null", range: [0, 1], default: "record.estimate.coverage.ratio" },
    estimateUsableMovementCount: { type: "integer|null", default: "record.estimate.coverage.usableMovementCount" },
    estimateRequiredMovementCount: { type: "integer|null", default: "record.estimate.coverage.requiredMovementCount" },
    estimateUsedMovementExerciseIds: { type: "exercise-id-list", default: "record.estimate.evidence.estimatedMovementExerciseIds" },
    estimateOmittedMovementExerciseIds: { type: "exercise-id-list", default: "record.estimate.evidence.omittedMovementExerciseIds" },
    estimateCalculationUsesOnlyUsableMovements: { type: "boolean|null", default: "record.estimate.evidence.calculationUsesOnlyUsableMovements" },
    estimateHouseBrackmannInputComplete: { type: "boolean|null", default: "record.estimate.evidence.scaleInputCompleteness.houseBrackmann.complete" },
    estimateHouseBrackmannRequiredExerciseIds: { type: "exercise-id-list", default: "record.estimate.evidence.scaleInputCompleteness.houseBrackmann.requiredExerciseIds" },
    estimateHouseBrackmannUsedExerciseIds: { type: "exercise-id-list", default: "record.estimate.evidence.scaleInputCompleteness.houseBrackmann.usedExerciseIds" },
    estimateHouseBrackmannMissingRequiredExerciseIds: { type: "exercise-id-list", default: "record.estimate.evidence.scaleInputCompleteness.houseBrackmann.missingRequiredExerciseIds" },
    estimateSunnybrookInputComplete: { type: "boolean|null", default: "record.estimate.evidence.scaleInputCompleteness.sunnybrook.complete" },
    estimateSunnybrookUsedExerciseIds: { type: "exercise-id-list", default: "record.estimate.evidence.scaleInputCompleteness.sunnybrook.usedExerciseIds" },
    estimateSunnybrookOmittedExerciseIds: { type: "exercise-id-list", default: "record.estimate.evidence.scaleInputCompleteness.sunnybrook.omittedExerciseIds" },
    estimateEfaceInputComplete: { type: "boolean|null", default: "record.estimate.evidence.scaleInputCompleteness.eface.complete" },
    estimateEfaceUsedExerciseIds: { type: "exercise-id-list", default: "record.estimate.evidence.scaleInputCompleteness.eface.usedExerciseIds" },
    estimateEfaceOmittedExerciseIds: { type: "exercise-id-list", default: "record.estimate.evidence.scaleInputCompleteness.eface.omittedExerciseIds" },
    estimateRequiredRestingMetricKeys: { type: "resting-metric-key-list", default: "record.estimate.evidence.requiredRestingMetricKeys" },
    estimateAvailableRestingMetricKeys: { type: "resting-metric-key-list", default: "record.estimate.evidence.availableRestingMetricKeys" },
    estimateMissingRestingMetricKeys: { type: "resting-metric-key-list", default: "record.estimate.evidence.missingRestingMetricKeys" },
    estimateCalculationUsesCompleteRestingMetrics: { type: "boolean|null", default: "record.estimate.evidence.calculationUsesCompleteRestingMetrics" },
    clinicalScaleEstimateVersion: { type: "integer|null", default: "record.estimate.version" },
    validationCaseId: { type: "pseudonymous-string|null", default: null },
    houseBrackmannGrade: { type: "enum|null", values: HOUSE_BRACKMANN_LABELS, default: null },
    sunnybrookComposite: { type: "number|null", range: [0, 100], default: null },
    efaceTotal: { type: "number|null", range: [0, 100], default: null },
    efaceStatic: { type: "number|null", range: [0, 100], default: null },
    efaceDynamic: { type: "number|null", range: [0, 100], default: null },
    efaceSynkinesis: { type: "number|null", range: [0, 100], default: null },
    clinicianConfidence: { type: "enum|null", values: CLINICIAN_CONFIDENCE_LABELS, default: null },
    sourceLabelSheetMode: { type: "blinded|mirror-hidden|unblinded|null", default: null },
    reviewBlinded: { type: "yes|no|boolean|string|null", default: null },
    labelSource: { type: "clinician-assigned|adjudicated-consensus|string|null", default: null },
    reviewerId: { type: "pseudonymous-string|null", default: null },
    reviewerRole: { type: "clinician|user|developer|null", values: STANDARD_REVIEWER_ROLES, default: null },
    reviewedAt: { type: "iso-date-time|null", default: null },
    notes: { type: "string", default: "" },
  };
}

function buildLabelSchema() {
  const frameFields = buildFrameLabelFields();
  const assessmentClinicalFields = buildAssessmentClinicalLabelFields();
  return {
    version: VALIDATION_LABEL_SCHEMA_VERSION,
    requiredFields: FRAME_LABEL_REQUIRED_FIELDS,
    fields: frameFields,
    frameSample: {
      requiredFields: FRAME_LABEL_REQUIRED_FIELDS,
      fields: frameFields,
    },
    assessmentClinicalScale: {
      requiredFields: ASSESSMENT_CLINICAL_LABEL_REQUIRED_FIELDS,
      primaryTargetFields: ASSESSMENT_CLINICAL_PRIMARY_TARGET_FIELDS,
      minimumValidPrimaryTargetsForCounting: 1,
      targetCounting: "scale-by-scale",
      fields: assessmentClinicalFields,
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
    reviewerId: null,
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

function buildAssessmentClinicalLabelTemplate() {
  return {
    validationCaseId: null,
    houseBrackmannGrade: null,
    sunnybrookComposite: null,
    efaceTotal: null,
    efaceStatic: null,
    efaceDynamic: null,
    efaceSynkinesis: null,
    clinicianConfidence: null,
    sourceLabelSheetMode: null,
    reviewBlinded: null,
    labelSource: null,
    reviewerId: null,
    reviewerRole: null,
    reviewedAt: null,
    notes: "",
  };
}

function compactAssessmentClinicalScale(session = {}) {
  const assessment = summarizeAssessmentSession(session);
  const clinicalScales = assessment.clinicalScales ?? null;
  const scaleInputCompleteness = clinicalScales?.evidence?.scaleInputCompleteness ?? {};
  const houseBrackmannInput = scaleInputCompleteness.houseBrackmann ?? null;
  const sunnybrookInput = scaleInputCompleteness.sunnybrook ?? null;
  const efaceInput = scaleInputCompleteness.eface ?? null;
  return {
    id: session.id ? `${session.id}:clinical-scale` : session.ts != null ? `ts:${session.ts}:clinical-scale` : null,
    sessionId: session.id ?? null,
    sessionTs: session.ts ?? null,
    date: session.date ?? dateFromTs(session.ts),
    kind: "assessment-clinical-scale",
    scoringModelVersion: session.scoringModelVersion ?? assessment.scoringModelVersion ?? null,
    estimate: clinicalScales,
    sourceSummary: {
      averageVoluntaryMovement: assessment.averageVoluntaryMovement ?? null,
      coactivationRisk: assessment.coactivationRisk ?? null,
      captureQuality: assessment.captureQuality ?? null,
      clinicalScaleEstimateVersion: clinicalScales?.version ?? null,
      clinicalScaleEvidenceTier: clinicalScales?.evidence?.tier ?? null,
      clinicalScaleEvidenceLabel: clinicalScales?.evidence?.label ?? null,
      restingAverageAsymmetryRatio: assessment.resting?.averageAsymmetryRatio ?? null,
      usableMovementCoverageRatio: clinicalScales?.coverage?.ratio ?? null,
      usableMovementCount: clinicalScales?.coverage?.usableMovementCount ?? null,
      requiredMovementCount: clinicalScales?.coverage?.requiredMovementCount ?? null,
      estimateUsedMovementExerciseIds: clinicalScales?.evidence?.estimatedMovementExerciseIds ?? null,
      estimateOmittedMovementExerciseIds: clinicalScales?.evidence?.omittedMovementExerciseIds ?? null,
      estimateCalculationUsesOnlyUsableMovements: clinicalScales?.evidence?.calculationUsesOnlyUsableMovements ?? null,
      estimateHouseBrackmannInputComplete: houseBrackmannInput?.complete ?? null,
      estimateHouseBrackmannRequiredExerciseIds: houseBrackmannInput?.requiredExerciseIds ?? null,
      estimateHouseBrackmannUsedExerciseIds: houseBrackmannInput?.usedExerciseIds ?? null,
      estimateHouseBrackmannMissingRequiredExerciseIds: houseBrackmannInput?.missingRequiredExerciseIds ?? null,
      estimateSunnybrookInputComplete: sunnybrookInput?.complete ?? null,
      estimateSunnybrookUsedExerciseIds: sunnybrookInput?.usedExerciseIds ?? null,
      estimateSunnybrookOmittedExerciseIds: sunnybrookInput?.omittedExerciseIds ?? null,
      estimateEfaceInputComplete: efaceInput?.complete ?? null,
      estimateEfaceUsedExerciseIds: efaceInput?.usedExerciseIds ?? null,
      estimateEfaceOmittedExerciseIds: efaceInput?.omittedExerciseIds ?? null,
      estimateRequiredRestingMetricKeys: clinicalScales?.evidence?.requiredRestingMetricKeys ?? null,
      estimateAvailableRestingMetricKeys: clinicalScales?.evidence?.availableRestingMetricKeys ?? null,
      estimateMissingRestingMetricKeys: clinicalScales?.evidence?.missingRestingMetricKeys ?? null,
      estimateCalculationUsesCompleteRestingMetrics: clinicalScales?.evidence?.calculationUsesCompleteRestingMetrics ?? null,
    },
    label: buildAssessmentClinicalLabelTemplate(),
  };
}

function includedSessionContexts(sessions, samples) {
  const sampleKeys = new Set(samples.flatMap(sampleSessionKeys));
  return sessions.filter((session) => session.kind === "assessment" || sampleKeys.has(sessionKey(session)));
}

function buildValidationDatasetRecords(source = {}, options = {}) {
  const stores = storesFromSource(source);
  const appState = firstAppState(stores) ?? source;
  const sessions = recordArray(stores.sessions ?? appState?.sessions);
  const allSamples = sortedByTsAsc(recordArray(stores.sessionFrameSamples ?? stores.frameSamples ?? appState?.sessionFrameSamples ?? appState?.frameSamples));
  const sampleLimit = Number.isFinite(options.sampleLimit) ? Math.max(0, Math.round(options.sampleLimit)) : 5000;
  const samples = allSamples.slice(Math.max(0, allSamples.length - sampleLimit));
  const sessionContexts = includedSessionContexts(sessions, samples);
  const assessmentClinicalScales = sessionContexts
    .filter((session) => session.kind === "assessment")
    .map((session) => compactAssessmentClinicalScale(session));
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
      assessmentClinicalScaleRecords: assessmentClinicalScales.length,
      exercises,
      dateRange: dateRange([...sessionContexts, ...samples]),
      sampleLimit,
      containsLandmarks: samples.some((sample) => Array.isArray(sample.landmarks) || Array.isArray(sample.rawLandmarks)),
      containsBlendshapes: samples.some((sample) => sample.blendshapes && typeof sample.blendshapes === "object"),
    },
    labelSchema: buildLabelSchema(),
    sections: ["sessionContext", "assessmentClinicalScale", "frameSample"],
    note: "Opt-in local validation export. Labels are templates until a user, clinician, or developer reviews them.",
  };

  const records = [manifest];
  for (const session of sessionContexts) records.push({ section: "sessionContext", record: compactSessionContext(session) });
  for (const assessmentClinicalScale of assessmentClinicalScales) records.push({ section: "assessmentClinicalScale", record: assessmentClinicalScale });
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
  VALIDATION_LABEL_SCHEMA_VERSION,
  buildValidationDatasetRecords,
  createValidationDatasetExportBlob,
};
