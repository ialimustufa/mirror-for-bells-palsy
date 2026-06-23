#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { assessValidationModelReadiness } from "../src/ml/modelReadiness.js";
import { evaluateValidationFrameSamples, extractValidationFrameRecords } from "../src/ml/validationEvaluation.js";

async function readInput(path) {
  const text = await readFile(path, "utf8");
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return JSON.parse(trimmed);
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

function isValidationEvaluationReport(input) {
  return input && typeof input === "object" && !Array.isArray(input) && input.validation && typeof input.validation === "object";
}

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath) {
  console.error("Usage: npm run validation:model-readiness -- <reviewed-dataset.jsonl|validation-report.json> [model-readiness-report.json]");
  process.exit(1);
}

const input = await readInput(inputPath);
const evaluation = isValidationEvaluationReport(input)
  ? input
  : evaluateValidationFrameSamples(extractValidationFrameRecords(Array.isArray(input) ? input : [input]));
const report = assessValidationModelReadiness(evaluation);
const text = JSON.stringify(report, null, 2);

if (outputPath) {
  await writeFile(outputPath, `${text}\n`, "utf8");
  console.log(`Wrote model readiness report: ${outputPath}`);
} else {
  console.log(text);
}
