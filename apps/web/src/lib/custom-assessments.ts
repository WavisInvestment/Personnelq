import { apiClient } from '@/lib/api';
import type { CompanyRetake } from '@/lib/retakes';
import { downloadFile } from '@/lib/company';

export interface Interpretation {
  low: string;
  medium: string;
  high: string;
}

export interface QuestionDraft {
  text: string;
  reverse: boolean;
  weight: number;
}

export interface SectionDraft {
  name: string;
  description: string | null;
  weight: number;
  interpretation: Interpretation;
  questions: QuestionDraft[];
}

export interface AssessmentModel {
  id: string;
  name: string;
  description: string | null;
  version: string;
  status: 'draft' | 'published';
  published_at: string | null;
  allow_retake: boolean;
  retake_interval_days: number;
  sections: SectionDraft[];
}

export interface AssessmentListItem {
  id: string;
  name: string;
  description: string | null;
  version: string;
  status: 'draft' | 'published';
  published_at: string | null;
  sections: number;
  questions: number;
  completed: number;
  in_progress: number;
  team_size: number;
}

export interface AssessmentResults {
  assessment: { id: string; name: string; version: string; status: string };
  team: { members: number; completed: number; in_progress: number; not_started: number; completion_pct: number; overall_average: number | null };
  sections: { key: string; name: string; average: number | null; low: number; medium: number; high: number }[];
  members: {
    user_id: string;
    name: string;
    email: string;
    department: string | null;
    job_title: string | null;
    status: 'completed' | 'in_progress' | 'not_started';
    progress_percent: number | null;
    completed_at: string | null;
    overall: { score: number; level_label: string } | null;
    sections: { key: string; score: number; level_label: string }[];
  }[];
}

/** An assessment a person can take, written by a company that covers them. */
export interface CompanyAssessment {
  id: string;
  name: string;
  description: string | null;
  company: { id: string; name: string };
  total_questions: number;
  estimated_minutes: number;
  status: 'not_started' | 'in_progress' | 'completed';
  in_progress: { progress_percent: number } | null;
  latest_result: { id: string; completed_at: string } | null;
  can_start: boolean;
  /** Repeating needs the company's approval: ask, waiting, or approved. */
  company_retake: CompanyRetake | null;
}

const base = (orgId: string) => `/organizations/${orgId}/assessments`;

export const listAssessments = (orgId: string) => apiClient.get(base(orgId)).then((r) => r.data.data as AssessmentListItem[]);
export const createAssessment = (orgId: string, name: string) => apiClient.post(base(orgId), { name }).then((r) => r.data.id as string);
export const getAssessment = (orgId: string, id: string) => apiClient.get(`${base(orgId)}/${id}`).then((r) => r.data as AssessmentModel);
export const saveAssessment = (orgId: string, id: string, body: Omit<AssessmentModel, 'id' | 'version' | 'status' | 'published_at'>) =>
  apiClient.put(`${base(orgId)}/${id}`, body).then((r) => r.data as AssessmentModel);
export const publishAssessment = (orgId: string, id: string) => apiClient.post(`${base(orgId)}/${id}/publish`).then((r) => r.data as AssessmentModel);
export const newVersion = (orgId: string, id: string) => apiClient.post(`${base(orgId)}/${id}/new-version`).then((r) => r.data.id as string);
export const archiveAssessment = (orgId: string, id: string) => apiClient.delete(`${base(orgId)}/${id}`);
export const getAssessmentResults = (orgId: string, id: string) => apiClient.get(`${base(orgId)}/${id}/results`).then((r) => r.data as AssessmentResults);
export const downloadAssessmentCsv = (orgId: string, id: string) => downloadFile(`${base(orgId)}/${id}/results.csv`, 'assessment-results.csv');

export const listCompanyAssessments = () => apiClient.get('/assessments/company').then((r) => r.data.data as CompanyAssessment[]);
