process.env.W5_TAG = 'pay';
const { prisma, call, fake, check, sleep, paced, makeUser, assessments, takeAssessment, finish, FAKE } = require('./lib');

const checkout = (token, assessmentId, origin) => paced('checkout', 9, 60000, () => call('POST', '/payments/checkout', token, { assessment_id: assessmentId }, origin ? { Origin: origin } : {}));
const verify = (token, ref) => call('GET', `/payments/verify?reference=${encodeURIComponent(ref)}`, token);
const payOnFake = async (ref) => { const r = await fetch(`${FAKE.paystack}/pay/${ref}/complete`, { redirect: 'manual' }); return { status: r.status, location: r.headers.get('location') }; };
const emails = () => fake('resend', '/__control/emails');
const signedWebhook = (b) => fake('paystack', '/__control/webhook', 'POST', b);

(async () => {
  await fake('paystack', '/__control/reset', 'POST'); await fake('resend', '/__control/reset', 'POST');

  const buyer = await makeUser('buyer', { first: 'Ada', last: 'Buyer' });
  const other = await makeUser('other');
  const { snap, full } = await assessments(buyer.token);

  // ---------------------------------------------------------------- before paying
  check('the full assessment shows its server-set price and asks for payment', full.price?.amount === 5000 && full.price.currency === 'NGN' && full.blocked_reason === 'PAYMENT_REQUIRED' && full.can_start === false, JSON.stringify(full.price));
  check('the snapshot stays free', snap.price === null && snap.can_start === true);
  const noPay = await call('POST', `/assessments/${full.id}/start`, buyer.token);
  check('starting the full assessment without paying -> 402 PAYMENT_REQUIRED', noPay.status === 402 && noPay.body.code === 'PAYMENT_REQUIRED');

  // ---------------------------------------------------------------- checkout rules
  check('checkout needs a login (401)', (await call('POST', '/payments/checkout', null, { assessment_id: full.id })).status === 401);
  check('checkout with no assessment -> 400', (await checkout(buyer.token, undefined)).status === 400);
  check('checkout for an unknown assessment -> 404', (await checkout(buyer.token, 'does-not-exist')).status === 404);
  const snapCo = await checkout(buyer.token, snap.id);
  check('checkout for the free snapshot -> 400 NO_PAYMENT_NEEDED', snapCo.status === 400 && snapCo.body.code === 'NO_PAYMENT_NEEDED');
  const smuggled = await paced('checkout', 9, 60000, () => call('POST', '/payments/checkout', buyer.token, { assessment_id: full.id, amount: 1, currency: 'USD' }));
  check('a client-supplied amount or currency is rejected outright (400), never honoured', smuggled.status === 400);
  check('...and no payment was created by that attempt', (await prisma.payment.count({ where: { user_id: buyer.id } })) === 0);

  const co = await checkout(buyer.token, full.id, 'http://localhost:3100');
  check('checkout returns a hosted-payment address, reference and the server-chosen amount', co.status === 200 && co.body.authorization_url.startsWith(FAKE.paystack.replace('127.0.0.1', 'localhost') + '/pay/') && /^pb_[0-9a-f]{24}$/.test(co.body.reference) && co.body.amount === 5000 && co.body.currency === 'NGN', JSON.stringify(co.body));
  const ref = co.body.reference;
  const tx = (await fake('paystack', '/__control/state')).txs.find((t) => t.reference === ref);
  check('Paystack was asked for exactly 500000 kobo NGN for this customer', tx.amount === 500000 && tx.currency === 'NGN' && tx.email === buyer.email, JSON.stringify({ a: tx.amount, c: tx.currency, e: tx.email }));
  check('the return address is the page that asked (local-network origin allowed in development)', tx.callback_url === 'http://localhost:3100/payments/callback', tx.callback_url);
  check('payment metadata names the payment, user and assessment', tx.metadata.type === 'assessment' && tx.metadata.assessment_id === full.id && tx.metadata.user_id === buyer.id);

  const row = await prisma.payment.findUnique({ where: { provider_reference: ref } });
  check('DB: a pending payment for this user, no organisation, amount 5000', row.status === 'pending' && row.user_id === buyer.id && row.organization_id === null && row.amount === 5000 && row.payment_type === 'assessment' && row.assessment_id === full.id);

  const evil = await makeUser('evil');
  const evilCo = await checkout(evil.token, full.id, 'https://evil.example.com');
  const evilTx = (await fake('paystack', '/__control/state')).txs.find((t) => t.reference === evilCo.body.reference);
  check('a foreign origin cannot redirect the customer elsewhere (falls back to the real site)', evilTx.callback_url === 'http://localhost:3100/payments/callback', evilTx.callback_url);

  const again = await checkout(buyer.token, full.id);
  check('opening checkout again reuses the unpaid one (no double charge)', again.body.reference === ref && (await prisma.payment.count({ where: { user_id: buyer.id } })) === 1);

  const mine = await call('GET', '/payments', buyer.token);
  check('payment history lists it as pending, with no gateway secrets', mine.body.data.length === 1 && mine.body.data[0].status === 'pending' && !/authorization_url|access_code|metadata|provider_reference/.test(mine.text));

  // ---------------------------------------------------------------- verification by the browser
  const early = await verify(buyer.token, ref);
  check('verifying before paying says "pending", not failed', early.status === 200 && early.body.status === 'pending');
  check('still cannot start before payment is confirmed', (await call('POST', `/assessments/${full.id}/start`, buyer.token)).status === 402);
  check('another user cannot check someone else’s payment (404)', (await verify(other.token, ref)).status === 404);
  check('a malformed reference is rejected (400)', (await verify(buyer.token, 'x')).status === 400 && (await verify(buyer.token, '../../etc')).status === 400);

  const paid = await payOnFake(ref);
  check('the (fake) hosted page sends the customer back to the website with the reference', paid.status === 302 && paid.location === `http://localhost:3100/payments/callback?reference=${ref}&trxref=${ref}`);

  const ok = await verify(buyer.token, ref);
  check('after paying, verify reports success with the receipt details', ok.status === 200 && ok.body.status === 'success' && ok.body.payment.amount === 5000 && ok.body.payment.type === 'assessment' && ok.body.next.href === '/assessments/full', JSON.stringify(ok.body.status));
  const settled = await prisma.payment.findUnique({ where: { provider_reference: ref } });
  check('DB: payment is success, with the channel and time Paystack reported', settled.status === 'success' && settled.payment_method === 'card' && !!settled.processed_at);

  const sent = await emails();
  check('a receipt email went to the buyer with amount and reference', sent.length === 1 && sent[0].to === buyer.email && /Receipt/.test(sent[0].subject) && sent[0].html.includes(ref) && /5,000/.test(sent[0].html), sent[0]?.subject);
  check('the receipt links back to the assessment', sent[0].html.includes('/assessments/full'));

  const second = await verify(buyer.token, ref);
  check('verifying again is harmless and sends no second receipt', second.body.status === 'success' && (await emails()).length === 1);

  const afterList = (await assessments(buyer.token)).full;
  check('the assessment is now startable', afterList.can_start === true && afterList.blocked_reason === null);
  const started = await call('POST', `/assessments/${full.id}/start`, buyer.token);
  check('starting works, using up the paid attempt', started.status === 200 && started.body.resumed === false);
  const reCheckout = await checkout(buyer.token, full.id);
  check('while it is in progress there is nothing to buy (409 ATTEMPT_IN_PROGRESS)', reCheckout.status === 409 && reCheckout.body.code === 'ATTEMPT_IN_PROGRESS');
  const sub = started.body.submission;
  for (let i = 0; i < 50; i += 10) await call('PUT', `/submissions/${sub.id}/answers`, buyer.token, { answers: sub.questions.slice(i, i + 10).map((q, j) => ({ question_id: q.id, value: ((i + j) % 5) + 1 })) });
  await call('POST', `/submissions/${sub.id}/complete`, buyer.token);
  const locked = await checkout(buyer.token, full.id);
  check('after finishing, a new purchase is refused until the retake window opens, and nobody is charged', locked.status === 409 && locked.body.code === 'RETAKE_LOCKED' && !!locked.body.retake_available_at && (await prisma.payment.count({ where: { user_id: buyer.id } })) === 1);

  // ---------------------------------------------------------------- the webhook
  const hook = await makeUser('hook', { first: 'Hook', last: 'Tester' });
  const hookCo = await checkout(hook.token, full.id);
  const hookRef = hookCo.body.reference;
  const before = (await emails()).length;

  const tampered = await signedWebhook({ event: 'charge.success', reference: hookRef, tamper: true });
  check('webhook: a body changed after signing -> 401', tampered.status === 401);
  const badSecret = await signedWebhook({ event: 'charge.success', reference: hookRef, secret: 'sk_test_attackerguess123' });
  check('webhook: signed with the wrong secret -> 401', badSecret.status === 401);
  const unsigned = await fetch('http://localhost:3101/api/webhooks/paystack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'charge.success', data: { reference: hookRef } }) });
  check('webhook: no signature at all -> 401', unsigned.status === 401);
  check('webhook: nothing was granted by any of the forged attempts', (await prisma.payment.findUnique({ where: { provider_reference: hookRef } })).status === 'pending' && (await call('POST', `/assessments/${full.id}/start`, hook.token)).status === 402);

  await fake('paystack', '/__control/set', 'POST', { reference: hookRef, patch: { status: 'success', paid_at: new Date().toISOString(), channel: 'bank_transfer' } });
  const ignored = await signedWebhook({ event: 'transfer.success', reference: hookRef });
  check('webhook: an unrelated event is acknowledged and ignored', ignored.status === 200 && (await prisma.payment.findUnique({ where: { provider_reference: hookRef } })).status === 'pending');
  const unknown = await signedWebhook({ event: 'charge.success', reference: 'pb_not_ours_000000' });
  check('webhook: an unknown reference is acknowledged (so Paystack stops retrying)', unknown.status === 200);

  const results = await Promise.all([
    signedWebhook({ event: 'charge.success', reference: hookRef }),
    signedWebhook({ event: 'charge.success', reference: hookRef }),
    verify(hook.token, hookRef),
  ]);
  check('webhook: a genuine signed charge.success settles the payment', results[0].status === 200 && results[1].status === 200);
  const hookRow = await prisma.payment.findUnique({ where: { provider_reference: hookRef } });
  check('DB: settled once, with the channel from Paystack (bank_transfer)', hookRow.status === 'success' && hookRow.payment_method === 'bank_transfer');
  await sleep(500);
  check('two webhooks and a browser check at the same instant produced exactly ONE receipt', (await emails()).length === before + 1, `${(await emails()).length - before} new`);
  check('the customer can now start, even though their browser never came back', (await call('POST', `/assessments/${full.id}/start`, hook.token)).status === 200);

  // ---------------------------------------------------------------- fraud and outages
  const cheat = await makeUser('cheat');
  const cheatCo = await checkout(cheat.token, full.id);
  await fake('paystack', '/__control/set', 'POST', { reference: cheatCo.body.reference, patch: { status: 'success', amount: 100, paid_at: new Date().toISOString(), channel: 'card' } });
  const cheatVerify = await verify(cheat.token, cheatCo.body.reference);
  check('paying 1 naira instead of 5,000 is marked failed, never granted', cheatVerify.body.status === 'failed' && (await prisma.payment.findUnique({ where: { provider_reference: cheatCo.body.reference } })).status === 'failed');
  check('...and the assessment stays locked, with no receipt', (await call('POST', `/assessments/${full.id}/start`, cheat.token)).status === 402 && (await emails()).filter((e) => e.to === cheat.email).length === 0);

  const wrongCur = await makeUser('cur');
  const curCo = await checkout(wrongCur.token, full.id);
  await fake('paystack', '/__control/set', 'POST', { reference: curCo.body.reference, patch: { status: 'success', currency: 'USD', paid_at: new Date().toISOString() } });
  check('paying the right number in the wrong currency is also refused', (await verify(wrongCur.token, curCo.body.reference)).body.status === 'failed');

  const abandoned = await makeUser('abandon');
  const abCo = await checkout(abandoned.token, full.id);
  await fake('paystack', '/__control/set', 'POST', { reference: abCo.body.reference, patch: { status: 'abandoned' } });
  check('an abandoned checkout is recorded as failed', (await verify(abandoned.token, abCo.body.reference)).body.status === 'failed');

  const flaky = await makeUser('flaky');
  const flakyCo = await checkout(flaky.token, full.id);
  await fake('paystack', '/__control/set', 'POST', { reference: flakyCo.body.reference, patch: { status: 'success', paid_at: new Date().toISOString(), channel: 'card' } });
  await fake('paystack', '/__control/mode', 'POST', { verifyMode: 'down' });
  const outage = await verify(flaky.token, flakyCo.body.reference);
  check('if Paystack is unreachable the customer sees "still processing", not a false failure', outage.status === 200 && outage.body.status === 'pending');
  await fake('paystack', '/__control/mode', 'POST', { verifyMode: 'ok' });
  check('...and once Paystack is back, the same payment settles', (await verify(flaky.token, flakyCo.body.reference)).body.status === 'success');

  const down = await makeUser('down');
  await fake('paystack', '/__control/mode', 'POST', { initializeMode: 'error' });
  const downCo = await checkout(down.token, full.id);
  check('if Paystack cannot start a payment: 502 with a clear message and a code', downCo.status === 502 && downCo.body.code === 'PAYMENT_PROVIDER_ERROR' && !/Gateway exploded/.test(downCo.text));
  const failedRow = await prisma.payment.findFirst({ where: { user_id: down.id } });
  check('...the attempt is recorded as failed, so it is not offered again', failedRow.status === 'failed');
  await fake('paystack', '/__control/mode', 'POST', { initializeMode: 'ok' });
  const retry = await checkout(down.token, full.id);
  check('...and a later retry works normally', retry.status === 200 && retry.body.reference !== failedRow.provider_reference);

  // ---------------------------------------------------------------- what the admin console sees
  const adminLogin = await call('POST', '/auth/login', null, { email: 'admin@personnelq.local', password: 'DevAdmin2026@pb' });
  const adminPayments = await call('GET', '/admin/payments?limit=100', adminLogin.body.access_token);
  const ourRefs = adminPayments.body.data.filter((p) => p.provider_reference === ref || p.provider_reference === hookRef);
  check('the admin console lists these real payments', ourRefs.length === 2 && ourRefs.every((p) => p.status === 'success'));
  check('...without ever exposing gateway secrets', !/authorization_url|access_code|AUTH_secret|pay\/pb_/.test(adminPayments.text));

  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await require('./lib').cleanup(); } catch {} process.exit(2); });
