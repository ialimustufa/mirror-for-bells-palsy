export function displayPct(raw) {
  if (raw == null) return null;
  return Math.round(Math.max(0, Math.min(1, raw)) * 100);
}

export function scoreColor(v) {
  if (v == null) return "#A8A29E";
  if (v >= 0.8) return "#7A8F73";
  if (v >= 0.6) return "#D4A574";
  return "#B8543A";
}
