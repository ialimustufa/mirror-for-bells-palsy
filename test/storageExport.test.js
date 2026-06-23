import assert from "node:assert/strict";
import test from "node:test";
import { createMirrorBrowserDataExportBlob, parseMirrorBrowserDataFile } from "../src/storage.js";

function namedBlob(parts, name, options = {}) {
  const blob = new Blob(parts, options);
  Object.defineProperty(blob, "name", { value: name });
  return blob;
}

test("browser data parser accepts legacy single JSON backups", async () => {
  const file = namedBlob([
    JSON.stringify({
      kind: "mirror-browser-data",
      appId: "mirror-bells-palsy",
      stores: {
        appState: [{ id: "state", journal: [] }],
        sessions: [{ id: "session-1", ts: 1 }],
      },
      legacyData: { sessions: [{ ts: 1 }] },
    }),
  ], "mirror-browser-data-legacy.json", { type: "application/json" });

  const parsed = await parseMirrorBrowserDataFile(file);

  assert.equal(parsed.kind, "mirror-browser-data");
  assert.equal(parsed.stores.sessions[0].id, "session-1");
  assert.equal(parsed.legacyData.sessions.length, 1);
});

test("browser data parser accepts streamed JSONL backups", async () => {
  const blob = createMirrorBrowserDataExportBlob({
    appId: "mirror-bells-palsy",
    version: 1,
    stores: {
      appState: [{ id: "state", journal: [{ date: "2026-06-23" }] }],
      sessions: [{ id: "session-1", ts: 1 }],
      sessionImages: [{ id: "image-1", sessionId: "session-1", dataUrl: "data:image/jpeg;base64,a" }],
      sessionFrameSamples: [{ id: "frame-1", sessionId: "session-1", exerciseId: "eye-close" }],
    },
  });
  const file = namedBlob([await blob.text()], "mirror-browser-data-2026-06-23.jsonl", { type: "application/x-ndjson" });

  const parsed = await parseMirrorBrowserDataFile(file);

  assert.equal(parsed.kind, "mirror-browser-data");
  assert.equal(parsed.stores.appState[0].journal.length, 1);
  assert.equal(parsed.stores.sessions[0].id, "session-1");
  assert.equal(parsed.stores.sessionImages[0].id, "image-1");
  assert.equal(parsed.stores.sessionFrameSamples[0].id, "frame-1");
});

test("browser data parser rejects non-backup JSONL exports", async () => {
  const file = namedBlob([
    `${JSON.stringify({ kind: "mirror-validation-dataset-jsonl", version: 1 })}\n`,
  ], "mirror-validation-dataset.jsonl", { type: "application/x-ndjson" });

  await assert.rejects(
    () => parseMirrorBrowserDataFile(file),
    /Mirror browser data JSON export/,
  );
});
