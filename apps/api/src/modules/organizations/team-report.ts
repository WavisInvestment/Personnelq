import { escapeHtml as h } from '../../common/html';
import { TRAIT_META, TRAIT_ORDER } from '../reports/radar-svg';

export interface TeamReportData {
  organization: string;
  generatedAt: Date;
  members: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  distribution: { trait: string; average: number | null; low: number; medium: number; high: number }[];
  departments: { department: string; members: number; completed: number; averages: Record<string, number | null> }[];
}

const date = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const num = (n: number | null) => (n === null ? 'n/a' : String(Math.round(n)));

/** Team totals and averages only, with no individual's scores. Every dynamic value is escaped. */
export function renderTeamReportHtml(d: TeamReportData): string {
  const pct = d.members ? Math.round((d.completed / d.members) * 100) : 0;

  const dist = TRAIT_ORDER.map((t) => {
    const row = d.distribution.find((x) => x.trait === t);
    const meta = TRAIT_META[t];
    const total = row ? row.low + row.medium + row.high : 0;
    const w = (n: number) => (total ? (n / total) * 100 : 0);
    return `<tr>
  <td><span class="chip" style="background:${meta.color}">${meta.letter}</span>${h(meta.name)}</td>
  <td class="num">${num(row?.average ?? null)}</td>
  <td class="barcell"><div class="stack"><i style="width:${w(row?.low ?? 0)}%;background:#d6cebf"></i><i style="width:${w(row?.medium ?? 0)}%;background:#9bb8b1"></i><i style="width:${w(row?.high ?? 0)}%;background:${meta.color}"></i></div></td>
  <td class="num">${row?.low ?? 0} / ${row?.medium ?? 0} / ${row?.high ?? 0}</td>
</tr>`;
  }).join('');

  const depts = d.departments
    .map(
      (g) => `<tr>
  <td>${h(g.department)}</td><td class="num">${g.members}</td><td class="num">${g.completed}</td>
  ${TRAIT_ORDER.map((t) => `<td class="num">${num(g.averages[t] ?? null)}</td>`).join('')}
</tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Team report</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1b19; font-size: 11.5pt; line-height: 1.45; margin: 0; }
  h1 { font-size: 24pt; margin: 0; font-weight: 600; } h2 { font-size: 14pt; margin: 22px 0 8px; font-weight: 600; }
  .muted { color: #6b665e; } table { width: 100%; border-collapse: collapse; } th { text-align: left; font-weight: 600; font-size: 9.5pt; color: #6b665e; padding: 6px 8px 6px 0; border-bottom: 1px solid #e7e1d6; }
  td { padding: 7px 8px 7px 0; border-bottom: 1px solid #f0ebe0; vertical-align: middle; } .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .chip { display: inline-block; width: 18px; height: 18px; border-radius: 50%; color: #fff; font-size: 8.5pt; font-weight: 700; text-align: center; line-height: 18px; margin-right: 8px; }
  .barcell { width: 38%; } .stack { display: flex; height: 9px; border-radius: 5px; overflow: hidden; background: #f3eee5; } .stack i { display: block; height: 100%; }
  .tiles { display: flex; gap: 10px; margin-top: 14px; } .tile { flex: 1; border: 1px solid #e7e1d6; border-radius: 10px; padding: 10px 12px; } .tile b { display: block; font-size: 18pt; font-weight: 600; }
  .note { margin-top: 24px; font-size: 9.5pt; color: #6b665e; }
</style></head><body>
<h1>${h(d.organization)}</h1>
<p class="muted">Team personality report · ${h(date(d.generatedAt))}</p>
<div class="tiles">
  <div class="tile"><b>${d.members}</b>people in the team</div>
  <div class="tile"><b>${d.completed}</b>completed (${pct}%)</div>
  <div class="tile"><b>${d.inProgress}</b>in progress</div>
  <div class="tile"><b>${d.notStarted}</b>not started</div>
</div>
<h2>Personality distribution</h2>
<p class="muted">Average score (0 to 100) and how many people sit low / medium / high on each trait.</p>
<table><thead><tr><th>Trait</th><th class="num">Average</th><th></th><th class="num">Low / Med / High</th></tr></thead><tbody>${dist}</tbody></table>
${depts ? `<h2>By department</h2><table><thead><tr><th>Department</th><th class="num">People</th><th class="num">Done</th>${TRAIT_ORDER.map((t) => `<th class="num">${h(TRAIT_META[t].letter)}</th>`).join('')}</tr></thead><tbody>${depts}</tbody></table><p class="muted" style="font-size:9.5pt">C Curiosity, D Discipline, E Energy, W Warmth, S Sensitivity. Averages use people who finished.</p>` : ''}
<p class="note">Based on self-reported results that people took through the company. Scores describe tendencies, not abilities, and are not a hiring or clinical assessment.</p>
</body></html>`;
}
