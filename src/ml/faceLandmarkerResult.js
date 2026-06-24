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

export { normalizeFaceLandmarkerResult };
