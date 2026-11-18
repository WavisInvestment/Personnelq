const part = process.argv[2] || '1';
process.env.W5_TAG = 'ai' + part;
const { prisma, call, fake, check, sleep, makeUser, assessments, grantPaid, takeAssessment, finish } = require('./lib');

const KEYS = ['personality', 'communication', 'leadership', 'working_style', 'relationship_style', 'strengths', 'blind_spots', 'recommendations'];
const fresh = () => ({ 'X-Forwarded-For': `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}` });
const insights = (token, id) => call('POST', `/results/${id}/insights`, token, undefined, fresh());
const claudeCalls = async () => (await fake('claude', '/__control/calls')).calls;
const fullResult = async (user, full) => { await grantPaid(user, full.id); return takeAssessment(user.token, full.id); };

(async () => {
  await fake('claude', '/__control/reset', 'POST');

  if (part === '1') {
    const a = await makeUser('a', { first: 'Ada', last: 'Secretname' });
    const b = await makeUser('b');
    const { snap, full } = await assessments(a.token);
    const snapResult = await takeAssessment(a.token, snap.id);
    const resultA = await fullResult(a, full);

    const view0 = await call('GET', `/results/${resultA.id}`, a.token);
    check('a fresh full result has no insights yet, and says they can be generated', view0.body.insights === null && view0.body.insights_available === true);
    check('the snapshot offers its short analysis', (await call('GET', `/results/${snapResult.id}`, a.token)).body.insights_available === true);

    check('someone else cannot generate insights for my result (404)', (await insights(b.token, resultA.id)).status === 404);
    check('...and Claude has not been contacted before anyone asks', (await claudeCalls()) === 0);
    const preview = await insights(a.token, snapResult.id);
    check('the free snapshot gets a short analysis: three sections only, no dimension-by-dimension breakdown', preview.status === 200 && Object.keys(preview.body.insights).join() === 'personality,strengths,recommendations');
    const snapSent = (await fake('claude', '/__control/calls')).last.body;
    check('...written from a prompt that never names the framework, and carries the class', !/Big Five|OCEAN/i.test(JSON.stringify(snapSent).replace(/never use the words[^.]*\./gi, '')) && /profile class is "CL-0[1-8]"/.test(snapSent.messages[0].content));
    check('...and asking again returns the same analysis without another call', (await insights(a.token, snapResult.id)).status === 200 && (await claudeCalls()) === 1);
    await fake('claude', '/__control/reset', 'POST');

    const gen = await insights(a.token, resultA.id);
    check('generating returns all eight sections, each with a summary and points', gen.status === 200 && KEYS.every((k) => typeof gen.body.insights[k]?.summary === 'string' && gen.body.insights[k].points.length >= 2), JSON.stringify(Object.keys(gen.body.insights || {})));
    check('the model and generation time are recorded', gen.body.model === 'claude-sonnet-5-5' && !!gen.body.generated_at);

    const calls = await fake('claude', '/__control/calls');
    check('Claude was called exactly once', calls.calls === 1);
    const sent = calls.last;
    check('the request carried the API key and version header', sent.headers['x-api-key'] === 'sk-ant-api03-fakefakefake1234' && !!sent.headers['anthropic-version']);
    check('the request used the configured model with a system prompt and one user message', sent.body.model === 'claude-sonnet-5-5' && sent.body.system.includes('JSON') && sent.body.messages.length === 1 && sent.body.messages[0].role === 'user' && sent.body.max_tokens > 1000);
    const row = await prisma.assessmentResult.findUnique({ where: { id: resultA.id } });
    const scoreStr = [row.openness_score, row.conscientiousness_score, row.extraversion_score, row.agreeableness_score, row.neuroticism_score].map((s) => `${Math.round(s)}/100`);
    check('the user message contains the five real scores', scoreStr.every((s) => sent.body.messages[0].content.includes(s)), scoreStr.join(' '));
    const wire = JSON.stringify(sent.body);
    check('PRIVACY: nothing identifying was sent: no name, email, user id or result id', !wire.includes('Secretname') && !wire.includes(a.email) && !wire.includes(a.id) && !wire.includes(resultA.id) && !/@w5\.test/.test(wire));

    const again = await insights(a.token, resultA.id);
    check('asking again returns the saved insights without calling Claude again', again.status === 200 && JSON.stringify(again.body.insights) === JSON.stringify(gen.body.insights) && (await claudeCalls()) === 1);
    const viewAfter = await call('GET', `/results/${resultA.id}`, a.token);
    check('the result now includes the insights', viewAfter.body.insights?.strengths?.points?.length >= 2 && !!viewAfter.body.insights_generated_at);
    const stored = await prisma.assessmentResult.findUnique({ where: { id: resultA.id } });
    check('DB: stored once, with model and time', !!stored.ai_interpretation && stored.ai_model === 'claude-sonnet-5-5' && !!stored.ai_generated_at && Object.keys(JSON.parse(stored.ai_interpretation)).length === 8);

    // a flaky first reply is retried once, with the problem explained
    const c = await makeUser('c');
    const resultC = await fullResult(c, full);
    await fake('claude', '/__control/mode', 'POST', { mode: 'prose-first' });
    const before = await claudeCalls();
    const retried = await insights(c.token, resultC.id);
    const retryCalls = await fake('claude', '/__control/calls');
    check('a reply that is not JSON is retried once and then accepted', retried.status === 200 && retryCalls.calls === before + 2);
    check('the retry tells Claude what was wrong', retryCalls.last.body.messages[0].content.includes('could not be used'));

    // permanently unusable replies fail cleanly and leave nothing behind
    const d = await makeUser('d');
    const resultD = await fullResult(d, full);
    await fake('claude', '/__control/mode', 'POST', { mode: 'always-prose' });
    const bad = await insights(d.token, resultD.id);
    check('two unusable replies -> 502 AI_ERROR with a friendly message', bad.status === 502 && bad.body.code === 'AI_ERROR' && /try again/i.test(bad.body.message));
    check('...nothing was saved', (await prisma.assessmentResult.findUnique({ where: { id: resultD.id } })).ai_interpretation === null && (await call('GET', `/results/${resultD.id}`, d.token)).body.insights === null);

    await fake('claude', '/__control/mode', 'POST', { mode: 'error' });
    const down = await insights(d.token, resultD.id);
    check('an upstream outage -> 502, and the provider’s error text (which may hold secrets) is never shown', down.status === 502 && !/sk-ant|leak|upstream/i.test(down.text), down.text);

    await fake('claude', '/__control/mode', 'POST', { mode: 'ok' });
    const recovered = await insights(d.token, resultD.id);
    check('after the outage, the same result can be tried again and succeeds', recovered.status === 200 && Object.keys(recovered.body.insights).length === 8, recovered.text.slice(0, 200));
  }

  if (part === '2') {
    const { full } = await assessments((await makeUser('seed')).token);
    const e = await makeUser('e');
    const resultE = await fullResult(e, full);
    await fake('claude', '/__control/mode', 'POST', { mode: 'ok', delay_ms: 1200 });
    const start = await claudeCalls();

    const three = await Promise.all([insights(e.token, resultE.id), insights(e.token, resultE.id), insights(e.token, resultE.id)]);
    check('three simultaneous requests all succeed', three.every((r) => r.status === 200));
    check('...with identical content', new Set(three.map((r) => JSON.stringify(r.body.insights))).size === 1);
    check('...but Claude (which costs money) was called only once', (await claudeCalls()) === start + 1, `${(await claudeCalls()) - start} call(s)`);
    check('DB: written once', (await prisma.assessmentResult.findUnique({ where: { id: resultE.id } })).ai_model === 'claude-sonnet-5-5');

    await fake('claude', '/__control/mode', 'POST', { mode: 'fenced', delay_ms: 0 });
    const f = await makeUser('f');
    const resultF = await fullResult(f, full);
    check('a reply wrapped in a ```json fence is understood', (await insights(f.token, resultF.id)).status === 200);
  }

  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await require('./lib').cleanup(); } catch {} process.exit(2); });
