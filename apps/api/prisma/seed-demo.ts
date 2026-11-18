/*
 * Sample data for development and demos: a company with a team and results, a school, an individual with a public
 * badge, payments, invitations and a waiting retake request. Run it after the normal seed:
 *
 *   npm run db:seed:demo
 *
 * Safe to run again: it first removes everything it made before (people whose address ends in @demo.test and the
 * organisations whose address starts with demo-), then creates it fresh. It never touches anything else, and refuses
 * to run in production.
 *
 * Everyone signs in with the same password (below). Results are written directly, with plausible scores, so there
 * are no answers behind them: this is for looking at screens, not for testing scoring.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { LIKERT_LABELS, LIKERT_VALUES } from '../src/modules/assessments/catalog/ocean-items';

if (process.env.NODE_ENV === 'production') {
  console.error('The demo data is for development only. Refusing to run in production.');
  process.exit(1);
}

const prisma = new PrismaClient();
const PASSWORD = 'Demo2026@pb';
const DAY = 24 * 60 * 60 * 1000;

/** Scores that look like real people: a stable pseudo-random spread per person, 15 to 92. */
const scores = (seed: number) => {
  const pick = (k: number) => Math.round(15 + ((seed * 37 + k * 53) % 78) + ((seed * k) % 5));
  return { openness: pick(1), conscientiousness: pick(2), extraversion: pick(3), agreeableness: pick(4), neuroticism: pick(5) };
};
const overall = (s: ReturnType<typeof scores>) => Math.round((s.openness + s.conscientiousness + s.extraversion + s.agreeableness + (100 - s.neuroticism)) / 5);

async function main() {
  const [individual, roles, snapshot, full] = await Promise.all([
    prisma.role.findFirstOrThrow({ where: { scope: 'account', key: 'individual' } }),
    prisma.role.findMany({ where: { scope: 'organization' } }),
    prisma.assessment.findFirstOrThrow({ where: { slug: 'ocean-snapshot', organization_id: null } }),
    prisma.assessment.findFirstOrThrow({ where: { slug: 'ocean-full', organization_id: null } }),
  ]).catch(() => {
    throw new Error('Run "npm run db:seed" first: the roles and the official assessments are missing.');
  });
  const role = (key: string) => roles.find((r) => r.key === key)!.id;
  const hash = await bcrypt.hash(PASSWORD, 10);

  // ---- start clean (only what this script made)
  const old = await prisma.organization.findMany({ where: { slug: { startsWith: 'demo-' } }, select: { id: true } });
  await prisma.organization.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  const oldUsers = await prisma.user.findMany({ where: { email: { endsWith: '@demo.test' } }, select: { id: true } });
  await prisma.payment.deleteMany({ where: { user_id: { in: oldUsers.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: oldUsers.map((u) => u.id) } } });

  let counter = 0;
  const person = (email: string, first_name: string, last_name: string) =>
    prisma.user.create({ data: { email: `${email}@demo.test`, first_name, last_name, password_hash: hash, email_verified: true, email_verified_at: new Date(), account_role_id: individual.id } });

  /** A finished assessment, optionally taken through a company. Returns the result. */
  const finished = async (userId: string, assessmentId: string, organizationId: string | null, daysAgo: number, seed: number) => {
    const completed = new Date(Date.now() - daysAgo * DAY);
    const s = scores(seed);
    const submission = await prisma.assessmentSubmission.create({
      data: { user_id: userId, organization_id: organizationId, assessment_id: assessmentId, status: 'completed', progress_percent: 100, started_at: new Date(completed.getTime() - 25 * 60 * 1000), completed_at: completed, duration_seconds: 1500, is_current: true },
    });
    return prisma.assessmentResult.create({
      data: { user_id: userId, organization_id: organizationId, assessment_id: assessmentId, submission_id: submission.id, ...Object.fromEntries(Object.entries(s).map(([k, v]) => [`${k}_score`, v])), overall_score: overall(s), is_current: true, calculated_at: completed },
    });
  };
  const inProgress = (userId: string, assessmentId: string, organizationId: string | null, percent: number) =>
    prisma.assessmentSubmission.create({ data: { user_id: userId, organization_id: organizationId, assessment_id: assessmentId, status: 'in_progress', progress_percent: percent, current_question: Math.round((percent / 100) * 50) } });

  // ---- an individual with a snapshot, a full result and a public badge
  const ada = await person('ada', 'Ada', 'Okafor');
  await finished(ada.id, snapshot.id, null, 40, 11);
  const adaResult = await finished(ada.id, full.id, null, 21, 12);
  const token = randomBytes(32).toString('base64url');
  await prisma.shareableBadge.create({
    data: { user_id: ada.id, result_id: adaResult.id, share_token: token, share_url: `/b/${token}`, is_public: true, published_at: new Date(), shared_elements: { scores: true, descriptions: true, date: true }, display_name: 'Ada O.', custom_message: 'Always curious. Ask me about maps.', view_count: 14, last_viewed_at: new Date() },
  });
  await prisma.payment.create({ data: { user_id: ada.id, amount: 5000, currency: 'NGN', status: 'success', payment_method: 'card', provider_reference: `demo-pay-${++counter}-${Date.now()}`, payment_type: 'assessment', assessment_id: full.id, description: 'Full Big Five assessment', processed_at: new Date(Date.now() - 22 * DAY) } });

  const ben = await person('ben', 'Ben', 'Adeyemi');
  await finished(ben.id, snapshot.id, null, 3, 21);
  await person('chika', 'Chika', 'Nwosu'); // signed up, nothing taken yet

  // ---- a company: Acme Logistics
  const boss = await person('admin.acme', 'Ngozi', 'Eze');
  const hr = await person('hr.acme', 'Tunde', 'Bello');
  const acme = await prisma.organization.create({ data: { name: 'Acme Logistics', slug: 'demo-acme-logistics', type: 'corporate', admin_name: 'Ngozi Eze', admin_email: boss.email, subscription_plan: 'team', subscription_status: 'active', subscription_end_date: new Date(Date.now() + 24 * DAY), max_employees: 25 } });
  await prisma.organizationMember.createMany({
    data: [
      { user_id: boss.id, organization_id: acme.id, role_id: role('admin'), job_title: 'Managing Director' },
      { user_id: hr.id, organization_id: acme.id, role_id: role('hr'), department: 'Human Resources', job_title: 'HR Lead' },
    ],
  });
  const team: [string, string, string, string, 'done' | 'half' | 'none'][] = [
    ['kemi', 'Kemi', 'Adebayo', 'Logistics', 'done'], ['segun', 'Segun', 'Alabi', 'Logistics', 'done'], ['amaka', 'Amaka', 'Obi', 'Finance', 'done'],
    ['yusuf', 'Yusuf', 'Garba', 'Finance', 'half'], ['ife', 'Ife', 'Balogun', 'Sales', 'done'], ['dayo', 'Dayo', 'Ojo', 'Sales', 'none'],
    ['zainab', 'Zainab', 'Musa', 'Engineering', 'done'], ['tobi', 'Tobi', 'Lawal', 'Engineering', 'done'], ['hauwa', 'Hauwa', 'Sani', 'Operations', 'half'],
  ];
  let seed = 100;
  const staffMembers: Record<string, string> = {};
  for (const [handle, first, last, department, state] of team) {
    const u = await person(`${handle}.acme`, first, last);
    staffMembers[handle] = u.id;
    // The team joined from invitations, so these accounts stay with the company.
    await prisma.user.update({ where: { id: u.id }, data: { joined_via_organization_id: acme.id } });
    await prisma.organizationMember.create({ data: { user_id: u.id, organization_id: acme.id, role_id: role('employee'), department, consented_at: new Date(Date.now() - 20 * DAY), joined_at: new Date(Date.now() - 20 * DAY) } });
    if (state === 'done') await finished(u.id, full.id, acme.id, 3 + (seed % 14), ++seed);
    if (state === 'half') await inProgress(u.id, full.id, acme.id, 40 + (seed++ % 30));
  }
  await prisma.subscription.create({ data: { organization_id: acme.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(Date.now() - 6 * DAY), end_date: new Date(Date.now() + 24 * DAY), auto_renew: false, seats_used: team.length, seats_limit: 25 } });
  await prisma.payment.create({ data: { user_id: boss.id, organization_id: acme.id, amount: 50000, currency: 'NGN', status: 'success', payment_method: 'card', provider_reference: `demo-pay-${++counter}-${Date.now()}`, payment_type: 'subscription', subscription_plan: 'team', description: 'Team plan for Acme Logistics', processed_at: new Date(Date.now() - 6 * DAY) } });
  for (const email of ['new.hire@demo.test', 'contractor@demo.test']) {
    const t = randomBytes(32).toString('base64url');
    await prisma.employeeInvitation.create({ data: { organization_id: acme.id, sender_id: hr.id, recipient_email: email, department: 'Operations', invitation_token: t, invitation_url: `/invite/${t}`, expires_at: new Date(Date.now() + 11 * DAY), assessment_id: full.id, open_key: `${acme.id}:${email}` } });
  }
  // someone who already finished is asking to repeat it
  await prisma.retakeRequest.create({ data: { organization_id: acme.id, user_id: staffMembers.kemi, assessment_id: full.id, status: 'requested', requested_by: 'member', open_key: `${acme.id}:${staffMembers.kemi}:${full.id}` } });

  // a published company-made assessment, from the sample in docs/examples
  const sample = JSON.parse(readFileSync(join(__dirname, '../../../docs/examples/custom-assessment-customer-service.json'), 'utf8'));
  const custom = await prisma.assessment.create({
    data: {
      organization_id: acme.id, name: sample.name, description: sample.description, type: 'custom_assessment', framework: 'custom', scoring_method: 'custom', version: '1.0.0',
      allow_retake: sample.allow_retake, retake_interval_days: sample.retake_interval_days, created_by: boss.id, is_locked: true, published_at: new Date(Date.now() - 5 * DAY),
      total_questions: sample.sections.reduce((n: number, sec: { questions: unknown[] }) => n + sec.questions.length, 0),
      definition: { sections: sample.sections.map((sec: { name: string; description: string | null; weight: number; interpretation: object }, i: number) => ({ key: `s${i + 1}`, name: sec.name, description: sec.description, weight: sec.weight, interpretation: sec.interpretation })) },
    },
  });
  await prisma.assessmentQuestion.createMany({
    data: sample.sections.flatMap((sec: { questions: { text: string; reverse: boolean; weight: number }[] }, i: number) => sec.questions.map((q) => ({ section: i, ...q }))).map((q: { section: number; text: string; reverse: boolean; weight: number }, n: number) => ({
      assessment_id: custom.id, question_number: n + 1, question_text: q.text, question_type: 'likert', section_key: `s${q.section + 1}`, ocean_direction: q.reverse ? 'reverse' : 'positive', weight: q.weight, min_score: 1, max_score: 5, options: LIKERT_LABELS, option_values: LIKERT_VALUES,
    })),
  });

  // ---- a school: Westfield Secondary
  const head = await person('head.westfield', 'Folake', 'Adeniyi');
  const school = await prisma.organization.create({ data: { name: 'Westfield Secondary', slug: 'demo-westfield-secondary', type: 'school', admin_name: 'Folake Adeniyi', admin_email: head.email, subscription_plan: 'team', subscription_status: 'active', subscription_end_date: new Date(Date.now() + 200 * DAY), max_employees: 50 } });
  await prisma.organizationMember.create({ data: { user_id: head.id, organization_id: school.id, role_id: role('admin'), job_title: 'Head teacher' } });
  for (const [handle, first, last, cls, done] of [['sade', 'Sade', 'Coker', 'Year 9', true], ['emeka', 'Emeka', 'Eze', 'Year 9', true], ['bola', 'Bola', 'Hassan', 'Year 10', false]] as const) {
    const u = await person(`${handle}.westfield`, first, last);
    await prisma.user.update({ where: { id: u.id }, data: { joined_via_organization_id: school.id } });
    await prisma.organizationMember.create({ data: { user_id: u.id, organization_id: school.id, role_id: role('employee'), department: cls, consented_at: new Date(Date.now() - 9 * DAY) } });
    if (done) await finished(u.id, full.id, school.id, 4, ++seed);
  }
  await prisma.subscription.create({ data: { organization_id: school.id, plan_name: 'Team', status: 'active', billing_cycle: 'annual', amount: 450000, currency: 'NGN', start_date: new Date(Date.now() - 165 * DAY), end_date: new Date(Date.now() + 200 * DAY), auto_renew: false, seats_used: 3, seats_limit: 50 } });

  console.log('Demo data created.\n');
  console.log(`Everyone signs in with the password: ${PASSWORD}\n`);
  console.log('  Individual with a public badge   ada@demo.test');
  console.log('  Individual, snapshot only        ben@demo.test');
  console.log('  Individual, nothing taken        chika@demo.test');
  console.log('  Company administrator            admin.acme@demo.test   (Acme Logistics: 9 people, results, invitations, a retake request)');
  console.log('  Company HR                       hr.acme@demo.test');
  console.log('  Employee with a finished result  kemi.acme@demo.test');
  console.log('  School head                      head.westfield@demo.test');
  console.log(`  Public badge page                /b/${token}`);
  console.log('  Platform admin (base seed)       admin@personnelq.local / DevAdmin2026@pb');
}

main()
  .catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
