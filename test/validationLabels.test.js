import assert from "node:assert/strict";
import test from "node:test";
import { createValidationLabelCsv, mergeValidationLabels, parseCsv, validationLabelRows } from "../src/ml/validationLabels.js";
import { CLINICAL_SCALE_ESTIMATE_VERSION } from "../src/domain/clinicalScales.js";

function sampleRecords() {
  return [
    { kind: "mirror-validation-dataset-jsonl" },
    {
      section: "frameSample",
      record: {
        id: "sample-1",
        sessionId: "session-1",
        exerciseId: "closed-smile",
        phase: "hold",
        ts: 100,
        repIndex: 0,
        sampleIndex: 2,
        label: {
          intendedMovement: "closed-smile",
          affectedSide: "left",
          quality: null,
          visibleMovementLevel: null,
          coactivationNotes: "",
          notes: "",
        },
        frame: { id: "sample-1", sessionId: "session-1", exerciseId: "closed-smile", phase: "hold" },
      },
    },
    {
      section: "assessmentClinicalScale",
      record: {
        id: "assessment-1:clinical-scale",
        sessionId: "assessment-1",
        sessionTs: 200,
        date: "2026-06-23",
        kind: "assessment-clinical-scale",
        estimate: {
          status: "estimated",
          version: CLINICAL_SCALE_ESTIMATE_VERSION,
          evidence: {
            tier: "complete-standard-assessment",
            label: "Complete standard-assessment evidence",
          },
          coverage: {
            usableMovementCount: 5,
            requiredMovementCount: 5,
            ratio: 1,
          },
          scales: {
            houseBrackmann: { grade: "III", numericGrade: 3 },
            sunnybrook: { compositeScore: 72 },
            eface: { totalScore: 68, staticScore: 80, dynamicScore: 70, synkinesisScore: 54 },
          },
        },
        label: {
          houseBrackmannGrade: null,
          sunnybrookComposite: null,
          efaceTotal: null,
          reviewBlinded: null,
          labelSource: null,
          notes: "",
        },
      },
    },
  ];
}

test("validation label sheet exports frame sample and clinical scale label rows", () => {
  const rows = validationLabelRows(sampleRecords());
  const csv = createValidationLabelCsv(sampleRecords());
  const parsed = parseCsv(csv);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].rowType, "frameSample");
  assert.equal(rows[0].sampleId, "sample-1");
  assert.equal(rows[0].intendedMovement, "closed-smile");
  assert.equal(rows[1].rowType, "assessmentClinicalScale");
  assert.equal(rows[1].assessmentId, "assessment-1:clinical-scale");
  assert.equal(rows[1].estimatedHouseBrackmannGrade, "III");
  assert.equal(rows[1].estimatedSunnybrookComposite, 72);
  assert.equal(rows[1].estimateEvidenceTier, "complete-standard-assessment");
  assert.equal(rows[1].estimateUsableMovementCoverageRatio, 1);
  assert.equal(rows[1].estimateUsableMovementCount, 5);
  assert.equal(rows[1].estimateRequiredMovementCount, 5);
  assert.equal(rows[1].clinicalScaleEstimateVersion, CLINICAL_SCALE_ESTIMATE_VERSION);
  assert.equal(rows[1].sourceLabelSheetMode, "unblinded");
  assert.equal(rows[1].reviewBlinded, "");
  assert.equal(rows[1].labelSource, "");
  assert.equal(parsed[0][0], "rowType");
  assert.equal(parsed[1][0], "frameSample");
  assert.equal(parsed[2][0], "assessmentClinicalScale");
});

test("validation label sheet can hide Mirror estimates for blinded review", () => {
  const rows = validationLabelRows(sampleRecords(), { includeEstimateColumns: false });
  const csv = createValidationLabelCsv(sampleRecords(), { includeEstimateColumns: false });
  const parsed = parseCsv(csv);
  const header = parsed[0];
  const clinicalRow = parsed[2];
  const index = Object.fromEntries(header.map((column, columnIndex) => [column, columnIndex]));

  assert.equal(rows[1].rowType, "assessmentClinicalScale");
  assert.equal(rows[1].assessmentId, "assessment-1:clinical-scale");
  assert.equal(rows[1].estimateStatus, "estimated");
  assert.equal(rows[1].estimateEvidenceTier, "complete-standard-assessment");
  assert.equal(rows[1].estimateUsableMovementCoverageRatio, 1);
  assert.equal(rows[1].estimateUsableMovementCount, 5);
  assert.equal(rows[1].estimateRequiredMovementCount, 5);
  assert.equal(rows[1].clinicalScaleEstimateVersion, CLINICAL_SCALE_ESTIMATE_VERSION);
  assert.equal(rows[1].estimatedHouseBrackmannGrade, "");
  assert.equal(rows[1].estimatedSunnybrookComposite, "");
  assert.equal(rows[1].houseBrackmannGrade, "");
  assert.equal(rows[1].sourceLabelSheetMode, "blinded");
  assert.equal(rows[1].reviewBlinded, "");
  assert.equal(rows[1].labelSource, "");
  assert.equal(clinicalRow[index.estimatedHouseBrackmannGrade], "");
  assert.equal(clinicalRow[index.clinicalScaleEstimateVersion], String(CLINICAL_SCALE_ESTIMATE_VERSION));
  assert.equal(clinicalRow[index.estimatedSunnybrookComposite], "");
  assert.equal(clinicalRow[index.estimateStatus], "estimated");
  assert.equal(clinicalRow[index.estimateEvidenceTier], "complete-standard-assessment");
  assert.equal(clinicalRow[index.estimateUsableMovementCoverageRatio], "1");
  assert.equal(clinicalRow[index.houseBrackmannGrade], "");
  assert.equal(clinicalRow[index.sourceLabelSheetMode], "blinded");
  assert.equal(clinicalRow[index.reviewBlinded], "");
  assert.equal(clinicalRow[index.labelSource], "");
});

test("validation label merge updates reviewed fields from CSV", () => {
  const csv = [
    "rowType,sampleId,assessmentId,quality,visibleMovementLevel,coactivationNotes,houseBrackmannGrade,sunnybrookComposite,efaceTotal,efaceStatic,efaceDynamic,efaceSynkinesis,clinicianConfidence,sourceLabelSheetMode,reviewBlinded,labelSource,reviewerRole,reviewedAt,notes",
    'frameSample,sample-1,,strong,moderate,"eye relaxed, mouth moved",,,,,,,,,,,clinician,2026-06-23T10:00:00.000Z,"usable label"',
    "assessmentClinicalScale,,assessment-1:clinical-scale,,,,II,82,79,91,77,69,high,blinded,yes,clinician-assigned,clinician,2026-06-23T10:01:00.000Z,reviewed scale labels",
  ].join("\n");

  const merged = mergeValidationLabels(sampleRecords(), csv);
  const label = merged.records[1].record.label;
  const clinicalLabel = merged.records[2].record.label;

  assert.equal(merged.updatedCount, 2);
  assert.equal(merged.updatedFrameCount, 1);
  assert.equal(merged.updatedAssessmentClinicalScaleCount, 1);
  assert.equal(label.intendedMovement, "closed-smile");
  assert.equal(label.affectedSide, "left");
  assert.equal(label.quality, "strong");
  assert.equal(label.visibleMovementLevel, "moderate");
  assert.equal(label.coactivationNotes, "eye relaxed, mouth moved");
  assert.equal(label.reviewerRole, "clinician");
  assert.equal(label.notes, "usable label");
  assert.equal(clinicalLabel.houseBrackmannGrade, "II");
  assert.equal(clinicalLabel.sunnybrookComposite, "82");
  assert.equal(clinicalLabel.efaceTotal, "79");
  assert.equal(clinicalLabel.efaceStatic, "91");
  assert.equal(clinicalLabel.efaceDynamic, "77");
  assert.equal(clinicalLabel.efaceSynkinesis, "69");
  assert.equal(clinicalLabel.clinicianConfidence, "high");
  assert.equal(clinicalLabel.sourceLabelSheetMode, "blinded");
  assert.equal(clinicalLabel.reviewBlinded, "yes");
  assert.equal(clinicalLabel.labelSource, "clinician-assigned");
  assert.equal(clinicalLabel.reviewerRole, "clinician");
  assert.equal(clinicalLabel.notes, "reviewed scale labels");
});

test("validation label merge still accepts legacy frame-only CSVs", () => {
  const csv = [
    "sampleId,quality,visibleMovementLevel,coactivationNotes,reviewerRole,reviewedAt,notes",
    'sample-1,strong,moderate,"eye relaxed, mouth moved",clinician,2026-06-23T10:00:00.000Z,"usable label"',
  ].join("\n");

  const merged = mergeValidationLabels(sampleRecords(), csv);
  const label = merged.records[1].record.label;

  assert.equal(merged.updatedCount, 1);
  assert.equal(merged.updatedFrameCount, 1);
  assert.equal(merged.updatedAssessmentClinicalScaleCount, 0);
  assert.equal(label.quality, "strong");
});
