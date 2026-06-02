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
    ["emoji-nose-scrunch", "😖"],
  ];

  for (const [id, emoji] of requested) {
    const exercise = EXERCISE_BY_ID.get(id);
    assert.ok(exercise, `${id} should exist`);
    assert.equal(exercise.region, "emoji");
    assert.ok(exercise.name.includes(emoji), `${id} should include ${emoji}`);
  }
});

test("catalog includes water hold swish exercise", () => {
  const exercise = EXERCISE_BY_ID.get("water-swish");
  assert.ok(exercise);
  assert.equal(exercise.region, "cheeks");
  assert.match(exercise.instruction, /left to right and right to left/i);
});
