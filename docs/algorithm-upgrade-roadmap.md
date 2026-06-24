# Feature And Algorithm Upgrade Roadmap

This roadmap is for Mirror's current local-first Bell's palsy practice app. It is not a medical-device specification and should not turn Mirror into a diagnostic or clinical grading tool without clinician-led validation.

## Current Baseline

Mirror already has several strong foundations:

- Local MediaPipe Face Landmarker runtime with 478 landmarks, blendshapes, and facial transformation matrices.
- Neutral calibration, face-local normalization, per-landmark noise floors, and hold-time head-pose gating.
- Exercise-specific symmetry scoring for brow, eyes, nose, cheeks, mouth, vowels, and emoji-style expressions.
- A first-use movement profile with exercise baselines, quality labels, partial retakes, and first-baseline progress tracking.
- A local personal recovery model that trends affected-side progress from saved sessions.
- Local IndexedDB storage for app state, sessions, images, frame samples, and backup import/export.

The next upgrade should make the algorithm more clinically legible, safer around synkinesis, and easier to validate with replayable data.

## Implementation Status

- Phase 0 instrumentation: implemented on `algorithm-upgrade`. Sessions, exercise records, movement profiles, and frame-sample scoring payloads now carry `scoringModelVersion`; live scoring stores structured `dropReason` counts and per-rep score distributions; saved and just-finished sessions now show local scoring diagnostics.
- Phase 1 signal-quality work: started. MediaPipe inference now uses a worker-backed detector when supported, direction-specific scoring is active for smile, pucker, cheek puff/suck, eye closure, and vowel families, session records include pre-session setup quality with occlusion/glare risk, capture-quality summaries, a replay CLI can rerun saved frame samples through the scorer, and quiet-region coactivation metrics are recorded for supported exercises.
- Still pending in Phase 1: collect reviewed validation datasets and use threshold calibration reports to decide production constant changes.
- Phase 2 clinical-legibility work: started. Standardized assessment records now save separately from daily practice, Progress shows assessment trends separately, clinician bundles include assessment-to-assessment comparisons, neutral calibration saves compact resting asymmetry metrics, optional House-Brackmann/Sunnybrook/eFACE-style estimates are generated only when at least 80% of the standard assessment has usable evidence, and printable reports include capture-quality flags, rejected-frame reasons, quiet-region movement summaries, assessment sections, and conservative safety notes.
- Phase 3 personalization work: started. The local personal recovery model now stores uncertainty ranges and plain trend statuses; it prioritizes controlled assessment samples, downweights weak capture quality and coactivation risk, and adaptive plans now avoid boosting stale/fatigue contexts or high-risk recent evidence.
- Threshold personalization: new movement profiles store per-exercise threshold bands for minimum visible movement, reliable movement, and baseline target movement; saved movement features and validation replay now expose those bands for tuning.
- Safety prompt coverage: implemented for weak/noisy capture, quiet-region coactivation, low eye-closure/dryness risk, and recent journal notes mentioning new or worsening symptoms, pain/strain, or significant fatigue.
- Phase 4 validation dataset format: implemented as an explicit local JSONL export with frame-sample records, assessment clinical-scale records, frame label templates for intended movement/affected side/quality/visible movement/coactivation, and clinical-scale target templates for House-Brackmann, Sunnybrook, and eFACE-style labels.
- Phase 4 validation label workflow: implemented CSV label-sheet export and label merge scripts so clinician/user/developer-reviewed frame and clinical-scale labels can be attached to validation JSONL datasets. Clinical-scale labels now carry a pseudonymous `validationCaseId` so repeated assessments from one case can be audited separately from distinct-case coverage, plus a pseudonymous `reviewerId` so reviewer identity controls can be checked without storing names.
- Phase 4 validation evaluation: started with `npm run validate:dataset`, which replays labeled frame samples and reports accuracy, false-positive rate, false-negative rate, score drift, and per-exercise error rates. It also evaluates reviewed House-Brackmann, Sunnybrook, and eFACE target labels against Mirror estimates with explicit 80% observed and Wilson lower-bound agreement gates, requires at least 10 distinct pseudonymous validation cases, and reviewer-agreement artifacts now require distinct-case coverage, distinct pseudonymous reviewer ids, and House-Brackmann same-band severity coverage across HB I-II, HB III-IV, and HB V-VI. Threshold calibration reports can be generated with `npm run validation:calibrate-thresholds`; model-readiness decisions can be generated with `npm run validation:model-readiness`.
- Phase 5 release gates: implemented with `npm run release:check`, rollback-safe backup parse tests, a machine-readable `docs/validation-status.json`, runtime clinical-scale presentation checks that fail closed if the documented 80% standard or case-mix floors are weakened, and documentation checks for medical, privacy, and validation status.
- Still pending across Phases 1 and 4: collecting actual clinician-reviewed validation datasets, applying reviewed calibration reports to production constants, proving the clinical-scale 80% observed and Wilson lower-bound agreement gate on reviewed assessment labels with at least 10 distinct validation cases and reviewer identity controls, and proving the same observed/Wilson reviewer-agreement gate on blinded independent paired reviewer labels with the same distinct-case floor and distinct pseudonymous reviewer ids.

## Product Features Worth Adding

### 1. Guided Quality Setup

Add a pre-session setup view that scores lighting, distance, face angle, glasses/occlusion risk, frame rate, and camera stability before calibration starts.

Status: implemented with local setup-quality sampling before calibration, compact setup/capture summaries on saved sessions and baseline profiles, and action-oriented coaching for weak setup signals.

Why it helps:

- Reduces bad baselines before they happen.
- Makes false low scores less likely.
- Gives the user a concrete fix instead of a vague "tracker unavailable" state.

Implementation notes:

- Reuse face presence, pose deviation, eye-line level, and detection FPS signals.
- Persist a compact `captureQuality`/setup-quality summary on each session and baseline profile.
- Show plain-language coaching only when it changes the user's next action.

### 2. Standardized Assessment Mode

Add a separate assessment flow that is slower and more controlled than normal practice. It should collect rest, voluntary movement, and unintended-movement observations for a small set of standard movements.

Status: implemented as a standard assessment session kind with a fixed controlled movement set, separate saved `assessments`, zone summaries, and a separate assessment trend in Progress.

Suggested movement set:

- Eyebrow raise.
- Gentle eye closure.
- Open smile.
- Snarl or nose wrinkle.
- Lip pucker.
- Resting face.

Why it helps:

- Sunnybrook-style assessment separates resting asymmetry, voluntary movement, and synkinesis by zone; Mirror currently focuses most strongly on voluntary movement and baseline-relative progress.
- A standardized mode creates cleaner trend reports for clinicians without changing the casual daily practice flow.

Implementation notes:

- Store an `assessment` record separate from normal `sessions`.
- Display "practice trend" and "assessment trend" separately.
- If House-Brackmann, Sunnybrook, or eFACE-style values are shown before validation, label them as Mirror estimates and keep validation gates separate from clinician-assigned grades.

### 3. Synkinesis-Aware Feedback

Add detection for unintended co-activation during an intended movement.

Status: implemented as quiet-region coactivation metrics and gentle practice feedback. The app intentionally labels this as quiet-region movement/coactivation risk, not a clinical synkinesis diagnosis.

Examples:

- Smile causes eye narrowing or blink.
- Eye closure causes mouth corner pull.
- Pucker causes cheek/neck tension proxies.
- Brow raise causes mouth movement.

Why it helps:

- Facial retraining often emphasizes controlled isolated movements and suppression of unwanted co-contractions.
- Mirror already has region-level landmarks and blendshapes, so it can flag likely co-activation as practice feedback.

Implementation notes:

- Define per-exercise "quiet regions" in addition to target regions.
- Track quiet-region movement from neutral during holds.
- Add a `synkinesisRisk` or `coactivation` field to rep and exercise summaries.
- Use gentle copy such as "keep the eye relaxed while smiling"; avoid labeling it as clinical synkinesis.

### 4. Clinician Review Bundle

Upgrade the existing printable report into a local clinician bundle.

Status: implemented as an explicit local JSONL clinician bundle export from Progress.

Contents:

- Assessment trend and comparison table.
- Selected baseline and current comparison images.
- Per-exercise progress from first baseline.
- Data quality flags.
- User journal notes, fatigue, discomfort, and eye symptoms.
- Exported JSONL backup for audit/replay when the user chooses to share it.

Why it helps:

- Clinicians need context and quality flags, not just a single score.
- The app remains local-first while making user-controlled sharing easier.

### 5. Safety And Escalation Prompts

Add conservative, non-diagnostic prompts for:

- Eye closure difficulty and eye dryness risk.
- New or worsening neurological symptoms.
- Pain, strain, or significant fatigue after exercises.
- Very noisy data that should not be interpreted as progress.

Status: implemented through session diagnostics plus recent journal-note safety prompts in Progress and clinician bundle exports.

Why it helps:

- The app is a practice companion, not medical care.
- Eye protection is a common practical issue in Bell's palsy management.

### 6. Offline Replay And Tuning Lab

Add a developer-only replay harness for captured frame samples.

Status: implemented through local frame-sample capture, `npm run replay:frames`, validation dataset replay, and threshold/model-readiness scripts.

Why it helps:

- Threshold tuning should be repeatable.
- New scoring changes can be tested against the same raw-ish local samples.
- Regression tests can cover "tiny true movement", "pose drift", "bad calibration", and "wrong movement" scenarios.

Implementation notes:

- Store sampled landmarks, blendshapes, pose matrices, exercise id, phase, and scoring mode.
- Add a script that replays sample files through `computeExerciseSymmetry`.
- Emit before/after score deltas and validity/drop reasons.

## Algorithm Upgrade Plan

### Phase 0: Instrument The Existing Algorithm

Goal: make every score explainable.

Work:

- Add structured `dropReason` values for unscored frames: no face, poor pose, below activation threshold, low confidence, bad neutral, missing matrix, or quiet-region coactivation. Status: implemented as structured scoring diagnostics and capture-quality drop-reason counts.
- Store per-rep distributions, not only averages: valid frame count, median, peak, interquartile range, and dropped-frame count. Status: implemented in rep/session scoring diagnostics and frame-sample replay summaries.
- Add a versioned `scoringModelVersion` to sessions, profiles, and exports. Status: implemented on saved scoring records, profile records, browser backups, clinician bundles, validation datasets, and replay reports.
- Add a local diagnostics view that can inspect one session's score derivation. Status: implemented through session summary diagnostics panels and per-exercise diagnostic chips backed by structured rep diagnostics.

Exit criteria:

- Every saved score can explain what frames contributed and what frames were rejected.
- Tests cover at least one positive and one rejected example per major scorer family.

### Phase 1: Improve Signal Quality

Goal: reduce false progress and false no-score states.

Work:

- Move MediaPipe inference into a Web Worker because the official web guide notes that `detect()` and `detectForVideo()` are synchronous and block the UI thread. Status: implemented with a main-thread fallback for browsers without worker bitmap support.
- Add pose, occlusion, and landmark-stability quality scores. Status: setup quality records centered/level alignment, landmark stability, and an occlusion/glare risk proxy from face presence, brightness, and contrast.
- Tune calibration quality thresholds using the stricter core landmarks already captured by `coreAvgNoise`. Status: profile status and profile comparisons prefer `coreAvgNoise`, with legacy `avgNoise` fallback for older profiles.
- Add exercise-specific direction vectors for smile, pucker, cheek puff/suck, eye closure, and vowels instead of relying only on generic displacement magnitude. Status: implemented for those families with movement-specific neutral jitter keys.
- Add quiet-region movement penalties for the first synkinesis-aware feedback. Status: diagnostics show a derived practice-score penalty for medium/high quiet-region movement while trend/planning models downweight coactivation risk.

Exit criteria:

- Replay tests show lower frame rejection in good captures and higher rejection in wrong-movement captures. Status: frame-sample replay regression scores a matched smile capture and rejects a wrong inward-mouth movement from the same calibration.
- The UI can distinguish "try again because capture quality is bad" from "movement is below your baseline threshold".

### Phase 2: Add Clinical-Legibility Metrics

Goal: make reports easier to interpret without pretending to be a diagnosis.

Work:

- Implement a local standardized assessment record with zones: brow/forehead, eye, midface/nose, mouth. Status: implemented with `standard-assessment` records and zone summaries for brow, eye, midface/nose, and mouth.
- Add resting asymmetry metrics for palpebral fissure, nasolabial/midface proxy, and oral commissure position. Status: implemented as compact face-local neutral calibration metrics.
- Add voluntary movement metrics for the standard movements. Status: implemented by summarizing affected-side movement/progress or symmetry into assessment zone and average voluntary-movement metrics.
- Add coactivation metrics during those same movements. Status: implemented by carrying quiet-region coactivation risk into each assessment zone and the overall assessment record.
- Add report language that maps Mirror metrics to "rest / voluntary movement / coactivation" sections. Status: reports and clinician bundles use rest, voluntary movement, coactivation, assessment-comparison, and optional clinical-scale estimate sections while preserving non-diagnostic wording.

Exit criteria:

- A clinician can compare two assessment reports without reading raw app internals.
- The report clearly says the metrics are Mirror practice metrics, not validated clinical grades.

### Phase 3: Upgrade Personalization

Goal: personalize thresholds and plans using reliability-aware trends.

Work:

- Replace single activation-threshold heuristics with per-exercise threshold bands: minimum visible movement, reliable movement, and baseline target movement. Status: implemented for new movement profiles and saved movement-feature summaries.
- Train the local personal recovery model on weighted daily assessment points before normal practice sessions. Status: assessment session samples receive higher trend weight while standalone practice runs are downweighted.
- Add uncertainty bands to trend displays instead of a single recovery number. Status: personal recovery entries store uncertainty half-width plus low/high current-ratio bounds, and Progress displays those ranges.
- Make adaptive plans consider fatigue, missed days, low-quality captures, and coactivation risk. Status: implemented by passing local journal context into plan ranking, suppressing stale no-recent-data boosts, and demoting weak-capture or high-coactivation recent evidence.

Exit criteria:

- The app can say "collecting", "low confidence", "stable", "improving", or "worse capture quality" for each exercise.
- Planning never increases intensity solely because of a noisy or low-confidence score.

### Phase 4: Build A Validation Dataset

Goal: stop tuning only against anecdotal captures.

Work:

- Define an opt-in local export package for clinician/user-labeled assessment clips or frame samples. Status: implemented for local validation JSONL exports with frame-sample records and assessment clinical-scale rows.
- Label movement attempts with intended movement, affected side, quality, visible movement level, and coactivation notes; label clinical-scale assessment targets with House-Brackmann, Sunnybrook, and eFACE-style values. Status: implemented in the validation JSONL label schema, CSV label-sheet export, clinical review package export with a blinded sheet plus source dataset hash manifest, and label merge workflow.
- Compare MediaPipe landmark output and Mirror clinical-scale estimates on Bell's palsy faces against clinician-reviewed landmarks, region movement labels, or clinical-scale labels. Status: label-sheet and evaluator tooling implemented; actual reviewed dataset collection is still required.
- Evaluate whether a lightweight correction model or clinical-domain landmark model is justified. Status: implemented as `npm run validation:model-readiness`, which fails closed without enough reviewed data, recommends threshold review before model training, and does not justify clinical-domain landmark models without reviewed landmark annotations.

Exit criteria:

- Each algorithm change reports replay accuracy, false-positive rate, false-negative rate, and measurement drift against the same validation set.
- No clinical-facing score ships without documented validation coverage.

### Phase 5: Safety, Privacy, And Release Gates

Goal: make algorithm upgrades shippable without weakening the local-first promise.

Work:

- Keep all scoring local by default. Status: implemented with in-browser MediaPipe/scoring and local IndexedDB persistence.
- Require explicit export for any data sharing. Status: implemented through user-triggered browser-data, clinician-bundle, and validation-dataset exports; non-restore JSONL exports are rejected by browser-data import.
- Version every data schema migration. Status: implemented through IndexedDB schema versioning, app data side-convention migration versioning, scoring model versioning, and export schema/version fields.
- Add rollback-safe import handling for old backups. Status: covered by parser compatibility tests for legacy JSON backups, JSONL backups, and non-backup JSONL rejection.
- Add a release checklist for medical disclaimer copy, privacy copy, and validation status. Status: implemented as `npm run release:check` plus `docs/validation-status.json`.

Exit criteria:

- A user can back up, restore, and delete local data.
- Docs explain which metrics are practice feedback and which are experimental.

## Suggested Technical Backlog

Priority order:

1. Add `scoringModelVersion`, `dropReason`, and per-rep distribution fields. Done.
2. Build replay tests around stored frame samples. Done.
3. Add quiet-region definitions and first coactivation metrics. Done.
4. Add standardized assessment records and a clinician report section. Done.
5. Move face inference into a Web Worker. Done with fallback.
6. Add capture-quality setup before calibration. Done.
7. Add uncertainty bands to the personal recovery model. Done.
8. Create an opt-in labeled validation dataset format. Done with JSONL frame-sample exports, assessment clinical-scale rows, and label schema.

## Evidence And References

- [MediaPipe Face Landmarker Web guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js): documents 3D landmarks, blendshapes, facial transformation matrices, and the synchronous nature of web `detectForVideo()`.
- [Bell Palsy - StatPearls, NCBI Bookshelf](https://www.ncbi.nlm.nih.gov/books/NBK482290/): summarizes Bell's palsy management context and describes facial grading systems including Sunnybrook and Facial Nerve Grading System 2.0.
- [Automatic Quantification of Facial Asymmetry using Facial Landmarks](https://arxiv.org/abs/2103.11059): supports region-based landmark movement analysis for facial asymmetry scoring.
- [Toward an Automatic System for Computer-Aided Assessment in Facial Palsy](https://arxiv.org/abs/1910.11497): reports that generic landmark detectors perform worse on facial palsy patients than healthy controls and that clinical-domain training improves landmark localization.
- [Automatic Facial Paralysis Estimation with Facial Action Units](https://arxiv.org/abs/2203.01800): supports action-unit-style regional movement modeling as a direction for severity estimation research.
