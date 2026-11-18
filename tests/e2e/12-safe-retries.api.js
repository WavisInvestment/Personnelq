// API versioning, database guards against duplicates, Idempotency-Key replay, and the payment webhook log.
process.env.W5_TAG = 'retry';
const lib = require('./lib');
const { prisma, fake, check, sleep, makeUser, assessments, finish, cleanup, API } = lib;
// each call comes from its own address, so the per-address rate limits (20 invitations an hour) don't interfere with what is being tested
const fresh = () => ({ 'X-Forwarded-For': `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}` });
const call = (method, path, token, body, headers = {}) => lib.call(method, path, token, body, { ...fresh(), ...headers });

const ORIGIN = API.replace(/\/api\/v1$/, '');
const raw = async (method, path, token, body, headers = {}) => {
  const res = await fetch(`${ORIGIN}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
};
const key = (label) => `w5-retry-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const hook = (b) => fake('paystack', '/__control/webhook', 'POST', b);
const role = (r) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key: r } });

(async () => {
  // ================================================================== versions
  console.log('\n--- versioning');
  const health = await raw('GET', '/api/health');
  check('the health check stays at /api/health (no version)', health.status === 200 && health.body.status === 'ok');
  check('the unversioned old addresses are gone (404)', (await raw('POST', '/api/auth/login', null, { email: 'a@b.co', password: 'x' })).status === 404 && (await raw('GET', '/api/assessments')).status === 404);
  const v1 = await raw('POST', '/api/v1/auth/login', null, { email: 'nobody@w5.test', password: 'Nope123!xx' }, { 'X-Forwarded-For': '10.4.4.4' });
  check('/api/v1 answers, and says which version it is (X-API-Version: 1)', v1.status === 401 && v1.headers.get('x-api-version') === '1');
  check('an unknown version is a 404', (await raw('GET', '/api/v2/assessments')).status === 404);
  check('the payment webhook is still at the address saved in Paystack, not versioned', (await raw('POST', '/api/webhooks/paystack', null, { event: 'charge.success' })).status === 401);
  check('and it does not exist under v1 (404)', (await raw('POST', '/api/v1/webhooks/paystack', null, {})).status === 404);

  // ================================================================== database guards
  console.log('\n--- database guards');
  const admin = await makeUser('admin');
  const org = await prisma.organization.create({ data: { name: 'Retry Co', slug: 'w5-retry-co', type: 'corporate', admin_name: 'Ada Admin', admin_email: admin.email } });
  await prisma.organizationMember.create({ data: { user_id: admin.id, organization_id: org.id, role_id: (await role('admin')).id } });
  await prisma.subscription.create({ data: { organization_id: org.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 1, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 30 * 86400000), auto_renew: false, seats_limit: 50 } });
  const O = `/organizations/${org.id}`;

  const target = `twice-${Date.now()}@w5.test`;
  const both = await Promise.all([call('POST', `${O}/invitations`, admin.token, { emails: [target] }), call('POST', `${O}/invitations`, admin.token, { emails: [target] })]);
  const statuses = both.map((r) => r.body.invitations[0].status).sort();
  check('two simultaneous invitations to the same person: one is sent, the other is told "already invited"', JSON.stringify(statuses) === '["already_invited","invited"]', JSON.stringify(statuses));
  check('the database holds exactly one waiting invitation', (await prisma.employeeInvitation.count({ where: { organization_id: org.id, recipient_email: target, status: 'pending' } })) === 1);
  const row = await prisma.employeeInvitation.findFirstOrThrow({ where: { organization_id: org.id, recipient_email: target } });
  check('the waiting invitation carries its unique key', row.open_key === `${org.id}:${target}`);
  const direct = await prisma.employeeInvitation.create({ data: { organization_id: org.id, sender_id: admin.id, recipient_email: target, invitation_token: `w5-dup-${Date.now()}-aaaaaaaaaaaa`, invitation_url: '/invite/x', expires_at: new Date(Date.now() + 1e6), assessment_id: row.assessment_id, open_key: row.open_key } }).then(() => 'created', (e) => e.code);
  check('even straight into the database, a second waiting invitation is refused (P2002)', direct === 'P2002', direct);
  const cancel = await call('DELETE', `${O}/invitations/${row.id}`, admin.token);
  check('cancelling frees the slot (key cleared)', cancel.status === 200 && (await prisma.employeeInvitation.findUnique({ where: { id: row.id } })).open_key === null);
  const again = await call('POST', `${O}/invitations`, admin.token, { emails: [target] });
  check('and the person can be invited again afterwards', again.body.invitations[0].status === 'invited');

  // an invitation past its date still says "pending" until the hourly job runs; it must not block a new one
  const stale = `stale-${Date.now()}@w5.test`;
  await call('POST', `${O}/invitations`, admin.token, { emails: [stale] });
  await prisma.employeeInvitation.updateMany({ where: { organization_id: org.id, recipient_email: stale }, data: { expires_at: new Date(Date.now() - 1000) } });
  const fresh = await call('POST', `${O}/invitations`, admin.token, { emails: [stale] });
  check('an expired invitation does not block a fresh one', fresh.body.invitations[0].status === 'invited', JSON.stringify(fresh.body));

  // retake requests
  const emp = await makeUser('emp');
  const invEmp = await call('POST', `${O}/invitations`, admin.token, { emails: [emp.email] });
  await call('POST', `/invitations/${invEmp.body.invitations[0].link.split('/invite/')[1]}/accept`, emp.token);
  const { full } = await assessments(emp.token);
  const first = await call('POST', `/assessments/${full.id}/start`, emp.token, { organization_id: org.id });
  for (let i = 0; i < first.body.submission.questions.length; i += 10) await call('PUT', `/submissions/${first.body.submission.id}/answers`, emp.token, { answers: first.body.submission.questions.slice(i, i + 10).map((q) => ({ question_id: q.id, value: 3 })) });
  await call('POST', `/submissions/${first.body.submission.id}/complete`, emp.token);

  const asks = await Promise.all([1, 2, 3].map(() => call('POST', '/retake-requests', emp.token, { assessment_id: full.id, organization_id: org.id })));
  check('three simultaneous retake requests all succeed and name the same request', asks.every((r) => r.status === 200) && new Set(asks.map((r) => r.body.id)).size === 1, JSON.stringify(asks.map((r) => r.status)));
  check('the database holds exactly one live request', (await prisma.retakeRequest.count({ where: { user_id: emp.id, status: 'requested' } })) === 1);
  const live = await prisma.retakeRequest.findFirstOrThrow({ where: { user_id: emp.id } });
  const dup = await prisma.retakeRequest.create({ data: { organization_id: org.id, user_id: emp.id, assessment_id: full.id, open_key: live.open_key } }).then(() => 'created', (e) => e.code);
  check('even straight into the database, a second live request is refused (P2002)', dup === 'P2002', dup);
  await call('POST', `${O}/retakes/${live.id}/decline`, admin.token);
  check('declining frees the slot', (await prisma.retakeRequest.findUnique({ where: { id: live.id } })).open_key === null);

  const allows = await Promise.all([1, 2].map(() => call('POST', `${O}/retakes`, admin.token, { user_id: emp.id })));
  check('two simultaneous "allow retake" clicks end on the same approval', allows.every((r) => r.status === 200 && r.body.status === 'approved') && new Set(allows.map((r) => r.body.id)).size === 1, JSON.stringify(allows.map((r) => r.body)));
  const approved = await prisma.retakeRequest.findFirstOrThrow({ where: { user_id: emp.id, status: 'approved' } });
  await prisma.retakeRequest.update({ where: { id: approved.id }, data: { expires_at: new Date(Date.now() - 1000) } });
  const reissue = await call('POST', `${O}/retakes`, admin.token, { user_id: emp.id });
  check('an unused approval past its date does not block a new one', reissue.status === 200 && reissue.body.id !== approved.id && reissue.body.status === 'approved', reissue.text);

  // ================================================================== Idempotency-Key
  console.log('\n--- Idempotency-Key');
  const k1 = key('invite');
  const invBody = { emails: [`idem-${Date.now()}@w5.test`] };
  const r1 = await call('POST', `${O}/invitations`, admin.token, invBody, { 'Idempotency-Key': k1 });
  const r2 = await call('POST', `${O}/invitations`, admin.token, invBody, { 'Idempotency-Key': k1 });
  check('the first request does its work', r1.status === 200 && r1.body.invitations[0].status === 'invited' && !r1.headers.get('idempotent-replayed'), r1.text);
  check('a retry with the same key returns the same answer, marked as a replay', r2.status === 200 && r2.headers.get('idempotent-replayed') === 'true' && JSON.stringify(r2.body.invitations[0], Object.keys(r2.body.invitations[0]).sort()) === JSON.stringify(r1.body.invitations[0], Object.keys(r1.body.invitations[0]).sort()));
  check('and did not send another invitation', (await prisma.employeeInvitation.count({ where: { organization_id: org.id, recipient_email: invBody.emails[0] } })) === 1);
  const r3 = await call('POST', `${O}/invitations`, admin.token, { emails: [`other-${Date.now()}@w5.test`] }, { 'Idempotency-Key': k1 });
  check('the same key for a different request is refused (422 IDEMPOTENCY_KEY_REUSED)', r3.status === 422 && r3.body.code === 'IDEMPOTENCY_KEY_REUSED', r3.text);
  const other = await makeUser('other');
  check('keys belong to the person: another user using the same key is judged on their own (403, not a replay)', (await call('POST', '/retake-requests', other.token, { assessment_id: full.id, organization_id: org.id }, { 'Idempotency-Key': k1 })).status === 403);
  check('a key that is too short or has odd characters is refused (400)', (await call('POST', `${O}/invitations`, admin.token, invBody, { 'Idempotency-Key': 'short' })).status === 400 && (await call('POST', `${O}/invitations`, admin.token, invBody, { 'Idempotency-Key': 'has spaces in it!!' })).status === 400);
  check('without the header everything behaves as before', (await call('POST', `${O}/invitations`, admin.token, { emails: [`plain-${Date.now()}@w5.test`] })).status === 200);

  // simultaneous retries: exactly one runs
  const k2 = key('parallel');
  const parallelBody = { emails: [`par-${Date.now()}@w5.test`] };
  const par = await Promise.all([1, 2, 3, 4].map(() => call('POST', `${O}/invitations`, admin.token, parallelBody, { 'Idempotency-Key': k2 })));
  const okCount = par.filter((r) => r.status === 200).length;
  const busy = par.filter((r) => r.status === 409 && r.body.code === 'IDEMPOTENT_REQUEST_IN_PROGRESS').length;
  check('four simultaneous requests with one key: the work happens once, the rest wait or replay', okCount >= 1 && okCount + busy === 4 && (await prisma.employeeInvitation.count({ where: { organization_id: org.id, recipient_email: parallelBody.emails[0] } })) === 1, JSON.stringify(par.map((r) => r.status)));
  const kFail = key('failed');
  const bad = await call('POST', `${O}/invitations`, admin.token, { emails: ['not-an-email'] }, { 'Idempotency-Key': kFail });
  const storedAfterFailure = await prisma.idempotencyKey.count({ where: { key: kFail } });
  const good = await call('POST', `${O}/invitations`, admin.token, { emails: [`fixed-${Date.now()}@w5.test`] }, { 'Idempotency-Key': kFail });
  check('a request that failed is not remembered: after fixing it, the same key works (400, then 200)', bad.status === 400 && storedAfterFailure === 0 && good.status === 200, `${bad.status}/${storedAfterFailure}/${good.status}`);
  const k3 = key('expired');
  await call('POST', `${O}/invitations`, admin.token, { emails: [`exp-${Date.now()}@w5.test`] }, { 'Idempotency-Key': k3 });
  await prisma.idempotencyKey.updateMany({ where: { key: k3 }, data: { expires_at: new Date(Date.now() - 1000) } });
  const afterExpiry = await call('POST', `${O}/invitations`, admin.token, { emails: [`exp2-${Date.now()}@w5.test`] }, { 'Idempotency-Key': k3 });
  check('after 24 hours a key can be used again for a new request', afterExpiry.status === 200 && !afterExpiry.headers.get('idempotent-replayed'), afterExpiry.text);
  const k4 = key('stuck');
  await prisma.idempotencyKey.create({ data: { user_id: admin.id, key: k4, method: 'POST', path: 'x', request_hash: 'x', state: 'in_progress', created_at: new Date(Date.now() - 5 * 60 * 1000), expires_at: new Date(Date.now() + 1e6) } });
  check('a request that died half-way (stuck "in progress") frees its key after a minute', (await call('POST', `${O}/invitations`, admin.token, { emails: [`stuck-${Date.now()}@w5.test`] }, { 'Idempotency-Key': k4 })).status === 200);

  // payments: a double-clicked pay button
  const buyer = await makeUser('buyer');
  const k5 = key('pay');
  const pay = await Promise.all([1, 2].map(() => call('POST', '/payments/checkout', buyer.token, { assessment_id: full.id }, { 'Idempotency-Key': k5 })));
  check('two checkouts with one key give the same payment link', pay.filter((r) => r.status === 200).length >= 1 && new Set(pay.filter((r) => r.status === 200).map((r) => r.body.reference)).size === 1, JSON.stringify(pay.map((r) => r.status)));
  check('and only one payment record exists', (await prisma.payment.count({ where: { user_id: buyer.id } })) === 1);
  const replayPay = await call('POST', '/payments/checkout', buyer.token, { assessment_id: full.id }, { 'Idempotency-Key': k5 });
  check('a later retry replays the original payment link', replayPay.status === 200 && replayPay.headers.get('idempotent-replayed') === 'true' && replayPay.body.reference === pay.find((r) => r.status === 200).body.reference);

  // ================================================================== webhook log
  console.log('\n--- webhook log');
  const ref = pay.find((r) => r.status === 200).body.reference;
  await fake('paystack', '/__control/set', 'POST', { reference: ref, patch: { status: 'success', paid_at: new Date().toISOString(), channel: 'card' } });
  await fake('paystack', '/__control/mode', 'POST', { verifyMode: 'down' });
  const failed = await hook({ event: 'charge.success', reference: ref });
  check('while Paystack is unreachable the webhook answers an error, so Paystack will deliver it again', failed.status >= 500, JSON.stringify(failed));
  const stuck = await prisma.webhookEvent.findFirstOrThrow({ where: { reference: ref } });
  check('the delivery is on record as failed, with the reason', stuck.status === 'failed' && stuck.attempts === 1 && !!stuck.error, JSON.stringify({ s: stuck.status, a: stuck.attempts, e: stuck.error }));
  check('nothing was granted meanwhile', (await prisma.payment.findUnique({ where: { provider_reference: ref } })).status === 'pending');

  await fake('paystack', '/__control/mode', 'POST', { verifyMode: 'ok' });
  const redelivered = await hook({ event: 'charge.success', reference: ref });
  check('Paystack delivers it again (identical bytes): same record, now processed', redelivered.status === 200 && (await prisma.webhookEvent.count({ where: { reference: ref } })) === 1 && (await prisma.webhookEvent.findUniqueOrThrow({ where: { id: stuck.id } })).status === 'processed');
  check('and the payment is settled', (await prisma.payment.findUnique({ where: { provider_reference: ref } })).status === 'success');
  const dupDelivery = await hook({ event: 'charge.success', reference: ref });
  const afterDup = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: stuck.id } });
  check('a further repeat is acknowledged as a duplicate and does nothing', dupDelivery.status === 200 && JSON.parse(dupDelivery.body).duplicate === true && afterDup.attempts === 2, `${dupDelivery.body} attempts=${afterDup.attempts}`);
  const ignored = await hook({ event: 'transfer.success', reference: ref });
  check('events we do not act on are kept too, marked ignored', ignored.status === 200 && (await prisma.webhookEvent.count({ where: { reference: ref, status: 'ignored' } })) === 1);

  // admin console
  const staff = await makeUser('staff');
  await prisma.user.update({ where: { id: staff.id }, data: { platform_role_id: (await prisma.role.findFirstOrThrow({ where: { scope: 'platform', key: 'super_admin' } })).id } });
  const support = await makeUser('support');
  await prisma.user.update({ where: { id: support.id }, data: { platform_role_id: (await prisma.role.findFirstOrThrow({ where: { scope: 'platform', key: 'support' } })).id } });
  const listed = await call('GET', '/admin/webhook-events?status=processed&limit=5', staff.token);
  check('platform staff can list events (filtered, capped) without seeing the raw payload', listed.status === 200 && listed.body.data.length >= 1 && listed.body.data.every((e) => e.status === 'processed' && e.payload === undefined), listed.text?.slice(0, 160));
  check('an ordinary user cannot (403)', (await call('GET', '/admin/webhook-events', emp.token)).status === 403 && (await call('POST', `/admin/webhook-events/${stuck.id}/replay`, emp.token)).status === 403);
  check('read-only support staff can list but not replay (403)', (await call('GET', '/admin/webhook-events', support.token)).status === 200 && (await call('POST', `/admin/webhook-events/${stuck.id}/replay`, support.token)).status === 403);
  const replay = await call('POST', `/admin/webhook-events/${stuck.id}/replay`, staff.token);
  check('staff can run an event again; it is safe because settling is idempotent', replay.status === 200 && replay.body.status === 'processed' && (await prisma.payment.count({ where: { provider_reference: ref, status: 'success' } })) === 1, replay.text);
  check('replaying an unknown event is a 404', (await call('POST', '/admin/webhook-events/nope/replay', staff.token)).status === 404);

  await prisma.webhookEvent.deleteMany({ where: { reference: ref } });
  await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: 'w5-retry-' } } });
  await prisma.employeeInvitation.deleteMany({ where: { organization_id: org.id } });
  void sleep; void cleanup;
  await finish();
})().catch(async (e) => {
  console.error('SCRIPT ERROR', e);
  try {
    await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: 'w5-retry-' } } });
    await cleanup();
  } catch {}
  process.exit(2);
});
