#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { mergeValidationLabels } from "../src/ml/validationLabels.js";

async function readJsonl(path) {
  const text = await readFile(path, "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

function writeJsonl(records) {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

const [datasetPath, labelsPath, outputPath] = process.argv.slice(2);
if (!datasetPath || !labelsPath || !outputPath) {
  console.error("Usage: npm run validation:merge-labels -- <validation-dataset.jsonl> <labels.csv> <reviewed-dataset.jsonl>");
  process.exit(1);
}

const records = await readJsonl(datasetPath);
const labelsCsv = await readFile(labelsPath, "utf8");
const merged = mergeValidationLabels(records, labelsCsv);
await writeFile(outputPath, writeJsonl(merged.records), "utf8");
console.log(`Merged ${merged.updatedCount} reviewed frame labels into ${outputPath}`);
