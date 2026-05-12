const DB_NAME = "mirror-db";
const DB_VERSION = 1;
const APP_STATE_STORE = "appState";
const SESSIONS_STORE = "sessions";
const SESSION_IMAGES_STORE = "sessionImages";
const APP_STATE_ID = "state";
const SCHEMA_VERSION = 1;
const LEGACY_STORAGE_KEY = "mirror-app-data";

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
  const { baselineSnapshot, scores, ...compactSession } = session;
  if (Array.isArray(scores)) compactSession.scores = scores.map(compactExerciseScoreForStorage);
  else if (scores !== undefined) compactSession.scores = scores;

  const snapshotCount = Array.isArray(scores)
    ? scores.reduce((sum, score) => sum + snapshotCountForStorage(score), 0)
    : Number.isFinite(session.snapshotCount) ? session.snapshotCount : 0;
  if (snapshotCount > 0) compactSession.snapshotCount = snapshotCount;
  if (baselineSnapshot || session.hasBaselineSnapshot) compactSession.hasBaselineSnapshot = true;
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

  compactSession.imageCount = images.length || compactSession.imageCount || 0;
  return { session: compactSession, images };
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

  for (const session of next?.sessions ?? []) {
    const prepared = await prepareSessionForIndexedDb(session, now);
    sessions.push(prepared.session);
    images.push(...prepared.images);
  }

  return {
    appState,
    sessions,
    images,
    data: { ...appStateRecordToData(appState), sessions },
  };
}

async function writePreparedDataToIndexedDb(prepared) {
  const db = await openMirrorDb();
  const tx = db.transaction([APP_STATE_STORE, SESSIONS_STORE, SESSION_IMAGES_STORE], "readwrite");
  const done = transactionDone(tx);
  tx.objectStore(APP_STATE_STORE).put(prepared.appState);
  const sessionsStore = tx.objectStore(SESSIONS_STORE);
  const imagesStore = tx.objectStore(SESSION_IMAGES_STORE);
  sessionsStore.clear();
  for (const session of prepared.sessions) sessionsStore.put(session);
  for (const image of prepared.images) imagesStore.put(image);
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
