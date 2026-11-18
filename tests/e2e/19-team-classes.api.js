process.env.W5_TAG = 'tcl';
const { prisma, call, check, makeUser, assessments, takeAssessment, finish } = require('./lib');

(async () => {
  const admin = await makeUser('admin', { first: 'Ada', last: 'Boss' });
  const hr = await makeUser('hr', { first: 'Hana', last: 'Resources' });
  const e1 = await makeUser('e1', { first: 'Eve', last: 'Okafor' });
  const e2 = await makeUser('e2', { first: 'Tunde', last: 'Bello' });
  const e3 = await makeUser('e3', { first: 'Nia', last: 'Waiting' });
  const outsider = await makeUser('out');
  const org = await prisma.organization.create({ data: { name: 'Class Co', slug: 'w5-tcl-co', type: 'corporate', admin_name: 'Ada Boss', admin_email: admin.email, subscription_plan: 'team', subscription_status: 'active' } });
  const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });
  await prisma.organizationMember.create({ data: { user_id: admin.id, organization_id: org.id, role_id: (await role('admin')).id } });
  await prisma.subscription.create({ data: { organization_id: org.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 25 * 86400000), auto_renew: false, seats_limit: 10 } });
  const O = `/organizations/${org.id}`;
  for (const [u, r] of [[hr, 'hr'], [e1], [e2], [e3]]) {
    const inv = await call('POST', `${O}/invitations`, admin.token, { emails: [u.email], ...(r && { role: r }) });
    await call('POST', `/invitations/${inv.body.invitations[0].link.split('/invite/')[1]}/accept`, u.token);
  }
  const { full } = await assessments(e1.token);
  // two people answer high, one answers low, so they land in different classes; e3 never finishes
  const finish1 = async (u, value) => {
    const start = await call('POST', `/assessments/${full.id}/start`, u.token, { organization_id: org.id });
    const sub = start.body.submission;
    for (let i = 0; i < sub.questions.length; i += 10) await call('PUT', `/submissions/${sub.id}/answers`, u.token, { answers: sub.questions.slice(i, i + 10).map((q) => ({ question_id: q.id, value })) });
    return call('POST', `/submissions/${sub.id}/complete`, u.token);
  };
  await finish1(e1, 4);
  await finish1(e2, 2);

  const out = await call('GET', `${O}/classes`, admin.token);
  check('an administrator sees all eight classes, with the people who are in each', out.status === 200 && out.body.classes.length === 8 && out.body.classified === 2, out.text.slice(0, 150));
  const named = out.body.classes.flatMap((c) => c.members.map((m) => `${m.name}:${c.name}`));
  check('Eve and Tunde are each in a class, Nia (not finished) is listed separately', named.some((n) => /^Eve Okafor:CL-0[1-8]$/.test(n)) && named.some((n) => /^Tunde Bello:CL-0[1-8]$/.test(n)) && out.body.not_classified.some((m) => m.name === 'Nia Waiting') && !out.body.not_classified.some((m) => /Eve|Tunde/.test(m.name)), JSON.stringify(named));
  check('each class carries who it pairs well with', out.body.classes.every((c) => c.pairs_with.length === 3 && c.strengths.length === 3));
  check('it reports the team’s shape: most common class and the classes nobody has', out.body.balance.most_common?.count >= 1 && out.body.balance.missing.length >= 5);
  check('no scores, emails or answers are in this view', !/score|@w5\.test|answer/i.test(JSON.stringify(out.body)));
  check('HR can see it too', (await call('GET', `${O}/classes`, hr.token)).status === 200);
  check('an employee cannot (403) and nor can someone outside the company (403)', (await call('GET', `${O}/classes`, e1.token)).status === 403 && (await call('GET', `${O}/classes`, outsider.token)).status === 403);
  check('no login is refused (401)', (await call('GET', `${O}/classes`)).status === 401);

  const m1 = await call('GET', `${O}/classes/matches?cross_department=true&seed=7`, admin.token);
  check('auto-match suggests a group for the two people who have a class, with a fit for the pair', m1.status === 200 && m1.body.groups.length === 1 && m1.body.groups[0].members.length === 2 && ['strong', 'good', 'same_class', 'different_style'].includes(m1.body.groups[0].fit) && m1.body.people === 2, m1.text.slice(0, 160));
  check('...people without a class are left out and counted', m1.body.not_classified >= 1 && !JSON.stringify(m1.body.groups).includes('Nia'));
  check('...the same seed gives the same suggestion', JSON.stringify((await call('GET', `${O}/classes/matches?cross_department=true&seed=7`, admin.token)).body.groups) === JSON.stringify(m1.body.groups));
  check('...it exposes names and classes only, no dimension scores or emails', !/scores|_score|@w5.test/i.test(JSON.stringify(m1.body)));
  check('...HR can use it, an employee and an outsider cannot (403), and a bad seed is ignored', (await call('GET', `${O}/classes/matches`, hr.token)).status === 200 && (await call('GET', `${O}/classes/matches`, e1.token)).status === 403 && (await call('GET', `${O}/classes/matches`, outsider.token)).status === 403 && (await call('GET', `${O}/classes/matches?seed=abc`, admin.token)).status === 200);

  const members = (await call('GET', `${O}/members`, admin.token)).body.data;
  check('the people list carries each person’s class, and null for someone who has not finished', /^CL-0[1-8]$/.test(members.find((m) => m.name === 'Eve Okafor').profile_class?.name) && members.find((m) => m.name === 'Nia Waiting').profile_class === null);

  const csv = await fetch(`http://localhost:3101/api/v1${O}/export/results.csv`, { headers: { Authorization: `Bearer ${admin.token}` } }).then((r) => r.text());
  check('the CSV export has a Personality class column with the class for each finisher', /Personality class/.test(csv.split('\n')[0]) && /,CL-0[1-8]\s*$/m.test(csv));

  await prisma.subscription.deleteMany({ where: { organization_id: org.id } });
  await finish();
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
