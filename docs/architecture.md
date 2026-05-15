# Architecture And Project Map

## Runtime Overview

Mirror uses Google MediaPipe Tasks Vision Face Landmarker, configured in `VIDEO` mode with one face and face blendshape output enabled.

At runtime, the app loads:

- `@mediapipe/tasks-vision` version `0.10.21`
- Face Landmarker float16 task model
- GPU delegate when available

For each video frame, MediaPipe returns:

- Dense 3D facial landmarks across the face mesh.
- 52 ARKit-style blendshape coefficients.
- A facial transformation matrix mapping the canonical face model into the detected pose.

MediaPipe handles geometry. Mirror's rehab-oriented symmetry scoring is custom logic built on top of those landmarks. For full algorithm details, see [Model And Scoring](model-and-scoring.md).

## Scoring Pipeline

At a high level:

```text
camera frame
-> MediaPipe Face Landmarker
-> smoothed landmarks + blendshapes + pose matrix
-> neutral calibration
-> face-local normalization
-> exercise-specific movement measurement
-> left/right displacement comparison
-> live symmetry score
```

The core scoring formula compares how much each side moved from neutral:

```text
symmetry = smaller_side_movement / larger_side_movement
```

A score near `1.0` means the two sides moved similarly. A lower score means one side moved less than the other. Per-exercise activation thresholds and per-landmark noise floors keep the score conservative when calibration is missing or movement is too small.

## Project Structure

```text
src/
  App.jsx                       Top-level orchestration: routing, persistence, modals
  main.jsx                      React entry point
  index.css                     Tailwind import + global styles
  storage.js                    IndexedDB persistence + legacy localStorage migration
  domain/
    appData.js                  App data normalization, profile archive/merge
    config.js                   Calibration thresholds, comfort dosing, profile constants
    exercises.js                Exercise catalog
    session.js                  Session/exercise dosing, streak/clock helpers
  ml/
    faceMetrics.js              Calibration, normalization, symmetry, profile, overlay
  hooks/
    useCameraStream.js          getUserMedia lifecycle
    useFaceLandmarker.js        MediaPipe model loader + per-frame ref
  session/
    SessionMode.jsx             Calibrate -> preview -> rest -> hold -> summary
  profile/
    ProfileAssessment.jsx       Onboarding movement profile capture
  trial/
    TrialMode.jsx               Standalone /try demo
  components/
    appViews.jsx                Home, Practice, Journal, Progress, modals, charts
  reports/
    sessionReport.js            Printable session report formatting
  lib/
    speech.js                   Voice prompts
  ui/
    scoreFormatting.js          Percentage + color helpers
docs/
  architecture.md               Architecture and project map
  development.md                Local setup, browser requirements, stack
  features-and-workflows.md     Product features and app flows
  model-and-scoring.md          Technical model and scoring details
  privacy-and-medical.md        Data handling and medical disclaimer
public/                         Static icons
```

## Key Functions

- Exercise catalog: `EXERCISES` in `src/domain/exercises.js`
- MediaPipe loader: `useFaceLandmarker` in `src/hooks/useFaceLandmarker.js`
- Landmark mappings: `EXERCISE_LANDMARK_PAIRS`, `BROW_LANDMARKS`, `NOSE_LANDMARKS` in `src/ml/faceMetrics.js`
- Normalization: `faceFrameNormalize`
- Calibration: `averageLandmarks`, `computeNoiseFloor`, `normalizedFrameDelta`
- Scoring: `computeExerciseSymmetry`, `computePairwiseSymmetry`, `computeBrowSymmetry`, `computeNoseSymmetry`, `computeSymmetry`
- Movement profile: `buildMovementProfile`, `getAdaptiveFocusItems`, `buildPersonalizedDailyPlan`
- Live detection loop: `SessionMode` and `TrialMode`
