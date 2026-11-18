import { escapeHtml as h } from '../../common/html';
import { INSIGHT_SECTIONS, INSIGHT_TITLES, Insights } from '../insights/insights.schema';
import { TRAIT_META, TRAIT_ORDER, TraitKey, radarSvg } from './radar-svg';

export interface ReportData {
  personName: string;
  assessmentName: string;
  version: string;
  attempt: number;
  completedAt: Date;
  generatedAt: Date;
  traits: { trait: TraitKey; score: number; level_label: string; description: string | null }[];
  insights: Insights | null;
  disclaimer: string | null;
}

const date = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const LOGO = `<svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#13423b"/><polygon points="32,10 52.9,25.2 44.9,49.8 19.1,49.8 11.1,25.2" fill="#279d88" fill-opacity="0.35" stroke="#7bd1bd" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="10" r="4" fill="#8b7cf6"/><circle cx="52.9" cy="25.2" r="4" fill="#3b8fd9"/><circle cx="44.9" cy="49.8" r="4" fill="#f5a623"/><circle cx="19.1" cy="49.8" r="4" fill="#ec5f87"/><circle cx="11.1" cy="25.2" r="4" fill="#2fb59a"/></svg>`;

/** Every dynamic value is escaped. The template is the only HTML the PDF renderer ever sees. */
export function renderReportHtml(data: ReportData): string {
  const ordered = TRAIT_ORDER.map((t) => data.traits.find((x) => x.trait === t)).filter(Boolean) as ReportData['traits'];

  const summaryRows = ordered
    .map((t) => {
      const meta = TRAIT_META[t.trait];
      return `<tr>
  <td><span class="chip" style="background:${meta.color}">${meta.letter}</span>${h(meta.name)}</td>
  <td class="num">${Math.round(t.score)}</td>
  <td>${h(t.level_label)}</td>
  <td class="barcell"><div class="bar"><div style="width:${Math.max(0, Math.min(100, t.score))}%;background:${meta.color}"></div></div></td>
</tr>`;
    })
    .join('');

  const readings = ordered
    .map((t) => {
      const meta = TRAIT_META[t.trait];
      return `<section class="card">
  <div class="cardhead">
    <span class="chip big" style="background:${meta.color}">${meta.letter}</span>
    <h3>${h(meta.name)}</h3>
    <span class="score">${Math.round(t.score)}<small> / 100 · ${h(t.level_label)}</small></span>
  </div>
  <div class="bar"><div style="width:${Math.max(0, Math.min(100, t.score))}%;background:${meta.color}"></div></div>
  ${t.description ? `<p>${h(t.description)}</p>` : ''}
</section>`;
    })
    .join('');

  const insights = data.insights
    ? `<h2>Your insights</h2>
<p class="muted">A written reading of your profile across eight areas of work and life.</p>
${INSIGHT_SECTIONS.map((key) => {
  const s = data.insights![key];
  return `<section class="card">
  <h3>${h(INSIGHT_TITLES[key])}</h3>
  <p>${h(s.summary)}</p>
  <ul>${s.points.map((p) => `<li>${h(p)}</li>`).join('')}</ul>
</section>`;
}).join('')}`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${h(data.assessmentName)} report</title>
<style>
  @page { size: A4; margin: 16mm 15mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #1c1b19; font: 11pt/1.55 "Segoe UI", Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1, h2, h3 { font-family: Georgia, "Times New Roman", serif; font-weight: 500; letter-spacing: -0.01em; margin: 0; }
  h1 { font-size: 27pt; line-height: 1.1; }
  h2 { font-size: 17pt; margin: 26px 0 4px; }
  h3 { font-size: 13pt; }
  p { margin: 8px 0; }
  .muted { color: #6b665e; font-size: 10pt; }
  .brand { display: flex; align-items: center; gap: 10px; font-family: Georgia, serif; font-size: 13pt; font-weight: 600; }
  .hero { margin-top: 18px; padding: 24px 26px; border-radius: 16px; background: #13423b; color: #fff; }
  .hero h1 { color: #fff; }
  .hero p { color: #aee5d6; margin: 6px 0 0; }
  .hero .meta { color: #7bd1bd; font-size: 10pt; margin-top: 10px; }
  .grid { display: flex; gap: 22px; align-items: center; margin-top: 8px; }
  .grid .chart { flex: 0 0 300px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
  td { padding: 7px 6px; border-bottom: 1px solid #e7e1d6; vertical-align: middle; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; width: 38px; }
  td.barcell { width: 90px; }
  .chip { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; color: #fff; font-size: 9pt; font-weight: 700; margin-right: 8px; }
  .chip.big { width: 30px; height: 30px; font-size: 12pt; margin: 0; }
  .bar { height: 7px; background: #f3eee5; border-radius: 99px; overflow: hidden; }
  .bar > div { height: 100%; border-radius: 99px; }
  .card { border: 1px solid #e7e1d6; border-radius: 12px; padding: 14px 16px; margin: 10px 0; break-inside: avoid; page-break-inside: avoid; }
  .cardhead { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; }
  .cardhead .score { margin-left: auto; font-family: Georgia, serif; font-size: 17pt; }
  .cardhead .score small { font: 9pt "Segoe UI", Arial, sans-serif; color: #6b665e; }
  .card p { color: #45423d; }
  ul { margin: 6px 0 0; padding-left: 18px; color: #45423d; }
  li { margin: 3px 0; }
  .disclaimer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e7e1d6; font-size: 9pt; color: #6b665e; }
</style>
</head>
<body>
  <div class="brand">${LOGO}<span>Personnelq</span></div>

  <div class="hero">
    <h1>${h(data.assessmentName)}</h1>
    <p>Personal report for <strong>${h(data.personName)}</strong></p>
    <div class="meta">Completed ${h(date(data.completedAt))} · Attempt ${h(data.attempt)} · Version ${h(data.version)}</div>
  </div>

  <h2>Your profile</h2>
  <p class="muted">Scores run from 0 to 100 on each trait. There is no good or bad score; each describes a tendency.</p>
  <div class="grid">
    <div class="chart">${radarSvg(ordered.map((t) => t.score), 300)}</div>
    <table>${summaryRows}</table>
  </div>

  <h2>Trait by trait</h2>
  ${readings}

  ${insights}

  <div class="disclaimer">
    ${data.disclaimer ? `<p>${h(data.disclaimer)}</p>` : ''}
    <p>Report generated on ${h(date(data.generatedAt))}. This report is private to ${h(data.personName)}.</p>
  </div>
</body>
</html>`;
}
