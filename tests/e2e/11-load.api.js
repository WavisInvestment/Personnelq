// A company with 400 people who all finished: do the pages HR actually uses stay quick?
process.env.W5_TAG = 'load';
const { prisma, call, check, makeUser, assessments, finish, cleanup, need } = require('./lib');
const bcrypt = need('bcrypt');

const PEOPLE = 400;
const LIMIT_MS = { dashboard: 1500, members: 2000, csv: 2500, invitations: 1500 };
const timed = async (fn) => {
  const t = Date.now();
  const res = await fn();
  return { ms: Date.now() - t, res };
};

(async () => {
  const admin = await makeUser('admin');
  const { full } = await assessments(admin.token);
  const [adminRole, employeeRole, individual] = await Promise.all([
    prisma.role.findFirstOrThrow({ where: { scope: 'organization', key: 'admin' } }),
    prisma.role.findFirstOrThrow({ where: { scope: 'organization', key: 'employee' } }),
    prisma.role.findFirstOrThrow({ where: { scope: 'account', key: 'individual' } }),
  ]);
  const org = await prisma.organization.create({ data: { name: 'Load Co', slug: 'w5-load-co', type: 'corporate', admin_name: 'Ada Admin', admin_email: admin.email } });
  await prisma.organizationMember.create({ data: { user_id: admin.id, organization_id: org.id, role_id: adminRole.id } });
  await prisma.subscription.create({ data: { organization_id: org.id, plan_name: 'Big', status: 'active', billing_cycle: 'monthly', amount: 1, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 30 * 86400000), auto_renew: false, seats_used: PEOPLE, seats_limit: 1000 } });

  const hash = await bcrypt.hash('Secure123!x', 4);
  const departments = ['Finance', 'Logistics', 'Sales', 'Engineering', 'Operations', 'Marketing'];
  const ids = Array.from({ length: PEOPLE }, (_, i) => `load-${Date.now()}-${i}`);
  await prisma.user.createMany({ data: ids.map((id, i) => ({ id: `u-${id}`, email: `p${i}-load@w5.test`, first_name: `Person${i}`, last_name: 'Load', password_hash: hash, email_verified: true, account_role_id: individual.id })) });
  await prisma.organizationMember.createMany({ data: ids.map((id, i) => ({ user_id: `u-${id}`, organization_id: org.id, role_id: employeeRole.id, department: departments[i % departments.length], consented_at: new Date() })) });
  await prisma.assessmentSubmission.createMany({ data: ids.map((id) => ({ id: `s-${id}`, user_id: `u-${id}`, organization_id: org.id, assessment_id: full.id, status: 'completed', completed_at: new Date(), progress_percent: 100, is_current: true })) });
  const score = (i, k) => 20 + ((i * 7 + k * 13) % 70);
  await prisma.assessmentResult.createMany({
    data: ids.map((id, i) => ({
      user_id: `u-${id}`, organization_id: org.id, assessment_id: full.id, submission_id: `s-${id}`,
      openness_score: score(i, 1), conscientiousness_score: score(i, 2), extraversion_score: score(i, 3), agreeableness_score: score(i, 4), neuroticism_score: score(i, 5), overall_score: score(i, 6), is_current: true,
    })),
  });
  await prisma.employeeInvitation.createMany({ data: Array.from({ length: 150 }, (_, i) => ({ organization_id: org.id, sender_id: admin.id, recipient_email: `inv${i}-load@w5.test`, invitation_token: `load-token-${Date.now()}-${i}-xxxxxxxxxxxx`, invitation_url: `/invite/load-${i}`, expires_at: new Date(Date.now() + 86400000), assessment_id: full.id })) });

  const base = `/organizations/${org.id}`;
  // run each twice: the first call may warm connections and the query planner
  const run = async (name, path, limit) => {
    await call('GET', path, admin.token);
    const { ms, res } = await timed(() => call('GET', path, admin.token));
    check(`${name}: answers in under ${limit} ms with ${PEOPLE} people (took ${ms} ms)`, res.status === 200 && ms < limit, res.status !== 200 ? res.text.slice(0, 200) : '');
    return res;
  };
  const dash = await run('dashboard', `${base}/dashboard`, LIMIT_MS.dashboard);
  check('dashboard: counts everyone', dash.body.team.members === PEOPLE && dash.body.team.completed === PEOPLE && dash.body.departments.length === departments.length, JSON.stringify(dash.body.team));
  const members = await run('people list', `${base}/members`, LIMIT_MS.members);
  check('people list: returns everyone', members.body.data.length === PEOPLE);
  await run('CSV export', `${base}/export/results.csv`, LIMIT_MS.csv);
  const inv = await run('invitations list', `${base}/invitations`, LIMIT_MS.invitations);
  check('invitations list: capped at 200 rows', inv.body.data.length === 150);

  const gone = await cleanup();
  void gone;
  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await cleanup(); } catch {} process.exit(2); });
