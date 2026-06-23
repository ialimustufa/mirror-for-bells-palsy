import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFaceLandmarkerResult } from "../src/ml/faceLandmarkerResult.js";

test("normalizes MediaPipe face landmarker results into plain cloneable data", () => {
  const raw = {
    faceLandmarks: [[
      { x: "0.1", y: 0.2, z: undefined, visibility: "0.8" },
      { x: 0.3, y: 0.4, z: -0.01, presence: 0.9 },
    ]],
    faceBlendshapes: [{
      categories: [
        { index: 1, categoryName: "mouthSmileLeft", displayName: "", score: "0.42" },
        { categoryName: "mouthSmileRight", score: 0.24 },
      ],
    }],
    facialTransformationMatrixes: [{
      rows: 4,
      columns: 4,
      data: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, 4, 1]),
    }],
  };

  const normalized = normalizeFaceLandmarkerResult(raw);

  assert.deepEqual(normalized.faceLandmarks[0], [
    { x: 0.1, y: 0.2, z: 0, visibility: 0.8 },
    { x: 0.3, y: 0.4, z: -0.01, presence: 0.9 },
  ]);
  assert.deepEqual(normalized.faceBlendshapes[0].categories, [
    { index: 1, categoryName: "mouthSmileLeft", displayName: "", score: 0.42 },
    { index: undefined, categoryName: "mouthSmileRight", displayName: "", score: 0.24 },
  ]);
  assert.deepEqual(normalized.facialTransformationMatrixes[0], {
    rows: 4,
    columns: 4,
    data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, 4, 1],
  });
  assert.ok(Array.isArray(normalized.facialTransformationMatrixes[0].data));
});
