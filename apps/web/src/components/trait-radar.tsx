import { TRAITS } from '@/lib/traits';
import { cn } from '@/lib/cn';

const SIZE = 360;
const CENTER = SIZE / 2;
const RADIUS = 108;
const LABEL_RADIUS = RADIUS + 34;

function point(index: number, scale: number, radius = RADIUS) {
  const angle = (-90 + index * 72) * (Math.PI / 180);
  return {
    x: CENTER + Math.cos(angle) * radius * scale,
    y: CENTER + Math.sin(angle) * radius * scale,
  };
}

function polygon(scales: number[]) {
  return scales
    .map((s, i) => {
      const p = point(i, s);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');
}

interface TraitRadarProps {
  values?: number[];
  tone?: 'light' | 'dark';
  muted?: boolean;
  className?: string;
}

export function TraitRadar({
  values = [0.82, 0.68, 0.55, 0.76, 0.38],
  tone = 'light',
  muted = false,
  className,
}: TraitRadarProps) {
  const dark = tone === 'dark';
  const gridStroke = dark ? 'rgba(255,255,255,0.16)' : '#d6cebf';
  const fill = dark ? 'rgba(123,209,189,0.22)' : 'rgba(39,157,136,0.16)';
  const stroke = dark ? '#7bd1bd' : '#1a7f6e';

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={cn('h-auto w-full', className)}
      role="img"
      aria-label="Radar chart of five personality dimensions: curiosity, discipline, energy, warmth and sensitivity"
    >
      {[1, 0.66, 0.33].map((scale) => (
        <polygon
          key={scale}
          points={polygon(Array(5).fill(scale))}
          fill="none"
          stroke={gridStroke}
          strokeWidth="1"
          strokeLinejoin="round"
        />
      ))}
      {TRAITS.map((trait, i) => {
        const end = point(i, 1);
        return (
          <line
            key={trait.key}
            x1={CENTER}
            y1={CENTER}
            x2={end.x}
            y2={end.y}
            stroke={gridStroke}
            strokeWidth="1"
          />
        );
      })}

      {!muted && (
        <g>
          <polygon
            points={polygon(values)}
            fill={fill}
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {TRAITS.map((trait, i) => {
            const p = point(i, values[i]);
            return (
              <circle
                key={trait.key}
                cx={p.x}
                cy={p.y}
                r="6"
                fill={trait.color}
                stroke={dark ? '#0a2b26' : '#ffffff'}
                strokeWidth="2.5"
              />
            );
          })}
        </g>
      )}

      {TRAITS.map((trait, i) => {
        const p = point(i, 1, LABEL_RADIUS);
        return (
          <g key={trait.key}>
            <circle cx={p.x} cy={p.y} r="15" fill={trait.color} opacity={muted ? 0.45 : 1} />
            <text
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="14"
              fontWeight="700"
              fill="#ffffff"
            >
              {trait.letter}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
