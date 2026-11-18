import { apiClient } from '@/lib/api';
import type { Level, TraitKey } from '@/lib/assessments';

export type Scores = Record<TraitKey, number>;
export type MemberStatus = 'completed' | 'in_progress' | 'not_started';

export interface DashboardData {
  organization: { id: string; name: string; type: string; status?: string; suspended_reason?: string | null };
  plan: { name: string; active: boolean; end_date: string | null; seats_limit: number; seats_used: number } | null;
  team: { members: number; completed: number; in_progress: number; not_started: number; pending_invitations: number; completion_pct: number };
  distribution: { trait: TraitKey; average: number | null; low: number; medium: number; high: number; high_pct: number }[];
  departments: { department: string; members: number; completed: number; averages: Record<TraitKey, number | null> }[];
  recent: { type: 'completed' | 'joined' | 'invited'; who: string; at: string }[];
}

export interface TeamMember {
  user_id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  job_title: string | null;
  joined_at: string;
  status: MemberStatus;
  progress_percent: number | null;
  /** The personality class of the person's company result; null until they finish. */
  profile_class: { key: string; name: string } | null;
  result: { id: string; completed_at: string; overall: number; scores: Scores } | null;
}

export interface ClassGroup {
  key: string;
  name: string;
  tagline: string;
  description: string;
  strengths: string[];
  watch: string;
  pairs_note: string;
  pairs_with: { key: string; name: string; tagline: string }[];
  count: number;
  members: { user_id: string; name: string; department: string | null; job_title: string | null; role: string }[];
}

export interface ClassesOverview {
  classes: ClassGroup[];
  classified: number;
  not_classified: { user_id: string; name: string; department: string | null; job_title: string | null; role: string }[];
  balance: { most_common: { key: string; name: string; count: number } | null; missing: { key: string; name: string }[] };
}

export type CompanyRole = 'employee' | 'hr' | 'admin';

export interface StaffRow {
  user_id: string;
  name: string;
  email: string;
  role: CompanyRole;
}

export interface InvitationRow {
  id: string;
  email: string;
  role: CompanyRole;
  department: string | null;
  job_title: string | null;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  sent_at: string;
  expires_at: string;
  accepted_at: string | null;
  link: string | null;
}

export interface InviteOutcome {
  id: string;
  email: string;
  status: 'invited' | 'already_member' | 'already_invited';
  link: string | null;
  email_status: 'sent' | 'not_configured' | 'failed' | null;
}

export interface MemberResult {
  member: { user_id: string; name: string; email: string; department: string | null; job_title: string | null; joined_at: string };
  result: {
    id: string;
    assessment: string;
    completed_at: string;
    traits: { trait: TraitKey; score: number; level: Level; level_label: string; description: string }[];
  };
}

export interface InvitationInfo {
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  organization_name: string;
  organization_type: string;
  inviter_name: string;
  email: string;
  email_hint: string;
  role: { key: string; name: string };
  department: string | null;
  job_title: string | null;
  expires_at: string;
}

export interface Progress {
  summary: { assessments_taken: number; full_attempts: number; last_taken: string | null };
  points: { result_id: string; completed_at: string; attempt: number; company: string | null; scores: Scores }[];
  change: Record<TraitKey, { from: number; to: number; delta: number; trend: 'up' | 'down' | 'steady' }> | null;
}

/** Wording that fits the kind of organisation. The data is the same; only the names change. */
export interface Terms {
  nav: string;
  title: string;
  org: string;
  people: string;
  unit: string;
  units: string;
  empty: string;
  joined: string;
  /** What each company role is called here. The permissions are the same; only the name fits the setting. */
  roles: Record<CompanyRole, string>;
}
const TERMS: Record<string, Terms> = {
  corporate: { nav: 'Company', title: 'Company dashboard', org: 'company', people: 'People', unit: 'Department', units: 'By department', empty: 'No one has joined yet', joined: 'joined the company', roles: { employee: 'Employee', hr: 'HR', admin: 'Administrator' } },
  school: { nav: 'School', title: 'School dashboard', org: 'school', people: 'Students and staff', unit: 'Class or team', units: 'By class or team', empty: 'No one has joined yet', joined: 'joined the school', roles: { employee: 'Student or staff', hr: 'Coordinator', admin: 'Administrator' } },
  church: { nav: 'Community', title: 'Community dashboard', org: 'community', people: 'Members', unit: 'Group', units: 'By group', empty: 'No members have joined yet', joined: 'joined the community', roles: { employee: 'Member', hr: 'Leader', admin: 'Administrator' } },
  professional: { nav: 'Practice', title: 'Practice dashboard', org: 'practice', people: 'People', unit: 'Team', units: 'By team', empty: 'No one has joined yet', joined: 'joined the practice', roles: { employee: 'Team member', hr: 'Manager', admin: 'Administrator' } },
};
export const termsFor = (type: string | undefined): Terms => TERMS[type ?? ''] ?? TERMS.corporate;

export interface ReminderResult {
  sent: number;
  skipped_recent: number;
  not_emailed: number;
  waiting: number;
}
export const sendReminders = (id: string) => apiClient.post(`/organizations/${id}/reminders`).then((r) => r.data as ReminderResult);

const base = (id: string) => `/organizations/${id}`;

export const getDashboard = (id: string) => apiClient.get(`${base(id)}/dashboard`).then((r) => r.data as DashboardData);
export interface PausedMember {
  user_id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  reason: string | null;
  since: string;
}
/** The team (people who are active) and, separately, people whose access a company leader has paused. */
export const getClasses = (id: string) => apiClient.get(`${base(id)}/classes`).then((r) => r.data as ClassesOverview);
export type MatchFit = 'strong' | 'good' | 'same_class' | 'different_style';
export interface MatchPerson {
  user_id: string;
  name: string;
  department: string | null;
  class_key: string;
  class_name: string;
}
export interface MatchGroup {
  members: MatchPerson[];
  fit: MatchFit;
  joined_by?: { person: MatchPerson; fits: MatchFit[] };
}
export interface MatchResult {
  groups: MatchGroup[];
  seed: number;
  cross_department: boolean;
  people: number;
  not_classified: number;
}
/** Suggested pairs by class. A suggestion only: nothing is saved. A new seed gives another set. */
export const getMatches = (id: string, opts: { crossDepartment: boolean; seed?: number }) =>
  apiClient.get(`${base(id)}/classes/matches`, { params: { cross_department: opts.crossDepartment, ...(opts.seed !== undefined && { seed: opts.seed }) } }).then((r) => r.data as MatchResult);
export const getMembers = (id: string) => apiClient.get(`${base(id)}/members`).then((r) => ({ team: r.data.data as TeamMember[], paused: (r.data.suspended ?? []) as PausedMember[] }));

export interface MemberDetail {
  person: { user_id: string; name: string; email: string; role: CompanyRole; role_name: string; department: string | null; job_title: string | null; joined_at: string; status: 'active' | 'suspended'; shares_results: boolean; suspended_reason: string | null };
  invitation: { sent_at: string; accepted_at: string | null; role: string; invited_by: string } | null;
  assessments: { id: string; name: string; type: string; status: string; attempt: number; progress_percent: number; started_at: string; completed_at: string | null; result_id: string | null }[];
  retakes: { id: string; assessment: string; status: string; requested_by: string; requested_at: string; decided_at: string | null; expires_at: string | null }[];
  can: { suspend: boolean; reactivate: boolean; remove: boolean; view_result: boolean };
}
export const getMemberDetail = (id: string, userId: string) => apiClient.get(`${base(id)}/members/${userId}`).then((r) => r.data as MemberDetail);
export const suspendMember = (id: string, userId: string, reason?: string) => apiClient.post(`${base(id)}/members/${userId}/suspend`, { reason: reason || null });
export const reactivateMember = (id: string, userId: string) => apiClient.post(`${base(id)}/members/${userId}/reactivate`);

export interface CompanyProfile {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  suspended_reason: string | null;
  admin_name: string;
  admin_email: string;
  admin_phone: string | null;
  created_at: string;
  plan: { name: string; active: boolean; end_date: string | null; seats_limit: number } | null;
  people: number;
  leaders: { name: string; email: string; role: string; role_name: string }[];
  can_edit: boolean;
}
export const getCompanyProfile = (id: string) => apiClient.get(`${base(id)}/profile`).then((r) => r.data as CompanyProfile);
export const updateCompanyProfile = (id: string, body: { name?: string; admin_name?: string; admin_phone?: string | null }) => apiClient.patch(`${base(id)}/profile`, body).then((r) => r.data as { changed: boolean });
export const getMemberResult = (id: string, userId: string) => apiClient.get(`${base(id)}/members/${userId}/result`).then((r) => r.data as MemberResult);
export const setMemberDepartment = (id: string, userId: string, department: string | null) => apiClient.patch(`${base(id)}/members/${userId}`, { department });
export const setMemberRole = (id: string, userId: string, role: CompanyRole) => apiClient.patch(`${base(id)}/members/${userId}`, { role });
export const getStaff = (id: string) => apiClient.get(`${base(id)}/staff`).then((r) => r.data.data as StaffRow[]);
export const removeMember = (id: string, userId: string) => apiClient.delete(`${base(id)}/members/${userId}`);
export const leaveCompany = (id: string) => apiClient.post(`${base(id)}/leave`);

export const listInvitations = (id: string) => apiClient.get(`${base(id)}/invitations`).then((r) => r.data.data as InvitationRow[]);
export const sendInvitations = (id: string, body: { emails: string[]; department?: string | null; job_title?: string | null; role?: CompanyRole }) =>
  apiClient.post(`${base(id)}/invitations`, body).then((r) => r.data.invitations as InviteOutcome[]);
export const revokeInvitation = (id: string, invitationId: string) => apiClient.delete(`${base(id)}/invitations/${invitationId}`);
export const resendInvitation = (id: string, invitationId: string) =>
  apiClient.post(`${base(id)}/invitations/${invitationId}/resend`).then((r) => r.data as { email_status: string; link: string });

/** Downloads through the authenticated client (a plain link couldn't send the login token). */
export async function downloadFile(path: string, fallbackName: string) {
  const res = await apiClient.get(path, { responseType: 'blob' });
  const name = /filename="([^"]+)"/.exec(String(res.headers['content-disposition'] ?? ''))?.[1] ?? fallbackName;
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export const downloadCsv = (id: string) => downloadFile(`${base(id)}/export/results.csv`, 'team-results.csv');
export const downloadTeamPdf = (id: string) => downloadFile(`${base(id)}/export/team-report.pdf`, 'team-report.pdf');

export const getInvitationInfo = (token: string) =>
  apiClient.get(`/invitations/${encodeURIComponent(token)}`).then((r) => r.data as InvitationInfo);
export const acceptInvitation = (token: string) =>
  apiClient.post(`/invitations/${encodeURIComponent(token)}/accept`).then((r) => r.data as { organization: { id: string; name: string }; already_accepted: boolean; next: { href: string } });

export const getProgress = () => apiClient.get('/me/progress').then((r) => r.data as Progress);
