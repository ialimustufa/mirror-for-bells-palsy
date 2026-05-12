import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Play, Pause, X, ChevronRight, Volume2, VolumeX, Camera, CameraOff } from "lucide-react";
import { archiveMovementProfile, mergeMovementProfileRetake, normalizeAppData } from "./domain/appData";
import {
  CALIBRATION_FRAMES,
  CALIBRATION_RESET_EPS,
  INTERSTITIAL_SEC,
  PROFILE_BASELINE_TOP_FRACTION,
  PROFILE_EXERCISE_NEUTRAL_MIN_FRAMES,
  PROFILE_HISTORY_LIMIT,
  PROFILE_HOLD_SEC,
  PROFILE_REST_RETRY_LIMIT,
  PROFILE_REST_SEC,
} from "./domain/config";
import { EXERCISE_BY_ID, PROFILE_ASSESSMENT_EXERCISES } from "./domain/exercises";
import {
  DEFAULT_DATA,
  buildSessionExercises,
  computeStreak,
  exerciseHoldSec,
  exerciseRestSec,
  getComfortDosing,
  isCountedSession,
  todayISO,
} from "./domain/session";
import { compactAppDataForStorage, hydrateSessionImages, loadMirrorData, saveMirrorData } from "./storage";
import { flushSpeech, primeSpeech, speak } from "./lib/speech";
import { useCameraStream } from "./hooks/useCameraStream";
import { useFaceLandmarker } from "./hooks/useFaceLandmarker";
import { displayPct, scoreColor } from "./ui/scoreFormatting";
import {
  BottomNav,
  ExerciseDetail,
  ExerciseGlyph,
  Header,
  HomeView,
  InterstitialView,
  JournalView,
  Onboarding,
  PracticeView,
  PreviewView,
  ProgressView,
  RealtimeFeedback,
  SessionSummary,
  Sidebar,
  TrackerStatusPill,
} from "./components/appViews";
import {
  BROW_EXERCISES,
  EXERCISE_BLENDSHAPES,
  NOSE_EXERCISES,
  averageBlendshapes,
  averageLandmarks,
  bsActivation,
  buildMovementProfile,
  calibrationPrompt,
  captureSnapshot,
  computeBaselineProgress,
  computeBaselineProgressFromDisplacements,
  computeExerciseSymmetry,
  computeNoiseFloor,
  drawOverlay,
  effectiveProfileThreshold,
  exerciseBaselineQuality,
  faceAlignmentFeedback,
  getProfileExercise,
  normalizedFrameDelta,
  robustMovementWindow,
  smoothLandmarks,
  summarizeBaselineProgress,
  summarizeSessionBaselineProgress,
  inferLimitedSide,
} from "./ml/faceMetrics";

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
  const saveMovementProfile = (profile, options = {}) => {
    if (options.retakeExerciseIds?.length && data.movementProfile) {
      const movementProfile = mergeMovementProfileRetake(data.movementProfile, profile);
      persist({ ...data, movementProfile, initialMovementProfile: data.initialMovementProfile ?? data.movementProfile, prefs: { ...data.prefs, onboarded: true } });
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
    primeSpeech(data.prefs.voiceEnabled);
    const exercises = buildSessionExercises(ids, data.movementProfile);
    const kind = ids.length > 1 ? "session" : "practice";
    setSession({ exercises, kind, startedAt: Date.now(), comfortLevel: getComfortDosing(data.movementProfile).key });
  };
  const completeSession = (rec) => { persist({ ...data, sessions: [...data.sessions, rec] }); setSession(null); };
  const saveJournal = (entry) => { const filtered = data.journal.filter((j) => j.date !== entry.date); persist({ ...data, journal: [...filtered, entry].sort((a, b) => a.date.localeCompare(b.date)) }); };
  const togglePref = (key) => persist({ ...data, prefs: { ...data.prefs, [key]: !data.prefs[key] } });
  const setPref = (key, value) => persist({ ...data, prefs: { ...data.prefs, [key]: value } });

  const streak = useMemo(() => computeStreak(data.sessions), [data.sessions]);

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
          {view === "home" && <HomeView data={data} streak={streak} onStartProfile={openProfileAssessment} onStartSession={startSession} onGo={setView} />}
          {view === "practice" && <PracticeView movementProfile={data.movementProfile} sessions={data.sessions} onStartSession={startSession} onShowDetail={setExerciseDetail} />}
          {view === "journal" && <JournalView entries={data.journal} onSave={saveJournal} />}
          {view === "progress" && <ProgressView data={data} streak={streak} prefs={data.prefs} onTogglePref={togglePref} onSetPref={setPref} onOpenReport={openStoredReport} onStartProfile={openProfileAssessment} />}
        </main>
      </div>
      <BottomNav view={view} setView={setView} />
      {session && <SessionMode session={session} prefs={data.prefs} movementProfile={data.movementProfile} initialMovementProfile={data.initialMovementProfile ?? data.movementProfile} sessionsToday={data.sessions.filter((s) => s.date === todayISO() && isCountedSession(s)).length} onComplete={completeSession} onCancel={() => setSession(null)} onTogglePref={togglePref} />}
      {exerciseDetail && <ExerciseDetail exercise={exerciseDetail} movementProfile={data.movementProfile} onClose={() => setExerciseDetail(null)} onStart={(id) => { setExerciseDetail(null); startSession([id]); }} />}
      {showOnboarding && <Onboarding onDone={finishOnboarding} dailyGoal={data.prefs.dailyGoal} onSetDailyGoal={(n) => setPref("dailyGoal", n)} />}
      {profileAssessment && <ProfileAssessment existingProfile={data.movementProfile} retakeExerciseIds={profileAssessment.retakeExerciseIds} onComplete={saveMovementProfile} onSkip={() => setProfileAssessment(null)} />}
      {viewingReport && <SessionSummary session={viewingReport} onClose={() => setViewingReport(null)} />}
    </div>
  );
}

function SessionMode({ session, prefs, movementProfile, initialMovementProfile, sessionsToday, onComplete, onCancel, onTogglePref }) {
  // Phases: optional calibrate → rest (2s entry) → hold (4s) → rest (2s) → hold → ... → interstitial (10s) → next exercise → ... → summary
  // The single `rest` phase plays double-duty as exercise-entry settle AND between-rep recovery.
  const [phase, setPhase] = useState(() => (prefs.symmetryEnabled && prefs.mirrorEnabled ? "calibrate" : "preview"));
  const [exIdx, setExIdx] = useState(0);
  const [repIdx, setRepIdx] = useState(0);
  // Initialized to the first phase's duration because the session opens directly into preview — if this
  // were 0, the advance effect would short-circuit out before phase-mount could update it.
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [paused, setPaused] = useState(false);
  // Distinguishes the entry rest (no preceding hold) from the post-hold rest. Reset to true
  // on each exercise change.
  const restIsEntryRef = useRef(true);

  const { stream, cameraError } = useCameraStream(prefs.mirrorEnabled);
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const snapshotCanvasRef = useRef(null);
  const baselineSnapshotRef = useRef(null);

  const symEnabled = prefs.symmetryEnabled && prefs.mirrorEnabled;
  const { faceLandmarker, latestRef, status: trackerStatus } = useFaceLandmarker(symEnabled);

  const calibBufferRef = useRef([]);
  const calibBsBufferRef = useRef([]);
  const lastCalibLmRef = useRef(null);
  const neutralRef = useRef(null);
  const noiseRef = useRef(null);
  const neutralBsRef = useRef(null);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationStatus, setCalibrationStatus] = useState("Preparing tracker");
  const peakRepScoreRef = useRef(null);
  const [liveScore, setLiveScore] = useState(null);
  const [liveBalance, setLiveBalance] = useState(null);
  const [liveBaselineProgress, setLiveBaselineProgress] = useState(null);
  const [postureAligned, setPostureAligned] = useState(false);
  const [exerciseScores, setExerciseScores] = useState([]);
  const repScoresRef = useRef([]);
  const repBaselineProgressRef = useRef([]);
  const repInitialBaselineProgressRef = useRef([]);
  const repSnapshotsRef = useRef([]);
  const peakSnapshotRef = useRef(null);
  const peakDispRef = useRef(0);
  // Hold-window score accumulator: rep score = mean(symmetry across all valid frames during hold).
  // Honors sustained effort better than instantaneous peak, esp. on the affected side.
  const holdScoreSumRef = useRef(0);
  const holdScoreCountRef = useRef(0);
  const holdLeftSumRef = useRef(0);
  const holdRightSumRef = useRef(0);

  const startTimeRef = useRef(session.startedAt);
  const current = session.exercises[exIdx];
  const nextExercise = session.exercises[exIdx + 1] ?? null;
  const totalExercises = session.exercises.length;
  const currentReps = current.reps;
  const currentRestSec = exerciseRestSec(current);
  const currentHoldSec = exerciseHoldSec(current);
  const autoPaused = symEnabled && trackerStatus === "ready" && (phase === "rest" || phase === "hold") && !postureAligned;
  const timerPaused = paused || autoPaused;

  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream, exIdx, phase]);

  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (phase !== "calibrate") return;
    calibBufferRef.current = [];
    calibBsBufferRef.current = [];
    lastCalibLmRef.current = null;
    neutralRef.current = null;
    noiseRef.current = null;
    neutralBsRef.current = null;
    baselineSnapshotRef.current = null;
    setCalibrationProgress(0);
    setCalibrationStatus("Preparing tracker");
    speak(prefs.voiceEnabled, "Calibration. Center your face and stay relaxed.");
  }, [phase, prefs.voiceEnabled]);

  useEffect(() => {
    if (phase !== "calibrate") return;
    if (!symEnabled || cameraError || trackerStatus === "error") {
      setPhase("preview");
      setSecondsLeft(null);
    }
  }, [phase, symEnabled, cameraError, trackerStatus]);

  // Phase entry: set the timer and announce the phase.
  useEffect(() => {
    if (paused) return;
    if (phase === "hold") {
      peakRepScoreRef.current = null;
      peakSnapshotRef.current = null;
      peakDispRef.current = 0;
      holdScoreSumRef.current = 0;
      holdScoreCountRef.current = 0;
      holdLeftSumRef.current = 0;
      holdRightSumRef.current = 0;
      setLiveScore(null);
      setLiveBalance(null);
      setLiveBaselineProgress(null);
      speak(prefs.voiceEnabled, "Hold");
    } else if (phase === "rest") {
      if (restIsEntryRef.current) {
        // Entry rest: settle into the exercise before the first hold.
        speak(prefs.voiceEnabled, repIdx === 0 && exIdx === 0
          ? current.name + ". Resting pose. Stay relaxed."
          : current.name + ". Resting pose.");
      } else {
        // Post-hold rest: record this rep using the TIME-AVERAGED hold score; snapshot at peak movement.
        const avgScore = holdScoreCountRef.current > 0 ? holdScoreSumRef.current / holdScoreCountRef.current : null;
        if (avgScore != null) repScoresRef.current = [...repScoresRef.current, avgScore];
        if (holdScoreCountRef.current > 0) {
          const leftAvg = holdLeftSumRef.current / holdScoreCountRef.current;
          const rightAvg = holdRightSumRef.current / holdScoreCountRef.current;
          const progress = computeBaselineProgressFromDisplacements(current.id, leftAvg, rightAvg, movementProfile);
          const initialProgress = computeBaselineProgressFromDisplacements(current.id, leftAvg, rightAvg, initialMovementProfile);
          if (progress) repBaselineProgressRef.current = [...repBaselineProgressRef.current, progress];
          if (initialProgress) repInitialBaselineProgressRef.current = [...repInitialBaselineProgressRef.current, initialProgress];
        }
        const snap = peakSnapshotRef.current ?? captureSnapshot(videoRef.current, snapshotCanvasRef.current);
        if (snap) repSnapshotsRef.current = [...repSnapshotsRef.current, { ts: Date.now(), score: avgScore, dataUrl: snap }];
        speak(prefs.voiceEnabled, "Resting pose");
      }
    } else if (phase === "interstitial") {
      speak(prefs.voiceEnabled, "Nice work. Take a breath.");
    } else if (phase === "preview") {
      speak(prefs.voiceEnabled, `Up next: ${current.name}. ${current.instruction}`);
    }
  }, [phase, exIdx, repIdx]);

  useEffect(() => {
    if (timerPaused || phase === "summary" || phase === "calibrate" || phase === "preview") return;
    if (secondsLeft <= 0) {
      // Each branch sets BOTH the new phase and the new timer in one batch — otherwise the advance
      // effect would re-fire with stale secondsLeft = 0 and skip past the just-entered phase.
      if (phase === "hold") {
        setPhase("rest");
        setSecondsLeft(currentRestSec);
      } else if (phase === "rest") {
        if (restIsEntryRef.current) {
          restIsEntryRef.current = false;
          setPhase("hold");
          setSecondsLeft(currentHoldSec);
        } else if (repIdx + 1 < currentReps) {
          setRepIdx(repIdx + 1);
          setPhase("hold");
          setSecondsLeft(currentHoldSec);
        } else {
          // End of exercise — finalize per-exercise scores
          const scores = repScoresRef.current;
          const baselineProgress = summarizeBaselineProgress(repBaselineProgressRef.current);
          const initialBaselineProgress = summarizeBaselineProgress(repInitialBaselineProgressRef.current);
          const snapshots = repSnapshotsRef.current;
          const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
          setExerciseScores((prev) => [...prev, { exerciseId: current.id, name: current.name, region: current.region, repsTarget: current.reps, holdSec: current.holdSec, restSec: current.restSec, comfortLevel: current.comfortLevel, baselineSnapshot: baselineSnapshotRef.current, scores, avg, snapshots, baselineProgress, initialBaselineProgress }]);
          repScoresRef.current = [];
          repBaselineProgressRef.current = [];
          repInitialBaselineProgressRef.current = [];
          repSnapshotsRef.current = [];
          if (exIdx + 1 < totalExercises) {
            setPhase("interstitial");
            setSecondsLeft(INTERSTITIAL_SEC);
          } else {
            speak(prefs.voiceEnabled, "Session complete. Well done.");
            setPhase("summary");
          }
        }
      } else if (phase === "interstitial") {
        setExIdx(exIdx + 1);
        setRepIdx(0);
        restIsEntryRef.current = true; // next exercise starts with an entry rest
        setPhase("preview");
        setSecondsLeft(null);
      }
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, timerPaused, phase]);

  // FaceLandmarker detection + overlay loop — synchronous detectForVideo, runs continuously so the overlay stays live
  useEffect(() => {
    if (!faceLandmarker || !videoRef.current) return;
    const bsMapping = EXERCISE_BLENDSHAPES[current.id] ?? null;
    const isBrow = BROW_EXERCISES.has(current.id);
    const isNose = NOSE_EXERCISES.has(current.id);

    let raf, alive = true, lastTs = 0;
    const tick = () => {
      if (!alive) return;
      const v = videoRef.current;
      if (!v || v.readyState < 2 || v.paused) { raf = requestAnimationFrame(tick); return; }
      try {
        const ts = Math.max(lastTs + 1, performance.now());
        lastTs = ts;
        const taskResult = faceLandmarker.detectForVideo(v, ts);
        const rawLm = taskResult.faceLandmarks?.[0];
        const bsArr = taskResult.faceBlendshapes?.[0]?.categories;

        if (rawLm) {
          const prevLm = latestRef.current?.landmarks;
          const lm = smoothLandmarks(prevLm, rawLm);
          const bsMap = {};
          if (bsArr) for (const c of bsArr) bsMap[c.categoryName] = c.score;
          latestRef.current = { landmarks: lm, blendshapes: bsMap };
          const alignment = faceAlignmentFeedback(lm);
          const aligned = alignment.aligned;
          setPostureAligned((prev) => (prev === aligned ? prev : aligned));

          if (phase === "calibrate") {
            if (!neutralRef.current) {
              if (!aligned) {
                calibBufferRef.current = [];
                calibBsBufferRef.current = [];
                lastCalibLmRef.current = null;
                setCalibrationProgress(0);
                setCalibrationStatus(alignment.label);
              } else {
                const delta = lastCalibLmRef.current ? normalizedFrameDelta(lm, lastCalibLmRef.current) : 0;
                lastCalibLmRef.current = lm;
                if (delta > CALIBRATION_RESET_EPS) {
                  calibBufferRef.current = [lm];
                  calibBsBufferRef.current = [bsMap];
                  setCalibrationProgress(1);
                  setCalibrationStatus(calibrationPrompt(1, delta));
                } else {
                  if (calibBufferRef.current.length < CALIBRATION_FRAMES) {
                    calibBufferRef.current.push(lm);
                    calibBsBufferRef.current.push(bsMap);
                  }
                  const progress = calibBufferRef.current.length;
                  setCalibrationProgress((prev) => (prev === progress ? prev : progress));
                  setCalibrationStatus(calibrationPrompt(progress, delta));
                  if (progress >= CALIBRATION_FRAMES) {
                    const neutral = averageLandmarks(calibBufferRef.current);
                    neutralRef.current = neutral;
                    noiseRef.current = computeNoiseFloor(calibBufferRef.current, neutral);
                    neutralBsRef.current = averageBlendshapes(calibBsBufferRef.current);
                    baselineSnapshotRef.current = captureSnapshot(v, snapshotCanvasRef.current);
                    restIsEntryRef.current = true;
                    setPhase("preview");
                    setSecondsLeft(null);
                  }
                }
              }
            }
          } else if (phase === "hold") {
            if (!aligned) {
              setLiveScore(null);
              setLiveBalance(null);
              setLiveBaselineProgress(null);
            } else {
              let symResult = null;
              // Brow exercises: pitch-invariant brow-to-eye gap delta.
              // Nose exercises: aperture widening + upward ala lift (handles both wrinkle and flare).
              // Other exercises: face-local landmark-pair displacement with per-landmark noise
              // subtracted out. Fallback: generic 9-pair.
              symResult = computeExerciseSymmetry(current.id, lm, neutralRef.current, noiseRef.current, bsMap, neutralBsRef.current);
              if (symResult != null) {
                const profileThreshold = effectiveProfileThreshold(current.id, getProfileExercise(movementProfile, current.id)?.activationThreshold);
                const activated = !profileThreshold || symResult.peak >= profileThreshold;
                if (activated) {
                  setLiveScore(symResult.symmetry);
                  setLiveBalance({ left: symResult.leftDisp, right: symResult.rightDisp });
                  // Time-average accumulator — every valid frame contributes equally to the rep score.
                  // A saved movement profile raises this from generic movement to user-scaled movement.
                  holdScoreSumRef.current += symResult.symmetry;
                  holdScoreCountRef.current++;
                  holdLeftSumRef.current += symResult.leftDisp;
                  holdRightSumRef.current += symResult.rightDisp;
                  setLiveBaselineProgress(computeBaselineProgress(current.id, symResult, movementProfile));
                  if (peakRepScoreRef.current == null || symResult.symmetry > peakRepScoreRef.current) {
                    peakRepScoreRef.current = symResult.symmetry;
                  }
                } else {
                  setLiveScore(null);
                  setLiveBalance(null);
                  setLiveBaselineProgress(null);
                }
              }
              // Auto-advance gate AND snapshot trigger. For brow exercises, the brow-lift magnitude is more
              // precise than the blendshape (subtle lifts saturate browOuterUp poorly).
              let activation;
              if ((isBrow || isNose) && symResult) activation = symResult.peak;
              else if (bsMapping)       activation = bsActivation(bsMap, bsMapping);
              else                      activation = symResult ? symResult.peak : 0;
              if (activation > peakDispRef.current) {
                peakDispRef.current = activation;
                // Capture snapshot at peak movement, not peak score — score can be misleading on asymmetric faces
                peakSnapshotRef.current = captureSnapshot(v, snapshotCanvasRef.current);
              }
            }
            // Hold runs for the full holdSec timer — no auto-advance on detected release.
            // We still track peak for snapshot capture, just don't end the phase early.
          }

          drawOverlay(overlayRef.current, v, lm, { aligned, phase });
        } else {
          latestRef.current = null;
          setPostureAligned(false);
          setLiveScore(null);
          setLiveBalance(null);
          setLiveBaselineProgress(null);
          if (phase === "calibrate") {
            calibBufferRef.current = [];
            calibBsBufferRef.current = [];
            lastCalibLmRef.current = null;
            baselineSnapshotRef.current = null;
            setCalibrationProgress(0);
            setCalibrationStatus("Find your face in the camera");
          }
          drawOverlay(overlayRef.current, v, null, { aligned: false, phase });
        }
      } catch {
        // Detection is best-effort; transient MediaPipe/video frame errors should not end a session.
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [faceLandmarker, phase, current.id, currentRestSec, movementProfile]);

  const handleSkipExercise = () => {
    flushSpeech();
    const scores = repScoresRef.current;
    const baselineProgress = summarizeBaselineProgress(repBaselineProgressRef.current);
    const initialBaselineProgress = summarizeBaselineProgress(repInitialBaselineProgressRef.current);
    const snapshots = repSnapshotsRef.current;
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    setExerciseScores((prev) => [...prev, { exerciseId: current.id, name: current.name, region: current.region, repsTarget: current.reps, holdSec: current.holdSec, restSec: current.restSec, comfortLevel: current.comfortLevel, baselineSnapshot: baselineSnapshotRef.current, scores, avg, snapshots, baselineProgress, initialBaselineProgress }]);
    repScoresRef.current = [];
    repBaselineProgressRef.current = [];
    repInitialBaselineProgressRef.current = [];
    repSnapshotsRef.current = [];
    if (exIdx + 1 < totalExercises) { setExIdx(exIdx + 1); setRepIdx(0); restIsEntryRef.current = true; setPhase("preview"); setSecondsLeft(null); }
    else setPhase("summary");
  };

  const skipCalibration = () => {
    flushSpeech();
    calibBufferRef.current = [];
    calibBsBufferRef.current = [];
    lastCalibLmRef.current = null;
    neutralRef.current = null;
    noiseRef.current = null;
    neutralBsRef.current = null;
    baselineSnapshotRef.current = captureSnapshot(videoRef.current, snapshotCanvasRef.current);
    restIsEntryRef.current = true;
    setCalibrationProgress(0);
    setCalibrationStatus("Scoring skipped");
    setPhase("preview");
    setSecondsLeft(null);
  };

  const nextInterstitial = () => { flushSpeech(); setSecondsLeft(0); };

  const handleFinish = () => {
    const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
    const validAvgs = exerciseScores.map((e) => e.avg).filter((v) => v != null);
    const sessionAvg = validAvgs.length > 0 ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length : null;
    const baselineProgress = summarizeSessionBaselineProgress(exerciseScores);
    const initialBaselineProgress = summarizeSessionBaselineProgress(exerciseScores, "initialBaselineProgress");
    onComplete({ date: todayISO(), duration, exercises: exerciseScores.map((e) => e.exerciseId), scores: exerciseScores, sessionAvg, baselineProgress, initialBaselineProgress, baselineSnapshot: baselineSnapshotRef.current, comfortLevel: session.comfortLevel, kind: session.kind ?? (exerciseScores.length > 1 ? "session" : "practice"), ts: Date.now() });
  };

  if (phase === "summary") return <SessionSummary scores={exerciseScores} sessionsToday={sessionsToday} dailyGoal={prefs.dailyGoal ?? 3} kind={session.kind} startedAt={session.startedAt} comfortLevel={session.comfortLevel} baselineProgress={summarizeSessionBaselineProgress(exerciseScores)} initialBaselineProgress={summarizeSessionBaselineProgress(exerciseScores, "initialBaselineProgress")} onFinish={handleFinish} />;
  if (phase === "preview") {
    return (
      <PreviewView
        exercise={current}
        exIdx={exIdx + 1}
        totalExercises={totalExercises}
        onStart={() => { flushSpeech(); setPhase("rest"); setSecondsLeft(currentRestSec); }}
        onCancel={onCancel}
        stream={stream}
        faceLandmarker={faceLandmarker}
        mirrorEnabled={prefs.mirrorEnabled}
        cameraError={cameraError}
      />
    );
  }
  if (phase === "interstitial") {
    return (
      <InterstitialView
        just={exerciseScores[exerciseScores.length - 1]}
        nextExercise={nextExercise}
        secondsLeft={secondsLeft}
        exIdx={exIdx + 1}
        totalExercises={totalExercises}
        onNext={nextInterstitial}
        onCancel={onCancel}
      />
    );
  }

  const phaseTone = {
    calibrate: { tag: "CALIBRATING", title: "Stay relaxed", prompt: calibrationStatus, color: "#D4A574", verb: "calibrate" },
    hold: { tag: "HOLD THE POSE", title: current.name, prompt: current.instruction, color: "#B8543A", verb: "contract" },
    rest: { tag: "RESTING POSE",  title: current.name, prompt: current.instruction, color: "#7A8F73", verb: "rest" },
  }[phase];
  const calibrationPct = Math.round((calibrationProgress / CALIBRATION_FRAMES) * 100);
  const displayPrompt = autoPaused ? "Paused. Center your face inside the ring to continue." : phaseTone.prompt;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch lg:items-center lg:justify-center lg:p-6" style={{ background: "rgba(12,10,8,0.92)" }}>
      <div className="flex flex-col w-full h-full lg:w-[440px] lg:h-[860px] lg:max-h-[92vh] lg:rounded-3xl lg:overflow-hidden lg:shadow-2xl" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
      <div className="flex items-center justify-between p-4 shrink-0">
        <button onClick={onCancel} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(244, 239, 230, 0.1)" }} aria-label="End"><X className="w-5 h-5" /></button>
        <div className="text-xs opacity-70">Exercise {exIdx + 1} of {totalExercises}</div>
        <div className="flex gap-2">
          <button onClick={() => { if (!prefs.voiceEnabled) primeSpeech(true); else flushSpeech(); onTogglePref("voiceEnabled"); }} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(244, 239, 230, 0.1)" }} aria-label="Toggle voice">{prefs.voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}</button>
          <button onClick={() => onTogglePref("mirrorEnabled")} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(244, 239, 230, 0.1)" }} aria-label="Toggle mirror">{prefs.mirrorEnabled ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}</button>
        </div>
      </div>

      {symEnabled && (
        <div className="px-4 pb-2 shrink-0">
          <TrackerStatusPill status={trackerStatus} liveScore={liveScore} phase={phase} />
        </div>
      )}

      <div className="px-4 pb-3 shrink-0">
        <div className="rounded-2xl p-3" style={{ background: "rgba(244, 239, 230, 0.1)", border: `1px solid ${phaseTone.color}` }}>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full" style={{ background: phaseTone.color, color: "#1F1B16" }}>
              {phaseTone.tag}
            </div>
            <div className="text-xs opacity-70 whitespace-nowrap">Rep {repIdx + 1} / {currentReps}</div>
          </div>
          <div className="text-sm leading-relaxed" style={{ color: "#F4EFE6" }}>{displayPrompt}</div>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {prefs.mirrorEnabled && !cameraError ? (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
            <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            <canvas ref={snapshotCanvasRef} style={{ display: "none" }} />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center opacity-60 px-6"><CameraOff className="w-10 h-10 mx-auto mb-3" /><div className="text-sm">{cameraError ?? "Mirror off"}</div></div>
          </div>
        )}

        {prefs.mirrorEnabled && !cameraError && trackerStatus === "ready" && (
          <div className="absolute top-4 left-4 px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ background: postureAligned ? "rgba(122,143,115,0.85)" : "rgba(212,165,116,0.85)", color: "#1F1B16" }}>
            {postureAligned ? "Posture · centered" : "Center your face in the ring"}
          </div>
        )}

        {phase === "hold" && liveScore != null && (
          <div className="absolute top-4 right-4"><RealtimeFeedback symmetry={liveScore} balance={liveBalance} baseline={liveBaselineProgress} /></div>
        )}

        {autoPaused && (
          <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
            <div className="rounded-2xl px-4 py-3 text-center shadow-xl" style={{ background: "rgba(31, 27, 22, 0.88)", border: "1px solid rgba(212, 165, 116, 0.75)", color: "#F4EFE6" }}>
              <div className="text-xs font-bold uppercase tracking-[0.18em] mb-1" style={{ color: "#D4A574" }}>Auto paused</div>
              <div className="text-sm leading-relaxed">Center your face inside the ring to continue.</div>
            </div>
          </div>
        )}


        {(phase === "hold" || phase === "rest" || phase === "calibrate") && (
          <div className="absolute inset-x-0 top-0 h-1.5 transition-colors duration-300" style={{ background: phaseTone.color }} />
        )}

        <div className="absolute inset-0 flex flex-col justify-end pointer-events-none">
          <div className="p-6 pb-4" style={{ background: "linear-gradient(to top, rgba(31,27,22,0.95) 0%, rgba(31,27,22,0.7) 60%, transparent 100%)" }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full" style={{ background: phaseTone.color, color: "#1F1B16" }}>
                {phaseTone.tag}
              </div>
              <div className="text-xs opacity-70">Rep {repIdx + 1} / {currentReps}</div>
            </div>
            <div className="text-5xl mb-1" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>
              {phaseTone.title}
            </div>
            <div className="text-7xl tabular-nums transition-colors duration-300" style={{ fontFamily: "Fraunces", fontWeight: 600, color: phaseTone.color }}>
              {phase === "calibrate" ? `${calibrationPct}%` : (secondsLeft || "·")}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 shrink-0" style={{ borderTop: phase === "hold" || phase === "rest" || phase === "calibrate" ? `2px solid ${phaseTone.color}` : "2px solid transparent", transition: "border-color 300ms" }}>
        <div className="flex gap-3">
          <button onClick={() => { setPaused((p) => { if (!p) flushSpeech(); return !p; }); }} className="flex-1 rounded-full py-3 flex items-center justify-center gap-2 font-semibold" style={{ background: "rgba(244, 239, 230, 0.15)", color: "#F4EFE6" }}>
            {paused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}{paused ? "Resume" : "Pause"}
          </button>
          <button onClick={phase === "calibrate" ? skipCalibration : handleSkipExercise} className="flex-1 rounded-full py-3 flex items-center justify-center gap-2 font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>{phase === "calibrate" ? "Start unscored" : "Skip"}<ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
      </div>
    </div>
  );
}

function emptyAssessmentFrameStats() {
  return { frames: 0, holdFrames: 0, alignedFrames: 0, leftSum: 0, rightSum: 0, symSum: 0, leftPeak: 0, rightPeak: 0, symPeak: null, samples: [] };
}

function finalizeAssessmentStats(stat, exercise) {
  const frames = stat.frames;
  const robust = robustMovementWindow(stat.samples, PROFILE_BASELINE_TOP_FRACTION);
  const quality = exerciseBaselineQuality(stat);
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    region: exercise.region,
    frames,
    holdFrames: stat.holdFrames ?? frames,
    alignedFrames: stat.alignedFrames ?? 0,
    neutralFrames: stat.neutralFrames ?? 0,
    neutralSource: stat.neutralSource ?? "global",
    quality,
    leftAvg: frames ? stat.leftSum / frames : null,
    rightAvg: frames ? stat.rightSum / frames : null,
    symAvg: frames ? stat.symSum / frames : null,
    leftRobustAvg: robust?.left ?? null,
    rightRobustAvg: robust?.right ?? null,
    symRobustAvg: robust?.symmetry ?? null,
    robustPeakAvg: robust?.peak ?? null,
    baselineFrames: robust?.count ?? 0,
    baselineMethod: robust ? `top-${Math.round(PROFILE_BASELINE_TOP_FRACTION * 100)}-movement-mean` : "mean",
    leftPeak: stat.leftPeak,
    rightPeak: stat.rightPeak,
    symPeak: stat.symPeak,
  };
}

function ProfileAssessment({ existingProfile, retakeExerciseIds, onComplete, onSkip }) {
  const retakeIds = [...new Set((retakeExerciseIds ?? []).filter((id) => EXERCISE_BY_ID.has(id)))];
  const isPartialRetake = retakeIds.length > 0;
  const exerciseIds = isPartialRetake ? retakeIds : PROFILE_ASSESSMENT_EXERCISES;
  const exercises = exerciseIds.map((id) => EXERCISE_BY_ID.get(id)).filter(Boolean);
  const [phase, setPhase] = useState("intro");
  const [affectedSide, setAffectedSide] = useState("unsure");
  const [comfortLevel, setComfortLevel] = useState("gentle");
  const [exIdx, setExIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(PROFILE_REST_SEC);
  const [postureAligned, setPostureAligned] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationStatus, setCalibrationStatus] = useState("Preparing tracker");
  const [restStatus, setRestStatus] = useState("Relax your face before the movement.");
  const [liveScore, setLiveScore] = useState(null);
  const [liveBalance, setLiveBalance] = useState(null);
  const [exerciseStats, setExerciseStats] = useState([]);
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const neutralRef = useRef(null);
  const noiseRef = useRef(null);
  const neutralBsRef = useRef(null);
  const calibBufferRef = useRef([]);
  const calibBsBufferRef = useRef([]);
  const lastCalibLmRef = useRef(null);
  const exerciseNeutralRef = useRef(null);
  const exerciseNoiseRef = useRef(null);
  const exerciseNeutralBsRef = useRef(null);
  const restBufferRef = useRef([]);
  const restBsBufferRef = useRef([]);
  const restRetryRef = useRef(0);
  const statRef = useRef(emptyAssessmentFrameStats());
  const activeCamera = phase !== "intro" && phase !== "summary";
  const { stream, cameraError } = useCameraStream(activeCamera);
  const { faceLandmarker, latestRef, status: trackerStatus } = useFaceLandmarker(activeCamera);
  const current = exercises[exIdx] ?? exercises[0];
  const scoredStats = exerciseStats.map((s) => s.symAvg).filter((v) => v != null);
  const summaryAvg = scoredStats.length ? scoredStats.reduce((sum, v) => sum + v, 0) / scoredStats.length : null;
  const retakeCount = exerciseStats.filter((s) => s.quality?.key === "retake").length;
  const autoPaused = trackerStatus === "ready" && (phase === "rest" || phase === "hold") && !postureAligned;

  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream, exIdx]);

  useEffect(() => {
    if (phase !== "calibrate") return;
    neutralRef.current = null;
    noiseRef.current = null;
    neutralBsRef.current = null;
    calibBufferRef.current = [];
    calibBsBufferRef.current = [];
    lastCalibLmRef.current = null;
    setCalibrationProgress(0);
    setCalibrationStatus("Preparing tracker");
  }, [phase]);

  useEffect(() => {
    if (phase !== "hold") return;
    statRef.current = emptyAssessmentFrameStats();
    statRef.current.neutralFrames = restBufferRef.current.length;
    statRef.current.neutralSource = exerciseNeutralRef.current ? "exercise-rest" : "global";
    setLiveScore(null);
    setLiveBalance(null);
  }, [phase, exIdx]);

  useEffect(() => {
    if (phase !== "rest") return;
    restRetryRef.current = 0;
    restBufferRef.current = [];
    restBsBufferRef.current = [];
    exerciseNeutralRef.current = null;
    exerciseNoiseRef.current = null;
    exerciseNeutralBsRef.current = null;
    setRestStatus("Relax your face. Capturing a neutral baseline for this exercise.");
  }, [phase, exIdx]);

  useEffect(() => {
    if (phase !== "rest" && phase !== "hold") return;
    if (autoPaused) return;
    if (secondsLeft <= 0) {
      if (phase === "rest") {
        const restFrames = restBufferRef.current;
        if (restFrames.length < PROFILE_EXERCISE_NEUTRAL_MIN_FRAMES && restRetryRef.current < PROFILE_REST_RETRY_LIMIT) {
          restRetryRef.current += 1;
          setRestStatus("Need a steadier neutral pose before this movement. Center your face and stay relaxed.");
          setSecondsLeft(PROFILE_REST_SEC);
          return;
        }
        if (restFrames.length >= PROFILE_EXERCISE_NEUTRAL_MIN_FRAMES) {
          const exerciseNeutral = averageLandmarks(restFrames);
          exerciseNeutralRef.current = exerciseNeutral;
          exerciseNoiseRef.current = computeNoiseFloor(restFrames, exerciseNeutral);
          exerciseNeutralBsRef.current = averageBlendshapes(restBsBufferRef.current);
        } else {
          exerciseNeutralRef.current = null;
          exerciseNoiseRef.current = null;
          exerciseNeutralBsRef.current = null;
        }
        setPhase("hold");
        setSecondsLeft(PROFILE_HOLD_SEC);
      } else {
        const stat = finalizeAssessmentStats(statRef.current, current);
        setExerciseStats((prev) => [...prev, stat]);
        if (exIdx + 1 < exercises.length) {
          setExIdx((idx) => idx + 1);
          setPhase("rest");
          setSecondsLeft(PROFILE_REST_SEC);
        } else {
          setPhase("summary");
        }
      }
      return;
    }
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, secondsLeft, exIdx, current, exercises.length, autoPaused]);

  useEffect(() => {
    if (!faceLandmarker || !videoRef.current || !activeCamera) return;
    let raf, alive = true, lastTs = 0;
    const tick = () => {
      if (!alive) return;
      const v = videoRef.current;
      if (!v || v.readyState < 2 || v.paused) { raf = requestAnimationFrame(tick); return; }
      try {
        const ts = Math.max(lastTs + 1, performance.now());
        lastTs = ts;
        const result = faceLandmarker.detectForVideo(v, ts);
        const rawLm = result.faceLandmarks?.[0];
        const bsArr = result.faceBlendshapes?.[0]?.categories;
        if (rawLm) {
          const lm = smoothLandmarks(latestRef.current?.landmarks, rawLm);
          const bsMap = {};
          if (bsArr) for (const c of bsArr) bsMap[c.categoryName] = c.score;
          latestRef.current = { landmarks: lm, blendshapes: bsMap };
          const alignment = faceAlignmentFeedback(lm);
          const aligned = alignment.aligned;
          setPostureAligned((prev) => (prev === aligned ? prev : aligned));

          if (phase === "calibrate") {
            if (!aligned) {
              calibBufferRef.current = [];
              calibBsBufferRef.current = [];
              lastCalibLmRef.current = null;
              setCalibrationProgress(0);
              setCalibrationStatus(alignment.label);
            } else {
              const delta = lastCalibLmRef.current ? normalizedFrameDelta(lm, lastCalibLmRef.current) : 0;
              lastCalibLmRef.current = lm;
              if (delta > CALIBRATION_RESET_EPS) {
                calibBufferRef.current = [lm];
                calibBsBufferRef.current = [bsMap];
                setCalibrationProgress(1);
                setCalibrationStatus(calibrationPrompt(1, delta));
              } else {
                if (calibBufferRef.current.length < CALIBRATION_FRAMES) {
                  calibBufferRef.current.push(lm);
                  calibBsBufferRef.current.push(bsMap);
                }
                const progress = calibBufferRef.current.length;
                setCalibrationProgress((prev) => (prev === progress ? prev : progress));
                setCalibrationStatus(calibrationPrompt(progress, delta));
                if (progress >= CALIBRATION_FRAMES) {
                  const neutral = averageLandmarks(calibBufferRef.current);
                  neutralRef.current = neutral;
                  noiseRef.current = computeNoiseFloor(calibBufferRef.current, neutral);
                  neutralBsRef.current = averageBlendshapes(calibBsBufferRef.current);
                  setPhase("rest");
                  setSecondsLeft(PROFILE_REST_SEC);
                }
              }
            }
          } else if (phase === "rest") {
            if (aligned) {
              restBufferRef.current.push(lm);
              restBsBufferRef.current.push(bsMap);
              const count = restBufferRef.current.length;
              const remaining = Math.max(0, PROFILE_EXERCISE_NEUTRAL_MIN_FRAMES - count);
              setRestStatus(remaining > 0
                ? `Hold neutral for this exercise. ${remaining} more steady frame${remaining === 1 ? "" : "s"}.`
                : "Exercise neutral captured. Keep relaxed until the movement starts.");
            } else {
              setRestStatus(`${alignment.label} so this exercise gets its own baseline.`);
            }
          } else if (phase === "hold") {
            if (!aligned) {
              setLiveScore(null);
              setLiveBalance(null);
            } else {
              const stat = statRef.current;
              stat.holdFrames++;
              stat.alignedFrames++;
              const neutral = exerciseNeutralRef.current ?? neutralRef.current;
              const noise = exerciseNoiseRef.current ?? noiseRef.current;
              const neutralBs = exerciseNeutralBsRef.current ?? neutralBsRef.current;
              const sym = computeExerciseSymmetry(current.id, lm, neutral, noise, bsMap, neutralBs);
              if (sym) {
                stat.frames++;
                stat.leftSum += sym.leftDisp;
                stat.rightSum += sym.rightDisp;
                stat.symSum += sym.symmetry;
                stat.leftPeak = Math.max(stat.leftPeak, sym.leftDisp);
                stat.rightPeak = Math.max(stat.rightPeak, sym.rightDisp);
                stat.symPeak = stat.symPeak == null ? sym.symmetry : Math.max(stat.symPeak, sym.symmetry);
                stat.samples.push({ left: sym.leftDisp, right: sym.rightDisp, symmetry: sym.symmetry, peak: sym.peak });
                setLiveScore(sym.symmetry);
                setLiveBalance({ left: sym.leftDisp, right: sym.rightDisp });
              }
            }
          }
          drawOverlay(overlayRef.current, v, lm, { aligned, phase });
        } else {
          latestRef.current = null;
          setPostureAligned(false);
          setLiveScore(null);
          setLiveBalance(null);
          if (phase === "calibrate") {
            calibBufferRef.current = [];
            calibBsBufferRef.current = [];
            lastCalibLmRef.current = null;
            setCalibrationProgress(0);
            setCalibrationStatus("Find your face in the camera");
          } else if (phase === "rest") {
            setRestStatus("Find your face in the camera so this exercise gets its own baseline.");
          }
          drawOverlay(overlayRef.current, v, null, { aligned: false, phase });
        }
      } catch {
        // Best-effort assessment; transient frame/model errors should not close the flow.
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [activeCamera, faceLandmarker, latestRef, phase, current.id]);

  const handleBegin = () => {
    setExerciseStats([]);
    setExIdx(0);
    setSecondsLeft(PROFILE_REST_SEC);
    restBufferRef.current = [];
    restBsBufferRef.current = [];
    exerciseNeutralRef.current = null;
    exerciseNoiseRef.current = null;
    exerciseNeutralBsRef.current = null;
    setPhase("calibrate");
  };

  const handleSave = () => {
    const profile = buildMovementProfile({
      neutral: neutralRef.current,
      noise: noiseRef.current,
      exerciseStats,
      affectedSide: isPartialRetake ? existingProfile?.affectedSide ?? affectedSide : affectedSide,
      comfortLevel: isPartialRetake ? existingProfile?.comfortLevel ?? comfortLevel : comfortLevel,
    });
    onComplete(profile, { retakeExerciseIds: isPartialRetake ? exerciseIds : null });
  };

  if (phase === "intro") {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-5" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
        <div className="max-w-md w-full max-h-[92vh] overflow-y-auto pr-1">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-3">Personal baseline</div>
          <h2 className="text-4xl mb-3" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>{isPartialRetake ? "Retake selected baselines." : "Let's understand your face first."}</h2>
          <p className="text-sm leading-relaxed opacity-75 mb-6">{isPartialRetake ? "Mirror will recalibrate neutral and replace only the selected exercise baselines in your existing profile." : "Mirror will capture a neutral pose and every exercise movement. This creates a local movement profile for future personalization."}</p>

          {!isPartialRetake && <div className="space-y-5 mb-7">
            <div>
              <div className="text-sm font-semibold mb-2">Affected side</div>
              <div className="grid grid-cols-4 gap-2">
                {["left", "right", "both", "unsure"].map((side) => (
                  <button key={side} onClick={() => setAffectedSide(side)} className="rounded-full py-2 text-xs font-semibold capitalize" style={{ background: affectedSide === side ? "#B8543A" : "rgba(244,239,230,0.08)", color: "#F4EFE6", border: affectedSide === side ? "none" : "1px solid rgba(244,239,230,0.14)" }}>{side}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold mb-2">Comfort level</div>
              <div className="grid grid-cols-3 gap-2">
                {["gentle", "normal", "advanced"].map((level) => (
                  <button key={level} onClick={() => setComfortLevel(level)} className="rounded-full py-2 text-xs font-semibold capitalize" style={{ background: comfortLevel === level ? "#7A8F73" : "rgba(244,239,230,0.08)", color: "#F4EFE6", border: comfortLevel === level ? "none" : "1px solid rgba(244,239,230,0.14)" }}>{level}</button>
                ))}
              </div>
            </div>
          </div>}

          <div className="rounded-2xl p-4 mb-6" style={{ background: "rgba(244,239,230,0.06)", border: "1px solid rgba(244,239,230,0.08)" }}>
            <div className="text-xs uppercase tracking-wider opacity-60 mb-3">{isPartialRetake ? "Retake set" : "Assessment set"}</div>
            <div className="grid grid-cols-6 gap-2">
              {exercises.map((ex) => <ExerciseGlyph key={ex.id} exercise={ex} size="xs" tone="dark" className="mx-auto" />)}
            </div>
            <div className="text-xs opacity-55 mt-3">{exercises.length} movements · about {Math.ceil(exercises.length * (PROFILE_REST_SEC + PROFILE_HOLD_SEC) / 60)} minutes</div>
          </div>

          <div className="flex gap-3">
            <button onClick={onSkip} className="flex-1 rounded-full py-3 font-semibold" style={{ background: "rgba(244,239,230,0.12)", color: "#F4EFE6" }}>Skip</button>
            <button onClick={handleBegin} className="flex-1 rounded-full py-3 font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>{isPartialRetake ? "Start retake" : "Start baseline"}</button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "summary") {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-5" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
        <div className="max-w-md w-full max-h-[92vh] overflow-y-auto pr-1">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-3">Baseline complete</div>
          <h2 className="text-4xl mb-3" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>{isPartialRetake ? "Selected baselines ready." : "Movement profile ready."}</h2>
          <p className="text-sm leading-relaxed opacity-75 mb-6">{isPartialRetake ? "Only these exercise baselines will replace the matching movements in your current profile." : "This profile is saved locally and can be used to personalize thresholds and track progress from your starting point."}</p>
          {summaryAvg != null && (
            <div className="text-center mb-6">
              <div className="text-7xl tabular-nums" style={{ fontFamily: "Fraunces", fontWeight: 600, color: scoreColor(summaryAvg), letterSpacing: "-0.03em" }}>{displayPct(summaryAvg)}%</div>
              <div className="text-xs opacity-60 mt-1">initial average symmetry</div>
            </div>
          )}
          {retakeCount > 0 && (
            <div className="rounded-2xl p-3 mb-4 text-xs" style={{ background: "rgba(212,165,116,0.14)", color: "#F6D8B2", border: "1px solid rgba(212,165,116,0.2)" }}>
              {retakeCount} baseline movement{retakeCount === 1 ? "" : "s"} had low-quality capture. You can still save this profile, but those exercises should be retaken later.
            </div>
          )}
          <div className="space-y-2 mb-6">
            {exerciseStats.map((stat) => (
              <div key={stat.exerciseId} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: "rgba(244,239,230,0.06)" }}>
                <ExerciseGlyph exerciseId={stat.exerciseId} region={stat.region} size="xs" tone="dark" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{stat.name}</div>
                  <div className="text-xs opacity-55">{stat.frames} scored frame{stat.frames === 1 ? "" : "s"} · baseline: {stat.baselineFrames || 0} robust frame{stat.baselineFrames === 1 ? "" : "s"} · neutral: {stat.neutralSource === "exercise-rest" ? `${stat.neutralFrames} rest frames` : "global"} · limited side: {inferLimitedSide(stat.leftPeak, stat.rightPeak)}</div>
                  {stat.quality && (
                    <div className="text-[11px] mt-0.5" style={{ color: stat.quality.key === "strong" ? "#A8C39F" : stat.quality.key === "usable" ? "#F6D8B2" : "#FFB48F" }}>
                      {stat.quality.label}{stat.quality.issues?.length ? ` · ${stat.quality.issues.join(", ")}` : ""}
                    </div>
                  )}
                </div>
                {stat.symAvg != null ? <div className="text-lg tabular-nums" style={{ fontFamily: "Fraunces", color: scoreColor(stat.symAvg) }}>{displayPct(stat.symAvg)}%</div> : <div className="text-xs opacity-45">—</div>}
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={handleBegin} className="flex-1 rounded-full py-3 font-semibold" style={{ background: "rgba(244,239,230,0.12)", color: "#F4EFE6" }}>Redo</button>
            <button onClick={handleSave} className="flex-1 rounded-full py-3 font-semibold" style={{ background: "#B8543A", color: "#F4EFE6" }}>{isPartialRetake ? "Save retake" : "Save profile"}</button>
          </div>
        </div>
      </div>
    );
  }

  const calibrationPct = Math.round((calibrationProgress / CALIBRATION_FRAMES) * 100);
  const phaseTone = phase === "calibrate"
    ? { tag: "CALIBRATING", title: "Stay relaxed", prompt: calibrationStatus, color: "#D4A574" }
    : phase === "hold"
      ? { tag: "ASSESS", title: current.name, prompt: current.instruction, color: "#B8543A" }
      : { tag: "REST", title: current.name, prompt: restStatus, color: "#7A8F73" };
  const displayPrompt = autoPaused ? "Paused. Center your face inside the ring to continue." : phaseTone.prompt;

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch lg:items-center lg:justify-center lg:p-6" style={{ background: "rgba(12,10,8,0.92)" }}>
      <div className="flex flex-col w-full h-full lg:w-[440px] lg:h-[860px] lg:max-h-[92vh] lg:rounded-3xl lg:overflow-hidden lg:shadow-2xl" style={{ background: "#1F1B16", color: "#F4EFE6" }}>
        <div className="flex items-center justify-between p-4 shrink-0">
          <button onClick={onSkip} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(244, 239, 230, 0.1)" }} aria-label="Skip baseline"><X className="w-5 h-5" /></button>
          <div className="text-xs opacity-70">{phase === "calibrate" ? "Neutral baseline" : `Exercise ${exIdx + 1} of ${exercises.length}`}</div>
          <div className="w-10" />
        </div>

        <div className="px-4 pb-2 shrink-0">
          <TrackerStatusPill status={cameraError ? "error" : trackerStatus} liveScore={liveScore} phase={phase} />
        </div>

        <div className="flex-1 relative overflow-hidden">
          {!cameraError ? (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
              <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center opacity-60 px-6"><CameraOff className="w-10 h-10 mx-auto mb-3" /><div className="text-sm">{cameraError}</div></div>
            </div>
          )}

          {!cameraError && trackerStatus === "ready" && (
            <div className="absolute top-4 left-4 px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ background: postureAligned ? "rgba(122,143,115,0.85)" : "rgba(212,165,116,0.85)", color: "#1F1B16" }}>
              {postureAligned ? "Posture · centered" : "Center your face in the ring"}
            </div>
          )}

          {phase === "hold" && liveScore != null && (
            <div className="absolute top-4 right-4"><RealtimeFeedback symmetry={liveScore} balance={liveBalance} /></div>
          )}

          {autoPaused && (
            <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
              <div className="rounded-2xl px-4 py-3 text-center shadow-xl" style={{ background: "rgba(31, 27, 22, 0.88)", border: "1px solid rgba(212, 165, 116, 0.75)", color: "#F4EFE6" }}>
                <div className="text-xs font-bold uppercase tracking-[0.18em] mb-1" style={{ color: "#D4A574" }}>Auto paused</div>
                <div className="text-sm leading-relaxed">Center your face inside the ring to continue.</div>
              </div>
            </div>
          )}

          <div className="absolute inset-x-0 top-0 h-1.5 transition-colors duration-300" style={{ background: phaseTone.color }} />
          <div className="absolute inset-0 flex flex-col justify-end pointer-events-none">
            <div className="p-6 pb-4" style={{ background: "linear-gradient(to top, rgba(31,27,22,0.95) 0%, rgba(31,27,22,0.7) 60%, transparent 100%)" }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full" style={{ background: phaseTone.color, color: "#1F1B16" }}>{phaseTone.tag}</div>
                {phase !== "calibrate" && <div className="text-xs opacity-70">{current.region}</div>}
              </div>
              <div className="text-5xl mb-1" style={{ fontFamily: "Fraunces", fontWeight: 500, letterSpacing: "-0.02em" }}>{phaseTone.title}</div>
              <div className="text-7xl tabular-nums transition-colors duration-300" style={{ fontFamily: "Fraunces", fontWeight: 600, color: phaseTone.color }}>
                {phase === "calibrate" ? `${calibrationPct}%` : (secondsLeft || "·")}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 shrink-0" style={{ borderTop: `2px solid ${phaseTone.color}` }}>
          <div className="text-sm mb-4 leading-relaxed min-h-[2.5em]" style={{ color: phaseTone.color }}>{displayPrompt}</div>
          <button onClick={onSkip} className="w-full rounded-full py-3 font-semibold" style={{ background: "rgba(244,239,230,0.12)", color: "#F4EFE6" }}>Skip baseline</button>
        </div>
      </div>
    </div>
  );
}
