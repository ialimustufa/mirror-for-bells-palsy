import assert from "node:assert/strict";
import test from "node:test";
import { createValidationLabelCsv, mergeValidationLabels, parseCsv, validationLabelRows } from "../src/ml/validationLabels.js";

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
  ];
}

test("validation label sheet exports frame sample label rows", () => {
  const rows = validationLabelRows(sampleRecords());
  const csv = createValidationLabelCsv(sampleRecords());
  const parsed = parseCsv(csv);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].sampleId, "sample-1");
  assert.equal(rows[0].intendedMovement, "closed-smile");
  assert.equal(parsed[0][0], "sampleId");
  assert.equal(parsed[1][0], "sample-1");
});

test("validation label merge updates reviewed fields from CSV", () => {
  const csv = [
    "sampleId,quality,visibleMovementLevel,coactivationNotes,reviewerRole,reviewedAt,notes",
    'sample-1,strong,moderate,"eye relaxed, mouth moved",clinician,2026-06-23T10:00:00.000Z,"usable label"',
  ].join("\n");

  const merged = mergeValidationLabels(sampleRecords(), csv);
  const label = merged.records[1].record.label;

  assert.equal(merged.updatedCount, 1);
  assert.equal(label.intendedMovement, "closed-smile");
  assert.equal(label.affectedSide, "left");
  assert.equal(label.quality, "strong");
  assert.equal(label.visibleMovementLevel, "moderate");
  assert.equal(label.coactivationNotes, "eye relaxed, mouth moved");
  assert.equal(label.reviewerRole, "clinician");
  assert.equal(label.notes, "usable label");
});
