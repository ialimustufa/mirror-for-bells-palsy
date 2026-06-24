import {
  averageBlendshapes,
  averageFacialTransformationMatrix,
  averageLandmarks,
  computeExerciseSymmetryDiagnostic,
  computeNoiseFloor,
} from "./faceMetrics.js";

function sortSamples(samples = []) {
  return [...samples].filter(Boolean).sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
}

function sampleLandmarks(sample) {
  return Array.isArray(sample?.landmarks) ? sample.landmarks : Array.isArray(sample?.rawLandmarks) ? sample.rawLandmarks : null;
}

function sampleMatrix(sample) {
  return sample?.facialTransformationMatrix ?? sample?.rawFacialTransformationMatrix ?? null;
}

function finalizeCalibration(buffer) {
  const landmarks = buffer.map((sample) => sampleLandmarks(sample)).filter(Boolean);
  if (!landmarks.length) return null;
  const matrices = buffer.map(sampleMatrix).filter(Boolean);
  const neutral = averageLandmarks(landmarks);
  const neutralMatrix = averageFacialTransformationMatrix(matrices);
  return {
    neutral,
    neutralMatrix,
    noiseFloor: computeNoiseFloor(landmarks, neutral, matrices, neutralMatrix),
    neutralBlendshapes: averageBlendshapes(buffer.map((sample) => sample.blendshapes).filter(Boolean)),
    sampleCount: landmarks.length,
  };
}

function replayFrameSamples(samples = [], options = {}) {
  const minCalibrationSamples = Math.max(1, Math.round(options.minCalibrationSamples ?? 3));
  const sorted = sortSamples(samples);
  const calibrationBuffer = [];
  let calibration = null;
  const frames = [];

  for (const sample of sorted) {
    if (sample.phase === "calibrate") {
      calibrationBuffer.push(sample);
      calibration = null;
      continue;
    }
    if (!calibration && calibrationBuffer.length >= minCalibrationSamples) {
      calibration = finalizeCalibration(calibrationBuffer);
    }
    if (sample.phase !== "hold") continue;

    const diagnostic = computeExerciseSymmetryDiagnostic(
      sample.exerciseId,
      sampleLandmarks(sample),
      calibration?.neutral ?? null,
      calibration?.noiseFloor ?? null,
      sample.blendshapes ?? null,
      calibration?.neutralBlendshapes ?? null,
      sampleMatrix(sample),
      calibration?.neutralMatrix ?? null,
      { scoringNoiseMode: sample.scoringNoiseMode ?? sample.scoring?.scoringNoiseMode },
    );
    const stored = sample.scoring ?? {};
    const storedScored = stored.activated === true;
    const replayScored = diagnostic.scored === true;
    const storedScore = Number.isFinite(stored.rawSymmetry) ? stored.rawSymmetry : null;
    const replayScore = Number.isFinite(diagnostic.result?.symmetry) ? diagnostic.result.symmetry : null;
    const storedPeak = Number.isFinite(stored.peak) ? stored.peak : null;
    const replayPeak = Number.isFinite(diagnostic.result?.peak) ? diagnostic.result.peak : null;
    const bandPeak = replayPeak ?? storedPeak;
    const thresholdBands = stored.thresholdBands ?? sample.thresholdBands ?? null;
    const thresholdMargins = thresholdBands && bandPeak != null ? {
      minimumVisible: Number.isFinite(thresholdBands.minimumVisible) ? Number((bandPeak - thresholdBands.minimumVisible).toFixed(5)) : null,
      reliableMovement: Number.isFinite(thresholdBands.reliableMovement) ? Number((bandPeak - thresholdBands.reliableMovement).toFixed(5)) : null,
      baselineTarget: Number.isFinite(thresholdBands.baselineTarget) ? Number((bandPeak - thresholdBands.baselineTarget).toFixed(5)) : null,
    } : null;
    frames.push({
      id: sample.id ?? null,
      sessionId: sample.sessionId ?? null,
      ts: sample.ts ?? null,
      exerciseId: sample.exerciseId,
      repIndex: sample.repIndex,
      sampleIndex: sample.sampleIndex ?? null,
      storedScored,
      replayScored,
      storedDropReason: stored.dropReason ?? stored.reason ?? null,
      replayDropReason: diagnostic.dropReason,
      storedScore,
      replayScore,
      storedPeak,
      replayPeak,
      bandPeak,
      scoreDelta: storedScore != null && replayScore != null ? replayScore - storedScore : null,
      thresholdBands,
      thresholdMargins,
      calibrationSampleCount: calibration?.sampleCount ?? 0,
    });
  }

  const dropReasonCounts = {};
  let scoredAgreement = 0;
  let scoreDeltaSum = 0;
  let scoreDeltaCount = 0;
  for (const frame of frames) {
    if (frame.storedScored === frame.replayScored) scoredAgreement++;
    if (frame.replayDropReason) dropReasonCounts[frame.replayDropReason] = (dropReasonCounts[frame.replayDropReason] ?? 0) + 1;
    if (Number.isFinite(frame.scoreDelta)) {
      scoreDeltaSum += Math.abs(frame.scoreDelta);
      scoreDeltaCount++;
    }
  }

  return {
    sampleCount: sorted.length,
    holdFrameCount: frames.length,
    scoredFrameCount: frames.filter((frame) => frame.replayScored).length,
    scoredAgreementRatio: frames.length ? Number((scoredAgreement / frames.length).toFixed(4)) : null,
    meanAbsScoreDelta: scoreDeltaCount ? Number((scoreDeltaSum / scoreDeltaCount).toFixed(5)) : null,
    dropReasonCounts,
    frames,
  };
}

function extractFrameSamplesFromExportPayload(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.frameSamples)) return payload.frameSamples;
  if (Array.isArray(payload.sessionFrameSamples)) return payload.sessionFrameSamples;
  if (Array.isArray(payload.stores?.sessionFrameSamples)) return payload.stores.sessionFrameSamples;
  if (Array.isArray(payload.stores?.frameSamples)) return payload.stores.frameSamples;
  if (Array.isArray(payload.sessions)) return payload.sessions.flatMap((session) => session.frameSamples ?? []);
  return [];
}

export {
  extractFrameSamplesFromExportPayload,
  replayFrameSamples,
};
