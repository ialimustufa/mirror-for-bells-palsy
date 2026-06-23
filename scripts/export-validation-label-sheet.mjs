#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { createValidationLabelCsv } from "../src/ml/validationLabels.js";

async function readJsonl(path) {
  const text = await readFile(path, "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

const [inputPath, outputPath, ...flags] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error("Usage: npm run validation:label-sheet -- <validation-dataset.jsonl> <labels.csv> [--blinded]");
  process.exit(1);
}

const records = await readJsonl(inputPath);
const blinded = flags.includes("--blinded");
await writeFile(outputPath, createValidationLabelCsv(records, { includeEstimateColumns: !blinded }), "utf8");
console.log(`Wrote ${blinded ? "blinded " : ""}validation label sheet: ${outputPath}`);
