import { compactAppDataForStorage } from "../storage";
import { roundMetric } from "../ml/faceMetrics";
import { DEFAULT_DATA } from "./session";

export function normalizeAppData(parsed = {}) {
  const compactParsed = compactAppDataForStorage(parsed);
  const movementProfileHistory = Array.isArray(compactParsed.movementProfileHistory) ? compactParsed.movementProfileHistory : [];
  const inferredInitialProfile = compactParsed.initialMovementProfile ?? movementProfileHistory.at(-1) ?? compactParsed.movementProfile ?? null;
  return {
    ...DEFAULT_DATA,
    ...compactParsed,
    initialMovementProfile: inferredInitialProfile,
    movementProfileHistory,
    prefs: { ...DEFAULT_DATA.prefs, ...(compactParsed.prefs ?? {}) },
  };
}

export function archiveMovementProfile(profile, archivedAt = Date.now()) {
  if (!profile) return null;
  const { neutralLandmarks, noiseFloor, normalization, ...summary } = profile;
  const { neutralFacialTransformationMatrix, ...normalizationSummary } = normalization ?? {};
  const archivedNormalization = normalization
    ? {
      ...normalizationSummary,
      hasNeutralFacialTransformationMatrix: Boolean(neutralFacialTransformationMatrix),
    }
    : null;
  return {
    ...summary,
    ...(archivedNormalization ? { normalization: archivedNormalization } : {}),
    archivedAt,
    hasNeutralLandmarks: Boolean(neutralLandmarks),
    hasNoiseFloor: Boolean(noiseFloor),
  };
}

function averageProfileSymmetry(exercises) {
  const valid = Object.values(exercises ?? {}).map((e) => e.initialSymmetry).filter((v) => v != null);
  return valid.length ? roundMetric(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null;
}

export function mergeMovementProfileRetake(currentProfile, partialProfile) {
  if (!currentProfile || !partialProfile?.exercises) return partialProfile;
  const exercises = { ...(currentProfile.exercises ?? {}), ...partialProfile.exercises };
  const retakenExerciseIds = Object.keys(partialProfile.exercises);
  return {
    ...currentProfile,
    updatedAt: Date.now(),
    lastPartialRetakeAt: Date.now(),
    lastPartialRetakeExerciseIds: retakenExerciseIds,
    lastPartialCalibrationQuality: partialProfile.calibrationQuality,
    exercises,
    initialAvgSymmetry: averageProfileSymmetry(exercises),
  };
}

export function mergeMissingMovementProfileBaselines(currentProfile, partialProfile, exerciseIds = []) {
  if (!currentProfile || !partialProfile?.exercises) return currentProfile;
  const additions = {};
  for (const exerciseId of exerciseIds) {
    if (!currentProfile.exercises?.[exerciseId] && partialProfile.exercises[exerciseId]) {
      additions[exerciseId] = partialProfile.exercises[exerciseId];
    }
  }
  if (Object.keys(additions).length === 0) return currentProfile;
  const exercises = { ...(currentProfile.exercises ?? {}), ...additions };
  return {
    ...currentProfile,
    exercises,
    initialAvgSymmetry: averageProfileSymmetry(exercises),
  };
}
