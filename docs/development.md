# Development Guide

## Local Development

```bash
npm install
npm run dev      # starts Vite on http://127.0.0.1:5173
npm test         # pure scoring/progress tests
npm run build    # production bundle
npm run lint
npm run replay:frames -- backup.jsonl
npm run validate:dataset -- validation-dataset.jsonl
npm run validation:label-sheet -- validation-dataset.jsonl labels.csv
npm run validation:label-sheet -- validation-dataset.jsonl blinded-labels.csv --blinded
npm run validation:reviewer-agreement -- reviewer-a.csv reviewer-b.csv adjudication.csv
npm run validation:merge-labels -- validation-dataset.jsonl labels.csv reviewed-dataset.jsonl
npm run validation:calibrate-thresholds -- reviewed-dataset.jsonl threshold-report.json
npm run validation:model-readiness -- reviewed-dataset.jsonl model-readiness-report.json
npm run validation:clinical-readiness -- reviewed-dataset.jsonl clinical-readiness-report.json
npm run validation:clinical-report -- clinical-readiness-report.json docs/validation/clinical-scale-agreement-YYYY-MM-DD.md
npm run validation:status
npm run release:check # lint + tests + build + release doc checks
```

Routes:

- `/` - main practice flow
- `/try` - standalone tracker demo

## Browser Requirements

- A modern browser with camera access.
- Permission for the front camera.
- WebAssembly support.
- WebGL / GPU support recommended for MediaPipe runtime performance.

If the model or camera is unavailable, the app still allows unscored guided practice.

## Tech Stack

- React 19
- Vite 8
- Tailwind CSS 4
- Recharts for progress charts
- Lucide React for icons
- Google MediaPipe Tasks Vision Face Landmarker, loaded at runtime from CDN
- IndexedDB for local persistence of sessions, profiles, and report images

## Release Gates

Run `npm run release:check` before shipping algorithm or data-schema changes. The
gate runs lint, the full unit test suite, the production build, and documentation
checks for:

- Medical disclaimer and non-diagnostic wording.
- Privacy/local-first wording for browser data, clinician bundle, and validation exports.
- Current validation status and remaining release risks in the roadmap.
- `docs/validation-status.json`, which must explicitly say whether reviewed datasets exist, whether production thresholds have been calibrated, and whether clinical-facing scores are allowed. Referenced calibration and clinical-scale agreement artifacts are also checked for the expected report markers.
- Runtime clinical-scale presentation policy, which reads `docs/validation-status.json` before app panels or reports can use clinical-facing wording.
- Clinical-scale readiness only counts rows with `sourceLabelSheetMode: blinded`
  plus explicitly blinded, independently clinician-assigned or adjudicated labels
  from the current clinical-scale estimator version. Valid primary HB,
  Sunnybrook, and eFACE total targets count scale by scale; stale-version,
  missing-version, unblinded, copied, rehearsal, non-clinician, uncertain,
  incomplete, or no-valid-primary-target rows are excluded and reported
  separately.
- Referenced clinical-scale agreement reports must include a reference-standard
  controls section, current estimator-version evidence, complete/minimum
  estimate evidence-tier controls, the 80% usable-movement coverage floor, and
  used/omitted movement input provenance, House-Brackmann required-input
  provenance, Sunnybrook/eFACE input-completeness provenance with complete
  scale-specific movement input for counted Sunnybrook/eFACE primary
  comparisons, plus complete resting-metric provenance, plus an eligible blinded
  independent label count meeting the minimum reviewed-assessment floor.
- `docs/validation-status.json` must list reviewer-agreement JSON artifacts in
  `clinicalScaleReviewerAgreementReports` before clinical-facing clinical-scale
  support can be enabled.
- Reviewer-agreement and adjudication CSVs must preserve current estimator
  version and estimate-evidence provenance for each reviewer sheet; stale,
  missing, mismatched, below-80%-coverage, missing movement provenance, or
  missing/incomplete scale-input or resting-metric provenance is a release
  blocker until recollected from qualifying current-version evidence.
- Reviewer-agreement reports must also block unblinded, non-independent,
  non-clinician, uncertain, copied, rehearsal, incomplete, or out-of-range
  reviewer rows, plus rows paired with insufficient estimate status, evidence
  tier, usable-movement coverage, used/omitted movement provenance, or
  scale-input/resting-metric provenance, before adjudication output can support
  readiness.
- Reviewer-agreement reports must compute primary agreement only from eligible
  reviewer pairs and must show at least 30 eligible paired labels for each
  enabled primary scale, zero excluded reviewer pairs, zero incomplete
  scale-specific estimate-input skips for enabled scales, at least 80% observed
  reviewer agreement, and a 95% Wilson lower bound meeting the configured 80%
  agreement floor for that scale.
- The primary House-Brackmann, Sunnybrook, and eFACE rows in referenced
  clinical-scale agreement reports must have 95% Wilson lower bounds meeting the
  configured 80% agreement floor.
- Referenced clinical-scale agreement reports must also include the
  House-Brackmann case-mix section with HB I-II, HB III-IV, and HB V-VI severity
  bands represented by at least three eligible labels per represented band.

Backup compatibility must remain rollback-safe:

- Legacy single-file JSON browser backups should still parse.
- Streamed JSONL browser backups should still parse.
- Non-restore exports such as clinician bundles or validation datasets must not be accepted as browser-data imports.
