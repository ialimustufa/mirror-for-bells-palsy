const JOURNAL_SAFETY_LOOKBACK_DAYS = 14;
const NEGATION_WINDOW_CHARS = 36;

const JOURNAL_SAFETY_PROMPT_DEFINITIONS = [
  {
    id: "new-or-worsening-symptoms",
    severity: "urgent",
    tags: ["new-symptoms", "worsening"],
    prompt: "Journal notes mention new or worsening symptoms. Seek prompt medical advice, especially for sudden worsening, limb weakness, speech changes, vision changes, dizziness, confusion, or severe headache.",
    patterns: [
      /\bnew symptom(?:s)?\b/gi,
      /\bworsen(?:ing|ed)?\b/gi,
      /\bgetting worse\b/gi,
      /\bsudden(?:ly)?\s+(?:worse|worsening|weakness|numbness|dizziness|headache|symptoms?)\b/gi,
      /\bnumb(?:ness)?\b/gi,
      /\bslurred speech\b/gi,
      /\b(?:speech changes?|trouble speaking|difficulty speaking)\b/gi,
      /\b(?:vision changes?|blurry vision|double vision|trouble seeing|loss of vision)\b/gi,
      /\bdizz(?:y|iness)\b/gi,
      /\bconfus(?:ed|ion)\b/gi,
      /\bweakness in (?:my )?(?:arm|leg)\b/gi,
      /\bsevere headache\b/gi,
    ],
  },
  {
    id: "pain-or-strain",
    severity: "caution",
    tags: ["pain", "strain"],
    prompt: "Journal notes mention pain or strain. Stop exercises that hurt and review the plan with a qualified clinician.",
    patterns: [
      /\bpain(?:ful)?\b/gi,
      /\bstrain(?:ed|ing)?\b/gi,
      /\bache(?:s|d)?\b/gi,
      /\bsore(?:ness)?\b/gi,
      /\bdiscomfort\b/gi,
    ],
  },
  {
    id: "significant-fatigue",
    severity: "caution",
    tags: ["fatigue"],
    prompt: "Journal notes mention significant fatigue. Keep practice gentle and discuss persistent or worsening fatigue with a clinician.",
    patterns: [
      /\bfatigue(?:d)?\b/gi,
      /\bexhausted\b/gi,
      /\bvery tired\b/gi,
      /\btoo tired\b/gi,
      /\bworn out\b/gi,
      /\bdrained\b/gi,
    ],
  },
  {
    id: "eye-protection",
    severity: "caution",
    tags: ["eye-protection", "dryness"],
    prompt: "Journal notes mention eye dryness, irritation, watering, or incomplete closure. Follow your clinician's eye-protection plan and seek advice if it persists or worsens.",
    patterns: [
      /\bdry(?:ness)?\b/gi,
      /\bdry eye(?:s)?\b/gi,
      /\beye(?:s)?\s+(?:dry|irritated|watering|tearing)\b/gi,
      /\birritat(?:ed|ion)\b/gi,
      /\bwatering\b/gi,
      /\btearing\b/gi,
      /\bincomplete eye closure\b/gi,
      /\beye(?:s)?\s+(?:won'?t|cannot|can't)\s+close\b/gi,
    ],
  },
];

const SEVERITY_RANK = { urgent: 0, caution: 1 };

function recordArray(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

function entryTimestamp(entry) {
  if (Number.isFinite(entry?.ts)) return entry.ts;
  const parsed = Date.parse(entry?.date ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasNearbyNegation(text, index, length = 0) {
  const before = text.slice(Math.max(0, index - NEGATION_WINDOW_CHARS), index);
  const after = text.slice(index + length, index + length + NEGATION_WINDOW_CHARS);
  return /\b(?:no|not|without|denies?|none)\b(?:[\s,.;:-]+\w+){0,4}[\s,.;:-]*$/i.test(before)
    || /\b(?:resolved|improved|improving|better)\b(?:[\s,.;:-]+\w+){0,2}[\s,.;:-]*$/i.test(before)
    || /^[\s,.;:-]*(?:is|was|feels?|felt|has been|now)?[\s,.;:-]*(?:resolved|improved|improving|better)\b/i.test(after);
}

function patternHasPositiveMatch(text, pattern) {
  const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let match = regex.exec(text);
  while (match) {
    if (!hasNearbyNegation(text, match.index, match[0].length)) return true;
    if (regex.lastIndex === match.index) regex.lastIndex += 1;
    match = regex.exec(text);
  }
  return false;
}

function definitionMatchesText(definition, text) {
  return definition.patterns.some((pattern) => patternHasPositiveMatch(text, pattern));
}

function normalizePrompt(definition) {
  return {
    id: definition.id,
    severity: definition.severity,
    tags: [...definition.tags],
    prompt: definition.prompt,
  };
}

function summarizeJournalEntrySafetyPrompts(entry = {}) {
  const text = String(entry.notes ?? "").trim();
  if (!text) return [];
  return JOURNAL_SAFETY_PROMPT_DEFINITIONS
    .filter((definition) => definitionMatchesText(definition, text))
    .map(normalizePrompt);
}

function summarizeJournalSafetyPrompts(entries = [], options = {}) {
  const sourceEntries = recordArray(entries).filter((entry) => String(entry.notes ?? "").trim());
  if (!sourceEntries.length) return [];
  const referenceTs = options.referenceDate
    ? Date.parse(options.referenceDate)
    : Math.max(...sourceEntries.map(entryTimestamp));
  const lookbackDays = Number.isFinite(options.lookbackDays) ? Math.max(0, options.lookbackDays) : JOURNAL_SAFETY_LOOKBACK_DAYS;
  const cutoffTs = Number.isFinite(referenceTs) && lookbackDays > 0
    ? referenceTs - lookbackDays * 24 * 60 * 60 * 1000
    : null;
  const grouped = new Map();

  for (const entry of sourceEntries) {
    const ts = entryTimestamp(entry);
    if (cutoffTs != null && ts && ts < cutoffTs) continue;
    for (const prompt of summarizeJournalEntrySafetyPrompts(entry)) {
      const existing = grouped.get(prompt.id) ?? {
        ...prompt,
        entryCount: 0,
        latestDate: null,
        latestTs: null,
      };
      existing.entryCount += 1;
      if (ts >= (existing.latestTs ?? -Infinity)) {
        existing.latestTs = ts || null;
        existing.latestDate = entry.date ?? null;
      }
      grouped.set(prompt.id, existing);
    }
  }

  return [...grouped.values()]
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || (b.latestTs ?? 0) - (a.latestTs ?? 0))
    .slice(0, Number.isFinite(options.limit) ? Math.max(0, options.limit) : 4);
}

export {
  JOURNAL_SAFETY_LOOKBACK_DAYS,
  summarizeJournalEntrySafetyPrompts,
  summarizeJournalSafetyPrompts,
};
