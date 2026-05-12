# Model And Scoring

This document explains how Mirror turns the camera feed into real-time facial exercise symmetry scores.

## Goals

The scoring system is designed to be:

- Exercise-specific: different facial movements are measured with different landmark groups.
- Baseline-relative: movement is measured against the user's own relaxed neutral face.
- Symmetry-focused: the score compares left-side movement with right-side movement.
- Stable enough for practice: small frame jitter, camera shift, and head roll should affect scores as little as practical.
- Conservative: if movement is too small or calibration is missing, the app avoids scoring instead of producing a misleading number.

## Model Family

Mirror uses Google MediaPipe Tasks Vision Face Landmarker, from the MediaPipe face mesh / face landmarker model family.

The app loads the model dynamically in `useFaceLandmarker`:

```js
const TASKS_VISION_VERSION = "0.10.21";
const TASKS_VISION_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/vision_bundle.mjs`;
const TASKS_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const FACE_LANDMARKER_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
```

The model is configured with:

```js
FaceLandmarker.createFromOptions(fileset, {
  baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: "GPU" },
  runningMode: "VIDEO",
  outputFaceBlendshapes: true,
  numFaces: 1,
});
```

For each frame, MediaPipe returns:

- A dense face mesh with 3D landmark coordinates.
- Face blendshape coefficients, such as brow raise, eye blink, smile, and nose sneer.

The ML model only provides geometry and blendshape estimates. The rehab-oriented symmetry score is custom logic in this app.

## Runtime Pipeline

The live session loop runs inside `SessionMode`.

For each animation frame:

1. Read the current video frame.
2. Run `faceLandmarker.detectForVideo(video, timestamp)`.
3. Extract the first face's landmarks and blendshapes.
4. Smooth landmarks using an exponential moving average.
5. During calibration, collect stable neutral frames.
6. During holds, compute exercise-specific symmetry.
7. Accumulate valid scores across the hold window.
8. Save the average rep score and a peak-movement snapshot.

Simplified:

```text
video frame
-> detectForVideo
-> raw landmarks
-> smoothLandmarks
-> calibration or scoring branch
-> live score
-> rep average
-> exercise average
-> session average
```

The first-use movement profile flow uses the same MediaPipe runtime and the same scoring functions inside `ProfileAssessment`. The difference is that it saves baseline metrics instead of producing a normal practice session record.

## Landmark Smoothing

Landmarks are smoothed with an exponential moving average in `smoothLandmarks`.

```text
smoothed = previous + alpha * (current - previous)
```

The app currently uses:

```js
const SMOOTHING_ALPHA = 0.65;
```

Higher alpha means more responsive movement. Lower alpha means steadier but laggier movement.

## Neutral Calibration

Before scoring, the app asks the user to relax their face.

Calibration uses:

```js
const CALIBRATION_FRAMES = 24;
const CALIBRATION_STABILITY_EPS = 0.006;
```

The calibration process:

1. Check that the face is centered and roughly level with `isFaceAligned`.
2. Compare frame-to-frame landmark movement with `normalizedFrameDelta`.
3. Reset the buffer if the face moves too much.
4. Collect 24 stable frames.
5. Average the stable frames into a neutral baseline with `averageLandmarks`.
6. Estimate per-landmark resting jitter with `computeNoiseFloor`.

This produces:

- `neutralRef`: the user's neutral resting landmark positions.
- `noiseRef`: a per-landmark noise floor used to subtract calibration jitter from later displacement measurements.

## Face Alignment

`isFaceAligned` is a lightweight posture gate used during calibration and display.

It checks:

- Nose tip landmark `1` is near the screen center.
- Eye-line angle from landmark `33` to `263` is close to horizontal.

Current thresholds:

```text
center offset < 0.12
absolute eye-line tilt < 0.12 radians
```

This is not full head-pose estimation. It is a practical guardrail to prevent poor calibration.

## Face-Local Normalization

Landmarks are converted into a face-local coordinate frame using `faceFrameNormalize`.

The transform uses:

- Landmark `1` as the origin, near the nose tip.
- Eye-line `33 -> 263` as the local x-axis.
- Inter-ocular distance as scale.

For each landmark:

```text
dx = point.x - nose_tip.x
dy = point.y - nose_tip.y

local_x = dot([dx, dy], eye_axis) / eye_distance
local_y = dot([dx, dy], perpendicular_eye_axis) / eye_distance
local_z = (point.z - nose_tip.z) / eye_distance
```

This removes:

- Translation from the face moving in the frame.
- Roll from the head tilting clockwise or counterclockwise.
- Scale from the user moving closer or farther from the camera.

It does not fully remove yaw or pitch. That would require a stronger 3D transform using MediaPipe's face transform matrix or a solved head-pose model.

## Generic Landmark Pair Symmetry

The default scorer is `computePairwiseSymmetry`.

Each exercise maps left-side landmarks to matching right-side landmarks in `EXERCISE_LANDMARK_PAIRS`.

For each side:

1. Normalize current and neutral landmarks into face-local coordinates.
2. For every landmark in the side's group, compute 3D distance from neutral.
3. Subtract that landmark's neutral noise floor.
4. Sum the remaining displacement.

Formula:

```text
side_movement = sum(max(0, distance(current_i, neutral_i) - noise_i))
```

Then:

```text
peak = max(left_movement, right_movement)
symmetry = min(left_movement, right_movement) / peak
```

If movement is below the threshold, the frame is not scored:

```js
if (peak < 0.02) return null;
```

## Exercise Landmark Groups

The app uses dense landmark groups rather than single points because Bell's palsy movement can be subtle and individual landmark estimates can jitter.

Examples:

- Eyebrow raise and frown: brow ridge and forehead-side landmarks.
- Eye close and wink: full upper/lower eyelid contours.
- Cheek exercises: cheek, zygomatic, and nasolabial landmarks.
- Smile and pucker: mouth corners, outer lip ring, inner lip ring, and nearby chin/lip landmarks.
- Nose wrinkle / nostril flare: nostril rim, ala wing, and nasalis insertion landmarks.

The mapping is defined in `EXERCISE_LANDMARK_PAIRS`.

## Brow-Specific Scoring

Brow exercises use `computeBrowSymmetry` instead of the generic displacement scorer.

Reason: brow movement is mostly vertical, and measuring the brow relative to the upper eyelid is more stable than absolute brow displacement.

For each side:

```text
brow_eye_gap = average_y(upper_eyelid) - average_y(brow)
movement = abs(current_gap - neutral_gap)
```

Then:

```text
symmetry = min(left_movement, right_movement) / max(left_movement, right_movement)
```

The scorer handles both brow raise and gentle frown because it uses the absolute change in brow-to-eye gap.

Current threshold:

```js
if (peak < 0.008) return null;
```

## Nose-Specific Scoring

Nose exercises use `computeNoseSymmetry`.

The app previously treated each nostril side as a single centroid shift. That can miss true nostril flare because the nostril can widen while the whole cluster barely translates.

The current scorer combines two signals:

1. Nostril aperture widening.
2. Upward ala / nasalis lift.

Landmark groups:

```js
midline: [1, 2, 4, 5, 195, 197]
leftRim: [49, 48, 64]
rightRim: [279, 278, 294]
leftAla: [102, 219, 218]
rightAla: [331, 439, 438]
```

For each frame, `noseShape` estimates:

```text
left_width = midline_x - weighted_left_nostril_x
right_width = weighted_right_nostril_x - midline_x
left_y = average_y(left rim + left ala)
right_y = average_y(right rim + right ala)
```

The rim gets double weight because nostril flare primarily opens the nostril rim:

```text
weighted_nostril_x = (rim_x * 2 + ala_x) / 3
```

Movement from neutral:

```text
flare = max(0, current_width - neutral_width)
lift = max(0, neutral_y - current_y)
side_movement = hypot(flare, lift)
```

Then symmetry is the standard ratio:

```text
symmetry = min(left_movement, right_movement) / max(left_movement, right_movement)
```

Current threshold:

```js
if (peak < 0.004) return null;
```

## Fallback Generic Symmetry

If an exercise has no specific landmark mapping or the primary scorer cannot return a value, the app can fall back to `computeSymmetry`.

This fallback uses a small fixed list of bilateral pairs:

```js
const SYMMETRY_PAIRS = [
  [105, 334],
  [70, 300],
  [159, 386],
  [145, 374],
  [50, 280],
  [205, 425],
  [61, 291],
  [37, 267],
  [84, 314],
];
```

It computes the same left/right displacement ratio but weights each pair by total movement.

## Blendshapes

MediaPipe blendshapes are used for activation and snapshot timing, not as the main symmetry score.

Reason: blendshape coefficients can regress toward similar left/right values on asymmetric faces, which can make a genuinely asymmetric movement look more symmetric than it is.

Mirror uses blendshape mappings in `EXERCISE_BLENDSHAPES` to determine whether a movement is being attempted and when to capture the peak-movement snapshot.

Examples:

- `browOuterUpLeft` / `browOuterUpRight`
- `eyeBlinkLeft` / `eyeBlinkRight`
- `noseSneerLeft` / `noseSneerRight`
- `mouthSmileLeft` / `mouthSmileRight`

## Rep, Exercise, And Session Scores

During the hold phase, every valid scored frame contributes equally:

```text
rep_score = average(valid_frame_symmetry_scores_during_hold)
```

For each exercise:

```text
exercise_score = average(rep_scores)
```

For each session:

```text
session_score = average(exercise_scores_with_valid_scores)
```

Frames with no face, no calibration, or motion below the noise threshold are not scored.

## Personal Movement Profile

The first-use baseline layer is implemented as a local movement profile, not as a new trained ML model.

The goal is to personalize the app around the user's own starting point while continuing to use MediaPipe as the landmark model.

### Assessment Flow

`ProfileAssessment` runs a short onboarding assessment:

1. Ask the user to select affected side: `left`, `right`, `both`, or `unsure`.
2. Ask the user to select comfort level: `gentle`, `normal`, or `advanced`.
3. Run the same neutral calibration used by sessions.
4. Guide the user through a small movement set:
   - Eyebrow Raise
   - Soft Eye Closure
   - Nostril Flare
   - Closed Smile
   - Lip Pucker
5. Score each movement with `computeExerciseSymmetry`.
6. Store per-exercise baseline movement metrics.

The assessment exercise set is defined as:

```js
const PROFILE_ASSESSMENT_EXERCISES = [
  "eyebrow-raise",
  "eye-close",
  "nose-wrinkle",
  "closed-smile",
  "pucker",
];
```

### Stored Profile Shape

`buildMovementProfile` creates the persisted profile:

```js
{
  version,
  createdAt,
  affectedSide,
  comfortLevel,
  neutralLandmarks,
  noiseFloor,
  calibrationQuality,
  initialAvgSymmetry,
  exercises: {
    "closed-smile": {
      exerciseId,
      name,
      region,
      frames,
      leftBaselineMovement,
      rightBaselineMovement,
      leftPeakMovement,
      rightPeakMovement,
      initialSymmetry,
      activationThreshold,
      limitedSide
    }
  }
}
```

### Baseline Metrics

For each assessment exercise, Mirror stores:

- Average left-side movement.
- Average right-side movement.
- Peak left-side movement.
- Peak right-side movement.
- Average symmetry during the hold.
- Estimated limited side.
- A personalized activation threshold.

The activation threshold is currently heuristic:

```text
activationThreshold = max(max(left_peak, right_peak) * 0.35, 0.004)
```

This gives future sessions a user-specific movement scale instead of relying only on global constants.

### Limited Side Estimation

The profile estimates which side moved less during the baseline attempt:

```text
if movement difference < 15%:
  limitedSide = "balanced"
else:
  limitedSide = side with lower peak movement
```

This is a practice signal, not a diagnosis. The user-reported affected side remains stored separately because self-report is important context.

### Current Use

The profile is used in normal app behavior after it is saved:

- `buildPersonalizedDailyPlan` prioritizes daily-session exercises with lower initial symmetry and affected-side focus.
- `getAdaptiveFocusItems` exposes the highest-priority movements for Home, Practice, and Progress UI by combining baseline profile data with recent session results.
- `PracticeView` preselects the baseline-derived focus plan instead of starting empty when a profile exists.
- `SessionMode` uses `activationThreshold` to decide whether a hold-frame movement is strong enough to count.
- `buildSessionExercises` applies comfort-level dosing before a session starts.
- Live feedback can show the focused side's current movement relative to baseline.
- Exercise summaries and saved sessions store `baselineProgress`.
- The Progress screen charts movement from baseline over time.
- `MovementProfileCard` shows the current focus list and latest per-exercise progress from saved sessions.
- Retaking a profile archives the previous profile as a compact history record for comparison.
- `profileStatus` classifies baseline quality from calibration noise and prompts retakes after noisy calibration or after 14 days.

### Profile Lifecycle

Movement profiles are treated as a living baseline rather than a permanent record.

The profile status layer uses:

```text
avgNoise <= 0.003 -> Steady
avgNoise <= 0.007 -> Usable
otherwise         -> Noisy
```

Profiles are also considered stale after:

```js
const PROFILE_RETAKE_DAYS = 14;
```

Home and Progress show retake prompts when:

- The baseline calibration was noisy.
- The saved profile is older than the retake window.

When a new baseline is saved, `saveMovementProfile` moves the previous `movementProfile` into `movementProfileHistory`.
The archive strips `neutralLandmarks` and `noiseFloor` before storage because history is only used for trend comparison, not for live scoring.
The current profile remains the only profile used by `SessionMode` for activation thresholds and progress-vs-baseline calculations.

### Comfort-Level Dosing

The onboarding profile stores `comfortLevel` as `gentle`, `normal`, or `advanced`.
This is not an ML prediction. It is a user-selected safety and intensity setting that changes the session copy of each exercise before practice begins.

`applySessionDose` preserves the catalog exercise but creates a session-specific exercise object with:

- `reps`
- `holdSec`
- `restSec`
- `comfortLevel`
- `baseReps`
- `baseHoldSec`

The current dosing table is:

```text
gentle   -> 65% reps, shorter holds, 3s rest
normal   -> catalog reps and holds, 2s rest
advanced -> 115% reps, catalog holds, 2s rest
```

Hold durations are clamped so advanced mode does not push longer sustained contractions by default.
`SessionMode` reads `current.reps`, `current.holdSec`, and `current.restSec`, so scoring and timers follow the same session-specific dose shown in the UI.

### Progress-Vs-Baseline

Progress-vs-baseline is different from symmetry:

```text
symmetry = current left/right balance
baseline progress = current focused-side movement / onboarding focused-side movement
```

Example:

```text
Right smile movement is +18% from baseline.
```

The focused side is resolved in this order:

1. User-reported affected side, if it is `left` or `right`.
2. Exercise-level limited side from the baseline profile.
3. The lower-moving side in the current frame.

The session-level baseline progress is the average of exercise-level baseline progress values.

## Visual Overlay

The overlay is drawn in `drawOverlay`.

It renders:

- A centering ring for posture feedback.
- A faint landmark mesh.
- Feature outlines for face oval, brows, eyes, and lips.
- A dotted anatomical midline.
- Highlighted generic symmetry pairs during hold.

The overlay is visual feedback only. The scoring logic uses the normalized landmark data, not screen pixels.

## Limitations

- The app is not a medical grading system.
- Landmark quality depends on camera quality, lighting, occlusion, and face angle.
- Current normalization removes translation, roll, and scale, but not full yaw or pitch.
- Thresholds are heuristic and tuned for practice feedback, not clinical measurement.
- The app assumes a single visible face.
- Scores should be interpreted as trend and practice feedback, not diagnosis.

## Future Improvements

Potential technical improvements:

- Use MediaPipe facial transformation matrices or solvePnP for stronger 3D head-pose normalization.
- Add exercise-specific direction vectors for cheek, smile, pucker, and eye closure.
- Track affected-side progress separately from symmetry.
- Add calibration quality metrics and warnings.
- Add tests around scorer functions by extracting them from `App.jsx` into a pure module.
- Add optional local-only export/import for progress history.
