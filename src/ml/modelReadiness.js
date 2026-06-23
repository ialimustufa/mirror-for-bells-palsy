const DEFAULT_MODEL_READINESS_THRESHOLDS = {
  minReviewedFrames: 100,
  minPositiveFrames: 30,
  minNegativeFrames: 30,
  minExercises: 3,
  minFramesPerExercise: 10,
  maxFalsePositiveRate: 0.1,
  maxFalseNegativeRate: 0.15,
  maxMeanAbsScoreDelta: 0.05,
  reviewFalsePositiveRate: 0.2,
  reviewFalseNegativeRate: 0.25,
};

function finiteOrNull(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function rateExceeds(rate, limit) {
  return Number.isFinite(rate) && Number.isFinite(limit) && rate > limit;
}

function normalizeThresholds(overrides = {}) {
  return {
    ...DEFAULT_MODEL_READINESS_THRESHOLDS,
    ...overrides,
  };
}

function validationFromReport(report = {}) {
  return report.validation && typeof report.validation === "object" ? report.validation : report;
}

function summarizeExerciseRisk(exercise = {}, thresholds) {
  const enoughFrames = (exercise.labeledFrameCount ?? 0) >= thresholds.minFramesPerExercise;
  const mildRisk = enoughFrames && (
    rateExceeds(exercise.falsePositiveRate, thresholds.maxFalsePositiveRate) ||
    rateExceeds(exercise.falseNegativeRate, thresholds.maxFalseNegativeRate)
  );
  const highRisk = enoughFrames && (
    rateExceeds(exercise.falsePositiveRate, thresholds.reviewFalsePositiveRate) ||
    rateExceeds(exercise.falseNegativeRate, thresholds.reviewFalseNegativeRate)
  );
  return {
    exerciseId: exercise.exerciseId ?? "unknown",
    labeledFrameCount: exercise.labeledFrameCount ?? 0,
    falsePositiveRate: finiteOrNull(exercise.falsePositiveRate),
    falseNegativeRate: finiteOrNull(exercise.falseNegativeRate),
    mildRisk,
    highRisk,
  };
}

function assessValidationModelReadiness(report = {}, options = {}) {
  const { generatedAt: generatedAtOption, thresholds: thresholdOptions, ...topLevelThresholdOptions } = options;
  const thresholds = normalizeThresholds(thresholdOptions ?? topLevelThresholdOptions);
  const generatedAt = generatedAtOption ?? new Date().toISOString();
  const validation = validationFromReport(report);
  const exercises = Array.isArray(validation.byExercise) ? validation.byExercise : [];
  const exerciseRisks = exercises.map((exercise) => summarizeExerciseRisk(exercise, thresholds));
  const reviewedExerciseCount = exerciseRisks.filter((exercise) => exercise.labeledFrameCount >= thresholds.minFramesPerExercise).length;
  const highRiskExercises = exerciseRisks.filter((exercise) => exercise.highRisk);
  const mildRiskExercises = exerciseRisks.filter((exercise) => exercise.mildRisk);
  const blockingReasons = [];

  if ((validation.labeledFrameCount ?? 0) < thresholds.minReviewedFrames) {
    blockingReasons.push(`needs at least ${thresholds.minReviewedFrames} reviewed frames`);
  }
  if ((validation.positiveCount ?? 0) < thresholds.minPositiveFrames) {
    blockingReasons.push(`needs at least ${thresholds.minPositiveFrames} positive reviewed frames`);
  }
  if ((validation.negativeCount ?? 0) < thresholds.minNegativeFrames) {
    blockingReasons.push(`needs at least ${thresholds.minNegativeFrames} negative reviewed frames`);
  }
  if (reviewedExerciseCount < thresholds.minExercises) {
    blockingReasons.push(`needs reviewed coverage for at least ${thresholds.minExercises} exercises`);
  }

  const aggregateMildRisk = (
    rateExceeds(validation.falsePositiveRate, thresholds.maxFalsePositiveRate) ||
    rateExceeds(validation.falseNegativeRate, thresholds.maxFalseNegativeRate) ||
    rateExceeds(validation.meanAbsScoreDelta, thresholds.maxMeanAbsScoreDelta)
  );
  const aggregateHighRisk = (
    rateExceeds(validation.falsePositiveRate, thresholds.reviewFalsePositiveRate) ||
    rateExceeds(validation.falseNegativeRate, thresholds.reviewFalseNegativeRate)
  );

  let status = "current-scorer-acceptable";
  let recommendation = "keep-current-scorer-and-threshold-workflow";
  let lightweightCorrectionModel = "not-justified";
  const findings = [];

  if (blockingReasons.length) {
    status = "needs-reviewed-data";
    recommendation = "collect-reviewed-validation-data";
    findings.push("Model readiness cannot be evaluated until reviewed validation coverage is sufficient.");
  } else if (aggregateHighRisk || highRiskExercises.length) {
    status = "review-lightweight-correction-model";
    recommendation = "review-lightweight-correction-model-after-threshold-audit";
    lightweightCorrectionModel = "review";
    findings.push("Reviewed replay metrics show high scoring disagreement after the current threshold workflow.");
  } else if (aggregateMildRisk || mildRiskExercises.length) {
    status = "review-thresholds-before-modeling";
    recommendation = "tune-thresholds-and-replay-before-training-model";
    findings.push("Reviewed replay metrics are outside the acceptable band but do not yet justify model training.");
  } else {
    findings.push("Reviewed replay metrics are within the configured acceptable band.");
  }

  return {
    kind: "mirror-model-readiness-report",
    generatedAt,
    status,
    recommendation,
    thresholds,
    validationSummary: {
      labeledFrameCount: validation.labeledFrameCount ?? 0,
      positiveCount: validation.positiveCount ?? 0,
      negativeCount: validation.negativeCount ?? 0,
      reviewedExerciseCount,
      accuracy: finiteOrNull(validation.accuracy),
      falsePositiveRate: finiteOrNull(validation.falsePositiveRate),
      falseNegativeRate: finiteOrNull(validation.falseNegativeRate),
      meanAbsScoreDelta: finiteOrNull(validation.meanAbsScoreDelta),
    },
    modelJustification: {
      lightweightCorrectionModel,
      clinicalDomainLandmarkModel: "not-justified-without-reviewed-landmark-annotations",
    },
    blockingReasons,
    findings,
    exerciseRisks,
    nextActions: blockingReasons.length
      ? ["Collect and review more validation labels before considering model training."]
      : [
        "Review threshold calibration reports before changing production constants.",
        "Only consider a clinical-domain landmark model after reviewed landmark annotations show detector localization errors.",
      ],
  };
}

export { DEFAULT_MODEL_READINESS_THRESHOLDS, assessValidationModelReadiness };
