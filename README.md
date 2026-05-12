# Mirror for Bell's Palsy

A daily companion for facial retraining after Bell's palsy. Mirror guides you through gentle facial exercises, tracks your face through the webcam with MediaPipe Face Landmarker, and produces a real-time left/right symmetry score against your own captured neutral baseline — so you can see exactly where the affected side needs attention. Everything runs locally in the browser; no video leaves your device.

> ⚠️ Mirror supports your practice but does not replace medical care. Work with your neurologist and physical therapist on your specific protocol. Stop any exercise that causes pain, strain, or discomfort.

## The Back Story

> Last week, I hit rock bottom. I was diagnosed with Bell's Palsy, and my right face got paralysed; I honestly wondered how I was going to get through it! I vibe-coded my way out and built an AI face tracking app that guides my facial exercises, measures facial symmetry in real time, and tracks my progress.

More information on [this LinkedIn post](https://www.linkedin.com/posts/ialimustufa_last-week-i-hit-rock-bottom-i-was-diagnosed-ugcPost-7458136477626093570-PIFK).

## Highlights

- Guided exercises across forehead, eyes, nose, cheeks, mouth, and emoji-style facial reactions.
- Neutral calibration with frame-stability gating and per-landmark noise estimation.
- Exercise-specific symmetry scoring against the user's own baseline.
- Optional personal movement profile that personalizes dosing, focus, and progress tracking.
- Comfort levels that adjust reps, hold time, and rest time.
- Local persistence of sessions, journal entries, streaks, trends, and rep snapshots.
- Printable session report that can be saved as a PDF for a physiotherapist.
- A live `/trial` demo page with face mesh, color-coded regions, ranked muscle activations, and an expression detector — useful for showing how the underlying tracker behaves.

## Live Demo Page (`/trial`)

The `/trial` route is a standalone showcase of the underlying face tracker, independent of the practice loop. It renders:

- The full 478-point MediaPipe mesh, color-coded by region (gold brows, coral eyes, amber iris discs, lavender nose, pink lips, sage cheeks).
- Per-region activation glows that pulse on the camera as the matching muscle engages.
- A ranked **Active muscles** panel with cap-scaled L/R activation bars, peak-hold ticks, and a live "We see" expression chip (smile, surprise, wink, brow raise, frown, eyes closed, lip press, cheek squint, jaw open).
- A face-position panel showing posture state and head drift in degrees.

It is intentionally minimal — no scoring lock, no session machinery — so a first-time visitor can see the tracker working immediately.

## Tech Stack

- React 19
- Vite 8
- Tailwind CSS 4
- Recharts for progress charts
- Lucide React for icons
- Google MediaPipe Tasks Vision Face Landmarker, loaded at runtime from CDN
- IndexedDB for local persistence of sessions, profiles, and report images

## Model And Tracking Overview

Mirror uses Google MediaPipe Tasks Vision Face Landmarker, configured in `VIDEO` mode with one face and face blendshape output enabled.

At runtime, the app loads:

- `@mediapipe/tasks-vision` version `0.10.21`
- Face Landmarker float16 task model
- GPU delegate when available

For each video frame, MediaPipe returns:

- Dense 3D facial landmarks across the face mesh (478 points)
- 52 ARKit-style blendshape coefficients (brow raise, blink, smile, sneer, jaw open, …)
- A facial transformation matrix mapping the canonical face model into the detected pose

MediaPipe handles geometry; Mirror's rehab-oriented symmetry scoring is custom logic built on top of those landmarks. For full details, see [Model And Scoring](docs/model-and-scoring.md).

## Scoring Pipeline

At a high level:

```text
camera frame
-> MediaPipe Face Landmarker
-> smoothed landmarks + blendshapes + pose matrix
-> neutral calibration (24 stable aligned frames)
-> face-local normalization (pose-corrected)
-> exercise-specific movement measurement
-> left/right displacement comparison
-> live symmetry score
```

The core scoring formula compares how much each side moved from neutral:

```text
symmetry = smaller_side_movement / larger_side_movement
```

A score near `1.0` means the two sides moved similarly. A lower score means one side moved less than the other. Per-exercise activation thresholds and per-landmark noise floors keep the score conservative when calibration is missing or movement is too small.

## Personal Movement Profile

During onboarding, users can create a local movement profile. This is not a separate trained model — it is a personalized baseline generated from MediaPipe landmarks and Mirror's custom scoring functions.

The profile captures:

- A neutral landmark baseline.
- A short rest-neutral capture before each baseline exercise.
- Per-landmark calibration noise.
- User-reported affected side and comfort level.
- Initial movement metrics for every exercise in the practice library.
- Per-exercise robust baseline movement ranges, initial symmetry, estimated limited side, and activation thresholds.
- Per-exercise baseline quality labels so weak captures can be retaken without treating the whole profile as bad.

The first saved profile is preserved as `initialMovementProfile`, while the current working profile is stored as `movementProfile`:

- Today's default session is prioritized from lower-baseline-symmetry movements.
- The Practice library preselects the profile-derived focus plan.
- Normal session scoring uses per-exercise activation thresholds from the profile.
- Session reports store both current-baseline progress and first-baseline progress, where `100%` means the matched baseline movement level.
- Session reports include score summaries, per-exercise rep scores, dose settings, baseline progress, rep snapshots, and neutral-baseline comparison images.
- Home and Progress show focus recommendations from the baseline profile.
- Comfort level adjusts session reps, hold time, and rest time through local dosing rules.
- Exercises marked `Retake` can be recalibrated individually; partial retakes merge only those movements into the current profile.
- Calibration coaching explains whether the user needs to center, level, hold steadier, or wait for more exercise-rest frames.

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
    exercises.js                Exercise catalog (EXERCISES, REGIONS, DAILY_ESSENTIALS, MOODS)
    session.js                  Session/exercise dosing, streak/clock helpers
  ml/
    faceMetrics.js              Calibration, normalization, symmetry, profile, overlay
  hooks/
    useCameraStream.js          getUserMedia lifecycle
    useFaceLandmarker.js        MediaPipe model loader + per-frame ref
  session/
    SessionMode.jsx             Calibrate → preview → rest → hold → interstitial → summary
  profile/
    ProfileAssessment.jsx       Onboarding movement profile capture
  trial/
    TrialMode.jsx               Standalone /trial demo (mesh, glow, ranked muscles)
  components/
    appViews.jsx                Home, Practice, Journal, Progress, modals, charts
  reports/
    sessionReport.js            Printable session report formatting
  lib/
    speech.js                   Voice prompts
  ui/
    scoreFormatting.js          Percentage + color helpers
docs/
  model-and-scoring.md          Technical model and scoring algorithm documentation
public/                         Static icons
```

Key functions:

- Exercise catalog: `EXERCISES` in `src/domain/exercises.js`
- MediaPipe loader: `useFaceLandmarker` in `src/hooks/useFaceLandmarker.js`
- Landmark mappings: `EXERCISE_LANDMARK_PAIRS`, `BROW_LANDMARKS`, `NOSE_LANDMARKS` in `src/ml/faceMetrics.js`
- Normalization: `faceFrameNormalize`
- Calibration: `averageLandmarks`, `computeNoiseFloor`, `normalizedFrameDelta`
- Scoring: `computeExerciseSymmetry`, `computePairwiseSymmetry`, `computeBrowSymmetry`, `computeNoseSymmetry`, `computeSymmetry`
- Movement profile: `buildMovementProfile`, `getAdaptiveFocusItems`, `buildPersonalizedDailyPlan`
- Live detection loop: `SessionMode` and `TrialMode`

## Local Development

```bash
npm install
npm run dev      # starts Vite on http://127.0.0.1:5173
npm run build    # production bundle
npm run lint
```

The main practice flow lives at `/`. The standalone tracker demo lives at `/trial`.

## Browser Requirements

- A modern browser with camera access
- Permission for the front camera
- WebAssembly support
- WebGL / GPU support recommended for MediaPipe runtime performance

If the model or camera is unavailable, the app still allows unscored guided practice.

## Data And Privacy

- Camera frames are processed in the browser by the MediaPipe model. No video, landmarks, or scores are sent to any server.
- Session records persist exercise scores, timestamps, dose settings, and snapshot counts. Report images are stored locally in IndexedDB as separate image blobs so past physiotherapy PDFs can be regenerated without bloating session JSON.
- Movement profiles include neutral landmark data, noise floor data, and per-exercise baseline metrics.
- The first saved profile is kept as `initialMovementProfile` for long-term recovery comparison; the current `movementProfile` can be updated through full or partial retakes.
- When the full profile is retaken, the previous profile is kept as a compact history record. Raw neutral landmarks and noise-floor arrays are not duplicated into history.
- When only weak exercise baselines are retaken, those entries are merged into the current profile without archiving or replacing the rest of the baseline.
- App state is persisted locally in IndexedDB under `mirror-db`, with `appState`, `sessions`, and `sessionImages` stores. The legacy `mirror-app-data` localStorage record is migrated once and removed after a successful migration.
- There is no backend service in this codebase.

## Medical Disclaimer

Mirror is designed for guided practice and self-tracking. It does not diagnose Bell's palsy, grade facial paralysis, prescribe treatment, or replace professional care. Users should work with a qualified clinician and stop any exercise that causes pain, strain, or discomfort.

## Made By

**Ali Mustufa**
- X / Twitter: [@ialimustufa](https://x.com/ialimustufa)
- LinkedIn: [in/ialimustufa](https://www.linkedin.com/in/ialimustufa/)

## Thanks

Huge thanks to **Vaibhav (VB) Srivastav** from OpenAI for 6 months of ChatGPT Pro (worth ~$600) — it directly funded the usage of Codex 5.5 that went into shipping this.

## Built With

- [Google MediaPipe Tasks Vision Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) — 478-point face mesh + ARKit-style blendshapes
- [Pieces AI](https://pieces.app/) — developer memory and research workflow
- Claude Opus 4.7 (Anthropic) — pair-programming, refactors, UI
- OpenAI Codex 5.5 — scoring algorithms, refactors and code review
