process.env.W5_TAG = 'w7c';
const { prisma, call, check, makeUser, finish } = require('./lib');

const getRaw = async (path, token) => { const r = await fetch('http://localhost:3101/api/v1' + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} }); return { status: r.status, headers: r.headers, text: Buffer.from(await r.arrayBuffer()).toString('utf8') }; };
const audit = (orgId, action) => prisma.auditLog.count({ where: { organization_id: orgId, action } });
const INTERP = (p) => ({ low: `${p} low text`, medium: `${p} medium text`, high: `${p} high text` });
const GOOD = () => ({
  name: 'Customer service fit',
  description: 'How we serve people',
  allow_retake: false,
  retake_interval_days: 90,
  sections: [
    { name: 'Empathy', description: null, weight: 2, interpretation: INTERP('Empathy'), questions: [{ text: 'I listen before I answer.', reverse: false, weight: 1 }, { text: 'I get impatient with upset customers.', reverse: true, weight: 2 }] },
    { name: 'Follow-through', description: 'Closing the loop', weight: 1, interpretation: INTERP('Follow'), questions: [{ text: 'I confirm the problem is solved.', reverse: false, weight: 1 }] },
  ],
});

async function take(token, assessmentId, answerFor) {
  const start = await call('POST', `/assessments/${assessmentId}/start`, token, {});
  if (start.status !== 200) return { start };
  const sub = start.body.submission;
  const answers = sub.questions.map((q) => ({ question_id: q.id, value: answerFor(q.text) }));
  await call('PUT', `/submissions/${sub.id}/answers`, token, { answers });
  const done = await call('POST', `/submissions/${sub.id}/complete`, token);
  return { start, sub, done };
}

(async () => {
  const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });
  const admin = await makeUser('admin', { first: 'Ada', last: 'Boss' });
  const hr = await makeUser('hr', { first: 'Hana', last: 'Resources' });
  const e1 = await makeUser('e1', { first: 'Eve', last: 'One' });
  const e2 = await makeUser('e2', { first: 'Tunde', last: 'Two' });
  const stranger = await makeUser('stranger');
  const oadmin = await makeUser('oadmin');

  const mkOrg = async (slug, name, owner) => {
    const o = await prisma.organization.create({ data: { name, slug, type: 'corporate', admin_name: 'x', admin_email: owner.email } });
    await prisma.organizationMember.create({ data: { user_id: owner.id, organization_id: o.id, role_id: (await role('admin')).id } });
    await prisma.subscription.create({ data: { organization_id: o.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 30 * 86400000), auto_renew: false, seats_used: 0, seats_limit: 10 } });
    return o;
  };
  const org = await mkOrg('w5-w7c-acme', 'Acme Co', admin);
  const other = await mkOrg('w5-w7c-other', 'Other Co', oadmin);
  await prisma.organizationMember.create({ data: { user_id: hr.id, organization_id: org.id, role_id: (await role('hr')).id } });
  for (const [u, dept] of [[e1, '=SUM(1+1)'], [e2, 'Support']]) await prisma.organizationMember.create({ data: { user_id: u.id, organization_id: org.id, role_id: (await role('employee')).id, department: dept, consented_at: new Date() } });
  const O = org.id;
  const A = `/organizations/${O}/assessments`;

  // ---------------------------------------------------------------- who may do what
  for (const [who, label, expected] of [[null, 'no login', 401], [stranger, 'a stranger', 403], [oadmin, 'another company’s admin', 403], [e1, 'an employee', 403]]) {
    check(`access: ${label} cannot list, create or edit (${expected})`, (await call('GET', A, who?.token)).status === expected && (await call('POST', A, who?.token, { name: 'Sneaky one' })).status === expected);
  }

  // ---------------------------------------------------------------- creating and editing a draft
  check('create: a name under 3 characters is refused (400)', (await call('POST', A, admin.token, { name: 'ab' })).status === 400 && (await call('POST', A, admin.token, {})).status === 400);
  const created = await call('POST', A, hr.token, { name: 'Customer service fit' });
  const id = created.body.id;
  check('create: HR can create a draft', created.status === 200 && !!id, created.text);
  check('create: it shows in the list as a draft with nothing in it', (await call('GET', A, admin.token)).body.data[0].status === 'draft' && (await call('GET', A, admin.token)).body.data[0].questions === 0);
  check('create: another company cannot see or open it', (await call('GET', `/organizations/${other.id}/assessments/${id}`, oadmin.token)).status === 404 && (await call('GET', `/organizations/${other.id}/assessments`, oadmin.token)).body.data.length === 0);

  for (const [label, body] of [
    ['an unknown field', { ...GOOD(), is_locked: true }],
    ['a section weight of 9', { ...GOOD(), sections: [{ ...GOOD().sections[0], weight: 9 }] }],
    ['a question text over 300 characters', { ...GOOD(), sections: [{ ...GOOD().sections[0], questions: [{ text: 'x'.repeat(301), reverse: false, weight: 1 }] }] }],
    ['a non-boolean reverse flag', { ...GOOD(), sections: [{ ...GOOD().sections[0], questions: [{ text: 'A fair statement', reverse: 'yes', weight: 1 }] }] }],
    ['more than 10 sections', { ...GOOD(), sections: Array.from({ length: 11 }, (_, i) => ({ ...GOOD().sections[0], name: `S${i}` })) }],
    ['a retake interval of 5000 days', { ...GOOD(), retake_interval_days: 5000 }],
  ]) check(`save: ${label} -> 400`, (await call('PUT', `${A}/${id}`, admin.token, body)).status === 400);

  const saved = await call('PUT', `${A}/${id}`, admin.token, GOOD());
  check('save: a valid draft is stored and read back exactly', saved.status === 200 && saved.body.sections.length === 2 && saved.body.sections[0].questions[1].reverse === true && saved.body.sections[0].questions[1].weight === 2 && saved.body.sections[0].interpretation.low === 'Empathy low text', saved.text.slice(0, 200));
  const lone = { ...GOOD(), sections: [GOOD().sections[0]] };
  const resaved = await call('PUT', `${A}/${id}`, admin.token, lone);
  check('save: saving again replaces the questions rather than adding to them', resaved.body.sections.length === 1 && (await prisma.assessmentQuestion.count({ where: { assessment_id: id } })) === 2);
  await call('PUT', `${A}/${id}`, admin.token, GOOD());
  check('draft: people cannot see or start a draft', (await call('GET', '/assessments/company', e1.token)).body.data.length === 0 && (await call('POST', `/assessments/${id}/start`, e1.token, {})).status === 404);

  // ---------------------------------------------------------------- publishing
  const empty = (await call('POST', A, admin.token, { name: 'Half written' })).body.id;
  await call('PUT', `${A}/${empty}`, admin.token, { ...GOOD(), name: 'Half written', sections: [{ ...GOOD().sections[0], questions: [] }] });
  const notReady = await call('POST', `${A}/${empty}/publish`, admin.token);
  check('publish: an incomplete draft is refused with a plain-words reason (400)', notReady.status === 400 && notReady.body.code === 'NOT_READY' && /Add at least one question to “Empathy”/.test(notReady.body.message), notReady.text);
  check('publish: employees cannot publish (403)', (await call('POST', `${A}/${id}/publish`, e1.token)).status === 403);
  const pub = await call('POST', `${A}/${id}/publish`, admin.token);
  check('publish: a complete draft is published and locked', pub.status === 200 && pub.body.status === 'published' && (await prisma.assessment.findUnique({ where: { id } })).is_locked === true);
  check('publish: it cannot be edited or published again (409)', (await call('PUT', `${A}/${id}`, admin.token, GOOD())).body?.code === 'ASSESSMENT_PUBLISHED' && (await call('POST', `${A}/${id}/publish`, admin.token)).status === 409);

  // ---------------------------------------------------------------- taking it
  const list = (await call('GET', '/assessments/company', e1.token)).body.data;
  check('take: the employee sees it, labelled with the company, not started', list.length === 1 && list[0].company.name === 'Acme Co' && list[0].status === 'not_started' && list[0].total_questions === 3 && list[0].can_start === true);
  check('take: people outside the company see nothing, and cannot start it (404)', (await call('GET', '/assessments/company', stranger.token)).body.data.length === 0 && (await call('POST', `/assessments/${id}/start`, stranger.token, {})).status === 404 && [403, 404].includes((await call('POST', `/assessments/${id}/start`, oadmin.token, {})).status));
  check('take: the official list does not mix company assessments in', !(await call('GET', '/assessments', e1.token)).body.data.some((a) => a.id === id));

  // answers: Empathy q1=5, q2=1 (reverse -> 5) => 100; Follow-through q3=3 => 50; overall = (100*2 + 50*1) / 3 = 83.3
  const answerFor = (text) => (/listen/.test(text) ? 5 : /impatient/.test(text) ? 1 : 3);
  const run1 = await take(e1.token, id, answerFor);
  check('take: starting needs no payment even though payments are switched on', run1.start.status === 200);
  check('take: the questions sent to the browser reveal nothing about sections, direction or weights', run1.sub.questions.every((q) => !('section_key' in q) && !('reverse' in q) && !('weight' in q) && q.options.length === 5));
  check('take: finishing returns a custom result owned by the person and shared with the company', run1.done.status === 200 && run1.done.body.kind === 'custom' && run1.done.body.company === 'Acme Co' && run1.done.body.traits.length === 0, run1.done.text.slice(0, 160));
  const c = run1.done.body.custom;
  check('score: Empathy 100, Follow-through 50, overall 83.3 (sections and weights applied by the server)', c.sections[0].score === 100 && c.sections[1].score === 50 && c.overall.score === 83.3 && c.overall.level_label === 'Very high', JSON.stringify(c.sections.map((s) => s.score)) + ' ' + c.overall.score);
  check('score: the person sees the administrator’s wording for their band', c.sections[0].text === 'Empathy high text' && c.sections[1].text === 'Follow medium text');
  const row = await prisma.assessmentResult.findUnique({ where: { id: run1.done.body.id } });
  check('score: stored with the company, OCEAN columns empty, wording frozen in the result', row.organization_id === O && row.openness_score === null && row.neuroticism_score === null && row.custom_scores.sections[0].text === 'Empathy high text');
  check('score: the person’s results list marks it custom, with no traits', (await call('GET', '/results', e1.token)).body.data[0].kind === 'custom' && (await call('GET', '/results', e1.token)).body.data[0].traits.length === 0);
  check('score: reports, insights and badges are not offered for it (400)', (await call('GET', `/results/${run1.done.body.id}/report`, e1.token)).status === 400 && (await call('POST', `/results/${run1.done.body.id}/insights`, e1.token)).status === 400 && (await call('PUT', `/results/${run1.done.body.id}/badge`, e1.token, { is_public: true })).status === 400);
  check('score: nobody else can open that result (404)', (await call('GET', `/results/${run1.done.body.id}`, e2.token)).status === 404);
  check('score: it does not disturb the person’s personality progress', (await call('GET', '/me/progress', e1.token)).body.summary.full_attempts === 0);

  // second employee starts but doesn't finish
  const start2 = await call('POST', `/assessments/${id}/start`, e2.token, {});
  await call('PUT', `/submissions/${start2.body.submission.id}/answers`, e2.token, { answers: [{ question_id: start2.body.submission.questions[0].id, value: 4 }] });

  // ---------------------------------------------------------------- retake window
  const again = await call('POST', `/assessments/${id}/start`, e1.token, {});
  check('retake: with retakes off, a second attempt is refused (409)', again.status === 409 && again.body.code === 'RETAKE_NEEDS_APPROVAL');
  const after = (await call('GET', '/assessments/company', e1.token)).body.data[0];
  check('retake: the list shows it finished, locked, with a link to the result', after.status === 'completed' && after.can_start === false && after.latest_result.id === run1.done.body.id);

  // ---------------------------------------------------------------- what HR sees
  const res = (await call('GET', `${A}/${id}/results`, hr.token)).body;
  check('results: 2 people, 1 finished, 1 in progress, average overall 83.3', res.team.members === 2 && res.team.completed === 1 && res.team.in_progress === 1 && res.team.overall_average === 83.3, JSON.stringify(res.team));
  check('results: per-section averages and bands', res.sections[0].average === 100 && res.sections[0].high === 1 && res.sections[1].average === 50 && res.sections[1].medium === 1);
  const m1 = res.members.find((m) => m.user_id === e1.id);
  check('results: each person with status, overall and section scores', m1.status === 'completed' && m1.overall.score === 83.3 && m1.sections.length === 2 && res.members.find((m) => m.user_id === e2.id).status === 'in_progress');
  check('results: employees cannot read them (403)', (await call('GET', `${A}/${id}/results`, e1.token)).status === 403);
  const od = (await call('GET', `/organizations/${O}/dashboard`, hr.token)).body;
  check('isolation: the personality dashboard ignores the custom assessment (0 finished, 0 in progress)', od.team.completed === 0 && od.team.in_progress === 0 && od.team.not_started === 2, JSON.stringify(od.team));
  const csv = await getRaw(`${A}/${id}/results.csv`, hr.token);
  check('csv: dated attachment, BOM, one row per person, formula in the department neutralised', csv.status === 200 && /attachment; filename="customer-service-fit-results-\d{4}-\d{2}-\d{2}\.csv"/.test(csv.headers.get('content-disposition')) && csv.text.charCodeAt(0) === 0xfeff && csv.text.trim().split(/\r?\n/).length === 3 && csv.text.includes("'=SUM(1+1)") && csv.text.includes('Empathy score,Empathy level'));
  check('csv: employees cannot export (403); the export is audited', (await getRaw(`${A}/${id}/results.csv`, e1.token)).status === 403 && (await audit(O, 'results.exported')) === 1);

  // ---------------------------------------------------------------- new version, then archive the old one
  const v2 = (await call('POST', `${A}/${id}/new-version`, admin.token)).body.id;
  const v2m = (await call('GET', `${A}/${v2}`, admin.token)).body;
  check('version: a new editable draft with the same content, version 2.0.0', v2m.status === 'draft' && v2m.version === '2.0.0' && v2m.sections.length === 2 && v2m.sections[0].questions.length === 2);
  check('version: the published one is untouched and still available', (await call('GET', '/assessments/company', e2.token)).body.data.length === 1);
  await call('PUT', `${A}/${v2}`, admin.token, { ...GOOD(), name: 'Customer service fit v2', allow_retake: true, retake_interval_days: 30 });
  await call('POST', `${A}/${v2}/publish`, admin.token);
  check('version: both versions now show for people to take', (await call('GET', '/assessments/company', e2.token)).body.data.length === 2);

  const arch = await call('DELETE', `${A}/${id}`, admin.token);
  check('archive: the old version is archived', arch.status === 200 && (await call('GET', `${A}/${id}`, admin.token)).status === 404);
  const abandoned = await prisma.assessmentSubmission.findUnique({ where: { id: start2.body.submission.id } });
  check('archive: the attempt in progress ended; people can no longer start it', abandoned.status === 'abandoned' && (await call('POST', `/assessments/${id}/start`, e2.token, {})).status === 404);
  check('archive: finished results stay with their owners and still open', (await call('GET', `/results/${run1.done.body.id}`, e1.token)).status === 200);
  check('archive: only the new version is offered now', (await call('GET', '/assessments/company', e2.token)).body.data.map((a) => a.id).join() === v2);

  const run2 = await take(e1.token, v2, () => 1);
  // all answers 1: Empathy = q1 0 of 4, reverse q2 8 of 8 => 8/12 = 66.7; Follow-through 0
  check('version: a person who finished v1 can take v2 fresh, scored the same way', run2.done.status === 200 && run2.done.body.custom.sections[0].score === 66.7 && run2.done.body.custom.sections[1].score === 0, JSON.stringify(run2.done.body?.custom?.sections?.map((s) => s.score)));

  // ---------------------------------------------------------------- leaving, lapsed plan
  await call('POST', `/organizations/${O}/leave`, e1.token);
  check('leave: results taken through the company are detached, so HR no longer sees them', (await prisma.assessmentResult.count({ where: { user_id: e1.id, organization_id: O } })) === 0 && (await call('GET', `${A}/${v2}/results`, hr.token)).body.team.members === 1);
  check('leave: the person still opens their own result, and company assessments disappear from their list', (await call('GET', `/results/${run1.done.body.id}`, e1.token)).body.company === null && (await call('GET', '/assessments/company', e1.token)).body.data.length === 0);
  await prisma.subscription.update({ where: { organization_id: O }, data: { end_date: new Date(Date.now() - 1000) } });
  check('plan: when the company plan lapses, members can’t start company assessments (404)', (await call('GET', '/assessments/company', e2.token)).body.data.length === 0 && (await call('POST', `/assessments/${v2}/start`, e2.token, {})).status === 404);
  check('audit: creating, publishing, versioning and archiving are recorded', (await audit(O, 'assessment.created')) >= 2 && (await audit(O, 'assessment.published')) === 2 && (await audit(O, 'assessment.versioned')) === 1 && (await audit(O, 'assessment.archived')) === 1);

  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await require('./lib').cleanup(); } catch {} process.exit(2); });
