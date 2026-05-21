import assert from "node:assert/strict";
import test from "node:test";
import {
  LEGACY_MOVEMENT_SIDE_CONVENTION,
  MOVEMENT_SIDE_CONVENTION,
  computeMovementProgressFromDisplacements,
  preferredMovementProgress,
  summarizeMovementProgress,
  summarizeSessionMovementProgress,
} from "../src/ml/faceMetrics.js";

const EXERCISE_ID = "closed-smile";

function makeProfile({
  affectedSide = "left",
  limitedSide = "left",
  leftBaselineMovement = 0.2,
  rightBaselineMovement = 1,
  leftPeakMovement,
  rightPeakMovement,
} = {}) {
  const exercise = {
    exerciseId: EXERCISE_ID,
    limitedSide,
    leftBaselineMovement,
    rightBaselineMovement,
  };
  if (leftPeakMovement !== undefined) exercise.leftPeakMovement = leftPeakMovement;
  if (rightPeakMovement !== undefined) exercise.rightPeakMovement = rightPeakMovement;
  return {
    affectedSide,
    exercises: {
      [EXERCISE_ID]: exercise,
    },
  };
}

test("computes left affected-side progress against first baseline and proper side", () => {
  const profile = makeProfile({ affectedSide: "left", leftBaselineMovement: 0.2, rightBaselineMovement: 1 });
  const progress = computeMovementProgressFromDisplacements(EXERCISE_ID, 0.3, 1.2, profile);

  assert.equal(progress.side, "left");
  assert.equal(progress.sideConvention, MOVEMENT_SIDE_CONVENTION);
  assert.equal(progress.referenceSide, "right");
  assert.equal(progress.affectedMovement, 0.3);
  assert.equal(progress.properMovement, 1.2);
  assert.equal(progress.affectedProgressRatio, 1.5);
  assert.equal(progress.properProgressRatio, 1.2);
  assert.equal(progress.affectedToProperRatio, 0.25);
  assert.equal(progress.baselineAffectedToProperRatio, 0.2);
  assert.equal(progress.balanceProgressRatio, 1.25);
  assert.equal(progress.deltaPct, 50);
});

test("computes right affected-side progress", () => {
  const profile = makeProfile({ affectedSide: "right", limitedSide: "right", leftBaselineMovement: 1, rightBaselineMovement: 0.25 });
  const progress = computeMovementProgressFromDisplacements(EXERCISE_ID, 1, 0.5, profile);

  assert.equal(progress.side, "right");
  assert.equal(progress.referenceSide, "left");
  assert.equal(progress.affectedProgressRatio, 2);
  assert.equal(progress.properProgressRatio, 1);
  assert.equal(progress.affectedToProperRatio, 0.5);
  assert.equal(progress.baselineAffectedToProperRatio, 0.25);
  assert.equal(progress.balanceProgressRatio, 2);
  assert.equal(progress.deltaPct, 100);
});

test("falls back to exercise limited side, then current lower-moving side", () => {
  const limitedProfile = makeProfile({ affectedSide: "unsure", limitedSide: "right", leftBaselineMovement: 1, rightBaselineMovement: 0.2 });
  const limitedProgress = computeMovementProgressFromDisplacements(EXERCISE_ID, 0.8, 0.4, limitedProfile);
  assert.equal(limitedProgress.side, "right");

  const currentProfile = makeProfile({ affectedSide: "unsure", limitedSide: "balanced", leftBaselineMovement: 0.2, rightBaselineMovement: 1 });
  const currentProgress = computeMovementProgressFromDisplacements(EXERCISE_ID, 0.15, 0.8, currentProfile);
  assert.equal(currentProgress.side, "left");
  assert.equal(currentProgress.affectedProgressRatio, 0.75);
  assert.equal(currentProgress.deltaPct, -25);
});

test("keeps affected progress when proper-side baseline is zero or missing", () => {
  const profile = makeProfile({ affectedSide: "left", leftBaselineMovement: 0.2, rightBaselineMovement: 0 });
  const progress = computeMovementProgressFromDisplacements(EXERCISE_ID, 0.3, 0.9, profile);

  assert.equal(progress.affectedProgressRatio, 1.5);
  assert.equal(progress.properProgressRatio, null);
  assert.equal(progress.baselineAffectedToProperRatio, null);
  assert.equal(progress.balanceProgressRatio, null);
  assert.equal(progress.affectedToProperRatio, 0.3333);
});

test("uses peak movement for old profiles without baseline movement fields", () => {
  const profile = {
    affectedSide: "right",
    exercises: {
      [EXERCISE_ID]: {
        exerciseId: EXERCISE_ID,
        limitedSide: "right",
        leftPeakMovement: 1,
        rightPeakMovement: 0.25,
      },
    },
  };
  const progress = computeMovementProgressFromDisplacements(EXERCISE_ID, 1.1, 0.5, profile);

  assert.equal(progress.side, "right");
  assert.equal(progress.baselineAffectedMovement, 0.25);
  assert.equal(progress.baselineProperMovement, 1);
  assert.equal(progress.affectedProgressRatio, 2);
});

test("summarizes movement progress across reps and session scores", () => {
  const first = computeMovementProgressFromDisplacements(EXERCISE_ID, 0.2, 1, makeProfile());
  const second = computeMovementProgressFromDisplacements(EXERCISE_ID, 0.3, 1.2, makeProfile());
  const exerciseSummary = summarizeMovementProgress([first, second]);
  const sessionSummary = summarizeSessionMovementProgress([
    { movementProgress: first },
    { movementProgress: second },
  ]);

  assert.equal(exerciseSummary.affectedProgressRatio, 1.25);
  assert.equal(exerciseSummary.sideConvention, MOVEMENT_SIDE_CONVENTION);
  assert.equal(exerciseSummary.deltaPct, 25);
  assert.equal(exerciseSummary.reps, 2);
  assert.deepEqual(sessionSummary, exerciseSummary);
});

test("preferred movement progress skips legacy image-side records", () => {
  const current = computeMovementProgressFromDisplacements(EXERCISE_ID, 0.3, 1.2, makeProfile());
  const legacy = { ...current, sideConvention: LEGACY_MOVEMENT_SIDE_CONVENTION };

  assert.equal(preferredMovementProgress({ initialMovementProgress: legacy, movementProgress: current }), current);
  assert.equal(preferredMovementProgress({ initialMovementProgress: legacy }), null);
});
