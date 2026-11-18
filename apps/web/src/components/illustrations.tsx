import { cn } from '@/lib/cn';
import { TRAITS } from '@/lib/traits';

/**
 * Small hand-drawn accents. Paths are deliberately uneven (no perfect circles or straight runs) and use the
 * product's trait colours, so they read as drawn rather than generated. All are decorative.
 */

const dots = [
  { x: 118, y: 20 },
  { x: 205, y: 84 },
  { x: 171, y: 176 },
  { x: 58, y: 168 },
  { x: 24, y: 78 },
];

/** Five trait dots joined by an uneven line: the product's mark, drawn large. */
export function Constellation({ className, tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  const stroke = tone === 'light' ? '#b9d0bf' : '#254d38';
  return (
    <svg viewBox="0 0 230 200" className={cn('overflow-visible', className)} fill="none" aria-hidden="true">
      <path
        d="M118 21c34 22 62 46 86 62-9 30-22 60-33 93-34 0-76-4-113-8-12-28-26-60-35-91 29-15 63-35 95-56Z"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="1 7"
      />
      <path
        d="M122 52c22 14 44 28 62 40-8 22-17 44-24 68-26-3-55-6-80-9-8-20-18-42-24-63 21-12 45-26 66-36Z"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
      {dots.map((d, i) => (
        <g key={i}>
          <ellipse cx={d.x} cy={d.y} rx={11 + (i % 2)} ry={10.5 - (i % 3) * 0.6} fill={TRAITS[i].color} transform={`rotate(${i * 23} ${d.x} ${d.y})`} />
          <ellipse cx={d.x} cy={d.y} rx="17" ry="15.5" stroke={TRAITS[i].color} strokeWidth="1.3" opacity="0.45" transform={`rotate(${i * 41} ${d.x} ${d.y})`} />
        </g>
      ))}
    </svg>
  );
}

/** A loose loop drawn round a word or number, like a pen pass. */
export function Scribble({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 90" className={cn('overflow-visible', className)} fill="none" aria-hidden="true">
      <path
        d="M30 48C24 22 70 8 118 10c52 2 92 14 90 36-2 24-56 36-108 34C56 78 14 70 18 44c3-20 40-30 84-31"
        stroke="#dd5a33"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A curly arrow that points from a margin note to the thing it is about. */
export function Arrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 90 70" className={cn('overflow-visible', className)} fill="none" aria-hidden="true">
      <path d="M6 8c26-6 58 4 62 30 1 9-3 17-9 22" stroke="#c24822" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M52 55l8 6 6-9" stroke="#c24822" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A sprig: used as a quiet ornament next to headings and in empty corners. */
export function Sprig({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 120" className={cn('overflow-visible', className)} fill="none" aria-hidden="true">
      <path d="M40 116c-2-30 2-62 6-96" stroke="#3f7656" strokeWidth="2" strokeLinecap="round" />
      <path d="M44 84c-16-2-26-14-28-28 15 0 26 10 28 28Z" fill="#8fb39a" />
      <path d="M44 62c14-3 24-14 25-27-14 1-24 12-25 27Z" fill="#5f9272" />
      <path d="M46 40c-11-3-18-12-19-22 11 1 18 9 19 22Z" fill="#b9d0bf" />
    </svg>
  );
}

/** A round rubber-stamp: a circle of text with a trait dot in the middle. Rotated so it looks pressed by hand. */
export function Stamp({ className, label = 'free · five minutes · no card · ' }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 140 140" className={cn('overflow-visible', className)} aria-hidden="true">
      <defs>
        <path id="stamp-ring" d="M70 70m-48 0a48 47 0 1 1 96 1a48 47 0 1 1 -96 -1" />
      </defs>
      <circle cx="70" cy="70" r="64" fill="none" stroke="#c24822" strokeWidth="2" strokeDasharray="2 3" />
      <text fontSize="11.5" letterSpacing="2.4" fill="#c24822" fontFamily="var(--font-sans)" fontWeight="600">
        <textPath href="#stamp-ring">{label.toUpperCase()}</textPath>
      </text>
      <circle cx="70" cy="70" r="13" fill="#dd5a33" />
      <circle cx="70" cy="70" r="22" fill="none" stroke="#dd5a33" strokeWidth="1.4" opacity="0.5" />
    </svg>
  );
}
