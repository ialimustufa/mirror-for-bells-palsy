import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAppData } from "../src/domain/appData.js";
import { DAILY_ESSENTIALS } from "../src/domain/exercises.js";
import { DEFAULT_PERSONAL_PLAN, appendSessionRecord, buildSessionExercises } from "../src/domain/session.js";
import { buildPersonalizedDailyPlan, getAdaptiveFocusItems } from "../src/ml/faceMetrics.js";

test("saved selectedExerciseIds stay fixed when recommendations change", () => {
  const personalPlan = {
    selectedExerciseIds: ["emoji-kiss", "blink"],
    addedExerciseIds: ["pucker"],
    removedExerciseIds: ["eye-close"],
    repeatCounts: { blink: 2 },
    repCounts: { blink: 4 },
  };

  const withoutProfile = buildPersonalizedDailyPlan(null, [], undefined, { personalPlan, orderByRegion: true });
  const withChangingHistory = buildPersonalizedDailyPlan(
    {
      exercises: {
        "closed-smile": { exerciseId: "closed-smile", initialSymmetry: 0.2 },
        pucker: { exerciseId: "pucker", initialSymmetry: 0.3 },
        "emoji-kiss": { exerciseId: "emoji-kiss", initialSymmetry: 0.9 },
      },
    },
    [{ ts: 1, scores: [{ exerciseId: "closed-smile", avg: 0.2 }] }],
    undefined,
    { personalPlan, orderByRegion: true },
  );

  assert.deepEqual(withoutProfile, ["blink", "emoji-kiss"]);
  assert.deepEqual(withChangingHistory, ["blink", "emoji-kiss"]);
});

test("legacy added and removed plan fields still resolve without selectedExerciseIds", () => {
  const resolved = buildPersonalizedDailyPlan(null, [], undefined, {
    personalPlan: {
      addedExerciseIds: ["blink"],
      removedExerciseIds: ["eye-close"],
      repeatCounts: { blink: 2 },
    },
    orderByRegion: false,
  });

  assert.deepEqual(resolved, [
    "eyebrow-raise",
    "nose-wrinkle",
    "cheek-puff",
    "closed-smile",
    "pucker",
    "blink",
  ]);
});

test("normalizeAppData preserves selected exercises and keeps custom counts tied to them", () => {
  const normalized = normalizeAppData({
    prefs: {
      personalPlan: {
        selectedExerciseIds: ["blink", "not-real", "blink", "emoji-kiss"],
        addedExerciseIds: ["pucker", "also-not-real"],
        removedExerciseIds: ["eye-close"],
        repeatCounts: {
          blink: 3,
          pucker: 4,
          "emoji-kiss": 1,
          "not-real": 5,
        },
        repCounts: {
          blink: 4,
          pucker: 6,
          "emoji-kiss": 99,
          "not-real": 7,
        },
      },
    },
  });

  assert.deepEqual(normalized.prefs.personalPlan.selectedExerciseIds, ["blink", "emoji-kiss"]);
  assert.deepEqual(normalized.prefs.personalPlan.addedExerciseIds, ["pucker"]);
  assert.deepEqual(normalized.prefs.personalPlan.removedExerciseIds, ["eye-close"]);
  assert.deepEqual(normalized.prefs.personalPlan.repeatCounts, { blink: 3 });
  assert.deepEqual(normalized.prefs.personalPlan.repCounts, { blink: 4, "emoji-kiss": 20 });
});

test("appending a session preserves the existing custom personal plan", () => {
  const data = normalizeAppData({
    prefs: {
      personalPlan: {
        selectedExerciseIds: ["blink", "emoji-kiss"],
        repeatCounts: { blink: 2 },
        repCounts: { blink: 4 },
      },
    },
    sessions: [{ date: "2026-01-01", ts: 1, scores: [] }],
  });

  const next = appendSessionRecord(data, { date: "2026-01-02", ts: 2, scores: [] });

  assert.deepEqual(next.prefs.personalPlan, data.prefs.personalPlan);
  assert.equal(next.sessions.length, 2);
});

test("default reset plan clears selected exercises and returns to recommendations", () => {
  const normalized = normalizeAppData({ prefs: { personalPlan: DEFAULT_PERSONAL_PLAN } });
  const resolved = buildPersonalizedDailyPlan(null, [], undefined, {
    personalPlan: normalized.prefs.personalPlan,
    orderByRegion: false,
  });

  assert.deepEqual(normalized.prefs.personalPlan.selectedExerciseIds, []);
  assert.deepEqual(resolved, DAILY_ESSENTIALS);
});

test("adaptive plan demotes weak capture and coactivation after fatigue notes", () => {
  const profile = {
    exercises: {
      "closed-smile": { exerciseId: "closed-smile", initialSymmetry: 0.05 },
      "eye-close": { exerciseId: "eye-close", initialSymmetry: 0.3 },
      pucker: { exerciseId: "pucker", initialSymmetry: 0.35 },
    },
  };
  const sessions = [{
    date: "2026-06-22",
    ts: Date.parse("2026-06-22T10:00:00.000Z"),
    scores: [
      {
        exerciseId: "closed-smile",
        avg: 0.4,
        captureQuality: { key: "weak" },
        movementFeatures: { coactivation: { risk: "high" } },
      },
      { exerciseId: "eye-close", avg: 0.5, captureQuality: { key: "strong" } },
      { exerciseId: "pucker", avg: 0.45, captureQuality: { key: "strong" } },
    ],
  }];

  const plan = buildPersonalizedDailyPlan(profile, sessions, 2, {
    journal: [{ date: "2026-06-23", notes: "Very tired and fatigued after practice." }],
    referenceDate: "2026-06-23",
    orderByRegion: false,
  });

  assert.deepEqual(plan, ["eye-close", "pucker"]);
});

test("adaptive focus stops boosting no-recent-data exercises after missed practice", () => {
  const profile = {
    exercises: {
      "eye-close": { exerciseId: "eye-close", initialSymmetry: 0.45 },
      pucker: { exerciseId: "pucker", initialSymmetry: 0.45 },
    },
  };
  const sessions = [{
    date: "2026-06-10",
    ts: Date.parse("2026-06-10T10:00:00.000Z"),
    scores: [{ exerciseId: "eye-close", avg: 0.6 }],
  }];

  const focusItems = getAdaptiveFocusItems(profile, sessions, 2, { referenceDate: "2026-06-23" });
  const pucker = focusItems.find((item) => item.id === "pucker");

  assert.equal(pucker.noRecentData, 0);
  assert.equal(pucker.planContext.stalePractice, true);
});

test("buildSessionExercises applies custom rep targets without changing hold dosing", () => {
  const [blink] = buildSessionExercises(["blink"], null, { blink: 3 });

  assert.equal(blink.baseReps, 10);
  assert.equal(blink.reps, 3);
  assert.equal(blink.holdSec, 2);
  assert.equal(blink.customReps, true);
});
