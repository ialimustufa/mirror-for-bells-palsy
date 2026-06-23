import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePersonalRecoveryModel,
  personalRecoveryFocusItems,
  trainPersonalRecoveryModel,
} from "../src/domain/personalRecoveryModel.js";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const BASE = Date.UTC(2026, 0, 1);

// affectedToProperRatio (balance) is only set when a balance value is passed, so
// existing single-arg callers keep producing samples without a balance signal.
function progress(ratio, balance) {
  const out = {
    sideConvention: "user-anatomical-v1",
    side: "right",
    referenceSide: "left",
    affectedMovement: ratio * 0.01,
    properMovement: 0.02,
    affectedProgressRatio: ratio,
  };
  if (balance != null) out.affectedToProperRatio = balance;
  return out;
}

function session(day, ratio, extraScore = {}) {
  return {
    date: new Date(BASE + day * DAY).toISOString().split("T")[0],
    ts: BASE + day * DAY,
    scoringNoiseMode: "normal",
    scores: [{
      exerciseId: "closed-smile",
      initialMovementProgress: progress(ratio),
      scores: [ratio],
      ...extraScore,
    }],
  };
}

// Flexible builders for the newer tests: explicit timestamps (day + hour) and
// one or more exercise scores per session.
function tsAt(day, hour = 0) {
  return BASE + day * DAY + hour * HOUR;
}

function exerciseScore(exerciseId, ratio, { balance, ...extra } = {}) {
  return {
    exerciseId,
    initialMovementProgress: progress(ratio, balance),
    scores: [ratio],
    ...extra,
  };
}

function sessionAt(ts, scores, extra = {}) {
  return {
    date: new Date(ts).toISOString().split("T")[0],
    ts,
    scoringNoiseMode: "normal",
    scores: Array.isArray(scores) ? scores : [scores],
    ...extra,
  };
}

test("personal recovery model stays collecting below minimum data threshold", () => {
  const model = trainPersonalRecoveryModel({
    sessions: [
      session(0, 1.0),
      session(1, 1.05),
      session(1, 1.04),
      session(2, 1.08),
    ],
  });

  assert.equal(model.status, "collecting");
  assert.equal(model.exercises["closed-smile"].confidence, "collecting");
});

test("personal recovery model detects improving affected-side trend", () => {
  const model = trainPersonalRecoveryModel({
    sessions: [
      session(0, 1.0),
      session(1, 1.03),
      session(3, 1.08),
      session(5, 1.15),
      session(7, 1.2),
      session(9, 1.24),
    ],
  });
  const entry = model.exercises["closed-smile"];

  assert.ok(entry.currentRatio > entry.baselineRatio);
  assert.ok(entry.trendSlopePctPerWeek > 0);
  assert.equal(entry.trendStatus, "improving");
  assert.notEqual(entry.confidence, "collecting");
});

test("personal recovery model downweights noisy outlier sessions", () => {
  const model = trainPersonalRecoveryModel({
    sessions: [
      session(0, 1.0),
      session(2, 1.02),
      session(4, 1.06),
      session(6, 1.08),
      session(8, 1.1),
      session(10, 3.0, {
        movementFeatures: {
          validScoredFrameCount: 1,
          alignedFrameRatio: 0.2,
          scoringNoiseMode: "raw",
        },
      }),
    ],
  });
  const entry = model.exercises["closed-smile"];

  assert.ok(entry.currentRatio < 1.5);
  assert.ok(entry.trendSlopePctPerWeek < 80);
});

test("personal recovery model keeps first-baseline progress as the trend anchor after retakes", () => {
  const model = trainPersonalRecoveryModel({
    sessions: [
      {
        date: "2026-01-01",
        ts: BASE,
        scores: [{
          exerciseId: "closed-smile",
          initialMovementProgress: progress(1.2),
          movementProgress: progress(0.8),
        }],
      },
      session(2, 1.25),
      session(4, 1.28),
      session(6, 1.31),
      session(8, 1.33),
    ],
  });

  assert.equal(model.exercises["closed-smile"].baselineRatio, 1.2);
  assert.ok(model.exercises["closed-smile"].currentRatio > 1.2);
});

test("personal recovery model works with sessions missing movementFeatures", () => {
  const model = trainPersonalRecoveryModel({
    sessions: [
      session(0, 0.9),
      session(2, 0.95),
      session(4, 1.0),
      session(6, 1.05),
      session(8, 1.08),
    ],
  });

  assert.equal(model.exercises["closed-smile"].sampleCount, 5);
  assert.ok(model.exercises["closed-smile"].currentRatio >= 1);
});

// --- normalizePersonalRecoveryModel ---------------------------------------

test("normalizePersonalRecoveryModel rejects non-objects", () => {
  assert.equal(normalizePersonalRecoveryModel(null), null);
  assert.equal(normalizePersonalRecoveryModel("nope"), null);
});

test("normalizePersonalRecoveryModel drops unknown exercises and clamps fields", () => {
  const normalized = normalizePersonalRecoveryModel({
    status: "not-a-status",
    legacyExcludedSampleCount: 4.6,
    exercises: {
      "closed-smile": { sampleCount: -5, dateCount: 2.7, currentRatio: 1.1, confidence: "banana" },
      "not-an-exercise": { sampleCount: 10, dateCount: 5, currentRatio: 1, confidence: "high" },
    },
  });

  assert.ok(normalized.exercises["closed-smile"]);
  assert.equal(normalized.exercises["not-an-exercise"], undefined);
  assert.equal(normalized.exercises["closed-smile"].sampleCount, 0);
  assert.equal(normalized.exercises["closed-smile"].dateCount, 3);
  assert.equal(normalized.exercises["closed-smile"].confidence, "collecting");
  assert.equal(normalized.legacyExcludedSampleCount, 5);
  // Invalid status is recomputed from the (now "collecting") entries.
  assert.equal(normalized.status, "collecting");
});

test("normalizePersonalRecoveryModel recomputes an invalid status from entries", () => {
  const normalized = normalizePersonalRecoveryModel({
    status: "bogus",
    exercises: { "closed-smile": { currentRatio: 1.2, confidence: "high" } },
  });

  assert.equal(normalized.status, "high");
});

test("normalize preserves trained balance, staleness, and legacy fields", () => {
  const model = trainPersonalRecoveryModel({
    sessions: [
      sessionAt(tsAt(0), exerciseScore("closed-smile", 1.1, { balance: 0.7 })),
      sessionAt(tsAt(2), exerciseScore("closed-smile", 1.12, { balance: 0.72 })),
      sessionAt(tsAt(4), exerciseScore("closed-smile", 1.15, { balance: 0.75 })),
      sessionAt(tsAt(6), exerciseScore("closed-smile", 1.18, { balance: 0.78 })),
      sessionAt(tsAt(8), exerciseScore("closed-smile", 1.2, { balance: 0.8 })),
    ],
    now: tsAt(8),
  });
  const entry = model.exercises["closed-smile"];
  assert.ok(entry.currentBalanceRatio != null);
  assert.ok(entry.baselineBalanceRatio != null);
  assert.equal(typeof entry.currentRatioAsOf, "string");
  assert.equal(entry.isCurrentStale, false);

  const normalized = normalizePersonalRecoveryModel(model);
  const normEntry = normalized.exercises["closed-smile"];
  assert.equal(normEntry.currentBalanceRatio, entry.currentBalanceRatio);
  assert.equal(normEntry.baselineBalanceRatio, entry.baselineBalanceRatio);
  assert.equal(normEntry.currentRatioAsOf, entry.currentRatioAsOf);
  assert.equal(normEntry.isCurrentStale, false);
  assert.equal(normEntry.trendStatus, entry.trendStatus);
  assert.equal(normEntry.uncertaintyHalfWidth, entry.uncertaintyHalfWidth);
  assert.equal(normEntry.currentRatioLow, entry.currentRatioLow);
  assert.equal(normEntry.currentRatioHigh, entry.currentRatioHigh);
  assert.equal(normalized.legacyExcludedSampleCount, model.legacyExcludedSampleCount);
});

test("normalize defaults missing balance/staleness/legacy fields", () => {
  const normalized = normalizePersonalRecoveryModel({
    exercises: { "closed-smile": { currentRatio: 1.1, confidence: "medium" } },
  });
  const entry = normalized.exercises["closed-smile"];

  assert.equal(entry.currentBalanceRatio, null);
  assert.equal(entry.baselineBalanceRatio, null);
  assert.equal(entry.currentRatioAsOf, null);
  assert.equal(entry.isCurrentStale, false);
  assert.equal(entry.trendStatus, "stable");
  assert.equal(normalized.legacyExcludedSampleCount, 0);
});

// --- personalRecoveryFocusItems -------------------------------------------

test("focus ranks improving exercises by residual asymmetry, not insertion order", () => {
  // Both exercises sit above their own first baseline (currentRatio 1.2 -> progressGap 0).
  // closed-smile is inserted first but has GOOD balance; eyebrow-raise has POOR balance.
  const sessions = [0, 2, 4, 6, 8].map((day) => sessionAt(tsAt(day), [
    exerciseScore("closed-smile", 1.2, { balance: 0.95 }),
    exerciseScore("eyebrow-raise", 1.2, { balance: 0.5 }),
  ]));
  const model = trainPersonalRecoveryModel({ sessions, now: tsAt(8) });
  const focus = personalRecoveryFocusItems(model, 3);

  assert.equal(focus[0].exerciseId, "eyebrow-raise");
  assert.ok(focus[0].balanceGap > focus[1].balanceGap);
});

test("focus handles null balance without penalty or NaN", () => {
  const sessions = [0, 2, 4, 6, 8].map((day) =>
    sessionAt(tsAt(day), exerciseScore("closed-smile", 0.8)));
  const model = trainPersonalRecoveryModel({ sessions, now: tsAt(8) });
  const entry = model.exercises["closed-smile"];
  assert.equal(entry.currentBalanceRatio, null);

  const focus = personalRecoveryFocusItems(model, 3);
  assert.equal(focus[0].balanceGap, 0);
  assert.ok(Number.isFinite(focus[0].focusScore));
});

// --- confidence tiers & status --------------------------------------------

test("confidence reaches high with dense low-variance data", () => {
  const sessions = [];
  for (let day = 0; day < 10; day++) {
    sessions.push(sessionAt(tsAt(day), exerciseScore("closed-smile", 1.0 + day * 0.001, {
      balance: 0.9,
      movementFeatures: { validScoredFrameCount: 10 },
    })));
  }
  const model = trainPersonalRecoveryModel({ sessions, now: tsAt(9) });

  assert.equal(model.exercises["closed-smile"].confidence, "high");
  assert.equal(model.exercises["closed-smile"].trendStatus, "stable");
  assert.ok(model.exercises["closed-smile"].uncertaintyHalfWidth > 0);
  assert.ok(model.exercises["closed-smile"].currentRatioLow < model.exercises["closed-smile"].currentRatio);
  assert.ok(model.exercises["closed-smile"].currentRatioHigh > model.exercises["closed-smile"].currentRatio);
  assert.equal(model.status, "high");
});

test("confidence drops to low with high recent variability", () => {
  const ratios = [0.6, 1.4, 0.6, 1.4, 0.6, 1.4];
  const sessions = ratios.map((r, i) => sessionAt(tsAt(i), exerciseScore("closed-smile", r, { balance: 0.7 })));
  const model = trainPersonalRecoveryModel({ sessions, now: tsAt(5) });

  assert.equal(model.exercises["closed-smile"].confidence, "low");
});

test("model status reflects the strongest exercise confidence", () => {
  const sessions = [];
  for (let day = 0; day < 10; day++) {
    const scores = [exerciseScore("closed-smile", 1.0 + day * 0.001, {
      balance: 0.9,
      movementFeatures: { validScoredFrameCount: 10 },
    })];
    if (day < 2) scores.push(exerciseScore("eyebrow-raise", 1.0, { balance: 0.8 }));
    sessions.push(sessionAt(tsAt(day), scores));
  }
  const model = trainPersonalRecoveryModel({ sessions, now: tsAt(9) });

  assert.equal(model.exercises["closed-smile"].confidence, "high");
  assert.equal(model.exercises["eyebrow-raise"].confidence, "collecting");
  assert.equal(model.status, "high");
});

// --- legacy exclusion ------------------------------------------------------

test("fully-legacy history yields an empty model and a legacy-excluded count", () => {
  const sessions = [0, 2, 4, 6, 8].map((day) => sessionAt(tsAt(day), {
    exerciseId: "closed-smile",
    initialMovementProgress: { sideConvention: "legacy-image-left-v0", affectedProgressRatio: 1.1 },
    scores: [1.1],
  }));
  const model = trainPersonalRecoveryModel({ sessions, now: tsAt(8) });

  assert.deepEqual(model.exercises, {});
  assert.equal(model.legacyExcludedSampleCount, 5);
  assert.equal(model.status, "collecting");
});

// --- date-aggregated slope -------------------------------------------------

test("intra-day rises do not register as a weekly trend", () => {
  // Five sessions on the SAME calendar date at rising ratios. Before date
  // aggregation, the sub-day spans would imply a steep positive slope; after
  // aggregation there is a single point, so no slope can be measured.
  const sessions = [8, 10, 12, 14, 16].map((hour, i) =>
    sessionAt(tsAt(0, hour), exerciseScore("closed-smile", 1.0 + i * 0.1, { balance: 0.7 })));
  const model = trainPersonalRecoveryModel({ sessions, now: tsAt(0, 16) });

  assert.equal(model.exercises["closed-smile"].trendSlopePctPerWeek, null);
});

test("same-day sessions do not inflate a real multi-day trend", () => {
  const sessions = [
    sessionAt(tsAt(0, 9), exerciseScore("closed-smile", 1.0, { balance: 0.7 })),
    sessionAt(tsAt(0, 12), exerciseScore("closed-smile", 1.1, { balance: 0.72 })), // 3h later, same date
    sessionAt(tsAt(7), exerciseScore("closed-smile", 1.05, { balance: 0.74 })),
    sessionAt(tsAt(14), exerciseScore("closed-smile", 1.1, { balance: 0.76 })),
    sessionAt(tsAt(21), exerciseScore("closed-smile", 1.15, { balance: 0.78 })),
  ];
  const model = trainPersonalRecoveryModel({ sessions, now: tsAt(21) });
  const trend = model.exercises["closed-smile"].trendSlopePctPerWeek;

  assert.ok(Number.isFinite(trend));
  // The 3-hour same-day pair alone would imply ~560 pts/week without aggregation.
  assert.ok(trend > 0 && trend < 60, `trend ${trend} should be a bounded positive slope`);
});

// --- sparse window & staleness --------------------------------------------

test("sparse practice uses the latest date for current and flags staleness", () => {
  const days = [0, 30, 60, 90, 120];
  const ratios = [1.0, 1.1, 1.2, 1.3, 1.4];
  const sessions = days.map((day, i) =>
    sessionAt(tsAt(day), exerciseScore("closed-smile", ratios[i], { balance: 0.7 })));
  const model = trainPersonalRecoveryModel({ sessions, now: tsAt(140) });
  const entry = model.exercises["closed-smile"];

  // Latest date only, not a months-spanning slice(-5) median (~1.2).
  assert.equal(entry.currentRatio, 1.4);
  assert.equal(entry.isCurrentStale, true);
  assert.equal(entry.currentRatioAsOf, new Date(tsAt(120)).toISOString().split("T")[0]);
});

// --- weightedMedian interpolation -----------------------------------------

test("weightedMedian interpolates even equal-weight current samples", () => {
  const sessions = [
    sessionAt(tsAt(0, 9), exerciseScore("closed-smile", 0.9, { balance: 0.7 })),
    sessionAt(tsAt(0, 12), exerciseScore("closed-smile", 1.1, { balance: 0.7 })),
  ];
  const model = trainPersonalRecoveryModel({ sessions, now: tsAt(0, 12) });
  const entry = model.exercises["closed-smile"];

  // Old lower-biased weightedMedian returned 0.9; interpolation centers it at 1.0.
  assert.ok(entry.currentRatio > 0.95, `currentRatio ${entry.currentRatio} should center, not bias low`);
});

// --- sampleWeight penalty branches ----------------------------------------

function sixDays(features, movementProfile) {
  const sessions = [];
  for (let day = 0; day < 6; day++) {
    sessions.push(sessionAt(tsAt(day), exerciseScore("closed-smile", 1.0, { balance: 0.8, movementFeatures: features })));
  }
  return trainPersonalRecoveryModel({ sessions, movementProfile, now: tsAt(5) });
}

test("clean dense samples are medium confidence (penalty control)", () => {
  const model = sixDays({ validScoredFrameCount: 10 });
  assert.equal(model.exercises["closed-smile"].confidence, "medium");
});

test("sub-threshold activation downweights samples to low confidence", () => {
  const model = sixDays({ validScoredFrameCount: 10, activationPeak: 0.001, profileThreshold: 0.01 });
  assert.equal(model.exercises["closed-smile"].confidence, "low");
});

test("sub-reliable threshold band activation downweights samples", () => {
  const model = sixDays({ validScoredFrameCount: 10, activationPeak: 0.001, thresholdBands: { reliableMovement: 0.01 } });
  assert.equal(model.exercises["closed-smile"].confidence, "low");
});

test("alignment, soft mode, and retake quality combine to low confidence", () => {
  const model = sixDays(
    { validScoredFrameCount: 10, alignedFrameRatio: 0.2, scoringNoiseMode: "soft" },
    { exercises: { "closed-smile": { quality: { key: "retake" } } } },
  );
  assert.equal(model.exercises["closed-smile"].confidence, "low");
});

test("few frames, raw mode, and usable quality combine to low confidence", () => {
  const model = sixDays(
    { validScoredFrameCount: 1, scoringNoiseMode: "raw" },
    { exercises: { "closed-smile": { quality: { key: "usable" } } } },
  );
  assert.equal(model.exercises["closed-smile"].confidence, "low");
});

test("weak capture quality marks trend status as worse capture quality", () => {
  const sessions = [];
  for (let day = 0; day < 6; day++) {
    sessions.push(sessionAt(tsAt(day), exerciseScore("closed-smile", 1.0, {
      balance: 0.8,
      captureQuality: { key: "weak", score: 0.35 },
      movementFeatures: { validScoredFrameCount: 10 },
    })));
  }
  const model = trainPersonalRecoveryModel({ sessions, now: tsAt(5) });

  assert.equal(model.exercises["closed-smile"].confidence, "low");
  assert.equal(model.exercises["closed-smile"].trendStatus, "worse-capture-quality");
});
