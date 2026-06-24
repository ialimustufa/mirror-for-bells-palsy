import assert from "node:assert/strict";
import test from "node:test";
import {
  compareClinicalScaleReviewerLabels,
  createClinicalScaleAdjudicationCsv,
} from "../src/ml/clinicalScaleReviewerAgreement.js";
import { mergeValidationLabels, parseCsv } from "../src/ml/validationLabels.js";

function reviewerCsv(rows) {
  return [
    "rowType,sampleId,assessmentId,sessionId,sessionTs,date,houseBrackmannGrade,sunnybrookComposite,efaceTotal,efaceStatic,efaceDynamic,efaceSynkinesis,clinicianConfidence,reviewerRole,reviewedAt,notes",
    ...rows.map((row) => [
      "assessmentClinicalScale",
      "",
      row.assessmentId,
      row.sessionId ?? row.assessmentId.replace(":clinical-scale", ""),
      row.sessionTs ?? "",
      row.date ?? "2026-06-24",
      row.houseBrackmannGrade ?? "",
      row.sunnybrookComposite ?? "",
      row.efaceTotal ?? "",
      row.efaceStatic ?? "",
      row.efaceDynamic ?? "",
      row.efaceSynkinesis ?? "",
      row.clinicianConfidence ?? "high",
      "clinician",
      "2026-06-24T10:00:00.000Z",
      row.notes ?? "",
    ].join(",")),
  ].join("\n");
}

test("clinical-scale reviewer agreement reports per-scale agreement and adjudication rows", () => {
  const reviewerA = reviewerCsv([
    { assessmentId: "assessment-1:clinical-scale", houseBrackmannGrade: "III", sunnybrookComposite: 76, efaceTotal: 73, efaceStatic: 80 },
    { assessmentId: "assessment-2:clinical-scale", houseBrackmannGrade: "II", sunnybrookComposite: 88, efaceTotal: 86 },
    { assessmentId: "assessment-3:clinical-scale", houseBrackmannGrade: "V", sunnybrookComposite: 48, efaceTotal: 51 },
  ]);
  const reviewerB = reviewerCsv([
    { assessmentId: "assessment-1:clinical-scale", houseBrackmannGrade: "III", sunnybrookComposite: 80, efaceTotal: 79, efaceStatic: 82 },
    { assessmentId: "assessment-2:clinical-scale", houseBrackmannGrade: "IV", sunnybrookComposite: 72, efaceTotal: 70 },
    { assessmentId: "assessment-4:clinical-scale", houseBrackmannGrade: "II", sunnybrookComposite: 91, efaceTotal: 87 },
  ]);

  const report = compareClinicalScaleReviewerLabels(reviewerA, reviewerB, {
    generatedAt: "2026-06-24T12:00:00.000Z",
    reviewerA: "clinician-a",
    reviewerB: "clinician-b",
  });

  assert.equal(report.kind, "mirror-clinical-scale-reviewer-agreement-report");
  assert.equal(report.summary.reviewerAAssessmentCount, 3);
  assert.equal(report.summary.reviewerBAssessmentCount, 3);
  assert.equal(report.summary.comparedAssessmentCount, 4);
  assert.equal(report.summary.adjudicationRequiredCount, 4);
  assert.equal(report.byScale.houseBrackmannGrade.pairedCount, 2);
  assert.equal(report.byScale.houseBrackmannGrade.exactMatchCount, 1);
  assert.equal(report.byScale.houseBrackmannGrade.withinToleranceCount, 1);
  assert.equal(report.byScale.houseBrackmannGrade.withinToleranceRate, 0.5);
  assert.equal(report.byScale.sunnybrookComposite.withinToleranceCount, 1);
  assert.equal(report.byScale.sunnybrookComposite.missingReviewerBCount, 1);
  assert.equal(report.byScale.efaceStatic.pairedCount, 1);
  assert.match(report.adjudicationRows.find((row) => row.assessmentId === "assessment-2:clinical-scale").disagreementSummary, /outside tolerance/);
});

test("clinical-scale adjudication CSV preserves raw reviewer labels and can be merged after adjudication", () => {
  const reviewerA = reviewerCsv([
    { assessmentId: "assessment-1:clinical-scale", houseBrackmannGrade: "III", sunnybrookComposite: 76, efaceTotal: 73, notes: "A note" },
  ]);
  const reviewerB = reviewerCsv([
    { assessmentId: "assessment-1:clinical-scale", houseBrackmannGrade: "IV", sunnybrookComposite: 70, efaceTotal: 62, notes: "B note" },
  ]);
  const report = compareClinicalScaleReviewerLabels(reviewerA, reviewerB);
  const adjudicationCsv = createClinicalScaleAdjudicationCsv(report);
  const parsed = parseCsv(adjudicationCsv);
  const header = parsed[0];
  const row = parsed[1];
  const index = Object.fromEntries(header.map((column, columnIndex) => [column, columnIndex]));

  assert.equal(row[index.assessmentId], "assessment-1:clinical-scale");
  assert.equal(row[index.houseBrackmannGrade], "");
  assert.equal(row[index.reviewerAHouseBrackmannGrade], "III");
  assert.equal(row[index.reviewerBHouseBrackmannGrade], "IV");
  assert.equal(row[index.reviewerANotes], "A note");
  assert.equal(row[index.reviewerBNotes], "B note");
  assert.match(row[index.disagreementSummary], /House-Brackmann/);

  row[index.houseBrackmannGrade] = "III";
  row[index.sunnybrookComposite] = "74";
  row[index.efaceTotal] = "70";
  row[index.clinicianConfidence] = "high";
  row[index.reviewBlinded] = "yes";
  row[index.labelSource] = "adjudicated-consensus";
  row[index.reviewerRole] = "clinician";
  row[index.notes] = "adjudicated consensus";
  const filledCsv = [header, row].map((cells) => cells.join(",")).join("\n");
  const merged = mergeValidationLabels([
    { kind: "mirror-validation-dataset-jsonl" },
    {
      section: "assessmentClinicalScale",
      record: {
        id: "assessment-1:clinical-scale",
        label: {},
      },
    },
  ], filledCsv);

  assert.equal(merged.updatedAssessmentClinicalScaleCount, 1);
  assert.equal(merged.records[1].record.label.houseBrackmannGrade, "III");
  assert.equal(merged.records[1].record.label.sunnybrookComposite, "74");
  assert.equal(merged.records[1].record.label.efaceTotal, "70");
  assert.equal(merged.records[1].record.label.reviewBlinded, "yes");
  assert.equal(merged.records[1].record.label.labelSource, "adjudicated-consensus");
  assert.equal(merged.records[1].record.label.notes, "adjudicated consensus");
});
