# Features And Workflows

This document collects the product behavior that used to live in the main README.

## Highlights

- Guided exercises across forehead, eyes, nose, cheeks, mouth, and emoji-style facial reactions.
- Neutral calibration with frame-stability gating and per-landmark noise estimation.
- Exercise-specific symmetry scoring against the user's own baseline.
- Optional personal movement profile that personalizes dosing, focus, and progress tracking.
- Comfort levels that adjust reps, hold time, and rest time.
- Local persistence of sessions, journal entries, streaks, trends, and rep snapshots.
- Printable session report that can be saved as a PDF for a physiotherapist.
- A live `/try` demo page with face mesh, color-coded regions, ranked muscle activations, and an expression detector.

## Main Practice Flow

The main app route at `/` guides a user through calibration, exercise preview, rest, hold, interstitial feedback, and summary. It can score holds when the model and camera are available, and it still supports unscored guided practice when they are not.

## Live Demo Page

The `/try` route is a standalone showcase of the underlying face tracker, independent of the practice loop. It renders:

- The full 478-point MediaPipe mesh, color-coded by region.
- Per-region activation glows that pulse on the camera as the matching muscle engages.
- A ranked **Active muscles** panel with left/right activation bars, peak-hold ticks, and a live expression chip.
- A face-position panel showing posture state and head drift in degrees.

It is intentionally minimal: no scoring lock and no session machinery, so a first-time visitor can see the tracker working immediately.

## Personal Movement Profile

During onboarding, users can create a local movement profile. This is not a separate trained model. It is a personalized baseline generated from MediaPipe landmarks and Mirror's custom scoring functions.

The profile captures:

- A neutral landmark baseline.
- A short rest-neutral capture before each baseline exercise.
- Per-landmark calibration noise.
- User-reported affected side and comfort level.
- Initial movement metrics for the starter baseline set, with remaining practice-library movements offered later as add-on baselines.
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
- Exercises marked `Retake` can be recalibrated individually; partial baseline captures also merge missing add-on movements into the current profile.
- Calibration coaching explains whether the user needs to center, level, hold steadier, or wait for more exercise-rest frames.
