import { replayFrameSamples } from "./frameSampleReplay.js";

const POSITIVE_VISIBLE_MOVEMENT_LEVELS = new Set(["trace", "low", "moderate", "strong"]);
const NEGATIVE_VISIBLE_MOVEMENT_LEVELS = new Set(["none"]);
const EXCLUDED_QUALITY_LABELS = new Set(["unusable", "uncertain"]);

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

export {
  evaluateValidationFrameSamples,
  extractValidationFrameRecords,
  movementClassFromLabel,
};
