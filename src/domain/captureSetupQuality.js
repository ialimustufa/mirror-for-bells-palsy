const CAPTURE_SETUP_QUALITY_VERSION = 1;
const SETUP_SAMPLE_TARGET = 24;

const SETUP_LABELS = {
  strong: "Strong setup",
  usable: "Usable setup",
  weak: "Setup needs attention",
  collecting: "Checking setup",
};

const OCCLUSION_RISK_LABELS = {
  low: "Low",
  possible: "Possible",
  likely: "Likely",
};

function compactNumber(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function mean(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function ratio(samples, predicate) {
  if (!samples.length) return null;
  return samples.filter(predicate).length / samples.length;
}

function brightnessScore(value) {
  if (!Number.isFinite(value)) return 0.65;
  if (value < 0.18 || value > 0.92) return 0.25;
  if (value < 0.28 || value > 0.84) return 0.6;
  return 1;
}

function distanceScore(value) {
  if (!Number.isFinite(value)) return 0.7;
  if (value < 0.2 || value > 0.55) return 0.35;
  if (value < 0.26 || value > 0.48) return 0.7;
  return 1;
}

function fpsScore(fps) {
  if (!Number.isFinite(fps)) return 0.6;
  if (fps >= 18) return 1;
  if (fps >= 10) return 0.72;
  return 0.35;
}

function summarizeOcclusionRisk({ facePresenceRatio, alignmentRatio, meanBrightness, meanContrast }) {
  let score = 0;
  const signals = [];
  if (Number.isFinite(facePresenceRatio) && facePresenceRatio < 0.85) {
    score += facePresenceRatio < 0.65 ? 0.35 : 0.2;
    signals.push("partial-face");
  }
  if (Number.isFinite(alignmentRatio) && alignmentRatio < 0.75) {
    score += alignmentRatio < 0.55 ? 0.25 : 0.12;
    signals.push("off-center-face");
  }
  if (Number.isFinite(meanBrightness) && (meanBrightness < 0.18 || meanBrightness > 0.9)) {
    score += 0.22;
    signals.push(meanBrightness > 0.9 ? "glare-or-backlighting" : "too-dark");
  }
  if (Number.isFinite(meanContrast) && meanContrast < 0.08) {
    score += 0.25;
    signals.push("low-face-contrast");
  }
  const compactScore = compactNumber(clamp01(score));
  const key = compactScore >= 0.45 ? "likely" : compactScore >= 0.22 ? "possible" : "low";
  return {
    key,
    label: OCCLUSION_RISK_LABELS[key],
    score: compactScore,
    signals,
  };
}

function setupKey(score, sampleCount) {
  if (sampleCount < Math.min(8, SETUP_SAMPLE_TARGET)) return "collecting";
  if (score >= 0.82) return "strong";
  if (score >= 0.58) return "usable";
  return "weak";
}

function setupFps(samples) {
  const times = samples.map((sample) => sample?.ts).filter(Number.isFinite).sort((a, b) => a - b);
  if (times.length < 2) return null;
  const durationMs = times.at(-1) - times[0];
  return durationMs > 0 ? ((times.length - 1) / durationMs) * 1000 : null;
}

function setupActionItems(summary) {
  const items = [];
  if ((summary.facePresenceRatio ?? 0) < 0.85) items.push("Bring your full face into view.");
  if ((summary.alignmentRatio ?? 0) < 0.75) items.push("Center your face and keep your eyes level.");
  if ((summary.stableFrameRatio ?? 0) < 0.65) items.push("Hold the phone/camera steadier before calibration.");
  if (Number.isFinite(summary.meanBrightness) && summary.meanBrightness < 0.28) items.push("Add light to your face before starting.");
  if (Number.isFinite(summary.meanBrightness) && summary.meanBrightness > 0.84) items.push("Reduce glare or bright backlighting.");
  if (summary.occlusionRisk?.key === "likely") items.push("Reduce glare or move hair/glasses away from the face outline.");
  if (Number.isFinite(summary.meanEyeDistance) && summary.meanEyeDistance < 0.26) items.push("Move closer to the camera.");
  if (Number.isFinite(summary.meanEyeDistance) && summary.meanEyeDistance > 0.48) items.push("Move slightly farther from the camera.");
  if (Number.isFinite(summary.fps) && summary.fps < 10) items.push("Close other apps or improve lighting for smoother tracking.");
  return items.slice(0, 3);
}

function summarizeCaptureSetupQuality(samples = []) {
  const validSamples = samples.filter(Boolean);
  const sampleCount = validSamples.length;
  const faceSamples = validSamples.filter((sample) => sample.facePresent);
  const facePresenceRatio = ratio(validSamples, (sample) => sample.facePresent);
  const alignmentRatio = faceSamples.length ? ratio(faceSamples, (sample) => sample.aligned) : null;
  const stableFrameRatio = faceSamples.length
    ? ratio(faceSamples, (sample) => !Number.isFinite(sample.stabilityDelta) || sample.stabilityDelta <= 0.009)
    : null;
  const meanBrightness = mean(validSamples.map((sample) => sample.brightness));
  const meanContrast = mean(validSamples.map((sample) => sample.contrast));
  const meanEyeDistance = mean(faceSamples.map((sample) => sample.eyeDistance));
  const fps = setupFps(validSamples);
  const occlusionRisk = summarizeOcclusionRisk({ facePresenceRatio, alignmentRatio, meanBrightness, meanContrast });
  const score = sampleCount
    ? clamp01(
      (facePresenceRatio ?? 0) * 0.25
      + (alignmentRatio ?? 0) * 0.24
      + (stableFrameRatio ?? 0) * 0.18
      + brightnessScore(meanBrightness) * 0.13
      + distanceScore(meanEyeDistance) * 0.1
      + fpsScore(fps) * 0.1
    )
    : null;
  const key = setupKey(score ?? 0, sampleCount);
  const summary = {
    version: CAPTURE_SETUP_QUALITY_VERSION,
    key,
    label: SETUP_LABELS[key],
    score: compactNumber(score),
    sampleCount,
    targetSampleCount: SETUP_SAMPLE_TARGET,
    facePresenceRatio: compactNumber(facePresenceRatio),
    alignmentRatio: compactNumber(alignmentRatio),
    stableFrameRatio: compactNumber(stableFrameRatio),
    meanBrightness: compactNumber(meanBrightness),
    meanContrast: compactNumber(meanContrast),
    meanEyeDistance: compactNumber(meanEyeDistance),
    fps: compactNumber(fps, 2),
    occlusionRisk,
    ready: sampleCount >= SETUP_SAMPLE_TARGET && key !== "collecting",
  };
  return {
    ...summary,
    actionItems: setupActionItems(summary),
  };
}

export {
  CAPTURE_SETUP_QUALITY_VERSION,
  SETUP_SAMPLE_TARGET,
  summarizeCaptureSetupQuality,
};
