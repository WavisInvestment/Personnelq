/** Server-side radar chart (same geometry as the web app's TraitRadar) so the PDF needs no browser JavaScript. */

export const TRAIT_META = {
  openness: { letter: 'C', name: 'Curiosity', color: '#8b7cf6' },
  conscientiousness: { letter: 'D', name: 'Discipline', color: '#3b8fd9' },
  extraversion: { letter: 'E', name: 'Energy', color: '#f5a623' },
  agreeableness: { letter: 'W', name: 'Warmth', color: '#ec5f87' },
  neuroticism: { letter: 'S', name: 'Sensitivity', color: '#2fb59a' },
} as const;

export type TraitKey = keyof typeof TRAIT_META;
export const TRAIT_ORDER: TraitKey[] = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];

const SIZE = 360;
const CENTER = SIZE / 2;
const RADIUS = 108;
const LABEL_RADIUS = RADIUS + 34;

const point = (index: number, scale: number, radius = RADIUS) => {
  const angle = (-90 + index * 72) * (Math.PI / 180);
  return { x: CENTER + Math.cos(angle) * radius * scale, y: CENTER + Math.sin(angle) * radius * scale };
};

const polygon = (scales: number[]) =>
  scales.map((s, i) => `${point(i, s).x.toFixed(1)},${point(i, s).y.toFixed(1)}`).join(' ');

/** @param scores trait scores from 0 to 100, in TRAIT_ORDER */
export function radarSvg(scores: number[], widthPx = 300): string {
  const values = scores.map((s) => Math.max(0, Math.min(100, s)) / 100);

  const rings = [1, 0.66, 0.33]
    .map((s) => `<polygon points="${polygon(Array(5).fill(s))}" fill="none" stroke="#d6cebf" stroke-width="1" stroke-linejoin="round"/>`)
    .join('');

  const axes = TRAIT_ORDER.map((_, i) => {
    const end = point(i, 1);
    return `<line x1="${CENTER}" y1="${CENTER}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" stroke="#d6cebf" stroke-width="1"/>`;
  }).join('');

  const dots = TRAIT_ORDER.map((trait, i) => {
    const p = point(i, values[i]);
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6" fill="${TRAIT_META[trait].color}" stroke="#fff" stroke-width="2.5"/>`;
  }).join('');

  const labels = TRAIT_ORDER.map((trait, i) => {
    const p = point(i, 1, LABEL_RADIUS);
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="15" fill="${TRAIT_META[trait].color}"/>
<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="700" fill="#fff" font-family="Arial, sans-serif">${TRAIT_META[trait].letter}</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${widthPx}" height="${widthPx}" role="img" aria-label="Radar chart of the five personality traits">
${rings}${axes}
<polygon points="${polygon(values)}" fill="rgba(39,157,136,0.18)" stroke="#1a7f6e" stroke-width="2.5" stroke-linejoin="round"/>
${dots}${labels}
</svg>`;
}
