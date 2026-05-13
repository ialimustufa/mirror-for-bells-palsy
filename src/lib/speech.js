import embeddedCueManifest from "../generated/audioCueManifest";

const DEDUPE_MS = 850;
const CANCEL_SETTLE_MS = 120;
const NO_START_MS = 1800;
const RESUME_PULSE_MS = 900;
const VOICE_LOAD_TIMEOUT_MS = 1200;
const CUE_MANIFEST_PATH = "audio/cues/manifest.json";

let speechTimer = null;
let resumeTimer = null;
let lastSpeechText = "";
let lastSpeechAt = 0;
let cachedSpeechVoice = null;
let voiceLoadPromise = null;
let speechUnlocked = false;
let activeSpeechToken = 0;
let speechEngineHealthy = true;
let speechStallCount = 0;
let fallbackAudioContext = null;
let fallbackAudioUnlocked = false;
let cueManifestPromise = null;
let cueManifest = null;
const cueBufferCache = new Map();
const activeBufferSources = new Set();
const activeOscillators = new Set();
const activeHtmlAudio = new Set();

function recordSpeechEvent(type, detail = {}) {
  if (typeof console !== "undefined") {
    if (Object.keys(detail).length > 0) console.log(`[Mirror audio] ${type}`, detail);
    else console.log(`[Mirror audio] ${type}`);
  }
}

function isStaleToken(token) {
  return token != null && token !== activeSpeechToken;
}

function stopActiveAudio() {
  for (const item of activeBufferSources) {
    try { item.source.stop(); } catch { /* already stopped */ }
    try { item.source.disconnect(); } catch { /* already disconnected */ }
    try { item.gain?.disconnect(); } catch { /* already disconnected */ }
  }
  activeBufferSources.clear();

  for (const item of activeOscillators) {
    try { item.osc.stop(); } catch { /* already stopped */ }
    try { item.osc.disconnect(); } catch { /* already disconnected */ }
    try { item.gain?.disconnect(); } catch { /* already disconnected */ }
  }
  activeOscillators.clear();

  for (const item of activeHtmlAudio) {
    const audio = item.audio ?? item;
    try { audio.pause(); } catch { /* optional media API */ }
    try { audio.removeAttribute("src"); audio.load?.(); } catch { /* optional media API */ }
    try { item.cleanup?.(); } catch { /* optional media API */ }
  }
  activeHtmlAudio.clear();
}

function trackBufferSource(source, gain) {
  const item = { source, gain };
  activeBufferSources.add(item);
  source.onended = () => {
    activeBufferSources.delete(item);
    try { source.disconnect(); } catch { /* already disconnected */ }
    try { gain?.disconnect(); } catch { /* already disconnected */ }
  };
}

function trackOscillator(osc, gain) {
  const item = { osc, gain };
  activeOscillators.add(item);
  osc.onended = () => {
    activeOscillators.delete(item);
    try { osc.disconnect(); } catch { /* already disconnected */ }
    try { gain?.disconnect(); } catch { /* already disconnected */ }
  };
}

function trackHtmlAudio(audio) {
  const item = { audio, cleanup: null };
  const cleanup = () => {
    activeHtmlAudio.delete(item);
    audio.removeEventListener("ended", cleanup);
    audio.removeEventListener("pause", cleanup);
    audio.removeEventListener("error", cleanup);
  };
  item.cleanup = cleanup;
  activeHtmlAudio.add(item);
  audio.addEventListener("ended", cleanup);
  audio.addEventListener("pause", cleanup);
  audio.addEventListener("error", cleanup);
  return cleanup;
}

function getSpeechSynth() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

function isSpeechSupported() {
  return Boolean(getSpeechSynth() && typeof window.SpeechSynthesisUtterance === "function");
}

function normalizeCueText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function cueHash(text) {
  const normalized = normalizeCueText(text);
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function getPublicBaseUrl() {
  const viteBase = import.meta.env?.BASE_URL ?? "/";
  if (typeof window === "undefined") return viteBase;
  if (window.location.protocol === "file:") return new URL("./", window.location.href).href;
  return new URL(viteBase, window.location.origin).href;
}

function publicAssetUrl(path) {
  if (!path) return "";
  if (/^(https?:|data:|blob:|file:)/i.test(path)) return path;
  const cleanPath = String(path).replace(/^\/+/, "");
  return new URL(cleanPath, getPublicBaseUrl()).href;
}

function cueManifestUrls() {
  if (typeof window === "undefined") return [CUE_MANIFEST_PATH];
  return uniqueValues([
    publicAssetUrl(CUE_MANIFEST_PATH),
    new URL(CUE_MANIFEST_PATH, window.location.href).href,
    `/${CUE_MANIFEST_PATH}`,
    CUE_MANIFEST_PATH,
  ]);
}

function embeddedManifestCues() {
  return embeddedCueManifest?.cues ?? {};
}

function getFallbackAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  if (!fallbackAudioContext || fallbackAudioContext.state === "closed") {
    fallbackAudioContext = new AudioContext();
  }
  return fallbackAudioContext;
}

function unlockFallbackAudio() {
  const ctx = getFallbackAudioContext();
  if (!ctx) {
    recordSpeechEvent("fallback-audio-unavailable", { error: "AudioContext unavailable" });
    return false;
  }

  try {
    ctx.resume?.();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.025);

    fallbackAudioUnlocked = true;
    recordSpeechEvent("fallback-audio-unlocked", { state: ctx.state });
    return true;
  } catch {
    recordSpeechEvent("fallback-audio-error", { error: "AudioContext unlock failed" });
    return false;
  }
}

function loadCueManifest() {
  if (cueManifest) return Promise.resolve(cueManifest);
  if (cueManifestPromise) return cueManifestPromise;
  if (typeof fetch !== "function") {
    cueManifest = embeddedManifestCues();
    recordSpeechEvent("cue-manifest-embedded", { count: Object.keys(cueManifest).length, reason: "fetch unavailable" });
    return Promise.resolve(cueManifest);
  }

  cueManifestPromise = (async () => {
    const failures = [];

    for (const url of cueManifestUrls()) {
      try {
        const response = await fetch(url, { cache: "no-cache" });
        if (!response.ok) {
          failures.push(`${url} -> ${response.status}`);
          continue;
        }

        const manifest = await response.json();
        cueManifest = manifest?.cues ?? {};
        recordSpeechEvent("cue-manifest-loaded", { count: Object.keys(cueManifest).length, url });
        return cueManifest;
      } catch (error) {
        failures.push(`${url} -> ${error?.name ?? "fetch error"}: ${error?.message ?? "unknown"}`);
      }
    }

    cueManifest = embeddedManifestCues();
    recordSpeechEvent("cue-manifest-embedded", { count: Object.keys(cueManifest).length, failures });
    return cueManifest;
  })().finally(() => {
    cueManifestPromise = null;
  });

  return cueManifestPromise;
}

async function getCueBuffer(path) {
  const ctx = getFallbackAudioContext();
  if (!ctx) return null;
  if (cueBufferCache.has(path)) return cueBufferCache.get(path);

  const response = await fetch(path, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Cue fetch failed: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  cueBufferCache.set(path, buffer);
  return buffer;
}

async function playHtmlAudioCue(path, text, source, token = null) {
  if (typeof window === "undefined" || typeof window.Audio !== "function") return false;
  if (isStaleToken(token)) {
    recordSpeechEvent("html-audio-cue-skipped", { source, reason: "stale", text });
    return true;
  }

  let audio = null;
  let cleanup = null;
  try {
    audio = new window.Audio(path);
    audio.preload = "auto";
    audio.volume = 1;
    cleanup = trackHtmlAudio(audio);
    if (isStaleToken(token)) {
      cleanup();
      try { audio.pause(); } catch { /* optional media API */ }
      try { audio.removeAttribute("src"); audio.load?.(); } catch { /* optional media API */ }
      recordSpeechEvent("html-audio-cue-skipped", { source, reason: "stale", text });
      return true;
    }
    recordSpeechEvent("html-audio-cue-deliver", { source, path, text });
    await audio.play();
    recordSpeechEvent("html-audio-cue-play", { source, path, text });
    return true;
  } catch (error) {
    cleanup?.();
    if (audio) {
      try { audio.pause(); } catch { /* optional media API */ }
      try { audio.removeAttribute("src"); audio.load?.(); } catch { /* optional media API */ }
    }
    recordSpeechEvent("html-audio-cue-error", { source, path, text, error: error?.name ?? "play failed" });
    return false;
  }
}

async function playPrerenderedCue(text, source = "audio-cue", token = null) {
  const cleanText = normalizeCueText(text);
  if (!cleanText) return false;
  if (isStaleToken(token)) {
    recordSpeechEvent("audio-cue-skipped", { source, reason: "stale", text: cleanText });
    return true;
  }

  const ctx = getFallbackAudioContext();
  if (!ctx) return false;

  try {
    await ctx.resume?.();
    const manifest = await loadCueManifest();
    if (isStaleToken(token)) {
      recordSpeechEvent("audio-cue-skipped", { source, reason: "stale", text: cleanText });
      return true;
    }
    const cue = manifest[cueHash(cleanText)];
    const cuePath = typeof cue === "string" ? cue : cue?.path;
    if (!cuePath) {
      recordSpeechEvent("audio-cue-missing", { source, text: cleanText });
      return false;
    }
    const path = publicAssetUrl(cuePath);

    try {
      const buffer = await getCueBuffer(path);
      if (!buffer) return false;
      if (isStaleToken(token)) {
        recordSpeechEvent("audio-cue-skipped", { source, reason: "stale", text: cleanText });
        return true;
      }

      const node = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = 1;
      node.buffer = buffer;
      node.connect(gain);
      gain.connect(ctx.destination);
      trackBufferSource(node, gain);
      node.start(ctx.currentTime + 0.02);

      recordSpeechEvent("audio-cue-play", { source, path, text: cleanText });
      return true;
    } catch (error) {
      recordSpeechEvent("audio-cue-error", { source, path, text: cleanText, error: error?.name ?? "Web Audio cue failed" });
      return playHtmlAudioCue(path, cleanText, source, token);
    }
  } catch (error) {
    recordSpeechEvent("audio-cue-error", { source, text: cleanText, error: error?.name ?? "Unable to play pre-rendered cue" });
    return false;
  }
}

function playReliableFallback(text, source = "speech-fallback", token = activeSpeechToken) {
  playPrerenderedCue(text, source, token).then((played) => {
    if (!played && !isStaleToken(token)) playFallbackTone(source, token);
  }).catch((error) => {
    recordSpeechEvent("audio-fallback-error", { source, error: error?.name ?? "fallback failed" });
    if (!isStaleToken(token)) playFallbackTone(source, token);
  });
}

function playFallbackTone(source = "speech-fallback", token = null) {
  const ctx = getFallbackAudioContext();
  if (!ctx) {
    recordSpeechEvent("fallback-tone-skipped", { source, error: "AudioContext unavailable" });
    return false;
  }
  if (isStaleToken(token)) {
    recordSpeechEvent("fallback-tone-skipped", { source, reason: "stale" });
    return true;
  }

  try {
    ctx.resume?.();
    const start = ctx.currentTime + 0.02;
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = start + index * 0.16;

      osc.type = "triangle";
      osc.frequency.setValueAtTime(frequency, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      trackOscillator(osc, gain);
      osc.start(t);
      osc.stop(t + 0.16);
    });

    recordSpeechEvent("fallback-tone", { source, state: ctx.state });
    return true;
  } catch {
    recordSpeechEvent("fallback-tone-error", { source, error: "AudioContext tone failed" });
    return false;
  }
}

function playDiagnosticTone() {
  const ctx = getFallbackAudioContext();
  if (!ctx) {
    recordSpeechEvent("diagnostic-tone-skipped", { error: "AudioContext unavailable" });
    return { ok: false, reason: "unsupported" };
  }

  try {
    ctx.resume?.();
    const start = ctx.currentTime + 0.03;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(440, start);
    osc.frequency.setValueAtTime(660, start + 0.35);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.22, start + 0.04);
    gain.gain.setValueAtTime(0.22, start + 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.85);
    osc.connect(gain);
    gain.connect(ctx.destination);
    trackOscillator(osc, gain);
    osc.start(start);
    osc.stop(start + 0.9);

    recordSpeechEvent("diagnostic-tone", { state: ctx.state });
    return { ok: true, reason: ctx.state };
  } catch {
    recordSpeechEvent("diagnostic-tone-error", { error: "diagnostic tone failed" });
    return { ok: false, reason: "exception" };
  }
}

function markSpeechEngineStalled(source, text, token = activeSpeechToken) {
  if (isStaleToken(token)) return;
  speechEngineHealthy = false;
  speechStallCount += 1;
  recordSpeechEvent("speech-engine-stalled", { source, text });
  stopResumePump();
  try {
    const synth = getSpeechSynth();
    synth?.cancel?.();
    synth?.resume?.();
  } catch {
    // Browser speech implementations are inconsistent.
  }
  playReliableFallback(text, source, token);
}

function warmSpeechVoices() {
  const synth = getSpeechSynth();
  if (!synth) {
    recordSpeechEvent("voices-unavailable", { error: "speechSynthesis missing" });
    return Promise.resolve([]);
  }

  try {
    const voices = synth.getVoices?.() ?? [];
    if (voices.length > 0) {
      recordSpeechEvent("voices-ready", { count: voices.length });
      return Promise.resolve(voices);
    }
  } catch {
    recordSpeechEvent("voices-error", { error: "getVoices failed" });
    return Promise.resolve([]);
  }

  if (voiceLoadPromise) return voiceLoadPromise;

  const promise = new Promise((resolve) => {
    let done = false;
    let timeoutId = null;

    const finish = () => {
      if (done) return;
      done = true;
      if (timeoutId) clearTimeout(timeoutId);
      try { synth.removeEventListener?.("voiceschanged", finish); } catch { /* optional browser API */ }
      cachedSpeechVoice = null;
      try {
        const voices = synth.getVoices?.() ?? [];
        recordSpeechEvent("voices-loaded", { count: voices.length });
        resolve(voices);
      } catch {
        recordSpeechEvent("voices-error", { error: "getVoices failed after wait" });
        resolve([]);
      }
    };

    try { synth.addEventListener?.("voiceschanged", finish, { once: true }); } catch { /* optional browser API */ }
    timeoutId = setTimeout(finish, VOICE_LOAD_TIMEOUT_MS);
    try { synth.getVoices?.(); } catch { /* optional browser API */ }
  });

  voiceLoadPromise = promise.finally(() => {
    voiceLoadPromise = null;
  });
  return voiceLoadPromise;
}

function getSpeechVoice(synth) {
  if (cachedSpeechVoice) return cachedSpeechVoice;

  const voices = synth?.getVoices?.() ?? [];
  const englishVoices = voices.filter((voice) => /^en(-|_)?/i.test(voice.lang));
  cachedSpeechVoice =
    englishVoices.find((voice) => voice.localService && /^en[-_]US/i.test(voice.lang)) ||
    englishVoices.find((voice) => voice.localService) ||
    englishVoices.find((voice) => /samantha|alex|daniel|google|microsoft/i.test(voice.name)) ||
    englishVoices[0] ||
    voices[0] ||
    null;

  return cachedSpeechVoice;
}

function makeSpeechUtterance(text, options = {}) {
  if (typeof window === "undefined" || typeof window.SpeechSynthesisUtterance !== "function") return null;

  const synth = getSpeechSynth();
  const utterance = new window.SpeechSynthesisUtterance(text);
  const voice = options.usePreferredVoice === true ? getSpeechVoice(synth) : null;
  if (voice) utterance.voice = voice;
  utterance.rate = options.rate ?? 0.92;
  utterance.pitch = options.pitch ?? 1.0;
  utterance.volume = options.volume ?? 1.0;
  utterance.lang = options.lang ?? voice?.lang ?? "en-US";
  return utterance;
}

function clearSpeechTimer() {
  if (!speechTimer) return;
  clearTimeout(speechTimer);
  speechTimer = null;
}

function stopResumePump() {
  if (!resumeTimer) return;
  clearInterval(resumeTimer);
  resumeTimer = null;
}

function startResumePump(synth) {
  if (!synth) return;
  stopResumePump();

  const resume = () => {
    try {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") {
        synth.resume?.();
      }
    } catch {
      // Browser speech implementations are inconsistent.
    }
  };

  resume();
  resumeTimer = setInterval(resume, RESUME_PULSE_MS);
}

function settleSynthBeforeSpeak(synth) {
  try {
    if (synth.speaking || synth.pending) synth.cancel?.();
    synth.resume?.();
  } catch {
    // Browser speech implementations are inconsistent.
  }
}

function beginAudibleCue(synth = getSpeechSynth()) {
  activeSpeechToken += 1;
  const token = activeSpeechToken;
  clearSpeechTimer();
  stopResumePump();
  stopActiveAudio();
  if (synth) settleSynthBeforeSpeak(synth);
  return token;
}

function deliverSpeech(synth, request) {
  if (request.token !== activeSpeechToken) {
    recordSpeechEvent("speak-skipped", { reason: "superseded", text: request.text });
    return;
  }
  clearSpeechTimer();

  const utterance = makeSpeechUtterance(request.text, request.options);
  if (!utterance) {
    recordSpeechEvent("speak-failed", { error: "utterance unavailable", text: request.text });
    return;
  }
  request.started = false;

  utterance.onstart = () => {
    speechEngineHealthy = true;
    request.started = true;
    recordSpeechEvent("speak-start", { text: request.text });
    if (request.token === activeSpeechToken) startResumePump(synth);
  };
  utterance.onend = () => {
    recordSpeechEvent("speak-end", { text: request.text });
    if (request.token === activeSpeechToken) stopResumePump();
  };
  utterance.onerror = (event) => {
    if (request.token !== activeSpeechToken) return;

    stopResumePump();
    try { synth.resume?.(); } catch { /* optional browser API */ }

    const error = event?.error ?? "";
    recordSpeechEvent("speak-error", { error, text: request.text, retries: request.retries });
    const wasSuperseded = error === "canceled" || error === "interrupted";
    if (wasSuperseded || request.retries >= 1) return;

    request.retries += 1;
    settleSynthBeforeSpeak(synth);
    speechTimer = setTimeout(() => deliverSpeech(synth, request), CANCEL_SETTLE_MS);
  };

  try {
    synth.resume?.();
    recordSpeechEvent("speak-deliver", { text: request.text, retries: request.retries });
    synth.speak(utterance);
    startResumePump(synth);
    setTimeout(() => {
      if (request.token === activeSpeechToken && !request.started && !request.fallbackStarted) {
        request.fallbackStarted = true;
        recordSpeechEvent("speak-no-start", { error: "speechSynthesis accepted the utterance but did not fire onstart", text: request.text });
        markSpeechEngineStalled("speak-no-start", request.text, request.token);
      }
    }, NO_START_MS);
    setTimeout(() => {
      try { synth.resume?.(); } catch { /* optional browser API */ }
    }, 120);
  } catch {
    recordSpeechEvent("speak-exception", { error: "synth.speak threw", text: request.text });
    stopResumePump();
  }
}

function primeSpeech(enabled, options = {}) {
  const synth = getSpeechSynth();
  const audible = options.audible ?? true;
  const text = options.text ?? "Voice guidance ready.";

  if (!enabled) {
    recordSpeechEvent("prime-skipped", { reason: "disabled" });
    return { ok: false, reason: "disabled" };
  }
  speechUnlocked = true;
  unlockFallbackAudio();
  const token = beginAudibleCue(synth);

  if (options.preferAudioCue) {
    recordSpeechEvent("prime-audio-first", { text });
    playReliableFallback(text, "prime-audio-first", token);
    return { ok: true, reason: "audio-cue" };
  }

  if (!isSpeechSupported() || !synth) {
    recordSpeechEvent("prime-skipped", { reason: "unsupported", error: "Web Speech API unavailable" });
    playReliableFallback(text, "prime-unsupported", token);
    return { ok: false, reason: "unsupported" };
  }
  if (!speechEngineHealthy && !options.forceSpeech) {
    recordSpeechEvent("prime-fallback", { reason: "speech-engine-stalled", text });
    playReliableFallback(text, "prime-fallback", token);
    return { ok: true, reason: "fallback" };
  }

  cachedSpeechVoice = null;
  warmSpeechVoices();

  const utterance = makeSpeechUtterance(text, {
    rate: options.rate ?? 0.98,
    volume: audible ? (options.volume ?? 0.65) : 0.01,
  });
  if (!utterance) {
    recordSpeechEvent("prime-failed", { error: "utterance unavailable", text });
    return { ok: false, reason: "unsupported" };
  }
  lastSpeechText = text;
  lastSpeechAt = Date.now();
  let started = false;

  utterance.onstart = () => {
    speechEngineHealthy = true;
    started = true;
    recordSpeechEvent("prime-start", { text, audible });
    if (token === activeSpeechToken) startResumePump(synth);
  };
  utterance.onend = () => {
    recordSpeechEvent("prime-end", { text });
    if (token === activeSpeechToken) stopResumePump();
  };
  utterance.onerror = (event) => {
    recordSpeechEvent("prime-error", { error: event?.error ?? "unknown", text });
    if (token === activeSpeechToken) {
      stopResumePump();
      try { synth.resume?.(); } catch { /* optional browser API */ }
    }
  };

  try {
    recordSpeechEvent("prime-deliver", { text, audible });
    synth.speak(utterance);
    startResumePump(synth);
    setTimeout(() => {
      if (token === activeSpeechToken && !started) {
        recordSpeechEvent("prime-no-start", { error: "speechSynthesis accepted the utterance but did not fire onstart", text });
        markSpeechEngineStalled("prime-no-start", text, token);
      }
    }, NO_START_MS);
    setTimeout(() => {
      try { synth.resume?.(); } catch { /* optional browser API */ }
    }, 120);
    return { ok: true, reason: "ready" };
  } catch {
    recordSpeechEvent("prime-exception", { error: "synth.speak threw", text });
    stopResumePump();
    return { ok: false, reason: "blocked" };
  }
}

function speak(enabled, text, options = {}) {
  const synth = getSpeechSynth();
  const cleanText = String(text ?? "").trim();

  if (!enabled) {
    recordSpeechEvent("speak-skipped", { reason: "disabled", text: cleanText });
    return { ok: false, reason: "disabled" };
  }
  if (!cleanText) {
    recordSpeechEvent("speak-skipped", { reason: "empty" });
    return { ok: false, reason: "empty" };
  }

  const now = Date.now();
  if (!options.force && cleanText === lastSpeechText && now - lastSpeechAt < DEDUPE_MS) {
    recordSpeechEvent("speak-deduped", { text: cleanText });
    return { ok: true, reason: "deduped" };
  }
  lastSpeechText = cleanText;
  lastSpeechAt = now;

  const token = beginAudibleCue(synth);

  if (!isSpeechSupported() || !synth) {
    recordSpeechEvent("speak-skipped", { reason: "unsupported", error: "Web Speech API unavailable", text: cleanText });
    playReliableFallback(cleanText, "speak-unsupported", token);
    return { ok: false, reason: "unsupported" };
  }
  if (!speechEngineHealthy && !options.forceSpeech) {
    recordSpeechEvent("speak-fallback", { reason: "speech-engine-stalled", text: cleanText });
    playReliableFallback(cleanText, "speak-fallback", token);
    return { ok: true, reason: "fallback" };
  }

  warmSpeechVoices();

  const request = {
    text: cleanText,
    options,
    retries: 0,
    token,
    started: false,
    fallbackStarted: false,
  };
  const delay = options.delayMs ?? (options.interrupt === false ? 0 : CANCEL_SETTLE_MS);
  if (delay <= 0) deliverSpeech(synth, request);
  else speechTimer = setTimeout(() => deliverSpeech(synth, request), delay);
  recordSpeechEvent("speak-queued", { text: cleanText, delay });

  return { ok: true, reason: speechUnlocked ? "queued" : "queued-unprimed" };
}

function flushSpeech() {
  const synth = getSpeechSynth();
  activeSpeechToken += 1;
  clearSpeechTimer();
  stopResumePump();
  stopActiveAudio();
  lastSpeechText = "";
  lastSpeechAt = 0;

  try {
    synth?.cancel?.();
    synth?.resume?.();
    recordSpeechEvent("flush", {});
  } catch {
    recordSpeechEvent("flush-error", { error: "cancel/resume failed" });
    // Browser speech implementations are inconsistent.
  }
}

function getSpeechStatus() {
  const synth = getSpeechSynth();
  const voiceCount = (() => {
    try {
      return synth?.getVoices?.().length ?? 0;
    } catch {
      return 0;
    }
  })();

  return {
    supported: isSpeechSupported(),
    unlocked: speechUnlocked,
    speaking: Boolean(synth?.speaking),
    pending: Boolean(synth?.pending || speechTimer),
    paused: Boolean(synth?.paused),
    voices: voiceCount,
    voice: cachedSpeechVoice ? `${cachedSpeechVoice.name} (${cachedSpeechVoice.lang})` : null,
    lastText: lastSpeechText,
    speechEngineHealthy,
    speechStallCount,
    fallbackAudio: fallbackAudioContext?.state ?? null,
    fallbackAudioUnlocked,
  };
}

function rawSpeechTest(text = "Raw browser speech test. If you hear this, Web Speech works.") {
  const synth = getSpeechSynth();
  if (!isSpeechSupported() || !synth) {
    recordSpeechEvent("raw-skipped", { reason: "unsupported", error: "Web Speech API unavailable" });
    return { ok: false, reason: "unsupported" };
  }

  try {
    const token = beginAudibleCue(synth);
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1;
    utterance.volume = 1;
    utterance.onstart = () => {
      if (token !== activeSpeechToken) return;
      speechEngineHealthy = true;
      recordSpeechEvent("raw-start", { text });
    };
    utterance.onend = () => {
      if (token === activeSpeechToken) recordSpeechEvent("raw-end", { text });
    };
    utterance.onerror = (event) => {
      if (token === activeSpeechToken) recordSpeechEvent("raw-error", { error: event?.error ?? "unknown", text });
    };
    synth.resume?.();
    recordSpeechEvent("raw-deliver", { text });
    synth.speak(utterance);
    return { ok: true, reason: "queued" };
  } catch {
    recordSpeechEvent("raw-exception", { error: "raw speech test threw", text });
    return { ok: false, reason: "exception" };
  }
}

function resetSpeechEngine() {
  speechEngineHealthy = true;
  speechStallCount = 0;
  flushSpeech();
  unlockFallbackAudio();
  recordSpeechEvent("speech-engine-reset", {});
  return getSpeechStatus();
}

function beepTest() {
  beginAudibleCue();
  return playDiagnosticTone();
}

function installSpeechDebug() {
  if (typeof window === "undefined") return;
  window.mirrorSpeechDebug = {
    hash: cueHash,
    status: getSpeechStatus,
    voices: () => getSpeechSynth()?.getVoices?.() ?? [],
    warm: warmSpeechVoices,
    test: (text = "Mirror voice test. If you hear this, instruction sound is working.") => primeSpeech(true, { text, volume: 1 }),
    speak: (text = "Mirror voice test.") => speak(true, text, { force: true }),
    raw: rawSpeechTest,
    beep: beepTest,
    tone: () => {
      beginAudibleCue();
      return playDiagnosticTone();
    },
    cue: () => {
      const token = beginAudibleCue();
      return playFallbackTone("debug-cue", token);
    },
    audioCue: (text = "Hold") => {
      const token = beginAudibleCue();
      return playPrerenderedCue(text, "debug-audio-cue", token);
    },
    reset: resetSpeechEngine,
    flush: flushSpeech,
  };
}

installSpeechDebug();

export { flushSpeech, getSpeechStatus, primeSpeech, speak, warmSpeechVoices };
