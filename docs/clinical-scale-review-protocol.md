# Clinical Scale Review Protocol

This protocol defines how Mirror clinical-scale estimates can be reviewed before
any release status claims that House-Brackmann, Sunnybrook, or eFACE-style values
are ready for broader availability. It is a validation workflow for Mirror
estimates, not a medical-device protocol and not a substitute for clinician
assessment.

## Scope

The protocol applies to validation datasets exported from standard assessment
sessions. It covers:

- House-Brackmann grade target labels.
- Sunnybrook composite target labels.
- eFACE total target labels.
- Optional eFACE static, dynamic, and synkinesis domain labels.

Mirror estimates remain estimates unless the release status explicitly says
otherwise. Even a passing readiness report does not turn an estimate into a
clinician-assigned grade.

## Reviewer Materials

Use a blinded label sheet for primary review:

```bash
npm run validation:label-sheet -- validation-dataset.jsonl blinded-labels.csv --blinded
```

The blinded sheet preserves record ids and empty target columns but hides Mirror's
estimate columns. This reduces reviewer anchoring on the algorithm output. The
unblinded sheet may be generated after labels are merged for audit and error
analysis, but it must not be used for initial target assignment.

Reviewer labels are merged back into a reviewed dataset:

```bash
npm run validation:merge-labels -- validation-dataset.jsonl blinded-labels.csv reviewed-dataset.jsonl
```

For rows intended to count toward clinical-scale readiness, reviewers must also
fill the review metadata fields:

- `reviewBlinded`: `yes` only when Mirror estimate columns were hidden before
  target assignment.
- `labelSource`: `clinician-assigned` for an independent clinician label, or
  `adjudicated-consensus` after a documented adjudication step.
- `reviewerRole`: the clinical role or adjudication role.
- `clinicianConfidence`: leave blank or use a confident/high-confidence value;
  rows marked `uncertain` are excluded.

## Inclusion Criteria

An assessment can be used for clinical-scale agreement only when:

- It is a standard assessment export row with `section: "assessmentClinicalScale"`.
- The source session has enough visual evidence for a reviewer to assign the
  requested target labels.
- The reviewer can identify the intended movement set and affected side from the
  dataset context or accompanying review package.
- The row is labeled by a clinician, or by a non-clinician only for development
  rehearsal clearly excluded from clinical readiness counts.

## Exclusion Criteria

Exclude an assessment row from clinical readiness counts when:

- The reviewer marks confidence as `uncertain`.
- The visible assessment is incomplete or not interpretable.
- The reviewer could see Mirror's estimate before assigning the primary target.
- The label was copied from the Mirror estimate rather than independently
  assigned.
- The row lacks `reviewBlinded: yes` or equivalent explicit blinded-review
  metadata.
- The row lacks an independent `labelSource`, or the source is marked as copied
  from Mirror, algorithmic, automated, self-reported, demo, test, or rehearsal
  data.
- The row is missing a recognized clinician/adjudication `reviewerRole`.
- The `reviewerRole` is marked as development rehearsal, developer, user,
  patient, caregiver, demo, test, or other non-clinical review.
- Any primary target is missing or outside its valid range:
  `houseBrackmannGrade` I-VI/1-6, `sunnybrookComposite` 0-100, and
  `efaceTotal` 0-100.

The evaluator enforces these exclusions before counting reviewed clinical-scale
assessments. Excluded label rows are reported separately with reason counts so a
failed readiness gate can be audited without treating rehearsal data as clinical
evidence.

## Review Process

1. Export a validation dataset from Progress after local data capture has been
   enabled during standard assessments, or after standard assessments have been
   completed when the immediate task is clinical-scale target labeling.
2. Generate the blinded label sheet with `--blinded`.
3. Assign target labels from the blinded sheet and the review materials.
4. Merge the labels back into a reviewed JSONL dataset.
5. Run:

```bash
npm run validate:dataset -- reviewed-dataset.jsonl validation-report.json
npm run validation:clinical-readiness -- validation-report.json clinical-readiness-report.json
```

6. Inspect the clinical readiness report. Passing requires all primary scales to
   meet the configured observed agreement standard.
7. Only after human review of the dataset, label process, and readiness report
   should `docs/validation-status.json` be updated.

## Minimum Standard

Clinical-scale readiness uses the machine-readable standard in
`docs/validation-status.json`:

- At least 30 reviewed clinical-scale assessment labels.
- At least 80% House-Brackmann agreement within one grade.
- At least 80% Sunnybrook composite agreement within 10 points.
- At least 80% eFACE total agreement within 10 points.
- Only eligible blinded, independently clinician-assigned or adjudicated rows
  with valid primary labels count toward the reviewed-assessment floor and
  per-scale agreement denominators.
- Wilson 95% confidence interval reported for each primary agreement rate.

The Wilson interval is reported because a raw observed percentage can hide
uncertainty in small validation sets. The 30-assessment floor is a local release
gate, not a universal clinical sample-size claim.

## Adjudication

If multiple reviewers label the same assessment:

- Keep each raw reviewer sheet outside the production dataset until adjudication.
- Run `npm run validation:reviewer-agreement -- reviewer-a.csv reviewer-b.csv adjudication.csv`
  to compare reviewer labels and create an adjudication queue.
- Resolve disagreements in a separate adjudicated sheet.
- Document the adjudication rule in the readiness report notes.
- Do not mix raw reviewer rows and adjudicated rows for the same assessment in a
  single readiness dataset.

The reviewer-agreement report uses the same tolerance targets as the clinical
validation gate: House-Brackmann within one grade, Sunnybrook composite within
10 points, and eFACE totals/domains within 10 points. The adjudication sheet keeps
both raw reviewer values in audit columns and leaves the mergeable target columns
blank until a consensus label is entered.

## Required Artifacts Before Enabling Clinical-Facing Scores

Before `clinicalFacingScoresAllowed` can be set to `true`, the repo must have:

- A reviewed dataset summary with at least 30 eligible assessment labels.
- A clinical-scale validation report from `npm run validate:dataset`.
- A clinical-scale readiness report from
  `npm run validation:clinical-readiness`.
- Documentation of whether labels were blinded and whether adjudication was used.
- A human-reviewed update to `docs/validation-status.json` referencing the
  agreement report artifacts.

Until those artifacts exist, Mirror must keep clinical-scale values labeled as
Mirror estimates only.

The release gate runs `npm run validation:status`, which verifies that referenced
clinical-scale agreement reports exist and contain a passing observed-standard
status, all three primary scale rows, Wilson interval reporting, explicit
reference-standard controls, an eligible blinded independent label count meeting
the minimum reviewed-assessment floor, and release-control text. A status update
that only changes counts or report paths without matching artifacts must fail the
release check.

## References

- House-Brackmann protocol summary: https://iowaprotocols.medicine.uiowa.edu/protocols/house-brackmann-facial-paralysis-scale
- Sunnybrook scoring form: https://ehandboken.ous-hf.no/api/File/GetFile?entityId=230422&isLastVersion=false
- eFACE validation abstract: https://pubmed.ncbi.nlm.nih.gov/26218397/
- Wilson score interval: https://www.tandfonline.com/doi/abs/10.1080/01621459.1927.10502953
- External validation sample-size guidance: https://www.bmj.com/content/384/bmj-2023-074821
