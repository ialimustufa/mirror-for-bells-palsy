import assert from "node:assert/strict";
import test from "node:test";
import { APP_SIDE_CONVENTION_VERSION, needsSideConventionMigration, normalizeAppData, resetMovementProfileBaselines } from "../src/domain/appData.js";
import { LEGACY_MOVEMENT_SIDE_CONVENTION, MOVEMENT_SIDE_CONVENTION } from "../src/ml/faceMetrics.js";

const EXERCISE_ID = "closed-smile";

function makeLegacyExercise() {
  return {
    exerciseId: EXERCISE_ID,
    limitedSide: "left",
    leftMeanMovement: 0.22,
    rightMeanMovement: 1.02,
    leftBaselineMovement: 0.25,
    rightBaselineMovement: 1.1,
    leftPeakMovement: 0.4,
    rightPeakMovement: 1.3,
    initialSymmetry: 0.31,
  };
}

function makeLegacyProfile() {
  return {
    affectedSide: "right",
    exercises: {
      [EXERCISE_ID]: makeLegacyExercise(),
    },
  };
}

test("normalizes legacy image-side profile metrics to user-anatomical sides", () => {
  const legacyData = {
    movementProfile: makeLegacyProfile(),
    initialMovementProfile: makeLegacyProfile(),
    movementProfileHistory: [makeLegacyProfile()],
    prefs: { onboarded: true },
  };

  const normalized = normalizeAppData(legacyData);
  const exercise = normalized.movementProfile.exercises[EXERCISE_ID];

  assert.equal(normalized.sideConventionVersion, APP_SIDE_CONVENTION_VERSION);
  assert.equal(normalized.movementProfile.sideConvention, MOVEMENT_SIDE_CONVENTION);
  assert.equal(normalized.movementProfile.migratedFromSideConvention, LEGACY_MOVEMENT_SIDE_CONVENTION);
  assert.equal(normalized.movementProfile.affectedSide, "right");
  assert.equal(exercise.limitedSide, "right");
  assert.equal(exercise.leftMeanMovement, 1.02);
  assert.equal(exercise.rightMeanMovement, 0.22);
  assert.equal(exercise.leftBaselineMovement, 1.1);
  assert.equal(exercise.rightBaselineMovement, 0.25);
  assert.equal(exercise.leftPeakMovement, 1.3);
  assert.equal(exercise.rightPeakMovement, 0.4);
});

test("marks historical session progress as legacy instead of pretending it was recomputed", () => {
  const legacyData = {
    sessions: [{
      date: "2026-01-01",
      ts: 1,
      baselineProgress: { side: "left", ratio: 1.1 },
      movementProgress: { side: "right", referenceSide: "left", affectedProgressRatio: 1.2 },
      scores: [{
        exerciseId: EXERCISE_ID,
        initialMovementProgress: { side: "right", referenceSide: "left", affectedProgressRatio: 1.4 },
      }],
    }],
  };

  const normalized = normalizeAppData(legacyData);
  const session = normalized.sessions[0];

  assert.equal(session.baselineProgress.sideConvention, LEGACY_MOVEMENT_SIDE_CONVENTION);
  assert.equal(session.movementProgress.sideConvention, LEGACY_MOVEMENT_SIDE_CONVENTION);
  assert.equal(session.movementProgress.side, "right");
  assert.equal(session.scores[0].initialMovementProgress.sideConvention, LEGACY_MOVEMENT_SIDE_CONVENTION);
});

test("side-convention migration is idempotent once data is normalized", () => {
  const once = normalizeAppData({
    movementProfile: makeLegacyProfile(),
    sessions: [{ movementProgress: { side: "right", affectedProgressRatio: 1.2 } }],
  });
  const twice = normalizeAppData(once);

  assert.deepEqual(twice.movementProfile, once.movementProfile);
  assert.deepEqual(twice.sessions, once.sessions);
  assert.equal(needsSideConventionMigration(once), false);
});

test("resets selected movement profile baselines and recalculates average symmetry", () => {
  const profile = {
    affectedSide: "right",
    exercises: {
      "closed-smile": { exerciseId: "closed-smile", initialSymmetry: 0.4 },
      "open-smile": { exerciseId: "open-smile", initialSymmetry: 0.8 },
      "eye-close": { exerciseId: "eye-close", initialSymmetry: null },
    },
    initialAvgSymmetry: 0.6,
  };

  const reset = resetMovementProfileBaselines(profile, ["closed-smile", "unknown"], 1234);

  assert.equal(reset.exercises["closed-smile"], undefined);
  assert.ok(reset.exercises["open-smile"]);
  assert.ok(reset.exercises["eye-close"]);
  assert.equal(reset.initialAvgSymmetry, 0.8);
  assert.equal(reset.updatedAt, 1234);
  assert.equal(reset.lastBaselineResetAt, 1234);
  assert.deepEqual(reset.lastBaselineResetExerciseIds, ["closed-smile"]);
});

test("returns the original profile when reset has no matching baselines", () => {
  const profile = {
    exercises: {
      "open-smile": { exerciseId: "open-smile", initialSymmetry: 0.8 },
    },
  };

  assert.equal(resetMovementProfileBaselines(profile, ["closed-smile"], 1234), profile);
});
