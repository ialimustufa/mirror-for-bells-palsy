import { useEffect, useRef, useState } from "react";

/* MediaPipe Tasks Face Landmarker — 478 landmarks + 52 ARKit-style blendshapes + face pose matrices */
const TASKS_VISION_VERSION = "0.10.21";
const TASKS_VISION_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/vision_bundle.mjs`;
const TASKS_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const FACE_LANDMARKER_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

function useFaceLandmarker(active) {
  const [status, setStatus] = useState("idle");
  const [faceLandmarker, setFaceLandmarker] = useState(null);
  const flRef = useRef(null);
  const latestRef = useRef(null); // { landmarks, blendshapes, facialTransformationMatrix }

  useEffect(() => {
    if (!active || flRef.current) return;
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        const mod = await import(/* @vite-ignore */ TASKS_VISION_URL);
        if (cancelled) return;
        const { FilesetResolver, FaceLandmarker } = mod;
        const fileset = await FilesetResolver.forVisionTasks(TASKS_WASM_BASE);
        if (cancelled) return;
        const fl = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          numFaces: 1,
        });
        if (cancelled) { try { fl.close(); } catch { /* model may already be closed */ } return; }
        flRef.current = fl;
        setFaceLandmarker(fl);
        setStatus("ready");
      } catch (err) {
        console.warn("[Mirror] FaceLandmarker init failed:", err);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [active]);

  useEffect(() => {
    return () => {
      try { flRef.current?.close?.(); } catch { /* best-effort model cleanup */ }
      flRef.current = null;
      setFaceLandmarker(null);
    };
  }, []);

  return { faceLandmarker, latestRef, status };
}

export { useFaceLandmarker };
