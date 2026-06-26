const CLINICAL_SCALE_ESTIMATE_VERSION = 5;
const MIN_USABLE_ASSESSMENT_COVERAGE_RATIO = 0.6;

const STANDARD_SCALE_MOVEMENTS = Object.freeze([
  { exerciseId: "eyebrow-raise", label: "Forehead wrinkle", sunnybrookKey: "foreheadWrinkle", efaceKey: "browElevation" },
  { exerciseId: "eye-close", label: "Gentle eye closure", sunnybrookKey: "gentleEyeClosure", efaceKey: "gentleEyeClosure" },
  { exerciseId: "open-smile", label: "Open mouth smile", sunnybrookKey: "openMouthSmile", efaceKey: "smile" },
  { exerciseId: "nose-wrinkle", label: "Snarl / nose wrinkle", sunnybrookKey: "snarl", efaceKey: "midfaceSnarl" },
  { exerciseId: "pucker", label: "Lip pucker", sunnybrookKey: "lipPucker", efaceKey: "lipPucker" },
]);

const QUALITY_USABLE_KEYS = new Set(["strong", "usable"]);
const COACTIVATION_RANK = { low: 0, medium: 1, high: 2 };
const REQUIRED_RESTING_METRICS = Object.freeze([
  { key: "palpebralFissure", label: "Palpebral fissure" },
  { key: "nasolabialMidface", label: "Nasolabial/midface proxy" },
  { key: "oralCommissure", label: "Oral commissure vertical position" },
]);
const REQUIRED_RESTING_METRIC_KEYS = Object.freeze(REQUIRED_RESTING_METRICS.map((metric) => metric.key));
const REQUIRED_RESTING_METRIC_LABELS = Object.freeze(Object.fromEntries(REQUIRED_RESTING_METRICS.map((metric) => [metric.key, metric.label])));
const HOUSE_BRACKMANN_REQUIRED_MOVEMENT_IDS = Object.freeze(["eye-close"]);
const CLINICAL_SCALE_LABELS = Object.freeze({
  houseBrackmann: "House-Brackmann-inspired",
  sunnybrook: "Sunnybrook-style",
  eface: "eFACE-style",
});
const STANDARD_SCALE_MOVEMENT_LABELS = Object.freeze(Object.fromEntries(STANDARD_SCALE_MOVEMENTS.map((movement) => [movement.exerciseId, movement.label])));

const HOUSE_BRACKMANN_LABELS = Object.freeze({
  1: "Normal",
  2: "Mild dysfunction",
  3: "Moderate dysfunction",
  4: "Moderately severe dysfunction",
  5: "Severe dysfunction",
  6: "Total paralysis",
});

function compactNumber(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ratioToPercent(value) {
  return Number.isFinite(value) ? compactNumber(clamp(value, 0, 1) * 100, 1) : null;
}

function scoreQualityKey(score) {
  const quality = score?.captureQuality;
  if (typeof quality === "string") return quality;
  return quality?.key ?? null;
}

function qualityIsUsable(score) {
  const key = scoreQualityKey(score);
  return key == null || QUALITY_USABLE_KEYS.has(key);
}

function movementRatio(score) {
  const progress = score?.initialMovementProgress ?? score?.movementProgress ?? score?.initialBaselineProgress ?? score?.baselineProgress;
  const ratio = progress?.affectedProgressRatio ?? progress?.ratio;
  if (Number.isFinite(ratio)) return ratio;
  if (Number.isFinite(score?.avg)) return score.avg;
  return null;
}

function movementLevelFromRatio(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0.08) return { level: 1, label: "unable/no movement" };
  if (ratio < 0.35) return { level: 2, label: "slight movement" };
  if (ratio < 0.65) return { level: 3, label: "mild excursion" };
  if (ratio < 0.9) return { level: 4, label: "almost complete" };
  return { level: 5, label: "complete" };
}

function scoreByExercise(scores = []) {
  const byId = new Map();
  for (const score of scores) {
    if (score?.exerciseId && !byId.has(score.exerciseId)) byId.set(score.exerciseId, score);
  }
  return byId;
}

function coactivationRiskForScore(score) {
  const risk = score?.movementFeatures?.coactivation?.risk ?? score?.coactivation?.risk ?? null;
  return COACTIVATION_RANK[risk] != null ? risk : null;
}

function coactivationLevel(score) {
  const risk = coactivationRiskForScore(score);
  const rawScore = score?.movementFeatures?.coactivation?.score ?? score?.coactivation?.score;
  if (risk === "high" && Number.isFinite(rawScore) && rawScore >= 0.6) return 3;
  if (risk === "high") return 2;
  if (risk === "medium") return 1;
  return 0;
}

function coactivationLabel(level) {
  if (level >= 3) return "severe";
  if (level === 2) return "moderate";
  if (level === 1) return "mild";
  return "none";
}

function assessmentCoverage(scores = []) {
  const byId = scoreByExercise(scores);
  const movementItems = STANDARD_SCALE_MOVEMENTS.map((movement) => {
    const score = byId.get(movement.exerciseId);
    const ratio = movementRatio(score);
    const hasMovement = Number.isFinite(ratio);
    const usable = hasMovement && qualityIsUsable(score);
    return {
      ...movement,
      ratio: compactNumber(ratio),
      percent: ratioToPercent(ratio),
      quality: scoreQualityKey(score),
      usable,
      missing: !score,
      unusableReason: !score
        ? "missing"
        : !hasMovement
          ? "unscored"
          : qualityIsUsable(score)
            ? null
            : "weak-capture-quality",
      synkinesisLevel: coactivationLevel(score),
      synkinesisRisk: coactivationRiskForScore(score),
    };
  });
  const usableMovementCount = movementItems.filter((item) => item.usable).length;
  const requiredMovementCount = STANDARD_SCALE_MOVEMENTS.length;
  return {
    movementItems,
    requiredMovementCount,
    usableMovementCount,
    ratio: compactNumber(usableMovementCount / requiredMovementCount),
    minimumRatio: MIN_USABLE_ASSESSMENT_COVERAGE_RATIO,
    standardMet: usableMovementCount / requiredMovementCount >= MIN_USABLE_ASSESSMENT_COVERAGE_RATIO,
    missingExerciseIds: movementItems.filter((item) => item.missing).map((item) => item.exerciseId),
    unusableExerciseIds: movementItems.filter((item) => !item.usable).map((item) => item.exerciseId),
  };
}

function estimateEvidence(coverage, restingCompleteness, reasons = []) {
  const estimatedMovementExerciseIds = coverage.movementItems
    .filter((item) => item.usable)
    .map((item) => item.exerciseId);
  const tier = reasons.length
    ? "insufficient-standard-evidence"
    : coverage.usableMovementCount === coverage.requiredMovementCount
      ? "complete-standard-assessment"
      : "minimum-standard-assessment";
  const label = tier === "complete-standard-assessment"
    ? "Complete standard-assessment evidence"
    : tier === "minimum-standard-assessment"
      ? "Minimum standard-assessment evidence"
      : "Insufficient standard-assessment evidence";
  return {
    tier,
    label,
    usableMovementCoverageRatio: coverage.ratio,
    requiredMovementCoverageRatio: MIN_USABLE_ASSESSMENT_COVERAGE_RATIO,
    completeMovementCoverageRatio: 1,
    usableMovementCount: coverage.usableMovementCount,
    requiredMovementCount: coverage.requiredMovementCount,
    estimatedMovementExerciseIds,
    omittedMovementExerciseIds: coverage.unusableExerciseIds,
    calculationUsesOnlyUsableMovements: true,
    restingMetricsAvailable: restingCompleteness.availableMetricKeys.length > 0,
    completeRestingMetrics: restingCompleteness.complete,
    requiredRestingMetricKeys: REQUIRED_RESTING_METRIC_KEYS,
    availableRestingMetricKeys: restingCompleteness.availableMetricKeys,
    missingRestingMetricKeys: restingCompleteness.missingMetricKeys,
    calculationUsesCompleteRestingMetrics: restingCompleteness.complete,
    limitations: reasons,
  };
}

function restingMetricsFrom(session = {}, assessment = null) {
  const metrics = session.restingMetrics ?? assessment?.resting?.metrics ?? assessment?.resting ?? null;
  return metrics?.metrics ? metrics : null;
}

function restingMetric(metrics, key) {
  return metrics?.metrics?.[key] ?? null;
}

function metricAsymmetry(metric) {
  return Number.isFinite(metric?.asymmetryRatio) ? Math.max(0, metric.asymmetryRatio) : null;
}

function restingMetricCompleteness(metrics) {
  const availableMetricKeys = REQUIRED_RESTING_METRICS
    .filter(({ key }) => Number.isFinite(metricAsymmetry(restingMetric(metrics, key))))
    .map(({ key }) => key);
  const availableSet = new Set(availableMetricKeys);
  const missingMetricKeys = REQUIRED_RESTING_METRICS
    .filter(({ key }) => !availableSet.has(key))
    .map(({ key }) => key);
  return {
    complete: missingMetricKeys.length === 0,
    availableMetricKeys,
    missingMetricKeys,
    missingMetricLabels: missingMetricKeys.map((key) => REQUIRED_RESTING_METRICS.find((metric) => metric.key === key)?.label ?? key),
  };
}

function clinicalScaleRestingEvidenceSummary(clinicalScales) {
  const evidence = clinicalScales?.evidence ?? {};
  const hasRestingProvenance = Array.isArray(evidence.requiredRestingMetricKeys)
    || Array.isArray(evidence.availableRestingMetricKeys)
    || Array.isArray(evidence.missingRestingMetricKeys)
    || typeof evidence.completeRestingMetrics === "boolean";
  if (!hasRestingProvenance) return null;
  const requiredKeys = Array.isArray(evidence.requiredRestingMetricKeys) && evidence.requiredRestingMetricKeys.length
    ? evidence.requiredRestingMetricKeys
    : REQUIRED_RESTING_METRIC_KEYS;
  const availableKeys = Array.isArray(evidence.availableRestingMetricKeys) ? evidence.availableRestingMetricKeys : [];
  const missingKeys = Array.isArray(evidence.missingRestingMetricKeys) ? evidence.missingRestingMetricKeys : requiredKeys.filter((key) => !availableKeys.includes(key));
  return {
    requiredCount: requiredKeys.length,
    availableCount: availableKeys.length,
    complete: evidence.completeRestingMetrics === true || (requiredKeys.length > 0 && missingKeys.length === 0 && availableKeys.length >= requiredKeys.length),
    requiredMetricKeys: requiredKeys,
    availableMetricKeys: availableKeys,
    missingMetricKeys: missingKeys,
    missingMetricLabels: missingKeys.map((key) => REQUIRED_RESTING_METRIC_LABELS[key] ?? key),
  };
}

function clinicalScaleMovementLabels(exerciseIds = []) {
  return exerciseIds.map((id) => STANDARD_SCALE_MOVEMENT_LABELS[id] ?? id);
}

function clinicalScaleInputGapSummaries(clinicalScales) {
  if (!clinicalScales || clinicalScales.status !== "estimated") return [];
  const scales = clinicalScales.scales ?? {};
  const completenessByScale = clinicalScales.evidence?.scaleInputCompleteness ?? {};
  return Object.entries(completenessByScale)
    .map(([scaleKey, completeness]) => {
      if (scales[scaleKey] || completeness?.complete !== false) return null;
      const missingExerciseIds = Array.isArray(completeness.missingRequiredExerciseIds)
        ? completeness.missingRequiredExerciseIds
        : [];
      if (!missingExerciseIds.length) return null;
      const missingMovementLabels = clinicalScaleMovementLabels(missingExerciseIds);
      const label = CLINICAL_SCALE_LABELS[scaleKey] ?? scaleKey;
      return {
        scaleKey,
        label,
        missingExerciseIds,
        missingMovementLabels,
        message: `${label} estimate unavailable: requires ${missingMovementLabels.join(", ")}.`,
      };
    })
    .filter(Boolean);
}

function clinicalScaleInputCompletenessSummaries(clinicalScales) {
  if (!clinicalScales || clinicalScales.status !== "estimated") return [];
  const scales = clinicalScales.scales ?? {};
  const completenessByScale = clinicalScales.evidence?.scaleInputCompleteness ?? {};
  return Object.entries(completenessByScale)
    .map(([scaleKey, completeness]) => {
      if (!scales[scaleKey] || completeness?.complete !== false) return null;
      const omittedExerciseIds = Array.isArray(completeness.omittedExerciseIds)
        ? completeness.omittedExerciseIds
        : Array.isArray(completeness.missingRequiredExerciseIds)
          ? completeness.missingRequiredExerciseIds
          : [];
      if (!omittedExerciseIds.length) return null;
      const usedMovementCount = Number.isFinite(completeness.usedMovementCount)
        ? completeness.usedMovementCount
        : Array.isArray(completeness.usedExerciseIds)
          ? completeness.usedExerciseIds.length
          : null;
      const requiredMovementCount = Number.isFinite(completeness.requiredMovementCount)
        ? completeness.requiredMovementCount
        : Number.isFinite(clinicalScales.coverage?.requiredMovementCount)
          ? clinicalScales.coverage.requiredMovementCount
          : null;
      const omittedMovementLabels = clinicalScaleMovementLabels(omittedExerciseIds);
      const countLabel = Number.isFinite(usedMovementCount) && Number.isFinite(requiredMovementCount)
        ? `${usedMovementCount}/${requiredMovementCount} standard movements`
        : "partial standard movements";
      const label = CLINICAL_SCALE_LABELS[scaleKey] ?? scaleKey;
      return {
        scaleKey,
        label,
        usedMovementCount,
        requiredMovementCount,
        omittedExerciseIds,
        omittedMovementLabels,
        shortLabel: `${countLabel}; omitted ${omittedMovementLabels.join(", ")}`,
        message: `${label} input: ${countLabel} used; omitted ${omittedMovementLabels.join(", ")}.`,
      };
    })
    .filter(Boolean);
}

function restingLevel(metric, mildThreshold, severeThreshold, severeScore = 1) {
  const asymmetry = metricAsymmetry(metric);
  if (!Number.isFinite(asymmetry)) return { value: null, asymmetry: null, label: "unavailable" };
  if (asymmetry >= severeThreshold) return { value: severeScore, asymmetry: compactNumber(asymmetry), label: "severe asymmetry" };
  if (asymmetry >= mildThreshold) return { value: 1, asymmetry: compactNumber(asymmetry), label: "asymmetric" };
  return { value: 0, asymmetry: compactNumber(asymmetry), label: "normal symmetry" };
}

function efaceStaticItem(metric) {
  const asymmetry = metricAsymmetry(metric);
  if (!Number.isFinite(asymmetry)) return null;
  return compactNumber(clamp(100 - asymmetry * 220, 0, 100), 1);
}

function movementInputCompleteness(movementItems, coverage) {
  return {
    usedMovementCount: movementItems.length,
    requiredMovementCount: coverage.requiredMovementCount,
    usedExerciseIds: movementItems.map((item) => item.exerciseId),
    omittedExerciseIds: coverage.unusableExerciseIds,
    complete: movementItems.length === coverage.requiredMovementCount,
    calculationUsesOnlyUsableMovements: true,
  };
}

function scaleMovementInputCompleteness(movementItems, requiredExerciseIds = []) {
  const usedExerciseIds = movementItems.map((item) => item.exerciseId);
  const usedSet = new Set(usedExerciseIds);
  const missingRequiredExerciseIds = requiredExerciseIds.filter((exerciseId) => !usedSet.has(exerciseId));
  return {
    requiredExerciseIds,
    usedExerciseIds,
    missingRequiredExerciseIds,
    complete: missingRequiredExerciseIds.length === 0,
  };
}

function normalizedMovementTotal(rawTotal, observedCount, expectedCount, multiplier = 1) {
  if (!observedCount || !expectedCount) return 0;
  return (rawTotal / observedCount) * expectedCount * multiplier;
}

function buildSunnybrookEstimate(movementItems, restingMetrics, coverage) {
  const restingItems = {
    eye: restingLevel(restingMetric(restingMetrics, "palpebralFissure"), 0.08, 0.2, 1),
    cheek: restingLevel(restingMetric(restingMetrics, "nasolabialMidface"), 0.1, 0.3, 2),
    mouth: restingLevel(restingMetric(restingMetrics, "oralCommissure"), 0.08, 0.2, 1),
  };
  const restingRawTotal = Object.values(restingItems).reduce((sum, item) => sum + (item.value ?? 0), 0);
  const restingSymmetryScore = restingRawTotal * 5;
  const voluntaryItems = {};
  let voluntaryRawTotal = 0;
  const expectedMovementCount = coverage.requiredMovementCount;
  for (const item of movementItems) {
    const movementLevel = movementLevelFromRatio(item.ratio);
    voluntaryItems[item.sunnybrookKey] = {
      exerciseId: item.exerciseId,
      label: item.label,
      level: movementLevel.level,
      levelLabel: movementLevel.label,
      movementPercent: item.percent,
    };
    voluntaryRawTotal += movementLevel.level;
  }
  const synkinesisItems = {};
  let synkinesisRawTotal = 0;
  for (const item of movementItems) {
    synkinesisItems[item.sunnybrookKey] = {
      exerciseId: item.exerciseId,
      label: item.label,
      level: item.synkinesisLevel,
      levelLabel: coactivationLabel(item.synkinesisLevel),
      risk: item.synkinesisRisk,
    };
    synkinesisRawTotal += item.synkinesisLevel;
  }
  const voluntaryMovementScore = compactNumber(normalizedMovementTotal(voluntaryRawTotal, movementItems.length, expectedMovementCount, 4), 1);
  const synkinesisScore = compactNumber(normalizedMovementTotal(synkinesisRawTotal, movementItems.length, expectedMovementCount), 1);
  const compositeScore = clamp(voluntaryMovementScore - restingSymmetryScore - synkinesisScore, 0, 100);
  return {
    kind: "sunnybrook-estimate",
    compositeScore: compactNumber(compositeScore),
    restingSymmetryScore,
    voluntaryMovementScore,
    synkinesisScore,
    voluntaryItems,
    restingItems,
    synkinesisItems,
    inputCompleteness: movementInputCompleteness(movementItems, coverage),
    formula: movementItems.length === expectedMovementCount
      ? "voluntaryMovementScore - restingSymmetryScore - synkinesisScore"
      : "usable-movement average normalized to five standard movements, then voluntaryMovementScore - restingSymmetryScore - synkinesisScore",
  };
}

function buildHouseBrackmannEstimate(sunnybrook, movementItems, coverage) {
  const eyeItem = sunnybrook.voluntaryItems.gentleEyeClosure;
  const movementLevels = Object.values(sunnybrook.voluntaryItems).map((item) => item.level);
  const minMovementLevel = Math.min(...movementLevels);
  const averageMovementRatio = movementItems.reduce((sum, item) => sum + clamp(item.ratio ?? 0, 0, 1), 0) / movementItems.length;
  const maxMovementRatio = movementItems.reduce((max, item) => Math.max(max, item.ratio ?? 0), 0);
  const composite = sunnybrook.compositeScore;
  const synkinesis = sunnybrook.synkinesisScore;
  const resting = sunnybrook.restingSymmetryScore;
  let numericGrade = 1;
  let rationale = "Near-normal estimated symmetry, movement, and coactivation profile.";
  if (maxMovementRatio <= 0.08) {
    numericGrade = 6;
    rationale = "No meaningful movement detected in the standard assessment movements.";
  } else if (averageMovementRatio < 0.25 || composite < 35) {
    numericGrade = 5;
    rationale = "Barely perceptible estimated voluntary movement across the standard set.";
  } else if ((eyeItem?.level ?? 1) <= 3 || composite < 50 || resting >= 10 || synkinesis >= 8) {
    numericGrade = 4;
    rationale = "Estimated incomplete eye closure, marked resting asymmetry, or elevated coactivation.";
  } else if (composite < 75 || synkinesis >= 4 || minMovementLevel <= 3) {
    numericGrade = 3;
    rationale = "Obvious estimated weakness or coactivation with preserved movement.";
  } else if (composite < 95 || resting > 0 || synkinesis > 0 || minMovementLevel < 5) {
    numericGrade = 2;
    rationale = "Slight estimated weakness, asymmetry, or quiet-region movement.";
  }
  return {
    kind: "house-brackmann-estimate",
    numericGrade,
    grade: ["I", "II", "III", "IV", "V", "VI"][numericGrade - 1],
    label: HOUSE_BRACKMANN_LABELS[numericGrade],
    rationale,
    basis: {
      sunnybrookCompositeEstimate: sunnybrook.compositeScore,
      eyeClosureLevel: eyeItem?.level ?? null,
      restingSymmetryScore: resting,
      synkinesisScore: synkinesis,
      averageMovementPercent: ratioToPercent(averageMovementRatio),
    },
    inputCompleteness: movementInputCompleteness(movementItems, coverage),
  };
}

function buildEfaceEstimate(movementItems, restingMetrics, coverage) {
  const staticItems = {
    palpebralFissure: efaceStaticItem(restingMetric(restingMetrics, "palpebralFissure")),
    nasolabialFold: efaceStaticItem(restingMetric(restingMetrics, "nasolabialMidface")),
    oralCommissure: efaceStaticItem(restingMetric(restingMetrics, "oralCommissure")),
  };
  const dynamicItems = {};
  const synkinesisItems = {};
  for (const item of movementItems) {
    dynamicItems[item.efaceKey] = {
      exerciseId: item.exerciseId,
      label: item.label,
      score: ratioToPercent(item.ratio),
    };
    synkinesisItems[item.efaceKey] = {
      exerciseId: item.exerciseId,
      label: item.label,
      score: compactNumber(clamp(100 - item.synkinesisLevel * 25, 0, 100), 1),
      level: item.synkinesisLevel,
      levelLabel: coactivationLabel(item.synkinesisLevel),
    };
  }
  const staticValues = Object.values(staticItems).filter(Number.isFinite);
  const dynamicValues = Object.values(dynamicItems).map((item) => item.score).filter(Number.isFinite);
  const synkinesisValues = Object.values(synkinesisItems).map((item) => item.score).filter(Number.isFinite);
  const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const staticScore = average(staticValues);
  const dynamicScore = average(dynamicValues);
  const synkinesisScore = average(synkinesisValues);
  const totalScore = average([staticScore, dynamicScore, synkinesisScore].filter(Number.isFinite));
  return {
    kind: "eface-domain-estimate",
    totalScore: compactNumber(totalScore, 1),
    staticScore: compactNumber(staticScore, 1),
    dynamicScore: compactNumber(dynamicScore, 1),
    synkinesisScore: compactNumber(synkinesisScore, 1),
    staticItems,
    dynamicItems,
    synkinesisItems,
    inputCompleteness: movementInputCompleteness(movementItems, coverage),
    coverageNote: "Mirror maps available standard-assessment proxies into eFACE-like static, dynamic, and synkinesis domains; it is not a clinician-entered eFACE form.",
  };
}

function estimateClinicalScaleGrades(session = {}, assessment = null) {
  const scores = Array.isArray(session.scores) ? session.scores : [];
  const coverage = assessmentCoverage(scores);
  const restingMetrics = restingMetricsFrom(session, assessment);
  const restingCompleteness = restingMetricCompleteness(restingMetrics);
  const reasons = [
    coverage.standardMet ? null : "requires at least 60% usable standard-assessment movement coverage",
    restingCompleteness.complete ? null : `requires complete resting asymmetry metrics from neutral calibration${restingCompleteness.missingMetricLabels.length ? `; missing ${restingCompleteness.missingMetricLabels.join(", ")}` : ""}`,
  ].filter(Boolean);
  const base = {
    version: CLINICAL_SCALE_ESTIMATE_VERSION,
    status: reasons.length ? "insufficient-data" : "estimated",
    minimumStandard: {
      usableMovementCoverageRatio: MIN_USABLE_ASSESSMENT_COVERAGE_RATIO,
      requiresCompleteRestingMetrics: true,
      requiredRestingMetricKeys: REQUIRED_RESTING_METRIC_KEYS,
      clinicianReviewedValidationRequiredForClinicalUse: true,
    },
    coverage: {
      requiredMovementCount: coverage.requiredMovementCount,
      usableMovementCount: coverage.usableMovementCount,
      ratio: coverage.ratio,
      minimumRatio: coverage.minimumRatio,
      standardMet: coverage.standardMet,
      missingExerciseIds: coverage.missingExerciseIds,
      unusableExerciseIds: coverage.unusableExerciseIds,
    },
    evidence: estimateEvidence(coverage, restingCompleteness, reasons),
    caveats: [
      "Estimated from Mirror standard-assessment practice data, not assigned by a clinician.",
      "For self-tracking only; not diagnosis, prognosis, treatment guidance, or a validated endpoint.",
      "Future clinical validation would require clinician-reviewed evidence against the referenced scales.",
    ],
  };
  if (reasons.length) return { ...base, reasons, scales: null };

  const usableMovementItems = coverage.movementItems.filter((item) => item.usable).map((item) => ({
    ...item,
    ratio: item.ratio,
  }));
  const sunnybrook = buildSunnybrookEstimate(usableMovementItems, restingMetrics, coverage);
  const primaryMovementInputCompleteness = movementInputCompleteness(usableMovementItems, coverage);
  const houseBrackmannInputCompleteness = scaleMovementInputCompleteness(usableMovementItems, HOUSE_BRACKMANN_REQUIRED_MOVEMENT_IDS);
  const houseBrackmann = houseBrackmannInputCompleteness.complete
    ? buildHouseBrackmannEstimate(sunnybrook, usableMovementItems, coverage)
    : null;
  return {
    ...base,
    evidence: {
      ...base.evidence,
      scaleInputCompleteness: {
        houseBrackmann: houseBrackmannInputCompleteness,
        sunnybrook: primaryMovementInputCompleteness,
        eface: primaryMovementInputCompleteness,
      },
    },
    reasons: [],
    scales: {
      ...(houseBrackmann ? { houseBrackmann } : {}),
      sunnybrook,
      eface: buildEfaceEstimate(usableMovementItems, restingMetrics, coverage),
    },
  };
}

export {
  CLINICAL_SCALE_ESTIMATE_VERSION,
  HOUSE_BRACKMANN_REQUIRED_MOVEMENT_IDS,
  MIN_USABLE_ASSESSMENT_COVERAGE_RATIO,
  REQUIRED_RESTING_METRIC_KEYS,
  STANDARD_SCALE_MOVEMENTS,
  clinicalScaleInputGapSummaries,
  clinicalScaleInputCompletenessSummaries,
  clinicalScaleMovementLabels,
  clinicalScaleRestingEvidenceSummary,
  estimateClinicalScaleGrades,
};
