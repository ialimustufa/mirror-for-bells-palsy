#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import {
  buildClinicalScaleAgreementMarkdown,
  buildClinicalScaleAgreementReport,
} from "../src/ml/clinicalScaleAgreementReport.js";

const USAGE = "Usage: npm run validation:clinical-report -- <reviewed-dataset.jsonl|validation-report.json|clinical-readiness-report.json> [clinical-scale-agreement.md|clinical-scale-agreement.json]";

async function readInput(path) {
  const text = await readFile(path, "utf8");
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return JSON.parse(trimmed);
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

const [inputPath, outputPath] = process.argv.slice(2);
if (inputPath === "--help" || inputPath === "-h") {
  console.log(USAGE);
  process.exit(0);
}
if (!inputPath) {
  console.error(USAGE);
  process.exit(1);
}

const input = await readInput(inputPath);
const outputJson = outputPath?.endsWith(".json");
const output = outputJson
  ? `${JSON.stringify(buildClinicalScaleAgreementReport(input), null, 2)}\n`
  : buildClinicalScaleAgreementMarkdown(input);

if (outputPath) {
  await writeFile(outputPath, output, "utf8");
  console.log(`Wrote clinical scale agreement report: ${outputPath}`);
} else {
  console.log(output);
}
