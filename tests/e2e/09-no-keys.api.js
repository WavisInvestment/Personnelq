process.env.W5_TAG = 'bare';
const { prisma, call, check, makeUser, assessments, grantPaid, takeAssessment, finish } = require('./lib');

(async () => {
  const a = await makeUser('a');
  const { snap, full } = await assessments(a.token);
  check('bare: the free snapshot still works', (await takeAssessment(a.token, snap.id)).is_preview === true);
  check('bare: with no payments configured the full assessment is open (flag is off), no price shown', full.can_start === true && full.price === null, JSON.stringify({ can: full.can_start, price: full.price }));

  const co = await call('POST', '/payments/checkout', a.token, { assessment_id: full.id });
  check('bare: checkout answers 503 PAYMENT_UNAVAILABLE', co.status === 503 && co.body.code === 'PAYMENT_UNAVAILABLE', co.text);

  await grantPaid(a, full.id);
  const result = await takeAssessment(a.token, full.id);
  check('bare: result carries no insights and says they are unavailable', result.insights === null && result.insights_available === false, JSON.stringify({ i: result.insights, av: result.insights_available }));
  const ins = await call('POST', `/results/${result.id}/insights`, a.token);
  check('bare: generating insights answers 503 AI_UNAVAILABLE', ins.status === 503 && ins.body.code === 'AI_UNAVAILABLE', ins.text);

  const pdf = await call('GET', `/results/${result.id}/report`, a.token);
  check('bare: the PDF still works with no keys at all', pdf.status === 200 && pdf.buffer?.slice(0, 5).toString() === '%PDF-');
  const mail = await call('POST', `/results/${result.id}/email`, a.token);
  check('bare: emailing says not_configured instead of failing', mail.status === 200 && mail.body.status === 'not_configured', mail.text);

  const badge = await call('PUT', `/results/${result.id}/badge`, a.token, { is_public: true });
  check('bare: badges need no keys', badge.status === 200 && badge.body.badge.is_live);
  const wh = await fetch('http://localhost:3101/api/webhooks/paystack', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-paystack-signature': 'x' }, body: '{"event":"charge.success","data":{"reference":"x"}}' });
  check('bare: webhook with no secret configured is refused (not 2xx)', wh.status >= 400, String(wh.status));

  const plans = await prisma.organization.create({ data: { name: 'Bare Co', slug: 'w5-bare-co', type: 'company', admin_name: 'A', admin_email: a.email } });
  const adminRole = await prisma.role.findFirstOrThrow({ where: { scope: 'organization', key: 'admin' } });
  await prisma.organizationMember.create({ data: { user_id: a.id, organization_id: plans.id, role_id: adminRole.id } });
  const billing = await call('GET', `/payments/billing/${plans.id}`, a.token);
  check('bare: billing page data says payments are off with no plans', billing.status === 200 && billing.body.payments_enabled === false && billing.body.plans.length === 0, billing.text);
  const sub = await call('POST', '/payments/subscription-checkout', a.token, { organization_id: plans.id, plan: 'team' });
  check('bare: subscription checkout answers 503', sub.status === 503, sub.text);

  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await require('./lib').cleanup(); } catch {} process.exit(2); });
