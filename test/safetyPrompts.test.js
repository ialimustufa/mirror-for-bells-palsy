import assert from "node:assert/strict";
import test from "node:test";
import { summarizeJournalEntrySafetyPrompts, summarizeJournalSafetyPrompts } from "../src/domain/safetyPrompts.js";

test("journal safety prompts cover eye, fatigue, pain, and worsening symptom notes", () => {
  const prompts = summarizeJournalSafetyPrompts([
    { date: "2026-06-20", ts: Date.parse("2026-06-20"), notes: "Dry eye by evening." },
    { date: "2026-06-21", ts: Date.parse("2026-06-21"), notes: "Exercises caused pain and I felt exhausted." },
    { date: "2026-06-22", ts: Date.parse("2026-06-22"), notes: "New symptoms and dizziness today." },
  ], { referenceDate: "2026-06-23", lookbackDays: 14 });

  assert.equal(prompts[0].id, "new-or-worsening-symptoms");
  assert.deepEqual(new Set(prompts.map((prompt) => prompt.id)), new Set([
    "new-or-worsening-symptoms",
    "significant-fatigue",
    "pain-or-strain",
    "eye-protection",
  ]));
  assert.equal(prompts[0].severity, "urgent");
  assert.equal(prompts.find((prompt) => prompt.id === "pain-or-strain").entryCount, 1);
});

test("journal safety prompt negation skips obvious resolved or absent symptoms", () => {
  const prompts = summarizeJournalEntrySafetyPrompts({
    notes: "No pain, no eye dryness, fatigue resolved, and dizziness better.",
  });

  assert.deepEqual(prompts, []);
});

test("journal safety prompts avoid broad neurological keyword matches", () => {
  const prompts = summarizeJournalEntrySafetyPrompts({
    notes: "Speech practice felt clearer and vision board exercises were fine.",
  });

  assert.deepEqual(prompts, []);
});

test("journal safety prompts group repeated recent entries and ignore old notes", () => {
  const prompts = summarizeJournalSafetyPrompts([
    { date: "2026-05-01", ts: Date.parse("2026-05-01"), notes: "Dry eye." },
    { date: "2026-06-21", ts: Date.parse("2026-06-21"), notes: "Pain after practice." },
    { date: "2026-06-22", ts: Date.parse("2026-06-22"), notes: "Pain again after practice." },
  ], { referenceDate: "2026-06-23", lookbackDays: 14 });

  assert.deepEqual(prompts.map((prompt) => prompt.id), ["pain-or-strain"]);
  assert.equal(prompts[0].entryCount, 2);
  assert.equal(prompts[0].latestDate, "2026-06-22");
});
