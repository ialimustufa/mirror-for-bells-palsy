import { COMFORT_DOSING, DAY_END_HOUR, DAY_START_HOUR, HOLD_SEC, REST_SEC } from "./config";
import { EXERCISES } from "./exercises";

// Persisted app state is intentionally compact and append-only for sessions/journal.
// Derived trend metrics are recomputed in views instead of stored.
export const DEFAULT_PERSONAL_PLAN = { addedExerciseIds: [], removedExerciseIds: [] };

export const DEFAULT_DATA = {
  journal: [],
  sessions: [],
  movementProfile: null,
  initialMovementProfile: null,
  movementProfileHistory: [],
  prefs: { voiceEnabled: true, mirrorEnabled: true, symmetryEnabled: true, dailyGoal: 3, onboarded: false, personalPlan: DEFAULT_PERSONAL_PLAN },
};

export const todayISO = () => new Date().toISOString().split("T")[0];
export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));

// Single-exercise standalone runs are tagged "practice" — they're still tracked and
// charted, but don't count toward the daily-goal X-of-Y counter. Legacy records have no
// kind and continue to count.
export function isCountedSession(s) {
  return s?.kind !== "practice";
}

export function getComfortDosing(profileOrLevel) {
  const key = typeof profileOrLevel === "string" ? profileOrLevel : profileOrLevel?.comfortLevel;
  return COMFORT_DOSING[key] ?? COMFORT_DOSING.normal;
}

export function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function applySessionDose(exercise, profile) {
  const dosing = getComfortDosing(profile);
  const reps = clampNumber(Math.round(exercise.reps * dosing.repScale), dosing.minReps, dosing.maxReps);
  const holdSec = clampNumber(Math.round(exercise.holdSec + dosing.holdDeltaSec), dosing.minHoldSec, dosing.maxHoldSec);
  return { ...exercise, baseReps: exercise.reps, baseHoldSec: exercise.holdSec, reps, holdSec, restSec: dosing.restSec, comfortLevel: dosing.key };
}

export function buildSessionExercises(ids, profile) {
  return ids.map((id) => EXERCISES.find((e) => e.id === id)).filter(Boolean).map((exercise) => applySessionDose(exercise, profile));
}

export function exerciseRestSec(exercise) {
  return exercise?.restSec ?? REST_SEC;
}

export function exerciseHoldSec(exercise) {
  return exercise?.holdSec ?? HOLD_SEC;
}

// Evenly-spaced session times today (e.g. dailyGoal=5 -> 9:00, 12:00, 15:00, 18:00, 21:00).
export function todaysSessionSlots(dailyGoal) {
  if (!dailyGoal || dailyGoal <= 0) return [];
  const minutes = (DAY_END_HOUR - DAY_START_HOUR) * 60;
  const step = dailyGoal === 1 ? 0 : minutes / (dailyGoal - 1);
  const slots = [];
  for (let i = 0; i < dailyGoal; i++) {
    const total = DAY_START_HOUR * 60 + step * i;
    const h = Math.floor(total / 60), m = Math.round(total % 60);
    const d = new Date(); d.setHours(h, m, 0, 0);
    slots.push(d);
  }
  return slots;
}

export function nextSessionAt(dailyGoal, completedToday) {
  if (completedToday >= dailyGoal) return null;
  const slots = todaysSessionSlots(dailyGoal);
  return slots[completedToday] ?? null;
}

export function formatClock(d) {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export const computeStreak = (sessions) => {
  if (!sessions.length) return 0;
  const dates = [...new Set(sessions.map((s) => s.date))].sort().reverse();
  let streak = 0; let cursor = todayISO();
  for (const d of dates) {
    if (d === cursor) { streak++; const prev = new Date(cursor); prev.setDate(prev.getDate() - 1); cursor = prev.toISOString().split("T")[0]; }
    else if (daysBetween(d, cursor) > 0) break;
  }
  return streak;
};
