# Features And Workflows

This document collects the product behavior that used to live in the main README.

## Highlights

- Guided exercises across forehead, eyes, nose, cheeks, mouth, and emoji-style facial reactions.
- Neutral calibration with frame-stability gating and per-landmark noise estimation.
- Exercise-specific symmetry scoring plus affected-side progress against the user's own baseline.
- Optional personal movement profile that personalizes dosing, focus, and progress tracking.
- Local personal recovery model that learns affected-side recovery trends from the user's own saved sessions.
- Comfort levels that adjust reps, hold time, and rest time.
- Local persistence of sessions, journal entries, streaks, trends, and rep snapshots.
- Printable session report that can be saved as a PDF for a physiotherapist.
- Session-level scoring diagnostics with capture quality, rejected-frame reasons, quiet-region movement flags, and conservative safety notes.
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
- Initial movement metrics for the starter baseline set, stored as user/anatomical left/right even though the camera preview is mirrored.
- Per-exercise robust baseline movement ranges, initial symmetry, estimated limited side, and activation thresholds.
- Per-exercise baseline quality labels so weak captures can be retaken without treating the whole profile as bad.

The first saved profile is preserved as `initialMovementProfile`, while the current working profile is stored as `movementProfile`:

- Today's default session is prioritized from lower-baseline-symmetry movements.
- The Practice library preselects the profile-derived focus plan.
- Normal session scoring uses per-exercise activation thresholds from the profile.
- Session reports store legacy focused-side baseline progress plus affected-side movement progress against both the current and first saved baselines.
- Session reports include score summaries, per-exercise rep scores, dose settings, affected-side progress, affected/proper side comparison, rep snapshots, and neutral-baseline comparison images.
- Home and Progress show focus recommendations from the baseline profile and recent affected-side movement trends.
- Existing image-side profile data is migrated to user/anatomical side fields on load; old session progress that cannot be recomputed is tagged as legacy instead of reused for affected-side trend charts.
- Comfort level adjusts session reps, hold time, and rest time through local dosing rules.
- The optional personal recovery model trains locally from saved movement progress. It estimates per-exercise current recovery, trend slope, variability, confidence, uncertainty range, and a plain status once enough sessions exist.
- Optional local data capture can store sampled landmarks/scoring metadata for debugging and future model work. It is disabled by default and does not capture raw video.
- Exercises marked `Retake` can be recalibrated individually; partial baseline captures also merge missing add-on movements into the current profile.
- The Baseline menu lets users select individual movement baselines to redo or reset. Redo uses the partial-retake flow; reset clears those movements from the current and first-baseline profiles until they are captured again.
- After the first counted daily session, Mirror prompts for a journal entry if today is not logged yet. The progress rating is prefilled from detected session symmetry or movement progress and can be edited before saving.
- Calibration coaching explains whether the user needs to center, level, hold steadier, or wait for more exercise-rest frames.
