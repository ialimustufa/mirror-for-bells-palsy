#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BLINDED_LABEL_SHEET_FILE,
  MANIFEST_FILE,
  verifyClinicalReviewPackage,
} from "../src/ml/clinicalReviewPackage.js";

function parseJsonl(text) {
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

const [datasetPath, packageDir, reportPath] = process.argv.slice(2);
if (!datasetPath || !packageDir) {
  console.error("Usage: npm run validation:verify-clinical-review-package -- <validation-dataset.jsonl> <clinical-review-package-dir> [report.json]");
  process.exit(1);
}

const sourceText = await readFile(datasetPath, "utf8");
const sourceDatasetSha256 = createHash("sha256").update(sourceText).digest("hex");
const records = parseJsonl(sourceText);
const manifest = JSON.parse(await readFile(join(packageDir, MANIFEST_FILE), "utf8"));
const labelSheetCsv = await readFile(join(packageDir, BLINDED_LABEL_SHEET_FILE), "utf8");
const report = verifyClinicalReviewPackage(records, manifest, labelSheetCsv, { sourceDatasetSha256 });

if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (report.status !== "passed") {
  console.error(`clinical review package verification failed: ${report.errors.length} issue(s)`);
  for (const error of report.errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`clinical review package verification: ${report.status}`);
console.log(`package: ${report.packageId}`);
console.log(`clinical-scale rows: ${report.summary.assessmentClinicalScaleRows}`);
if (reportPath) console.log(`wrote report: ${reportPath}`);
