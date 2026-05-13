import { useEffect, useRef, useState } from "react";
import { Play, Pause, X, ChevronRight, Volume2, VolumeX, Camera, CameraOff } from "lucide-react";
import { CALIBRATION_FRAMES, CALIBRATION_RESET_EPS, INTERSTITIAL_SEC } from "../domain/config";
import { exerciseHoldSec, exerciseRestSec, todayISO } from "../domain/session";
import { flushSpeech, primeSpeech, speak } from "../lib/speech";
import { useCameraStream } from "../hooks/useCameraStream";
import { useFaceLandmarker } from "../hooks/useFaceLandmarker";
import { InterstitialView, PreviewView, RealtimeFeedback, SessionSummary, TrackerStatusPill } from "../components/appViews";
import { BROW_EXERCISES, EXERCISE_BLENDSHAPES, NOSE_EXERCISES, averageBlendshapes, averageFacialTransformationMatrix, averageLandmarks, bsActivation, calibrationPrompt, captureSnapshot, computeBaselineProgress, computeBaselineProgressFromDisplacements, computeExerciseSymmetry, computeNoiseFloor, drawOverlay, effectiveProfileThreshold, faceAlignmentFeedback, firstFacialTransformationMatrix, getProfileExercise, normalizedFrameDelta, smoothFacialTransformationMatrix, smoothLandmarks, summarizeBaselineProgress, summarizeSessionBaselineProgress } from "../ml/faceMetrics";

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
  const calibMatrixBufferRef = useRef([]);
  const lastCalibLmRef = useRef(null);
  const lastCalibMatrixRef = useRef(null);
  const neutralRef = useRef(null);
  const noiseRef = useRef(null);
  const neutralBsRef = useRef(null);
  const neutralMatrixRef = useRef(null);
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
      flushSpeech();
    };
  }, []);

  useEffect(() => {
    if (phase !== "calibrate") return;
    calibBufferRef.current = [];
    calibBsBufferRef.current = [];
    calibMatrixBufferRef.current = [];
    lastCalibLmRef.current = null;
    lastCalibMatrixRef.current = null;
    neutralRef.current = null;
    noiseRef.current = null;
    neutralBsRef.current = null;
    neutralMatrixRef.current = null;
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
        const rawMatrix = firstFacialTransformationMatrix(taskResult);

        if (rawLm) {
          const prevLm = latestRef.current?.landmarks;
          const prevMatrix = latestRef.current?.facialTransformationMatrix;
          const lm = smoothLandmarks(prevLm, rawLm);
          const facialTransformationMatrix = smoothFacialTransformationMatrix(prevMatrix, rawMatrix);
          const bsMap = {};
          if (bsArr) for (const c of bsArr) bsMap[c.categoryName] = c.score;
          latestRef.current = { landmarks: lm, blendshapes: bsMap, facialTransformationMatrix };
          const alignment = faceAlignmentFeedback(lm);
          const aligned = alignment.aligned;
          setPostureAligned((prev) => (prev === aligned ? prev : aligned));

          if (phase === "calibrate") {
            if (!neutralRef.current) {
              if (!aligned) {
                calibBufferRef.current = [];
                calibBsBufferRef.current = [];
                calibMatrixBufferRef.current = [];
                lastCalibLmRef.current = null;
                lastCalibMatrixRef.current = null;
                setCalibrationProgress(0);
                setCalibrationStatus(alignment.label);
              } else {
                const delta = lastCalibLmRef.current ? normalizedFrameDelta(lm, lastCalibLmRef.current, facialTransformationMatrix, lastCalibMatrixRef.current) : 0;
                lastCalibLmRef.current = lm;
                lastCalibMatrixRef.current = facialTransformationMatrix;
                if (delta > CALIBRATION_RESET_EPS) {
                  calibBufferRef.current = [lm];
                  calibBsBufferRef.current = [bsMap];
                  calibMatrixBufferRef.current = [facialTransformationMatrix];
                  setCalibrationProgress(1);
                  setCalibrationStatus(calibrationPrompt(1, delta));
                } else {
                  if (calibBufferRef.current.length < CALIBRATION_FRAMES) {
                    calibBufferRef.current.push(lm);
                    calibBsBufferRef.current.push(bsMap);
                    calibMatrixBufferRef.current.push(facialTransformationMatrix);
                  }
                  const progress = calibBufferRef.current.length;
                  setCalibrationProgress((prev) => (prev === progress ? prev : progress));
                  setCalibrationStatus(calibrationPrompt(progress, delta));
                  if (progress >= CALIBRATION_FRAMES) {
                    const neutral = averageLandmarks(calibBufferRef.current);
                    const neutralMatrix = averageFacialTransformationMatrix(calibMatrixBufferRef.current);
                    neutralRef.current = neutral;
                    neutralMatrixRef.current = neutralMatrix;
                    noiseRef.current = computeNoiseFloor(calibBufferRef.current, neutral, calibMatrixBufferRef.current, neutralMatrix);
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
              symResult = computeExerciseSymmetry(current.id, lm, neutralRef.current, noiseRef.current, bsMap, neutralBsRef.current, facialTransformationMatrix, neutralMatrixRef.current);
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
            calibMatrixBufferRef.current = [];
            lastCalibLmRef.current = null;
            lastCalibMatrixRef.current = null;
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
    calibMatrixBufferRef.current = [];
    lastCalibLmRef.current = null;
    lastCalibMatrixRef.current = null;
    neutralRef.current = null;
    noiseRef.current = null;
    neutralBsRef.current = null;
    neutralMatrixRef.current = null;
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
          <button onClick={() => { if (!prefs.voiceEnabled) primeSpeech(true, { text: "Voice cues on." }); else flushSpeech(); onTogglePref("voiceEnabled"); }} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(244, 239, 230, 0.1)" }} aria-label="Toggle voice">{prefs.voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}</button>
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

export { SessionMode };
