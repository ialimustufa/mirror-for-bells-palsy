import assert from "node:assert/strict";
import test from "node:test";
import { createLiveScoreStabilizer } from "../src/ml/faceMetrics.js";

function result(symmetry) {
  return { symmetry, leftDisp: symmetry, rightDisp: 1, peak: 1 };
}

test("live score stabilizer dampens alternating frame-level scores", () => {
  const stabilizer = createLiveScoreStabilizer({ alpha: 0.3 });
  const shown = [];
  for (let i = 0; i < 8; i++) {
    shown.push(stabilizer.update(result(i % 2 === 0 ? 0.4 : 0.9), i * 50).symmetry);
  }

  const rawSwing = 0.5;
  const displaySwings = shown.slice(1).map((value, index) => Math.abs(value - shown[index]));
  assert.ok(Math.max(...displaySwings.slice(2)) < rawSwing * 0.55);
});

test("live score stabilizer converges on sustained changes", () => {
  const stabilizer = createLiveScoreStabilizer({ alpha: 0.5, maxFrames: 5 });
  stabilizer.update(result(0.4), 0);
  let latest = null;
  for (let i = 1; i <= 8; i++) latest = stabilizer.update(result(0.9), i * 50);

  assert.ok(latest.symmetry > 0.8);
  assert.ok(latest.symmetry <= 0.9);
});

test("live score stabilizer briefly holds display through transient null frames", () => {
  const stabilizer = createLiveScoreStabilizer({ invalidHoldMs: 150 });
  const first = stabilizer.update(result(0.75), 0);
  const held = stabilizer.update(null, 100);
  const cleared = stabilizer.update(null, 250);

  assert.equal(held, first);
  assert.equal(cleared, null);
});

test("live score stabilizer reset clears buffered display", () => {
  const stabilizer = createLiveScoreStabilizer();
  stabilizer.update(result(0.75), 0);
  stabilizer.reset();

  assert.equal(stabilizer.update(null, 50), null);
});
