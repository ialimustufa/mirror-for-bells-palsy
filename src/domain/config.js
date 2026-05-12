// Daily cadence: short sessions spread N times across waking hours.
export const DAY_START_HOUR = 9;  // 9 AM
export const DAY_END_HOUR = 21;   // 9 PM
export const INTERSTITIAL_SEC = 10;
export const HOLD_SEC = 4;       // fallback hold duration; profiled sessions can use exercise-specific dosing
export const REST_SEC = 2;       // fallback rest duration; serves as entry settle AND between-rep recovery

export const CALIBRATION_FRAMES = 24;
export const CALIBRATION_STABILITY_EPS = 0.006;
export const CALIBRATION_RESET_EPS = 0.018;

export const FACE_CENTER_MAX_OFFSET = 0.12;
export const FACE_TILT_MAX_RAD = 0.12;

export const PROFILE_VERSION = 1;
export const PROFILE_HOLD_SEC = 4;
export const PROFILE_REST_SEC = 2;
export const PROFILE_EXERCISE_NEUTRAL_MIN_FRAMES = 8;
export const PROFILE_REST_RETRY_LIMIT = 1;
export const PROFILE_BASELINE_TOP_FRACTION = 0.2;
export const PROFILE_MIN_SCORED_FRAMES = 8;
export const PROFILE_MIN_ALIGNMENT_RATIO = 0.7;
export const PROFILE_RETAKE_DAYS = 14;
export const PROFILE_HISTORY_LIMIT = 6;
export const PROFILE_STEADY_NOISE_MAX = 0.006;
export const PROFILE_USABLE_NOISE_MAX = 0.018;

export const REPORT_SNAPSHOT_WIDTH = 520;
export const REPORT_SNAPSHOT_QUALITY = 0.9;

export const COMFORT_DOSING = {
  gentle: { key: "gentle", label: "Gentle", repScale: 0.65, minReps: 3, maxReps: 8, holdDeltaSec: -1, minHoldSec: 2, maxHoldSec: 4, restSec: 3 },
  normal: { key: "normal", label: "Normal", repScale: 1, minReps: 4, maxReps: 10, holdDeltaSec: 0, minHoldSec: 2, maxHoldSec: 5, restSec: 2 },
  advanced: { key: "advanced", label: "Advanced", repScale: 1.15, minReps: 5, maxReps: 12, holdDeltaSec: 0, minHoldSec: 2, maxHoldSec: 5, restSec: 2 },
};
