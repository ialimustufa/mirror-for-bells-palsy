#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { calibrateThresholdsFromValidationSamples, extractValidationFrameRecords } from "../src/ml/validationEvaluation.js";

async function readRecords(path) {
  const text = await readFile(path, "utf8");
  const trimmed = text.trim();
  const sourceDatasetSha256 = createHash("sha256").update(text).digest("hex");
  if (!trimmed) return { records: [], sourceDatasetSha256 };
  if (trimmed.startsWith("[")) return { records: JSON.parse(trimmed), sourceDatasetSha256 };
  return {
    records: text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line)),
    sourceDatasetSha256,
  };
}

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath) {
  console.error("Usage: npm run validation:calibrate-thresholds -- <reviewed-dataset.jsonl> [threshold-report.json]");
  process.exit(1);
}

const { records, sourceDatasetSha256 } = await readRecords(inputPath);
const samples = extractValidationFrameRecords(records);
const report = calibrateThresholdsFromValidationSamples(samples, { sourceDatasetSha256 });
const text = JSON.stringify(report, null, 2);
if (outputPath) {
  await writeFile(outputPath, `${text}\n`, "utf8");
  console.log(`Wrote threshold calibration report: ${outputPath}`);
} else {
  console.log(text);
}
