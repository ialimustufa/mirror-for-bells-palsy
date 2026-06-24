import assert from "node:assert/strict";
import test from "node:test";
import {
  ASSESSMENT_SESSION_KIND,
  STANDARD_ASSESSMENT_EXERCISE_IDS,
  STANDARD_ASSESSMENT_REPS,
  STANDARD_ASSESSMENT_REST_SEC,
  appendAssessmentRecord,
  buildStandardAssessmentExercises,
  compareAssessmentRecords,
  summarizeAssessmentSession,
} from "../src/domain/assessment.js";

test("standard assessment exercises use the fixed movement set and controlled dose", () => {
  const exercises = buildStandardAssessmentExercises({ comfortLevel: "advanced" });

  assert.deepEqual(exercises.map((exercise) => exercise.id), STANDARD_ASSESSMENT_EXERCISE_IDS);
  assert.ok(exercises.every((exercise) => exercise.reps === STANDARD_ASSESSMENT_REPS));
  assert.ok(exercises.every((exercise) => exercise.restSec >= STANDARD_ASSESSMENT_REST_SEC));
  assert.ok(exercises.every((exercise) => exercise.assessmentKind === "standard-assessment"));
});

test("summarizeAssessmentSession creates rest, voluntary, and coactivation sections", () => {
  const assessment = summarizeAssessmentSession({
    kind: ASSESSMENT_SESSION_KIND,
    date: "2026-06-23",
    ts: 123,
    scoringModelVersion: 2,
    hasBaselineSnapshot: true,
    restingMetrics: {
      version: 1,
      averageAsymmetryRatio: 0.12,
      metrics: {
        palpebralFissure: { label: "Palpebral fissure", userLeft: 0.04, userRight: 0.06, asymmetryRatio: 0.33, narrowerSide: "left" },
      },
    },
    scores: [
      {
        exerciseId: "eyebrow-raise",
        initialMovementProgress: { affectedProgressRatio: 0.8 },
        captureQuality: { key: "strong" },
      },
      {
        exerciseId: "eye-close",
        avg: 0.7,
        captureQuality: { key: "usable" },
        movementFeatures: { coactivation: { risk: "medium" } },
      },
      {
        exerciseId: "pucker",
        initialMovementProgress: { affectedProgressRatio: 1.1 },
      },
    ],
  });

  assert.equal(assessment.kind, "standard-assessment");
  assert.equal(assessment.resting.baselineSnapshotAvailable, true);
  assert.equal(assessment.resting.averageAsymmetryRatio, 0.12);
  assert.equal(assessment.resting.metrics.metrics.palpebralFissure.narrowerSide, "left");
  assert.equal(assessment.zones.length, 3);
  assert.equal(assessment.zones.find((zone) => zone.zone === "eye").coactivationRisk, "medium");
  assert.equal(assessment.coactivationRisk, "medium");
  assert.ok(assessment.averageVoluntaryMovement > 0.8);
});

test("appendAssessmentRecord preserves existing state", () => {
  const next = appendAssessmentRecord({ assessments: [{ ts: 1 }], sessions: [{ ts: 2 }] }, { ts: 3 });

  assert.equal(next.sessions.length, 1);
  assert.deepEqual(next.assessments.map((item) => item.ts), [1, 3]);
});

test("compareAssessmentRecords reports practice-metric deltas without clinical grades", () => {
  const comparison = compareAssessmentRecords(
    {
      date: "2026-06-01",
      ts: 1,
      averageVoluntaryMovement: 0.72,
      coactivationRisk: "medium",
      captureQuality: { key: "usable" },
      resting: { averageAsymmetryRatio: 0.18 },
      zones: [{ zone: "eye", label: "Eye", voluntaryMovement: 0.7, coactivationRisk: "medium", captureQuality: "usable" }],
    },
    {
      date: "2026-06-15",
      ts: 2,
      averageVoluntaryMovement: 0.8,
      coactivationRisk: "low",
      captureQuality: { key: "strong" },
      resting: { averageAsymmetryRatio: 0.12 },
      zones: [{ zone: "eye", label: "Eye", voluntaryMovement: 0.82, coactivationRisk: "low", captureQuality: "strong" }],
    },
  );

  assert.equal(comparison.averageVoluntaryMovement.delta, 0.08);
  assert.equal(comparison.averageVoluntaryMovement.direction, "improved");
  assert.equal(comparison.restingAsymmetry.delta, -0.06);
  assert.equal(comparison.restingAsymmetry.direction, "improved");
  assert.equal(comparison.coactivationRisk.change, "lower-risk");
  assert.equal(comparison.captureQuality.change, "lower-risk");
  assert.equal(comparison.zones[0].voluntaryMovementDelta, 0.12);
  assert.match(comparison.note, /self-tracking only/);
});
