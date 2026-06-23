#!/usr/bin/env node
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
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) return JSON.parse(trimmed);
  const records = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    records.push(JSON.parse(line));
  }
  return records;
}

const path = process.argv[2];
if (!path) {
  console.error("Usage: npm run validate:dataset -- <validation-dataset.jsonl>");
  process.exit(1);
}

const records = await readValidationRecords(path);
const samples = extractValidationFrameRecords(records);
const frameSamples = evaluateValidationFrameSamples(samples);
const assessmentClinicalScales = extractAssessmentClinicalScaleRecords(records);
const clinicalScales = assessmentClinicalScales.length
  ? evaluateClinicalScaleEstimates(assessmentClinicalScales)
  : null;
const result = clinicalScales
  ? {
    kind: "mirror-validation-dataset-evaluation-report",
    generatedAt: clinicalScales.generatedAt,
    frameSamples,
    clinicalScales,
  }
  : frameSamples;
console.log(JSON.stringify(result, null, 2));
