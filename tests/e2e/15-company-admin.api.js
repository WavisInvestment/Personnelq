// Company administrators and HR: no personal side, one member in full, the company profile, and pausing people.
process.env.W5_TAG = 'cadm';
const lib = require('./lib');
const { prisma, check, makeUser, assessments, finish, cleanup } = lib;
const fresh = () => ({ 'X-Forwarded-For': `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}` });
const call = (method, path, token, body, headers = {}) => lib.call(method, path, token, body, { ...fresh(), ...headers });
const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });

async function join(admin, org, person, roleKey) {
  const inv = await call('POST', `/organizations/${org.id}/invitations`, admin.token, { emails: [person.email], ...(roleKey && { role: roleKey }) });
  const token = inv.body.invitations[0].link.split('/invite/')[1];
  const acc = await call('POST', `/invitations/${token}/accept`, person.token);
  if (acc.status !== 200) throw new Error('join failed ' + acc.text);
}
async function finishFor(user, fullId, orgId) {
  const start = await call('POST', `/assessments/${fullId}/start`, user.token, { organization_id: orgId });
  const sub = start.body.submission;
  for (let i = 0; i < sub.questions.length; i += 10) await call('PUT', `/submissions/${sub.id}/answers`, user.token, { answers: sub.questions.slice(i, i + 10).map((q) => ({ question_id: q.id, value: 4 })) });
  return (await call('POST', `/submissions/${sub.id}/complete`, user.token)).body;
}

(async () => {
  const boss = await makeUser('boss', { first: 'Ada', last: 'Boss' });
  const org = await prisma.organization.create({ data: { name: 'Admin Co', slug: 'w5-cadm-co', type: 'corporate', admin_name: 'Ada Boss', admin_email: boss.email } });
  await prisma.organizationMember.create({ data: { user_id: boss.id, organization_id: org.id, role_id: (await role('admin')).id } });
  await prisma.subscription.create({ data: { organization_id: org.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 1, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 30 * 86400000), auto_renew: false, seats_limit: 6 } });
  const O = `/organizations/${org.id}`;
  const hr = await makeUser('hr', { first: 'Hana', last: 'Resources' });
  const hr2 = await makeUser('hr2', { first: 'Hugo', last: 'Second' });
  const emp = await makeUser('emp', { first: 'Eli', last: 'Employee' });
  const emp2 = await makeUser('emp2', { first: 'Nia', last: 'Newcomer' });
  await join(boss, org, hr, 'hr');
  await join(boss, org, hr2, 'hr');
  await join(boss, org, emp);
  await join(boss, org, emp2);
  const { full } = await assessments(emp.token);
  const result = await finishFor(emp, full.id, org.id);

  // ================================================================== no personal side
  console.log('\n--- company administrators and HR keep to the company');
  const closed = [['GET', '/assessments'], ['GET', '/assessments/company'], ['POST', `/assessments/${full.id}/start`], ['GET', '/results'], ['GET', '/me/progress'], ['GET', `/results/${result.id}`], ['POST', '/payments/checkout', { assessment_id: full.id }], ['POST', '/retake-requests', { assessment_id: full.id, organization_id: org.id }]];
  for (const [who, user] of [['administrator', boss], ['HR', hr]]) {
    const bad = [];
    for (const [m, p, b] of closed) {
      const r = await call(m, p, user.token, b);
      if (!(r.status === 403 && r.body?.code === 'COMPANY_STAFF_NO_ASSESSMENTS')) bad.push(`${m} ${p} -> ${r.status} ${r.body?.code ?? ''}`);
    }
    check(`${who}: ${closed.length} personal routes are refused (COMPANY_STAFF_NO_ASSESSMENTS)`, bad.length === 0, bad.join('; '));
  }
  const allowed = [];
  for (const [who, user] of [['administrator', boss], ['HR', hr]]) {
    for (const p of ['/account', '/me/organizations', `${O}/dashboard`, `${O}/members`, '/payments']) {
      const r = await call('GET', p, user.token);
      if (r.status !== 200) allowed.push(`${who} ${p} -> ${r.status} ${r.body?.code ?? ''}`);
    }
  }
  check('they can still use their account, their company list, the company pages and payment history', allowed.length === 0, allowed.join('; '));
  check('the administrator can still manage billing for the plan', (await call('GET', `/payments/billing/${org.id}`, boss.token)).status === 200);
  check('an ordinary employee is unaffected', (await call('GET', '/assessments', emp.token)).status === 200 && (await call('GET', '/results', emp.token)).status === 200);
  await call('PATCH', `${O}/members/${hr2.id}`, boss.token, { role: 'employee' });
  check('someone demoted to employee gets the personal side back, straight away', (await call('GET', '/assessments', hr2.token)).status === 200);
  await call('PATCH', `${O}/members/${hr2.id}`, boss.token, { role: 'hr' });
  check('and loses it again when made HR once more', (await call('GET', '/assessments', hr2.token)).body?.code === 'COMPANY_STAFF_NO_ASSESSMENTS');

  // ================================================================== one member in full
  console.log('\n--- one member in full');
  const d = await call('GET', `${O}/members/${emp.id}`, boss.token);
  check('the administrator opens a member', d.status === 200 && d.body.person.name === 'Eli Employee' && d.body.person.role === 'employee' && d.body.person.email === emp.email, d.text?.slice(0, 160));
  check('it shows who invited them and that they agreed to share results', d.body.invitation?.invited_by === 'Ada Boss' && d.body.person.shares_results === true && !!d.body.invitation.accepted_at);
  check('it lists what they took through the company', d.body.assessments.length === 1 && d.body.assessments[0].status === 'completed' && d.body.assessments[0].result_id === result.id);
  check('it says what the viewer may do', d.body.can.suspend === true && d.body.can.remove === true && d.body.can.view_result === true && d.body.can.reactivate === false, JSON.stringify(d.body.can));
  check('it never carries scores', !/_score|openness|neuroticism|overall|answers|ai_interpretation/i.test(JSON.stringify(d.body)));
  check('HR can open a member too', (await call('GET', `${O}/members/${emp.id}`, hr.token)).status === 200);
  check('an employee cannot (403)', (await call('GET', `${O}/members/${emp2.id}`, emp.token)).status === 403);
  check('someone outside the company is a 404', (await call('GET', `${O}/members/${(await makeUser('stranger')).id}`, boss.token)).status === 404);
  const adminView = await call('GET', `${O}/members/${hr.id}`, boss.token);
  check('an administrator may pause HR, but HR may not pause HR', adminView.body.can.suspend === true && (await call('GET', `${O}/members/${hr2.id}`, hr.token)).body.can.suspend === false);
  check('nobody is offered pausing the administrator or themselves', (await call('GET', `${O}/members/${boss.id}`, hr.token)).body.can.suspend === false && (await call('GET', `${O}/members/${hr.id}`, hr.token)).body.can.suspend === false);
  const view = await call('GET', `${O}/members/${emp.id}/result`, boss.token);
  check('their result is still a separate, audited step', view.status === 200 && (await prisma.auditLog.count({ where: { organization_id: org.id, action: 'member.result_viewed', user_id: emp.id } })) === 1);

  // ================================================================== company profile
  console.log('\n--- company profile');
  const p = await call('GET', `${O}/profile`, boss.token);
  check('the administrator reads it and may edit', p.status === 200 && p.body.name === 'Admin Co' && p.body.can_edit === true && p.body.admin_email === boss.email && p.body.plan.name === 'Team');
  check('it lists the administrators and HR', p.body.leaders.length === 3 && p.body.leaders.some((l) => l.role === 'admin') && p.body.leaders.filter((l) => l.role === 'hr').length === 2);
  const hp = await call('GET', `${O}/profile`, hr.token);
  check('HR reads it but may not edit', hp.status === 200 && hp.body.can_edit === false);
  check('HR cannot change it (403)', (await call('PATCH', `${O}/profile`, hr.token, { name: 'Hacked' })).status === 403);
  check('an employee cannot read it (403)', (await call('GET', `${O}/profile`, emp.token)).status === 403);
  const up = await call('PATCH', `${O}/profile`, boss.token, { name: '  Admin Group  ', admin_phone: '+234 800 000 0000' });
  check('the administrator changes the name and phone (trimmed)', up.status === 200 && up.body.changed === true && up.body.name === 'Admin Group' && up.body.admin_phone === '+234 800 000 0000', up.text);
  const audit = await prisma.auditLog.findFirst({ where: { organization_id: org.id, action: 'organization.updated' }, orderBy: { created_at: 'desc' } });
  check('the change is in the audit trail, with before and after', audit?.changes?.name?.from === 'Admin Co' && audit.changes.name.to === 'Admin Group' && !!audit.changes.admin_phone);
  check('the web address and the contact email cannot be changed here (400)', (await call('PATCH', `${O}/profile`, boss.token, { slug: 'new-slug' })).status === 400 && (await call('PATCH', `${O}/profile`, boss.token, { admin_email: 'x@y.co' })).status === 400);
  check('an empty name is refused, and an unchanged save does nothing', (await call('PATCH', `${O}/profile`, boss.token, { name: '   ' })).body?.code === 'REQUIRED' && (await call('PATCH', `${O}/profile`, boss.token, { name: 'Admin Group' })).body.changed === false);
  check('phone can be cleared', (await call('PATCH', `${O}/profile`, boss.token, { admin_phone: '' })).body.admin_phone === null);

  // ================================================================== pausing people
  console.log('\n--- pausing and restoring people');
  const before = (await call('GET', `${O}/dashboard`, boss.token)).body.team.members;
  const pause = await call('POST', `${O}/members/${emp.id}/suspend`, boss.token, { reason: '  On leave until January  ' });
  check('the administrator pauses an employee', pause.status === 200 && pause.body.status === 'suspended');
  const after = await call('GET', `${O}/members`, boss.token);
  check('they leave the team and appear under paused, with the reason', !after.body.data.some((m) => m.user_id === emp.id) && after.body.suspended.length === 1 && after.body.suspended[0].reason === 'On leave until January', JSON.stringify(after.body.suspended));
  check('the team count drops by one, and a seat is free', (await call('GET', `${O}/dashboard`, boss.token)).body.team.members === before - 1);
  const pd = await call('GET', `${O}/members/${emp.id}`, boss.token);
  check('their page shows the pause, hides the result link, and offers to restore', pd.body.person.status === 'suspended' && pd.body.person.suspended_reason === 'On leave until January' && pd.body.assessments[0].result_id === null && pd.body.can.reactivate === true && pd.body.can.suspend === false && pd.body.can.view_result === false);
  check('their result is no longer reachable by the company (404)', (await call('GET', `${O}/members/${emp.id}/result`, boss.token)).status === 404);
  const list = (await call('GET', '/assessments', emp.token)).body.data.find((a) => a.slug === 'ocean-full');
  check('they are no longer covered by the company, and cannot start through it (403)', list.company_cover === null && (await call('POST', `/assessments/${full.id}/start`, emp.token, { organization_id: org.id })).body?.code === 'COMPANY_COVER_UNAVAILABLE');
  check('they can still sign in and use their own personal side', (await call('GET', '/results', emp.token)).status === 200);
  check('pausing twice is a 404 (they are no longer active)', (await call('POST', `${O}/members/${emp.id}/suspend`, boss.token, {})).status === 404);
  const reinvite = await call('POST', `${O}/invitations`, boss.token, { emails: [emp.email] });
  const accept = await call('POST', `/invitations/${reinvite.body.invitations[0].link.split('/invite/')[1]}/accept`, emp.token);
  check('a paused person cannot slip back in by accepting a fresh invitation (409 MEMBER_SUSPENDED)', accept.status === 409 && accept.body.code === 'MEMBER_SUSPENDED', accept.text);

  check('the administrator cannot pause themselves (400)', (await call('POST', `${O}/members/${boss.id}/suspend`, boss.token, {})).body?.code === 'CANNOT_PAUSE_SELF');
  check('nobody can pause an administrator (409)', (await call('POST', `${O}/members/${boss.id}/suspend`, hr.token, {})).body?.code === 'CANNOT_PAUSE_ADMIN');
  check('HR cannot pause HR (403)', (await call('POST', `${O}/members/${hr2.id}/suspend`, hr.token, {})).status === 403);
  check('HR can pause an employee', (await call('POST', `${O}/members/${emp2.id}/suspend`, hr.token, { reason: 'Trial ended' })).status === 200);
  check('an employee cannot pause anyone (403)', (await call('POST', `${O}/members/${emp2.id}/suspend`, emp.token, {})).status === 403);
  check('the administrator can pause HR', (await call('POST', `${O}/members/${hr2.id}/suspend`, boss.token, {})).status === 200);
  check('HR cannot restore HR (403), the administrator can', (await call('POST', `${O}/members/${hr2.id}/reactivate`, hr.token)).status === 403 && (await call('POST', `${O}/members/${hr2.id}/reactivate`, boss.token)).status === 200);

  // seats: the plan holds 6 and 4 people + the administrator... fill it, then try to restore
  await prisma.subscription.update({ where: { organization_id: org.id }, data: { seats_limit: 3 } });
  const full1 = await call('POST', `${O}/members/${emp2.id}/reactivate`, hr.token);
  check('restoring is refused when there is no open seat (409 SEATS_FULL)', full1.status === 409 && full1.body.code === 'SEATS_FULL', full1.text);
  await prisma.subscription.update({ where: { organization_id: org.id }, data: { seats_limit: 6 } });
  check('with a seat free, the person is restored', (await call('POST', `${O}/members/${emp2.id}/reactivate`, hr.token)).body?.status === 'active');
  check('restoring someone who is not paused is a 404', (await call('POST', `${O}/members/${emp2.id}/reactivate`, hr.token)).status === 404);
  const back = await call('POST', `${O}/members/${emp.id}/reactivate`, boss.token);
  check('the first employee is restored, back in the team with their result visible', back.status === 200 && (await call('GET', `${O}/members`, boss.token)).body.data.some((m) => m.user_id === emp.id) && (await call('GET', `${O}/members/${emp.id}/result`, boss.token)).status === 200);
  check('and covered by the company again', (await call('GET', '/assessments', emp.token)).body.data.find((a) => a.slug === 'ocean-full').company_cover?.id === org.id);
  const actions = (await prisma.auditLog.findMany({ where: { organization_id: org.id, action: { in: ['member.suspended', 'member.reactivated'] } } })).map((a) => a.action);
  check('every pause and restore is in the audit trail', actions.filter((a) => a === 'member.suspended').length >= 3 && actions.filter((a) => a === 'member.reactivated').length >= 3, actions.join(','));

  // a paused person can still leave
  await call('POST', `${O}/members/${emp2.id}/suspend`, boss.token, {});
  const leave = await call('POST', `${O}/leave`, emp2.token);
  check('a paused person can still leave the company', leave.status === 200, leave.text);

  await prisma.organization.deleteMany({ where: { slug: { startsWith: 'w5-cadm' } } });
  void cleanup;
  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await cleanup(); } catch {} process.exit(2); });
