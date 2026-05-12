import { COMFORT_DOSING } from "../domain/config";
import { formatClock, todayISO } from "../domain/session";
import { baselineProgressLabel } from "../ml/faceMetrics";
import { displayPct, scoreColor } from "../ui/scoreFormatting";

function formatSessionDate(s) {
  const today = todayISO();
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  const yISO = yest.toISOString().split("T")[0];
  const time = s.ts ? formatClock(new Date(s.ts)) : "";
  if (s.date === today) return `Today${time ? ` · ${time}` : ""}`;
  if (s.date === yISO) return `Yesterday${time ? ` · ${time}` : ""}`;
  const d = new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${d}${time ? ` · ${time}` : ""}`;
}

function formatDuration(secs) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60), r = secs % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function buildSessionReportHtml(s) {
  const ts = s.ts ? new Date(s.ts) : new Date();
  const dateStr = ts.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeStr = formatClock(ts);
  const dur = formatDuration(s.duration);
  const overallPct = displayPct(s.sessionAvg);
  const overallColor = scoreColor(s.sessionAvg);
  const comfort = s.comfortLevel ? (COMFORT_DOSING[s.comfortLevel]?.label ?? s.comfortLevel) : null;
  const sessionType = s.kind === "practice" ? "Practice run" : "Daily session";
  const baseline = s.baselineProgress;
  const initialBaseline = s.initialBaselineProgress;
  const scoresArr = s.scores || [];
  const totalReps = scoresArr.reduce((sum, e) => sum + (e.scores?.length ?? 0), 0);

  const exerciseRows = scoresArr.map((e) => {
    const pct = displayPct(e.avg);
    const color = scoreColor(e.avg);
    const repsArr = e.scores ?? [];
    const repLabel = `${repsArr.length}${e.repsTarget ? `/${e.repsTarget}` : ""} rep${(e.repsTarget ?? repsArr.length) === 1 ? "" : "s"}`;
    const doseBits = [
      e.region,
      repLabel,
      e.holdSec ? `${e.holdSec}s hold` : null,
      e.restSec ? `${e.restSec}s rest` : null,
    ].filter(Boolean).join(" · ");
    const repBreakdown = repsArr.length > 0
      ? repsArr.map((r) => {
          const rp = displayPct(r);
          return `<span class="rep" style="background:${rp == null ? "#E7E5E4" : scoreColor(r)};color:#fff">${rp == null ? "—" : rp + "%"}</span>`;
        }).join("")
      : '<span class="muted">No symmetry data captured</span>';
    const baselineLine = e.baselineProgress
      ? `<div class="muted small">Current baseline: ${escapeHtml(e.baselineProgress.side)} side · ${escapeHtml(baselineProgressLabel(e.baselineProgress) ?? "")}</div>`
      : "";
    const initialBaselineLine = e.initialBaselineProgress
      ? `<div class="muted small">First baseline: ${escapeHtml(e.initialBaselineProgress.side)} side · ${escapeHtml(baselineProgressLabel(e.initialBaselineProgress) ?? "")}</div>`
      : "";
    const allSnapshots = e.snapshots || [];
    const movementSnap = allSnapshots.reduce((best, snap) => {
      if (!best) return snap;
      return (snap.score ?? -1) > (best.score ?? -1) ? snap : best;
    }, null);
    const baselineImage = e.baselineSnapshot || s.baselineSnapshot || null;
    const movementPct = displayPct(movementSnap?.score);
    const comparison = baselineImage || movementSnap ? `
      <div class="comparison">
        <figure class="compare-frame">
          ${baselineImage ? `<img src="${baselineImage}" alt="Neutral baseline frame" />` : `<div class="missing-image">No baseline image</div>`}
          <figcaption>Baseline neutral</figcaption>
        </figure>
        <figure class="compare-frame">
          ${movementSnap ? `<img src="${movementSnap.dataUrl}" alt="Peak movement frame" />` : `<div class="missing-image">No movement image</div>`}
          <figcaption>Movement${movementPct == null ? "" : ` · ${movementPct}%`}</figcaption>
        </figure>
      </div>`
      : "";
    const snapshots = allSnapshots.slice(0, 6).map((snap) => {
      const sp = displayPct(snap.score);
      return `<div class="snap"><img src="${snap.dataUrl}" alt="" /><div class="snap-label" style="background:${scoreColor(snap.score)}">${sp == null ? "—" : sp + "%"}</div></div>`;
    }).join("");
    return `
      <section class="exercise">
        <div class="ex-head">
          <div>
            <div class="ex-name">${escapeHtml(e.name)}</div>
            <div class="muted small">${escapeHtml(doseBits)}</div>
            ${baselineLine}
            ${initialBaselineLine}
          </div>
          <div class="ex-score" style="color:${color}">${pct == null ? "—" : pct + "%"}</div>
        </div>
        <div class="reps">${repBreakdown}</div>
        ${comparison}
        ${snapshots ? `<div class="snaps">${snapshots}</div>` : ""}
      </section>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Facial Retraining Session — ${escapeHtml(dateStr)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1F1B16; margin: 0; padding: 32px; background: #F4EFE6; }
  .page { max-width: 760px; margin: 0 auto; background: #fff; padding: 40px 44px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: #78716C; margin: 28px 0 12px; font-weight: 600; }
  .meta { color: #57534E; font-size: 13px; margin-bottom: 24px; }
  .summary { display: grid; grid-template-columns: auto 1fr; gap: 24px; align-items: center; padding: 20px; background: #FAF7F0; border-radius: 12px; margin-bottom: 12px; }
  .big-score { font-size: 56px; font-weight: 700; line-height: 1; letter-spacing: -0.02em; color: ${overallColor}; }
  .summary-meta { font-size: 13px; color: #57534E; line-height: 1.6; }
  .summary-meta strong { color: #1F1B16; }
  .baseline { padding: 12px 16px; background: rgba(122,143,115,0.12); border-radius: 8px; font-size: 13px; color: #4A6B47; margin-bottom: 12px; }
  .exercise { padding: 16px 0; border-top: 1px solid #E7E5E4; }
  .exercise:first-of-type { border-top: none; }
  .ex-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .ex-name { font-weight: 600; font-size: 15px; margin-bottom: 2px; }
  .ex-score { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .reps { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 10px; }
  .rep { font-size: 11px; padding: 3px 8px; border-radius: 4px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
  .compare-frame { margin: 0; border: 1px solid #E7E5E4; border-radius: 10px; overflow: hidden; background: #FAF7F0; }
  .compare-frame img { width: 100%; height: 220px; object-fit: cover; object-position: center; display: block; image-rendering: auto; }
  .compare-frame figcaption { font-size: 11px; color: #57534E; padding: 7px 9px; background: #FAF7F0; font-weight: 600; }
  .missing-image { height: 220px; display: flex; align-items: center; justify-content: center; color: #A8A29E; font-size: 12px; background: #F5F2EC; }
  .snaps { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .snap { position: relative; width: 72px; height: 104px; border-radius: 6px; overflow: hidden; border: 1px solid #E7E5E4; }
  .snap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .snap-label { position: absolute; bottom: 0; inset-inline: 0; font-size: 9px; color: #fff; text-align: center; padding: 1px 0; font-weight: 600; }
  .muted { color: #78716C; }
  .small { font-size: 12px; margin-top: 2px; }
  .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #E7E5E4; font-size: 11px; color: #78716C; line-height: 1.6; }
  @media print {
    body { background: #fff; padding: 0; }
    .page { box-shadow: none; border-radius: 0; padding: 24px; max-width: none; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="page">
    <h1>Facial Retraining Session Report</h1>
    <div class="meta">${escapeHtml(dateStr)}${timeStr ? ` · ${escapeHtml(timeStr)}` : ""}</div>

    <div class="summary">
      <div class="big-score">${overallPct == null ? "—" : overallPct + "%"}</div>
      <div class="summary-meta">
        <div><strong>Average symmetry</strong> across the session</div>
        <div>Type: <strong>${escapeHtml(sessionType)}</strong></div>
        <div>Duration: <strong>${escapeHtml(dur)}</strong></div>
        <div>Exercises: <strong>${scoresArr.length}</strong> · Reps captured: <strong>${totalReps}</strong></div>
        ${comfort ? `<div>Comfort level: <strong>${escapeHtml(comfort)}</strong></div>` : ""}
      </div>
    </div>

    ${baseline ? `<div class="baseline"><strong>Current baseline progress:</strong> ${escapeHtml(baseline.side)} side · ${escapeHtml(baselineProgressLabel(baseline) ?? "")}</div>` : ""}
    ${initialBaseline ? `<div class="baseline"><strong>First baseline progress:</strong> ${escapeHtml(initialBaseline.side)} side · ${escapeHtml(baselineProgressLabel(initialBaseline) ?? "")}</div>` : ""}

    <h2>By Exercise</h2>
    ${exerciseRows || '<div class="muted">No exercises recorded.</div>'}

    <div class="footer">
      Symmetry is auto-detected from facial landmarks captured during the session. Some movement variation is normal even in healthy faces.
      Generated for clinical review by a physiotherapist or facial retraining specialist.
    </div>
  </div>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 250); });</script>
</body>
</html>`;
}

function shareSessionReport(sessionLike) {
  const html = buildSessionReportHtml(sessionLike);
  const win = window.open("", "_blank");
  if (!win) {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mirror-session-report-${sessionLike.date || todayISO()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}
export { formatDuration, formatSessionDate, shareSessionReport };
