import { replayFrameSamples } from "./frameSampleReplay.js";

const POSITIVE_VISIBLE_MOVEMENT_LEVELS = new Set(["trace", "low", "moderate", "strong"]);
const NEGATIVE_VISIBLE_MOVEMENT_LEVELS = new Set(["none"]);
const EXCLUDED_QUALITY_LABELS = new Set(["unusable", "uncertain"]);
const RELIABLE_VISIBLE_MOVEMENT_LEVELS = new Set(["low", "moderate", "strong"]);

function compactRate(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

function frameKey(frame = {}) {
  return [
    frame.id ?? "",
    frame.sessionId ?? "",
    frame.exerciseId ?? "",
    frame.repIndex ?? "",
    frame.sampleIndex ?? "",
    frame.ts ?? "",
  ].join("|");
}

function movementClassFromLabel(label = {}) {
  if (!label || typeof label !== "object") return null;
  if (EXCLUDED_QUALITY_LABELS.has(label.quality)) return null;
  if (POSITIVE_VISIBLE_MOVEMENT_LEVELS.has(label.visibleMovementLevel)) return true;
  if (NEGATIVE_VISIBLE_MOVEMENT_LEVELS.has(label.visibleMovementLevel)) return false;
  return null;
}

function visibleMovementLevelFromLabel(label = {}) {
  if (!label || typeof label !== "object") return null;
  if (EXCLUDED_QUALITY_LABELS.has(label.quality)) return null;
  const level = label.visibleMovementLevel;
  return POSITIVE_VISIBLE_MOVEMENT_LEVELS.has(level) || NEGATIVE_VISIBLE_MOVEMENT_LEVELS.has(level) ? level : null;
}

function extractValidationFrameRecords(records = []) {
  if (!Array.isArray(records)) return [];
  return records
    .map((item) => {
      if (item?.section === "frameSample" && item.record?.frame) {
        return {
          ...item.record.frame,
          id: item.record.id ?? item.record.frame.id ?? null,
          label: item.record.label ?? null,
        };
      }
      if (item?.frame) return { ...item.frame, id: item.id ?? item.frame.id ?? null, label: item.label ?? null };
      if (item?.landmarks || item?.rawLandmarks) return item;
      return null;
    })
    .filter(Boolean);
}

function evaluateValidationFrameSamples(samples = [], options = {}) {
  const replay = replayFrameSamples(samples, options);
  const labels = new Map();
  for (const sample of samples) {
    const label = sample?.label ?? null;
    if (!label) continue;
    labels.set(frameKey(sample), movementClassFromLabel(label));
  }

  let labeledFrameCount = 0;
  let truePositive = 0;
  let trueNegative = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  const thresholdBandCounts = {
    withBands: 0,
    aboveMinimumVisible: 0,
    aboveReliableMovement: 0,
    aboveBaselineTarget: 0,
    belowMinimumVisible: 0,
  };
  for (const frame of replay.frames) {
    const expectedPositive = labels.get(frameKey(frame));
    if (expectedPositive == null) continue;
    labeledFrameCount += 1;
    if (frame.thresholdBands && Number.isFinite(frame.bandPeak)) {
      thresholdBandCounts.withBands += 1;
      const minimumVisible = frame.thresholdBands.minimumVisible;
      const reliableMovement = frame.thresholdBands.reliableMovement;
      const baselineTarget = frame.thresholdBands.baselineTarget;
      if (Number.isFinite(minimumVisible) && frame.bandPeak >= minimumVisible) thresholdBandCounts.aboveMinimumVisible += 1;
      if (Number.isFinite(reliableMovement) && frame.bandPeak >= reliableMovement) thresholdBandCounts.aboveReliableMovement += 1;
      if (Number.isFinite(baselineTarget) && frame.bandPeak >= baselineTarget) thresholdBandCounts.aboveBaselineTarget += 1;
      if (Number.isFinite(minimumVisible) && frame.bandPeak < minimumVisible) thresholdBandCounts.belowMinimumVisible += 1;
    }
    if (expectedPositive && frame.replayScored) truePositive += 1;
    else if (!expectedPositive && !frame.replayScored) trueNegative += 1;
    else if (!expectedPositive && frame.replayScored) falsePositive += 1;
    else if (expectedPositive && !frame.replayScored) falseNegative += 1;
  }

  const positiveCount = truePositive + falseNegative;
  const negativeCount = trueNegative + falsePositive;
  return {
    ...replay,
    validation: {
      labeledFrameCount,
      positiveCount,
      negativeCount,
      truePositive,
      trueNegative,
      falsePositive,
      falseNegative,
      accuracy: compactRate(truePositive + trueNegative, labeledFrameCount),
      falsePositiveRate: compactRate(falsePositive, negativeCount),
      falseNegativeRate: compactRate(falseNegative, positiveCount),
      meanAbsScoreDelta: replay.meanAbsScoreDelta,
      thresholdBandCounts,
    },
  };
}

function percentile(values, pct) {
  const valid = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const idx = Math.min(valid.length - 1, Math.max(0, Math.ceil(valid.length * pct) - 1));
  return Number(valid[idx].toFixed(5));
}

function midpoint(low, high) {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  return Number(((low + high) / 2).toFixed(5));
}

function bandRecommendationFromPeaks({ negativePeaks, positivePeaks, reliablePositivePeaks }) {
  const negativeMax = percentile(negativePeaks, 1);
  const negativeP95 = percentile(negativePeaks, 0.95);
  const positiveP10 = percentile(positivePeaks, 0.1);
  const reliableP10 = percentile(reliablePositivePeaks.length ? reliablePositivePeaks : positivePeaks, 0.1);
  const reliableP75 = percentile(reliablePositivePeaks.length ? reliablePositivePeaks : positivePeaks, 0.75);
  const minimumVisible = negativeMax != null && positiveP10 != null && negativeMax < positiveP10
    ? midpoint(negativeMax, positiveP10)
    : positiveP10;
  const reliableMovement = negativeP95 != null && reliableP10 != null && negativeP95 < reliableP10
    ? midpoint(negativeP95, reliableP10)
    : reliableP10;
  return {
    minimumVisible,
    reliableMovement,
    baselineTarget: reliableP75,
  };
}

function countAtThreshold(peaks, threshold) {
  if (!Number.isFinite(threshold)) return null;
  return peaks.filter((peak) => peak >= threshold).length;
}

function calibrateThresholdsFromValidationSamples(samples = [], options = {}) {
  const minPositive = Math.max(1, Math.round(options.minPositive ?? 3));
  const minNegative = Math.max(1, Math.round(options.minNegative ?? 3));
  const replay = replayFrameSamples(samples, options);
  const labels = new Map();
  for (const sample of samples) {
    const label = sample?.label ?? null;
    if (!label) continue;
    labels.set(frameKey(sample), label);
  }
  const byExercise = new Map();
  for (const frame of replay.frames) {
    const label = labels.get(frameKey(frame));
    const level = visibleMovementLevelFromLabel(label);
    if (!level || !Number.isFinite(frame.bandPeak)) continue;
    const exerciseId = frame.exerciseId ?? "unknown";
    const entry = byExercise.get(exerciseId) ?? {
      exerciseId,
      labeledFrameCount: 0,
      positivePeaks: [],
      negativePeaks: [],
      reliablePositivePeaks: [],
      currentReliableThresholds: [],
    };
    entry.labeledFrameCount += 1;
    if (frame.thresholdBands?.reliableMovement != null) entry.currentReliableThresholds.push(frame.thresholdBands.reliableMovement);
    if (NEGATIVE_VISIBLE_MOVEMENT_LEVELS.has(level)) entry.negativePeaks.push(frame.bandPeak);
    else {
      entry.positivePeaks.push(frame.bandPeak);
      if (RELIABLE_VISIBLE_MOVEMENT_LEVELS.has(level)) entry.reliablePositivePeaks.push(frame.bandPeak);
    }
    byExercise.set(exerciseId, entry);
  }

  const exercises = [...byExercise.values()].map((entry) => {
    const recommendation = bandRecommendationFromPeaks(entry);
    const currentReliable = percentile(entry.currentReliableThresholds, 0.5);
    const hasEnoughData = entry.positivePeaks.length >= minPositive && entry.negativePeaks.length >= minNegative;
    const falsePositiveAtRecommended = countAtThreshold(entry.negativePeaks, recommendation.reliableMovement);
    const falseNegativeAtRecommended = Number.isFinite(recommendation.reliableMovement)
      ? entry.positivePeaks.filter((peak) => peak < recommendation.reliableMovement).length
      : null;
    return {
      exerciseId: entry.exerciseId,
      status: hasEnoughData ? "ready" : "needs-more-labels",
      labeledFrameCount: entry.labeledFrameCount,
      positiveCount: entry.positivePeaks.length,
      negativeCount: entry.negativePeaks.length,
      currentReliableThreshold: currentReliable,
      peakStats: {
        negativeMax: percentile(entry.negativePeaks, 1),
        negativeP95: percentile(entry.negativePeaks, 0.95),
        positiveP10: percentile(entry.positivePeaks, 0.1),
        positiveMedian: percentile(entry.positivePeaks, 0.5),
        reliablePositiveP10: percentile(entry.reliablePositivePeaks.length ? entry.reliablePositivePeaks : entry.positivePeaks, 0.1),
      },
      recommendedThresholdBands: hasEnoughData ? recommendation : null,
      projectedAtRecommended: hasEnoughData ? {
        falsePositiveCount: falsePositiveAtRecommended,
        falseNegativeCount: falseNegativeAtRecommended,
        falsePositiveRate: compactRate(falsePositiveAtRecommended, entry.negativePeaks.length),
        falseNegativeRate: compactRate(falseNegativeAtRecommended, entry.positivePeaks.length),
      } : null,
    };
  }).sort((a, b) => a.exerciseId.localeCompare(b.exerciseId));

  return {
    kind: "mirror-threshold-calibration-report",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    minPositive,
    minNegative,
    summary: {
      exercises: exercises.length,
      readyExercises: exercises.filter((exercise) => exercise.status === "ready").length,
      needsMoreLabels: exercises.filter((exercise) => exercise.status !== "ready").length,
    },
    exercises,
    note: "Recommendations require clinician/user/developer-reviewed labels and should be reviewed before changing production constants.",
  };
}

export {
  calibrateThresholdsFromValidationSamples,
  evaluateValidationFrameSamples,
  extractValidationFrameRecords,
  movementClassFromLabel,
  visibleMovementLevelFromLabel,
};
