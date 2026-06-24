import { EXERCISE_BY_ID } from "./exercises";
import { MOVEMENT_SIDE_CONVENTION, progressUsesLegacySideConvention, roundMetric } from "../ml/faceMetrics";

const PERSONAL_RECOVERY_MODEL_VERSION = 2;
const PERSONAL_MODEL_MIN_SAMPLES = 5;
const PERSONAL_MODEL_MIN_DATES = 3;
const PERSONAL_MODEL_MAX_SAMPLE_WEIGHT = 1.25;
const DAY_MS = 1000 * 60 * 60 * 24;
const RECENT_WINDOW_DAYS = 14;

function validNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function dateKeyForSample(sample) {
  if (sample.date) return sample.date;
  if (!sample.ts) return null;
  return new Date(sample.ts).toISOString().split("T")[0];
}

function median(values) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

function weightedMedian(items) {
  const valid = items
    .filter((item) => Number.isFinite(item?.value) && Number.isFinite(item?.weight) && item.weight > 0)
    .sort((a, b) => a.value - b.value);
  if (!valid.length) return null;
  const total = valid.reduce((sum, item) => sum + item.weight, 0);
  const half = total / 2;
  let seen = 0;
  for (let i = 0; i < valid.length; i++) {
    seen += valid[i].weight;
    // Exact midpoint with a value on each side: interpolate like median() does for
    // even counts, instead of biasing toward the lower of the two central values.
    if (seen === half && i + 1 < valid.length) return (valid[i].value + valid[i + 1].value) / 2;
    if (seen > half) return valid[i].value;
  }
  return valid.at(-1)?.value ?? null;
}

function progressCandidates(score) {
  return [
    score?.initialMovementProgress,
    score?.movementProgress,
    score?.initialBaselineProgress,
    score?.baselineProgress,
  ];
}

function progressFromScore(score) {
  for (const progress of progressCandidates(score)) {
    if (!progress || progressUsesLegacySideConvention(progress)) continue;
    const ratio = progress.affectedProgressRatio ?? progress.ratio;
    if (!Number.isFinite(ratio)) continue;
    return {
      ratio,
      side: progress.side,
      referenceSide: progress.referenceSide,
      affectedMovement: progress.affectedMovement ?? progress.currentMovement,
      properMovement: progress.properMovement,
      affectedToProperRatio: progress.affectedToProperRatio,
    };
  }
  return null;
}

// True only when a score has at least one progress candidate, all usable ones use
// the legacy side convention, and none provide a current-convention ratio — i.e. it
// was dropped purely because its data predates the side-convention migration.
function scoreOnlyHasLegacyProgress(score) {
  let sawLegacy = false;
  for (const progress of progressCandidates(score)) {
    if (!progress) continue;
    if (progressUsesLegacySideConvention(progress)) { sawLegacy = true; continue; }
    if (Number.isFinite(progress.affectedProgressRatio ?? progress.ratio)) return false;
  }
  return sawLegacy;
}

function sampleWeight(session, score, progress, profileExercise) {
  let weight = 1;
  if (session?.kind === "assessment") weight *= 1.2;
  else if (session?.kind === "practice") weight *= 0.75;
  const features = score?.movementFeatures;
  const captureQuality = score?.captureQuality ?? session?.captureQuality;
  const validFrames = features?.validScoredFrameCount ?? progress?.reps ?? score?.scores?.length;
  if (Number.isFinite(validFrames) && validFrames < 8) weight *= 0.55;
  if (Number.isFinite(features?.alignedFrameRatio) && features.alignedFrameRatio < 0.7) weight *= 0.6;
  if (captureQuality?.key === "unscored") weight *= 0.25;
  else if (captureQuality?.key === "weak") weight *= 0.45;
  else if (captureQuality?.key === "usable") weight *= 0.85;
  const coactivationRisk = features?.coactivation?.risk ?? score?.coactivation?.risk;
  if (coactivationRisk === "high") weight *= 0.75;
  else if (coactivationRisk === "medium") weight *= 0.9;
  const reliableThreshold = features?.profileThreshold ?? features?.thresholdBands?.reliableMovement;
  if (
    Number.isFinite(features?.activationPeak)
    && Number.isFinite(reliableThreshold)
    && reliableThreshold > 0
    && features.activationPeak < reliableThreshold
  ) {
    weight *= 0.5;
  }
  const scoringMode = features?.scoringNoiseMode ?? session?.scoringNoiseMode;
  if (scoringMode === "raw") weight *= 0.7;
  else if (scoringMode === "soft") weight *= 0.85;
  if (profileExercise?.quality?.key === "retake") weight *= 0.65;
  if (profileExercise?.quality?.key === "usable") weight *= 0.9;
  return Math.max(0.05, Math.min(PERSONAL_MODEL_MAX_SAMPLE_WEIGHT, weight));
}

function samplesFromSessions(sessions = [], movementProfile = null) {
  const samplesByExercise = new Map();
  let legacyExcludedSampleCount = 0;
  for (const session of sessions ?? []) {
    const ts = session?.ts ?? session?.createdAt ?? null;
    const date = session?.date ?? (ts ? new Date(ts).toISOString().split("T")[0] : null);
    if (!date || !Array.isArray(session?.scores)) continue;
    for (const score of session.scores) {
      const exerciseId = score?.exerciseId;
      if (!EXERCISE_BY_ID.has(exerciseId)) continue;
      const progress = progressFromScore(score);
      if (!progress) {
        if (scoreOnlyHasLegacyProgress(score)) legacyExcludedSampleCount += 1;
        continue;
      }
      const profileExercise = movementProfile?.exercises?.[exerciseId] ?? null;
      const item = {
        exerciseId,
        date,
        ts: ts ?? Date.parse(date),
        ratio: progress.ratio,
        side: progress.side,
        referenceSide: progress.referenceSide,
        affectedMovement: validNumber(progress.affectedMovement),
        properMovement: validNumber(progress.properMovement),
        affectedToProperRatio: validNumber(progress.affectedToProperRatio),
        weight: sampleWeight(session, score, progress, profileExercise),
      };
      if (!samplesByExercise.has(exerciseId)) samplesByExercise.set(exerciseId, []);
      samplesByExercise.get(exerciseId).push(item);
    }
  }
  for (const [exerciseId, samples] of samplesByExercise.entries()) {
    samplesByExercise.set(exerciseId, samples.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0)));
  }
  return { samplesByExercise, legacyExcludedSampleCount };
}

function aggregateSamplesByDate(samples) {
  const byDate = new Map();
  for (const sample of samples) {
    const key = dateKeyForSample(sample);
    if (!key) continue;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(sample);
  }
  const points = [];
  for (const [key, group] of byDate.entries()) {
    const ratio = weightedMedian(group.map((sample) => ({ value: sample.ratio, weight: sample.weight })));
    if (!Number.isFinite(ratio)) continue;
    points.push({
      ratio,
      weight: group.reduce((sum, sample) => sum + sample.weight, 0),
      ts: Date.parse(key),
    });
  }
  return points.sort((a, b) => a.ts - b.ts);
}

function robustSlopePctPerWeek(samples) {
  // Collapse to one representative point per calendar date before measuring the
  // trend. Multiple sessions on the same day (normal at the default 3/day goal)
  // would otherwise produce sub-day spans that divide tiny ratio changes by a
  // fraction of a day and explode the per-week slope. After aggregation every
  // cross-date pair is >= 1 day apart, so the days<=0 guard does the rest.
  const points = aggregateSamplesByDate(samples);
  const slopes = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i], b = points[j];
      const days = ((b.ts ?? 0) - (a.ts ?? 0)) / DAY_MS;
      if (days <= 0) continue;
      slopes.push({
        value: ((b.ratio - a.ratio) / days) * 7 * 100,
        weight: Math.min(a.weight, b.weight),
      });
    }
  }
  return weightedMedian(slopes);
}

function recentSamples(samples) {
  if (!samples.length) return [];
  const latestTs = samples.at(-1)?.ts ?? 0;
  const recent = samples.filter((sample) => latestTs - (sample.ts ?? 0) <= RECENT_WINDOW_DAYS * DAY_MS);
  if (recent.length >= 3) return recent;
  // Sparse practice: fall back to the most recent calendar date's samples rather
  // than slice(-5), which could otherwise average in months-old sessions and make
  // "current" understate the user's latest state.
  const latestKey = dateKeyForSample(samples.at(-1));
  const latestDateSamples = samples.filter((sample) => dateKeyForSample(sample) === latestKey);
  return latestDateSamples.length ? latestDateSamples : samples.slice(-5);
}

function variabilityForSamples(samples, currentRatio) {
  if (!Number.isFinite(currentRatio)) return null;
  return median(samples.map((sample) => Math.abs(sample.ratio - currentRatio)));
}

function confidenceForExercise({ sampleCount, dateCount, variability, medianWeight }) {
  if (sampleCount < PERSONAL_MODEL_MIN_SAMPLES || dateCount < PERSONAL_MODEL_MIN_DATES) return "collecting";
  if ((variability != null && variability > 0.25) || medianWeight < 0.55) return "low";
  if (sampleCount >= 10 && dateCount >= 5 && (variability == null || variability <= 0.12) && medianWeight >= 0.8) return "high";
  return "medium";
}

function uncertaintyHalfWidth({ sampleCount, dateCount, variability, medianWeight, confidence }) {
  if (confidence === "collecting") return null;
  const variabilityBand = Number.isFinite(variability) ? variability * 1.35 : 0.16;
  const samplePenalty = Math.max(0, PERSONAL_MODEL_MIN_SAMPLES / Math.max(1, sampleCount) - 0.5) * 0.1;
  const datePenalty = Math.max(0, PERSONAL_MODEL_MIN_DATES / Math.max(1, dateCount) - 0.5) * 0.08;
  const weightPenalty = Math.max(0, 1 - (medianWeight ?? 0)) * 0.22;
  const confidencePenalty = confidence === "low" ? 0.08 : confidence === "medium" ? 0.035 : 0.015;
  return Math.min(0.65, Math.max(0.04, variabilityBand + samplePenalty + datePenalty + weightPenalty + confidencePenalty));
}

function trendStatusForExercise({ confidence, trendSlopePctPerWeek, medianWeight }) {
  if (confidence === "collecting") return "collecting";
  if ((medianWeight ?? 0) < 0.55) return "worse-capture-quality";
  if (confidence === "low") return "low-confidence";
  if (Number.isFinite(trendSlopePctPerWeek) && trendSlopePctPerWeek > 2.5) return "improving";
  return "stable";
}

function normalizedTrendStatus(entry, confidence) {
  if (["collecting", "low-confidence", "stable", "improving", "worse-capture-quality"].includes(entry.trendStatus)) return entry.trendStatus;
  if (confidence === "collecting") return "collecting";
  if (confidence === "low") return "low-confidence";
  if (Number.isFinite(entry.trendSlopePctPerWeek) && entry.trendSlopePctPerWeek > 2.5) return "improving";
  return "stable";
}

function modelStatusFromEntries(entries) {
  const confidences = Object.values(entries).map((entry) => entry.confidence);
  if (!confidences.length || confidences.every((value) => value === "collecting")) return "collecting";
  if (confidences.some((value) => value === "high")) return "high";
  if (confidences.some((value) => value === "medium")) return "medium";
  return "low";
}

function balanceMedian(samples) {
  return weightedMedian(
    samples
      .filter((sample) => Number.isFinite(sample.affectedToProperRatio))
      .map((sample) => ({ value: sample.affectedToProperRatio, weight: sample.weight })),
  );
}

function trainExerciseModel(exerciseId, samples, now) {
  const dateKeys = new Set(samples.map(dateKeyForSample).filter(Boolean));
  const recent = recentSamples(samples);
  const currentRatio = weightedMedian(recent.map((sample) => ({ value: sample.ratio, weight: sample.weight })));
  const currentBalanceRatio = balanceMedian(recent);
  const firstDate = dateKeyForSample(samples[0]);
  const baselineDateSamples = samples.filter((sample) => dateKeyForSample(sample) === firstDate);
  const baselineRatio = weightedMedian(baselineDateSamples.map((sample) => ({ value: sample.ratio, weight: sample.weight })));
  const baselineBalanceRatio = balanceMedian(baselineDateSamples);
  const variability = variabilityForSamples(recent, currentRatio);
  const medianWeight = median(samples.map((sample) => sample.weight)) ?? 0;
  const trendSlopePctPerWeek = robustSlopePctPerWeek(samples);
  const confidence = confidenceForExercise({
    sampleCount: samples.length,
    dateCount: dateKeys.size,
    variability,
    medianWeight,
  });
  const uncertainty = uncertaintyHalfWidth({
    sampleCount: samples.length,
    dateCount: dateKeys.size,
    variability,
    medianWeight,
    confidence,
  });
  const trendStatus = trendStatusForExercise({ confidence, trendSlopePctPerWeek, medianWeight });
  // currentRatio is "stale" when the 14-day window was too sparse to fill (so it
  // fell back to the latest calendar date) and that latest sample is itself older
  // than the window relative to training time — i.e. the figure predates the window.
  const latestSampleTs = samples.at(-1)?.ts ?? null;
  const recentInWindow = samples.filter((sample) => (latestSampleTs ?? 0) - (sample.ts ?? 0) <= RECENT_WINDOW_DAYS * DAY_MS).length;
  const isCurrentStale = recentInWindow < 3
    && Number.isFinite(latestSampleTs)
    && (now - latestSampleTs) > RECENT_WINDOW_DAYS * DAY_MS;
  return {
    exerciseId,
    sideConvention: MOVEMENT_SIDE_CONVENTION,
    sampleCount: samples.length,
    dateCount: dateKeys.size,
    baselineRatio: roundMetric(baselineRatio),
    currentRatio: roundMetric(currentRatio),
    baselineBalanceRatio: roundMetric(baselineBalanceRatio),
    currentBalanceRatio: roundMetric(currentBalanceRatio),
    trendSlopePctPerWeek: roundMetric(trendSlopePctPerWeek, 2),
    variability: roundMetric(variability),
    uncertaintyHalfWidth: roundMetric(uncertainty),
    currentRatioLow: currentRatio != null && uncertainty != null ? roundMetric(Math.max(0, currentRatio - uncertainty)) : null,
    currentRatioHigh: currentRatio != null && uncertainty != null ? roundMetric(currentRatio + uncertainty) : null,
    confidence,
    trendStatus,
    currentRatioAsOf: dateKeyForSample(samples.at(-1)),
    isCurrentStale,
    lastUpdatedAt: now,
  };
}

function trainPersonalRecoveryModel({ sessions = [], movementProfile = null, now = Date.now() } = {}) {
  const { samplesByExercise, legacyExcludedSampleCount } = samplesFromSessions(sessions, movementProfile);
  const exercises = {};
  for (const [exerciseId, samples] of samplesByExercise.entries()) {
    if (!samples.length) continue;
    exercises[exerciseId] = trainExerciseModel(exerciseId, samples, now);
  }
  return {
    version: PERSONAL_RECOVERY_MODEL_VERSION,
    trainedAt: now,
    affectedSide: movementProfile?.affectedSide ?? "unsure",
    status: modelStatusFromEntries(exercises),
    minSamples: PERSONAL_MODEL_MIN_SAMPLES,
    minDates: PERSONAL_MODEL_MIN_DATES,
    legacyExcludedSampleCount,
    exercises,
  };
}

function normalizePersonalRecoveryModel(model) {
  if (!model || typeof model !== "object") return null;
  const exercises = {};
  for (const [exerciseId, entry] of Object.entries(model.exercises ?? {})) {
    if (!EXERCISE_BY_ID.has(exerciseId)) continue;
    const confidence = ["collecting", "low", "medium", "high"].includes(entry.confidence) ? entry.confidence : "collecting";
    exercises[exerciseId] = {
      exerciseId,
      sideConvention: entry.sideConvention ?? MOVEMENT_SIDE_CONVENTION,
      sampleCount: Math.max(0, Math.round(entry.sampleCount ?? 0)),
      dateCount: Math.max(0, Math.round(entry.dateCount ?? 0)),
      baselineRatio: roundMetric(entry.baselineRatio),
      currentRatio: roundMetric(entry.currentRatio),
      baselineBalanceRatio: roundMetric(entry.baselineBalanceRatio),
      currentBalanceRatio: roundMetric(entry.currentBalanceRatio),
      trendSlopePctPerWeek: roundMetric(entry.trendSlopePctPerWeek, 2),
      variability: roundMetric(entry.variability),
      uncertaintyHalfWidth: roundMetric(entry.uncertaintyHalfWidth),
      currentRatioLow: roundMetric(entry.currentRatioLow),
      currentRatioHigh: roundMetric(entry.currentRatioHigh),
      confidence,
      trendStatus: normalizedTrendStatus(entry, confidence),
      currentRatioAsOf: typeof entry.currentRatioAsOf === "string" ? entry.currentRatioAsOf : null,
      isCurrentStale: entry.isCurrentStale === true,
      lastUpdatedAt: entry.lastUpdatedAt ?? model.trainedAt ?? null,
    };
  }
  return {
    version: PERSONAL_RECOVERY_MODEL_VERSION,
    trainedAt: model.trainedAt ?? null,
    affectedSide: model.affectedSide ?? "unsure",
    status: ["collecting", "low", "medium", "high"].includes(model.status) ? model.status : modelStatusFromEntries(exercises),
    minSamples: PERSONAL_MODEL_MIN_SAMPLES,
    minDates: PERSONAL_MODEL_MIN_DATES,
    legacyExcludedSampleCount: Math.max(0, Math.round(model.legacyExcludedSampleCount ?? 0)),
    exercises,
  };
}

function personalRecoveryFocusItems(model, limit = 3) {
  return Object.values(model?.exercises ?? {})
    .filter((entry) => entry.currentRatio != null)
    .map((entry) => {
      const progressGap = Math.max(0, 1 - (entry.currentRatio ?? 1));
      // Affected-vs-proper symmetry stays a live signal even once a user passes
      // their own first baseline (currentRatio >= 1 zeroes progressGap), so it
      // keeps improving exercises from collapsing into arbitrary insertion order.
      const balanceGap = entry.currentBalanceRatio == null ? 0 : Math.max(0, 1 - entry.currentBalanceRatio);
      const stagnantTrend = entry.trendSlopePctPerWeek == null ? 0.1 : Math.max(0, -entry.trendSlopePctPerWeek / 10);
      const lowConfidence = entry.confidence === "collecting" ? 0.15 : entry.confidence === "low" ? 0.08 : 0;
      return {
        ...entry,
        progressGap,
        balanceGap,
        focusScore: progressGap * 0.45 + balanceGap * 0.4 + stagnantTrend * 0.2 + lowConfidence,
      };
    })
    .sort((a, b) => b.focusScore - a.focusScore)
    .slice(0, limit);
}

export {
  PERSONAL_MODEL_MIN_DATES,
  PERSONAL_MODEL_MIN_SAMPLES,
  PERSONAL_RECOVERY_MODEL_VERSION,
  normalizePersonalRecoveryModel,
  personalRecoveryFocusItems,
  trainPersonalRecoveryModel,
};
