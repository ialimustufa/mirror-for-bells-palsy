import assert from "node:assert/strict";
import test from "node:test";
import validationStatus from "../docs/validation-status.json" with { type: "json" };
import { clinicalScalePresentationPolicy, DEFAULT_VALIDATION_STATUS } from "../src/domain/clinicalScalePresentation.js";
import { buildSessionReportHtml, clinicalScaleEstimateRows } from "../src/reports/sessionReport.js";

const RESTING_METRICS = {
  version: 1,
  averageAsymmetryRatio: 0.08,
  metrics: {
    palpebralFissure: { label: "Palpebral fissure", userLeft: 0.044, userRight: 0.046, asymmetryRatio: 0.04, narrowerSide: "left" },
    nasolabialMidface: { label: "Nasolabial/midface proxy", userLeft: 0.062, userRight: 0.064, asymmetryRatio: 0.03, smallerSide: "left" },
    oralCommissure: { label: "Oral commissure vertical position", userLeft: 0.58, userRight: 0.59, asymmetryRatio: 0.02, lowerSide: "left" },
  },
};

function movementScore(exerciseId, ratio) {
  return {
    exerciseId,
    initialMovementProgress: { affectedProgressRatio: ratio },
    captureQuality: { key: "strong" },
    movementFeatures: { coactivation: { risk: "low", score: 0.02 } },
    scores: [ratio],
  };
}

test("clinical scale presentation policy defaults to the repo validation status", () => {
  assert.equal(DEFAULT_VALIDATION_STATUS.clinicalFacingScoresAllowed, validationStatus.clinicalFacingScoresAllowed);
  assert.equal(validationStatus.clinicalFacingScoresAllowed, false);

  const policy = clinicalScalePresentationPolicy();

  assert.equal(policy.mode, "mirror-estimate");
  assert.equal(policy.badgeLabel, "Estimate");
  assert.match(policy.shortNotice, /not clinician-assigned/);
  assert.match(policy.reportNotice, /not clinician-assigned or validated clinical grades/);
});

test("clinical scale presentation policy switches copy only when clinical-facing scores are allowed", () => {
  const policy = clinicalScalePresentationPolicy({
    status: "validated-clinical-scale-support",
    clinicalFacingScoresAllowed: true,
  });

  assert.equal(policy.mode, "clinical-facing-supported");
  assert.equal(policy.badgeLabel, "Validated");
  assert.equal(policy.scaleNoun, "support value");
  assert.match(policy.shortNotice, /validation gate/);
  assert.match(policy.reportNotice, /clinician interpretation/);
});

test("clinical scale report rows and printable reports use the validation-aware estimate wording", () => {
  const clinicalScales = {
    status: "estimated",
    coverage: {
      usableMovementCount: 5,
      requiredMovementCount: 5,
      ratio: 1,
    },
    evidence: {
      tier: "complete-standard-assessment",
      label: "Complete standard-assessment evidence",
    },
    scales: {
      houseBrackmann: { grade: "II", label: "Mild dysfunction" },
      sunnybrook: {
        compositeScore: 86,
        voluntaryMovementScore: 88,
        restingSymmetryScore: 0,
        synkinesisScore: 2,
      },
      eface: {
        totalScore: 89,
        staticScore: 93,
        dynamicScore: 84,
        synkinesisScore: 90,
      },
    },
  };

  const rows = clinicalScaleEstimateRows(clinicalScales);
  assert.match(rows[0], /House-Brackmann estimate/);
  assert.match(rows[1], /Sunnybrook estimate/);
  assert.match(rows.join(" "), /Evidence tier: Complete standard-assessment evidence/);

  const supportedRows = clinicalScaleEstimateRows(clinicalScales, clinicalScalePresentationPolicy({ clinicalFacingScoresAllowed: true }));
  assert.match(supportedRows[0], /House-Brackmann support value/);

  const html = buildSessionReportHtml({
    kind: "assessment",
    date: "2026-06-24",
    ts: Date.parse("2026-06-24T09:00:00Z"),
    duration: 70,
    sessionAvg: 0.82,
    restingMetrics: RESTING_METRICS,
    scores: [
      movementScore("eyebrow-raise", 0.94),
      movementScore("eye-close", 0.92),
      movementScore("open-smile", 0.88),
      movementScore("nose-wrinkle", 0.84),
      movementScore("pucker", 0.86),
    ],
  });

  assert.match(html, /Clinical scale estimates/);
  assert.match(html, /House-Brackmann estimate/);
  assert.match(html, /Evidence tier: Complete standard-assessment evidence/);
  assert.match(html, /These are Mirror estimates only/);

  const hiddenHtml = buildSessionReportHtml({
    kind: "assessment",
    date: "2026-06-24",
    ts: Date.parse("2026-06-24T09:00:00Z"),
    duration: 70,
    sessionAvg: 0.82,
    restingMetrics: RESTING_METRICS,
    scores: [
      movementScore("eyebrow-raise", 0.94),
      movementScore("eye-close", 0.92),
      movementScore("open-smile", 0.88),
      movementScore("nose-wrinkle", 0.84),
      movementScore("pucker", 0.86),
    ],
  }, { includeClinicalScaleEstimates: false });

  assert.doesNotMatch(hiddenHtml, /Clinical scale estimates/);
  assert.doesNotMatch(hiddenHtml, /House-Brackmann estimate/);
});
