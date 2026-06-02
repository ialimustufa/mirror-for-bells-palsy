import assert from "node:assert/strict";
import test from "node:test";
import { canPromptRetakeAfterRep, minCompletedRepsBeforeRetake, spreadRepeatedExercises } from "../src/domain/session.js";

function maxRun(ids) {
  let max = 1, run = 1;
  for (let i = 1; i < ids.length; i++) {
    run = ids[i] === ids[i - 1] ? run + 1 : 1;
    if (run > max) max = run;
  }
  return ids.length ? max : 0;
}

test("no repeats returns the list unchanged", () => {
  assert.deepEqual(spreadRepeatedExercises(["a", "b", "c"]), ["a", "b", "c"]);
});

test("preserves each id's total count", () => {
  const out = spreadRepeatedExercises(["a", "b", "c"], { a: 3, c: 2 });
  assert.equal(out.length, 6);
  assert.equal(out.filter((id) => id === "a").length, 3);
  assert.equal(out.filter((id) => id === "b").length, 1);
  assert.equal(out.filter((id) => id === "c").length, 2);
});

test("spreads repeats so they are not back-to-back when alternatives exist", () => {
  const out = spreadRepeatedExercises(["a", "b", "c"], { a: 3 });
  assert.equal(maxRun(out), 1, `expected no adjacent repeats, got ${out.join(",")}`);
});

test("a single repeated exercise has no choice but to run consecutively", () => {
  assert.deepEqual(spreadRepeatedExercises(["a"], { a: 3 }), ["a", "a", "a"]);
});

test("dominant count only doubles up when others are exhausted", () => {
  // a:4, b:1 -> best possible keeps a's separated until b runs out
  const out = spreadRepeatedExercises(["a", "b"], { a: 4, b: 1 });
  assert.equal(out.length, 5);
  assert.equal(out[0], "a");
  assert.equal(out[1], "b");
});

test("retake prompt waits until at least 25 percent of reps are complete", () => {
  assert.equal(minCompletedRepsBeforeRetake(1), 1);
  assert.equal(minCompletedRepsBeforeRetake(4), 1);
  assert.equal(minCompletedRepsBeforeRetake(5), 2);
  assert.equal(minCompletedRepsBeforeRetake(8), 2);
  assert.equal(minCompletedRepsBeforeRetake(12), 3);
});

test("retake prompt gate counts the hold that just finished", () => {
  assert.equal(canPromptRetakeAfterRep(0, 5), false);
  assert.equal(canPromptRetakeAfterRep(1, 5), true);
});
