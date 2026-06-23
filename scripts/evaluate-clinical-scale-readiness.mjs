#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { assessClinicalScaleReadiness } from "../src/ml/clinicalScaleReadiness.js";

async function readInput(path) {
  const text = await readFile(path, "utf8");
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return JSON.parse(trimmed);
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath) {
  console.error("Usage: npm run validation:clinical-readiness -- <reviewed-dataset.jsonl|validation-report.json|clinical-scale-report.json> [clinical-readiness-report.json]");
  process.exit(1);
}

const input = await readInput(inputPath);
const report = assessClinicalScaleReadiness(input);
const text = JSON.stringify(report, null, 2);

if (outputPath) {
  await writeFile(outputPath, `${text}\n`, "utf8");
  console.log(`Wrote clinical scale readiness report: ${outputPath}`);
} else {
  console.log(text);
}
