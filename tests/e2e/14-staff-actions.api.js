// What platform staff can do: unlock, send a reset, suspend a person or a company, and refund a payment.
process.env.W5_TAG = 'act';
const lib = require('./lib');
const { prisma, fake, check, makeUser, assessments, finish, cleanup, PW } = lib;
const fresh = () => ({ 'X-Forwarded-For': `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}` });
const call = (method, path, token, body, headers = {}) => lib.call(method, path, token, body, { ...fresh(), ...headers });
const emails = () => fake('resend', '/__control/emails');
const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });
const staffRole = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'platform', key } });
const login = (email, password = PW) => call('POST', '/auth/login', null, { email, password });
const key = (l) => `w5-act-${l}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** Pays through the fake Paystack the way a customer would, and returns the settled payment. */
async function settle(path, token, body) {
  const co = await call('POST', path, token, body);
  if (co.status !== 200) throw new Error(`checkout failed ${co.status} ${co.text}`);
  await fake('paystack', '/__control/set', 'POST', { reference: co.body.reference, patch: { status: 'success', paid_at: new Date().toISOString(), channel: 'card' } });
  await call('GET', `/payments/verify?reference=${co.body.reference}`, token);
  return prisma.payment.findUniqueOrThrow({ where: { provider_reference: co.body.reference } });
}

(async () => {
  await fake('resend', '/__control/reset', 'POST');
  await fake('paystack', '/__control/reset', 'POST');
  const boss = await makeUser('boss', { first: 'Super', last: 'Admin' });
  const reader = await makeUser('reader', { first: 'Read', last: 'Only' });
  await prisma.user.update({ where: { id: boss.id }, data: { platform_role_id: (await staffRole('super_admin')).id } });
  await prisma.user.update({ where: { id: reader.id }, data: { platform_role_id: (await staffRole('support')).id } });

  const V = await makeUser('victim', { first: 'Vic', last: 'Tim' });
  const act = (action, id, token = boss.token, body) => call('POST', `/admin/users/${id}/${action}`, token, body);

  // ================================================================== who may
  console.log('\n--- who may do what');
  const everyAction = [['users', V.id, 'unlock'], ['users', V.id, 'password-reset'], ['users', V.id, 'suspend', { reason: 'Just testing' }], ['users', V.id, 'reactivate'], ['organizations', 'x', 'suspend', { reason: 'Just testing' }], ['organizations', 'x', 'reactivate'], ['payments', 'x', 'refund', { reason: 'Just testing' }]];
  const wrong = [];
  for (const [who, token] of [['read-only support', reader.token], ['an ordinary person', V.token]]) {
    for (const [kind, id, what, body] of everyAction) {
      const r = await call('POST', `/admin/${kind}/${id}/${what}`, token, body);
      if (r.status !== 403) wrong.push(`${who}: ${kind}/${what} -> ${r.status}`);
    }
  }
  check('read-only support and ordinary people are refused every action (403)', wrong.length === 0, wrong.join('; '));
  check('no sign-in is refused (401)', (await call('POST', `/admin/users/${V.id}/unlock`)).status === 401);
  check('a reason is required to suspend, and must be more than a word (400)', (await act('suspend', V.id, boss.token, {})).status === 400 && (await act('suspend', V.id, boss.token, { reason: 'no' })).status === 400 && (await act('suspend', V.id, boss.token, { reason: 'x'.repeat(301) })).status === 400);
  check('an unknown person is a 404', (await act('unlock', 'does-not-exist')).status === 404);

  // ================================================================== unlock and password reset
  console.log('\n--- unlock and reset');
  await prisma.user.update({ where: { id: V.id }, data: { failed_login_attempts: 5, locked_until: new Date(Date.now() + 15 * 60000) } });
  check('a locked account cannot sign in', (await login(V.email)).status === 401);
  const un = await act('unlock', V.id);
  check('staff unlock it', un.status === 200 && un.body.unlocked === true);
  check('and the person can sign in at once', (await login(V.email)).status === 200 && (await prisma.user.findUniqueOrThrow({ where: { id: V.id } })).failed_login_attempts === 0);

  const k = key('reset');
  const r1 = await call('POST', `/admin/users/${V.id}/password-reset`, boss.token, undefined, { 'Idempotency-Key': k });
  const r2 = await call('POST', `/admin/users/${V.id}/password-reset`, boss.token, undefined, { 'Idempotency-Key': k });
  const resets = (await emails()).filter((m) => m.to === V.email && /Reset your password/.test(m.subject));
  check('staff send a reset email; a retry with the same key does not send a second', r1.status === 200 && r2.headers.get('idempotent-replayed') === 'true' && resets.length === 1, `emails=${resets.length}`);
  check('their password is untouched until they use the link', (await login(V.email)).status === 200);

  // ================================================================== suspend a person
  console.log('\n--- suspend a person');
  const session = (await login(V.email)).body;
  check('before: they can use the platform', (await call('GET', '/account', session.access_token)).status === 200);
  const sus = await act('suspend', V.id, boss.token, { reason: '  Repeated abuse reports  ' });
  check('staff suspend them, with a reason', sus.status === 200 && sus.body.suspended === true);
  const row = await prisma.user.findUniqueOrThrow({ where: { id: V.id } });
  check('the reason is stored (trimmed) and every session is ended', row.suspended_reason === 'Repeated abuse reports' && !!row.suspended_at && (await prisma.session.count({ where: { user_id: V.id } })) === 0);
  check('their existing access token stops working at once (401)', (await call('GET', '/account', session.access_token)).status === 401);
  check('their refresh token no longer works (401)', (await call('POST', '/auth/refresh', null, { refresh_token: session.refresh_token })).status === 401);
  const blocked = await login(V.email);
  check('signing in with the right password says the account is suspended (403 ACCOUNT_SUSPENDED)', blocked.status === 403 && blocked.body.code === 'ACCOUNT_SUSPENDED', blocked.text);
  check('a wrong password gives no hint (401, same as any other)', (await login(V.email, 'Wrong123!pass')).status === 401);
  const detail = await call('GET', `/admin/users/${V.id}`, boss.token);
  check('the person’s page shows it, with the reason and who did it', detail.body.suspended === true && detail.body.suspended_reason === 'Repeated abuse reports' && detail.body.staff_actions[0].action === 'user.suspended' && detail.body.staff_actions[0].by === 'Super Admin' && detail.body.staff_actions[0].reason === 'Repeated abuse reports', JSON.stringify(detail.body.staff_actions));
  check('suspending again is refused (409 ALREADY_SUSPENDED)', (await act('suspend', V.id, boss.token, { reason: 'Again please' })).body?.code === 'ALREADY_SUSPENDED');
  check('staff cannot suspend themselves (400)', (await act('suspend', boss.id, boss.token, { reason: 'Oops, me' })).status === 400);
  check('staff accounts cannot be suspended here (409 STAFF_ACCOUNT)', (await act('suspend', reader.id, boss.token, { reason: 'Other staff' })).body?.code === 'STAFF_ACCOUNT');
  const react = await act('reactivate', V.id);
  check('staff restore them', react.status === 200 && react.body.suspended === false);
  check('they can sign in again, and use the platform', (await login(V.email)).status === 200);
  check('restoring someone who is not suspended is refused (409 NOT_SUSPENDED)', (await act('reactivate', V.id)).body?.code === 'NOT_SUSPENDED');
  const hist = (await call('GET', `/admin/users/${V.id}`, boss.token)).body.staff_actions.map((a) => a.action);
  check('the record keeps everything, newest first', ['user.reactivated', 'user.suspended', 'user.reset_sent', 'user.unlocked'].every((a) => hist.includes(a)) && hist[0] === 'user.reactivated', hist.join(','));

  // ================================================================== suspend a company
  console.log('\n--- suspend a company');
  const owner = await makeUser('owner', { first: 'Ngozi', last: 'Eze' });
  const emp = await makeUser('emp', { first: 'Eli', last: 'Employee' });
  const org = await prisma.organization.create({ data: { name: 'Action Co', slug: 'w5-act-co', type: 'corporate', admin_name: 'Ngozi Eze', admin_email: owner.email } });
  await prisma.organizationMember.create({ data: { user_id: owner.id, organization_id: org.id, role_id: (await role('admin')).id } });
  await prisma.subscription.create({ data: { organization_id: org.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 25 * 86400000), auto_renew: false, seats_limit: 10 } });
  const O = `/organizations/${org.id}`;
  const inv = await call('POST', `${O}/invitations`, owner.token, { emails: [emp.email] });
  await call('POST', `/invitations/${inv.body.invitations[0].link.split('/invite/')[1]}/accept`, emp.token);
  const { full } = await assessments(emp.token);
  check('before: the employee is covered by the company', (await call('GET', '/assessments', emp.token)).body.data.find((a) => a.slug === 'ocean-full').company_cover?.id === org.id);

  const osus = await call('POST', `/admin/organizations/${org.id}/suspend`, boss.token, { reason: 'Unpaid invoice, chargeback' });
  check('staff suspend the company, with a reason', osus.status === 200 && osus.body.status === 'suspended');
  const dash = await call('GET', `${O}/dashboard`, owner.token);
  check('its administrators still see the dashboard, and it says why it is suspended', dash.status === 200 && dash.body.organization.status === 'suspended' && dash.body.organization.suspended_reason === 'Unpaid invoice, chargeback', JSON.stringify(dash.body.organization));
  const newInv = await call('POST', `${O}/invitations`, owner.token, { emails: [`new-${Date.now()}@w5.test`] });
  check('it cannot invite anyone (403 ORGANIZATION_SUSPENDED, with the reason)', newInv.status === 403 && newInv.body.code === 'ORGANIZATION_SUSPENDED' && /Unpaid invoice/.test(newInv.body.message), newInv.text);
  check('it cannot send reminders (403)', (await call('POST', `${O}/reminders`, owner.token)).body?.code === 'ORGANIZATION_SUSPENDED');
  const pending = await prisma.employeeInvitation.findFirst({ where: { organization_id: org.id, status: 'accepted' } });
  check('it cannot resend an invitation (403)', (await call('POST', `${O}/invitations/${pending.id}/resend`, owner.token)).body?.code === 'ORGANIZATION_SUSPENDED');
  check('reading still works: the people list and profile', (await call('GET', `${O}/members`, owner.token)).status === 200 && (await call('GET', `${O}/profile`, owner.token)).body.status === 'suspended');
  const list = (await call('GET', '/assessments', emp.token)).body.data.find((a) => a.slug === 'ocean-full');
  check('its people are no longer covered for assessments through it', list.company_cover === null);
  check('and cannot start one through it (403 COMPANY_COVER_UNAVAILABLE)', (await call('POST', `/assessments/${full.id}/start`, emp.token, { organization_id: org.id })).body?.code === 'COMPANY_COVER_UNAVAILABLE');
  check('the company’s own audit trail shows platform staff suspended it', (await prisma.auditLog.count({ where: { organization_id: org.id, action: 'platform.company_suspended', actor_id: boss.id } })) === 1);
  const odetail = (await call('GET', `/admin/organizations/${org.id}`, boss.token)).body;
  check('staff see the status, reason and record on the company page', odetail.status === 'suspended' && odetail.suspended_reason === 'Unpaid invoice, chargeback' && odetail.staff_actions[0].action === 'organization.suspended');
  check('suspending again is refused (409)', (await call('POST', `/admin/organizations/${org.id}/suspend`, boss.token, { reason: 'Again please' })).body?.code === 'ALREADY_SUSPENDED');
  check('an unknown company is a 404', (await call('POST', '/admin/organizations/nope/suspend', boss.token, { reason: 'Does not exist' })).status === 404);
  const orest = await call('POST', `/admin/organizations/${org.id}/reactivate`, boss.token);
  check('staff restore it', orest.status === 200 && orest.body.status === 'active');
  check('it can invite again, and its people are covered again', (await call('POST', `${O}/invitations`, owner.token, { emails: [`again-${Date.now()}@w5.test`] })).status === 200 && (await call('GET', '/assessments', emp.token)).body.data.find((a) => a.slug === 'ocean-full').company_cover?.id === org.id);
  check('restoring a company that is not suspended is refused (409)', (await call('POST', `/admin/organizations/${org.id}/reactivate`, boss.token)).body?.code === 'NOT_SUSPENDED');

  // ================================================================== refunds
  console.log('\n--- refunds');
  const buyer = await makeUser('buyer', { first: 'Bea', last: 'Buyer' });
  const paid = await settle('/payments/checkout', buyer.token, { assessment_id: full.id });
  check('setup: a settled payment lets the buyer start', paid.status === 'success');
  const refund = (id, reason = 'Charged twice by mistake', token = boss.token, headers) => call('POST', `/admin/payments/${id}/refund`, token, { reason }, headers);

  check('a short reason is refused (400)', (await refund(paid.id, 'no')).status === 400);
  await fake('paystack', '/__control/mode', 'POST', { refundMode: 'refuse' });
  const refused = await refund(paid.id);
  check('when Paystack refuses, the answer says so (502 REFUND_FAILED)…', refused.status === 502 && refused.body.code === 'REFUND_FAILED' && /already been fully reversed/.test(refused.body.message), refused.text);
  check('…and the payment goes back to success, so it can be tried again', (await prisma.payment.findUniqueOrThrow({ where: { id: paid.id } })).status === 'success');
  await fake('paystack', '/__control/mode', 'POST', { refundMode: 'ok' });
  await fake('resend', '/__control/reset', 'POST');
  const kr = key('refund');
  const ok = await refund(paid.id, 'Charged twice by mistake', boss.token, { 'Idempotency-Key': kr });
  check('staff refund it', ok.status === 200 && ok.body.status === 'refunded' && ok.body.refund_status === 'pending', ok.text);
  const after = await prisma.payment.findUniqueOrThrow({ where: { id: paid.id } });
  check('the payment is marked refunded, with the Paystack refund and the reason kept', after.status === 'refunded' && after.metadata.refund?.reason === 'Charged twice by mistake' && after.metadata.refund?.status === 'pending' && !!after.metadata.refund?.id, JSON.stringify(after.metadata));
  check('the payer is emailed', (await emails()).some((m) => m.to === buyer.email && /refunded/.test(m.subject)));
  check('a refunded assessment payment no longer buys an attempt (402)', (await call('POST', `/assessments/${full.id}/start`, buyer.token)).status === 402);
  const again = await refund(paid.id, 'Charged twice by mistake', boss.token, { 'Idempotency-Key': kr });
  check('a retry with the same key replays the answer and asks Paystack nothing more', again.headers.get('idempotent-replayed') === 'true' && (await fake('paystack', '/__control/state')).refundCalls === 2, `refund calls: ${(await fake('paystack', '/__control/state')).refundCalls}`);
  check('refunding it again without a key is refused (409 NOT_REFUNDABLE)', (await refund(paid.id)).body?.code === 'NOT_REFUNDABLE');
  const unpaid = await call('POST', '/payments/checkout', (await makeUser('unpaid')).token, { assessment_id: full.id });
  const unpaidRow = await prisma.payment.findUniqueOrThrow({ where: { provider_reference: unpaid.body.reference } });
  check('a payment that never settled cannot be refunded (409)', (await refund(unpaidRow.id)).body?.code === 'NOT_REFUNDABLE');
  check('an unknown payment is a 404', (await refund('nope')).status === 404);
  const pdetail = (await call('GET', `/admin/users/${buyer.id}`, boss.token)).body;
  check('the buyer’s page shows the payment as refunded', pdetail.payments[0].status === 'refunded');

  // a company plan: refunding the payment that funds it ends the plan
  const planCo = await prisma.organization.create({ data: { name: 'Plan Co', slug: 'w5-act-plan', type: 'corporate', admin_name: 'Plan Owner', admin_email: owner.email } });
  const planOwner = await makeUser('planowner');
  await prisma.organizationMember.create({ data: { user_id: planOwner.id, organization_id: planCo.id, role_id: (await role('admin')).id } });
  const planPayment = await settle('/payments/subscription-checkout', planOwner.token, { organization_id: planCo.id, plan: 'team' });
  check('setup: buying a plan activates it', planPayment.status === 'success' && (await prisma.subscription.findUnique({ where: { organization_id: planCo.id } }))?.status === 'active');
  const planRefund = await refund(planPayment.id, 'Plan bought by mistake');
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { organization_id: planCo.id } });
  check('refunding the plan payment ends the plan now', planRefund.status === 200 && sub.status === 'cancelled' && sub.end_date.getTime() <= Date.now() + 1000);
  check('the company can no longer invite (402 SUBSCRIPTION_REQUIRED)', (await call('POST', `/organizations/${planCo.id}/invitations`, planOwner.token, { emails: [`x-${Date.now()}@w5.test`] })).body?.code === 'SUBSCRIPTION_REQUIRED');

  await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: 'w5-act-' } } });
  await prisma.staffAction.deleteMany({ where: { OR: [{ actor_id: boss.id }, { target_id: { in: [V.id, org.id, buyer.id, planCo.id, paid.id, planPayment.id] } }] } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: 'w5-act' } } });
  void cleanup;
  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: 'w5-act-' } } }); await cleanup(); } catch {} process.exit(2); });
