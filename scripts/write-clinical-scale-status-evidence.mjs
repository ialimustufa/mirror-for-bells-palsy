#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  buildClinicalScaleAvailabilityEvidence,
  validateClinicalScaleAgreementReportText,
  validateClinicalScaleReviewerAgreementReportText,
  validateStatus,
} from "./validation-status-check.mjs";

const USAGE = [
  "Usage: npm run validation:status-evidence -- <validation-status.json> <clinical-scale-agreement.md> <clinical-scale-reviewer-agreement.json> [--enable houseBrackmann,sunnybrook,eface]",
  "",
  "Without --enable, the command enables only primary scales that meet both report-backed evidence gates.",
  "The generated JSON is a draft for human review; it does not edit docs/validation-status.json.",
].join("\n");

function parseArgs(args) {
  const positional = [];
  let enabledScaleKeys = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--enable") {
      const value = args[index + 1];
      if (!value) throw new Error("--enable requires a comma-separated scale list");
      enabledScaleKeys = value.split(",").map((item) => item.trim()).filter(Boolean);
      index += 1;
      continue;
    }
    positional.push(arg);
  }
  if (positional.length !== 3) throw new Error("expected status, clinical agreement, and reviewer agreement paths");
  return {
    statusPath: positional[0],
    clinicalAgreementPath: positional[1],
    reviewerAgreementPath: positional[2],
    enabledScaleKeys,
  };
}

async function readText(path) {
  return readFile(path, "utf8");
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }
  const status = validateStatus(JSON.parse(await readText(args.statusPath)));
  const clinicalAgreementReport = validateClinicalScaleAgreementReportText(
    await readText(args.clinicalAgreementPath),
    args.clinicalAgreementPath,
  );
  const reviewerAgreementReport = validateClinicalScaleReviewerAgreementReportText(
    await readText(args.reviewerAgreementPath),
    args.reviewerAgreementPath,
  );
  const clinicalScaleAvailability = buildClinicalScaleAvailabilityEvidence(status, clinicalAgreementReport, reviewerAgreementReport, {
    enabledScaleKeys: args.enabledScaleKeys,
  });
  console.log(JSON.stringify({ clinicalScaleAvailability }, null, 2));
} catch (error) {
  console.error(error?.message ?? String(error));
  console.error("");
  console.error(USAGE);
  process.exit(1);
}
