#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const COMMANDS = [
  ["npm", ["run", "lint"]],
  ["npm", ["test"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "validation:status"]],
];

const REQUIRED_DOC_CHECKS = [
  {
    path: "docs/privacy-and-medical.md",
    patterns: [/No video, landmarks, or scores are sent to any server/i, /Validation dataset exports/i, /does not diagnose/i],
  },
  {
    path: "docs/model-and-scoring.md",
    patterns: [/Safety Prompt Sources/i, /Validation Dataset Export/i, /schema-v1 clinical-readiness/i, /clinical-scale agreement\s+report/i, /clinical review package verification/i, /clinical-scale-agreement-reviewed/i, /ready exercise coverage/i, /per-scale evidence\s+summary/i, /validationCaseId/i, /distinct validation-case/i, /reviewerId/i, /distinct pseudonymous reviewer ids/i, /cross-severity House-Brackmann/i, /clinicianConfidence/i, /reviewedAt/i, /sourceDatasetSha256/i, /not diagnosis/i],
  },
  {
    path: "docs/algorithm-upgrade-roadmap.md",
    patterns: [/validation coverage/i, /release gates/i, /not a medical-device specification/i],
  },
  {
    path: "docs/validation-status.json",
    patterns: [/"schemaVersion": 1/i, /"clinicalFacingScoresAllowed":\s*(true|false)/i, /"clinicalScaleAvailability"/i, /"clinicalScaleReviewPackageVerificationReports"/i, /"thresholdCalibrationSourceDatasetSha256s"/i, /clinical-scale-review-protocol\.md/i, /"requiresExplicitClinicalConfidence":\s*true/i, /"requiresIsoReviewTimestamp":\s*true/i, /"requiresSourceDatasetSha256":\s*true/i],
  },
  {
    path: "docs/clinical-scale-review-protocol.md",
    patterns: [/blinded label sheet/i, /reviewer-agreement/i, /clinical review package verification/i, /30 reviewed clinical-scale assessment/i, /clinical-scale-agreement-reviewed/i, /validationCaseId/i, /distinct validation-case/i, /reviewerId/i, /distinct pseudonymous reviewer ids/i, /cross-severity House-Brackmann/i, /clinicianConfidence/i, /reviewedAt/i, /sourceDatasetSha256/i, /clinician-assigned grade/i, /reference-standard controls/i],
  },
];

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function verifyDocs() {
  for (const check of REQUIRED_DOC_CHECKS) {
    const text = await readFile(check.path, "utf8");
    for (const pattern of check.patterns) {
      if (!pattern.test(text)) throw new Error(`${check.path} is missing required release-gate text: ${pattern}`);
    }
  }
  console.log("release docs: ok");
}

for (const [command, args] of COMMANDS) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  await runCommand(command, args);
}

await verifyDocs();
console.log("\nrelease check: ok");
