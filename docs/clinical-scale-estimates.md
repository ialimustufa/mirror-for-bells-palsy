# Clinical Scale Estimates

Mirror can now derive optional clinical-scale estimates from a completed standard assessment. These values are deliberately stored as estimates, not clinician-assigned grades.

## Source Basis

- House-Brackmann is a 6-grade global facial nerve scale. University of Iowa's protocol summarizes grades I-VI and notes that HB evaluates the facial nerve trunk rather than distal branch-specific deficits: https://iowaprotocols.medicine.uiowa.edu/protocols/house-brackmann-facial-paralysis-scale
- The local HB case-mix gate groups the NCBI severity descriptions into I-II mild/normal, III-IV moderate, and V-VI severe/complete bands: https://www.ncbi.nlm.nih.gov/sites/books/NBK549815/table/article-21555.table1/
- Sunnybrook Facial Grading System combines rest, voluntary movement, and synkinesis. The one-page Sunnybrook form scores five standard expressions, weights voluntary movement by 4, weights resting symmetry by 5, and subtracts synkinesis from the composite: https://ehandboken.ous-hf.no/api/File/GetFile?entityId=230422&isLastVersion=false
- Reliability literature supports Sunnybrook as more granular than HB. A 2024 comparison reported moderate HB reliability and high Sunnybrook reliability, while noting that subjective clinician assessment still matters: https://pmc.ncbi.nlm.nih.gov/articles/PMC10895858/
- Video assessment literature describes Sunnybrook as a regional weighted 0-100 scale and notes that video-based synkinesis/resting components can be less reliable than voluntary movement: https://www.jmir.org/2019/4/e11109/PDF
- eFACE is a clinician-graded electronic facial paralysis assessment with static,
  dynamic, and synkinesis domains. The original validation paper describes a
  clinician-entered digital scale with strong reliability:
  https://pubmed.ncbi.nlm.nih.gov/26218397/
- eFACE domain and composite scores are reported on 0-100 scales in validation
  literature, and facial scales remain subjective enough that standardized
  lighting, head position, and trained review matter:
  https://link.springer.com/article/10.1007/s00405-023-08132-4
  Mirror therefore clamps its eFACE-style proxy outputs to 0-100 and does not
  replace the clinician-entered eFACE form.
- Wilson's score interval is used for binomial agreement uncertainty reporting rather than relying on a raw percentage alone: https://www.tandfonline.com/doi/abs/10.1080/01621459.1927.10502953
- TRIPOD+AI describes transparent reporting for studies that develop or evaluate prediction models, including machine-learning models: https://pubmed.ncbi.nlm.nih.gov/38626948/
- FDA Good Machine Learning Practice guidance describes lifecycle considerations for AI/ML medical devices: https://www.fda.gov/medical-devices/software-medical-device-samd/good-machine-learning-practice-medical-device-development-guiding-principles
- FDA/Health Canada/MHRA PCCP guidance describes bounded algorithm changes with verification, validation, monitoring, and performance criteria: https://www.fda.gov/medical-devices/software-medical-device-samd/predetermined-change-control-plans-machine-learning-enabled-medical-devices-guiding-principles
- BMJ guidance on external model validation emphasizes sample sizes large enough to estimate performance precisely and warns against simplistic rules of thumb: https://www.bmj.com/content/384/bmj-2023-074821

## Evidence Standard

Clinical scale estimates require:

- At least 80% usable standard-assessment movement coverage.
- Complete resting asymmetry metrics from neutral calibration: palpebral
  fissure, nasolabial/midface proxy, and oral commissure vertical position.
- Usable or strong capture quality for scored movements when capture quality is present.

If the evidence standard is not met, Mirror saves `clinicalScales.status = "insufficient-data"` and does not emit scale values.
When the 80% floor is met, Mirror also records an evidence tier:

- `complete-standard-assessment` when all five standard movements and resting
  metrics are available.
- `minimum-standard-assessment` when exactly the local 80% movement floor is met.
- `insufficient-standard-evidence` when estimates are blocked.

The tier appears in assessment panels and printable reports so a 4/5 movement
estimate is not presented with the same evidence strength as a complete 5/5
assessment.

The current clinical-scale estimator is v5. v5 records evidence tiers, clamps
eFACE-style proxy scores to the 0-100 range, excludes missing or weak-capture
movements from the scale formulas, and fails closed unless all required
resting/static metrics are present. Minimum-standard 4/5 estimates report omitted
movement IDs in `evidence.omittedMovementExerciseIds`, normalize Sunnybrook
voluntary/synkinesis totals from usable movements only, and preserve
required/available/missing resting metric keys in the evidence record. v5 also
omits the House-Brackmann estimate when gentle eye closure is the omitted
movement, rather than treating a missing eye-closure input as severe eye
closure. Assessment panels and printable reports show a scale-specific
unavailable note when this happens, while still showing any eligible Sunnybrook
and eFACE-style estimates from the same minimum-standard assessment. Clinical
release validation is stricter than display: Sunnybrook and eFACE primary-scale
agreement rows require complete scale-specific movement input, so normalized 4/5
Sunnybrook/eFACE estimates are counted as missing estimates for those scale
denominators instead of comparable agreement. Validation labels generated from
older v1, v2, v3, or v4 estimates are
stale and do not count toward the release agreement gate.

## Implemented Estimates

`clinicalScales.scales.houseBrackmann` maps the standard assessment into a conservative global HB estimate using:

- Sunnybrook composite estimate.
- Estimated eye-closure level.
- Resting asymmetry score.
- Coactivation/synkinesis estimate.
- Average standard-movement availability.
- A usable gentle-eye-closure movement is required; otherwise the HB estimate is
  omitted while other eligible scale estimates can still be shown.

`clinicalScales.scales.sunnybrook` estimates:

- Resting symmetry score from palpebral fissure, nasolabial/midface proxy, and oral commissure rest metrics.
- Voluntary movement score from eyebrow raise, gentle eye closure, open smile, nostril flare/snarl proxy, and lip pucker.
- Synkinesis score from quiet-region coactivation risk during the same movements.
- Composite score as `voluntaryMovementScore - restingSymmetryScore - synkinesisScore`.

`clinicalScales.scales.eface` estimates:

- Static score from rest asymmetry proxies.
- Dynamic score from the five standard movements currently captured by Mirror.
- Synkinesis score from quiet-region coactivation levels.
- Total score as the average of available static, dynamic, and synkinesis domain estimates.
- Static, dynamic, synkinesis, and total proxy scores are clamped to 0-100.

## Clinical Safety

These estimates are not diagnosis, prognosis, treatment advice, or validated endpoints. They remain disabled as clinical-facing validated scores while `docs/validation-status.json` has `clinicalFacingScoresAllowed: false`.
The app and printable report copy read that status through `src/domain/clinicalScalePresentation.js`, so the current release presents values as Mirror estimates even when the assessment evidence standard is met. The runtime presentation gate also requires the explicit `clinical-scale-agreement-reviewed` status, a schema-v1 dated status file, reviewed dataset/frame/assessment coverage, ready exercise coverage from threshold calibration, clinical and reviewer agreement report paths, threshold report paths, and the status file's minimum standard before using clinical-facing wording: 30 reviewed assessments, 10 distinct validation cases, 80% observed agreement, an 80% Wilson lower bound, 80% usable movement coverage, Wilson 95% confidence intervals, the current clinical-scale estimator version, and the House-Brackmann severity-band floors must all remain intact. The status file must record per-scale `clinicalScaleAvailability` evidence for House-Brackmann, Sunnybrook, and eFACE before that scale can be shown as support: the clinical agreement report path, reviewer agreement report path, current estimator version, reviewed-label count, distinct-case count, observed agreement rate, Wilson lower bound, reviewer paired-label count, reviewer distinct-case count, reviewer observed agreement rate, and reviewer Wilson lower bound. These fields let future releases keep a weaker scale in estimate mode while a separately reviewed scale is shown as clinical-scale support, but only after the global reviewed-data release gate is enabled. A global clinical-facing status is invalid unless at least one primary scale is explicitly enabled.
Users can hide optional clinical-scale estimates in Progress preferences. That
display setting affects assessment summaries, assessment history, and printable
reports; it does not erase stored assessment data or validation export fields.

Before these estimates can be presented as validated clinical grades, the repo needs clinician-reviewed validation data proving agreement with target HB, Sunnybrook, and eFACE ratings. The current release gate still fails closed for clinical-facing validated scoring until reviewed datasets exist.
Structured clinical-scale agreement and reviewer-agreement JSON reports used by
that gate must declare schema version 1 so stale machine-readable evidence is
rejected instead of silently interpreted as current. The same gate also
cross-checks observed agreement rates against their within-tolerance counts and
label or paired-label denominators, then recomputes the reported Wilson score
intervals from those counts. Referenced clinical-scale agreement,
reviewer-agreement, clinical review package verification, and threshold
calibration artifacts must include UTC ISO `generatedAt` timestamps, and
`docs/validation-status.json` must be dated on or after those artifact
generation dates.

## Validation Workflow

Validation dataset exports now include assessment-level `assessmentClinicalScale`
records whenever an included frame-sample session is a standard assessment. The
primary review workflow uses a blinded label sheet as described in
`docs/clinical-scale-review-protocol.md`. Use
`npm run validation:clinical-review-package -- validation-dataset.jsonl clinical-review-package`
to create an auditable reviewer handoff with a source dataset hash,
`manifest.json`, `blinded-labels.csv`, and `reviewer-instructions.md`. After
labels are returned, run
`npm run validation:verify-clinical-review-package -- validation-dataset.jsonl clinical-review-package review-package-verification.json`
before merging labels so the source hash, row identities, hidden estimate-value
columns, and read-only estimate provenance are checked against the blinded
package. The
normal label sheet can include
Mirror's current estimates in read-only reference columns for audit, but the
`--blinded` export hides those estimates for target assignment. The sheet has
`assessmentClinicalScale` rows with empty target columns for reviewer-entered:

- `houseBrackmannGrade`
- `sunnybrookComposite`
- `efaceTotal`
- Optional `efaceStatic`, `efaceDynamic`, and `efaceSynkinesis` domain scores
- `validationCaseId`, `sourceLabelSheetMode`, `reviewBlinded`, `labelSource`,
  `reviewerId`, `reviewerRole`, `clinicianConfidence`, and `reviewedAt`
  metadata used to prove that a target label came from a blinded sheet, belongs
  to a pseudonymous validation case, has a pseudonymous reviewer/adjudicator
  identity, was independently clinician-assigned or adjudicated, and has
  explicit high/medium reviewer confidence before it is counted by readiness
  tooling

Validation label schema v8 lists the three primary scale fields as
`primaryTargetFields`, not all-or-nothing required fields. A row needs at least
one valid primary target to count, and each valid target counts only for its own
scale's denominator after the row passes required metadata gates. The schema
also requires `validationCaseId`, explicit high/medium `clinicianConfidence`,
`sourceLabelSheetMode`, `reviewBlinded`, `labelSource`, `reviewerId`, and
`reviewerRole` for rows intended to count toward readiness.

Normal, non-blinded label sheets also include read-only estimate value columns.
Blinded label sheets hide the estimate values, but preserve non-revealing
provenance columns for `estimateStatus`, `estimateEvidenceTier`,
`estimateUsableMovementCoverageRatio`, `estimateUsableMovementCount`,
`estimateRequiredMovementCount`, `estimateUsedMovementExerciseIds`,
`estimateOmittedMovementExerciseIds`,
`estimateCalculationUsesOnlyUsableMovements`,
`estimateHouseBrackmannInputComplete`,
`estimateHouseBrackmannRequiredExerciseIds`,
`estimateHouseBrackmannUsedExerciseIds`,
`estimateHouseBrackmannMissingRequiredExerciseIds`,
`estimateSunnybrookInputComplete`,
`estimateSunnybrookUsedExerciseIds`,
`estimateSunnybrookOmittedExerciseIds`,
`estimateEfaceInputComplete`,
`estimateEfaceUsedExerciseIds`,
`estimateEfaceOmittedExerciseIds`,
`estimateRequiredRestingMetricKeys`, `estimateAvailableRestingMetricKeys`,
`estimateMissingRestingMetricKeys`,
`estimateCalculationUsesCompleteRestingMetrics`, and
`clinicalScaleEstimateVersion` so release tooling can prove the row came from
qualifying current-version evidence with the exact v5 estimator inputs.
House-Brackmann agreement treats an estimate as missing unless these provenance
fields or the overall used-movement provenance show that gentle eye closure was
used. Sunnybrook and eFACE rows preserve their own used/omitted movement lists
so a 4/5 normalized estimate is auditable without inferring scale inputs from
unrelated columns. For release agreement, those incomplete Sunnybrook/eFACE
primary estimates are still reported in the scale denominator, but as missing
estimates rather than comparable agreement. Assessment panels and printable
reports show scale-specific input notes for available Sunnybrook/eFACE estimates
when a minimum-standard assessment omits one movement.

The validation evaluator compares Mirror estimates against reviewed labels. The
default minimum standard is:

- House-Brackmann: at least 80% observed agreement within one HB grade.
- Sunnybrook composite: at least 80% observed agreement within 10 points.
- eFACE total: at least 80% observed agreement within 10 points.
- The Wilson 95% lower confidence bound for each primary agreement rate must
  also be at least 80%.
- At least 30 reviewed assessment labels before any primary scale can pass.
- At least 10 distinct pseudonymous validation cases through `validationCaseId`
  before clinical-scale readiness can pass.
- House-Brackmann case mix must cover all three local severity bands with at
  least three comparable estimate/label pairs in each band: HB I-II mild/normal,
  HB III-IV moderate, and HB V-VI severe/complete. Rows with missing
  House-Brackmann estimates do not satisfy case mix.
- Reviewed labels only count when the row preserves `sourceLabelSheetMode:
  blinded`, is explicitly marked blinded to Mirror estimates, has an independent
  clinician-assigned or adjudicated `labelSource`,
  has the current clinical-scale estimator `version`, has a recognized clinician
  or adjudicated reviewer role, has `clinicianConfidence` explicitly set to
  `high` or `medium`, and contains a valid target for the primary scale being
  counted. Missing another primary target does not remove the valid target from
  its own denominator. The row must also have a stable assessment id that appears
  only once; duplicate or missing assessment ids are excluded and block release
  readiness so a single reviewed assessment cannot inflate denominators. It must
  also have a pseudonymous
  `validationCaseId`; missing case ids are excluded, and repeated assessments
  from the same case cannot satisfy the distinct-case floor by themselves. It
  must have a pseudonymous `reviewerId`; missing reviewer ids are excluded
  because the reference-standard package cannot prove reviewer identity.
  The paired Mirror estimate must also have `status: estimated`, a v5
  `complete-standard-assessment` or `minimum-standard-assessment` evidence tier,
  at least 80% usable movement coverage, used/omitted movement exercise IDs that
  match the coverage counts, and
  `estimateCalculationUsesOnlyUsableMovements: true`. It must also preserve
  Sunnybrook/eFACE input-completeness provenance and
  required/available/missing resting metric keys proving all required rest
  metrics were available, with
  `estimateCalculationUsesCompleteRestingMetrics: true`. Sunnybrook and eFACE
  primary-scale comparisons require that provenance to show complete
  scale-specific movement input; normalized 4/5 estimates remain displayable
  Mirror estimates but count as missing estimates for those release denominators.
  Missing or invalid
  estimates are reported as missing estimates in that scale's denominator rather
  than excluding other valid scale labels on the row.
  Development rehearsal, user, patient, caregiver, copied, algorithmic,
  stale-version, missing-version, unblinded, incomplete, and rows with no valid
  primary target are excluded from the readiness denominators and reported as
  excluded label rows.
- A Wilson 95% binomial confidence interval is reported for each agreement rate
  and the lower bound is a blocking release gate, so a raw 80% observed rate on
  a small validation set cannot pass by itself.

The evaluator reports each scale separately and fails closed when reviewed data is
missing, estimates are unavailable, observed agreement is below the configured
threshold, or the Wilson lower bound is below the configured threshold. Passing
this tooling is still not the same as clinician assignment; it only proves that
Mirror estimates met the documented agreement target on the reviewed local
validation set.
Each scale row also includes an agreement sample plan. The plan reports the
current denominator, current within-tolerance count, required successes at the
current denominator when the reviewed-label floor has been reached, and the
minimum number of additional perfect eligible labels needed to clear the
observed-agreement and Wilson lower-bound gates. This is a reviewer planning aid
only; it assumes future rows are current-version, non-missing estimates within
tolerance and does not replace collecting reviewed clinical data.

After `npm run validation:clinical-readiness`, use
`npm run validation:clinical-report -- clinical-readiness-report.json docs/validation/clinical-scale-agreement-YYYY-MM-DD.md`
to create the human-readable clinical-scale agreement report, or use a `.json`
output path to create the same release evidence as a structured artifact for
machine checking. The report packages the dataset summary, excluded-label reason
counts, agreement table/rows, Wilson intervals, missing estimate counts,
scale-specific label gaps, duplicate/missing assessment-id counts,
estimator-version counts, distinct validation-case counts, reference-standard
control statements, House-Brackmann case-mix table, agreement sample plan,
scale-specific availability recommendations, blocking reasons, and mismatch
samples that a release reviewer needs before any validation-status update. The
release status artifact checker requires the Markdown or JSON report
to document the eligible blinded independent label count, all three
House-Brackmann severity bands, the primary-scale Wilson lower bounds, the
current clinical-scale estimator version, the 80% usable-movement coverage
floor, the complete/minimum estimate evidence-tier gate, complete resting-metric
provenance, and the `sourceLabelSheetMode`/`reviewBlinded`/estimator
`version`/`labelSource`/`validationCaseId`/`reviewerId` controls before a
clinical agreement artifact can support clinical-facing score availability.
Clinical-facing availability also requires a reviewer-agreement JSON artifact in
`clinicalScaleReviewerAgreementReports` showing current-version, blinded,
independent clinician sheets with qualifying complete/minimum estimate evidence,
at least 80% usable movement coverage, paired labels for every enabled primary
scale meeting the same reviewed-assessment floor, at least 10 distinct
pseudonymous validation cases, exactly one pseudonymous reviewer id in each raw
reviewer sheet with no reviewer-id overlap between sheets, at least 80%
observed reviewer agreement, Wilson lower-bound reviewer agreement meeting the
configured 80% standard, House-Brackmann reviewer case mix with HB I-II, HB
III-IV, and HB V-VI each represented by enough same-band eligible reviewer
pairs, and no excluded reviewer-pair, reviewer-sheet metadata, or
estimate-evidence blockers. The estimate-evidence blockers include missing or
inconsistent movement provenance and missing or incomplete resting-metric
provenance. A disabled primary scale can remain an estimate
while an enabled scale is released as support, but the enabled scale still needs
its own passing clinical-agreement row and reviewer-agreement row.
The runtime presentation policy fails closed if the machine-readable status file
weakens the documented minimum standard, even when the high-level release
booleans and artifact paths are present.

The 30-assessment floor is still a local release gate, not a universal clinical
sample-size claim. Current clinical prediction-model validation guidance warns
against relying on small rule-of-thumb validation sets and recommends sample
sizes large enough to estimate performance precisely. Mirror therefore reports
confidence intervals and keeps `clinicalFacingScoresAllowed` disabled until a
reviewed dataset is actually available.

Estimator-version provenance follows current AI/ML medical-software lifecycle
guidance: TRIPOD+AI emphasizes transparent model evaluation reporting, while FDA
GMLP and PCCP guidance describe validation, monitoring, and change control across
algorithm updates. A reviewed agreement report therefore applies only to the
clinical-scale estimator version it names.
