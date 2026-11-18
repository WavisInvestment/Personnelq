process.env.W5_TAG = 'sub';
const { prisma, call, fake, check, makeUser, finish } = require('./lib');

const emails = () => fake('resend', '/__control/emails');
const hook = (reference, extra = {}) => fake('paystack', '/__control/webhook', 'POST', { event: 'charge.success', reference, ...extra });
const settle = (reference, patch = {}) => fake('paystack', '/__control/set', 'POST', { reference, patch: { status: 'success', paid_at: new Date().toISOString(), channel: 'card', ...patch } });
const months = (from, to) => (new Date(to) - new Date(from)) / 86400000 / 30.44;
const org = (id) => prisma.organization.findUnique({ where: { id } });
const sub = (id) => prisma.subscription.findUnique({ where: { organization_id: id } });

(async () => {
  await fake('resend', '/__control/reset', 'POST');
  const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });
  const admin = await makeUser('admin', { first: 'Ada', last: 'Boss' });
  const hr = await makeUser('hr');
  const outsider = await makeUser('out');
  const o = await prisma.organization.create({ data: { name: 'Sub Test Co', slug: 'w5-sub-co', type: 'company', admin_name: 'Ada Boss', admin_email: admin.email } });
  const other = await prisma.organization.create({ data: { name: 'Other Co', slug: 'w5-sub-other', type: 'company', admin_name: 'X', admin_email: outsider.email } });
  await prisma.organizationMember.createMany({ data: [
    { user_id: admin.id, organization_id: o.id, role_id: (await role('admin')).id },
    { user_id: hr.id, organization_id: o.id, role_id: (await role('hr')).id },
    { user_id: outsider.id, organization_id: other.id, role_id: (await role('admin')).id },
  ] });

  // ---------------------------------------------------------------- who may see and buy
  const bill = await call('GET', `/payments/billing/${o.id}`, admin.token);
  check('billing: the admin sees plans with server prices and no subscription yet', bill.status === 200 && bill.body.subscription === null && bill.body.plans.length === 2 && bill.body.plans[0].amount === 50000 && bill.body.payments_enabled === true, bill.text);
  check('billing: HR (no billing permission) is refused (403)', (await call('GET', `/payments/billing/${o.id}`, hr.token)).status === 403 && (await call('POST', '/payments/subscription-checkout', hr.token, { organization_id: o.id, plan: 'team' })).status === 403);
  check('billing: another company’s admin cannot see or buy for this company (403)', (await call('GET', `/payments/billing/${o.id}`, outsider.token)).status === 403 && (await call('POST', '/payments/subscription-checkout', outsider.token, { organization_id: o.id, plan: 'team' })).status === 403);
  check('billing: an unknown plan is refused (404)', (await call('POST', '/payments/subscription-checkout', admin.token, { organization_id: o.id, plan: 'free-forever' })).status === 404);
  check('billing: the request cannot carry its own price (rejected)', (await call('POST', '/payments/subscription-checkout', admin.token, { organization_id: o.id, plan: 'team', amount: 1 })).status === 400);
  check('billing: no login -> 401', (await call('GET', `/payments/billing/${o.id}`)).status === 401);

  // ---------------------------------------------------------------- buy Team, settled by webhook
  const co = await call('POST', '/payments/subscription-checkout', admin.token, { organization_id: o.id, plan: 'team' });
  const ref1 = co.body.reference;
  const tx1 = (await fake('paystack', '/__control/state')).txs.find((t) => t.reference === ref1);
  check('checkout: Paystack was asked for the plan price in kobo (50,000 NGN = 5,000,000)', co.status === 200 && tx1.amount === 5000000 && tx1.currency === 'NGN' && tx1.metadata.type === 'subscription' && tx1.metadata.organization_id === o.id);
  check('checkout: nothing is active until it is paid', (await sub(o.id)) === null && (await org(o.id)).subscription_status !== 'active');

  await settle(ref1);
  const w1 = await hook(ref1);
  const s1 = await sub(o.id);
  const o1 = await org(o.id);
  check('webhook: the signed event activates the subscription', w1.status === 200 && s1?.status === 'active' && s1.plan_name === 'Team' && s1.seats_limit === 25 && s1.billing_cycle === 'monthly' && Number(s1.amount) === 50000 && s1.auto_renew === false, JSON.stringify(s1));
  check('webhook: runs for about one month from today', months(new Date(), s1.end_date) > 0.9 && months(new Date(), s1.end_date) < 1.1, String(s1.end_date));
  check('webhook: the organisation record follows (plan, status, end date, seat cap)', o1.subscription_status === 'active' && o1.subscription_plan === 'team' && o1.max_employees === 25 && +new Date(o1.subscription_end_date) === +new Date(s1.end_date));
  const receipts1 = (await emails()).filter((m) => /Receipt/.test(m.subject) && m.to === admin.email);
  check('webhook: the payer got one receipt', receipts1.length === 1 && /50,000/.test(receipts1[0].html));

  const again = await hook(ref1);
  const s1b = await sub(o.id);
  check('replay: a repeated webhook changes nothing and sends no second receipt', again.status === 200 && +new Date(s1b.end_date) === +new Date(s1.end_date) && (await emails()).filter((m) => /Receipt/.test(m.subject)).length === 1);

  const view = await call('GET', `/payments/billing/${o.id}`, admin.token);
  check('billing: now shows the active plan', view.body.subscription?.status === 'active' && view.body.subscription.plan_name === 'Team');

  // ---------------------------------------------------------------- renewing early extends, not resets
  const ref2 = (await call('POST', '/payments/subscription-checkout', admin.token, { organization_id: o.id, plan: 'team' })).body.reference;
  await settle(ref2);
  await call('GET', `/payments/verify?reference=${ref2}`, admin.token); // the return-from-Paystack path settles it too
  const s2 = await sub(o.id);
  check('renewal: paying early adds a month on top of the days left (about two months out)', months(new Date(), s2.end_date) > 1.9 && months(new Date(), s2.end_date) < 2.1, `${months(new Date(), s2.end_date).toFixed(2)} months`);
  await call('GET', `/payments/verify?reference=${ref2}`, admin.token);
  await hook(ref2);
  check('renewal: checking the same payment again, by return page or webhook, never extends twice', +new Date((await sub(o.id)).end_date) === +new Date(s2.end_date));

  // ---------------------------------------------------------------- mismatched amount is refused
  const ref3 = (await call('POST', '/payments/subscription-checkout', admin.token, { organization_id: o.id, plan: 'organisation' })).body.reference;
  await settle(ref3, { amount: 100 }); // the customer "paid" 1 NGN
  await hook(ref3);
  const p3 = await prisma.payment.findUnique({ where: { provider_reference: ref3 } });
  const s3 = await sub(o.id);
  check('safety: a payment for the wrong amount is marked failed and grants nothing', p3.status === 'failed' && s3.plan_name === 'Team' && +new Date(s3.end_date) === +new Date(s2.end_date), `${p3.status} ${s3.plan_name}`);
  check('safety: no receipt was sent for it', (await emails()).filter((m) => /Receipt/.test(m.subject)).length === 2);

  // ---------------------------------------------------------------- switching to the annual plan
  const ref4 = (await call('POST', '/payments/subscription-checkout', admin.token, { organization_id: o.id, plan: 'organisation' })).body.reference;
  await settle(ref4);
  await hook(ref4);
  const s4 = await sub(o.id);
  check('annual: the Organisation plan sets 100 seats and a yearly period starting today (the days left were credited, not stacked)', s4.plan_name === 'Organisation' && s4.seats_limit === 100 && s4.billing_cycle === 'annual' && months(new Date(), s4.end_date) > 11.5 && months(new Date(), s4.end_date) < 12.5, `${months(new Date(), s4.end_date).toFixed(1)} months`);

  // ---------------------------------------------------------------- expired plan, then paying again starts from today
  await prisma.subscription.update({ where: { organization_id: o.id }, data: { status: 'expired', end_date: new Date(Date.now() - 5 * 86400000) } });
  const ref5 = (await call('POST', '/payments/subscription-checkout', admin.token, { organization_id: o.id, plan: 'team' })).body.reference;
  await settle(ref5);
  await hook(ref5);
  const s5 = await sub(o.id);
  check('lapsed: paying after expiry reactivates and counts from today, not from the old end date', s5.status === 'active' && months(new Date(), s5.end_date) > 0.9 && months(new Date(), s5.end_date) < 1.1);

  // ---------------------------------------------------------------- the other company is untouched; history is visible
  check('isolation: the other company has no subscription', (await sub(other.id)) === null);
  const hist = await call('GET', '/payments', admin.token);
  check('history: the admin’s own payments list shows paid, failed and the plan names, without gateway secrets', hist.body.data.filter((p) => p.status === 'success').length === 4 && hist.body.data.some((p) => p.status === 'failed') && !/authorization_url|access_code/.test(hist.text));

  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await require('./lib').cleanup(); } catch {} process.exit(2); });
