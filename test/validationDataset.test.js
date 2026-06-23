import assert from "node:assert/strict";
import test from "node:test";
import { buildValidationDatasetRecords, createValidationDatasetExportBlob, VALIDATION_DATASET_KIND } from "../src/domain/validationDataset.js";

function recordsBySection(records, section) {
  return records.filter((line) => line.section === section).map((line) => line.record);
}

test("validation dataset exports labeled frame sample templates", async () => {
  const source = {
    stores: {
      appState: [{
        id: "appState",
        movementProfile: { affectedSide: "left" },
      }],
      sessions: [
        {
          id: "session-a",
          date: "2026-06-20",
          ts: 200,
          kind: "assessment",
          scoringModelVersion: 2,
          captureQuality: { key: "strong" },
          scores: [{ exerciseId: "eye-close" }],
        },
        {
          id: "session-b",
          date: "2026-06-21",
          ts: 100,
          kind: "session",
          scores: [{ exerciseId: "closed-smile" }],
        },
      ],
      sessionFrameSamples: [
        {
          id: "sample-old",
          sessionId: "session-b",
          exerciseId: "closed-smile",
          phase: "hold",
          ts: 100,
          landmarks: [{ x: 0.1, y: 0.2, z: 0 }],
          blendshapes: { smileLeft: 0.2 },
        },
        {
          id: "sample-calibrate",
          sessionId: "session-a",
          exerciseId: "eye-close",
          phase: "calibrate",
          ts: 210,
          landmarks: [{ x: 0.3, y: 0.4, z: 0 }],
        },
        {
          id: "sample-hold",
          sessionId: "session-a",
          exerciseId: "eye-close",
          phase: "hold",
          ts: 220,
          repIndex: 0,
          sampleIndex: 2,
          scoringNoiseMode: "normal",
          scoring: { scoringModelVersion: 2 },
          landmarks: [{ x: 0.5, y: 0.6, z: 0 }],
        },
      ],
    },
  };

  const records = buildValidationDatasetRecords(source, { sampleLimit: 2, exportedAt: "2026-06-23T00:00:00.000Z" });
  const manifest = records[0];
  const sessions = recordsBySection(records, "sessionContext");
  const samples = recordsBySection(records, "frameSample");

  assert.equal(manifest.kind, VALIDATION_DATASET_KIND);
  assert.equal(manifest.summary.frameSamples, 2);
  assert.equal(manifest.summary.calibrationSamples, 1);
  assert.equal(manifest.summary.holdSamples, 1);
  assert.deepEqual(manifest.summary.exercises, ["eye-close"]);
  assert.equal(manifest.summary.containsLandmarks, true);
  assert.deepEqual(manifest.labelSchema.requiredFields, ["intendedMovement", "affectedSide", "quality", "visibleMovementLevel", "coactivationNotes"]);
  assert.deepEqual(sessions.map((session) => session.id), ["session-a"]);
  assert.deepEqual(samples.map((sample) => sample.id), ["sample-calibrate", "sample-hold"]);
  assert.equal(samples[1].label.intendedMovement, "eye-close");
  assert.equal(samples[1].label.affectedSide, "left");
  assert.equal(samples[1].label.quality, null);
  assert.equal(samples[1].label.visibleMovementLevel, null);
  assert.equal(samples[1].frame.landmarks.length, 1);

  const blobText = await createValidationDatasetExportBlob(records).text();
  const lines = blobText.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines[0].kind, VALIDATION_DATASET_KIND);
  assert.equal(lines.some((line) => line.section === "frameSample"), true);
});
