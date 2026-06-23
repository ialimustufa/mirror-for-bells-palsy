# Clinical Scale Estimates

Mirror can now derive optional clinical-scale estimates from a completed standard assessment. These values are deliberately stored as estimates, not clinician-assigned grades.

## Source Basis

- House-Brackmann is a 6-grade global facial nerve scale. University of Iowa's protocol summarizes grades I-VI and notes that HB evaluates the facial nerve trunk rather than distal branch-specific deficits: https://iowaprotocols.medicine.uiowa.edu/protocols/house-brackmann-facial-paralysis-scale
- Sunnybrook Facial Grading System combines rest, voluntary movement, and synkinesis. The one-page Sunnybrook form scores five standard expressions, weights voluntary movement by 4, weights resting symmetry by 5, and subtracts synkinesis from the composite: https://ehandboken.ous-hf.no/api/File/GetFile?entityId=230422&isLastVersion=false
- Reliability literature supports Sunnybrook as more granular than HB. A 2024 comparison reported moderate HB reliability and high Sunnybrook reliability, while noting that subjective clinician assessment still matters: https://pmc.ncbi.nlm.nih.gov/articles/PMC10895858/
- Video assessment literature describes Sunnybrook as a regional weighted 0-100 scale and notes that video-based synkinesis/resting components can be less reliable than voluntary movement: https://www.jmir.org/2019/4/e11109/PDF
- eFACE is a clinician-graded electronic facial paralysis assessment with static, dynamic, and synkinesis domains. Mirror only maps available standard-assessment proxies into an eFACE-style domain estimate; it does not replace the clinician-entered eFACE form.

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

Before these estimates can be presented as validated clinical grades, the repo needs clinician-reviewed validation data proving agreement with target HB, Sunnybrook, and eFACE ratings. The current release gate still fails closed for clinical-facing validated scoring until reviewed datasets exist.
