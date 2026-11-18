import type { ClassKey } from '@/components/class-emblem';

/**
 * The eight personality classes as the public site shows them. The class a person actually gets, with its full
 * description and who it pairs with, always comes from the server; this list only fills the landing page.
 */
export const CLASS_LIST: { key: ClassKey; name: string; tagline: string }[] = [
  { key: 'CL-01', name: 'CL-01', tagline: 'Curious, energetic, first through the door.' },
  { key: 'CL-02', name: 'CL-02', tagline: 'Plans the system, then builds it well.' },
  { key: 'CL-03', name: 'CL-03', tagline: 'Steady hands, warm heart, a team’s centre.' },
  { key: 'CL-04', name: 'CL-04', tagline: 'Lights up a room and a project.' },
  { key: 'CL-05', name: 'CL-05', tagline: 'Looks after people and the way things are done.' },
  { key: 'CL-06', name: 'CL-06', tagline: 'Sees what others miss.' },
  { key: 'CL-07', name: 'CL-07', tagline: 'Drives results and gets things moving.' },
  { key: 'CL-08', name: 'CL-08', tagline: 'Reads the room and cares how it feels.' },
];
