import assert from "node:assert/strict";
import test from "node:test";
import {
  ASSESSMENT_SESSION_KIND,
  STANDARD_ASSESSMENT_EXERCISE_IDS,
  STANDARD_ASSESSMENT_REPS,
  STANDARD_ASSESSMENT_REST_SEC,
  appendAssessmentRecord,
  buildStandardAssessmentExercises,
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
