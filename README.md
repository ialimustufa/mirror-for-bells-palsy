# Mirror

Mirror is a guided facial exercise app built for Bell's palsy recovery practice. It uses the front camera as a mirror, guides the user through short face exercises, and estimates left/right facial movement symmetry in real time.

The app is not a medical diagnostic tool and does not replace a clinician, neurologist, or physical therapist. It is a practice companion for tracking effort, consistency, and movement trends over time.

## What It Does

- Guides exercises for the forehead, eyes, nose, cheeks, mouth, and practical emoji-style facial reactions.
- Uses the camera feed to track facial landmarks during each rep.
- Calibrates a neutral resting face before scoring.
- Offers an optional first-use movement baseline assessment.
- Normalizes landmarks to reduce the effect of camera distance, face position, and small head roll.
- Computes exercise-specific left/right movement symmetry.
- Stores session scores, local report images, journal entries, streaks, and trends.
- Creates a printable session report that can be saved as a PDF for a physiotherapist.

## Tech Stack

- React 19
- Vite 8
- Tailwind CSS 4
- Recharts for progress charts
- Lucide React for icons
- Google MediaPipe Tasks Vision Face Landmarker loaded at runtime from CDN

## Model And Tracking Overview

Mirror uses Google MediaPipe Tasks Vision Face Landmarker, configured in `VIDEO` mode with one face and face blendshape output enabled.

At runtime, the app loads:

- `@mediapipe/tasks-vision` version `0.10.21`
- Face Landmarker float16 task model
- GPU delegate when available

For each video frame, MediaPipe returns:

- Dense 3D facial landmarks across the face mesh
- ARKit-style blendshape coefficients such as brow raise, blink, smile, and nose sneer

The model extracts facial geometry. Mirror's symmetry scoring is custom app logic built on top of those landmarks.

For full details, see [Model And Scoring](docs/model-and-scoring.md).

## Scoring Pipeline

At a high level:

```text
camera frame
-> MediaPipe Face Landmarker
-> smoothed landmarks + blendshapes
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

A score near `1.0` means the two sides moved similarly. A lower score means one side moved less than the other.

## Personal Movement Profile

During onboarding, users can create a local movement profile. This is not a separate trained model. It is a personalized baseline generated from MediaPipe landmarks and Mirror's custom scoring functions.

The profile captures:

- A neutral landmark baseline.
- A short rest-neutral capture before each baseline exercise.
- Per-landmark calibration noise.
- User-reported affected side and comfort level.
- Initial movement metrics for every exercise in the practice library.
- Per-exercise robust baseline movement ranges, initial symmetry, estimated limited side, and activation thresholds.
- Per-exercise baseline quality labels so weak captures can be retaken without treating the whole profile as bad.

The first saved profile is preserved as `initialMovementProfile`, while the current working profile is stored as `movementProfile`:

- Today's default session is prioritized from lower baseline symmetry movements.
- The Practice library preselects the profile-derived focus plan.
- Normal session scoring uses per-exercise activation thresholds from the profile.
- Session reports store both current-baseline progress and first-baseline progress, where `100%` means the matched baseline movement level.
- Session reports include score summaries, per-exercise rep scores, dose settings, baseline progress, high-resolution rep snapshots, and neutral-baseline comparison images.
- Home and Progress show focus recommendations from the baseline profile.
- The selected comfort level adjusts session reps, hold time, and rest time through local dosing rules.
- Baseline quality and age are tracked using a stricter core-quality landmark subset; current thresholds are compatibility defaults until calibration samples are used for retuning.
- Exercises marked `Retake` can be recalibrated individually; partial retakes merge only those movements into the current profile.
- Calibration coaching explains whether the user needs to center, level, hold steadier, or wait for more exercise-rest frames.

## Project Structure

```text
src/App.jsx                  Main app, model loading, session runner, scoring algorithms
src/main.jsx                 React entry point
src/index.css                Global styles and Tailwind import
docs/model-and-scoring.md    Technical model and custom algorithm documentation
public/                      Static icons
```

Most of the product and scoring logic currently lives in `src/App.jsx`. The important sections are:

- Exercise catalog: `EXERCISES`
- MediaPipe configuration: `TASKS_VISION_*` and `FACE_LANDMARKER_MODEL`
- Landmark mappings: `EXERCISE_LANDMARK_PAIRS`, `BROW_LANDMARKS`, `NOSE_LANDMARKS`
- Normalization: `faceFrameNormalize`
- Calibration: `averageLandmarks`, `computeNoiseFloor`, `normalizedFrameDelta`
- Scoring: `computeExerciseSymmetry`, `computePairwiseSymmetry`, `computeBrowSymmetry`, `computeNoseSymmetry`, `computeSymmetry`
- Movement profile: `ProfileAssessment`, `buildMovementProfile`, `getAdaptiveFocusItems`, `buildPersonalizedDailyPlan`, `MovementProfileCard`
- Live detection loop: `SessionMode`

## Local Development

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Run lint:

```bash
npm run lint
```

## Browser Requirements

- A modern browser with camera access
- Permission for front camera use
- WebAssembly support
- WebGL/GPU support recommended for MediaPipe runtime performance

If the model or camera is unavailable, the app still allows unscored guided practice.

## Data And Privacy Notes

- Camera frames are processed in the browser by the MediaPipe model.
- Session records persist exercise scores, timestamps, dose settings, and snapshot counts. Report images are stored locally in IndexedDB as separate image blobs so past physiotherapy PDFs can be regenerated without bloating session JSON.
- Movement profiles include neutral landmark data, noise floor data, and per-exercise baseline metrics.
- The first saved profile is kept as `initialMovementProfile` for long-term recovery comparison; the current `movementProfile` can be updated through full or partial retakes.
- When the full profile is retaken, the previous profile is kept as a compact history record for comparison. Raw neutral landmarks and noise-floor arrays are not duplicated into history.
- When only weak exercise baselines are retaken, those exercise entries are merged into the current profile without archiving or replacing the rest of the baseline.
- App state is persisted locally in IndexedDB under `mirror-db`, with `appState`, `sessions`, and `sessionImages` stores. The legacy `mirror-app-data` localStorage record is migrated once and removed after a successful migration.
- There is no backend service in this codebase.

## Medical Disclaimer

Mirror is designed for guided practice and self-tracking. It does not diagnose Bell's palsy, grade facial paralysis, prescribe treatment, or replace professional care. Users should work with a qualified clinician and stop any exercise that causes pain, strain, or discomfort.
