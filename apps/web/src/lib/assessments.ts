import axios from 'axios';
import type { CompanyRetake } from '@/lib/retakes';
import { apiClient } from '@/lib/api';

export type TraitKey = 'openness' | 'conscientiousness' | 'extraversion' | 'agreeableness' | 'neuroticism';
export type Level = 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';
export type AssessmentStatus = 'not_started' | 'in_progress' | 'completed';
export type BlockedReason = 'RETAKE_LOCKED' | 'PAYMENT_REQUIRED' | 'PAYMENT_UNAVAILABLE' | null;

/** URL segment -> official assessment slug */
export const ASSESSMENT_SLUGS = { snapshot: 'ocean-snapshot', full: 'ocean-full' } as const;
export type AssessmentRoute = keyof typeof ASSESSMENT_SLUGS;

export interface AssessmentListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: 'free_snapshot' | 'full_assessment';
  version: string;
  total_questions: number;
  estimated_minutes: number;
  status: AssessmentStatus;
  in_progress: { submission_id: string; progress_percent: number; answered: number } | null;
  latest_result: { id: string; submission_number: number; completed_at: string } | null;
  can_start: boolean;
  blocked_reason: BlockedReason;
  retake_available_at: string | null;
  /** What a paid attempt costs, when the assessment needs a purchase. */
  price: { amount: number; currency: string } | null;
  /** A company that covers this attempt (the person accepted its invitation). The company then sees the result. */
  company_cover: { id: string; name: string } | null;
  /** Set when repeating through the company needs its approval (ask, waiting, or approved). */
  company_retake: CompanyRetake | null;
}

export interface QuestionView {
  id: string;
  number: number;
  text: string;
  min: number;
  max: number;
  options: string[];
  values: number[];
}

export interface SubmissionView {
  id: string;
  status: string;
  submission_number: number;
  progress_percent: number;
  answered: number;
  total: number;
  is_locked: boolean;
  result_id: string | null;
  assessment: { id: string; slug: string; name: string; type: string; total_questions: number };
  questions: QuestionView[];
  answers: Record<string, number>;
}

export const INSIGHT_SECTIONS = [
  ['personality', 'Your personality'],
  ['communication', 'How you communicate'],
  ['leadership', 'How you lead'],
  ['working_style', 'How you work'],
  ['relationship_style', 'How you relate to others'],
  ['strengths', 'Your strengths'],
  ['blind_spots', 'Possible blind spots'],
  ['recommendations', 'Where to go from here'],
] as const;
export type InsightKey = (typeof INSIGHT_SECTIONS)[number][0];
/** The full reading has all eight sections; the free snapshot's short analysis has three of them. */
export type Insights = Partial<Record<InsightKey, { summary: string; points: string[] }>>;

/** A personality class: a named style, with the classes it tends to work well with. Never a rank. */
export interface ProfileClass {
  key: string;
  name: string;
  tagline: string;
  description: string;
  strengths: string[];
  watch: string;
  pairs_note: string;
  pairs_with: { key: string; name: string; tagline: string }[];
}

/** A progress step (explorer, insight, evolving), not a ranking of personality. */
export interface Tier {
  key: 'explorer' | 'insight' | 'evolving';
  name: string;
  step: 1 | 2 | 3;
  of: 3;
  description: string;
  next: string | null;
}

export interface TraitResult {
  trait: TraitKey;
  score: number;
  level: Level;
  level_label: string;
  description: string | null;
}

/** A company-made assessment's result: sections instead of the five traits. */
export interface CustomResult {
  sections: { key: string; name: string; description: string | null; score: number; level: Level; level_label: string; band: 'low' | 'medium' | 'high'; text: string }[];
  overall: { score: number; level: Level; level_label: string };
}

export interface ResultView {
  id: string;
  assessment: { id: string; slug: string; name: string; type: string; version: string };
  submission_number: number;
  is_current: boolean;
  previous_result_id: string | null;
  completed_at: string;
  duration_seconds: number | null;
  is_preview: boolean;
  traits: TraitResult[];
  profile_class: ProfileClass | null;
  tier: Tier | null;
  disclaimer: string | null;
  retake: { available: boolean; available_at: string | null } | null;
  /** Name of the company this result was taken for, which can therefore see it. */
  company: string | null;
  kind: 'ocean' | 'custom';
  custom: CustomResult | null;
  insights: Insights | null;
  insights_generated_at: string | null;
  /** True when the server can write insights (an AI key is configured). */
  insights_available: boolean;
}

export interface ResultSummary {
  id: string;
  assessment: { slug: string; name: string; type: string };
  submission_number: number;
  is_current: boolean;
  is_preview: boolean;
  company: string | null;
  kind: 'ocean' | 'custom';
  overall_score: number;
  completed_at: string;
  traits: Pick<TraitResult, 'trait' | 'score' | 'level' | 'level_label'>[];
}

export const listAssessments = () => apiClient.get('/assessments').then((r) => r.data.data as AssessmentListItem[]);

export const startAssessment = (id: string, organizationId?: string) =>
  apiClient.post(`/assessments/${id}/start`, organizationId ? { organization_id: organizationId } : {}).then((r) => r.data as { resumed: boolean; submission: SubmissionView });

export const getSubmission = (id: string) => apiClient.get(`/submissions/${id}`).then((r) => r.data as SubmissionView);

export const saveAnswers = (id: string, answers: { question_id: string; value: number }[]) =>
  apiClient
    .put(`/submissions/${id}/answers`, { answers })
    .then((r) => r.data as { answered: number; total: number; progress_percent: number });

export const completeSubmission = (id: string) => apiClient.post(`/submissions/${id}/complete`).then((r) => r.data as ResultView);

export const listResults = (assessment?: string) =>
  apiClient.get('/results', { params: assessment ? { assessment } : undefined }).then((r) => r.data.data as ResultSummary[]);

export const getResult = (id: string) => apiClient.get(`/results/${id}`).then((r) => r.data as ResultView);

export interface ApiProblem {
  status: number | null;
  code: string | null;
  message: string;
  retakeAvailableAt: string | null;
  missing: number | null;
}

/** Turns a failed API call into something the UI can branch on (code) and show (message). */
export function readApiProblem(err: unknown, fallback = 'Something went wrong. Please try again.'): ApiProblem {
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      return { status: null, code: 'NETWORK', message: 'We couldn’t reach the server. Check your connection.', retakeAvailableAt: null, missing: null };
    }
    const data = err.response.data ?? {};
    const message = Array.isArray(data.message) ? data.message[0] : data.message;
    return {
      status: err.response.status,
      code: data.code ?? null,
      message: typeof message === 'string' ? message : fallback,
      retakeAvailableAt: data.retake_available_at ?? null,
      missing: typeof data.missing === 'number' ? data.missing : null,
    };
  }
  return { status: null, code: null, message: fallback, retakeAvailableAt: null, missing: null };
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function daysUntil(value: string | null) {
  if (!value) return null;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86400000));
}

/** Trait scores as 0-1 values in the order the radar expects (O, C, E, A, N). */
export function radarValues(traits: { trait: TraitKey; score: number }[]) {
  const order: TraitKey[] = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
  return order.map((t) => (traits.find((x) => x.trait === t)?.score ?? 0) / 100);
}
