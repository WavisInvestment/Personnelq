import { cn } from '@/lib/cn';

/**
 * One small hand-drawn mark per personality class. Each is a few uneven strokes inside a rough ring, in the product's
 * forest green with a persimmon accent. Decorative: the class name always sits beside it.
 */

export type ClassKey = 'CL-01' | 'CL-02' | 'CL-03' | 'CL-04' | 'CL-05' | 'CL-06' | 'CL-07' | 'CL-08';

const INK = '#254d38';
const HOT = '#dd5a33';
const SOFT = '#b9d0bf';

const MARKS: Record<ClassKey, React.ReactNode> = {
  // a path bending up toward a point
  'CL-01': (
    <>
      <path d="M22 80c14-6 8-22 22-28s8-22 26-30" stroke={INK} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <path d="M62 20l10 2-3 10" stroke={INK} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="26" cy="79" r="5" fill={HOT} />
    </>
  ),
  // a set square over a plan
  'CL-02': (
    <>
      <path d="M26 74V28l46 46Z" stroke={INK} strokeWidth="3.2" strokeLinejoin="round" fill={SOFT} fillOpacity="0.5" />
      <path d="M26 56h13M26 42h8" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="64" cy="62" r="4.5" fill={HOT} />
    </>
  ),
  // an anchor
  'CL-03': (
    <>
      <circle cx="50" cy="26" r="6" stroke={INK} strokeWidth="3.2" fill="none" />
      <path d="M50 32v44M36 44h28M24 62c2 14 14 20 26 20s24-6 26-20" stroke={INK} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <circle cx="24" cy="62" r="3.6" fill={HOT} />
    </>
  ),
  // a spark with rays
  'CL-04': (
    <>
      <path d="M50 18l6 22 22 4-22 8-6 22-8-22-22-6 22-6Z" stroke={INK} strokeWidth="3" strokeLinejoin="round" fill={SOFT} fillOpacity="0.55" />
      <circle cx="76" cy="24" r="4" fill={HOT} />
      <circle cx="22" cy="72" r="3" fill={HOT} />
    </>
  ),
  // two hands under a roof
  'CL-05': (
    <>
      <path d="M20 46L50 22l30 24" stroke={INK} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M28 44v32h44V44" stroke={INK} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="50" cy="60" r="6" fill={HOT} />
    </>
  ),
  // an eye
  'CL-06': (
    <>
      <path d="M14 50c10-16 24-24 36-24s26 8 36 24c-10 16-24 24-36 24S24 66 14 50Z" stroke={INK} strokeWidth="3.2" strokeLinejoin="round" fill="none" />
      <circle cx="50" cy="50" r="12" stroke={INK} strokeWidth="3" fill={SOFT} fillOpacity="0.6" />
      <circle cx="50" cy="50" r="5" fill={HOT} />
    </>
  ),
  // an arrow breaking a line
  'CL-07': (
    <>
      <path d="M18 66l22-22 12 10 28-30" stroke={INK} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M62 24h18v18" stroke={INK} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="22" cy="72" r="4.6" fill={HOT} />
    </>
  ),
  // a heart made of two loops
  'CL-08': (
    <>
      <path d="M50 76C24 58 20 38 32 30c8-5 15-1 18 7 3-8 10-12 18-7 12 8 8 28-18 46Z" stroke={INK} strokeWidth="3.2" strokeLinejoin="round" fill={SOFT} fillOpacity="0.55" />
      <circle cx="68" cy="26" r="4" fill={HOT} />
    </>
  ),
};

export function ClassEmblem({ name, className }: { name: ClassKey; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={cn('h-20 w-20', className)} fill="none" aria-hidden="true">
      <path d="M50 6C76 6 94 24 94 50s-18 44-44 44S6 76 6 50 24 6 50 6Z" stroke={INK} strokeWidth="1.6" strokeDasharray="2 5" strokeLinecap="round" opacity="0.55" />
      {MARKS[name]}
    </svg>
  );
}
