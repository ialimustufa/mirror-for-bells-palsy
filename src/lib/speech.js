let speechTimer = null;
let lastSpeechText = "";
let lastSpeechAt = 0;
let cachedSpeechVoice = null;

function getSpeechSynth() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

function getSpeechVoice(synth) {
  if (cachedSpeechVoice) return cachedSpeechVoice;
  const voices = synth?.getVoices?.() ?? [];
  cachedSpeechVoice = voices.find((v) => /^en(-|_)/i.test(v.lang) && v.localService) || voices.find((v) => /^en(-|_)/i.test(v.lang)) || voices[0] || null;
  return cachedSpeechVoice;
}

function makeSpeechUtterance(text) {
  const synth = getSpeechSynth();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = getSpeechVoice(synth);
  if (voice) utterance.voice = voice;
  utterance.rate = 0.92;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  return utterance;
}

function primeSpeech(enabled) {
  const synth = getSpeechSynth();
  if (!enabled || !synth) return;
  try {
    cachedSpeechVoice = null;
    synth.getVoices?.();
    synth.resume?.();
    const u = makeSpeechUtterance("Voice guidance ready.");
    u.volume = 0.35;
    u.rate = 1;
    synth.cancel();
    synth.speak(u);
    setTimeout(() => synth.resume?.(), 80);
  } catch {
    // Speech synthesis availability varies by browser and device.
  }
}

function speak(enabled, text) {
  const synth = getSpeechSynth();
  if (!enabled || !synth || !text) return;
  const now = Date.now();
  if (text === lastSpeechText && now - lastSpeechAt < 900) return;
  lastSpeechText = text;
  lastSpeechAt = now;
  try {
    if (speechTimer) clearTimeout(speechTimer);
    const u = makeSpeechUtterance(text);
    u.onerror = () => {
      try { synth.resume?.(); } catch { /* optional browser API */ }
    };
    if (synth.speaking || synth.pending) synth.cancel();
    synth.resume?.();
    speechTimer = setTimeout(() => {
      try {
        synth.resume?.();
        synth.speak(u);
        setTimeout(() => synth.resume?.(), 120);
      } catch {
        // Speech synthesis is optional and browser-dependent.
      }
    }, 60);
  } catch {
    // Speech synthesis is optional and browser-dependent.
  }
}

function flushSpeech() {
  const synth = getSpeechSynth();
  try {
    if (speechTimer) clearTimeout(speechTimer);
    speechTimer = null;
    synth?.cancel?.();
    synth?.resume?.();
  } catch { /* optional browser API */ }
}
export { flushSpeech, primeSpeech, speak };
