process.env.W5_TAG = 'swi';
const { prisma, call, fake, check, makeUser, finish } = require('./lib');

const settle = (reference) => fake('paystack', '/__control/set', 'POST', { reference, patch: { status: 'success', paid_at: new Date().toISOString(), channel: 'card' } });
const DAY = 86400000;

(async () => {
  const admin = await makeUser('admin', { first: 'Ada', last: 'Boss' });
  const o = await prisma.organization.create({ data: { name: 'Switch Co', slug: 'w5-swi-co', type: 'company', admin_name: 'Ada Boss', admin_email: admin.email, subscription_plan: 'team', subscription_status: 'active' } });
  await prisma.organizationMember.create({ data: { user_id: admin.id, organization_id: o.id, role_id: (await prisma.role.findFirstOrThrow({ where: { scope: 'organization', key: 'admin' } })).id } });
  const oldEnd = new Date(Date.now() + 15 * DAY);
  await prisma.subscription.create({ data: { organization_id: o.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(Date.now() - 15 * DAY), end_date: oldEnd, auto_renew: false, seats_limit: 25 } });

  const bill = await call('GET', `/payments/billing/${o.id}`, admin.token);
  const team = bill.body.plans.find((p) => p.slug === 'team');
  const big = bill.body.plans.find((p) => p.slug === 'organisation');
  check('overview: the current plan has no switch price, the other one shows today’s price after the credit', team.switch_charge === null && big.switch_charge > 424000 && big.switch_charge < 426000 && big.switch_credit > 24000 && big.switch_credit < 26000 && big.blocked === null, bill.text);

  const renew = await call('POST', '/payments/subscription-checkout', admin.token, { organization_id: o.id, plan: 'team' });
  check('renewing the same plan is the full price', renew.body.amount === 50000 && renew.body.credit === 0, renew.text);

  const co = await call('POST', '/payments/subscription-checkout', admin.token, { organization_id: o.id, plan: 'organisation' });
  const tx = (await fake('paystack', '/__control/state')).txs.find((t) => t.reference === co.body.reference);
  check('switching charges the list price less the credit, and Paystack is asked for that', co.status === 200 && Math.abs(co.body.amount - big.switch_charge) < 1 && tx.amount === Math.round(co.body.amount * 100) && Math.abs(co.body.credit - big.switch_credit) < 1, co.text);

  await settle(co.body.reference);
  await call('GET', `/payments/verify?reference=${co.body.reference}`, admin.token);
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { organization_id: o.id } });
  const days = (sub.end_date - Date.now()) / DAY;
  check('after paying: the new plan is active with its seats and list price, and the year starts today (not on top of the old end)', sub.plan_name === 'Organisation' && sub.seats_limit === 100 && sub.amount === 450000 && days > 363 && days < 367, `${sub.plan_name} ${days}`);
  const again = (await call('GET', `/payments/billing/${o.id}`, admin.token)).body.plans.find((p) => p.slug === 'team');
  check('and the old plan now shows its own switch price', again.switch_charge !== null);

  await prisma.payment.deleteMany({ where: { organization_id: o.id } });
  await prisma.subscription.deleteMany({ where: { organization_id: o.id } });
  await finish();
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
