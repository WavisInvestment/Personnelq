process.env.W5_TAG = 'cls';
const { call, fake, check, makeUser, assessments, grantPaid, takeAssessment, finish } = require('./lib');

const publicBadge = (token) => fetch(`http://localhost:3101/api/v1/public/badges/${token}`).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

(async () => {
  await fake('claude', '/__control/reset', 'POST');
  const ada = await makeUser('ada', { first: 'Ada', last: 'Uzo' });
  const { snap, full } = await assessments(ada.token);

  // ---- the free snapshot: a class and a short analysis, nothing to show as a breakdown
  const r1 = await takeAssessment(ada.token, snap.id);
  const v1 = (await call('GET', `/results/${r1.id}`, ada.token)).body;
  check('the free result has a personality class with a name, strengths and three classes it pairs well with', /^CL-0[1-8]$/.test(v1.profile_class?.name) && v1.profile_class.strengths.length === 3 && v1.profile_class.pairs_with.length === 3, JSON.stringify(v1.profile_class)?.slice(0, 120));
  check('...and a progress tier: step 1 of 3, Explorer', v1.tier?.key === 'explorer' && v1.tier.step === 1 && v1.tier.of === 3);
  check('the free assessment is named without the framework', v1.assessment.name === 'Free personality snapshot', v1.assessment.name);
  check('the AI analysis can be written for the snapshot', v1.insights_available === true && v1.insights === null);
  const a1 = await call('POST', `/results/${r1.id}/insights`, ada.token);
  check('writing it returns three sections', a1.status === 200 && Object.keys(a1.body.insights).join() === 'personality,strengths,recommendations', a1.text);
  check('...and it is saved on the result', Object.keys((await call('GET', `/results/${r1.id}`, ada.token)).body.insights ?? {}).length === 3);

  // ---- the full assessment: class, tier 2, and the badge shows them when the owner chooses
  await grantPaid(ada, full.id);
  const r2 = await takeAssessment(ada.token, full.id);
  const v2 = (await call('GET', `/results/${r2.id}`, ada.token)).body;
  check('the full result has a class and tier 2 (Insight)', !!v2.profile_class?.name && v2.tier?.key === 'insight' && v2.tier.step === 2);
  check('the full assessment is named without the framework', !/Big Five|OCEAN/i.test(v2.assessment.name) && /personality/i.test(v2.assessment.name), v2.assessment.name);

  const badge = await call('PUT', `/results/${r2.id}/badge`, ada.token, { is_public: true, display_name: 'Ada' });
  const token = badge.body.badge.share_path.replace('/b/', '');
  check('a new badge shows the class by default', badge.body.badge.shared_elements.class === true);
  const seen = await publicBadge(token);
  check('the public badge carries the class, its three partners and the tier, and nothing about the account', seen.body.profile_class?.name === v2.profile_class.name && seen.body.profile_class.pairs_with.length === 3 && seen.body.tier?.key === 'insight' && !JSON.stringify(seen.body).includes(ada.email));
  await call('PUT', `/results/${r2.id}/badge`, ada.token, { is_public: true, show_class: false });
  const hidden = await publicBadge(token);
  check('with the class switched off the badge no longer shows the class or tier', hidden.body.profile_class === null && hidden.body.tier === null);

  // ---- the class is stable and fair
  const again = (await call('GET', `/results/${r2.id}`, ada.token)).body;
  check('the same scores always give the same class', again.profile_class.key === v2.profile_class.key);

  await finish();
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
