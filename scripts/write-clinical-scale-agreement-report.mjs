#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { buildClinicalScaleAgreementMarkdown } from "../src/ml/clinicalScaleAgreementReport.js";

async function readInput(path) {
  const text = await readFile(path, "utf8");
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return JSON.parse(trimmed);
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath) {
  console.error("Usage: npm run validation:clinical-report -- <reviewed-dataset.jsonl|validation-report.json|clinical-readiness-report.json> [clinical-scale-agreement.md]");
  process.exit(1);
}

const input = await readInput(inputPath);
const markdown = buildClinicalScaleAgreementMarkdown(input);

if (outputPath) {
  await writeFile(outputPath, markdown, "utf8");
  console.log(`Wrote clinical scale agreement report: ${outputPath}`);
} else {
  console.log(markdown);
}
