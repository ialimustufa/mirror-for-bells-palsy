const CAPTURE_QUALITY_VERSION = 1;

const QUALITY_LABELS = {
  strong: "Strong",
  usable: "Usable",
  weak: "Weak",
  unscored: "Unscored",
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function compactNumber(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function mergeCounts(items = []) {
  const merged = {};
  for (const item of items) {
    for (const [key, value] of Object.entries(item ?? {})) {
      if (!Number.isFinite(value) || value <= 0) continue;
      merged[key] = (merged[key] ?? 0) + value;
    }
  }
  return Object.keys(merged).length ? merged : null;
}

function qualityKey(score) {
  if (score == null) return "unscored";
  if (score >= 0.82) return "strong";
  if (score >= 0.58) return "usable";
  return "weak";
}

function summarizeCaptureQualityFromFeatures(features = []) {
  const valid = features.filter(Boolean);
  if (!valid.length) return null;
  const observedFrameCount = valid.reduce((sum, item) => sum + (item.observedFrameCount ?? item.holdFrameCount ?? 0), 0);
  const holdFrameCount = valid.reduce((sum, item) => sum + (item.holdFrameCount ?? 0), 0);
  const validScoredFrameCount = valid.reduce((sum, item) => sum + (item.validScoredFrameCount ?? 0), 0);
  const rejectedFrameCount = valid.reduce((sum, item) => sum + (item.rejectedFrameCount ?? 0), 0);
  const alignedWeightedFrames = valid.reduce((sum, item) => sum + ((item.alignedFrameRatio ?? 0) * (item.holdFrameCount ?? 0)), 0);
  const scoreDistribution = valid.map((item) => item.scoreDistribution).filter(Boolean);
  const distributionCount = scoreDistribution.reduce((sum, item) => sum + (item.count ?? 0), 0);
  const medianScore = distributionCount
    ? scoreDistribution.reduce((sum, item) => sum + ((item.median ?? item.mean ?? 0) * (item.count ?? 0)), 0) / distributionCount
    : null;
  const validFrameRatio = observedFrameCount > 0 ? validScoredFrameCount / observedFrameCount : null;
  const alignedFrameRatio = holdFrameCount > 0 ? alignedWeightedFrames / holdFrameCount : null;
  const rejectionRatio = observedFrameCount > 0 ? rejectedFrameCount / observedFrameCount : null;
  const qualityScore = observedFrameCount > 0
    ? clamp01(
      (validFrameRatio ?? 0) * 0.46
      + (alignedFrameRatio ?? 0) * 0.34
      + (medianScore ?? 0) * 0.2
      - (rejectionRatio ?? 0) * 0.18
    )
    : null;
  const key = qualityKey(qualityScore);
  return {
    version: CAPTURE_QUALITY_VERSION,
    key,
    label: QUALITY_LABELS[key],
    score: compactNumber(qualityScore, 4),
    observedFrameCount,
    holdFrameCount,
    validScoredFrameCount,
    rejectedFrameCount,
    validFrameRatio: compactNumber(validFrameRatio, 4),
    alignedFrameRatio: compactNumber(alignedFrameRatio, 4),
    rejectionRatio: compactNumber(rejectionRatio, 4),
    medianScore: compactNumber(medianScore, 4),
    dropReasonCounts: mergeCounts(valid.map((item) => item.dropReasonCounts)),
  };
}

function summarizeSessionCaptureQuality(scores = []) {
  const exerciseQualities = scores.map((score) => (
    score?.captureQuality
    ?? summarizeCaptureQualityFromFeatures(score?.repDiagnostics ?? (score?.movementFeatures ? [score.movementFeatures] : []))
  )).filter(Boolean);
  if (!exerciseQualities.length) return null;
  const observedFrameCount = exerciseQualities.reduce((sum, item) => sum + (item.observedFrameCount ?? 0), 0);
  const holdFrameCount = exerciseQualities.reduce((sum, item) => sum + (item.holdFrameCount ?? 0), 0);
  const validScoredFrameCount = exerciseQualities.reduce((sum, item) => sum + (item.validScoredFrameCount ?? 0), 0);
  const rejectedFrameCount = exerciseQualities.reduce((sum, item) => sum + (item.rejectedFrameCount ?? 0), 0);
  const weightedScore = observedFrameCount
    ? exerciseQualities.reduce((sum, item) => sum + ((item.score ?? 0) * (item.observedFrameCount ?? 0)), 0) / observedFrameCount
    : null;
  const key = qualityKey(weightedScore);
  return {
    version: CAPTURE_QUALITY_VERSION,
    key,
    label: QUALITY_LABELS[key],
    score: compactNumber(weightedScore, 4),
    exerciseCount: exerciseQualities.length,
    observedFrameCount,
    holdFrameCount,
    validScoredFrameCount,
    rejectedFrameCount,
    validFrameRatio: observedFrameCount > 0 ? compactNumber(validScoredFrameCount / observedFrameCount, 4) : null,
    alignedFrameRatio: holdFrameCount > 0
      ? compactNumber(exerciseQualities.reduce((sum, item) => sum + ((item.alignedFrameRatio ?? 0) * (item.holdFrameCount ?? 0)), 0) / holdFrameCount, 4)
      : null,
    rejectionRatio: observedFrameCount > 0 ? compactNumber(rejectedFrameCount / observedFrameCount, 4) : null,
    dropReasonCounts: mergeCounts(exerciseQualities.map((item) => item.dropReasonCounts)),
  };
}

export {
  CAPTURE_QUALITY_VERSION,
  summarizeCaptureQualityFromFeatures,
  summarizeSessionCaptureQuality,
};
