import { z } from 'zod';

export const LIMITS = {
  sections: 10,
  questionsTotal: 100,
  assessmentsPerOrganization: 25,
};

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => z.preprocess((v) => (v === '' ? null : v), text(max).nullable().optional());

const questionInput = z
  .object({
    text: text(300),
    reverse: z.boolean(),
    weight: z.number().int().min(1).max(3),
  })
  .strict();

const sectionInput = z
  .object({
    name: text(60),
    description: optionalText(300),
    weight: z.number().int().min(1).max(5),
    interpretation: z.object({ low: text(500), medium: text(500), high: text(500) }).strict(),
    questions: z.array(questionInput).max(50),
  })
  .strict();

/** What the editor saves. A draft may be unfinished (empty names, no questions yet); publishing checks completeness. */
export const nameInput = text(80);

export const draftInput = z
  .object({
    name: nameInput,
    description: optionalText(500),
    allow_retake: z.boolean(),
    retake_interval_days: z.number().int().min(1).max(730),
    sections: z.array(sectionInput).max(LIMITS.sections),
  })
  .strict()
  .superRefine((d, ctx) => {
    const total = d.sections.reduce((n, s) => n + s.questions.length, 0);
    if (total > LIMITS.questionsTotal) ctx.addIssue({ code: 'custom', message: `An assessment can have at most ${LIMITS.questionsTotal} questions.` });
  });

export type DraftInput = z.infer<typeof draftInput>;

/** The first problem with a draft that stops it being published, in plain words. Null means it is ready. */
export function publishProblem(d: DraftInput): string | null {
  if (d.name.length < 3) return 'Give the assessment a name (at least 3 characters).';
  if (d.sections.length === 0) return 'Add at least one section.';
  const names = new Set<string>();
  for (const [i, s] of d.sections.entries()) {
    const label = s.name || `Section ${i + 1}`;
    if (s.name.length < 1) return `Give section ${i + 1} a name.`;
    if (names.has(s.name.toLowerCase())) return `Two sections are called “${s.name}”. Give each its own name.`;
    names.add(s.name.toLowerCase());
    if (s.questions.length === 0) return `Add at least one question to “${label}”.`;
    for (const [j, q] of s.questions.entries()) {
      if (q.text.length < 5) return `Question ${j + 1} in “${label}” needs some text (at least 5 characters).`;
    }
  }
  return null;
}

export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  const where = issue.path.length ? ` (${issue.path.join(' › ')})` : '';
  return `${issue.message}${where}`;
}
