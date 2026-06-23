#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { compareClinicalScaleReviewerLabels, createClinicalScaleAdjudicationCsv } from "../src/ml/clinicalScaleReviewerAgreement.js";

const [reviewerAPath, reviewerBPath, adjudicationPath] = process.argv.slice(2);
if (!reviewerAPath || !reviewerBPath) {
  console.error("Usage: npm run validation:reviewer-agreement -- <reviewer-a-labels.csv> <reviewer-b-labels.csv> [adjudication.csv]");
  process.exit(1);
}

const [reviewerACsv, reviewerBCsv] = await Promise.all([
  readFile(reviewerAPath, "utf8"),
  readFile(reviewerBPath, "utf8"),
]);
const report = compareClinicalScaleReviewerLabels(reviewerACsv, reviewerBCsv, {
  reviewerA: reviewerAPath,
  reviewerB: reviewerBPath,
});

if (adjudicationPath) {
  await writeFile(adjudicationPath, createClinicalScaleAdjudicationCsv(report), "utf8");
  console.error(`Wrote clinical-scale adjudication sheet: ${adjudicationPath}`);
}

console.log(JSON.stringify(report, null, 2));
