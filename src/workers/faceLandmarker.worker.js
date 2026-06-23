import { normalizeFaceLandmarkerResult } from "../ml/faceLandmarkerResult";

let faceLandmarker = null;

async function initFaceLandmarker(config) {
  const { FilesetResolver, FaceLandmarker } = await import(/* @vite-ignore */ config.tasksVisionUrl);
  const fileset = await FilesetResolver.forVisionTasks(config.tasksWasmBase);
  faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: config.modelAssetPath, delegate: "CPU" },
    runningMode: "VIDEO",
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
    numFaces: 1,
  });
}

self.onmessage = async (event) => {
  const { id, type, config, bitmap, timestampMs } = event.data ?? {};
  try {
    if (type === "init") {
      await initFaceLandmarker(config);
      self.postMessage({ id, type: "ready", result: { ok: true } });
      return;
    }

    if (type === "detect") {
      if (!faceLandmarker) throw new Error("FaceLandmarker worker is not initialized");
      try {
        const result = faceLandmarker.detectForVideo(bitmap, timestampMs);
        self.postMessage({ id, type: "result", result: normalizeFaceLandmarkerResult(result) });
      } finally {
        bitmap?.close?.();
      }
      return;
    }

    if (type === "close") {
      try { faceLandmarker?.close?.(); } catch { /* best-effort worker cleanup */ }
      faceLandmarker = null;
      self.close();
      return;
    }

    throw new Error(`Unknown FaceLandmarker worker message: ${type}`);
  } catch (err) {
    try { bitmap?.close?.(); } catch { /* bitmap may already be closed */ }
    self.postMessage({ id, type: "error", error: err?.message ?? String(err) });
  }
};
