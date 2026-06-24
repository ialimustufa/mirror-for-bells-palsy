#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  buildClinicalScaleAvailabilityEvidence,
  buildClinicalScaleStatusEvidencePatch,
  validateClinicalScaleAgreementReportText,
  validateClinicalScaleReviewerAgreementReportText,
  validateClinicalScaleReviewPackageVerificationReportText,
  validateStatus,
} from "./validation-status-check.mjs";

const USAGE = [
  "Usage: npm run validation:status-evidence -- <validation-status.json> <clinical-scale-agreement.md|json> <clinical-scale-reviewer-agreement.json> <clinical-review-package-verification.json> [--enable houseBrackmann,sunnybrook,eface] [--status-patch]",
  "",
  "Without --enable, the command enables only primary scales that meet both report-backed evidence gates.",
  "Use --status-patch to also include the clinical, reviewer, and review-package verification report path arrays.",
  "The generated JSON is a draft for human review; it does not edit docs/validation-status.json or bypass the global release gate.",
].join("\n");

function parseArgs(args) {
  const positional = [];
  let enabledScaleKeys = null;
  let statusPatch = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--status-patch") {
      statusPatch = true;
      continue;
    }
    if (arg === "--enable") {
      const value = args[index + 1];
      if (!value) throw new Error("--enable requires a comma-separated scale list");
      enabledScaleKeys = value.split(",").map((item) => item.trim()).filter(Boolean);
      index += 1;
      continue;
    }
    positional.push(arg);
  }
  if (positional.length !== 4) throw new Error("expected status, clinical agreement, reviewer agreement, and clinical review package verification paths");
  return {
    statusPath: positional[0],
    clinicalAgreementPath: positional[1],
    reviewerAgreementPath: positional[2],
    reviewPackageVerificationPath: positional[3],
    enabledScaleKeys,
    statusPatch,
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
  const reviewPackageVerificationReport = validateClinicalScaleReviewPackageVerificationReportText(
    await readText(args.reviewPackageVerificationPath),
    args.reviewPackageVerificationPath,
  );
  const evidenceOptions = {
    enabledScaleKeys: args.enabledScaleKeys,
    clinicalScaleReviewPackageVerificationReports: [reviewPackageVerificationReport],
  };
  const draft = args.statusPatch
    ? buildClinicalScaleStatusEvidencePatch(status, clinicalAgreementReport, reviewerAgreementReport, evidenceOptions)
    : {
      clinicalScaleAvailability: buildClinicalScaleAvailabilityEvidence(status, clinicalAgreementReport, reviewerAgreementReport, evidenceOptions),
    };
  console.log(JSON.stringify(draft, null, 2));
} catch (error) {
  console.error(error?.message ?? String(error));
  console.error("");
  console.error(USAGE);
  process.exit(1);
}
