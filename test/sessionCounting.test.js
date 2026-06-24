import assert from "node:assert/strict";
import test from "node:test";
import { computeStreak, isCountedSession, todayISO } from "../src/domain/session.js";

test("practice and assessment runs do not count toward daily goal or streak", () => {
  const today = todayISO();

  assert.equal(isCountedSession({ kind: "practice" }), false);
  assert.equal(isCountedSession({ kind: "assessment" }), false);
  assert.equal(isCountedSession({ kind: "session" }), true);
  assert.equal(isCountedSession({}), true);

  assert.equal(computeStreak([{ date: today, kind: "assessment" }]), 0);
  assert.equal(computeStreak([{ date: today, kind: "session" }]), 1);
});
