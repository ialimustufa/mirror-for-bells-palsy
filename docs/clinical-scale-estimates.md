# Clinical Scale Estimates

Mirror can now derive optional clinical-scale estimates from a completed standard assessment. These values are deliberately stored as estimates, not clinician-assigned grades.

## Source Basis

- House-Brackmann is a 6-grade global facial nerve scale. University of Iowa's protocol summarizes grades I-VI and notes that HB evaluates the facial nerve trunk rather than distal branch-specific deficits: https://iowaprotocols.medicine.uiowa.edu/protocols/house-brackmann-facial-paralysis-scale
- Sunnybrook Facial Grading System combines rest, voluntary movement, and synkinesis. The one-page Sunnybrook form scores five standard expressions, weights voluntary movement by 4, weights resting symmetry by 5, and subtracts synkinesis from the composite: https://ehandboken.ous-hf.no/api/File/GetFile?entityId=230422&isLastVersion=false
- Reliability literature supports Sunnybrook as more granular than HB. A 2024 comparison reported moderate HB reliability and high Sunnybrook reliability, while noting that subjective clinician assessment still matters: https://pmc.ncbi.nlm.nih.gov/articles/PMC10895858/
- Video assessment literature describes Sunnybrook as a regional weighted 0-100 scale and notes that video-based synkinesis/resting components can be less reliable than voluntary movement: https://www.jmir.org/2019/4/e11109/PDF
- eFACE is a clinician-graded electronic facial paralysis assessment with static, dynamic, and synkinesis domains. Mirror only maps available standard-assessment proxies into an eFACE-style domain estimate; it does not replace the clinician-entered eFACE form.
- Wilson's score interval is used for binomial agreement uncertainty reporting rather than relying on a raw percentage alone: https://www.tandfonline.com/doi/abs/10.1080/01621459.1927.10502953
- BMJ guidance on external model validation emphasizes sample sizes large enough to estimate performance precisely and warns against simplistic rules of thumb: https://www.bmj.com/content/384/bmj-2023-074821

## Evidence Standard

Clinical scale estimates require:

- At least 80% usable standard-assessment movement coverage.
- Resting asymmetry metrics from neutral calibration.
- Usable or strong capture quality for scored movements when capture quality is present.

If the evidence standard is not met, Mirror saves `clinicalScales.status = "insufficient-data"` and does not emit scale values.

## Implemented Estimates

`clinicalScales.scales.houseBrackmann` maps the standard assessment into a conservative global HB estimate using:

- Sunnybrook composite estimate.
- Estimated eye-closure level.
- Resting asymmetry score.
- Coactivation/synkinesis estimate.
- Average standard-movement availability.

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

## Clinical Safety

These estimates are not diagnosis, prognosis, treatment advice, or validated endpoints. They remain disabled as clinical-facing validated scores while `docs/validation-status.json` has `clinicalFacingScoresAllowed: false`.
The app and printable report copy read that status through `src/domain/clinicalScalePresentation.js`, so the current release presents values as Mirror estimates even when the assessment evidence standard is met.
Users can hide optional clinical-scale estimates in Progress preferences. That
display setting affects assessment summaries, assessment history, and printable
reports; it does not erase stored assessment data or validation export fields.

Before these estimates can be presented as validated clinical grades, the repo needs clinician-reviewed validation data proving agreement with target HB, Sunnybrook, and eFACE ratings. The current release gate still fails closed for clinical-facing validated scoring until reviewed datasets exist.

## Validation Workflow

Validation dataset exports now include assessment-level `assessmentClinicalScale`
records whenever an included frame-sample session is a standard assessment. The
primary review workflow uses a blinded label sheet as described in
`docs/clinical-scale-review-protocol.md`. The normal label sheet can include
Mirror's current estimates in read-only reference columns for audit, but the
`--blinded` export hides those estimates for target assignment. The sheet has
`assessmentClinicalScale` rows with empty target columns for reviewer-entered:

- `houseBrackmannGrade`
- `sunnybrookComposite`
- `efaceTotal`
- Optional `efaceStatic`, `efaceDynamic`, and `efaceSynkinesis` domain scores

The validation evaluator compares Mirror estimates against reviewed labels. The
default minimum standard is:

- House-Brackmann: at least 80% of reviewed assessments within one HB grade.
- Sunnybrook composite: at least 80% within 10 points.
- eFACE total: at least 80% within 10 points.
- At least 30 reviewed assessment labels before any primary scale can pass.
- A Wilson 95% binomial confidence interval is reported for each agreement rate
  so reviewers can see the uncertainty around the observed percentage.

The evaluator reports each scale separately and fails closed when reviewed data is
missing, estimates are unavailable, or agreement is below the configured
threshold. Passing this tooling is still not the same as clinician assignment; it
only proves that Mirror estimates met the documented agreement target on the
reviewed local validation set.

After `npm run validation:clinical-readiness`, use
`npm run validation:clinical-report -- clinical-readiness-report.json docs/validation/clinical-scale-agreement-YYYY-MM-DD.md`
to create the human-readable clinical-scale agreement report. That Markdown
report packages the dataset summary, agreement table, Wilson intervals, missing
estimate counts, blocking reasons, and mismatch samples that a release reviewer
needs before any validation-status update.

The 30-assessment floor is still a local release gate, not a universal clinical
sample-size claim. Current clinical prediction-model validation guidance warns
against relying on small rule-of-thumb validation sets and recommends sample
sizes large enough to estimate performance precisely. Mirror therefore reports
confidence intervals and keeps `clinicalFacingScoresAllowed` disabled until a
reviewed dataset is actually available.
