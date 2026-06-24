#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { extractFrameSamplesFromExportPayload, replayFrameSamples } from "../src/ml/frameSampleReplay.js";

async function readPayload(path) {
  const text = await readFile(path, "utf8");
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim();
  if (firstLine?.startsWith("{") && firstLine.includes('"kind":"mirror-browser-data-lines"')) {
    const stores = { sessionFrameSamples: [] };
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const item = JSON.parse(line);
      if (item.store === "sessionFrameSamples" || item.store === "frameSamples") stores.sessionFrameSamples.push(item.record);
    }
    return { stores };
  }
  return JSON.parse(text);
}

const path = process.argv[2];
if (!path) {
  console.error("Usage: npm run replay:frames -- <backup.jsonl|samples.json>");
  process.exit(1);
}

const payload = await readPayload(path);
const samples = extractFrameSamplesFromExportPayload(payload);
const result = replayFrameSamples(samples);
console.log(JSON.stringify(result, null, 2));
