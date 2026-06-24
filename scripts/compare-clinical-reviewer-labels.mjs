#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { compareClinicalScaleReviewerLabels, createClinicalScaleAdjudicationCsv } from "../src/ml/clinicalScaleReviewerAgreement.js";

const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;

function usage() {
  console.error("Usage: npm run validation:reviewer-agreement -- <reviewer-a-labels.csv> <reviewer-b-labels.csv> [adjudication.csv] [--source-dataset validation-dataset.jsonl] [--source-dataset-sha256 sha256]");
  process.exit(1);
}

function normalizeSourceDatasetSha256(value, field) {
  const text = String(value ?? "").trim();
  if (!SHA256_HEX_RE.test(text)) {
    throw new Error(`${field} must be a SHA-256 hex string`);
  }
  return text.toLowerCase();
}

const positionalArgs = [];
let sourceDatasetPath = null;
let explicitSourceDatasetSha256 = null;
const rawArgs = process.argv.slice(2);
for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === "--source-dataset") {
    sourceDatasetPath = rawArgs[index + 1];
    if (!sourceDatasetPath || sourceDatasetPath.startsWith("--")) usage();
    index += 1;
  } else if (arg === "--source-dataset-sha256") {
    explicitSourceDatasetSha256 = rawArgs[index + 1];
    if (!explicitSourceDatasetSha256 || explicitSourceDatasetSha256.startsWith("--")) usage();
    index += 1;
  } else if (arg.startsWith("--")) {
    console.error(`Unknown option: ${arg}`);
    usage();
  } else {
    positionalArgs.push(arg);
  }
}

const [reviewerAPath, reviewerBPath, adjudicationPath, ...extraPositionalArgs] = positionalArgs;
if (!reviewerAPath || !reviewerBPath || extraPositionalArgs.length > 0) usage();

const [reviewerACsv, reviewerBCsv] = await Promise.all([
  readFile(reviewerAPath, "utf8"),
  readFile(reviewerBPath, "utf8"),
]);

let sourceDatasetSha256 = null;
if (sourceDatasetPath) {
  const sourceDatasetText = await readFile(sourceDatasetPath, "utf8");
  sourceDatasetSha256 = createHash("sha256").update(sourceDatasetText).digest("hex");
}
if (explicitSourceDatasetSha256) {
  const normalizedExplicitHash = normalizeSourceDatasetSha256(explicitSourceDatasetSha256, "--source-dataset-sha256");
  if (sourceDatasetSha256 && sourceDatasetSha256 !== normalizedExplicitHash) {
    throw new Error("--source-dataset-sha256 must match the hash computed from --source-dataset");
  }
  sourceDatasetSha256 = normalizedExplicitHash;
}

const report = compareClinicalScaleReviewerLabels(reviewerACsv, reviewerBCsv, {
  reviewerA: reviewerAPath,
  reviewerB: reviewerBPath,
  sourceDatasetSha256,
});

if (adjudicationPath) {
  await writeFile(adjudicationPath, createClinicalScaleAdjudicationCsv(report), "utf8");
  console.error(`Wrote clinical-scale adjudication sheet: ${adjudicationPath}`);
}

console.log(JSON.stringify(report, null, 2));
