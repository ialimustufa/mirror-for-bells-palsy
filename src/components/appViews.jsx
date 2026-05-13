import { useEffect, useMemo, useRef, useState } from "react";
import { Home, Sparkles, BookOpen, TrendingUp, Play, X, ChevronLeft, ChevronRight, Eye, Flame, Check, Heart, Info, ArrowRight, Loader2, Volume2, VolumeX, Zap, AlertCircle, Share2, Trash2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { DAY_END_HOUR, DAY_START_HOUR, PROFILE_HOLD_SEC, PROFILE_REST_SEC } from "../domain/config";
import { EXERCISES, MOOD_OPTIONS, PROFILE_ASSESSMENT_EXERCISES, PROFILE_STARTER_ASSESSMENT_EXERCISES, REGIONS } from "../domain/exercises";
import { applySessionDose, daysBetween, exerciseHoldSec, formatClock, getComfortDosing, isCountedSession, nextSessionAt, todayISO } from "../domain/session";
import { formatDuration, formatSessionDate, shareSessionReport } from "../reports/sessionReport";
import { displayPct, scoreColor } from "../ui/scoreFormatting";
import { baselineProgressLabel, buildPersonalizedDailyPlan, compareMovementProfiles, focusReason, formatProfileDate, formatProfileSide, getAdaptiveFocusItems, latestExerciseProgressById, latestSessionBaselineProgress, objectCoverTransform, preferredBaselineProgress, profileExerciseEntries, profileStatus, sessionFocusRecommendation, signedPointDelta } from "../ml/faceMetrics";
import { flushSpeech, primeSpeech, warmSpeechVoices } from "../lib/speech";

function Header({ view, streak }) {
  const titles = { home: "Today", practice: "Practice", journal: "Journal", progress: "Progress" };
  return (
    <header className="flex items-center justify-between lg:hidden">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#1F1B16" }}>
          <div className="w-4 h-4 rounded-full" style={{ background: "#F4EFE6" }} />
        </div>
        <div>
          <div className="text-lg leading-none" style={{ fontFamily: "Fraunces", fontWeight: 600, letterSpacing: "-0.01em" }}>Mirror</div>
          <div className="text-xs text-stone-500 mt-0.5">{titles[view]}</div>
        </div>
      </div>
      {streak > 0 && <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: "rgba(184, 84, 58, 0.1)", color: "#B8543A" }}><Flame className="w-4 h-4" /><span className="text-sm font-semibold">{streak}</span></div>}
    </header>
  );
}

function Sidebar({ view, setView, streak }) {
  const items = [{ key: "home", label: "Today", icon: Home }, { key: "practice", label: "Practice", icon: Sparkles }, { key: "journal", label: "Journal", icon: BookOpen }, { key: "progress", label: "Progress", icon: TrendingUp }];
  return (
    <aside className="hidden lg:flex fixed top-0 left-0 bottom-0 w-20 z-20 flex-col items-center py-5 gap-2" style={{ background: "rgba(31, 27, 22, 0.94)", borderRight: "1px solid rgba(244,239,230,0.06)" }}>
      <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2" style={{ background: "#F4EFE6" }} title="Mirror">
        <div className="w-4 h-4 rounded-full" style={{ background: "#1F1B16" }} />
      </div>
      <div className="flex flex-col items-center gap-1 flex-1 mt-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = view === item.key;
          return (
            <button key={item.key} onClick={() => setView(item.key)} className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-colors" style={{ background: active ? "#F4EFE6" : "transparent", color: active ? "#1F1B16" : "rgba(244,239,230,0.65)" }}>
              <Icon className="w-4 h-4" strokeWidth={2.2} />
              <span className="text-[9px] font-semibold">{item.label}</span>
            </button>
          );
        })}
      </div>
      {streak > 0 && (
        <div className="flex flex-col items-center gap-0.5 px-2 py-2 rounded-2xl" style={{ background: "rgba(184, 84, 58, 0.18)", color: "#FFB48F" }} title={`${streak} day streak`}>
          <Flame className="w-4 h-4" />
          <span className="text-xs font-semibold tabular-nums">{streak}</span>
        </div>
      )}
    </aside>
  );
}

function HomeView({ data, streak, onStartProfile, onStartSession, onGo }) {
  // Home is a derived dashboard: it summarizes today's stored records and maps the
  // configured daily goal into the next practice prompt.
  const todaysSessions = data.sessions.filter((s) => s.date === todayISO());
  const todaysCountedSessions = todaysSessions.filter(isCountedSession);
  const todaysJournal = data.journal.find((j) => j.date === todayISO());
  const dailyGoal = data.prefs.dailyGoal ?? 3;
  const todaysPlan = buildPersonalizedDailyPlan(data.movementProfile, data.sessions);
  const focusItems = getAdaptiveFocusItems(data.movementProfile, data.sessions, 3);
  const planExercises = todaysPlan.map((id) => EXERCISES.find((e) => e.id === id)).filter(Boolean);
  const latestBaseline = latestSessionBaselineProgress(data.sessions);
  const baselineStatus = profileStatus(data.movementProfile);
  const weakBaselineIds = baselineStatus?.retakeExercises?.map((ex) => ex.exerciseId) ?? [];
  const missingBaselineIds = data.movementProfile
    ? PROFILE_ASSESSMENT_EXERCISES.filter((id) => !data.movementProfile.exercises?.[id])
    : [];
  const completed = todaysCountedSessions.length;
  const remaining = Math.max(0, dailyGoal - completed);
  const nextSlot = nextSessionAt(dailyGoal, completed);
  const todaysAvgSymmetry = (() => {
    const valid = todaysSessions.map((s) => s.sessionAvg).filter((v) => v != null);
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  })();
  const nextLabel = nextSlot
    ? (nextSlot.getTime() <= new Date().getTime() ? "Now" : formatClock(nextSlot))
    : null;
  const greeting = (() => { const h = new Date().getHours(); if (h < 12) return "Good morning"; if (h < 18) return "Good afternoon"; return "Good evening"; })();

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-stone-500">{greeting}</div>
        <h1 className="text-4xl mt-1 leading-tight" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>
          {streak > 0 ? <><em style={{ fontStyle: "italic", fontWeight: 400 }}>Day {streak}</em> of your practice.</> : "Ready when you are."}
        </h1>
      </div>
      <div className="rounded-3xl p-6 relative overflow-hidden" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
        <div className="absolute -bottom-12 -right-12 w-48 h-48 rounded-full opacity-15" style={{ background: "#D4A574" }} />
        <div className="relative">
          <div className="text-xs uppercase tracking-wider opacity-60 mb-3">Today's progress</div>
          <div className="flex items-center gap-1.5 mb-4">
            {Array.from({ length: dailyGoal }).map((_, i) => {
              const done = i < completed;
              return (
                <div key={i} className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
                  style={{ background: done ? "#B8543A" : "rgba(244,239,230,0.08)", border: done ? "none" : "1px solid rgba(244,239,230,0.2)" }}>
                  {done && <Check className="w-3.5 h-3.5" style={{ color: "#F4EFE6" }} />}
                </div>
              );
            })}
            <div className="ml-2 text-sm opacity-80 tabular-nums">{completed} of {dailyGoal}</div>
          </div>
          <div className="text-2xl mb-1" style={{ fontFamily: "Fraunces", fontWeight: 500 }}>
            {remaining > 0 ? `Session ${completed + 1} of ${dailyGoal}` : "Done for today"}
          </div>
          <div className="text-sm opacity-70 mb-5">
            {remaining > 0
              ? (nextLabel === "Now" ? "Time for your next session" : `Next at ${nextLabel}`)
              : "Beautifully done. Rest and return tomorrow."}
          </div>
          <button onClick={() => onStartSession(todaysPlan)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>
            <Play className="w-4 h-4 fill-current" />{remaining > 0 ? "Start session" : "Practice again"}
          </button>
        </div>
      </div>
      {data.movementProfile && (
        <div className="rounded-2xl p-4" style={{ background: "rgba(31, 27, 22, 0.92)", color: "#F4EFE6" }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-sm font-semibold">Personalized plan</div>
              <div className="text-xs opacity-60">Prioritized from your baseline profile</div>
            </div>
            <div className="flex items-center gap-2">
              {baselineStatus && <div className="text-xs rounded-full px-2.5 py-1" style={{ background: `${baselineStatus.quality.color}26`, color: baselineStatus.quality.color }}>{baselineStatus.quality.label}</div>}
              <div className="text-xs rounded-full px-2.5 py-1" style={{ background: "rgba(244,239,230,0.08)" }}>{planExercises.length} moves</div>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {planExercises.map((ex) => <ExerciseGlyph key={ex.id} exercise={ex} size="xs" tone="dark" />)}
          </div>
          <div className="grid grid-cols-1 gap-2 mt-4">
            {focusItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: "rgba(244,239,230,0.06)" }}>
                <ExerciseGlyph exercise={item.exercise} size="xs" tone="dark" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate">{item.exercise?.name}</div>
                  <div className="text-[11px] opacity-55">{focusReason(item)} · limited side {item.profileExercise.limitedSide}</div>
                </div>
              </div>
            ))}
          </div>
          {latestBaseline && (
            <div className="mt-3 text-xs rounded-xl px-3 py-2" style={{ background: "rgba(122,143,115,0.18)", color: "#D9E5D2" }}>
              Latest baseline progress: {latestBaseline.side} side · {baselineProgressLabel(latestBaseline)}
            </div>
          )}
          {missingBaselineIds.length > 0 && (
            <div className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: "rgba(212,165,116,0.14)", color: "#F6D8B2" }}>
              <div className="flex-1 text-xs">{missingBaselineIds.length} movement baseline{missingBaselineIds.length === 1 ? "" : "s"} left to add.</div>
              <button onClick={() => onStartProfile(missingBaselineIds)} className="rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap" style={{ background: "#D4A574", color: "#1F1B16" }}>Add remaining</button>
            </div>
          )}
          {baselineStatus?.shouldRetake && (
            <div className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: "rgba(184,84,58,0.16)", color: "#FFD3C1" }}>
              <div className="flex-1 text-xs">Retake baseline: {baselineStatus.reason}</div>
              <button onClick={() => onStartProfile(weakBaselineIds.length ? weakBaselineIds : null)} className="rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap" style={{ background: "#B8543A", color: "#F4EFE6" }}>{weakBaselineIds.length ? "Retake weak" : "Retake"}</button>
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Streak" value={streak} unit={streak === 1 ? "day" : "days"} />
        <StatCard label="Today's symmetry" value={todaysAvgSymmetry != null ? `${displayPct(todaysAvgSymmetry)}` : "—"} unit={todaysAvgSymmetry != null ? "%" : "no data"} />
        <StatCard label="Self-rated" value={todaysJournal ? `${todaysJournal.symmetry}` : "—"} unit={todaysJournal ? "/ 10" : "log"} />
      </div>
      <div className="rounded-2xl p-5" style={{ background: "rgba(122, 143, 115, 0.12)", border: "1px solid rgba(122, 143, 115, 0.2)" }}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "#7A8F73", color: "#F4EFE6" }}><Heart className="w-4 h-4" /></div>
          <div>
            <div className="text-sm mb-1" style={{ fontFamily: "Fraunces", fontWeight: 600 }}>Gentle reminder</div>
            <p className="text-sm text-stone-700 leading-relaxed">Quality over force. Slow, controlled movement in front of the mirror is what teaches your nerves to fire symmetrically — not repetitions or strain.</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SecondaryButton onClick={() => onGo("practice")}>Browse exercises<ArrowRight className="w-4 h-4" /></SecondaryButton>
        <SecondaryButton onClick={() => onGo("journal")}>{todaysJournal ? "Update journal" : "Log today"}<ArrowRight className="w-4 h-4" /></SecondaryButton>
      </div>
    </div>
  );
}

function StatCard({ label, value, unit }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
      <div className="text-xs text-stone-500 mb-1">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>{value}</span>
        <span className="text-xs text-stone-500">{unit}</span>
      </div>
    </div>
  );
}

function SecondaryButton({ children, onClick }) {
  return <button onClick={onClick} className="rounded-2xl p-4 text-left text-sm font-medium flex items-center justify-between transition hover:bg-white" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>{children}</button>;
}

function drawArrow(ctx, x, y, kind, label, dpr, color, pulse = 1, side) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.5 * dpr;
  ctx.font = `600 ${11 * dpr}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  if (kind === "ring" || kind === "ringDashed") {
    if (kind === "ringDashed") ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.arc(x, y, (18 + 4 * pulse) * dpr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (label) ctx.fillText(label, x, y - 28 * dpr);
  } else if (kind === "up" || kind === "down") {
    const sign = kind === "up" ? -1 : 1;
    const tailY = y + sign * 22 * dpr;
    const headY = y + sign * (38 + 6 * pulse) * dpr;
    ctx.beginPath();
    ctx.moveTo(x, tailY);
    ctx.lineTo(x, headY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 6 * dpr, headY - sign * 9 * dpr);
    ctx.lineTo(x, headY);
    ctx.lineTo(x + 6 * dpr, headY - sign * 9 * dpr);
    ctx.stroke();
    if (label) {
      const labelY = kind === "up" ? headY - 6 * dpr : headY + 14 * dpr;
      ctx.fillText(label, x, labelY);
    }
  } else if (kind === "out" || kind === "in") {
    const sign = kind === "out"
      ? (side === "left" ? -1 : 1)
      : (side === "left" ? 1 : -1);
    const tailX = x + sign * 18 * dpr;
    const headX = x + sign * (38 + 6 * pulse) * dpr;
    ctx.beginPath();
    ctx.moveTo(tailX, y);
    ctx.lineTo(headX, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(headX - sign * 9 * dpr, y - 6 * dpr);
    ctx.lineTo(headX, y);
    ctx.lineTo(headX - sign * 9 * dpr, y + 6 * dpr);
    ctx.stroke();
    if (label) {
      ctx.textAlign = sign < 0 ? "right" : "left";
      ctx.fillText(label, headX + sign * 4 * dpr, y - 8 * dpr);
    }
  }
  ctx.restore();
}

function drawArrowMarkers(canvas, video, lm, mirrorEnabled, exerciseId) {
  if (!canvas || !video) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  if (!lm || lm.length < 478) return;
  const t = objectCoverTransform(canvas, video);
  if (!t) return;

  const px = (p) => mirrorEnabled ? t.cw - (p.x * t.dw + t.ox) : (p.x * t.dw + t.ox);
  const py = (p) => p.y * t.dh + t.oy;
  const avg = (...idxs) => {
    let sx = 0, sy = 0;
    for (const i of idxs) { sx += px(lm[i]); sy += py(lm[i]); }
    return { x: sx / idxs.length, y: sy / idxs.length };
  };
  const pair = (a, b) => (a.x < b.x ? [a, b] : [b, a]);

  // Anchors are screen-space and ordered by screen position so "*L" is always
  // on the screen-left regardless of whether the video is mirrored.
  const [eyeL, eyeR] = pair(avg(33, 133), avg(263, 362));
  const [browL, browR] = pair(avg(70, 63, 105, 66, 107), avg(336, 296, 334, 293, 300));
  const [cheekL, cheekR] = pair({ x: px(lm[50]), y: py(lm[50]) }, { x: px(lm[280]), y: py(lm[280]) });
  const [nostrilL, nostrilR] = pair({ x: px(lm[64]), y: py(lm[64]) }, { x: px(lm[294]), y: py(lm[294]) });
  const [mouthL, mouthR] = pair({ x: px(lm[61]), y: py(lm[61]) }, { x: px(lm[291]), y: py(lm[291]) });
  const mouthC = avg(13, 14);

  const now = Date.now();
  const pulse = 0.5 + 0.5 * Math.sin(now / 240);
  const alt = Math.floor(now / 2400) % 2 === 0;

  const PRIMARY = `rgba(184, 84, 58, ${0.78 + 0.22 * pulse})`;
  const SECONDARY = "rgba(122, 143, 115, 0.85)";

  switch (exerciseId) {
    case "eyebrow-raise":
      drawArrow(ctx, browL.x, browL.y, "up", "Lift", dpr, PRIMARY, pulse);
      drawArrow(ctx, browR.x, browR.y, "up", "Lift", dpr, PRIMARY, pulse);
      break;
    case "gentle-frown":
      drawArrow(ctx, browL.x, browL.y, "down", "Pull", dpr, PRIMARY, pulse);
      drawArrow(ctx, browR.x, browR.y, "down", "Pull", dpr, PRIMARY, pulse);
      break;
    case "eye-close":
      drawArrow(ctx, eyeL.x, eyeL.y, "ring", "Close softly", dpr, PRIMARY, pulse);
      drawArrow(ctx, eyeR.x, eyeR.y, "ring", null, dpr, PRIMARY, pulse);
      break;
    case "wink":
    case "emoji-wink": {
      const closed = alt ? eyeL : eyeR;
      const open = alt ? eyeR : eyeL;
      drawArrow(ctx, closed.x, closed.y, "ring", "Close", dpr, PRIMARY, pulse);
      drawArrow(ctx, open.x, open.y, "ringDashed", "Keep open", dpr, SECONDARY, 1);
      break;
    }
    case "nose-wrinkle":
      drawArrow(ctx, nostrilL.x, nostrilL.y, "out", "Flare", dpr, PRIMARY, pulse, "left");
      drawArrow(ctx, nostrilR.x, nostrilR.y, "out", null, dpr, PRIMARY, pulse, "right");
      break;
    case "emoji-nose-scrunch":
      drawArrow(ctx, nostrilL.x, nostrilL.y, "up", "Scrunch", dpr, PRIMARY, pulse);
      drawArrow(ctx, nostrilR.x, nostrilR.y, "up", null, dpr, PRIMARY, pulse);
      break;
    case "cheek-puff":
      drawArrow(ctx, cheekL.x, cheekL.y, "out", "Puff", dpr, PRIMARY, pulse, "left");
      drawArrow(ctx, cheekR.x, cheekR.y, "out", null, dpr, PRIMARY, pulse, "right");
      break;
    case "cheek-suck":
      drawArrow(ctx, cheekL.x, cheekL.y, "in", "Pull in", dpr, PRIMARY, pulse, "left");
      drawArrow(ctx, cheekR.x, cheekR.y, "in", null, dpr, PRIMARY, pulse, "right");
      break;
    case "closed-smile":
    case "emoji-smile":
      drawArrow(ctx, mouthL.x, mouthL.y, "up", "Lift", dpr, PRIMARY, pulse);
      drawArrow(ctx, mouthR.x, mouthR.y, "up", "Lift", dpr, PRIMARY, pulse);
      break;
    case "open-smile":
    case "emoji-big-smile":
      drawArrow(ctx, mouthL.x, mouthL.y, "up", "Smile wide", dpr, PRIMARY, pulse);
      drawArrow(ctx, mouthR.x, mouthR.y, "up", null, dpr, PRIMARY, pulse);
      break;
    case "emoji-sad-frown":
      drawArrow(ctx, mouthL.x, mouthL.y, "down", "Lower", dpr, PRIMARY, pulse);
      drawArrow(ctx, mouthR.x, mouthR.y, "down", null, dpr, PRIMARY, pulse);
      break;
    case "pucker":
    case "emoji-kiss":
      drawArrow(ctx, mouthC.x, mouthC.y, "ring", "Pucker forward", dpr, PRIMARY, pulse);
      break;
    case "lip-press":
      drawArrow(ctx, mouthC.x, mouthC.y, "ringDashed", "Press lips", dpr, PRIMARY, pulse);
      break;
    case "vowel-a":
      drawArrow(ctx, mouthC.x, mouthC.y, "ring", "Open: ah", dpr, PRIMARY, pulse);
      break;
    case "vowel-e":
      drawArrow(ctx, mouthL.x, mouthL.y, "out", "Wide: ee", dpr, PRIMARY, pulse, "left");
      drawArrow(ctx, mouthR.x, mouthR.y, "out", null, dpr, PRIMARY, pulse, "right");
      break;
    case "vowel-i":
      drawArrow(ctx, mouthC.x, mouthC.y, "ring", "Soft: ih", dpr, PRIMARY, pulse);
      break;
    case "vowel-o":
      drawArrow(ctx, mouthC.x, mouthC.y, "ring", "Round: oh", dpr, PRIMARY, pulse);
      break;
    case "vowel-u":
      drawArrow(ctx, mouthC.x, mouthC.y, "ring", "Forward: oo", dpr, PRIMARY, pulse);
      break;
    case "emoji-surprise":
      drawArrow(ctx, browL.x, browL.y, "up", "Lift", dpr, PRIMARY, pulse);
      drawArrow(ctx, browR.x, browR.y, "up", null, dpr, PRIMARY, pulse);
      drawArrow(ctx, mouthC.x, mouthC.y, "ring", "O-shape", dpr, PRIMARY, pulse);
      break;
    default:
      drawArrow(ctx, mouthC.x, mouthC.y, "ring", "Follow along", dpr, PRIMARY, pulse);
  }
}

function LiveExercisePreview({ exerciseId, stream, faceLandmarker, mirrorEnabled, className = "" }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [hasFace, setHasFace] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    if (!faceLandmarker) return;
    let raf = 0;
    let alive = true;
    let lastTs = 0;
    const tick = () => {
      if (!alive) return;
      const v = videoRef.current;
      const c = canvasRef.current;
      if (v && c && v.readyState >= 2 && !v.paused && v.videoWidth > 0) {
        let lm = null;
        try {
          const ts = Math.max(lastTs + 1, performance.now());
          lastTs = ts;
          const result = faceLandmarker.detectForVideo(v, ts);
          lm = result?.faceLandmarks?.[0] ?? null;
        } catch {
          // Detection is best-effort; transient frame errors should not break preview.
        }
        drawArrowMarkers(c, v, lm, mirrorEnabled, exerciseId);
        if (lm && !hasFace) setHasFace(true);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [faceLandmarker, mirrorEnabled, hasFace, exerciseId]);

  return (
    <div className={`relative w-full max-w-[16rem] aspect-[3/4] rounded-3xl overflow-hidden ${className}`} style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(244, 239, 230, 0.1)" }}>
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: mirrorEnabled ? "scaleX(-1)" : "none" }} />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      {!hasFace && (
        <div className="absolute inset-0 flex items-center justify-center text-xs opacity-70 pointer-events-none">Detecting face…</div>
      )}
    </div>
  );
}

function ExerciseAnimation({ region, size = "lg", className = "" }) {
  const sizeClass = { md: "w-28 h-28", lg: "w-40 h-40", xl: "w-44 h-44" }[size] ?? "w-40 h-40";
  const accent = "#D4A574";
  return (
    <div className={`${sizeClass} ${className} rounded-3xl flex items-center justify-center`} style={{ background: "rgba(244, 239, 230, 0.06)", border: "1px solid rgba(244, 239, 230, 0.1)", color: "#F4EFE6" }} aria-hidden>
      <svg viewBox="0 0 48 48" className="w-[78%] h-[78%]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 5.5c-9.2 0-15.5 7.6-15.5 18.4 0 11 6.8 18.6 15.5 18.6s15.5-7.6 15.5-18.6C39.5 13.1 33.2 5.5 24 5.5Z" opacity="0.26" />
        <path d="M24 14.5v17" opacity="0.16" />

        {region === "forehead" && (
          <g className="bp-anim-forehead">
            <path d="M16 15.8c2.8-1.4 5.1-1.4 7.2-.2" stroke={accent} />
            <path d="M24.8 15.6c2.1-1.2 4.4-1.2 7.2.2" stroke={accent} />
            <path d="M17.5 11.2c4.2-1.7 8.8-1.7 13 0" opacity="0.58" />
          </g>
        )}

        {region === "eyes" && (
          <g className="bp-anim-eyes">
            <path d="M14.5 21.2c2.3-2.2 5.1-2.2 7.4 0" stroke={accent} />
            <path d="M26.1 21.2c2.3-2.2 5.1-2.2 7.4 0" stroke={accent} />
            <path d="M15.8 24.2c1.5.9 3.1.9 4.8 0" opacity="0.58" />
            <path d="M27.4 24.2c1.7.9 3.3.9 4.8 0" opacity="0.58" />
          </g>
        )}

        {region === "nose" && (
          <g className="bp-anim-nose">
            <path d="M24 18.5c-.5 3.8-1.5 7.2-3.4 10.3" stroke={accent} />
            <path d="M24 18.5c.5 3.8 1.5 7.2 3.4 10.3" stroke={accent} />
            <path className="bp-anim-nostril" d="M18.2 31.3c1.4-1.1 2.8-1.1 4.1 0" opacity="0.58" />
            <path className="bp-anim-nostril" d="M25.7 31.3c1.3-1.1 2.7-1.1 4.1 0" opacity="0.58" />
          </g>
        )}

        {region === "cheeks" && (
          <g className="bp-anim-cheeks">
            <path d="M14.4 27.3c2.4 2.1 5.2 2.1 7.5 0" stroke={accent} />
            <path d="M26.1 27.3c2.3 2.1 5.1 2.1 7.5 0" stroke={accent} />
            <path d="M16.4 23.1c1.1-.6 2.3-.6 3.4 0" opacity="0.5" />
            <path d="M28.2 23.1c1.1-.6 2.3-.6 3.4 0" opacity="0.5" />
          </g>
        )}

        {region === "mouth" && (
          <g>
            <path d="M19.6 27.8h8.8" opacity="0.58" />
            <path className="bp-anim-mouth-neutral" d="M17 31.2 L31 31.2" stroke={accent} />
            <path className="bp-anim-mouth-smile" d="M17 31.2c4.5 3.4 9.5 3.4 14 0" stroke={accent} />
          </g>
        )}

        {region === "emoji" && (
          <g className="bp-anim-emoji">
            <path d="M15.5 18.4c2.2-1.3 4.3-1.3 6.2 0" stroke={accent} />
            <path d="M26.3 18.4c1.9-1.3 4-1.3 6.2 0" stroke={accent} />
            <path d="M16.6 23.2c1.4 1 3 1 4.4 0" opacity="0.58" />
            <path d="M27 23.2c1.4 1 3 1 4.4 0" opacity="0.58" />
            <path d="M17 31.4c4.6 4 9.4 4 14 0" stroke={accent} />
            <path d="M33.2 12.4l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3.9-1.8Z" fill={accent} stroke="none" />
          </g>
        )}
      </svg>
      <style>{`
        .bp-anim-forehead { animation: bpForehead 2.4s ease-in-out infinite; }
        .bp-anim-eyes path { animation: bpEyes 2.4s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
        .bp-anim-nose .bp-anim-nostril { animation: bpNose 2.4s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
        .bp-anim-cheeks path { animation: bpCheeks 2.4s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
        .bp-anim-mouth-neutral { animation: bpMouthNeutral 2.4s ease-in-out infinite; }
        .bp-anim-mouth-smile { animation: bpMouthSmile 2.4s ease-in-out infinite; opacity: 0; }
        .bp-anim-emoji { animation: bpEmoji 2.4s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
        @keyframes bpForehead { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2.4px); } }
        @keyframes bpEyes { 0%, 100% { transform: scaleY(1); } 45%, 55% { transform: scaleY(0.18); } }
        @keyframes bpNose { 0%, 100% { transform: scaleX(1); } 50% { transform: scaleX(1.5); } }
        @keyframes bpCheeks { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.16); } }
        @keyframes bpMouthNeutral { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes bpMouthSmile { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }
        @keyframes bpEmoji { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        @media (prefers-reduced-motion: reduce) {
          .bp-anim-forehead, .bp-anim-eyes path, .bp-anim-nose .bp-anim-nostril, .bp-anim-cheeks path, .bp-anim-mouth-neutral, .bp-anim-mouth-smile, .bp-anim-emoji { animation: none; }
          .bp-anim-mouth-smile { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function ExerciseGlyph({ exercise, exerciseId, region, size = "sm", tone = "light", className = "" }) {
  const resolved = exercise ?? EXERCISES.find((e) => e.id === exerciseId) ?? {};
  const regionKey = resolved.region ?? region ?? "mouth";
  const sizeClass = { xs: "w-8 h-8 rounded-xl", sm: "w-10 h-10 rounded-2xl", md: "w-14 h-14 rounded-2xl", lg: "w-20 h-20 rounded-3xl" }[size] ?? "w-10 h-10 rounded-2xl";
  const dark = tone === "dark";
  const background = dark ? "rgba(244, 239, 230, 0.08)" : "rgba(122, 143, 115, 0.1)";
  const border = dark ? "1px solid rgba(244, 239, 230, 0.1)" : "1px solid rgba(122, 143, 115, 0.18)";
  const color = dark ? "#F4EFE6" : "#1F1B16";
  const accent = dark ? "#D4A574" : "#7A8F73";

  return (
    <div className={`${sizeClass} ${className} shrink-0 flex items-center justify-center`} style={{ background, border, color }} aria-hidden>
      <svg viewBox="0 0 48 48" className="w-[72%] h-[72%]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 5.5c-9.2 0-15.5 7.6-15.5 18.4 0 11 6.8 18.6 15.5 18.6s15.5-7.6 15.5-18.6C39.5 13.1 33.2 5.5 24 5.5Z" opacity="0.26" />
        <path d="M24 14.5v17" opacity="0.16" />

        {regionKey === "forehead" && (
          <>
            <path d="M16 15.8c2.8-1.4 5.1-1.4 7.2-.2" stroke={accent} />
            <path d="M24.8 15.6c2.1-1.2 4.4-1.2 7.2.2" stroke={accent} />
            <path d="M17.5 11.2c4.2-1.7 8.8-1.7 13 0" opacity="0.58" />
          </>
        )}

        {regionKey === "eyes" && (
          <>
            <path d="M14.5 21.2c2.3-2.2 5.1-2.2 7.4 0" stroke={accent} />
            <path d="M26.1 21.2c2.3-2.2 5.1-2.2 7.4 0" stroke={accent} />
            <path d="M15.8 24.2c1.5.9 3.1.9 4.8 0" opacity="0.58" />
            <path d="M27.4 24.2c1.7.9 3.3.9 4.8 0" opacity="0.58" />
          </>
        )}

        {regionKey === "nose" && (
          <>
            <path d="M24 18.5c-.5 3.8-1.5 7.2-3.4 10.3" stroke={accent} />
            <path d="M24 18.5c.5 3.8 1.5 7.2 3.4 10.3" stroke={accent} />
            <path d="M18.2 31.3c1.4-1.1 2.8-1.1 4.1 0" opacity="0.58" />
            <path d="M25.7 31.3c1.3-1.1 2.7-1.1 4.1 0" opacity="0.58" />
          </>
        )}

        {regionKey === "cheeks" && (
          <>
            <path d="M14.4 27.3c2.4 2.1 5.2 2.1 7.5 0" stroke={accent} />
            <path d="M26.1 27.3c2.3 2.1 5.1 2.1 7.5 0" stroke={accent} />
            <path d="M16.4 23.1c1.1-.6 2.3-.6 3.4 0" opacity="0.5" />
            <path d="M28.2 23.1c1.1-.6 2.3-.6 3.4 0" opacity="0.5" />
          </>
        )}

        {regionKey === "mouth" && (
          <>
            <path d="M17 31.2c4.5 3.4 9.5 3.4 14 0" stroke={accent} />
            <path d="M19.6 27.8h8.8" opacity="0.58" />
          </>
        )}

        {regionKey === "emoji" && (
          <>
            <path d="M15.5 18.4c2.2-1.3 4.3-1.3 6.2 0" stroke={accent} />
            <path d="M26.3 18.4c1.9-1.3 4-1.3 6.2 0" stroke={accent} />
            <path d="M16.6 23.2c1.4 1 3 1 4.4 0" opacity="0.58" />
            <path d="M27 23.2c1.4 1 3 1 4.4 0" opacity="0.58" />
            <path d="M17 31.4c4.6 4 9.4 4 14 0" stroke={accent} />
            <path d="M33.2 12.4l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3.9-1.8Z" fill={accent} stroke="none" />
          </>
        )}
      </svg>
    </div>
  );
}

function PracticeView({ movementProfile, sessions, onStartSession, onShowDetail }) {
  // Library state stays local until the user starts a session, keeping custom routines
  // ephemeral and avoiding partial selections in persisted recovery data.
  const profilePlan = useMemo(() => buildPersonalizedDailyPlan(movementProfile, sessions), [movementProfile, sessions]);
  const focusItems = useMemo(() => getAdaptiveFocusItems(movementProfile, sessions, 3), [movementProfile, sessions]);
  const dosing = getComfortDosing(movementProfile);
  const [region, setRegion] = useState("all");
  const [selected, setSelected] = useState(() => new Set(profilePlan));
  useEffect(() => { if (movementProfile) setSelected(new Set(profilePlan)); }, [movementProfile, profilePlan]);
  const filtered = region === "all" ? EXERCISES : EXERCISES.filter((e) => e.region === region);
  const toggle = (id) => { const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); setSelected(next); };
  const shownIds = filtered.map((exercise) => exercise.id);
  const selectedShownCount = shownIds.filter((id) => selected.has(id)).length;
  const allShownSelected = shownIds.length > 0 && selectedShownCount === shownIds.length;
  const recommendedSelected = selected.size === profilePlan.length && profilePlan.every((id) => selected.has(id));
  const selectRecommended = () => setSelected(new Set(profilePlan));
  const selectAllShown = () => setSelected((prev) => new Set([...prev, ...shownIds]));
  const clearSelection = () => setSelected(new Set());

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-3xl" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>Practice library</h2>
        <p className="text-sm text-stone-600 mt-1">Tap an exercise to see details. Select multiple to build a custom session.</p>
      </div>
      {movementProfile && (
        <div className="rounded-2xl p-4" style={{ background: "rgba(122, 143, 115, 0.12)", border: "1px solid rgba(122, 143, 115, 0.2)" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold">Baseline focus selected</div>
              <div className="text-xs text-stone-600">{dosing.label} dose · starts with the lowest baseline movements.</div>
            </div>
            <button onClick={selectRecommended} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: "#1F1B16", color: "#F4EFE6" }}>Recommended</button>
          </div>
          <div className="space-y-2">
            {focusItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <ExerciseGlyph exercise={item.exercise} size="xs" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{item.exercise?.name}</div>
                  <div className="text-[11px] text-stone-600">{focusReason(item)} · limited side {item.profileExercise.limitedSide}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {REGIONS.map((r) => (
          <button key={r.key} onClick={() => setRegion(r.key)} className="px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap" style={{ background: region === r.key ? "#1F1B16" : "rgba(255,255,255,0.6)", color: region === r.key ? "#F4EFE6" : "#1F1B16", border: region === r.key ? "none" : "1px solid rgba(31, 27, 22, 0.08)" }}>{r.label}</button>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl px-4 py-3" style={{ background: "rgba(255,255,255,0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
        <div className="text-xs text-stone-600">{selectedShownCount} of {filtered.length} shown selected{selected.size !== selectedShownCount ? ` · ${selected.size} total` : ""}</div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={selectRecommended} disabled={recommendedSelected} className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-45" style={{ background: "rgba(122, 143, 115, 0.16)", color: "#3E5F3B" }}>{recommendedSelected ? "Recommended selected" : "Recommended"}</button>
          <button onClick={selectAllShown} disabled={allShownSelected} className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-45" style={{ background: "#1F1B16", color: "#F4EFE6" }}>{allShownSelected ? "Shown selected" : "Select all shown"}</button>
          {selected.size > 0 && <button onClick={clearSelection} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: "rgba(31, 27, 22, 0.06)", color: "#1F1B16" }}>Clear</button>}
        </div>
      </div>
      <div className="space-y-2.5">
        {filtered.map((ex) => <ExerciseRow key={ex.id} exercise={ex} sessionExercise={applySessionDose(ex, movementProfile)} selected={selected.has(ex.id)} onToggle={() => toggle(ex.id)} onShow={() => onShowDetail(ex)} />)}
      </div>
      {selected.size > 0 && (
        <div className="fixed bottom-24 left-0 right-0 px-5 z-30 lg:bottom-6 lg:left-20">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => onStartSession([...selected])} className="w-full rounded-full py-3.5 px-6 flex items-center justify-center gap-2 font-semibold shadow-lg" style={{ background: "#B8543A", color: "#F4EFE6" }}>
              <Play className="w-4 h-4 fill-current" />Start with {selected.size} exercise{selected.size > 1 ? "s" : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExerciseRow({ exercise, sessionExercise, selected, onToggle, onShow }) {
  const dose = sessionExercise ?? exercise;
  return (
    <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: selected ? "rgba(184, 84, 58, 0.08)" : "rgba(255,255,255,0.5)", border: selected ? "1px solid rgba(184, 84, 58, 0.3)" : "1px solid rgba(31, 27, 22, 0.06)" }}>
      <button onClick={onToggle} className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: selected ? "#B8543A" : "transparent", border: selected ? "none" : "1.5px solid rgba(31, 27, 22, 0.2)" }} aria-label={selected ? "Deselect" : "Select"}>
        {selected && <Check className="w-3.5 h-3.5 text-white" />}
      </button>
      <button onClick={onShow} className="flex-1 flex items-center gap-3 text-left">
        <ExerciseGlyph exercise={exercise} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] truncate">{exercise.name}</div>
          <div className="text-xs text-stone-500 mt-0.5">{dose.reps} reps · {dose.holdSec}s hold · <span className="capitalize">{exercise.region}</span></div>
        </div>
        <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
      </button>
    </div>
  );
}

function ExerciseDetail({ exercise, movementProfile, onClose, onStart }) {
  const dose = applySessionDose(exercise, movementProfile);
  const dosing = getComfortDosing(movementProfile);
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(31, 27, 22, 0.5)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl p-6 relative" style={{ background: "#F4EFE6" }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(31, 27, 22, 0.06)" }} aria-label="Close"><X className="w-4 h-4" /></button>
        <ExerciseGlyph exercise={exercise} size="lg" className="mb-3" />
        <h3 className="text-2xl mb-1" style={{ fontFamily: "Fraunces", fontWeight: 600 }}>{exercise.name}</h3>
        <div className="text-xs text-stone-500 mb-5 capitalize">{exercise.region} · {dose.reps} reps · {dose.holdSec}s hold · {dosing.label.toLowerCase()} dose</div>
        <div className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-stone-500 mb-1.5">How to do it</div>
            <p className="text-[15px] leading-relaxed text-stone-800">{exercise.instruction}</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: "rgba(122, 143, 115, 0.12)" }}>
            <div className="flex items-start gap-2"><Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#5C7055" }} /><p className="text-sm text-stone-700 leading-relaxed">{exercise.tip}</p></div>
          </div>
        </div>
        <button onClick={() => onStart(exercise.id)} className="mt-6 w-full rounded-full py-3 flex items-center justify-center gap-2 font-semibold" style={{ background: "#1F1B16", color: "#F4EFE6" }}><Play className="w-4 h-4 fill-current" />Practice this one</button>
      </div>
    </div>
  );
}

function TrackerStatusPill({ status, liveScore, phase }) {
  let icon, label, color;
  if (status === "loading") { icon = <Loader2 className="w-3 h-3 animate-spin" />; label = "Loading symmetry tracker…"; color = "#D4A574"; }
  else if (status === "error") { icon = <AlertCircle className="w-3 h-3" />; label = "Tracker unavailable — session continues without scoring"; color = "#A8A29E"; }
  else if (status === "ready" && phase === "calibrate") {
    icon = <Loader2 className="w-3 h-3 animate-spin" />;
    label = "Calibrating neutral pose";
    color = "#D4A574";
  }
  else if (status === "ready" && phase === "hold") {
    icon = <div className="w-2 h-2 rounded-full" style={{ background: "#7A8F73", boxShadow: "0 0 8px #7A8F73" }} />;
    label = liveScore != null ? "Tracking" : "Tracking · waiting for movement";
    color = "#7A8F73";
  }
  else if (status === "ready") { icon = <div className="w-2 h-2 rounded-full" style={{ background: "#7A8F73" }} />; label = "Tracker ready"; color = "#7A8F73"; }
  else { icon = <Loader2 className="w-3 h-3 animate-spin" />; label = "Initializing…"; color = "#D4A574"; }

  return (
    <div className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-full text-xs" style={{ background: "rgba(244, 239, 230, 0.08)", color, border: `1px solid ${color}40` }}>
      {icon}<span>{label}</span>
    </div>
  );
}

function RealtimeFeedback({ symmetry, balance, baseline }) {
  if (symmetry == null) return null;
  const pct = displayPct(symmetry);
  const color = scoreColor(symmetry);
  const left = balance?.left ?? 0;
  const right = balance?.right ?? 0;
  const max = Math.max(left, right, 0.0001); // avoid div/0
  const leftFrac = Math.min(left / max, 1);
  const rightFrac = Math.min(right / max, 1);
  // Which side is lagging — if the difference is meaningful
  const diff = Math.abs(left - right) / max;
  const lagging = diff > 0.15 ? (left < right ? "L" : "R") : null;

  return (
    <div className="px-3 py-2.5 rounded-2xl"
      style={{
        background: "rgba(31, 27, 22, 0.65)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: `1px solid ${color}`,
        minWidth: 140,
      }}>
      <div className="text-center">
        <div className="text-3xl tabular-nums leading-none" style={{ fontFamily: "Fraunces", fontWeight: 600, color, letterSpacing: "-0.02em" }}>{pct}%</div>
        <div className="text-[9px] uppercase tracking-wider mt-0.5" style={{ color: "#F4EFE6", opacity: 0.6 }}>symmetry</div>
      </div>
      <div className="mt-2.5 space-y-1.5">
        <BalanceBar label="L" frac={leftFrac} highlight={lagging === "L"} color={color} />
        <BalanceBar label="R" frac={rightFrac} highlight={lagging === "R"} color={color} />
      </div>
      <div className="text-[9px] mt-1.5 text-center h-3" style={{ color: "#F4EFE6", opacity: lagging ? 0.75 : 0 }}>
        {lagging === "L" ? "← lagging" : lagging === "R" ? "lagging →" : ""}
      </div>
      {baseline && (
        <div className="text-[9px] mt-1.5 text-center pt-1.5" style={{ color: "#F4EFE6", borderTop: "1px solid rgba(244,239,230,0.12)", opacity: 0.78 }}>
          {baseline.side} · {baselineProgressLabel(baseline)}
        </div>
      )}
    </div>
  );
}

function BalanceBar({ label, frac, highlight, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="text-[10px] font-semibold w-3 text-center" style={{ color: "#F4EFE6", opacity: highlight ? 1 : 0.7 }}>{label}</div>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(244, 239, 230, 0.15)" }}>
        <div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: highlight ? color : "#F4EFE6", transition: "width 150ms ease-out, background 200ms" }} />
      </div>
    </div>
  );
}

function PreviewView({ exercise, exIdx, totalExercises, onStart, onCancel, stream, faceLandmarker, mirrorEnabled, cameraError }) {
  if (!exercise) return null;
  const useLivePreview = stream && faceLandmarker && !cameraError && mirrorEnabled;
  return (
    <div className="fixed inset-0 z-50 flex items-stretch lg:items-center lg:justify-center lg:p-6" style={{ background: "rgba(12,10,8,0.92)" }}>
      <div className="flex flex-col w-full h-full lg:w-[440px] lg:h-[860px] lg:max-h-[92vh] lg:rounded-3xl lg:overflow-hidden lg:shadow-2xl" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
        <div className="flex items-center justify-between p-4 shrink-0">
          <button onClick={onCancel} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(244, 239, 230, 0.1)" }} aria-label="End"><X className="w-5 h-5" /></button>
          <div className="text-xs opacity-70">Exercise {exIdx} of {totalExercises}</div>
          <div className="w-10" />
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-2 flex flex-col items-center text-center">
          <div className="text-xs uppercase tracking-widest opacity-60 mt-2 mb-4">Up next</div>
          {useLivePreview
            ? <LiveExercisePreview exerciseId={exercise.id} stream={stream} faceLandmarker={faceLandmarker} mirrorEnabled={mirrorEnabled} className="mb-5" />
            : <ExerciseAnimation region={exercise.region} size="lg" className="mb-5" />}
          <div className="text-3xl mb-1" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.01em" }}>{exercise.name}</div>
          <div className="text-xs opacity-60 mb-5 tracking-wide">{exercise.reps} reps · {exerciseHoldSec(exercise)}s hold</div>
          <div className="text-sm leading-relaxed mb-4 max-w-xs" style={{ color: "#F4EFE6" }}>{exercise.instruction}</div>
          {exercise.tip && (
            <div className="text-xs leading-relaxed opacity-60 max-w-xs mb-4" style={{ fontStyle: "italic" }}>{exercise.tip}</div>
          )}
        </div>
        <div className="p-4 shrink-0" style={{ borderTop: "1px solid rgba(244,239,230,0.08)" }}>
          <button onClick={onStart} className="w-full rounded-full px-6 py-4 font-semibold flex items-center justify-center gap-2 text-base" style={{ background: "#B8543A", color: "#F4EFE6" }}>
            I'm ready<ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function InterstitialView({ just, nextExercise, secondsLeft, exIdx, totalExercises, onNext, onCancel }) {
  if (!just) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-stretch lg:items-center lg:justify-center lg:p-6" style={{ background: "rgba(12,10,8,0.92)" }}>
      <div className="flex flex-col w-full h-full lg:w-[440px] lg:h-[860px] lg:max-h-[92vh] lg:rounded-3xl lg:overflow-hidden lg:shadow-2xl" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
      <div className="flex items-center justify-between p-4 shrink-0">
        <button onClick={onCancel} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(244, 239, 230, 0.1)" }} aria-label="End"><X className="w-5 h-5" /></button>
        <div className="text-xs opacity-70">Exercise {exIdx} of {totalExercises} complete</div>
        <div className="w-10" />
      </div>
      <div className="flex-1 overflow-y-auto px-6 pb-2">
        <div className="text-center mb-5">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-2">Just done</div>
          <ExerciseGlyph exerciseId={just.exerciseId} region={just.region} size="lg" tone="dark" className="mx-auto mb-3" />
          <div className="text-xl mb-2" style={{ fontFamily: "Fraunces", fontWeight: 500 }}>{just.name}</div>
          {just.avg != null && (
            <div className="text-5xl tabular-nums" style={{ fontFamily: "Fraunces", fontWeight: 600, color: scoreColor(just.avg), letterSpacing: "-0.02em" }}>{displayPct(just.avg)}%</div>
          )}
          {just.avg != null && <div className="text-xs opacity-60 mt-1">avg symmetry</div>}
          {just.baselineProgress && (
            <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(244,239,230,0.08)", color: "#D4A574" }}>
              <TrendingUp className="w-3 h-3" />{just.baselineProgress.side} side · {baselineProgressLabel(just.baselineProgress)}
            </div>
          )}
        </div>
        {just.snapshots?.length > 0 && (
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1 px-2 justify-center" style={{ scrollbarWidth: "thin" }}>
            {just.snapshots.map((snap, i) => (
              <div key={i} className="shrink-0 rounded-lg overflow-hidden relative" style={{ border: `2px solid ${scoreColor(snap.score)}`, animation: `fadeInRep 0.35s ease-out ${i * 0.08}s both` }}>
                <img src={snap.dataUrl} alt="" style={{ width: 56, height: 80, objectFit: "cover", display: "block" }} />
                <div className="absolute bottom-0 inset-x-0 text-[9px] tabular-nums text-center py-0.5" style={{ background: "rgba(31,27,22,0.7)", color: "#F4EFE6" }}>
                  {snap.score != null ? displayPct(snap.score) + "%" : `#${i + 1}`}
                </div>
              </div>
            ))}
          </div>
        )}
        {nextExercise && (
          <div className="text-center pt-3 mt-4 border-t" style={{ borderColor: "rgba(244,239,230,0.08)" }}>
            <div className="text-[11px] uppercase tracking-widest opacity-50">{nextExercise.name} comes next</div>
          </div>
        )}
      </div>
      <div className="p-4 shrink-0 flex items-center gap-3" style={{ borderTop: "1px solid rgba(244,239,230,0.08)" }}>
        <div className="flex-1">
          <div className="text-5xl tabular-nums leading-none" style={{ fontFamily: "Fraunces", fontWeight: 600, color: "#D4A574" }}>{secondsLeft || "·"}</div>
          <div className="text-[10px] opacity-60 uppercase tracking-wider mt-0.5">break</div>
        </div>
        <button onClick={onNext} className="rounded-full px-6 py-3 font-semibold flex items-center gap-2" style={{ background: "#B8543A", color: "#F4EFE6" }}>
          Next<ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <style>{`@keyframes fadeInRep { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      </div>
    </div>
  );
}

// Dual-mode: live mode receives `scores` (in-progress array) + `onFinish`; view mode
// receives a saved `session` record + `onClose`. Both render the same comprehensive report.
function SessionSummary({ scores, sessionsToday, dailyGoal, baselineProgress, initialBaselineProgress, kind, startedAt, comfortLevel, onFinish, session, onClose }) {
  const isView = !!session;
  const scoresArr = isView ? (session.scores || []) : scores;
  const sessionBaseline = isView ? session.baselineProgress : baselineProgress;
  const sessionInitialBaseline = isView ? session.initialBaselineProgress : initialBaselineProgress;
  const effectiveKind = isView ? session.kind : kind;
  const isPractice = effectiveKind === "practice";
  const nextFocus = sessionFocusRecommendation(scoresArr);
  const overall = isView
    ? session.sessionAvg
    : (() => {
        const valid = scoresArr.map((e) => e.avg).filter((v) => v != null);
        return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
      })();
  const reportSession = isView ? { ...session, sessionAvg: overall } : {
    date: todayISO(),
    ts: Date.now(),
    duration: startedAt ? Math.round((Date.now() - startedAt) / 1000) : null,
    sessionAvg: overall,
    baselineProgress: sessionBaseline,
    initialBaselineProgress: sessionInitialBaseline,
    scores: scoresArr,
    comfortLevel,
    kind: effectiveKind,
  };
  const overallPct = displayPct(overall);
  const [timelapse, setTimelapse] = useState(null); // { exerciseIdx, startIdx }
  const sessionN = (sessionsToday ?? 0) + 1;
  const goal = dailyGoal ?? 3;
  const remainingAfter = Math.max(0, goal - sessionN);
  const nextSlot = remainingAfter > 0 ? nextSessionAt(goal, sessionN) : null;
  const message = (() => {
    if (overall == null) return isView ? "Session recorded." : "Session done. Nicely steady work.";
    if (overall >= 0.85) return "Beautifully even today.";
    if (overall >= 0.7) return "Strong symmetric work.";
    if (overall >= 0.55) return "Good practice — the affected side is engaging.";
    return "Every session helps. Keep showing up.";
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-stretch lg:items-center lg:justify-center lg:p-6" style={{ background: "rgba(12,10,8,0.92)" }}>
      <div className="flex flex-col w-full h-full lg:w-[440px] lg:h-[860px] lg:max-h-[92vh] lg:rounded-3xl lg:shadow-2xl overflow-y-auto" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
      <div className="max-w-md mx-auto w-full px-6 py-10 flex-1 flex flex-col">
        {isView && (
          <button onClick={onClose} className="self-start mb-4 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(244, 239, 230, 0.1)" }} aria-label="Close report"><X className="w-5 h-5" /></button>
        )}
        <div className="text-center mb-8">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-2">{isView ? formatSessionDate(session) : isPractice ? "Practice complete" : "Session complete"}</div>
          <h2 className="text-3xl mb-3" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>
            <em style={{ fontStyle: "italic", fontWeight: 400 }}>{message}</em>
          </h2>
          {!isView && !isPractice && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(244,239,230,0.08)" }}>
              <span className="opacity-80">Session <span className="font-semibold" style={{ color: "#F4EFE6" }}>{sessionN}</span> of {goal} today</span>
              {nextSlot && <span className="opacity-60">· next at {formatClock(nextSlot)}</span>}
              {remainingAfter === 0 && <span className="opacity-60">· done for the day</span>}
            </div>
          )}
          {!isView && isPractice && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(244,239,230,0.08)" }}>
              <span className="opacity-80">Practice run · doesn't count toward daily goal</span>
            </div>
          )}
          {isView && session.duration != null && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(244,239,230,0.08)" }}>
              <span className="opacity-80">{scoresArr.length} exercise{scoresArr.length !== 1 ? "s" : ""} · {formatDuration(session.duration)}</span>
            </div>
          )}
        </div>
        {overallPct != null && (
          <div className="text-center mb-8">
            <div className="text-7xl tabular-nums" style={{ fontFamily: "Fraunces", fontWeight: 600, color: scoreColor(overall), letterSpacing: "-0.03em" }}>{overallPct}%</div>
            <div className="text-sm opacity-70 mt-1">average symmetry</div>
            {sessionBaseline && (
              <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(244,239,230,0.08)", color: "#D4A574" }}>
                <TrendingUp className="w-3 h-3" />current baseline · {sessionBaseline.side} side · {baselineProgressLabel(sessionBaseline)}
              </div>
            )}
            {sessionInitialBaseline && (
              <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(122,143,115,0.12)", color: "#A8C39F" }}>
                <TrendingUp className="w-3 h-3" />first baseline · {sessionInitialBaseline.side} side · {baselineProgressLabel(sessionInitialBaseline)}
              </div>
            )}
          </div>
        )}
        {nextFocus && (
          <div className="rounded-2xl p-4 mb-6" style={{ background: "rgba(122,143,115,0.12)", border: "1px solid rgba(122,143,115,0.2)" }}>
            <div className="text-xs uppercase tracking-wider opacity-55 mb-2">Next focus</div>
            <div className="flex items-center gap-3">
              <ExerciseGlyph exerciseId={nextFocus.exerciseId} region={nextFocus.region} size="xs" tone="dark" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{nextFocus.name}</div>
                <div className="text-xs opacity-65 mt-0.5">{nextFocus.avg != null ? `${displayPct(nextFocus.avg)}% symmetry` : "unscored"}{nextFocus.baselineProgress ? ` · ${baselineProgressLabel(nextFocus.baselineProgress)}` : ""}</div>
              </div>
            </div>
          </div>
        )}
        <div className="space-y-3 mb-8">
          <div className="text-xs uppercase tracking-wider opacity-60 mb-2">By exercise</div>
          {scoresArr.map((s, exIdx) => (
            <div key={s.exerciseId} className="rounded-2xl p-4" style={{ background: "rgba(244, 239, 230, 0.06)" }}>
              <div className="flex items-center gap-3">
                <ExerciseGlyph exerciseId={s.exerciseId} region={s.region} size="xs" tone="dark" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-xs opacity-60 mt-0.5">{s.scores.length} rep{s.scores.length !== 1 ? "s" : ""} scored{s.snapshots?.length ? ` · ${s.snapshots.length} shot${s.snapshots.length !== 1 ? "s" : ""}` : ""}</div>
                  {s.baselineProgress && <div className="text-xs mt-1" style={{ color: "#D4A574" }}>current · {s.baselineProgress.side} side · {baselineProgressLabel(s.baselineProgress)}</div>}
                  {s.initialBaselineProgress && <div className="text-xs mt-0.5" style={{ color: "#A8C39F" }}>first · {s.initialBaselineProgress.side} side · {baselineProgressLabel(s.initialBaselineProgress)}</div>}
                </div>
                {s.avg != null ? <div className="text-xl tabular-nums" style={{ fontFamily: "Fraunces", fontWeight: 600, color: scoreColor(s.avg) }}>{displayPct(s.avg)}%</div> : <div className="text-xs opacity-50">—</div>}
              </div>
              {s.snapshots?.length > 0 && (
                <div className="flex gap-2 mt-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
                  {s.snapshots.map((snap, i) => (
                    <button key={i} onClick={() => setTimelapse({ exerciseIdx: exIdx, startIdx: i })} className="shrink-0 rounded-lg overflow-hidden relative" style={{ border: `2px solid ${scoreColor(snap.score)}` }} aria-label={`Rep ${i + 1}`}>
                      <img src={snap.dataUrl} alt="" style={{ width: 56, height: 80, objectFit: "cover", display: "block" }} />
                      <div className="absolute bottom-0 inset-x-0 text-[9px] tabular-nums text-center py-0.5" style={{ background: "rgba(31,27,22,0.7)", color: "#F4EFE6" }}>
                        {snap.score != null ? displayPct(snap.score) + "%" : `#${i + 1}`}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {timelapse && (
          <TimelapseModal exercise={scoresArr[timelapse.exerciseIdx]} startIdx={timelapse.startIdx} onClose={() => setTimelapse(null)} />
        )}
        <div className="text-xs opacity-60 leading-relaxed mb-6 px-2 text-center">Symmetry is auto-detected from facial landmarks. Some movement variation is normal even in healthy faces.</div>
        <div className="mt-auto space-y-3">
          <button
            onClick={() => shareSessionReport(reportSession)}
            className="w-full rounded-full py-3 font-medium flex items-center justify-center gap-2"
            style={{ background: "rgba(244, 239, 230, 0.1)", color: "#F4EFE6", border: "1px solid rgba(244, 239, 230, 0.18)" }}
          >
            <Share2 className="w-4 h-4" /> Save PDF for physio
          </button>
          <button onClick={isView ? onClose : onFinish} className="w-full rounded-full py-3.5 font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>{isView ? "Close" : "Done"}</button>
        </div>
      </div>
      </div>
    </div>
  );
}

function PastSessionRow({ session, onOpen, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const exCount = (session.exercises ?? session.scores ?? []).length;
  const progress = preferredBaselineProgress(session);
  const canDelete = typeof onDelete === "function";
  return (
    <div className="rounded-xl px-3 py-2.5 flex items-center gap-3 transition hover:bg-white" style={{ background: "rgba(255,255,255,0.4)", border: "1px solid rgba(31, 27, 22, 0.04)" }}>
      <button onClick={() => onOpen(session)} disabled={confirming} className="flex-1 min-w-0 flex items-center gap-3 text-left disabled:opacity-50">
        <div className="text-xs text-stone-500 tabular-nums w-28 shrink-0">{formatSessionDate(session)}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm flex items-center gap-2">
            <span>{exCount} exercise{exCount !== 1 ? "s" : ""}</span>
            {session.kind === "practice" && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: "rgba(184, 84, 58, 0.12)", color: "#B8543A" }}>Practice</span>}
          </div>
          <div className="text-xs text-stone-500 tabular-nums">{formatDuration(session.duration)}{progress ? ` · ${baselineProgressLabel(progress)}` : ""}</div>
        </div>
        {session.sessionAvg != null
          ? <div className="tabular-nums font-semibold text-base" style={{ fontFamily: "Fraunces", color: scoreColor(session.sessionAvg) }}>{displayPct(session.sessionAvg)}%</div>
          : <div className="text-xs text-stone-400">—</div>}
      </button>
      {confirming ? (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setConfirming(false)} className="text-xs px-2 py-1 rounded-lg text-stone-600 hover:bg-white">Cancel</button>
          <button onClick={() => { setConfirming(false); onDelete(session); }} className="text-xs px-2 py-1 rounded-lg font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>Delete</button>
        </div>
      ) : canDelete ? (
        <button onClick={() => setConfirming(true)} aria-label="Delete session" className="shrink-0 p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-white transition">
          <Trash2 className="w-4 h-4" />
        </button>
      ) : (
        <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
      )}
    </div>
  );
}

function PastSessionsList({ sessions, onOpen, onDelete }) {
  const sorted = [...sessions].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 30);
  if (sorted.length === 0) return null;
  return (
    <div className="rounded-2xl p-5" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
      <div className="text-sm font-semibold mb-3">Past sessions</div>
      <div className="space-y-1.5">
        {sorted.map((s) => {
          const exCount = (s.exercises ?? s.scores ?? []).length;
          return <PastSessionRow key={s.id || s.ts || `${s.date}-${exCount}`} session={s} onOpen={onOpen} onDelete={onDelete} />;
        })}
      </div>
    </div>
  );
}

function TimelapseModal({ exercise, startIdx, onClose }) {
  const [idx, setIdx] = useState(startIdx);
  const [playing, setPlaying] = useState(false);
  const total = exercise.snapshots.length;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setIdx((i) => {
        if (i + 1 >= total) { setPlaying(false); return i; }
        return i + 1;
      });
    }, 500);
    return () => clearInterval(id);
  }, [playing, total]);
  const snap = exercise.snapshots[idx];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.85)" }} onClick={onClose}>
      <div className="rounded-3xl p-4 max-w-sm w-full mx-4" style={{ background: "#1F1B16", color: "#F4EFE6", border: "1px solid rgba(244,239,230,0.08)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm"><ExerciseGlyph exerciseId={exercise.exerciseId} region={exercise.region} size="xs" tone="dark" />{exercise.name}</div>
          <button onClick={onClose} className="text-xs opacity-60 hover:opacity-100">Close</button>
        </div>
        <img src={snap.dataUrl} alt={`Rep ${idx + 1}`} className="w-full rounded-2xl block" />
        <div className="flex items-center gap-3 mt-3">
          <button onClick={() => { if (idx >= total - 1) setIdx(0); setPlaying((p) => !p); }} className="rounded-full px-3 py-1.5 text-sm font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>
            {playing ? "Pause" : "Play timelapse"}
          </button>
          <div className="text-xs opacity-70 flex-1 text-right tabular-nums">
            Rep {idx + 1} / {total}{snap.score != null ? ` · ${displayPct(snap.score)}%` : ""}
          </div>
        </div>
        <input type="range" min="0" max={total - 1} value={idx} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} className="w-full mt-3" style={{ accentColor: "#B8543A" }} />
      </div>
    </div>
  );
}

function JournalView({ entries, onSave }) {
  const today = todayISO();
  const todayEntry = entries.find((e) => e.date === today);
  const [symmetry, setSymmetry] = useState(todayEntry?.symmetry ?? 5);
  const [mood, setMood] = useState(todayEntry?.mood ?? "okay");
  const [notes, setNotes] = useState(todayEntry?.notes ?? "");
  const [saved, setSaved] = useState(false);
  const handleSave = () => { onSave({ date: today, symmetry, mood, notes, ts: Date.now() }); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const past = [...entries].filter((e) => e.date !== today).reverse();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>How are you today?</h2>
        <p className="text-sm text-stone-600 mt-1">A short check-in helps you see your trend over time.</p>
      </div>
      <div className="rounded-2xl p-5" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
        <div className="flex justify-between items-baseline mb-3">
          <div className="text-sm font-semibold">Symmetry rating</div>
          <div className="text-3xl tabular-nums" style={{ fontFamily: "Fraunces", fontWeight: 600, color: "#B8543A" }}>{symmetry}<span className="text-sm text-stone-500 ml-1">/ 10</span></div>
        </div>
        <input type="range" min="1" max="10" value={symmetry} onChange={(e) => setSymmetry(Number(e.target.value))} className="w-full" style={{ accentColor: "#B8543A" }} />
        <div className="flex justify-between text-xs text-stone-500 mt-2"><span>Significant droop</span><span>Full symmetry</span></div>
      </div>
      <div>
        <div className="text-sm font-semibold mb-3">Mood</div>
        <div className="grid grid-cols-4 gap-2">
          {MOOD_OPTIONS.map((m) => (
            <button key={m.key} onClick={() => setMood(m.key)} className="rounded-2xl p-3 text-center" style={{ background: mood === m.key ? "#1F1B16" : "rgba(255,255,255,0.5)", color: mood === m.key ? "#F4EFE6" : "#1F1B16", border: mood === m.key ? "none" : "1px solid rgba(31, 27, 22, 0.06)" }}>
              <div className="text-2xl mb-1">{m.emoji}</div>
              <div className="text-xs font-medium">{m.label}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-sm font-semibold mb-2">Notes</div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything you noticed today — taste, dryness, fatigue, small wins…" rows="4" className="w-full rounded-2xl p-4 text-sm resize-none focus:outline-none focus:ring-2" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)", fontFamily: "Manrope" }} />
      </div>
      <button onClick={handleSave} className="w-full rounded-full py-3 font-semibold" style={{ background: saved ? "#7A8F73" : "#1F1B16", color: "#F4EFE6" }}>{saved ? "✓ Saved" : todayEntry ? "Update entry" : "Save entry"}</button>
      {past.length > 0 && (
        <div>
          <div className="text-sm uppercase tracking-wider text-stone-500 mb-3">Past entries</div>
          <div className="space-y-2">{past.slice(0, 14).map((e) => <PastEntryRow key={e.date} entry={e} />)}</div>
        </div>
      )}
    </div>
  );
}

function PastEntryRow({ entry }) {
  const mood = MOOD_OPTIONS.find((m) => m.key === entry.mood);
  const d = new Date(entry.date);
  const label = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return (
    <div className="rounded-2xl p-3 flex items-center gap-3" style={{ background: "rgba(255, 255, 255, 0.4)", border: "1px solid rgba(31, 27, 22, 0.04)" }}>
      <div className="text-xl">{mood?.emoji ?? "·"}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {entry.notes && <div className="text-xs text-stone-600 truncate">{entry.notes}</div>}
      </div>
      <div className="text-sm tabular-nums shrink-0" style={{ fontFamily: "Fraunces", fontWeight: 600, color: "#B8543A" }}>{entry.symmetry}<span className="text-xs text-stone-500">/10</span></div>
    </div>
  );
}

function MovementProfileCard({ profile, initialProfile, history, sessions, progressByExercise, onStart }) {
  const exercises = profileExerciseEntries(profile);
  const focusItems = getAdaptiveFocusItems(profile, sessions, 3);
  const created = profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
  const status = profileStatus(profile);
  const retakeExerciseIds = status?.retakeExercises?.map((ex) => ex.exerciseId) ?? [];
  const missingBaselineIds = profile
    ? PROFILE_ASSESSMENT_EXERCISES.filter((id) => !profile.exercises?.[id])
    : [];
  const firstProfile = initialProfile && initialProfile.createdAt !== profile?.createdAt ? initialProfile : null;
  const previousProfile = history?.[0] ?? null;
  const comparison = compareMovementProfiles(profile, previousProfile);
  const firstComparison = compareMovementProfiles(profile, firstProfile);
  const historyRows = (history ?? []).slice(0, 3);
  if (!profile) {
    return (
      <div className="rounded-2xl p-5" style={{ background: "rgba(31, 27, 22, 0.92)", color: "#F4EFE6" }}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(244,239,230,0.1)" }}><Zap className="w-4 h-4" style={{ color: "#D4A574" }} /></div>
          <div className="flex-1">
            <div className="text-sm font-semibold mb-1">Personal movement baseline</div>
            <p className="text-xs opacity-70 leading-relaxed mb-4">Capture a short first-use profile so Mirror can compare future sessions against your own starting point.</p>
            <button onClick={onStart} className="rounded-full px-4 py-2 text-xs font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>Create baseline</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-5" style={{ background: "rgba(31, 27, 22, 0.92)", color: "#F4EFE6" }}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Personal movement baseline</div>
          <div className="text-xs opacity-60 mt-0.5 leading-relaxed">Created {created ?? "unknown"} · affected side: {formatProfileSide(profile.affectedSide)} · {getComfortDosing(profile).label.toLowerCase()} dose · {exercises.length}/{PROFILE_ASSESSMENT_EXERCISES.length} baselines</div>
        </div>
        <div className="text-right">
          {profile.initialAvgSymmetry != null && (
            <div className="text-2xl tabular-nums" style={{ fontFamily: "Fraunces", fontWeight: 600, color: scoreColor(profile.initialAvgSymmetry) }}>{displayPct(profile.initialAvgSymmetry)}%</div>
          )}
          {status && <div className="inline-flex mt-1 text-[10px] rounded-full px-2 py-0.5" style={{ background: `${status.quality.color}26`, color: status.quality.color }}>{status.quality.label}</div>}
        </div>
      </div>
      {missingBaselineIds.length > 0 && (
        <div className="rounded-2xl p-3 mb-4 flex flex-wrap items-center gap-3" style={{ background: "rgba(212,165,116,0.14)", color: "#F6D8B2", border: "1px solid rgba(212,165,116,0.2)" }}>
          <div className="flex-1 text-xs">Starter baseline saved. Add the remaining {missingBaselineIds.length} movement baseline{missingBaselineIds.length === 1 ? "" : "s"} when you have a few minutes.</div>
          <button onClick={() => onStart(missingBaselineIds)} className="rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap" style={{ background: "#D4A574", color: "#1F1B16" }}>Add remaining</button>
        </div>
      )}
      {status?.shouldRetake && (
        <div className="rounded-2xl p-3 mb-4 flex flex-wrap items-center gap-3" style={{ background: "rgba(184,84,58,0.16)", color: "#FFD3C1" }}>
          <div className="flex-1 text-xs">Retake recommended: {status.reason}</div>
          {retakeExerciseIds.length > 0 && (
            <button onClick={() => onStart(retakeExerciseIds)} className="rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap" style={{ background: "#B8543A", color: "#F4EFE6" }}>Retake weak only</button>
          )}
          {(status.noisy || status.stale || retakeExerciseIds.length === 0) && (
            <button onClick={() => onStart()} className="rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap" style={{ background: "rgba(244,239,230,0.12)", color: "#F4EFE6", border: "1px solid rgba(244,239,230,0.18)" }}>Full retake</button>
          )}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-2xl p-3" style={{ background: "rgba(244,239,230,0.06)" }}>
          <div className="text-[10px] uppercase tracking-wider opacity-45 mb-1">Profile</div>
          <div className="text-sm font-semibold tabular-nums">v{profile.version ?? "—"}</div>
        </div>
        <div className="rounded-2xl p-3" style={{ background: "rgba(244,239,230,0.06)" }}>
          <div className="text-[10px] uppercase tracking-wider opacity-45 mb-1">Noise</div>
          <div className="text-sm font-semibold tabular-nums">{profile.calibrationQuality?.coreAvgNoise ?? profile.calibrationQuality?.avgNoise ?? "—"}</div>
        </div>
        <div className="rounded-2xl p-3" style={{ background: "rgba(244,239,230,0.06)" }}>
          <div className="text-[10px] uppercase tracking-wider opacity-45 mb-1">Retakes</div>
          <div className="text-sm font-semibold tabular-nums">{history?.length ?? 0}</div>
        </div>
      </div>
      {firstComparison && (
        <div className="rounded-2xl p-3 mb-4" style={{ background: "rgba(212,165,116,0.12)", border: "1px solid rgba(212,165,116,0.18)" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider opacity-55">First vs current</div>
              <div className="text-xs opacity-60 mt-0.5">First saved baseline {firstComparison.previousDate ?? "available"}</div>
            </div>
            {firstComparison.avgSymmetryDelta != null && (
              <div className="text-sm font-semibold tabular-nums" style={{ color: firstComparison.avgSymmetryDelta >= 0 ? "#A8C39F" : "#FFB48F" }}>{signedPointDelta(firstComparison.avgSymmetryDelta)}</div>
            )}
          </div>
        </div>
      )}
      {comparison && (
        <div className="rounded-2xl p-3 mb-4" style={{ background: "rgba(122,143,115,0.14)", border: "1px solid rgba(122,143,115,0.2)" }}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="text-xs uppercase tracking-wider opacity-55">Retake comparison</div>
              <div className="text-xs opacity-60 mt-0.5">Compared with {comparison.previousDate ?? "previous baseline"}</div>
            </div>
            {comparison.avgSymmetryDelta != null && (
              <div className="text-sm font-semibold tabular-nums" style={{ color: comparison.avgSymmetryDelta >= 0 ? "#A8C39F" : "#FFB48F" }}>{signedPointDelta(comparison.avgSymmetryDelta)}</div>
            )}
          </div>
          <div className="space-y-2">
            {comparison.exerciseDeltas.slice(0, 2).map((item) => (
              <div key={item.exerciseId} className="flex items-center gap-2 text-xs">
                <ExerciseGlyph exerciseId={item.exerciseId} region={item.region} size="xs" tone="dark" />
                <div className="flex-1 min-w-0 truncate">{item.name}</div>
                <div className="tabular-nums" style={{ color: item.symmetryDelta >= 0 ? "#A8C39F" : "#FFB48F" }}>{signedPointDelta(item.symmetryDelta)}</div>
              </div>
            ))}
            {comparison.noiseDelta != null && (
              <div className="text-[11px] opacity-60">Calibration noise {comparison.noiseDelta <= 0 ? "decreased" : "increased"} by {Math.abs(comparison.noiseDelta).toFixed(5)}</div>
            )}
          </div>
        </div>
      )}
      {focusItems.length > 0 && (
        <div className="rounded-2xl p-3 mb-4" style={{ background: "rgba(244,239,230,0.06)" }}>
          <div className="text-xs uppercase tracking-wider opacity-55 mb-2">Current focus</div>
          <div className="space-y-2">
            {focusItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-xs">
                <ExerciseGlyph exercise={item.exercise} size="xs" tone="dark" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{item.exercise?.name}</div>
                  <div className="opacity-55">{focusReason(item)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2 mb-4">
        {exercises.map((ex) => (
          <div key={ex.exerciseId} className="flex items-center gap-3 text-xs">
            <ExerciseGlyph exerciseId={ex.exerciseId} region={ex.region} size="xs" tone="dark" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{ex.name}</div>
              <div className="opacity-55">limited side: {ex.limitedSide} · threshold {ex.activationThreshold ?? "—"}</div>
              {ex.quality && <div className="opacity-55">quality: {ex.quality.label}{ex.quality.issues?.length ? ` · ${ex.quality.issues.join(", ")}` : ""}</div>}
              {progressByExercise?.[ex.exerciseId] && <div className="mt-0.5" style={{ color: "#D4A574" }}>{baselineProgressLabel(progressByExercise[ex.exerciseId])}</div>}
            </div>
            {ex.quality?.key === "retake" && (
              <button onClick={() => onStart([ex.exerciseId])} className="rounded-full px-2.5 py-1 text-[11px] font-semibold shrink-0" style={{ background: "rgba(184,84,58,0.2)", color: "#FFD3C1" }}>Retake</button>
            )}
            {ex.initialSymmetry != null && <div className="tabular-nums shrink-0" style={{ color: scoreColor(ex.initialSymmetry) }}>{displayPct(ex.initialSymmetry)}%</div>}
          </div>
        ))}
      </div>
      {historyRows.length > 0 && (
        <div className="rounded-2xl p-3 mb-4" style={{ background: "rgba(244,239,230,0.06)" }}>
          <div className="text-xs uppercase tracking-wider opacity-55 mb-2">Baseline history</div>
          <div className="space-y-2">
            {historyRows.map((item, index) => {
              const archivedStatus = profileStatus(item);
              return (
                <div key={item.archivedAt ?? `${item.createdAt}-${index}`} className="flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium">{formatProfileDate(item.createdAt) ?? "Previous baseline"}</div>
                    <div className="opacity-50">affected side {formatProfileSide(item.affectedSide)} · {archivedStatus?.quality.label ?? "Unknown"}</div>
                  </div>
                  {item.initialAvgSymmetry != null && <div className="tabular-nums" style={{ color: scoreColor(item.initialAvgSymmetry) }}>{displayPct(item.initialAvgSymmetry)}%</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <button onClick={onStart} className="rounded-full px-4 py-2 text-xs font-semibold" style={{ background: "rgba(244,239,230,0.12)", color: "#F4EFE6" }}>Redo baseline</button>
    </div>
  );
}

function ProgressView({ data, streak, prefs, onTogglePref, onSetPref, onOpenReport, onDeleteSession, onStartProfile }) {
  // Progress charts are projections of journal/session history. Keeping them derived
  // avoids migration work when scoring or display rules change.
  const totalSessions = data.sessions.length;
  const last7DaysSessions = data.sessions.filter((s) => { const days = daysBetween(s.date, todayISO()); return days >= 0 && days < 7; }).length;
  const journalChartData = useMemo(() => data.journal.length === 0 ? [] : data.journal.slice(-21).map((j) => ({ date: new Date(j.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), symmetry: j.symmetry })), [data.journal]);
  const aiSymmetryData = useMemo(() => data.sessions.filter((s) => s.sessionAvg != null).slice(-21).map((s) => ({ date: new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), score: displayPct(s.sessionAvg) })), [data.sessions]);
  const baselineProgressData = useMemo(() => data.sessions.map((s) => {
    const progress = preferredBaselineProgress(s);
    return progress?.ratio == null ? null : { date: new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), progress: Math.round(progress.ratio * 100) };
  }).filter(Boolean).slice(-21), [data.sessions]);
  const progressByExercise = useMemo(() => latestExerciseProgressById(data.sessions), [data.sessions]);
  const activityGrid = useMemo(() => {
    const today = new Date(); const grid = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const iso = d.toISOString().split("T")[0];
      const daySessions = data.sessions.filter((s) => s.date === iso);
      const symAvgs = daySessions.map((s) => s.sessionAvg).filter((v) => v != null);
      const dayAvg = symAvgs.length > 0 ? symAvgs.reduce((a, b) => a + b, 0) / symAvgs.length : null;
      grid.push({ date: iso, count: daySessions.length, avg: dayAvg });
    }
    return grid;
  }, [data.sessions]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>Your progress</h2>
        <p className="text-sm text-stone-600 mt-1">Recovery is rarely linear. Look for the trend, not the day.</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Streak" value={streak} unit={streak === 1 ? "day" : "days"} />
        <StatCard label="Last 7 days" value={last7DaysSessions} unit="sessions" />
        <StatCard label="All time" value={totalSessions} unit="sessions" />
      </div>
      {aiSymmetryData.length > 1 ? (
        <div className="rounded-2xl p-5" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
          <div className="flex items-center gap-2 mb-1"><Zap className="w-3.5 h-3.5" style={{ color: "#B8543A" }} /><div className="text-sm font-semibold">Measured symmetry</div></div>
          <div className="text-xs text-stone-500 mb-4">From your session recordings · auto-detected</div>
          <div style={{ width: "100%", height: 180 }}>
            <ResponsiveContainer>
              <AreaChart data={aiSymmetryData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <defs><linearGradient id="aiGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#B8543A" stopOpacity={0.4} /><stop offset="100%" stopColor="#B8543A" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#7C7066" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#7C7066" }} axisLine={false} tickLine={false} ticks={[0, 50, 100]} />
                <Tooltip contentStyle={{ background: "#1F1B16", border: "none", borderRadius: 8, color: "#F4EFE6", fontSize: 12 }} formatter={(v) => [`${v}%`, "Symmetry"]} />
                <Area type="monotone" dataKey="score" stroke="#B8543A" strokeWidth={2} fill="url(#aiGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl p-5" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
          <div className="flex items-center gap-2 mb-1"><Zap className="w-3.5 h-3.5" style={{ color: "#B8543A" }} /><div className="text-sm font-semibold">Measured symmetry</div></div>
          <div className="text-xs text-stone-500 mt-1">Complete a couple of sessions with the camera on to see your measured symmetry trend over time.</div>
        </div>
      )}
      {baselineProgressData.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
          <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-3.5 h-3.5" style={{ color: "#7A8F73" }} /><div className="text-sm font-semibold">Progress from baseline</div></div>
          <div className="text-xs text-stone-500 mb-4">Affected or limited side movement · 100% = first saved baseline</div>
          <div style={{ width: "100%", height: 160 }}>
            <ResponsiveContainer>
              <AreaChart data={baselineProgressData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <defs><linearGradient id="baselineGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7A8F73" stopOpacity={0.4} /><stop offset="100%" stopColor="#7A8F73" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#7C7066" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, "dataMax + 20"]} tick={{ fontSize: 10, fill: "#7C7066" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#1F1B16", border: "none", borderRadius: 8, color: "#F4EFE6", fontSize: 12 }} formatter={(v) => [`${v}%`, "Movement"]} />
                <Area type="monotone" dataKey="progress" stroke="#7A8F73" strokeWidth={2} fill="url(#baselineGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div className="rounded-2xl p-5" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Last 14 days</div>
          <div className="text-xs text-stone-500">color = avg symmetry</div>
        </div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(14, 1fr)" }}>
          {activityGrid.map((day) => {
            // No sessions: muted gray. Sessions but no symmetry data: amber dot.
            // With symmetry: color-graded by avg score (red < 60%, amber 60–80%, green ≥ 80%).
            const bg = day.count === 0
              ? "rgba(31, 27, 22, 0.06)"
              : day.avg == null
                ? "rgba(212, 165, 116, 0.5)"
                : scoreColor(day.avg);
            const tooltip = day.count === 0
              ? `${day.date}: no sessions`
              : day.avg != null
                ? `${day.date}: ${day.count} session${day.count !== 1 ? "s" : ""} · ${displayPct(day.avg)}% avg`
                : `${day.date}: ${day.count} session${day.count !== 1 ? "s" : ""}`;
            return <div key={day.date} className="aspect-square rounded-md" style={{ background: bg }} title={tooltip} />;
          })}
        </div>
        <div className="flex items-center gap-2 mt-3 text-xs text-stone-500">
          <span>None</span>
          <div className="w-3 h-3 rounded-sm" style={{ background: "rgba(31, 27, 22, 0.06)" }} />
          <div className="w-3 h-3 rounded-sm" style={{ background: "#B8543A" }} title="< 60%" />
          <div className="w-3 h-3 rounded-sm" style={{ background: "#D4A574" }} title="60–80%" />
          <div className="w-3 h-3 rounded-sm" style={{ background: "#7A8F73" }} title="≥ 80%" />
          <span>Symmetric</span>
        </div>
      </div>
      <PastSessionsList sessions={data.sessions} onOpen={onOpenReport} onDelete={onDeleteSession} />
      <MovementProfileCard profile={data.movementProfile} initialProfile={data.initialMovementProfile} history={data.movementProfileHistory} sessions={data.sessions} progressByExercise={progressByExercise} onStart={onStartProfile} />
      {journalChartData.length > 1 && (
        <div className="rounded-2xl p-5" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
          <div className="text-sm font-semibold mb-1">Self-rated symmetry</div>
          <div className="text-xs text-stone-500 mb-4">From your journal entries</div>
          <div style={{ width: "100%", height: 160 }}>
            <ResponsiveContainer>
              <AreaChart data={journalChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <defs><linearGradient id="journalGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7A8F73" stopOpacity={0.4} /><stop offset="100%" stopColor="#7A8F73" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#7C7066" }} axisLine={false} tickLine={false} />
                <YAxis domain={[1, 10]} tick={{ fontSize: 10, fill: "#7C7066" }} axisLine={false} tickLine={false} ticks={[1, 5, 10]} />
                <Tooltip contentStyle={{ background: "#1F1B16", border: "none", borderRadius: 8, color: "#F4EFE6", fontSize: 12 }} />
                <Area type="monotone" dataKey="symmetry" stroke="#7A8F73" strokeWidth={2} fill="url(#journalGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div>
        <div className="text-sm uppercase tracking-wider text-stone-500 mb-3">Preferences</div>
        <div className="space-y-2">
          <DailyGoalSelector value={prefs.dailyGoal ?? 3} onChange={(v) => onSetPref("dailyGoal", v)} />
          <ToggleRow label="Symmetry tracking" description="Auto-measure symmetry during exercises" value={prefs.symmetryEnabled} onToggle={() => onTogglePref("symmetryEnabled")} />
          <ToggleRow label="Voice cues during practice" description="Spoken prompts for each rep" value={prefs.voiceEnabled} onToggle={() => { if (prefs.voiceEnabled) flushSpeech(); else primeSpeech(true, { text: "Voice cues on." }); onTogglePref("voiceEnabled"); }} />
          <ToggleRow label="Mirror camera" description="Front camera during sessions" value={prefs.mirrorEnabled} onToggle={() => onTogglePref("mirrorEnabled")} />
        </div>
      </div>
      <div className="rounded-2xl p-4 text-xs text-stone-600 leading-relaxed" style={{ background: "rgba(122, 143, 115, 0.1)" }}>
        Mirror is a practice companion, not medical care. Always work with your neurologist and physical therapist on your specific recovery plan. Discontinue any exercise that causes pain.
      </div>
    </div>
  );
}

function DailyGoalSelector({ value, onChange }) {
  const v = value ?? 3;
  return (
    <div className="rounded-2xl p-4" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
      <div className="text-sm font-medium mb-1">Daily goal</div>
      <div className="text-xs text-stone-500 mb-3">Bell's palsy retraining works best with frequent short sessions. Pick a count that feels sustainable.</div>
      <div className="flex rounded-full p-1 gap-1" style={{ background: "rgba(31, 27, 22, 0.06)" }}>
        {[1, 2, 3, 4, 5, 6].map((n) => {
          const active = v === n;
          return (
            <button key={n} onClick={() => onChange(n)} className="flex-1 py-2 rounded-full text-sm font-semibold tabular-nums" style={{ background: active ? "#1F1B16" : "transparent", color: active ? "#F4EFE6" : "#1F1B16", transition: "background 0.15s, color 0.15s" }}>
              {n}
            </button>
          );
        })}
      </div>
      <div className="text-xs text-stone-500 mt-3">Sessions spread evenly between {DAY_START_HOUR > 12 ? DAY_START_HOUR - 12 : DAY_START_HOUR}{DAY_START_HOUR >= 12 ? " PM" : " AM"} and {DAY_END_HOUR > 12 ? DAY_END_HOUR - 12 : DAY_END_HOUR}{DAY_END_HOUR >= 12 ? " PM" : " AM"}.</div>
    </div>
  );
}

function ToggleRow({ label, description, value, onToggle }) {
  return (
    <button onClick={onToggle} className="w-full rounded-2xl p-4 flex items-center justify-between text-left" style={{ background: "rgba(255, 255, 255, 0.5)", border: "1px solid rgba(31, 27, 22, 0.06)" }}>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-stone-500 mt-0.5">{description}</div>
      </div>
      <div className="w-11 h-6 rounded-full p-0.5" style={{ background: value ? "#B8543A" : "rgba(31, 27, 22, 0.15)" }}>
        <div className="w-5 h-5 rounded-full bg-white" style={{ transform: value ? "translateX(20px)" : "translateX(0)", transition: "transform 0.15s" }} />
      </div>
    </button>
  );
}

function BottomNav({ view, setView }) {
  const items = [{ key: "home", label: "Today", icon: Home }, { key: "practice", label: "Practice", icon: Sparkles }, { key: "journal", label: "Journal", icon: BookOpen }, { key: "progress", label: "Progress", icon: TrendingUp }];
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-20 px-4 pb-4 pt-2" style={{ background: "linear-gradient(to top, rgba(244,239,230,1) 60%, rgba(244,239,230,0))" }}>
      <div className="max-w-2xl mx-auto rounded-full flex items-center p-1.5 backdrop-blur-md" style={{ background: "rgba(31, 27, 22, 0.92)", boxShadow: "0 8px 32px rgba(31, 27, 22, 0.15)" }}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = view === item.key;
          return (
            <button key={item.key} onClick={() => setView(item.key)} className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-full" style={{ background: active ? "#F4EFE6" : "transparent", color: active ? "#1F1B16" : "rgba(244, 239, 230, 0.65)" }}>
              <Icon className="w-4 h-4" strokeWidth={2.2} />
              <span className="text-[10px] font-semibold">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

const ONBOARDING_BASELINE_STEPS = [
  { title: "Allow camera access", body: "Mirror uses your front camera to read facial landmarks. The baseline stays on this device." },
  { title: "Sit centered", body: "Use steady light, keep your full face visible, and start with a natural resting expression." },
  { title: "Capture neutral first", body: "Keep still while the neutral baseline reaches 100%. This is the reference for later movement." },
  { title: "Move softly", body: "Follow each cue with a gentle hold, then relax fully before the next exercise begins." },
];
const ONBOARDING_STARTER_EXERCISES = PROFILE_STARTER_ASSESSMENT_EXERCISES.map((id) => EXERCISES.find((exercise) => exercise.id === id)).filter(Boolean);

const ONBOARDING_STEPS = [
  {
    type: "points",
    tag: "WELCOME",
    title: "Welcome to Mirror",
    body: "A gentle daily companion for facial retraining after Bell's Palsy.",
    accent: "#D4A574",
    points: [
      { icon: Heart, text: "Guided exercises tuned to your symmetry" },
      { icon: BookOpen, text: "Daily mood and recovery journal" },
      { icon: TrendingUp, text: "Progress charts and milestones over time" },
    ],
    author: {
      name: "Ali Mustufa",
      label: "Built by",
      image: "https://iali.in/og-cover.jpg",
      storyUrl: "https://x.com/ialimustufa/status/2052044810173993039?s=20",
      storyLabel: "Read the story",
    },
  },
  {
    type: "points",
    tag: "AI TRACKING",
    title: "Symmetry, measured live",
    body: "Your front camera reads dense facial landmarks on both sides of your face.",
    accent: "#7A8F73",
    points: [
      { icon: Zap, text: "Real-time symmetry score during every movement" },
      { icon: Eye, text: "All processing stays on this device" },
      { icon: Sparkles, text: "Personalized to the baseline you capture" },
    ],
  },
  {
    type: "voice",
    tag: "VOICE CUES",
    title: "Hear every cue",
    body: "Mirror calls out each phase so you can keep your eyes on the camera, not the screen.",
    accent: "#D4A574",
  },
  {
    type: "contrast",
    tag: "APPROACH",
    title: "Slow and intentional wins",
    body: "Forceful contractions can train nerves to fire incorrectly (synkinesis).",
    accent: "#B8543A",
    dont: { label: "Don't", text: "Push for the biggest movement possible — it can reinforce uneven firing." },
    do: { label: "Do", text: "Make small, even movements you can hold without strain. Mirror rewards balance, not size." },
  },
  {
    type: "goal",
    tag: "DAILY GOAL",
    title: "How many sessions a day?",
    body: "Retraining works best with frequent short sessions spread across the day.",
    accent: "#D4A574",
    helper: "You can change this anytime in Progress → Preferences.",
  },
  {
    type: "points",
    tag: "SAFETY",
    title: "Mirror supports, not replaces",
    body: "Mirror is a practice companion — it does not replace medical care.",
    accent: "#7A8F73",
    points: [
      { icon: Heart, text: "Follow your neurologist and physical therapist on your specific protocol" },
      { icon: AlertCircle, text: "Stop any exercise that causes pain or unusual sensation" },
      { icon: Check, text: "Use Mirror to practice between professional sessions" },
    ],
  },
  {
    type: "baseline",
    tag: "BASELINE",
    title: "Capture your starting point",
    body: "Optional but recommended. Mirror uses this to personalize your progress tracking.",
    accent: "#B8543A",
  },
];

function Onboarding({ onDone, dailyGoal, onSetDailyGoal, voiceEnabled, onToggleVoice }) {
  const [step, setStep] = useState(0);
  const s = ONBOARDING_STEPS[step];
  const v = dailyGoal ?? 3;
  const isFirst = step === 0;
  const isLast = step === ONBOARDING_STEPS.length - 1;

  useEffect(() => {
    warmSpeechVoices();
  }, []);

  const playInstructionSound = (text) => {
    primeSpeech(true, { text, volume: 1, preferAudioCue: true });
  };

  const handleVoiceToggle = () => {
    if (voiceEnabled) {
      flushSpeech();
    } else {
      playInstructionSound("Voice cues are on.");
    }
    onToggleVoice?.();
  };
  const handleVoicePreview = () => {
    playInstructionSound("Up next: Eyebrow raise. Raise both eyebrows as if surprised, hold gently, then relax.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch lg:items-center lg:justify-center lg:p-6" style={{ background: "rgba(12,10,8,0.92)" }}>
      <div className="flex flex-col w-full h-full lg:w-[440px] lg:h-[860px] lg:max-h-[92vh] lg:rounded-3xl lg:overflow-hidden lg:shadow-2xl" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
        <div className="flex items-center justify-between p-4 shrink-0">
          <button
            onClick={() => setStep((n) => Math.max(0, n - 1))}
            disabled={isFirst}
            className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-30"
            style={{ background: "rgba(244, 239, 230, 0.1)" }}
            aria-label="Back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-xs opacity-70">Step {step + 1} of {ONBOARDING_STEPS.length}</div>
          <div className="w-10" />
        </div>

        <div className="px-4 pb-3 shrink-0">
          <div className="flex gap-1.5">
            {ONBOARDING_STEPS.map((_, i) => (
              <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300" style={{ background: i <= step ? s.accent : "rgba(244, 239, 230, 0.18)" }} />
            ))}
          </div>
        </div>

        <div className="px-4 pb-3 shrink-0">
          <div className="rounded-2xl p-4 transition-colors duration-300" style={{ background: "rgba(244,239,230,0.06)", borderLeft: `3px solid ${s.accent}` }}>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-2 inline-block px-2 py-0.5 rounded-full" style={{ background: s.accent, color: "#1F1B16" }}>{s.tag}</div>
            <div className="text-2xl mb-1.5" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>{s.title}</div>
            <div className="text-sm leading-relaxed opacity-80">{s.body}</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {s.type === "points" && (
            <div className="space-y-2.5">
              {s.points.map((p, i) => {
                const Icon = p.icon;
                return (
                  <div key={i} className="rounded-2xl p-3.5 flex items-start gap-3" style={{ background: "rgba(244,239,230,0.04)", border: "1px solid rgba(244,239,230,0.06)" }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: `${s.accent}26`, color: s.accent }}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="text-sm leading-relaxed opacity-90 self-center">{p.text}</div>
                  </div>
                );
              })}
              {s.author && (
                <a
                  href={s.author.storyUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-3 rounded-2xl p-3 group"
                  style={{ background: "rgba(244,239,230,0.04)", border: "1px solid rgba(244,239,230,0.08)" }}
                >
                  <img
                    src={s.author.image}
                    alt={s.author.name}
                    loading="lazy"
                    className="w-10 h-10 rounded-full object-cover shrink-0"
                    style={{ border: "1px solid rgba(244,239,230,0.15)" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-55 leading-none mb-0.5">{s.author.label}</div>
                    <div className="text-sm font-semibold truncate">{s.author.name}</div>
                  </div>
                  <div className="text-xs flex items-center gap-1 shrink-0" style={{ color: s.accent }}>
                    {s.author.storyLabel}<ArrowRight className="w-3 h-3" />
                  </div>
                </a>
              )}
            </div>
          )}

          {s.type === "voice" && (
            <div className="space-y-3">
              <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: "rgba(244,239,230,0.06)", border: `1px solid ${voiceEnabled ? s.accent + "55" : "rgba(244,239,230,0.08)"}` }}>
                <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: voiceEnabled ? `${s.accent}33` : "rgba(244,239,230,0.08)", color: voiceEnabled ? s.accent : "#F4EFE6" }}>
                  {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">Voice cues</div>
                  <div className="text-xs opacity-65 mt-0.5">{voiceEnabled ? "Mirror will speak during exercises." : "Mirror will stay silent."}</div>
                </div>
                <button
                  onClick={handleVoiceToggle}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold shrink-0"
                  style={{ background: voiceEnabled ? s.accent : "rgba(244,239,230,0.12)", color: voiceEnabled ? "#1F1B16" : "#F4EFE6" }}
                  aria-pressed={voiceEnabled}
                >
                  {voiceEnabled ? "On" : "Off"}
                </button>
              </div>

              {voiceEnabled && (
                <button onClick={handleVoicePreview} className="w-full rounded-2xl p-3.5 flex items-center justify-center gap-2 text-sm" style={{ background: "rgba(244,239,230,0.04)", border: "1px solid rgba(244,239,230,0.08)", color: "#F4EFE6" }}>
                  <Play className="w-3.5 h-3.5" style={{ color: s.accent }} />
                  Play a sample cue
                </button>
              )}

              <div className="rounded-2xl p-3.5 flex items-start gap-3" style={{ background: "rgba(244,239,230,0.04)", border: "1px solid rgba(244,239,230,0.06)" }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(244,239,230,0.08)" }}>
                  <Info className="w-3.5 h-3.5 opacity-70" />
                </div>
                <div className="text-xs leading-relaxed opacity-75 pt-0.5">
                  You can toggle voice anytime — tap the <Volume2 className="inline w-3 h-3 mx-0.5 align-text-bottom" style={{ color: s.accent }} /> icon in the exercise header.
                </div>
              </div>
            </div>
          )}

          {s.type === "contrast" && (
            <div className="space-y-3">
              <div className="rounded-2xl p-4" style={{ background: "rgba(184,84,58,0.1)", border: "1px solid rgba(184,84,58,0.25)" }}>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: "#FFB48F" }}>{s.dont.label}</div>
                <div className="text-sm leading-relaxed opacity-90">{s.dont.text}</div>
              </div>
              <div className="rounded-2xl p-4" style={{ background: "rgba(168,195,159,0.12)", border: "1px solid rgba(168,195,159,0.3)" }}>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: "#A8C39F" }}>{s.do.label}</div>
                <div className="text-sm leading-relaxed opacity-90">{s.do.text}</div>
              </div>
            </div>
          )}

          {s.type === "goal" && (
            <div>
              <div className="rounded-2xl p-5 mb-3" style={{ background: "rgba(244,239,230,0.04)", border: "1px solid rgba(244,239,230,0.06)" }}>
                <div className="flex flex-wrap justify-center gap-2 mb-3">
                  {[1, 2, 3, 4, 5, 6].map((n) => {
                    const active = v === n;
                    return (
                      <button key={n} onClick={() => onSetDailyGoal(n)} className="w-12 h-12 rounded-full text-lg font-semibold tabular-nums transition-all" style={{ background: active ? s.accent : "rgba(244, 239, 230, 0.08)", color: active ? "#1F1B16" : "#F4EFE6", border: active ? "none" : "1px solid rgba(244, 239, 230, 0.2)" }}>
                        {n}
                      </button>
                    );
                  })}
                </div>
                <div className="text-center text-xs opacity-65">{v} session{v === 1 ? "" : "s"} per day · spread between 9 AM and 9 PM</div>
              </div>
              <div className="text-xs opacity-55 text-center leading-relaxed">{s.helper}</div>
            </div>
          )}

          {s.type === "baseline" && (
            <div className="space-y-3">
              <div className="rounded-2xl p-4" style={{ background: "rgba(244,239,230,0.06)", border: "1px solid rgba(244,239,230,0.08)" }}>
                <div className="flex items-center gap-1.5 mb-3">
                  <div className="text-xs uppercase tracking-wider opacity-60">Starter assessment set</div>
                  <div className="relative group flex items-center" tabIndex={0} aria-label="Starter assessment set explanation">
                    <Info className="w-3.5 h-3.5 opacity-60" />
                    <div className="absolute left-0 bottom-full z-10 mb-2 hidden w-64 rounded-2xl px-3 py-2 text-left text-xs leading-relaxed normal-case tracking-normal shadow-xl group-hover:block group-focus:block" style={{ background: "#F4EFE6", color: "#1F1B16" }}>
                      Mirror captures a shorter starter set now, then prompts for the remaining movement baselines later.
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {ONBOARDING_STARTER_EXERCISES.map((exercise) => <ExerciseGlyph key={exercise.id} exercise={exercise} size="xs" tone="dark" className="mx-auto" />)}
                </div>
                <div className="text-xs opacity-55 mt-3">{ONBOARDING_STARTER_EXERCISES.length} movements · about {Math.ceil(ONBOARDING_STARTER_EXERCISES.length * (PROFILE_REST_SEC + PROFILE_HOLD_SEC) / 60)} minutes</div>
              </div>

              <div className="rounded-2xl p-4" style={{ background: "rgba(244,239,230,0.06)", border: "1px solid rgba(244,239,230,0.08)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-4 h-4" style={{ color: s.accent }} />
                  <div className="text-xs uppercase tracking-wider opacity-60">What to expect</div>
                </div>
                <div className="space-y-3">
                  {ONBOARDING_BASELINE_STEPS.map((item, index) => (
                    <div key={item.title} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-semibold mt-0.5" style={{ background: "rgba(244,239,230,0.1)", color: "#F4EFE6" }}>{index + 1}</div>
                      <div>
                        <div className="text-sm font-semibold">{item.title}</div>
                        <div className="text-xs leading-relaxed opacity-65 mt-0.5">{item.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 shrink-0">
          {isLast ? (
            <div className="flex gap-3">
              <button onClick={() => onDone(false)} className="flex-1 rounded-full py-3.5 font-semibold" style={{ background: "rgba(244,239,230,0.12)", color: "#F4EFE6" }}>Skip for now</button>
              <button onClick={() => onDone(true)} className="flex-1 rounded-full py-3.5 font-semibold" style={{ background: s.accent, color: "#1F1B16" }}>Create baseline</button>
            </div>
          ) : (
            <button onClick={() => setStep((n) => n + 1)} className="w-full rounded-full py-3.5 font-semibold flex items-center justify-center gap-2" style={{ background: s.accent, color: "#1F1B16" }}>
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export {
  BottomNav,
  ExerciseAnimation,
  ExerciseDetail,
  ExerciseGlyph,
  Header,
  HomeView,
  InterstitialView,
  JournalView,
  LiveExercisePreview,
  Onboarding,
  PracticeView,
  PreviewView,
  ProgressView,
  RealtimeFeedback,
  SessionSummary,
  Sidebar,
  TrackerStatusPill,
};
