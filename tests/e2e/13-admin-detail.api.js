// Platform staff cannot use the user side of the platform, and can open one person or one company in full.
process.env.W5_TAG = 'adm';
const lib = require('./lib');
const { prisma, check, makeUser, assessments, finish, cleanup } = lib;
const fresh = () => ({ 'X-Forwarded-For': `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}` });
const call = (method, path, token, body, headers = {}) => lib.call(method, path, token, body, { ...fresh(), ...headers });
const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });
const staffRole = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'platform', key } });

(async () => {
  // ---- people: two staff (full and read-only), an administrator with a company, and a person with a result and a badge
  const boss = await makeUser('boss', { first: 'Super', last: 'Admin' });
  const reader = await makeUser('reader', { first: 'Read', last: 'Only' });
  await prisma.user.update({ where: { id: boss.id }, data: { platform_role_id: (await staffRole('super_admin')).id } });
  await prisma.user.update({ where: { id: reader.id }, data: { platform_role_id: (await staffRole('support')).id } });
  const ada = await makeUser('ada', { first: 'Ada', last: 'Okafor' });
  const owner = await makeUser('owner', { first: 'Ngozi', last: 'Eze' });
  const org = await prisma.organization.create({ data: { name: 'Detail Co', slug: 'w5-adm-co', type: 'corporate', admin_name: 'Ngozi Eze', admin_email: owner.email } });
  await prisma.organizationMember.create({ data: { user_id: owner.id, organization_id: org.id, role_id: (await role('admin')).id } });
  await prisma.subscription.create({ data: { organization_id: org.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 20 * 86400000), auto_renew: false, seats_used: 1, seats_limit: 10 } });
  const inv = await call('POST', `/organizations/${org.id}/invitations`, owner.token, { emails: [ada.email], department: 'Finance' });
  await call('POST', `/invitations/${inv.body.invitations[0].link.split('/invite/')[1]}/accept`, ada.token);
  const { full } = await assessments(ada.token);
  const start = await call('POST', `/assessments/${full.id}/start`, ada.token, { organization_id: org.id });
  for (let i = 0; i < start.body.submission.questions.length; i += 10) await call('PUT', `/submissions/${start.body.submission.id}/answers`, ada.token, { answers: start.body.submission.questions.slice(i, i + 10).map((q) => ({ question_id: q.id, value: 4 })) });
  const result = (await call('POST', `/submissions/${start.body.submission.id}/complete`, ada.token)).body;
  const badge = await call('PUT', `/results/${result.id}/badge`, ada.token, { is_public: true });
  await prisma.payment.create({ data: { user_id: ada.id, amount: 5000, currency: 'NGN', status: 'success', payment_method: 'card', provider_reference: `w5-grant-adm-${Date.now()}`, payment_type: 'assessment', description: 'Detail test payment', processed_at: new Date() } });

  // ================================================================== staff stay out of the user side
  console.log('\n--- platform staff and the user side');
  const me = await call('POST', '/auth/me', boss.token);
  check('staff can still sign in and see who they are', me.status === 200 && me.body.platform_role === 'super_admin');
  check('staff hold platform permissions only (nothing personal)', me.body.permissions.every((p) => p.includes('_') || true) && !me.body.permissions.some((p) => ['take:assessments', 'read:own_results', 'manage:own_account', 'download:own_reports'].includes(p)), JSON.stringify(me.body.permissions));
  const closed = [
    ['GET', '/assessments'], ['GET', '/assessments/company'], ['POST', `/assessments/${full.id}/start`], ['GET', '/results'], ['GET', '/me/progress'], ['GET', '/me/organizations'],
    ['GET', '/account'], ['GET', '/account/export'], ['POST', '/payments/checkout', { assessment_id: full.id }], ['GET', '/payments/billing/' + org.id],
    ['GET', `/organizations/${org.id}/dashboard`], ['GET', `/results/${result.id}/badge`], ['POST', '/retake-requests', { assessment_id: full.id, organization_id: org.id }],
  ];
  for (const who of [['super admin', boss], ['read-only support', reader]]) {
    const refused = [];
    for (const [m, p, b] of closed) {
      const r = await call(m, p, who[1].token, b);
      if (!(r.status === 403 && r.body?.code === 'STAFF_ADMIN_ONLY')) refused.push(`${m} ${p} -> ${r.status} ${r.body?.code ?? ''}`);
    }
    check(`${who[0]}: ${closed.length} user-side routes are all refused with STAFF_ADMIN_ONLY`, refused.length === 0, refused.join('; '));
  }
  check('the same routes still work for an ordinary person', (await call('GET', '/assessments', ada.token)).status === 200 && (await call('GET', '/account', ada.token)).status === 200);
  check('staff can still use the admin routes', (await call('GET', '/admin/overview', boss.token)).status === 200 && (await call('GET', '/admin/users?limit=5', reader.token)).status === 200);
  check('staff can sign out', (await call('POST', '/auth/logout', boss.token, { refresh_token: 'x'.repeat(20) })).status === 200);

  // ================================================================== one individual
  console.log('\n--- one individual');
  const detail = await call('GET', `/admin/users/${ada.id}`, boss.token);
  const u = detail.body;
  check('opens', detail.status === 200 && u.id === ada.id && u.email === ada.email && u.first_name === 'Ada', detail.text?.slice(0, 160));
  check('shows the company, role, department, and whether results are shared', u.companies.length === 1 && u.companies[0].name === 'Detail Co' && u.companies[0].role === 'employee' && u.companies[0].department === 'Finance' && u.companies[0].shares_results === true, JSON.stringify(u.companies));
  check('shows what they took, for whom, and that it finished', u.assessments.length === 1 && u.assessments[0].status === 'completed' && u.assessments[0].company?.name === 'Detail Co' && u.assessments[0].attempt === 1, JSON.stringify(u.assessments));
  check('shows payments and the badge state', u.payments.length === 1 && u.payments[0].description === 'Detail test payment' && u.badges.length === 1 && u.badges[0].is_public === true);
  check('shows sign-in facts', u.sign_in.active_sessions >= 1 && !!u.sign_in.last_signed_in && u.email_verified === true);
  const raw = JSON.stringify(u);
  check('never includes scores, answers, insights, the badge link or any secret', !/_score|openness|neuroticism|overall|answer|ai_interpretation|share_token|share_url|password|refresh_token/i.test(raw) && !raw.includes(badge.body.badge?.share_path ?? 'no-badge-path'), raw.match(/_score|openness|answer|share_token|password/i)?.[0]);
  check('read-only support can open it too', (await call('GET', `/admin/users/${ada.id}`, reader.token)).status === 200);
  check('an ordinary person cannot (403)', (await call('GET', `/admin/users/${ada.id}`, ada.token)).status === 403);
  check('no sign-in cannot (401)', (await call('GET', `/admin/users/${ada.id}`)).status === 401);
  check('an unknown person is a 404', (await call('GET', '/admin/users/does-not-exist', boss.token)).status === 404);
  const staffView = await call('GET', `/admin/users/${boss.id}`, boss.token);
  check('a staff member shows their platform role', staffView.body.platform_role === 'super_admin' && staffView.body.platform_role_name === 'Super admin');

  // a deleted account stays viewable as an anonymised record
  const gone = await makeUser('gone', { first: 'Gone', last: 'Soon' });
  await call('DELETE', '/account', gone.token, { password: lib.PW });
  const goneView = await call('GET', `/admin/users/${gone.id}`, boss.token);
  check('a deleted account is shown as deleted, anonymised', goneView.status === 200 && goneView.body.deleted === true && goneView.body.first_name === 'Deleted' && /deleted\.invalid$/.test(goneView.body.email), goneView.text?.slice(0, 160));

  // ================================================================== one company
  console.log('\n--- one company');
  const co = await call('GET', `/admin/organizations/${org.id}`, boss.token);
  const c = co.body;
  check('opens, with contact and type', co.status === 200 && c.name === 'Detail Co' && c.type === 'corporate' && c.admin_email === owner.email, co.text?.slice(0, 160));
  check('shows the plan and seats', c.subscription?.plan_name === 'Team' && c.subscription.seats_limit === 10 && c.subscription.status === 'active');
  check('lists its people with role, department and progress', c.members.length === 2 && c.members.find((m) => m.email === ada.email)?.progress === 'completed' && c.members.find((m) => m.email === ada.email)?.department === 'Finance' && c.members.find((m) => m.email === owner.email)?.role === 'admin' && c.members.find((m) => m.email === owner.email)?.shares_results === false, JSON.stringify(c.members.map((m) => [m.name, m.role, m.progress])));
  check('counts people, and summarises invitations', c.counts.active_members === 2 && c.invitations.accepted === 1 && c.invitations.recent.length === 1);
  check('shows recent activity from its audit trail', c.activity.length >= 1 && c.activity.some((a) => a.action === 'invitation.accepted'), JSON.stringify(c.activity.map((a) => a.action)));
  const craw = JSON.stringify(c);
  check('never includes anyone’s scores or answers', !/_score|openness|neuroticism|answer|ai_interpretation|password|invitation_token/i.test(craw), craw.match(/_score|openness|answer|invitation_token|password/i)?.[0]);
  check('opening it is written to the company’s audit trail', (await prisma.auditLog.count({ where: { organization_id: org.id, action: 'platform.company_viewed', actor_id: boss.id } })) >= 1);
  const shown = await call('GET', `/organizations/${org.id}/dashboard`, owner.token);
  check('and the company’s own dashboard is unaffected', shown.status === 200);
  check('read-only support can open it', (await call('GET', `/admin/organizations/${org.id}`, reader.token)).status === 200);
  check('the company’s own administrator cannot (403)', (await call('GET', `/admin/organizations/${org.id}`, owner.token)).status === 403);
  check('an unknown company is a 404', (await call('GET', '/admin/organizations/does-not-exist', boss.token)).status === 404);
  check('the lists still work', (await call('GET', '/admin/organizations?limit=5', boss.token)).status === 200 && (await call('GET', '/admin/users?limit=5', boss.token)).status === 200);

  await prisma.organization.deleteMany({ where: { slug: { startsWith: 'w5-adm' } } });
  await prisma.payment.deleteMany({ where: { provider_reference: { startsWith: 'w5-grant-adm' } } });
  await prisma.user.deleteMany({ where: { id: gone.id } });
  void cleanup;
  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await cleanup(); } catch {} process.exit(2); });
