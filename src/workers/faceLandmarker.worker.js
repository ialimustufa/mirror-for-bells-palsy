let faceLandmarker = null;

function cloneLandmark(landmark) {
  if (!landmark) return landmark;
  const cloned = {
    x: Number(landmark.x),
    y: Number(landmark.y),
    z: Number(landmark.z ?? 0),
  };
  if (landmark.visibility != null) cloned.visibility = Number(landmark.visibility);
  if (landmark.presence != null) cloned.presence = Number(landmark.presence);
  return cloned;
}

function normalizeLandmarkList(list) {
  return Array.isArray(list) ? list.map((face) => face.map(cloneLandmark)) : [];
}

function normalizeBlendshapes(list) {
  return Array.isArray(list)
    ? list.map((blendshape) => ({
      categories: Array.isArray(blendshape?.categories)
        ? blendshape.categories.map((category) => ({
          index: Number.isFinite(category.index) ? category.index : undefined,
          categoryName: category.categoryName ?? "",
          displayName: category.displayName ?? "",
          score: Number(category.score ?? 0),
        }))
        : [],
    }))
    : [];
}

function cloneMatrix(matrix) {
  if (!matrix) return null;
  const data = matrix.data ?? matrix.packedData ?? matrix.packed_data ?? matrix;
  if (!data || data.length == null) return null;
  return {
    rows: matrix.rows ?? 4,
    columns: matrix.columns ?? (data.length >= 16 ? 4 : 3),
    data: Array.from(data, (value) => Number(value)),
  };
}

function normalizeFaceLandmarkerResult(result) {
  return {
    faceLandmarks: normalizeLandmarkList(result?.faceLandmarks),
    faceBlendshapes: normalizeBlendshapes(result?.faceBlendshapes),
    facialTransformationMatrixes: Array.isArray(result?.facialTransformationMatrixes)
      ? result.facialTransformationMatrixes.map(cloneMatrix).filter(Boolean)
      : [],
  };
}

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
