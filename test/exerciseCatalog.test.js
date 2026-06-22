import assert from "node:assert/strict";
import test from "node:test";
import { EXERCISES, EXERCISE_BY_ID } from "../src/domain/exercises.js";

test("exercise catalog has unique ids", () => {
  const ids = EXERCISES.map((exercise) => exercise.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("catalog includes requested emoji exercises", () => {
  const requested = [
    ["emoji-raised-brow", "🤨"],
    ["emoji-wink", "😉"],
    ["emoji-smirk", "😏"],
    ["emoji-pucker", "😗"],
    ["emoji-nose-scrunch", "😖"],
  ];

  for (const [id, emoji] of requested) {
    const exercise = EXERCISE_BY_ID.get(id);
    assert.ok(exercise, `${id} should exist`);
    assert.equal(exercise.region, "emoji");
    assert.ok(exercise.name.includes(emoji), `${id} should include ${emoji}`);
  }
});

test("catalog includes blink exercise", () => {
  const exercise = EXERCISE_BY_ID.get("blink");
  assert.ok(exercise);
  assert.equal(exercise.region, "eyes");
  assert.equal(exercise.reps, 10);
  assert.equal(exercise.holdSec, 1);
});

test("catalog replaces water swish with side water holds", () => {
  assert.equal(EXERCISE_BY_ID.has("water-swish"), false);

  const left = EXERCISE_BY_ID.get("water-hold-left");
  const right = EXERCISE_BY_ID.get("water-hold-right");
  assert.ok(left);
  assert.ok(right);
  for (const exercise of [left, right]) {
    assert.equal(exercise.region, "cheeks");
    assert.equal(exercise.reps, 4);
    assert.match(exercise.instruction, /small sip of water/i);
  }
  assert.match(left.instruction, /left side/i);
  assert.match(right.instruction, /right side/i);
});
