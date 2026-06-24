#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  evaluateClinicalScaleEstimates,
  evaluateValidationFrameSamples,
  extractAssessmentClinicalScaleRecords,
  extractValidationFrameRecords,
} from "../src/ml/validationEvaluation.js";

async function readValidationRecords(path) {
  const text = await readFile(path, "utf8");
  const trimmed = text.trim();
  const sourceDatasetSha256 = createHash("sha256").update(text).digest("hex");
  if (!trimmed) return { records: [], sourceDatasetSha256 };
  if (trimmed.startsWith("[")) return { records: JSON.parse(trimmed), sourceDatasetSha256 };
  const records = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    records.push(JSON.parse(line));
  }
  return { records, sourceDatasetSha256 };
}

const path = process.argv[2];
if (!path) {
  console.error("Usage: npm run validate:dataset -- <validation-dataset.jsonl>");
  process.exit(1);
}

const { records, sourceDatasetSha256 } = await readValidationRecords(path);
const samples = extractValidationFrameRecords(records);
const frameSamples = evaluateValidationFrameSamples(samples);
const assessmentClinicalScales = extractAssessmentClinicalScaleRecords(records);
const clinicalScales = assessmentClinicalScales.length
  ? evaluateClinicalScaleEstimates(assessmentClinicalScales, { sourceDatasetSha256 })
  : null;
const result = clinicalScales
  ? {
    kind: "mirror-validation-dataset-evaluation-report",
    generatedAt: clinicalScales.generatedAt,
    sourceDatasetSha256,
    frameSamples,
    clinicalScales,
  }
  : frameSamples;
console.log(JSON.stringify(result, null, 2));
