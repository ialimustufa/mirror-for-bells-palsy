# Model And Scoring

This document explains how Mirror turns the camera feed into real-time facial exercise symmetry scores and baseline-anchored movement progress metrics.

## Goals

The scoring system is designed to be:

- Exercise-specific: different facial movements are measured with different landmark groups.
- Baseline-relative: movement is measured against the user's own relaxed neutral face.
- Symmetry-focused: the score compares left-side movement with right-side movement.
- Recovery-focused: progress tracks affected-side movement against the user's first saved baseline and compares it with the proper side.
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
  outputFacialTransformationMatrixes: true,
  numFaces: 1,
});
```

For each frame, MediaPipe returns:

- A dense face mesh with 3D landmark coordinates.
- Face blendshape coefficients, such as brow raise, eye blink, smile, and nose sneer.
- A facial transformation matrix that maps the canonical MediaPipe face model into
  the detected face pose.

The ML model only provides geometry and blendshape estimates. The rehab-oriented symmetry score is custom logic in this app.

## Runtime Pipeline

The live session loop runs inside `SessionMode`. The `useFaceLandmarker`
hook exposes an async detector facade. On browsers that support worker
bitmap transfer, MediaPipe loads in `src/workers/faceLandmarker.worker.js` so
the synchronous `detectForVideo` call runs off the UI thread; otherwise the
same facade falls back to the main-thread MediaPipe runtime.

For each animation frame:

1. Read the current video frame.
2. Await `faceLandmarker.detectForVideo(video, timestamp)` through the detector facade.
3. Extract the first face's landmarks, blendshapes, and facial transformation matrix.
4. Smooth landmarks and the transform matrix using an exponential moving average.
5. During calibration, collect stable neutral frames and neutral pose matrices.
6. During holds, compute exercise-specific symmetry in the matrix-normalized face frame.
7. Accumulate valid symmetry and left/right movement values across the hold window.
8. Compare affected-side movement with the working baseline and the first saved baseline.
9. Save the average rep score, movement progress metrics, and a peak-movement snapshot.

Simplified:

```text
video frame
-> detectForVideo
-> raw landmarks + transform matrix
-> smoothLandmarks + smoothFacialTransformationMatrix
-> calibration or scoring branch
-> live score
-> affected-side movement progress
-> rep average
-> exercise average
-> session average
```

The first-use movement profile flow uses the same MediaPipe runtime and the same scoring functions inside `ProfileAssessment`. The difference is that it saves baseline metrics instead of producing a normal practice session record.

## Landmark And Pose Smoothing

Landmarks are smoothed with an exponential moving average in `smoothLandmarks`.
MediaPipe facial transformation matrices use the same EMA in
`smoothFacialTransformationMatrix`. The matrix's `data` field is column-major
(it comes straight from MediaPipe's protobuf `packed_data`, which is filled
from Eigen's column-major storage), so the scorer reads element `(row, col)` as
`data[col * rows + row]`. EMA on rotation matrices is not strictly orthogonal-preserving,
but the alpha is high enough and per-frame pose change small enough that the smoothed
3x3 stays close to a rotation in practice.

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
- `neutralMatrixRef`: the average neutral facial transformation matrix used to normalize
  the neutral frame into the same canonical pose space as live hold frames.

`normalizedFrameDelta` uses `CALIBRATION_DELTA_POINTS`:

```js
const CALIBRATION_DELTA_POINTS = [1, 4, 10, 33, 61, 152, 199, 263, 291];
```

This set intentionally includes mouth corners and chin points so talking, jaw motion,
and facial expression changes are treated as unstable calibration frames.

## Face Alignment

`isFaceAligned` is a lightweight posture gate used during calibration and display.

It checks:

- Nose tip landmark `1` is near the screen center.
- Eye-line angle from landmark `33` to `263` is close to horizontal.

Current thresholds:

```text
center offset < FACE_CENTER_MAX_OFFSET = 0.12
absolute eye-line tilt < FACE_TILT_MAX_RAD = 0.12 radians
```

This is not full head-pose estimation. It is a practical guardrail to prevent poor calibration.
`faceAlignmentFeedback` returns the same boolean plus a user-facing reason such as
"center your face" or "keep your eyes level" so calibration prompts explain what is
blocking capture.

## Hold-Time Head-Pose Gate

`isFaceAligned` is a 2D screen-space check, so it only catches in-plane roll. It can't
see a user who keeps their face centered and eye-line level while yawing or pitching
significantly toward or away from the camera. The 3D pose matrix lets us close that
gap during scoring.

For every hold frame, `computeExerciseSymmetry` computes `headPoseDeviationRad` — the
angle between the current pose matrix and the neutral pose matrix captured at the end
of calibration:

```text
cos(θ) = (trace(R_current · R_neutralᵀ) − 1) / 2
       = (Σ R_current[i,j] · R_neutral[i,j] − 1) / 2     // both rotations are orthogonal
```

If the deviation exceeds `HOLD_HEAD_POSE_MAX_RAD` (≈ 0.20 rad / ~11.5°), the frame is
dropped from scoring. This is well outside normal micro-wobble but well inside what
the 2D gate already permits, so it only fires on real yaw/pitch drift.

The gate is no-op when either matrix is missing, so the fallback eye-line normalization
path is unaffected.

## Face-Local Normalization

Landmarks are converted into a face-local coordinate frame using `faceFrameNormalize`.
When MediaPipe returns a valid facial transformation matrix, Mirror uses it first:

1. Center each landmark at nose tip landmark `1`.
2. Read the 3x3 rotation submatrix from the column-major `data` field. The matrix
   maps canonical face coordinates into the detected face's camera frame, so its
   transpose `R^T` is the inverse rotation that brings camera-frame deltas back
   into the canonical face frame.
3. Flip Y on each landmark delta (MediaPipe normalized landmarks use image-Y-down
   while the pose matrix uses 3D-Y-up), apply `R^T`, then flip Y back.
4. Use the transformed 3D inter-ocular distance between landmarks `33` and `263` as scale.
5. Apply a residual eye-line roll correction in the normalized frame.

This removes:

- Translation from the face moving in the frame.
- Roll from the head tilting clockwise or counterclockwise.
- Scale from the user moving closer or farther from the camera.
- Much of the yaw and pitch foreshortening that affected the older 2D eye-line frame.

If the matrix is missing or malformed, Mirror falls back to the original transform:

- Landmark `1` as the origin, near the nose tip.
- Eye-line `33 -> 263` as the local x-axis.
- 2D inter-ocular distance as scale.

For each landmark:

```text
pose_delta = inverse_face_pose_rotation(point - nose_tip)
scale = distance_3d(pose_delta_eye_33_to_263)

local_x = dot(pose_delta.xy, corrected_eye_axis) / scale
local_y = dot(pose_delta.xy, perpendicular_corrected_eye_axis) / scale
local_z = pose_delta.z / scale
```

Calibration noise uses the same transform buffer, so neutral jitter is measured in
the same pose-normalized coordinate system used during exercise scoring.

## Generic Landmark Pair Symmetry

The default scorer is `computePairwiseSymmetry`.

Each exercise maps raw image-side landmarks to matching landmarks in
`EXERCISE_LANDMARK_PAIRS`. MediaPipe sees the unmirrored camera frame, so image-left
corresponds to the user's anatomical right in the selfie view. `computeExerciseSymmetry`
converts raw image-side displacement into user/anatomical `leftDisp` and `rightDisp`
before any baseline, session, chart, or report code reads it.

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
- Cheek exercises: cheek, zygomatic, nasolabial, and mouth-seal landmarks, including the water swish movement.
- Smile, pucker, and separate vowel shapes: mouth corners, outer lip ring, inner lip ring, and nearby chin/lip landmarks. Vowels are modeled as individual `vowel-a`, `vowel-e`, `vowel-i`, `vowel-o`, and `vowel-u` exercises so each shape gets its own hold time, baseline, and progress history.
- Nose wrinkle / nostril flare: nostril rim, ala wing, and nasalis insertion landmarks.
- Emoji reactions: practical expression combinations such as smile, big smile, surprise, raised brow, wink, smirk, kiss, sad frown, and nose scrunch. These reuse the same region-specific landmark families but are exposed as separate exercises so real-world expressions can have their own baselines and progress history.

The mapping is defined in `EXERCISE_LANDMARK_PAIRS`.

## Direction-Specific Scoring

Some common movements now use `computeDirectionalExerciseSymmetry` instead of
generic 3D displacement magnitude:

- Smile and `vowel-e`/`vowel-i`: outward and slightly upward mouth pull.
- Pucker, kiss, `vowel-o`, and `vowel-u`: inward lip movement toward the midline.
- Cheek puff: outward cheek movement.
- Cheek suck: inward cheek movement.
- Eye close, blink, and wink: decreased eyelid aperture.
- `vowel-a`: increased mouth aperture.

This prevents wrong-direction movement from counting as a valid score. For example,
an inward pucker should not score as a smile, lateral eye drift should not score as
eye closure, and smile-only movement should not score as `vowel-a`.

The directional scorer still returns the same user/anatomical fields used by the
rest of the app:

```text
leftDisp
rightDisp
symmetry
peak
```

Calibration records movement-specific neutral jitter keys such as `smilePull`,
`puckerInward`, `cheekPuffOutward`, `cheekSuckInward`, `eyeClosure`, and
`mouthOpen`. When older profiles do not have these keys, scoring falls back to
the relevant landmark group's neutral noise floor so old backups remain usable.

## Brow-Specific Scoring

Brow raise exercises use `computeBrowSymmetry` instead of the generic displacement scorer.

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

Current threshold:

```js
if (peak < 0.008) return null;
```

`gentle-frown` uses `computeFrownSymmetry` instead. A frown is direction-specific:
it must move the inner brows downward toward the eyelids and/or inward toward the
face midline. This prevents an eyebrow raise from scoring as a successful frown.

## Nose-Specific Scoring

Nose exercises use direction-specific nose scorers.

The app previously treated each nostril side as a single centroid shift. That can miss true nostril flare because the nostril can widen while the whole cluster barely translates. It can also score the wrong movement if an inward pull or upward scrunch falls back to generic displacement scoring.

`Nostril Flare` uses `computeNostrilFlareSymmetry`, which scores outward aperture widening only. `Emoji Nose Scrunch` uses `computeNoseScrunchSymmetry`, which scores upward ala / nasalis lift plus supporting nose-sneer blendshape activation.

Nose exercises return from their specific scorer directly; if the direction-specific scorer returns `null`, the app does not fall back to generic symmetry for that exercise.

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

Nostril flare movement from neutral:

```text
flare = max(0, current_width - neutral_width)
```

The flare axis has the per-side centroid noise floor subtracted before scoring, mirroring the
per-landmark denoising used by the generic pairwise scorer. The centroid jitter for an
N-point average scales as the average single-point noise divided by `sqrt(N)`:

```text
side_noise = mean(noise_floor[side_indices]) / sqrt(N)
flare_d    = max(0, flare - side_noise)
side_movement = flare_d
```

For nose scrunch, upward lift is scored separately:

```text
lift      = max(0, neutral_y - current_y)
lift_d    = max(0, lift - side_noise)
```

The scrunch movement is then fused with a per-side blendshape activation. The MediaPipe
`noseSneerLeft` / `noseSneerRight` coefficients are read from each frame and have their
calibration-time neutral values subtracted so a slightly raised resting sneer doesn't
masquerade as movement:

```text
bs_l = max(0, current.noseSneerLeft  - neutral.noseSneerLeft)
bs_r = max(0, current.noseSneerRight - neutral.noseSneerRight)
side_movement = lift_d + 0.03 * bs_side
```

The 0.03 weight maps a saturating blendshape activation (1.0) to a strong mesh movement
(~0.03 in face-local units), so both scrunch signals contribute on roughly comparable scales. Nostril flare does not use the sneer blendshape because flare is defined as outward widening from rest.

Neutral blendshape values are captured during the same calibration window that builds
the neutral landmark mean and noise floor, so they share the user's at-rest baseline.

Then symmetry is the standard ratio:

```text
symmetry = min(left_movement, right_movement) / max(left_movement, right_movement)
```

Current threshold is adaptive — it floors at a small absolute value but rises with calibration jitter so a noisy session does not slip into "scored" territory after denoising:

```js
const noiseGate = Math.max(leftNoise, rightNoise) * 1.5;
if (peak < Math.max(NOSE_MIN_SIGNAL, noiseGate)) return null;
```

Nostril flare is genuinely small in face-local units (typically 1–2% of inter-ocular
distance), so the gate floor stays low. The noise-scaled term suppresses spurious scoring
when calibration jitter is high.

Nose snapshots and rep scoring use the mesh-derived `symResult.peak` rather than the
`noseSneer*` blendshape gate. That matters because a true nostril flare can be visible in
the rim/ala mesh while the sneer blendshape remains weak.

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

Symmetry is still stored as `scores`, `avg`, and `sessionAvg`, but it is treated as
movement balance/quality. Recovery progress is stored separately so a real increase
in affected-side movement is not hidden by the left/right balance score.

## Personal Movement Profile

The first-use baseline layer is implemented as a local movement profile, not as a new trained ML model.

The goal is to personalize the app around the user's own starting point while continuing to use MediaPipe as the landmark model.

### Assessment Flow

`ProfileAssessment` runs a short onboarding assessment:

1. Ask the user to select affected side: `left`, `right`, `both`, or `unsure`.
2. Ask the user to select comfort level: `gentle`, `normal`, or `advanced`.
3. Run the same global neutral calibration used by sessions.
4. Before each exercise, capture a short exercise-specific rest neutral during the `REST` phase.
5. Guide first-time users through the starter baseline set; full retakes and later add-on captures can cover the full exercise catalog.
6. Score each movement with `computeExerciseSymmetry` against the exercise-specific neutral when enough rest frames were captured, otherwise against the global neutral.
7. Build the persisted baseline from the top movement window instead of a single peak frame.
8. Compute a per-exercise quality label.
9. Store per-exercise baseline movement metrics.

The first-use assessment starts with a shorter starter set, while the full target set still follows the exercise catalog:

```js
const PROFILE_STARTER_ASSESSMENT_EXERCISES = [
  "eyebrow-raise",
  "gentle-frown",
  "eye-close",
  "wink",
  "nose-wrinkle",
  "cheek-puff",
  "cheek-suck",
  "closed-smile",
  "open-smile",
  "pucker",
  "lip-press",
  "vowel-a",
  "vowel-e",
  "vowel-o",
];
const PROFILE_ASSESSMENT_EXERCISES = EXERCISES.map((exercise) => exercise.id);
```

If a saved profile is missing catalog baselines, Home and Progress can prompt the user
to add only the remaining movements. Those add-on captures use the partial baseline
merge path rather than replacing the starter profile.

The profile uses one global neutral calibration pass, then captures a fresh rest-neutral
buffer before every exercise. That gives each baseline movement a local starting point,
which reduces drift from blinking, mouth tension, jaw settling, and fatigue during
starter, full-retake, and add-on assessments. If the rest buffer has fewer than
`PROFILE_EXERCISE_NEUTRAL_MIN_FRAMES`, the scorer falls back to the global neutral.
The rest window can extend once when too few steady rest frames were captured, and the
prompt reports whether the blocker is face alignment, missing face detection, or simply
needing a few more steady frames.

Global calibration also distinguishes small movement from large movement:

```text
delta <= CALIBRATION_STABILITY_EPS -> keep collecting stable frames
delta <= CALIBRATION_RESET_EPS     -> keep collecting, coach the user to hold steadier
delta >  CALIBRATION_RESET_EPS     -> restart the stability window
```

This avoids restarting calibration for tiny webcam jitter while still rejecting clear
talking, smiling, jaw movement, or head motion.

The per-exercise baseline is robust rather than peak-based:

```text
baseline frames = top 20% movement frames during the hold
baseline movement = mean(left/right movement across those frames)
initial symmetry = mean(symmetry across those frames)
```

That value is stored as `leftBaselineMovement`, `rightBaselineMovement`, and
`initialSymmetry`. Raw mean values are also retained as `leftMeanMovement`,
`rightMeanMovement`, and `meanSymmetry` for debugging. This prevents a single shaky
frame from becoming the user's baseline.

Each exercise also stores a `quality` object derived from:

- exercise-rest neutral frames
- hold frames
- scored frames
- face alignment ratio during hold
- peak movement signal

Quality labels are `Strong`, `Usable`, or `Retake`. A low-quality exercise no longer
means the entire profile is bad; it identifies the specific movement that needs review.

### Stored Profile Shape

`buildMovementProfile` creates the persisted profile:

```js
{
  version,
  sideConvention: "user-anatomical-v1",
  createdAt,
  affectedSide,
  comfortLevel,
  neutralLandmarks,
  noiseFloor,
  normalization: {
    method,
    fallbackMethod,
    neutralFacialTransformationMatrix
  },
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

For each assessment exercise, Mirror stores user/anatomical side metrics:

- Average user-left movement.
- Average user-right movement.
- Peak user-left movement.
- Peak user-right movement.
- Average symmetry during the hold.
- Estimated limited side.
- A personalized activation threshold.

The activation threshold is currently heuristic:

```text
activationThreshold = max(max(left_peak, right_peak) * 0.35, 0.004)
```

Nostril flare uses a lower nose-specific threshold because its face-local movement is
much smaller than smile, brow, or cheek exercises. New nose baselines use:

```text
activationThreshold = max(max(left_peak, right_peak) * 0.25, NOSE_PROFILE_THRESHOLD_FLOOR)
```

During sessions, existing saved nose profiles are capped at `NOSE_PROFILE_THRESHOLD_MAX`
so older generic `0.004` thresholds do not block real nostril-flare frames.

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
- `getAdaptiveFocusItems` exposes the highest-priority movements for Home, Practice, and Progress UI by combining baseline profile data, affected-side progress, affected/proper balance, and recent symmetry.
- `PracticeView` preselects the baseline-derived focus plan instead of starting empty when a profile exists.
- `SessionMode` uses `activationThreshold` to decide whether a hold-frame movement is strong enough to count.
- `buildSessionExercises` applies comfort-level dosing before a session starts.
- Live feedback can show the focused side's current movement relative to the working baseline.
- Exercise summaries and saved sessions store legacy `baselineProgress` plus the newer affected-side `movementProgress`.
- Session summaries can open a printable report intended to be saved as a PDF for a physiotherapist.
- The Progress screen charts affected-side movement from the first saved baseline over time.
- `MovementProfileCard` shows the current focus list and latest per-exercise progress from saved sessions.
- Retaking a profile archives the previous profile as a compact history record for comparison.
- `profileStatus` classifies baseline quality from calibration noise and prompts retakes after noisy calibration or after 14 days.

### Profile Lifecycle

Movement profiles are treated as a living baseline rather than a permanent record.

The profile status layer uses `calibrationQuality.coreAvgNoise` when available,
falling back to the legacy full-face `avgNoise` for older saved profiles. New
profiles compute `coreAvgNoise` from a stricter `CORE_QUALITY_POINTS` subset:

```js
const CORE_QUALITY_POINTS = [1, 4, 10, 33, 263];
```

This subset avoids mouth and chin landmarks, so normal lip relaxation and jaw drift
do not directly inflate the profile-quality metric. The current thresholds are
compatibility defaults carried forward from earlier calibration behavior, not a
fully retuned model against a new captured calibration dataset.

```text
coreAvgNoise <= 0.006 -> Steady
coreAvgNoise <= 0.018 -> Usable
otherwise             -> Noisy
```

`calibrationQuality.coreQualityPoints` is persisted with new profiles so reports and
future threshold tuning can identify which landmark subset produced `coreAvgNoise`.

Profiles are also considered stale after:

```js
const PROFILE_RETAKE_DAYS = 14;
```

Home and Progress show retake prompts when:

- The baseline calibration was noisy.
- The saved profile is older than the retake window.
- One or more exercise baselines have `quality.key === "retake"`.

When a new baseline is saved, `saveMovementProfile` moves the previous `movementProfile` into `movementProfileHistory`.
The archive strips `neutralLandmarks` and `noiseFloor` before storage because history is only used for trend comparison, not for live scoring.

The app now separates the first saved baseline from the current working baseline:

- `initialMovementProfile` is the first available baseline. It is kept stable as the
  long-term recovery reference.
- `movementProfile` is the current working baseline. It drives exercise selection,
  activation thresholds, comfort dosing, and current progress calculations.

For existing installs, `normalizeAppData` infers `initialMovementProfile` from the
oldest archived profile when available, otherwise from the current `movementProfile`.
It also migrates legacy image-side profile fields into the current
`sideConvention: "user-anatomical-v1"` shape by swapping left/right movement fields and
limited-side labels exactly once. User-entered `affectedSide` is not flipped because it
already represents the user's anatomical side.

If only specific exercises are weak, the app opens `ProfileAssessment` with
`retakeExerciseIds`. That flow recalibrates neutral pose, reruns only the requested
movements, and merges the resulting exercise entries back into the current
`movementProfile`. A partial retake updates `updatedAt`, `lastPartialRetakeAt`,
`lastPartialRetakeExerciseIds`, `lastPartialCalibrationQuality`, the affected
exercise baselines, and `initialAvgSymmetry`. It does not archive or replace the
whole profile.

Users can also reset selected exercise baselines from the Baseline menu. Reset removes those
exercise entries from both `movementProfile` and `initialMovementProfile`, recalculates
`initialAvgSymmetry`, and records `lastBaselineResetAt` /
`lastBaselineResetExerciseIds`. The app then treats those movements as missing until
they are captured again.

`SessionMode` stores the older focused-side baseline fields for backward compatibility:

- `baselineProgress`: current movement compared with the current working baseline.
- `initialBaselineProgress`: current movement compared with the first saved baseline.

It also stores the preferred recovery metrics:

- `movementProgress`: affected-side movement compared with the current working baseline.
- `initialMovementProgress`: affected-side movement compared with the first saved baseline.

The current profile remains the only profile used by `SessionMode` for activation thresholds.
Progress charts and reports prefer `initialMovementProgress` when available so recovery
trend remains anchored to the first baseline even after later calibration updates.

After the first counted daily session, App opens a journal prompt when no entry exists
for that date. The journal rating is prefilled from `sessionAvg` when available, falling
back to movement progress if the session has no average symmetry. The user can adjust
the rating, mood, and notes before saving.

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

### Pre-Calibration Setup Quality

Before calibration, scored sessions run a short camera setup check. This phase does
not create a clinical score. It records a compact `setupQuality` summary with:

- Face-present frame ratio.
- Centered/level alignment ratio.
- Landmark stability ratio.
- Approximate camera FPS.
- Small-frame brightness and contrast.
- Eye-distance proxy for camera distance.

The setup quality appears in session diagnostics and reports so weak lighting,
distance, or camera stability can be separated from true movement change.

### Standard Assessment Records

Standard assessments are saved separately from daily practice trend records. The
assessment flow uses a fixed set of movements:

```text
eyebrow-raise, eye-close, open-smile, nose-wrinkle, pucker
```

Each assessment stores a compact summary in `assessments` with:

- Rest section: whether a neutral calibration review image is available plus compact resting asymmetry metrics.
- Voluntary movement sections grouped by brow/forehead, eye, midface/nose, and mouth zones.
- Coactivation risk from quiet-region movement recorded during the assessment.
- Source session timestamp so the original report and images can still be opened.

Resting asymmetry metrics are computed from the neutral calibration landmarks in
the same face-local frame used by the scorer. They are practice-review metrics,
not a clinical grade:

- Palpebral fissure: per-side eyelid aperture, with the narrower user side.
- Nasolabial/midface proxy: per-side midface distance from the face midline.
- Oral commissure vertical position: per-side mouth-corner height, with the lower user side.

Only compact rounded metric summaries are saved in `restingMetrics`; raw neutral
landmarks are not stored as part of the assessment summary.

Assessments are also saved as `kind: "assessment"` session records for local image
hydration and PDF generation, but they do not count toward daily practice goals or
practice streaks.

### Session Report Export

`buildSessionReportHtml` converts a saved or just-completed session into a printable clinical review report.

The report includes:

- Session date, time, duration, type, and comfort level.
- Pre-calibration setup quality, when available.
- Average session symmetry.
- Standard assessment sections for rest, voluntary movement, and coactivation when the report is an assessment.
- Resting asymmetry metrics for assessment reports when neutral calibration was available.
- Affected-side movement from the user's first saved baseline, when available.
- Affected-side movement relative to the proper side today versus at baseline, when available.
- Per-exercise average symmetry.
- Per-rep symmetry chips.
- Capture-quality flags, rejected-frame reasons, quiet-region movement summaries, and safety notes when the data suggests caution.
- Target reps, hold seconds, and rest seconds used for each exercise.
- A side-by-side image comparison with the neutral baseline frame on the left and the strongest movement frame on the right.
- Higher-resolution captured rep snapshots when they were available.

`shareSessionReport` opens that report in a new window and triggers the browser print flow.
The intended user action is saving the print output as a PDF and sending that PDF to a physiotherapist.

### Safety Prompt Sources

Safety prompts are conservative practice guidance, not diagnosis. They are generated
locally from:

- Session diagnostics: weak pre-calibration setup, weak or unscored capture quality,
  quiet-region coactivation, and low eye-closure scores that may be relevant to eye
  protection.
- Recent journal notes: text mentions of eye dryness/irritation, pain or strain,
  significant fatigue, and new or worsening symptoms such as sudden worsening,
  numbness, speech changes, vision changes, dizziness, confusion, limb weakness, or
  severe headache.

Journal-note prompts are grouped in Progress and exported as prompt metadata on
clinician-bundle journal records. Obvious negated notes such as "no pain" do not
raise a prompt.

### Clinician Bundle Export

The Progress view can also export a local JSONL clinician bundle. This is a
shareable review package, not a restore backup. The bundle includes:

- Assessment trend rows from compact `assessments` records.
- Recent sessions plus source sessions referenced by assessments.
- Per-exercise progress, capture-quality summaries, rejected-frame reasons, and safety prompts.
- Journal entries, including user notes and local safety prompt metadata for fatigue, dryness, discomfort, or symptoms.
- Selected report image records for included sessions: neutral baseline images and rep snapshots.
- Frame-sample records for included sessions when local data capture was enabled, so a clinician or developer can replay the audit trail.

The full device backup still uses `Export data`; the clinician bundle is a
separate explicit export so sharing remains user-controlled.

The neutral baseline image is captured at the end of session calibration. During the
just-completed summary screen, each exercise keeps that `baselineSnapshot` alongside
peak-movement rep snapshots so the immediate PDF can show a side-by-side comparison.
When the session is saved, those base64 camera images are converted into IndexedDB
`sessionImages` blob records keyed by session, exercise, and role. The compact session
record keeps image references/counts, while past reports hydrate the images on demand.
The data remains local to the browser and is not uploaded.

### Movement Recovery Progress

Movement recovery progress is different from symmetry:

```text
symmetry = current left/right balance
affectedProgressRatio = current affected-side movement / baseline affected-side movement
affectedToProperRatio = current affected-side movement / current proper-side movement
balanceProgressRatio = affectedToProperRatio / baselineAffectedToProperRatio
```

Example:

```text
Right smile movement is +18% from first baseline.
Affected vs proper side is 62% today vs 48% at baseline.
```

The affected side is resolved in this order:

1. User-reported affected side, if it is `left` or `right`.
2. Exercise-level limited side from the baseline profile.
3. The lower-moving side in the current frame.

The opposite side is treated as the proper-side reference for ratio comparison. If the
proper-side baseline is missing or zero, Mirror still reports affected-side progress
but omits proper-side and balance ratios.

`computeMovementProgressFromDisplacements` returns:

```js
{
  sideConvention,
  side,
  referenceSide,
  affectedMovement,
  properMovement,
  affectedToProperRatio,
  baselineAffectedMovement,
  baselineProperMovement,
  baselineAffectedToProperRatio,
  affectedProgressRatio,
  properProgressRatio,
  balanceProgressRatio,
  deltaPct
}
```

Exercise-level movement progress is the average of rep-level movement progress values.
Session-level movement progress is the average of exercise-level movement progress
values. Legacy image-side session progress is tagged as
`sideConvention: "legacy-image-left-v0"` and skipped by charts/adaptive planning because
old saved sessions do not contain enough raw displacement data to recompute corrected
affected/proper ratios.

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
- Matrix-based normalization reduces yaw and pitch effects when MediaPipe returns a
  valid transform matrix; extreme face angles can still distort landmarks.
- If MediaPipe does not return a usable matrix, the scorer falls back to the older
  eye-line roll/scale normalization.
- Thresholds are heuristic and tuned for practice feedback, not clinical measurement.
- The app assumes a single visible face.
- Scores should be interpreted as trend and practice feedback, not diagnosis.

## Future Improvements

Potential technical improvements:

- Add exercise-specific direction vectors for cheek, smile, pucker, and eye closure.
- Add more calibration quality warnings in the live UI.
- Add optional local-only export/import for progress history.
