#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { calibrateThresholdsFromValidationSamples, extractValidationFrameRecords } from "../src/ml/validationEvaluation.js";

async function readRecords(path) {
  const text = await readFile(path, "utf8");
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) return JSON.parse(trimmed);
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath) {
  console.error("Usage: npm run validation:calibrate-thresholds -- <reviewed-dataset.jsonl> [threshold-report.json]");
  process.exit(1);
}

const records = await readRecords(inputPath);
const samples = extractValidationFrameRecords(records);
const report = calibrateThresholdsFromValidationSamples(samples);
const text = JSON.stringify(report, null, 2);
if (outputPath) {
  await writeFile(outputPath, `${text}\n`, "utf8");
  console.log(`Wrote threshold calibration report: ${outputPath}`);
} else {
  console.log(text);
}
