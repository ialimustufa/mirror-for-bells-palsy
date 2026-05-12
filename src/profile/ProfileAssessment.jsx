import { useEffect, useRef, useState } from "react";
import { X, CameraOff } from "lucide-react";
import { CALIBRATION_FRAMES, CALIBRATION_RESET_EPS, PROFILE_BASELINE_TOP_FRACTION, PROFILE_EXERCISE_NEUTRAL_MIN_FRAMES, PROFILE_HOLD_SEC, PROFILE_REST_RETRY_LIMIT, PROFILE_REST_SEC } from "../domain/config";
import { EXERCISE_BY_ID, PROFILE_ASSESSMENT_EXERCISES } from "../domain/exercises";
import { useCameraStream } from "../hooks/useCameraStream";
import { useFaceLandmarker } from "../hooks/useFaceLandmarker";
import { ExerciseGlyph, RealtimeFeedback, TrackerStatusPill } from "../components/appViews";
import { displayPct, scoreColor } from "../ui/scoreFormatting";
import { averageBlendshapes, averageFacialTransformationMatrix, averageLandmarks, buildMovementProfile, calibrationPrompt, computeExerciseSymmetry, computeNoiseFloor, drawOverlay, exerciseBaselineQuality, faceAlignmentFeedback, firstFacialTransformationMatrix, inferLimitedSide, normalizedFrameDelta, robustMovementWindow, smoothFacialTransformationMatrix, smoothLandmarks } from "../ml/faceMetrics";

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
  const neutralMatrixRef = useRef(null);
  const calibBufferRef = useRef([]);
  const calibBsBufferRef = useRef([]);
  const calibMatrixBufferRef = useRef([]);
  const lastCalibLmRef = useRef(null);
  const lastCalibMatrixRef = useRef(null);
  const exerciseNeutralRef = useRef(null);
  const exerciseNoiseRef = useRef(null);
  const exerciseNeutralBsRef = useRef(null);
  const exerciseNeutralMatrixRef = useRef(null);
  const restBufferRef = useRef([]);
  const restBsBufferRef = useRef([]);
  const restMatrixBufferRef = useRef([]);
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
    neutralMatrixRef.current = null;
    calibBufferRef.current = [];
    calibBsBufferRef.current = [];
    calibMatrixBufferRef.current = [];
    lastCalibLmRef.current = null;
    lastCalibMatrixRef.current = null;
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
    restMatrixBufferRef.current = [];
    exerciseNeutralRef.current = null;
    exerciseNoiseRef.current = null;
    exerciseNeutralBsRef.current = null;
    exerciseNeutralMatrixRef.current = null;
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
          const exerciseNeutralMatrix = averageFacialTransformationMatrix(restMatrixBufferRef.current);
          exerciseNeutralRef.current = exerciseNeutral;
          exerciseNeutralMatrixRef.current = exerciseNeutralMatrix;
          exerciseNoiseRef.current = computeNoiseFloor(restFrames, exerciseNeutral, restMatrixBufferRef.current, exerciseNeutralMatrix);
          exerciseNeutralBsRef.current = averageBlendshapes(restBsBufferRef.current);
        } else {
          exerciseNeutralRef.current = null;
          exerciseNoiseRef.current = null;
          exerciseNeutralBsRef.current = null;
          exerciseNeutralMatrixRef.current = null;
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
        const rawMatrix = firstFacialTransformationMatrix(result);
        if (rawLm) {
          const lm = smoothLandmarks(latestRef.current?.landmarks, rawLm);
          const facialTransformationMatrix = smoothFacialTransformationMatrix(latestRef.current?.facialTransformationMatrix, rawMatrix);
          const bsMap = {};
          if (bsArr) for (const c of bsArr) bsMap[c.categoryName] = c.score;
          latestRef.current = { landmarks: lm, blendshapes: bsMap, facialTransformationMatrix };
          const alignment = faceAlignmentFeedback(lm);
          const aligned = alignment.aligned;
          setPostureAligned((prev) => (prev === aligned ? prev : aligned));

          if (phase === "calibrate") {
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
                  setPhase("rest");
                  setSecondsLeft(PROFILE_REST_SEC);
                }
              }
            }
          } else if (phase === "rest") {
            if (aligned) {
              restBufferRef.current.push(lm);
              restBsBufferRef.current.push(bsMap);
              restMatrixBufferRef.current.push(facialTransformationMatrix);
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
              const neutralMatrix = exerciseNeutralMatrixRef.current ?? neutralMatrixRef.current;
              const sym = computeExerciseSymmetry(current.id, lm, neutral, noise, bsMap, neutralBs, facialTransformationMatrix, neutralMatrix);
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
            calibMatrixBufferRef.current = [];
            lastCalibLmRef.current = null;
            lastCalibMatrixRef.current = null;
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
    restMatrixBufferRef.current = [];
    exerciseNeutralRef.current = null;
    exerciseNoiseRef.current = null;
    exerciseNeutralBsRef.current = null;
    exerciseNeutralMatrixRef.current = null;
    setPhase("calibrate");
  };

  const handleSave = () => {
    const profile = buildMovementProfile({
      neutral: neutralRef.current,
      noise: noiseRef.current,
      neutralFacialTransformationMatrix: neutralMatrixRef.current,
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

export { ProfileAssessment };
