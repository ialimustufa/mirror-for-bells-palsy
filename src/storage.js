const DB_NAME = "mirror-db";
const DB_VERSION = 2;
const APP_STATE_STORE = "appState";
const SESSIONS_STORE = "sessions";
const SESSION_IMAGES_STORE = "sessionImages";
const SESSION_FRAME_SAMPLES_STORE = "sessionFrameSamples";
const APP_STATE_ID = "state";
const SCHEMA_VERSION = 1;
const LEGACY_STORAGE_KEY = "mirror-app-data";
const EXPORT_KIND = "mirror-browser-data";
const EXPORT_LINES_KIND = "mirror-browser-data-lines";
const EXPORT_VERSION = 1;
const EXPORT_APP_ID = "mirror-bells-palsy";

let dbPromise = null;

function hasIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function ensureIndex(store, name, keyPath) {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, { unique: false });
}

function openMirrorDb() {
  if (!hasIndexedDb()) return Promise.reject(new Error("IndexedDB is not available"));
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;

      if (!db.objectStoreNames.contains(APP_STATE_STORE)) {
        db.createObjectStore(APP_STATE_STORE, { keyPath: "id" });
      }

      const sessionsStore = db.objectStoreNames.contains(SESSIONS_STORE)
        ? tx.objectStore(SESSIONS_STORE)
        : db.createObjectStore(SESSIONS_STORE, { keyPath: "id" });
      ensureIndex(sessionsStore, "date", "date");
      ensureIndex(sessionsStore, "ts", "ts");
      ensureIndex(sessionsStore, "updatedAt", "updatedAt");

      const imagesStore = db.objectStoreNames.contains(SESSION_IMAGES_STORE)
        ? tx.objectStore(SESSION_IMAGES_STORE)
        : db.createObjectStore(SESSION_IMAGES_STORE, { keyPath: "id" });
      ensureIndex(imagesStore, "sessionId", "sessionId");
      ensureIndex(imagesStore, "exerciseId", "exerciseId");
      ensureIndex(imagesStore, "role", "role");

      const frameSamplesStore = db.objectStoreNames.contains(SESSION_FRAME_SAMPLES_STORE)
        ? tx.objectStore(SESSION_FRAME_SAMPLES_STORE)
        : db.createObjectStore(SESSION_FRAME_SAMPLES_STORE, { keyPath: "id" });
      ensureIndex(frameSamplesStore, "sessionId", "sessionId");
      ensureIndex(frameSamplesStore, "exerciseId", "exerciseId");
      ensureIndex(frameSamplesStore, "phase", "phase");
      ensureIndex(frameSamplesStore, "ts", "ts");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
    request.onblocked = () => {
      dbPromise = null;
      reject(new Error("IndexedDB upgrade was blocked"));
    };
  });

  return dbPromise;
}

function createRecordId(prefix) {
  const value = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${value}`;
}

function imageRecordId(sessionId, role, scoreIndex, repIndex = "base") {
  return `${sessionId}:${role}:${scoreIndex}:${repIndex}`;
}

function snapshotCountForStorage(score) {
  if (Array.isArray(score?.snapshots)) return score.snapshots.length;
  return Number.isFinite(score?.snapshotCount) ? score.snapshotCount : 0;
}

function compactExerciseScoreForStorage(score) {
  if (!score || typeof score !== "object") return score;
  const compactScore = { ...score };
  const baselineSnapshot = compactScore.baselineSnapshot;
  delete compactScore.baselineSnapshot;
  delete compactScore.snapshots;
  const snapshotCount = snapshotCountForStorage(score);
  if (snapshotCount > 0) compactScore.snapshotCount = snapshotCount;
  if (baselineSnapshot || score.hasBaselineSnapshot) compactScore.hasBaselineSnapshot = true;
  return compactScore;
}

function compactSessionForStorage(session) {
  if (!session || typeof session !== "object") return session;
  const { baselineSnapshot, frameSamples, scores, ...compactSession } = session;
  if (Array.isArray(scores)) compactSession.scores = scores.map(compactExerciseScoreForStorage);
  else if (scores !== undefined) compactSession.scores = scores;

  const snapshotCount = Array.isArray(scores)
    ? scores.reduce((sum, score) => sum + snapshotCountForStorage(score), 0)
    : Number.isFinite(session.snapshotCount) ? session.snapshotCount : 0;
  if (snapshotCount > 0) compactSession.snapshotCount = snapshotCount;
  if (baselineSnapshot || session.hasBaselineSnapshot) compactSession.hasBaselineSnapshot = true;
  const frameSampleCount = Array.isArray(frameSamples) ? frameSamples.length : session.frameSampleCount;
  if (Number.isFinite(frameSampleCount) && frameSampleCount > 0) compactSession.frameSampleCount = frameSampleCount;
  return compactSession;
}

export function compactAppDataForStorage(next = {}) {
  return {
    ...next,
    sessions: Array.isArray(next.sessions) ? next.sessions.map(compactSessionForStorage) : [],
  };
}

function parseDataUrlMime(dataUrl) {
  const match = /^data:([^;,]+)[;,]/.exec(dataUrl);
  return match?.[1] ?? "image/jpeg";
}

async function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return null;
  const response = await fetch(dataUrl);
  return response.blob();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function makeImageRecord({ id, sessionId, exerciseId, role, scoreIndex, repIndex = null, score = null, ts = null, dataUrl, now }) {
  const blob = await dataUrlToBlob(dataUrl);
  if (!blob) return null;
  return {
    id,
    sessionId,
    exerciseId: exerciseId ?? "",
    role,
    scoreIndex,
    repIndex,
    score,
    ts,
    mime: parseDataUrlMime(dataUrl),
    blob,
    createdAt: now,
    updatedAt: now,
    syncStatus: "local",
  };
}

function makeFrameSampleRecord({ sessionId, sample, index, now }) {
  if (!sample || typeof sample !== "object") return null;
  return {
    ...sample,
    id: `${sessionId}:frame:${index}`,
    sessionId,
    exerciseId: sample.exerciseId ?? "",
    phase: sample.phase ?? "",
    ts: sample.ts ?? now,
    sampleIndex: index,
    createdAt: now,
    updatedAt: now,
    syncStatus: "local",
  };
}

async function prepareScoreForIndexedDb(score, sessionId, scoreIndex, now) {
  const compactScore = compactExerciseScoreForStorage(score) ?? {};
  const images = [];
  const exerciseId = score?.exerciseId ?? "";

  if (typeof score?.baselineSnapshot === "string") {
    const baselineImageId = imageRecordId(sessionId, "baseline", scoreIndex);
    const image = await makeImageRecord({
      id: baselineImageId,
      sessionId,
      exerciseId,
      role: "baseline",
      scoreIndex,
      dataUrl: score.baselineSnapshot,
      now,
    });
    if (image) {
      images.push(image);
      compactScore.baselineImageId = baselineImageId;
      compactScore.hasBaselineSnapshot = true;
    }
  }

  const snapshotRefs = [];
  if (Array.isArray(score?.snapshots)) {
    for (const [repIndex, snap] of score.snapshots.entries()) {
      if (typeof snap?.dataUrl !== "string") continue;
      const id = imageRecordId(sessionId, "rep", scoreIndex, repIndex);
      const image = await makeImageRecord({
        id,
        sessionId,
        exerciseId,
        role: "rep",
        scoreIndex,
        repIndex,
        score: snap.score ?? null,
        ts: snap.ts ?? now,
        dataUrl: snap.dataUrl,
        now,
      });
      if (image) {
        images.push(image);
        snapshotRefs.push({ id, repIndex, score: snap.score ?? null, ts: snap.ts ?? now });
      }
    }
  }

  if (snapshotRefs.length > 0) {
    compactScore.snapshotRefs = snapshotRefs;
    compactScore.snapshotCount = snapshotRefs.length;
  }

  return { score: compactScore, images };
}

async function prepareSessionForIndexedDb(session, now) {
  const sessionId = session?.id ?? createRecordId("session");
  const compactSession = compactSessionForStorage(session);
  compactSession.id = sessionId;
  compactSession.createdAt = session?.createdAt ?? session?.ts ?? now;
  compactSession.updatedAt = now;
  compactSession.syncStatus = session?.syncStatus ?? "local";

  const images = [];
  const frameSamples = [];
  let hasExerciseBaseline = false;

  if (Array.isArray(session?.scores)) {
    const scores = [];
    for (const [scoreIndex, score] of session.scores.entries()) {
      const prepared = await prepareScoreForIndexedDb(score, sessionId, scoreIndex, now);
      if (prepared.score?.hasBaselineSnapshot) hasExerciseBaseline = true;
      scores.push(prepared.score);
      images.push(...prepared.images);
    }
    compactSession.scores = scores;
  }

  if (!hasExerciseBaseline && typeof session?.baselineSnapshot === "string") {
    const baselineImageId = imageRecordId(sessionId, "sessionBaseline", "session");
    const image = await makeImageRecord({
      id: baselineImageId,
      sessionId,
      exerciseId: "",
      role: "sessionBaseline",
      scoreIndex: null,
      dataUrl: session.baselineSnapshot,
      now,
    });
    if (image) {
      images.push(image);
      compactSession.baselineImageId = baselineImageId;
      compactSession.hasBaselineSnapshot = true;
    }
  }

  if (Array.isArray(session?.frameSamples)) {
    for (const [index, sample] of session.frameSamples.entries()) {
      const record = makeFrameSampleRecord({ sessionId, sample, index, now });
      if (record) frameSamples.push(record);
    }
    if (frameSamples.length > 0) compactSession.frameSampleCount = frameSamples.length;
  }

  compactSession.imageCount = images.length || compactSession.imageCount || 0;
  return { session: compactSession, images, frameSamples };
}

function buildAppStateRecord(data, now) {
  const appState = { ...(data ?? {}) };
  delete appState.sessions;
  return {
    id: APP_STATE_ID,
    schemaVersion: SCHEMA_VERSION,
    ...appState,
    createdAt: appState.createdAt ?? now,
    updatedAt: now,
    syncStatus: appState.syncStatus ?? "local",
  };
}

function appStateRecordToData(record) {
  if (!record) return null;
  const data = { ...record };
  delete data.id;
  delete data.schemaVersion;
  delete data.createdAt;
  delete data.updatedAt;
  delete data.syncStatus;
  delete data.cloudId;
  return data;
}

async function prepareDataForIndexedDb(next) {
  const now = Date.now();
  const appState = buildAppStateRecord(next, now);
  const sessions = [];
  const images = [];
  const frameSamples = [];

  for (const session of next?.sessions ?? []) {
    const prepared = await prepareSessionForIndexedDb(session, now);
    sessions.push(prepared.session);
    images.push(...prepared.images);
    frameSamples.push(...prepared.frameSamples);
  }

  return {
    appState,
    sessions,
    images,
    frameSamples,
    data: { ...appStateRecordToData(appState), sessions },
  };
}

function collectReferencedImageIds(sessions = []) {
  const ids = new Set();
  for (const session of sessions) {
    if (session?.baselineImageId) ids.add(session.baselineImageId);
    for (const score of session?.scores ?? []) {
      if (score?.baselineImageId) ids.add(score.baselineImageId);
      for (const ref of score?.snapshotRefs ?? []) {
        if (ref?.id) ids.add(ref.id);
      }
    }
  }
  return ids;
}

async function readReferencedSessionImages(db, referencedIds, replacementIds) {
  if (!referencedIds.size) return [];
  const tx = db.transaction(SESSION_IMAGES_STORE, "readonly");
  const done = transactionDone(tx);
  const request = tx.objectStore(SESSION_IMAGES_STORE).getAll();
  const images = await requestToPromise(request);
  await done;
  return images.filter((image) => referencedIds.has(image.id) && !replacementIds.has(image.id));
}

async function readReferencedFrameSamples(db, referencedSessionIds, replacementSessionIds) {
  if (!referencedSessionIds.size || !db.objectStoreNames.contains(SESSION_FRAME_SAMPLES_STORE)) return [];
  const tx = db.transaction(SESSION_FRAME_SAMPLES_STORE, "readonly");
  const done = transactionDone(tx);
  const request = tx.objectStore(SESSION_FRAME_SAMPLES_STORE).getAll();
  const samples = await requestToPromise(request);
  await done;
  return samples.filter((sample) => referencedSessionIds.has(sample.sessionId) && !replacementSessionIds.has(sample.sessionId));
}

async function writePreparedDataToIndexedDb(prepared) {
  const db = await openMirrorDb();
  const referencedIds = collectReferencedImageIds(prepared.sessions);
  const replacementIds = new Set(prepared.images.map((image) => image.id));
  const referencedSessionIds = new Set(prepared.sessions.map((session) => session.id).filter(Boolean));
  const replacementFrameSampleSessionIds = new Set(prepared.frameSamples.map((sample) => sample.sessionId).filter(Boolean));
  const preservedImages = await readReferencedSessionImages(db, referencedIds, replacementIds);
  const preservedFrameSamples = await readReferencedFrameSamples(db, referencedSessionIds, replacementFrameSampleSessionIds);
  const tx = db.transaction([APP_STATE_STORE, SESSIONS_STORE, SESSION_IMAGES_STORE, SESSION_FRAME_SAMPLES_STORE], "readwrite");
  const done = transactionDone(tx);
  tx.objectStore(APP_STATE_STORE).put(prepared.appState);
  const sessionsStore = tx.objectStore(SESSIONS_STORE);
  const imagesStore = tx.objectStore(SESSION_IMAGES_STORE);
  const frameSamplesStore = tx.objectStore(SESSION_FRAME_SAMPLES_STORE);
  sessionsStore.clear();
  frameSamplesStore.clear();
  for (const session of prepared.sessions) sessionsStore.put(session);
  for (const image of prepared.images) imagesStore.put(image);
  for (const image of preservedImages) imagesStore.put(image);
  for (const sample of prepared.frameSamples) frameSamplesStore.put(sample);
  for (const sample of preservedFrameSamples) frameSamplesStore.put(sample);
  await done;
}

async function readDataFromIndexedDb() {
  const db = await openMirrorDb();
  const tx = db.transaction([APP_STATE_STORE, SESSIONS_STORE], "readonly");
  const done = transactionDone(tx);
  const appStateRequest = tx.objectStore(APP_STATE_STORE).get(APP_STATE_ID);
  const sessionsRequest = tx.objectStore(SESSIONS_STORE).getAll();
  const appState = await requestToPromise(appStateRequest);
  const sessions = await requestToPromise(sessionsRequest);
  await done;
  if (!appState && sessions.length === 0) return null;
  return {
    ...(appStateRecordToData(appState) ?? {}),
    sessions: sessions.sort((a, b) => (a.ts ?? a.createdAt ?? 0) - (b.ts ?? b.createdAt ?? 0)),
  };
}

function readLegacyStorage() {
  try {
    const value = localStorage.getItem(LEGACY_STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeLegacyStorage(data) {
  localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(compactAppDataForStorage(data)));
}

function removeLegacyStorage() {
  try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* best effort cleanup */ }
}

function plainRecord(record) {
  if (!record || typeof record !== "object") return null;
  return { ...record };
}

function recordArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(plainRecord).filter(Boolean);
}

async function readIndexedDbStores(storeNames) {
  const db = await openMirrorDb();
  const names = storeNames.filter((name) => db.objectStoreNames.contains(name));
  if (names.length === 0) return {};
  const tx = db.transaction(names, "readonly");
  const done = transactionDone(tx);
  const requests = Object.fromEntries(names.map((name) => [name, tx.objectStore(name).getAll()]));
  const entries = await Promise.all(Object.entries(requests).map(async ([name, request]) => [name, await requestToPromise(request)]));
  await done;
  return Object.fromEntries(entries);
}

async function exportImageRecord(record) {
  if (!record || typeof record !== "object") return null;
  const { blob, ...rest } = record;
  const dataUrl = typeof record.dataUrl === "string"
    ? record.dataUrl
    : blob
      ? await blobToDataUrl(blob)
      : null;
  return dataUrl ? { ...rest, dataUrl } : { ...rest };
}

function browserDataSummary(stores) {
  const appState = recordArray(stores.appState).find((record) => record.id === APP_STATE_ID) ?? recordArray(stores.appState)[0] ?? null;
  const sessionImages = recordArray(stores.sessionImages);
  const sessionFrameSamples = recordArray(stores.sessionFrameSamples);
  return {
    sessions: recordArray(stores.sessions).length,
    assessments: Array.isArray(appState?.assessments) ? appState.assessments.length : 0,
    sessionImages: sessionImages.length,
    sessionFrameSamples: sessionFrameSamples.length,
    journalEntries: Array.isArray(appState?.journal) ? appState.journal.length : 0,
    hasMovementProfile: Boolean(appState?.movementProfile),
  };
}

export async function exportMirrorBrowserData() {
  const stores = await readIndexedDbStores([APP_STATE_STORE, SESSIONS_STORE, SESSION_IMAGES_STORE, SESSION_FRAME_SAMPLES_STORE]);
  const appState = recordArray(stores[APP_STATE_STORE]);
  const sessions = recordArray(stores[SESSIONS_STORE]);
  const sessionFrameSamples = recordArray(stores[SESSION_FRAME_SAMPLES_STORE]);
  const sessionImages = [];
  for (const image of recordArray(stores[SESSION_IMAGES_STORE])) {
    const exported = await exportImageRecord(image);
    if (exported) sessionImages.push(exported);
  }

  const exportStores = { appState, sessions, sessionImages, sessionFrameSamples };
  return {
    kind: EXPORT_KIND,
    appId: EXPORT_APP_ID,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    storage: {
      dbName: DB_NAME,
      dbVersion: DB_VERSION,
      schemaVersion: SCHEMA_VERSION,
    },
    summary: browserDataSummary(exportStores),
    stores: exportStores,
    legacyData: readLegacyStorage(),
  };
}

export function createMirrorBrowserDataExportBlob(payload) {
  const manifest = {
    kind: EXPORT_LINES_KIND,
    appId: payload?.appId ?? EXPORT_APP_ID,
    version: payload?.version ?? EXPORT_VERSION,
    exportedAt: payload?.exportedAt ?? new Date().toISOString(),
    storage: payload?.storage ?? { dbName: DB_NAME, dbVersion: DB_VERSION, schemaVersion: SCHEMA_VERSION },
    summary: payload?.summary ?? browserDataSummary(payload?.stores ?? {}),
  };
  const parts = [JSON.stringify(manifest), "\n"];
  for (const store of [APP_STATE_STORE, SESSIONS_STORE, SESSION_IMAGES_STORE, SESSION_FRAME_SAMPLES_STORE]) {
    for (const record of recordArray(payload?.stores?.[store])) {
      parts.push(JSON.stringify({ store, record }), "\n");
    }
  }
  if (payload?.legacyData) parts.push(JSON.stringify({ store: "legacyData", record: payload.legacyData }), "\n");
  return new Blob(parts, { type: "application/x-ndjson" });
}

async function parseMirrorBrowserDataLines(file) {
  const stores = { appState: [], sessions: [], sessionImages: [], sessionFrameSamples: [] };
  let manifest = null;
  let legacyData = null;
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const parseLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const parsed = JSON.parse(trimmed);
    if (parsed.kind === EXPORT_LINES_KIND) {
      manifest = parsed;
      return;
    }
    if (parsed.store === "legacyData") {
      legacyData = parsed.record ?? null;
      return;
    }
    if (Object.prototype.hasOwnProperty.call(stores, parsed.store) && parsed.record && typeof parsed.record === "object") {
      stores[parsed.store].push(parsed.record);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let lineEnd = buffer.indexOf("\n");
    while (lineEnd >= 0) {
      parseLine(buffer.slice(0, lineEnd));
      buffer = buffer.slice(lineEnd + 1);
      lineEnd = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  parseLine(buffer);

  if (!manifest) throw new Error("Choose a Mirror browser data JSON export.");
  return {
    ...manifest,
    kind: EXPORT_KIND,
    stores,
    legacyData,
  };
}

export async function parseMirrorBrowserDataFile(file) {
  const firstChunk = await file.slice(0, 512).text();
  const isLineExport = file.name?.toLowerCase().endsWith(".jsonl")
    || firstChunk.includes(`"kind":"${EXPORT_LINES_KIND}"`)
    || firstChunk.includes(`"kind": "${EXPORT_LINES_KIND}"`);
  if (isLineExport) return parseMirrorBrowserDataLines(file);
  return JSON.parse(await file.text());
}

function importedStoresFromPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const stores = payload.stores ?? payload.data?.stores ?? null;
  if (!stores || typeof stores !== "object") return null;
  const hasKnownStoreShape = payload.kind === EXPORT_KIND
    || payload.appId === EXPORT_APP_ID
    || Array.isArray(stores.appState)
    || Array.isArray(stores.sessions)
    || Array.isArray(stores.sessionImages)
    || Array.isArray(stores.sessionFrameSamples)
    || Array.isArray(stores.images)
    || Array.isArray(stores.frameSamples);
  if (!hasKnownStoreShape) return null;
  return {
    appState: recordArray(Array.isArray(stores.appState) ? stores.appState : [stores.appState].filter(Boolean)),
    sessions: recordArray(stores.sessions),
    sessionImages: recordArray(stores.sessionImages ?? stores.images),
    sessionFrameSamples: recordArray(stores.sessionFrameSamples ?? stores.frameSamples),
  };
}

function appDataFromImportedPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.kind === EXPORT_KIND) return payload.legacyData ?? payload.appData ?? payload.data?.appData ?? null;
  if (payload.appData && typeof payload.appData === "object") return payload.appData;
  if (payload.data?.appData && typeof payload.data.appData === "object") return payload.data.appData;
  if (Array.isArray(payload.sessions) || Array.isArray(payload.journal) || payload.prefs || payload.movementProfile) return payload;
  return null;
}

function normalizeImportedAppStateRecords(records, now) {
  return records.map((record, index) => ({
    ...record,
    id: record.id ?? (index === 0 ? APP_STATE_ID : createRecordId("appState")),
    schemaVersion: record.schemaVersion ?? SCHEMA_VERSION,
    createdAt: record.createdAt ?? now,
    updatedAt: now,
    syncStatus: record.syncStatus ?? "local",
  }));
}

function normalizeImportedSessionRecords(records, now) {
  return records.map((record) => ({
    ...record,
    id: record.id ?? createRecordId("session"),
    createdAt: record.createdAt ?? record.ts ?? now,
    updatedAt: now,
    syncStatus: record.syncStatus ?? "local",
  }));
}

function normalizeImportedFrameSampleRecords(records, now) {
  return records.map((record, index) => {
    const sessionId = record.sessionId ?? "";
    return {
      ...record,
      id: record.id ?? `${sessionId}:frame:${index}`,
      sessionId,
      exerciseId: record.exerciseId ?? "",
      phase: record.phase ?? "",
      ts: record.ts ?? now,
      createdAt: record.createdAt ?? now,
      updatedAt: now,
      syncStatus: record.syncStatus ?? "local",
    };
  });
}

async function normalizeImportedImageRecords(records, now) {
  const images = [];
  for (const record of records) {
    const { dataUrl, blob, ...rest } = record;
    const imageBlob = blob ?? (typeof dataUrl === "string" ? await dataUrlToBlob(dataUrl) : null);
    if (!imageBlob) continue;
    images.push({
      ...rest,
      id: rest.id ?? createRecordId("image"),
      sessionId: rest.sessionId ?? "",
      exerciseId: rest.exerciseId ?? "",
      role: rest.role ?? "",
      scoreIndex: Number.isInteger(rest.scoreIndex) ? rest.scoreIndex : null,
      repIndex: Number.isInteger(rest.repIndex) ? rest.repIndex : null,
      mime: rest.mime ?? (typeof dataUrl === "string" ? parseDataUrlMime(dataUrl) : "image/jpeg"),
      blob: imageBlob,
      createdAt: rest.createdAt ?? now,
      updatedAt: now,
      syncStatus: rest.syncStatus ?? "local",
    });
  }
  return images;
}

async function replaceIndexedDbStores({ appState, sessions, sessionImages, sessionFrameSamples }) {
  const db = await openMirrorDb();
  const tx = db.transaction([APP_STATE_STORE, SESSIONS_STORE, SESSION_IMAGES_STORE, SESSION_FRAME_SAMPLES_STORE], "readwrite");
  const done = transactionDone(tx);
  const appStateStore = tx.objectStore(APP_STATE_STORE);
  const sessionsStore = tx.objectStore(SESSIONS_STORE);
  const imagesStore = tx.objectStore(SESSION_IMAGES_STORE);
  const frameSamplesStore = tx.objectStore(SESSION_FRAME_SAMPLES_STORE);
  appStateStore.clear();
  sessionsStore.clear();
  imagesStore.clear();
  frameSamplesStore.clear();
  for (const record of appState) appStateStore.put(record);
  for (const record of sessions) sessionsStore.put(record);
  for (const record of sessionImages) imagesStore.put(record);
  for (const record of sessionFrameSamples) frameSamplesStore.put(record);
  await done;
}

async function replacePreparedDataInIndexedDb(prepared) {
  await replaceIndexedDbStores({
    appState: [prepared.appState],
    sessions: prepared.sessions,
    sessionImages: prepared.images,
    sessionFrameSamples: prepared.frameSamples,
  });
}

export async function importMirrorBrowserData(payload) {
  const now = Date.now();
  const stores = importedStoresFromPayload(payload);
  const appData = appDataFromImportedPayload(payload);
  const hasStoreRecords = stores && (
    stores.appState.length > 0
    || stores.sessions.length > 0
    || stores.sessionImages.length > 0
    || stores.sessionFrameSamples.length > 0
  );
  if (stores && (hasStoreRecords || !appData)) {
    const appState = normalizeImportedAppStateRecords(stores.appState, now);
    const sessions = normalizeImportedSessionRecords(stores.sessions, now);
    const sessionImages = await normalizeImportedImageRecords(stores.sessionImages, now);
    const sessionFrameSamples = normalizeImportedFrameSampleRecords(stores.sessionFrameSamples, now);
    await replaceIndexedDbStores({ appState, sessions, sessionImages, sessionFrameSamples });
    removeLegacyStorage();
    return await readDataFromIndexedDb() ?? { sessions: [] };
  }

  if (!appData) throw new Error("Choose a Mirror browser data JSON export.");
  const prepared = await prepareDataForIndexedDb(appData);
  await replacePreparedDataInIndexedDb(prepared);
  removeLegacyStorage();
  return prepared.data;
}

function sessionSignature(session) {
  if (!session || typeof session !== "object") return "";
  const exerciseIds = Array.isArray(session.exercises) ? session.exercises.join(",") : "";
  const scoreSig = Array.isArray(session.scores)
    ? session.scores.map((score) => `${score.exerciseId ?? ""}:${score.scores?.length ?? 0}:${score.avg ?? ""}`).join(";")
    : "";
  return [session.ts ?? "", session.date ?? "", session.duration ?? "", session.sessionAvg ?? "", exerciseIds, scoreSig].join("|");
}

function sessionImageWeight(session) {
  if (!session || typeof session !== "object") return 0;
  const topLevel = (session.baselineSnapshot || session.baselineImageId || session.hasBaselineSnapshot ? 1 : 0) + (session.imageCount ?? 0);
  const scoreLevel = Array.isArray(session.scores)
    ? session.scores.reduce((sum, score) => {
        const baseline = score?.baselineSnapshot || score?.baselineImageId || score?.hasBaselineSnapshot ? 1 : 0;
        const snapshots = Array.isArray(score?.snapshots) ? score.snapshots.length : (score?.snapshotCount ?? 0);
        return sum + baseline + snapshots;
      }, 0)
    : 0;
  return topLevel + scoreLevel;
}

function richerSession(current, candidate) {
  if (!current) return candidate;
  return sessionImageWeight(candidate) > sessionImageWeight(current) ? candidate : current;
}

function mergeSessions(primary = [], legacy = []) {
  const merged = new Map();
  const signatureToKey = new Map();

  for (const session of [...primary, ...legacy]) {
    const signature = sessionSignature(session);
    const key = session?.id || signature || createRecordId("session");
    const existingKey = (session?.id && merged.has(session.id)) ? session.id : signatureToKey.get(signature);
    if (existingKey) {
      merged.set(existingKey, richerSession(merged.get(existingKey), session));
      continue;
    }
    merged.set(key, session);
    if (signature) signatureToKey.set(signature, key);
  }

  return Array.from(merged.values()).sort((a, b) => (a?.ts ?? a?.createdAt ?? 0) - (b?.ts ?? b?.createdAt ?? 0));
}

function mergeJournal(primary = [], legacy = []) {
  const byDate = new Map();
  for (const entry of legacy) if (entry?.date) byDate.set(entry.date, entry);
  for (const entry of primary) if (entry?.date) byDate.set(entry.date, entry);
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function mergeMirrorData(primary, legacy) {
  if (!primary) return legacy;
  if (!legacy) return primary;
  return {
    ...legacy,
    ...primary,
    prefs: { ...(legacy.prefs ?? {}), ...(primary.prefs ?? {}) },
    journal: mergeJournal(primary.journal, legacy.journal),
    sessions: mergeSessions(primary.sessions, legacy.sessions),
    movementProfile: primary.movementProfile ?? legacy.movementProfile ?? null,
    initialMovementProfile: primary.initialMovementProfile ?? legacy.initialMovementProfile ?? null,
    movementProfileHistory: Array.isArray(primary.movementProfileHistory) && primary.movementProfileHistory.length > 0
      ? primary.movementProfileHistory
      : legacy.movementProfileHistory,
  };
}

export async function loadMirrorData() {
  try {
    const indexedData = await readDataFromIndexedDb();
    const legacyData = readLegacyStorage();
    if (indexedData && legacyData) {
      const merged = mergeMirrorData(indexedData, legacyData);
      const prepared = await prepareDataForIndexedDb(merged);
      await writePreparedDataToIndexedDb(prepared);
      removeLegacyStorage();
      return prepared.data;
    }
    if (indexedData) return indexedData;
    if (!legacyData) return null;

    const prepared = await prepareDataForIndexedDb(legacyData);
    await writePreparedDataToIndexedDb(prepared);
    removeLegacyStorage();
    return prepared.data;
  } catch (error) {
    console.error("Failed to load IndexedDB storage, using legacy storage", error);
    const legacyData = readLegacyStorage();
    return legacyData ? compactAppDataForStorage(legacyData) : null;
  }
}

export async function saveMirrorData(next) {
  try {
    const prepared = await prepareDataForIndexedDb(next);
    await writePreparedDataToIndexedDb(prepared);
    removeLegacyStorage();
    return prepared.data;
  } catch (error) {
    console.error("Failed to persist IndexedDB storage, using legacy storage", error);
    const compactData = compactAppDataForStorage(next);
    writeLegacyStorage(compactData);
    return compactData;
  }
}

export async function deleteSessionImages(sessionId) {
  if (!sessionId) return;
  try {
    const db = await openMirrorDb();
    const tx = db.transaction(SESSION_IMAGES_STORE, "readwrite");
    const done = transactionDone(tx);
    const store = tx.objectStore(SESSION_IMAGES_STORE);
    const keysRequest = store.index("sessionId").getAllKeys(sessionId);
    const keys = await requestToPromise(keysRequest);
    for (const key of keys) store.delete(key);
    await done;
  } catch (error) {
    // Orphaned blobs are a storage cost only, not a correctness issue, so deletion
    // is best-effort — the next save still drops the session record itself.
    console.error("Failed to delete session images", error);
  }
}

export async function deleteSessionFrameSamples(sessionId) {
  if (!sessionId) return;
  try {
    const db = await openMirrorDb();
    if (!db.objectStoreNames.contains(SESSION_FRAME_SAMPLES_STORE)) return;
    const tx = db.transaction(SESSION_FRAME_SAMPLES_STORE, "readwrite");
    const done = transactionDone(tx);
    const store = tx.objectStore(SESSION_FRAME_SAMPLES_STORE);
    const keysRequest = store.index("sessionId").getAllKeys(sessionId);
    const keys = await requestToPromise(keysRequest);
    for (const key of keys) store.delete(key);
    await done;
  } catch (error) {
    console.error("Failed to delete session frame samples", error);
  }
}

async function readImagesForSession(sessionId) {
  const db = await openMirrorDb();
  const tx = db.transaction(SESSION_IMAGES_STORE, "readonly");
  const done = transactionDone(tx);
  const imagesRequest = tx.objectStore(SESSION_IMAGES_STORE).index("sessionId").getAll(sessionId);
  const images = await requestToPromise(imagesRequest);
  await done;
  return images.sort((a, b) => {
    const scoreDelta = (a.scoreIndex ?? -1) - (b.scoreIndex ?? -1);
    if (scoreDelta !== 0) return scoreDelta;
    return (a.repIndex ?? -1) - (b.repIndex ?? -1);
  });
}

function targetScoreForImage(scores, image) {
  if (Number.isInteger(image.scoreIndex) && scores[image.scoreIndex]) return scores[image.scoreIndex];
  return scores.find((score) => score.exerciseId === image.exerciseId) ?? null;
}

export async function hydrateSessionImages(session) {
  if (!session?.id) return session;
  try {
    const images = await readImagesForSession(session.id);
    if (images.length === 0) return session;

    const hydrated = {
      ...session,
      scores: Array.isArray(session.scores) ? session.scores.map((score) => ({ ...score })) : [],
    };

    for (const image of images) {
      const dataUrl = await blobToDataUrl(image.blob);
      if (image.role === "sessionBaseline") {
        hydrated.baselineSnapshot = dataUrl;
        continue;
      }

      const score = targetScoreForImage(hydrated.scores, image);
      if (!score) continue;
      if (image.role === "baseline") {
        score.baselineSnapshot = dataUrl;
        continue;
      }
      if (image.role === "rep") {
        const repIndex = Number.isInteger(image.repIndex) ? image.repIndex : (score.snapshots?.length ?? 0);
        const snapshots = Array.isArray(score.snapshots) ? [...score.snapshots] : [];
        snapshots[repIndex] = { ts: image.ts ?? image.createdAt, score: image.score, dataUrl };
        score.snapshots = snapshots;
      }
    }

    hydrated.scores = hydrated.scores.map((score) => (
      Array.isArray(score.snapshots)
        ? { ...score, snapshots: score.snapshots.filter(Boolean) }
        : score
    ));

    return hydrated;
  } catch (error) {
    console.error("Failed to hydrate session images", error);
    return session;
  }
}
