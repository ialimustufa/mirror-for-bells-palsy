import { useState, useEffect, useCallback, useMemo } from "react";
import { archiveMovementProfile, mergeMissingMovementProfileBaselines, mergeMovementProfileRetake, normalizeAppData } from "./domain/appData";
import { PROFILE_HISTORY_LIMIT } from "./domain/config";
import { EXERCISE_BY_ID } from "./domain/exercises";
import {
  DEFAULT_DATA,
  DEFAULT_PERSONAL_PLAN,
  buildSessionExercises,
  computeStreak,
  getComfortDosing,
  isCountedSession,
  todayISO,
} from "./domain/session";
import { compactAppDataForStorage, deleteSessionImages, hydrateSessionImages, loadMirrorData, saveMirrorData } from "./storage";
import { buildPersonalizedDailyPlan, orderExerciseIdsByRegion } from "./ml/faceMetrics";
import { primeSpeech } from "./lib/speech";
import { SessionMode } from "./session/SessionMode";
import { ProfileAssessment } from "./profile/ProfileAssessment";
import { TrialMode } from "./trial/TrialMode";
import { MadeByFooter } from "./components/MadeByFooter";
import {
  BottomNav,
  ExerciseDetail,
  Header,
  HomeView,
  JournalView,
  Onboarding,
  PracticeView,
  ProgressView,
  SessionSummary,
  Sidebar,
} from "./components/appViews";

export default function App() {
  // Top-level orchestration only: global persistence, view routing, and modal/session ownership.
  // Feature views own their local form/filter state.
  const [view, setView] = useState("home");
  const [data, setData] = useState(DEFAULT_DATA);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [profileAssessment, setProfileAssessment] = useState(null);
  const [exerciseDetail, setExerciseDetail] = useState(null);
  const [viewingReport, setViewingReport] = useState(null);
  // Path-based route for the public /try demo. Listening to popstate covers the
  // history-driven nav back from the trial page; the rest of the app remains state-routed.
  const [pathname, setPathname] = useState(() => (typeof window !== "undefined" ? window.location.pathname : "/"));
  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stored = await loadMirrorData();
        if (stored) {
          const normalized = normalizeAppData(stored);
          setData(normalized);
          if (!normalized.prefs?.onboarded) setShowOnboarding(true);
        } else { setShowOnboarding(true); }
      } catch { setShowOnboarding(true); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400&family=Manrope:wght@400;500;600;700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => { try { document.head.removeChild(link); } catch { /* font link may have been removed externally */ } };
  }, []);

  const persist = useCallback(async (next) => {
    const compactNext = compactAppDataForStorage(next);
    setData(compactNext);
    try {
      const saved = await saveMirrorData(next);
      setData(normalizeAppData(saved));
    } catch (e) { console.error("Failed to persist app data", e); }
  }, []);

  const openStoredReport = useCallback(async (sessionRecord) => {
    const hydrated = await hydrateSessionImages(sessionRecord);
    setViewingReport(hydrated);
  }, []);

  const finishOnboarding = (startProfile = false) => {
    persist({ ...data, prefs: { ...data.prefs, onboarded: true } });
    setShowOnboarding(false);
    if (startProfile) setProfileAssessment({});
  };
  const openProfileAssessment = (retakeExerciseIds = null) => {
    setProfileAssessment(retakeExerciseIds?.length ? { retakeExerciseIds } : {});
  };
  const requestProfileRetake = useCallback((retakeExerciseIds, context = {}) => {
    setSession(null);
    setProfileAssessment(retakeExerciseIds?.length ? { retakeExerciseIds, context } : {});
  }, []);
  const saveMovementProfile = (profile, options = {}) => {
    if (options.retakeExerciseIds?.length && data.movementProfile) {
      const movementProfile = mergeMovementProfileRetake(data.movementProfile, profile);
      const initialMovementProfile = mergeMissingMovementProfileBaselines(data.initialMovementProfile ?? data.movementProfile, profile, options.retakeExerciseIds);
      persist({ ...data, movementProfile, initialMovementProfile, prefs: { ...data.prefs, onboarded: true } });
      setProfileAssessment(null);
      return;
    }
    const archived = archiveMovementProfile(data.movementProfile);
    const movementProfileHistory = archived
      ? [archived, ...(data.movementProfileHistory ?? [])].slice(0, PROFILE_HISTORY_LIMIT)
      : (data.movementProfileHistory ?? []);
    persist({ ...data, movementProfile: profile, initialMovementProfile: data.initialMovementProfile ?? profile, movementProfileHistory, prefs: { ...data.prefs, onboarded: true } });
    setProfileAssessment(null);
  };
  const startSession = (ids) => {
    const exercises = buildSessionExercises(ids, data.movementProfile);
    const firstExercise = exercises[0];
    const openingCue = data.prefs.symmetryEnabled && data.prefs.mirrorEnabled
      ? "Calibration. Center your face and stay relaxed."
      : firstExercise
        ? `Up next: ${firstExercise.name}. ${firstExercise.instruction}`
        : "Voice guidance ready.";
    primeSpeech(data.prefs.voiceEnabled, { text: openingCue, volume: 1 });
    const kind = ids.length > 1 ? "session" : "practice";
    setSession({ exercises, kind, startedAt: Date.now(), comfortLevel: getComfortDosing(data.movementProfile).key });
  };
  const completeSession = (rec) => { persist({ ...data, sessions: [...data.sessions, rec] }); setSession(null); };
  const deleteSession = useCallback(async (session) => {
    if (!session) return;
    const id = session.id;
    const ts = session.ts;
    const sessions = data.sessions.filter((s) => {
      if (s === session) return false;
      if (id && s.id === id) return false;
      if (!id && ts && s.ts === ts && s.date === session.date) return false;
      return true;
    });
    if (sessions.length === data.sessions.length) return;
    await persist({ ...data, sessions });
    if (id) deleteSessionImages(id);
  }, [data, persist]);
  const saveJournal = (entry) => { const filtered = data.journal.filter((j) => j.date !== entry.date); persist({ ...data, journal: [...filtered, entry].sort((a, b) => a.date.localeCompare(b.date)) }); };
  const togglePref = (key) => persist({ ...data, prefs: { ...data.prefs, [key]: !data.prefs[key] } });
  const setPref = (key, value) => persist({ ...data, prefs: { ...data.prefs, [key]: value } });

  const streak = useMemo(() => computeStreak(data.sessions), [data.sessions]);
  const recommendedPlanIds = useMemo(
    () => buildPersonalizedDailyPlan(data.movementProfile, data.sessions, undefined, { orderByRegion: true }),
    [data.movementProfile, data.sessions],
  );
  const personalizedPlanIds = useMemo(
    () => buildPersonalizedDailyPlan(data.movementProfile, data.sessions, undefined, { personalPlan: data.prefs.personalPlan, orderByRegion: true }),
    [data.movementProfile, data.sessions, data.prefs.personalPlan],
  );
  const savePersonalPlan = useCallback((selectedExerciseIds) => {
    const selected = orderExerciseIdsByRegion([...new Set(selectedExerciseIds ?? [])].filter((id) => EXERCISE_BY_ID.has(id)), recommendedPlanIds);
    if (selected.length === 0) return false;
    const selectedSet = new Set(selected);
    const recommendedSet = new Set(recommendedPlanIds);
    const personalPlan = {
      addedExerciseIds: selected.filter((id) => !recommendedSet.has(id)),
      removedExerciseIds: recommendedPlanIds.filter((id) => !selectedSet.has(id)),
    };
    persist({ ...data, prefs: { ...data.prefs, personalPlan } });
    return true;
  }, [data, persist, recommendedPlanIds]);
  const resetPersonalPlan = useCallback(() => {
    persist({ ...data, prefs: { ...data.prefs, personalPlan: DEFAULT_PERSONAL_PLAN } });
  }, [data, persist]);

  if (pathname === "/try") return <TrialMode />;
  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#F4EFE6" }}><div className="text-stone-600">Loading…</div></div>;

  return (
    <div className="min-h-screen relative lg:pl-20" style={{ background: "#F4EFE6", fontFamily: "Manrope, system-ui, sans-serif", color: "#1F1B16" }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full blur-3xl opacity-30" style={{ background: "#D4A574" }} />
        <div className="absolute top-1/2 -left-32 w-80 h-80 rounded-full blur-3xl opacity-20" style={{ background: "#7A8F73" }} />
      </div>
      <Sidebar view={view} setView={setView} streak={streak} />
      <div className="relative max-w-2xl mx-auto px-5 pb-28 pt-8 lg:pb-12">
        <Header view={view} streak={streak} />
        <main className="mt-8 lg:mt-2">
          {view === "home" && <HomeView data={data} streak={streak} personalizedPlanIds={personalizedPlanIds} recommendedPlanIds={recommendedPlanIds} onStartProfile={openProfileAssessment} onStartSession={startSession} onGo={setView} onResetPersonalPlan={resetPersonalPlan} />}
          {view === "practice" && <PracticeView movementProfile={data.movementProfile} sessions={data.sessions} personalizedPlanIds={personalizedPlanIds} recommendedPlanIds={recommendedPlanIds} onStartSession={startSession} onShowDetail={setExerciseDetail} onSavePersonalPlan={savePersonalPlan} onResetPersonalPlan={resetPersonalPlan} />}
          {view === "journal" && <JournalView entries={data.journal} onSave={saveJournal} />}
          {view === "progress" && <ProgressView data={data} streak={streak} prefs={data.prefs} onTogglePref={togglePref} onSetPref={setPref} onOpenReport={openStoredReport} onDeleteSession={deleteSession} onStartProfile={openProfileAssessment} />}
        </main>
        <footer className="mt-10 text-center text-xs text-stone-500">
          <MadeByFooter />
        </footer>
      </div>
      <BottomNav view={view} setView={setView} />
      {session && <SessionMode session={session} prefs={data.prefs} movementProfile={data.movementProfile} initialMovementProfile={data.initialMovementProfile ?? data.movementProfile} sessionsToday={data.sessions.filter((s) => s.date === todayISO() && isCountedSession(s)).length} onComplete={completeSession} onCancel={() => setSession(null)} onTogglePref={togglePref} onRequestProfileRetake={requestProfileRetake} />}
      {exerciseDetail && <ExerciseDetail exercise={exerciseDetail} movementProfile={data.movementProfile} onClose={() => setExerciseDetail(null)} onStart={(id) => { setExerciseDetail(null); startSession([id]); }} />}
      {showOnboarding && <Onboarding onDone={finishOnboarding} dailyGoal={data.prefs.dailyGoal} onSetDailyGoal={(n) => setPref("dailyGoal", n)} voiceEnabled={data.prefs.voiceEnabled} onToggleVoice={() => togglePref("voiceEnabled")} />}
      {profileAssessment && <ProfileAssessment existingProfile={data.movementProfile} retakeExerciseIds={profileAssessment.retakeExerciseIds} prefs={data.prefs} onTogglePref={togglePref} onComplete={saveMovementProfile} onSkip={() => setProfileAssessment(null)} />}
      {viewingReport && <SessionSummary session={viewingReport} onClose={() => setViewingReport(null)} />}
    </div>
  );
}
