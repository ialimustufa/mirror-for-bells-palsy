import { replayFrameSamples } from "./frameSampleReplay.js";

const POSITIVE_VISIBLE_MOVEMENT_LEVELS = new Set(["trace", "low", "moderate", "strong"]);
const NEGATIVE_VISIBLE_MOVEMENT_LEVELS = new Set(["none"]);
const EXCLUDED_QUALITY_LABELS = new Set(["unusable", "uncertain"]);
const RELIABLE_VISIBLE_MOVEMENT_LEVELS = new Set(["low", "moderate", "strong"]);
const HOUSE_BRACKMANN_GRADE_NUMBERS = Object.freeze({
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
});

function compactRate(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

function compactNumber(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function createValidationCounts() {
  return {
    labeledFrameCount: 0,
    truePositive: 0,
    trueNegative: 0,
    falsePositive: 0,
    falseNegative: 0,
  };
}

function recordValidationPrediction(counts, expectedPositive, replayScored) {
  counts.labeledFrameCount += 1;
  if (expectedPositive && replayScored) counts.truePositive += 1;
  else if (!expectedPositive && !replayScored) counts.trueNegative += 1;
  else if (!expectedPositive && replayScored) counts.falsePositive += 1;
  else if (expectedPositive && !replayScored) counts.falseNegative += 1;
}

function summarizeValidationCounts(counts) {
  const positiveCount = counts.truePositive + counts.falseNegative;
  const negativeCount = counts.trueNegative + counts.falsePositive;
  return {
    labeledFrameCount: counts.labeledFrameCount,
    positiveCount,
    negativeCount,
    truePositive: counts.truePositive,
    trueNegative: counts.trueNegative,
    falsePositive: counts.falsePositive,
    falseNegative: counts.falseNegative,
    accuracy: compactRate(counts.truePositive + counts.trueNegative, counts.labeledFrameCount),
    falsePositiveRate: compactRate(counts.falsePositive, negativeCount),
    falseNegativeRate: compactRate(counts.falseNegative, positiveCount),
  };
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

function extractAssessmentClinicalScaleRecords(records = []) {
  if (!Array.isArray(records)) return [];
  return records
    .map((item) => {
      if (item?.section === "assessmentClinicalScale" && item.record) return item.record;
      if (item?.kind === "assessment-clinical-scale" || item?.estimate?.scales || item?.clinicalScales?.scales) return item;
      return null;
    })
    .filter(Boolean);
}

function numericLabel(value) {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

function clinicalScaleLabels(record = {}) {
  const label = record.label ?? {};
  return {
    houseBrackmann: parseHouseBrackmannGrade(label.houseBrackmannGrade),
    sunnybrookComposite: numericLabel(label.sunnybrookComposite),
    efaceTotal: numericLabel(label.efaceTotal),
    efaceStatic: numericLabel(label.efaceStatic),
    efaceDynamic: numericLabel(label.efaceDynamic),
    efaceSynkinesis: numericLabel(label.efaceSynkinesis),
  };
}

function clinicalScaleEstimate(record = {}) {
  const estimate = record.estimate ?? record.clinicalScales ?? {};
  const scales = estimate.status === "estimated" ? estimate.scales ?? {} : estimate.scales ?? estimate;
  const houseBrackmann = scales.houseBrackmann ?? {};
  const sunnybrook = scales.sunnybrook ?? {};
  const eface = scales.eface ?? {};
  return {
    houseBrackmann: parseHouseBrackmannGrade(houseBrackmann.numericGrade ?? houseBrackmann.grade),
    sunnybrookComposite: numericLabel(sunnybrook.compositeScore),
    efaceTotal: numericLabel(eface.totalScore),
    efaceStatic: numericLabel(eface.staticScore),
    efaceDynamic: numericLabel(eface.dynamicScore),
    efaceSynkinesis: numericLabel(eface.synkinesisScore),
  };
}

function hasAnyClinicalLabel(labels = {}) {
  return Object.values(labels).some((value) => value != null);
}

function createAgreementAccumulator(scale, agreementLabel, tolerance) {
  return {
    scale,
    agreementLabel,
    tolerance,
    labeledCount: 0,
    missingEstimateCount: 0,
    exactMatchCount: 0,
    withinToleranceCount: 0,
    absoluteDeltas: [],
    mismatches: [],
  };
}

function recordAgreementCase(accumulator, record, estimateValue, labelValue) {
  if (labelValue == null) return;
  if (estimateValue == null) {
    accumulator.missingEstimateCount += 1;
    return;
  }
  const delta = estimateValue - labelValue;
  const absDelta = Math.abs(delta);
  accumulator.labeledCount += 1;
  accumulator.absoluteDeltas.push(absDelta);
  if (absDelta === 0) accumulator.exactMatchCount += 1;
  if (absDelta <= accumulator.tolerance) accumulator.withinToleranceCount += 1;
  if (absDelta > accumulator.tolerance) {
    accumulator.mismatches.push({
      assessmentId: record.id ?? null,
      sessionId: record.sessionId ?? null,
      estimate: compactNumber(estimateValue, 2),
      label: compactNumber(labelValue, 2),
      delta: compactNumber(delta, 2),
    });
  }
}

function summarizeAgreement(accumulator, options = {}) {
  const minAgreementRate = options.minAgreementRate ?? 0.8;
  const minReviewedAssessments = Math.max(1, Math.round(options.minReviewedAssessments ?? 5));
  const comparableCount = accumulator.labeledCount;
  const denominator = comparableCount + accumulator.missingEstimateCount;
  const agreementRate = compactRate(accumulator.withinToleranceCount, denominator);
  const exactAgreementRate = compactRate(accumulator.exactMatchCount, denominator);
  const meanAbsDelta = accumulator.absoluteDeltas.length
    ? accumulator.absoluteDeltas.reduce((sum, value) => sum + value, 0) / accumulator.absoluteDeltas.length
    : null;
  const blockingReasons = [];
  if (denominator < minReviewedAssessments) blockingReasons.push(`needs at least ${minReviewedAssessments} reviewed assessment labels`);
  if (agreementRate == null || agreementRate < minAgreementRate) blockingReasons.push(`needs at least ${Math.round(minAgreementRate * 100)}% ${accumulator.agreementLabel}`);
  return {
    scale: accumulator.scale,
    agreementLabel: accumulator.agreementLabel,
    tolerance: accumulator.tolerance,
    labeledCount: denominator,
    comparableCount,
    missingEstimateCount: accumulator.missingEstimateCount,
    exactMatchCount: accumulator.exactMatchCount,
    withinToleranceCount: accumulator.withinToleranceCount,
    exactAgreementRate,
    agreementRate,
    meanAbsDelta: compactNumber(meanAbsDelta, 2),
    meetsMinimumStandard: blockingReasons.length === 0,
    blockingReasons,
    mismatches: accumulator.mismatches.slice(0, 20),
  };
}

function evaluateClinicalScaleEstimates(records = [], options = {}) {
  const assessmentRecords = extractAssessmentClinicalScaleRecords(records);
  const minAgreementRate = options.minAgreementRate ?? 0.8;
  const minReviewedAssessments = Math.max(1, Math.round(options.minReviewedAssessments ?? 5));
  const sunnybrookTolerance = Number.isFinite(options.sunnybrookTolerance) ? options.sunnybrookTolerance : 10;
  const efaceTolerance = Number.isFinite(options.efaceTolerance) ? options.efaceTolerance : 10;
  const agreementOptions = { minAgreementRate, minReviewedAssessments };
  const accumulators = {
    houseBrackmann: createAgreementAccumulator("houseBrackmann", "within-one-grade agreement", 1),
    sunnybrookComposite: createAgreementAccumulator("sunnybrookComposite", `within-${sunnybrookTolerance}-point agreement`, sunnybrookTolerance),
    efaceTotal: createAgreementAccumulator("efaceTotal", `within-${efaceTolerance}-point agreement`, efaceTolerance),
    efaceStatic: createAgreementAccumulator("efaceStatic", `within-${efaceTolerance}-point agreement`, efaceTolerance),
    efaceDynamic: createAgreementAccumulator("efaceDynamic", `within-${efaceTolerance}-point agreement`, efaceTolerance),
    efaceSynkinesis: createAgreementAccumulator("efaceSynkinesis", `within-${efaceTolerance}-point agreement`, efaceTolerance),
  };
  let reviewedAssessmentCount = 0;
  let estimatedAssessmentCount = 0;
  for (const record of assessmentRecords) {
    const labels = clinicalScaleLabels(record);
    const estimate = clinicalScaleEstimate(record);
    if (hasAnyClinicalLabel(labels)) reviewedAssessmentCount += 1;
    if (Object.values(estimate).some((value) => value != null)) estimatedAssessmentCount += 1;
    for (const [scale, accumulator] of Object.entries(accumulators)) {
      recordAgreementCase(accumulator, record, estimate[scale], labels[scale]);
    }
  }

  const byScale = Object.fromEntries(
    Object.entries(accumulators).map(([scale, accumulator]) => [scale, summarizeAgreement(accumulator, agreementOptions)]),
  );
  const primaryScales = ["houseBrackmann", "sunnybrookComposite", "efaceTotal"];
  const evaluatedPrimaryScales = primaryScales.filter((scale) => byScale[scale].labeledCount > 0);
  const readyPrimaryScales = primaryScales.filter((scale) => byScale[scale].meetsMinimumStandard);
  const blockingReasons = [];
  if (reviewedAssessmentCount < minReviewedAssessments) {
    blockingReasons.push(`needs at least ${minReviewedAssessments} reviewed clinical-scale assessments`);
  }
  for (const scale of primaryScales) {
    if (!byScale[scale].meetsMinimumStandard) blockingReasons.push(`${scale}: ${byScale[scale].blockingReasons.join("; ")}`);
  }

  return {
    kind: "mirror-clinical-scale-validation-report",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    standard: {
      minAgreementRate,
      minReviewedAssessments,
      houseBrackmannAgreement: "estimate must be within one House-Brackmann grade of the reviewed label",
      sunnybrookTolerance,
      efaceTolerance,
    },
    summary: {
      assessmentClinicalScaleRecords: assessmentRecords.length,
      reviewedAssessmentCount,
      estimatedAssessmentCount,
      primaryScaleCount: primaryScales.length,
      evaluatedPrimaryScaleCount: evaluatedPrimaryScales.length,
      readyPrimaryScaleCount: readyPrimaryScales.length,
      meetsMinimumStandard: blockingReasons.length === 0,
      readyForClinicalFacingScoring: blockingReasons.length === 0 && readyPrimaryScales.length === primaryScales.length,
    },
    blockingReasons,
    byScale,
    note: "This report evaluates Mirror estimates against reviewed clinical labels. It does not make the estimates clinician-assigned grades.",
  };
}

function evaluateValidationFrameSamples(samples = [], options = {}) {
  const replay = replayFrameSamples(samples, options);
  const labels = new Map();
  for (const sample of samples) {
    const label = sample?.label ?? null;
    if (!label) continue;
    labels.set(frameKey(sample), movementClassFromLabel(label));
  }

  const aggregateCounts = createValidationCounts();
  const byExerciseCounts = new Map();
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
    recordValidationPrediction(aggregateCounts, expectedPositive, frame.replayScored);
    const exerciseId = frame.exerciseId ?? "unknown";
    const exerciseCounts = byExerciseCounts.get(exerciseId) ?? createValidationCounts();
    recordValidationPrediction(exerciseCounts, expectedPositive, frame.replayScored);
    byExerciseCounts.set(exerciseId, exerciseCounts);
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
  }

  return {
    ...replay,
    validation: {
      ...summarizeValidationCounts(aggregateCounts),
      meanAbsScoreDelta: replay.meanAbsScoreDelta,
      thresholdBandCounts,
      byExercise: [...byExerciseCounts.entries()]
        .map(([exerciseId, counts]) => ({ exerciseId, ...summarizeValidationCounts(counts) }))
        .sort((a, b) => a.exerciseId.localeCompare(b.exerciseId)),
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
  evaluateClinicalScaleEstimates,
  evaluateValidationFrameSamples,
  extractAssessmentClinicalScaleRecords,
  extractValidationFrameRecords,
  movementClassFromLabel,
  visibleMovementLevelFromLabel,
};
