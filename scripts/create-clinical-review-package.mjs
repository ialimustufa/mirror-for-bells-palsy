#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BLINDED_LABEL_SHEET_FILE,
  MANIFEST_FILE,
  REVIEWER_INSTRUCTIONS_FILE,
  buildClinicalReviewPackage,
} from "../src/ml/clinicalReviewPackage.js";

function parseArgs(argv) {
  const [inputPath, outputDir, ...flags] = argv;
  const args = { inputPath, outputDir, packageId: null };
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === "--package-id") {
      args.packageId = flags[index + 1] ?? null;
      index += 1;
    }
  }
  return args;
}

function parseJsonl(text) {
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

const { inputPath, outputDir, packageId } = parseArgs(process.argv.slice(2));
if (!inputPath || !outputDir) {
  console.error("Usage: npm run validation:clinical-review-package -- <validation-dataset.jsonl> <output-dir> [--package-id <id>]");
  process.exit(1);
}

const sourceText = await readFile(inputPath, "utf8");
const sourceDatasetSha256 = createHash("sha256").update(sourceText).digest("hex");
const records = parseJsonl(sourceText);
const reviewPackage = buildClinicalReviewPackage(records, {
  sourceDatasetPath: inputPath,
  sourceDatasetSha256,
  packageId,
});

await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, MANIFEST_FILE), `${JSON.stringify(reviewPackage.manifest, null, 2)}\n`, "utf8");
await writeFile(join(outputDir, BLINDED_LABEL_SHEET_FILE), reviewPackage.labelSheetCsv, "utf8");
await writeFile(join(outputDir, REVIEWER_INSTRUCTIONS_FILE), reviewPackage.reviewerInstructionsMarkdown, "utf8");

console.log(`Wrote clinical review package: ${outputDir}`);
console.log(`- ${MANIFEST_FILE}`);
console.log(`- ${BLINDED_LABEL_SHEET_FILE}`);
console.log(`- ${REVIEWER_INSTRUCTIONS_FILE}`);
