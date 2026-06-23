import assert from "node:assert/strict";
import test from "node:test";
import { buildClinicianBundleRecords, createClinicianBundleExportBlob, CLINICIAN_BUNDLE_LINES_KIND } from "../src/domain/clinicianBundle.js";

function recordsBySection(records, section) {
  return records.filter((line) => line.section === section).map((line) => line.record);
}

test("clinician bundle exports assessment trend, sessions, journals, images, and frame samples", async () => {
  const source = {
    stores: {
      appState: [{
        id: "appState",
        assessments: [{
          date: "2026-06-22",
          ts: 220,
          sourceSessionId: "assessment-session",
          averageVoluntaryMovement: 0.72,
          coactivationRisk: "medium",
          resting: { averageAsymmetryRatio: 0.18 },
          zones: [{ zone: "eye", label: "Eye", exerciseIds: ["eye-close"], voluntaryMovement: 0.7 }],
        }],
        journal: [
          { date: "2026-06-21", symmetry: 62, mood: "ok", notes: "Dry eye in the evening.", ts: 210 },
        ],
      }],
      sessions: [
        {
          id: "old-session",
          date: "2026-06-20",
          ts: 200,
          kind: "session",
          sessionAvg: 0.5,
          scores: [{ exerciseId: "closed-smile", avg: 0.5 }],
        },
        {
          id: "recent-session",
          date: "2026-06-21",
          ts: 210,
          kind: "session",
          scoringModelVersion: 2,
          sessionAvg: 0.66,
          scores: [{ exerciseId: "pucker", avg: 0.66, initialMovementProgress: { affectedProgressRatio: 1.1 } }],
        },
        {
          id: "assessment-session",
          date: "2026-06-22",
          ts: 220,
          kind: "assessment",
          scoringModelVersion: 2,
          captureQuality: { key: "strong" },
          scores: [{ exerciseId: "eye-close", avg: 0.7, captureQuality: { key: "strong" } }],
          restingMetrics: { averageAsymmetryRatio: 0.18 },
        },
      ],
      sessionImages: [
        { id: "img-old", sessionId: "old-session", role: "rep", dataUrl: "data:image/jpeg;base64,old" },
        { id: "img-assessment-baseline", sessionId: "assessment-session", role: "sessionBaseline", dataUrl: "data:image/jpeg;base64,baseline" },
        { id: "img-assessment-rep", sessionId: "assessment-session", role: "rep", dataUrl: "data:image/jpeg;base64,rep" },
      ],
      sessionFrameSamples: [
        { id: "sample-assessment", sessionId: "assessment-session", exerciseId: "eye-close", phase: "hold", scoring: { scoringModelVersion: 2 } },
        { id: "sample-old", sessionId: "old-session", exerciseId: "closed-smile", phase: "hold" },
      ],
    },
  };

  const records = buildClinicianBundleRecords(source, { recentSessionLimit: 1, exportedAt: "2026-06-23T00:00:00.000Z" });
  const manifest = records[0];
  const sessions = recordsBySection(records, "session");
  const assessments = recordsBySection(records, "assessmentTrend");
  const journals = recordsBySection(records, "journal");
  const images = recordsBySection(records, "image");
  const samples = recordsBySection(records, "frameSample");

  assert.equal(manifest.kind, CLINICIAN_BUNDLE_LINES_KIND);
  assert.equal(manifest.summary.sessions, 1);
  assert.equal(manifest.summary.assessments, 1);
  assert.equal(manifest.summary.journalEntries, 1);
  assert.equal(manifest.summary.images, 2);
  assert.equal(manifest.summary.frameSamples, 1);
  assert.equal(manifest.summary.containsImageDataUrls, true);
  assert.deepEqual(sessions.map((session) => session.id), ["assessment-session"]);
  assert.equal(sessions[0].diagnostics.safetyPrompts.length >= 0, true);
  assert.equal(assessments[0].averageVoluntaryMovement, 0.72);
  assert.equal(assessments[0].resting.averageAsymmetryRatio, 0.18);
  assert.equal(journals[0].notes, "Dry eye in the evening.");
  assert.deepEqual(images.map((image) => image.id).sort(), ["img-assessment-baseline", "img-assessment-rep"]);
  assert.deepEqual(samples.map((sample) => sample.id), ["sample-assessment"]);

  const blobText = await createClinicianBundleExportBlob(records).text();
  const lines = blobText.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines[0].kind, CLINICIAN_BUNDLE_LINES_KIND);
  assert.equal(lines.some((line) => line.section === "frameSample"), true);
});
