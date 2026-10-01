# Hand-over: work done by Claude on Mirror (Bell's Palsy Codex)

**Audience:** an AI agent picking up this repo.
**Written:** 2026-08-25. **Repo state at writing:** branch `codex/batch-stray-code` @ `7fdd43e`, 345 tests passing.

This documents *only the work done in Claude sessions*, what it changed, why, what was
deliberately **not** done, and what is still open. Everything here was verified against the
current tree — not recalled from memory. Where I could not establish authorship with
confidence, I say so rather than guess.

---

## 1. Orientation (read this first)

Mirror is a **local-first, client-only** facial-retraining app for Bell's palsy. React 19 + Vite,
MediaPipe Face Landmarker (478 landmarks + 52 ARKit blendshapes) in the browser, IndexedDB
(`mirror-db`) for all data. **There is no backend.** Nothing leaves the device except manual
file export.

| Thing | Where |
|---|---|
| Scoring engine (the heart of the app) | [src/ml/faceMetrics.js](src/ml/faceMetrics.js) (~2900 lines) |
| Live session loop / rep capture | [src/session/SessionMode.jsx](src/session/SessionMode.jsx) |
| IndexedDB layer, retention, migrations | [src/storage.js](src/storage.js) |
| App state normalization + migrations | [src/domain/appData.js](src/domain/appData.js) |
| Tunable constants | [src/domain/config.js](src/domain/config.js) |
| Offline replay of captured frames | [src/ml/frameSampleReplay.js](src/ml/frameSampleReplay.js) |
| UI (charts, settings, reports) | [src/components/appViews.jsx](src/components/appViews.jsx) |

```bash
npm test        # 345 tests, node:test — run this after any faceMetrics/storage change
```
```bash
npm run lint && npm run build
```

The app owner (Ali) is also the **primary patient** — his own captured sessions are the
validation dataset. Every scoring claim below was measured against his real frames, not reasoned
about abstractly.

---

## 2. Attribution map — what is Claude's and what isn't

This repo has three authors' work interleaved (Ali, OpenAI Codex, Claude) and **all 327 commits
are authored `Ali Mustufa`**. Only 3 carry a `Co-Authored-By: Claude` trailer, so commit metadata
is *not* a reliable attribution signal. Use this table instead.

### Claude's work, as landed

| Commit | Subject | Notes |
|---|---|---|
| `4c07b44` | Cap subtle-exercise activation thresholds so eye reps record | 100% Claude |
| `27661d5` | Fix blendshape scoring and local dates | **Mixed.** Blendshape fix, recovery heatmap, replay/calibration tooling = Claude. The `localDateISO`/date-handling half was pre-existing working-tree work by someone else, swept into the same commit. |
| `16d0e9b` | Lower pucker activation cap so genuine reps record | 100% Claude (trailer) |
| `4912123` | Score eye closure from full lid convergence | 100% Claude (trailer) |
| `22e5023` | Floor water-hold score at 50% | 100% Claude (trailer) |
| `99707b4` | Archive frame samples and cap local media | 100% Claude (storage rework) |
| `186cbce` | Harden camera setup and storage controls | **Mixed.** The storage-usage card + "clear all local data" in `App.jsx`/`appViews.jsx` = Claude. The `useCameraStream`/`useFaceLandmarker`/`TrialMode`/`ProfileAssessment` retry+tracker rework was **already uncommitted in the tree before Claude's session** and is not Claude's. |
| `1371eb7` | Add local dev launch profile | Claude added `.claude/launch.json` (dev server on port 5199) |

### Explicitly *not* Claude's

- **The entire clinical-validation stack** — `src/ml/clinical*`, `src/domain/clinicalScales*`,
  the 18 `scripts/*.mjs` validation/readiness/review-package tools, `docs/validation-status.json`,
  the `release:check` gate. That is the `algorithm-upgrade` / `scoring-baseline-fix` line of work
  (Codex). Claude never touched it.
- **Camera/tracker retry rework** (`retryKey`, `trackerError`, "Symmetry tracking is off" UI).
  Claude was asked "did you add Symmetry tracking?" and verified from `git diff` that it did not —
  the toggle `prefs.symmetryEnabled` has existed since `5c40960` (2026-06-23).
- `c9e498b` "Keep symmetry tracking enabled" — likely a follow-up to Claude's analysis, but it was
  authored outside a Claude session.
- `9bf8092` "Separate preferences and paginate history" — not Claude.
- The **uncommitted change in the tree right now**
  ([src/hooks/useSessionReminders.js](src/hooks/useSessionReminders.js), swapping
  `toISOString()` for `localDateISO()`) — not Claude's; it belongs to the local-date effort.
  Untracked `Mirror_Bells_Palsy 2.pdf` is also not Claude's.

---

## 3. Session 1 — "the model got worse after the algorithm revamp"

**Dates:** 2026-06-28 → 06-30. **Branch:** `fix/blendshape-symmetry-fusion` → merged to `main`
via PR #2 (`af64e1d`).

**Presenting symptom:** after the direction-specific scoring revamp (`8d05c5e`, "Add
direction-specific movement scoring"), the "Last 14 days" heatmap slid from green to red — exercise scores appeared to get *worse* while the patient was visually
*improving*.

### 3.1 The investigation, and a diagnosis that had to be corrected

This is the most important part of the hand-over, because the first answer was wrong and the
process of disproving it is what produced the real fix.

1. **First hypothesis (partly wrong):** per-side blendshape fusion was inflating the healthy side.
   Since `symmetry = min/max`, boosting only the already-larger side mechanically drops the ratio.
   The logic was sound and the bug was real — but a dry-run replay over real frames showed the
   correction was **< 1 point, and downward**, not the multi-point drop being investigated. Claude
   stated this contradiction plainly rather than letting the tidy story stand.
2. **A/B replay through old vs new scorer** (3 experiments on captured frames):
   - Same frames, old vs new scorer → identical to 0.0pt. Fusion was *not* the regression driver.
   - Varying only the activation threshold → nearly flat. Not it either.
   - Full pre-revamp pipeline vs full current pipeline → **found it.** The revamp loosened the
     directional signal gate (`directionalNoiseWeight 1→0.6`, `directionalGateMultiplier 1.5→1`,
     `directionalGateCap ∞→0.012` — [faceMetrics.js:71-73](src/ml/faceMetrics.js), the `balanced`
     scoring-noise mode). The old strict gate *dropped weak frames*, so only the
     cleanest reps were scored — survivorship bias reading as high symmetry. Example: 06-25
     eye-close read **79%** under the old gate and **16%** under the new one, on the same day.
3. **Gate calibration (`npm run calibrate:directional-gate`)** over 899 directional frames:
   sweeping `directionalGateCap` from `0.012` to `∞` produced **identical** session averages, and
   **zero** admitted frames sat at or below the noise floor. Conclusion: *the low scores are honest
   measurements of real asymmetric movement.* Don't tune the gate. Ali chose to keep the honest
   scores.
4. **The actual product bug:** the heatmap was plotting the wrong metric. `symmetry = min/max` is
   an *instantaneous balance ratio* — blind to magnitude and brutally volatile. The patient's
   affected-side movement had **doubled** (pucker 242 → 610) while the ratio read 1% that day,
   because the healthy side happened to under-move. Recovery is about the affected side moving
   *more*, not the two sides matching at each instant.

### 3.2 What shipped

| Change | File | Effect (measured on real frames) |
|---|---|---|
| **"Gate, don't score"** — blendshape assist feeds `fusedPeak` for the activation check only; the returned `symmetry` and `leftDisp`/`rightDisp` are geometry-only. Blendshape-only movement (zero geometry both sides) is *dropped*, not scored 0%. `SCORING_MODEL_VERSION` 2→3. | [faceMetrics.js:975](src/ml/faceMetrics.js) | Stops fabricated symmetry; < 1pt effect |
| **Recovery heatmap** — "Last 14 days" now colors by `affectedProgressRatio` (affected-side movement vs the frozen baseline) instead of symmetry, with new label/tooltip/legend. New `recoveryColor()` with its neutral point at baseline (1.0). | [appViews.jsx:2882](src/components/appViews.jsx), [scoreFormatting.js:18](src/ui/scoreFormatting.js) | Whole week flipped 46–71% red → **159–252% of baseline, all green** |
| **Subtle-threshold caps** — a blink during eye-close calibration inflated the baseline peak to ~1.46, putting the activation gate (`peak × 0.35` ≈ 0.51) ~10× above any achievable closure peak (0.056), so every rep was force-skipped. Capped per family. | [faceMetrics.js:1313](src/ml/faceMetrics.js) `SUBTLE_PROFILE_THRESHOLD_MAX_BY_KEY` | eye-close activation **60% → 87%**; blink-poisoned dead sessions **0 → 56** frames |
| **Pucker cap 0.45 → 0.12** — the old cap was set to *this user's inflated baseline* (~0.43), sitting near the median pucker peak and dropping 23% of genuine reps. Captured peaks p10/p50/p90 = 0.27/0.52/0.70 with ~zero noise. | same table | pucker activation **78% → 97%** |
| **Cheek-suck cap validated at 0.18** (was marked provisional) against captured peaks 0.38–1.19 | same table | no change needed; 100% activation confirmed |
| **Eye closure scores full lid convergence** — the signal *subtracted* the lid-center shift to reject head motion, but the upper lid does most of the travel, so that cancelled the very movement being measured and roughly halved a genuine close. Now the center shift is a **rejection gate**: `2·centerShift > apertureClose` → reject, else score the full aperture reduction. | [faceMetrics.js](src/ml/faceMetrics.js) `eyeClosureRawSignal` | Un-halves closure; lateral-drift rejection preserved |
| **Water hold floored at 50%** — it's a one-sided *isolation*, not a symmetry: even a clean hold has some opposite-side and seal activity, so `target/(target+penalty)` pins near 0.5. It was scored on a 0–100% scale and averaged with two-sided exercises hitting 90%+, dragging the session average down. Scored holds now map into [0.5, 1.0]. | [faceMetrics.js:1071](src/ml/faceMetrics.js) | holds **42–48% → 71–74%** |

### 3.3 Tooling built (kept, still useful)

- `npm run calibrate:directional-gate` — [scripts/calibrate-directional-gate.mjs](scripts/calibrate-directional-gate.mjs).
  Sweeps gate constants over a real export and reports admitted-frame / noise-floor / symmetry
  distributions. **This is the tool to re-run before touching any scoring constant.**
- `npm run backfill:rescore` — [scripts/backfill-rescore.mjs](scripts/backfill-rescore.mjs).
  **Dry-run only, writes nothing, by design.**
- `aggregateRescoredSessions` / `rescoreSessionsFromFrameSamples` in
  [frameSampleReplay.js](src/ml/frameSampleReplay.js), with a **self-check control**: exercises the
  fix doesn't touch must replay to their stored values within tolerance, otherwise that session is
  skipped rather than rewritten. Reuse this pattern for any future backfill.

### 3.4 The backfill that was deliberately NOT written

Rescoring history was investigated and **rejected on evidence**: the replay's own reconstruction
error was ~5pt on a control exercise, while the correction it would apply was < 1pt. Writing back
would inject more error than it removes. **All scoring fixes are forward-only. Do not rewrite
stored history without re-establishing reconstruction fidelity first.**

---

## 4. Session 2 — "browser storage is approaching a gigabyte"

**Dates:** 2026-07-01 → 07-03. Landed 2026-07-06 in `99707b4` / `186cbce` / `1371eb7`.

Ali's first ask was a cleanup plan. Claude produced one, Ali pushed back, and Claude agreed the
pushback was right: **manual cleanup buttons treat the symptom; the disease is that the app writes
far more data than it needs and keeps all of it forever.** The plan was rewritten around shrinking
at the source. That reversal is the reason the fix is durable — keep it in mind before adding any
new "clear data" button.

### What shipped

- **Frame samples (the whale, ~100MB/session when capture is on):**
  dropped the duplicate raw landmark array + raw matrix at capture, trimmed coordinates to 4
  decimals, halved sampling to ~5fps, and replaced *thousands of per-frame rows* with **one gzip
  blob per session** in a new `sessionFrameArchive` store (`mirror-db` **v2 → v3**). Net: ~100MB →
  single-digit MB. Legacy per-frame rows migrate on next load, or are dropped above 8,000 rows
  (too many to re-pack safely) — that migration is what reclaimed the original gigabyte.
- **Snapshots (the always-on leak):** WebP with JPEG fallback, width 520→400, quality 0.9→0.75
  (`REPORT_SNAPSHOT_WIDTH` / `REPORT_SNAPSHOT_QUALITY` in [config.js](src/domain/config.js)).
  Per-rep gallery kept because the report UI uses it.
- **Rolling ceiling:** `MEDIA_RETENTION_SESSIONS = 12`. Sessions older than that shed images and
  frame archives automatically on save, **keeping every score and metric** so charts and the
  recovery model are unaffected. Enforced centrally in `applyMediaRetention`
  ([storage.js:282](src/storage.js)) plus the save path.
- **Save no longer rewrites the whole corpus.** The old `writePreparedDataToIndexedDb` read every
  image and frame blob into memory, cleared the stores, and rewrote everything **on every save** —
  at ~1GB a serious memory/latency bug independent of disk usage. Now it reads only keys and writes
  only the current change's blobs.
- **Visibility + escape hatch:** storage-usage card (`navigator.storage.estimate()` + store counts)
  and a "Clear all local data" button with an export-first warning, in the Preferences view under **Browser data** (`PreferencesView`; it was moved out of Settings by the later `9bf8092`).

**Verified in a real browser**, not just unit tests: DB upgraded to v3 cleanly, a live
save→export round-trip confirmed 5 frames pack into 1 gzip archive and decompress back to 5 flat
records, retention evicted the 2 oldest sessions' media while preserving their scores, clear-all
zeroed every store.

### The compatibility invariant

**Frame archives must expand back to the exact flat record shape on export.** The
validation/clinician export pipeline (`validationDataset.js`, `npm run validate:dataset`) reads
frame samples as a flat array. The compression is transparent *only* because the read helper
round-trips exactly. Any change to the archive format must preserve this or it silently breaks the
clinical validation pipeline — which is a different author's work and has its own release gate.

### The camera regression that wasn't

Ali reported "camera and model are not loading." Claude ran the app in a real browser and found:
app boots clean, IndexedDB v3 fine, MediaPipe bundle + WASM + `.task` model all 200, GPU
landmarker created, **"Tracker ready"** — the only failure was `Permission denied` on the camera in
an automated browser with no camera. The storage work touched none of the camera/model path.
The real suspect was identified as the *pre-existing uncommitted* tracker/camera retry rework in
the tree. Useful diagnostics that came out of this, still true:

- `getUserMedia` needs a secure context — a LAN IP over plain `http://` (Vite's "Network" URL)
  silently blocks the camera. Use `http://localhost:...`.
- **Model init only tries the GPU delegate, with no CPU fallback.** A browser without WebGL/GPU
  errors out. This is still true and is a real robustness gap.
- Camera/model load only inside `TrialMode` (`/try`), `ProfileAssessment`, and `SessionMode` —
  never at app boot.

---

## 5. Current verified state

```
branch codex/batch-stray-code @ 7fdd43e (in sync with origin)
345 tests pass · lint clean · build clean
SCORING_MODEL_VERSION = 3 · mirror-db = v3
```

Working tree is **not clean**: one modified file (`src/hooks/useSessionReminders.js`) and one
untracked PDF, **neither of them Claude's** — see §2. Leave them alone unless asked; they belong to
someone else's in-flight work.

All Claude-introduced symbols confirmed present in `HEAD`: `fusedPeak`,
`SUBTLE_PROFILE_THRESHOLD_MAX_BY_KEY`, `recoveryColor`, `applyMediaRetention`,
`MEDIA_RETENTION_SESSIONS`, `SESSION_FRAME_ARCHIVE_STORE`, the water-hold `0.5 + quality * 0.5`
remap, and the `eyeClosureRawSignal` convergence gate.

---

## 6. Open follow-ups (ranked, none started)

1. **Blink-robust eye baseline — the root cause the threshold cap only band-aids.**
   `robustMovementWindow` derives the baseline from the *top-movement* frames; for eyes, those are
   literally the blinks (a blink moves more than a gentle hold). So a blink poisons both the
   activation threshold *and* the eye recovery metric (inflated baseline → understated progress).
   Fix: use a sustained/median statistic instead of top-frames-by-peak, so the threshold derives
   correctly per user without the magic constant. This also unblocks item 2.
2. **Transient scoring for blink / wink / emoji-wink.** These have **zero captured frames** (they
   were only ever done in non-capture sessions), so nothing about them has been measured. They are
   transient by design (<300ms flick) and hold-averaged scoring is the wrong model — they need
   peak detection.
3. **Watch the eyeClosure cap after the convergence fix.** Removing the artificial halving roughly
   **doubles** eye-close peaks, which makes the `eyeClosure: 0.012` cap effectively more generous.
   If eye-close starts over-activating on noise, that constant is the knob, and
   `calibrate:directional-gate` will show it.
4. **Provisional caps still unvalidated:** `cheekPuffOutward: 0.18` and `lip-press: 0.1` have no
   capture data behind them. Validate against a capture that includes them.
5. **No CPU fallback for the MediaPipe delegate** (§4).
6. **Snapshot storage could shrink further** — peak-frame-per-exercise instead of per-rep was
   costed at another 3–5× but deferred because the report UI consumes the per-rep gallery.

---

## 7. How to work in this repo (learned the hard way)

- **Measure on real frames before changing a constant.** Every scoring constant in this codebase
  that was "reasoned" rather than measured turned out to be wrong (the pucker cap was set to one
  patient's *inflated* baseline). The replay harness + a real export is the ground truth.
- **Never fabricate data to look better.** The backfill was built, run, and then *discarded*
  because its own reconstruction noise exceeded the correction. Sessions that can't be honestly
  rescored keep their old `scoringModelVersion` and are labeled, not silently mixed.
- **State it when the evidence contradicts your earlier diagnosis.** That happened twice here and
  both times it was the path to the real fix.
- **Commit in isolation.** Working-tree state in this repo is frequently a mix of several authors'
  in-flight work. The established practice: snapshot, revert to HEAD, apply *only* the intended
  change, commit, restore. Do not sweep unrelated modified files into a commit — one commit
  (`27661d5`) did, and its attribution is muddled forever as a result.
- **Ask before committing.** Ali reviews diffs and decides what lands.
- **Honest scores over flattering scores.** This was an explicit product decision: a bad day
  should read as a bad day. Do not add smoothing or floors to make charts look better — the one
  floor that exists (water hold) is justified because its *ceiling* was 0.5, not because 42% looked
  bad.
- **Medical caution is not decoration.** The app must not diagnose or grade. Clinical-scale output
  is estimate-only behind an 80% evidence gate with a fail-closed release check
  (`npm run release:check`). Don't weaken those gates.
- Preview/dev server: `.claude/launch.json` runs Vite on **port 5199** (strict port).

---

## 8. If you need the primary sources

Full Claude session transcripts (with every tool call, replay output, and measurement) are at:

```
~/.claude/projects/-Users-ialimustufa-Downloads-Bells-Palsy-Codex/
  fb9df6f1-8c0d-4ea0-ac07-f3da2e42b734.jsonl   # session 1 — scoring (2026-06-28 → 06-30)
  d265bf74-e9c2-4db1-be5b-018a941e18d1.jsonl   # session 2 — storage (2026-07-01 → 07-03)
```

The measured numbers in §3 and §4 come from those runs against Ali's real exports. Those exports
are not in the repo — if you need to re-measure, ask for a fresh browser-data export
(`mirror-browser-data-YYYY-MM-DD.jsonl`) rather than assuming the old numbers still hold.
