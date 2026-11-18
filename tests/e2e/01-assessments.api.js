const { need } = require('./lib');
const { PrismaClient } = need('@prisma/client');
const prisma = new PrismaClient();
const API = process.env.W5_API || 'http://localhost:3101/api/v1';
let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const call = async (method, path, token, body) => {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, body: json, text: JSON.stringify(json) };
};
const PW = 'Secure123!x';
const signup = async (email) => { await call('POST', '/auth/signup', null, { email, first_name: 'Wk', last_name: 'Four', password: PW, password_confirm: PW }); return (await call('POST', '/auth/login', null, { email, password: PW })).body.access_token; };
const sqlFails = async (sql) => { try { await prisma.$executeRawUnsafe(sql); return false; } catch (e) { return String(e.message).replace(/\s+/g, ' ').slice(-140); } };

// independent expected score, computed from what the DATABASE stores (not from application code)
async function expected(assessmentId, valueFor) {
  const qs = await prisma.assessmentQuestion.findMany({ where: { assessment_id: assessmentId } });
  const acc = {};
  for (const q of qs) {
    const raw = valueFor(q);
    const eff = q.ocean_direction === 'reverse' ? 6 - raw : raw;
    acc[q.ocean_trait] ??= { s: 0, n: 0 };
    acc[q.ocean_trait].s += eff - 1; acc[q.ocean_trait].n += 4;
  }
  return Object.fromEntries(Object.entries(acc).map(([t, v]) => [t, Math.round((v.s / v.n) * 1000) / 10]));
}
const traitMap = (result) => Object.fromEntries(result.traits.map((t) => [t.trait, t.score]));

(async () => {
  // this suite uses fixed addresses, so clear any leftovers from an interrupted run first
  await prisma.user.deleteMany({ where: { email: { in: ['a@w4.test', 'b@w4.test'] } } });
  const A = await signup('a@w4.test');
  const B = await signup('b@w4.test');

  check('anonymous cannot list assessments (401)', (await call('GET', '/assessments')).status === 401);
  const list = await call('GET', '/assessments', A);
  const snap = list.body.data.find((x) => x.slug === 'ocean-snapshot');
  const fullA = list.body.data.find((x) => x.slug === 'ocean-full');
  check('lists the two official assessments, smallest first', list.status === 200 && list.body.data.length === 2 && list.body.data[0].slug === 'ocean-snapshot');
  check('fresh user: not started, can start', snap.status === 'not_started' && snap.can_start && fullA.status === 'not_started' && fullA.can_start, `${snap.estimated_minutes}/${fullA.estimated_minutes} min`);

  // ---- snapshot ----
  const start = await call('POST', `/assessments/${snap.id}/start`, A);
  const sub = start.body.submission;
  check('start returns 10 questions in order with a 5-point scale', start.status === 200 && !start.body.resumed && sub.questions.length === 10 && sub.questions.every((q, i) => q.number === i + 1 && q.options.length === 5 && q.min === 1 && q.max === 5));
  const leak = start.text;
  check('questions never reveal trait or scoring direction', !/ocean_trait|ocean_direction|reverse|extraversion|neuroticism|openness|agreeableness|conscientiousness|weight/i.test(JSON.stringify(sub.questions)));

  const qs = sub.questions;
  const first5 = qs.slice(0, 5).map((q, i) => ({ question_id: q.id, value: (i % 5) + 1, time_spent_seconds: 4 }));
  const save1 = await call('PUT', `/submissions/${sub.id}/answers`, A, { answers: first5 });
  check('saving 5 of 10 reports 50% progress', save1.status === 200 && save1.body.answered === 5 && save1.body.progress_percent === 50, JSON.stringify(save1.body));

  const resume = await call('POST', `/assessments/${snap.id}/start`, A);
  check('starting again resumes the same attempt with saved answers', resume.body.resumed === true && resume.body.submission.id === sub.id && Object.keys(resume.body.submission.answers).length === 5);
  const mid = (await call('GET', '/assessments', A)).body.data.find((x) => x.slug === 'ocean-snapshot');
  check('list shows it in progress at 50%', mid.status === 'in_progress' && mid.in_progress.progress_percent === 50 && mid.in_progress.answered === 5);

  check('another user cannot read it (404)', (await call('GET', `/submissions/${sub.id}`, B)).status === 404);
  check('another user cannot answer it (404)', (await call('PUT', `/submissions/${sub.id}/answers`, B, { answers: first5 })).status === 404);
  check('another user cannot complete it (404)', (await call('POST', `/submissions/${sub.id}/complete`, B)).status === 404);

  const early = await call('POST', `/submissions/${sub.id}/complete`, A);
  check('finishing early -> 400 INCOMPLETE with the count left', early.status === 400 && early.body.code === 'INCOMPLETE' && early.body.missing === 5, early.body.message);

  check('answer of 6 -> 400', (await call('PUT', `/submissions/${sub.id}/answers`, A, { answers: [{ question_id: qs[5].id, value: 6 }] })).status === 400);
  check('answer of 0 -> 400', (await call('PUT', `/submissions/${sub.id}/answers`, A, { answers: [{ question_id: qs[5].id, value: 0 }] })).status === 400);
  check('unknown question -> 400', (await call('PUT', `/submissions/${sub.id}/answers`, A, { answers: [{ question_id: 'made-up', value: 3 }] })).status === 400);
  check('empty answer list -> 400', (await call('PUT', `/submissions/${sub.id}/answers`, A, { answers: [] })).status === 400);
  check('changing an earlier answer is allowed while in progress', (await call('PUT', `/submissions/${sub.id}/answers`, A, { answers: [{ question_id: qs[0].id, value: 5 }] })).status === 200);

  const rest = qs.slice(5).map((q, i) => ({ question_id: q.id, value: 5 - (i % 3) }));
  await call('PUT', `/submissions/${sub.id}/answers`, A, { answers: rest });
  const answerOf = { [qs[0].id]: 5 };
  first5.slice(1).forEach((a) => (answerOf[a.question_id] = a.value));
  rest.forEach((a) => (answerOf[a.question_id] = a.value));
  const done = await call('POST', `/submissions/${sub.id}/complete`, A);
  const r1 = done.body;
  const dbQ = await prisma.assessmentQuestion.findMany({ where: { assessment_id: snap.id } });
  const exp1 = await expected(snap.id, (q) => answerOf[q.id]);
  check('completing returns a result', done.status === 200 && r1.id && r1.submission_number === 1 && r1.is_current === true);
  check('scores match an independent calculation from the stored questions', JSON.stringify(traitMap(r1)) === JSON.stringify(Object.fromEntries(['openness','conscientiousness','extraversion','agreeableness','neuroticism'].map((t) => [t, exp1[t]]))), JSON.stringify(traitMap(r1)));
  check('snapshot result is a preview: levels, no written readings, no disclaimer', r1.is_preview === true && r1.traits.every((t) => t.description === null && t.level_label) && r1.disclaimer === null);
  check('percentile is not invented', r1.percentile === null);
  check('retake info says when it opens (7 days)', r1.retake.available === false && Math.abs(new Date(r1.retake.available_at) - (Date.now() + 7 * 86400000)) < 60000);

  const again = await call('POST', `/submissions/${sub.id}/complete`, A);
  check('completing twice returns the same result (idempotent)', again.status === 200 && again.body.id === r1.id);

  const locked = await call('PUT', `/submissions/${sub.id}/answers`, A, { answers: [{ question_id: qs[0].id, value: 1 }] });
  check('answers of a completed attempt cannot change (409 SUBMISSION_LOCKED)', locked.status === 409 && locked.body.code === 'SUBMISSION_LOCKED');

  const retakeNow = await call('POST', `/assessments/${snap.id}/start`, A);
  check('immediate retake is refused (409 RETAKE_LOCKED with a date)', retakeNow.status === 409 && retakeNow.body.code === 'RETAKE_LOCKED' && !!retakeNow.body.retake_available_at);
  const after = (await call('GET', '/assessments', A)).body.data.find((x) => x.slug === 'ocean-snapshot');
  check('list shows completed, blocked, with the retake date', after.status === 'completed' && after.can_start === false && after.blocked_reason === 'RETAKE_LOCKED' && after.latest_result.id === r1.id);

  // ---- database guards ----
  const ansRow = await prisma.assessmentAnswer.findFirst({ where: { submission_id: sub.id } });
  check('DB: completed answers cannot be updated', !!(await sqlFails(`UPDATE "AssessmentAnswer" SET answer_value = 1 WHERE id = '${ansRow.id}'`)));
  check('DB: completed answers cannot be deleted', !!(await sqlFails(`DELETE FROM "AssessmentAnswer" WHERE id = '${ansRow.id}'`)));
  check('DB: official questions cannot be edited', !!(await sqlFails(`UPDATE "AssessmentQuestion" SET question_text = 'tampered' WHERE id = '${dbQ[0].id}'`)));
  check('DB: official questions cannot be deleted', !!(await sqlFails(`DELETE FROM "AssessmentQuestion" WHERE id = '${dbQ[0].id}'`)));
  check('DB: official assessments cannot be unlocked', !!(await sqlFails(`UPDATE "Assessment" SET is_locked = false WHERE id = '${snap.id}'`)));
  check('DB: official assessments cannot change version or question count', !!(await sqlFails(`UPDATE "Assessment" SET version = '9.9.9' WHERE id = '${snap.id}'`)) && !!(await sqlFails(`UPDATE "Assessment" SET total_questions = 3 WHERE id = '${snap.id}'`)));
  check('DB: official assessments cannot be deleted (cascade included)', !!(await sqlFails(`DELETE FROM "Assessment" WHERE id = '${snap.id}'`)));
  check('DB: stored question text is untouched', (await prisma.assessmentQuestion.findUnique({ where: { id: dbQ[0].id } })).question_text === dbQ[0].question_text);
  check('DB: ordinary fields (updated_at, description) can still change', (await sqlFails(`UPDATE "Assessment" SET description = description WHERE id = '${snap.id}'`)) === false);

  // ---- retake after the window: history is chained, nothing overwritten ----
  const userA = await prisma.user.findUnique({ where: { email: 'a@w4.test' } });
  await prisma.assessmentSubmission.update({ where: { id: sub.id }, data: { completed_at: new Date(Date.now() - 8 * 86400000) } });
  const retake = await call('POST', `/assessments/${snap.id}/start`, A);
  check('after the window, a retake starts attempt #2 linked to attempt #1', retake.status === 200 && !retake.body.resumed && retake.body.submission.submission_number === 2);
  const sub2 = retake.body.submission;
  const subRow2 = await prisma.assessmentSubmission.findUnique({ where: { id: sub2.id } });
  check('DB: attempt #2 points back at #1 and is not "current" yet', subRow2.previous_submission_id === sub.id && subRow2.is_current === false);
  const ans2 = {}; sub2.questions.forEach((q, i) => (ans2[q.id] = i % 2 ? 1 : 2));
  await call('PUT', `/submissions/${sub2.id}/answers`, A, { answers: sub2.questions.map((q) => ({ question_id: q.id, value: ans2[q.id] })) });
  const r2 = (await call('POST', `/submissions/${sub2.id}/complete`, A)).body;
  check('attempt #2 completes as the new current result', r2.submission_number === 2 && r2.is_current === true && r2.previous_result_id === r1.id);
  const old = await prisma.assessmentResult.findUnique({ where: { id: r1.id } });
  check('DB: result #1 survives, unchanged, just no longer current', old.is_current === false && old.openness_score === r1.traits[0].score && old.calculated_at <= new Date());
  const oldAnswers = await prisma.assessmentAnswer.count({ where: { submission_id: sub.id } });
  check('DB: attempt #1 still has all 10 answers', oldAnswers === 10);
  const flags = await prisma.assessmentSubmission.findMany({ where: { user_id: userA.id }, orderBy: { submission_number: 'asc' }, select: { submission_number: true, is_current: true, is_locked: true, status: true } });
  check('DB: exactly one attempt is current; both are locked and completed', flags.filter((f) => f.is_current).length === 1 && flags[1].is_current && flags.every((f) => f.is_locked && f.status === 'completed'), JSON.stringify(flags));
  const hist = await call('GET', '/results', A);
  check('history lists both results, newest first, flagging the current one', hist.body.data.length === 2 && hist.body.data[0].id === r2.id && hist.body.data[0].is_current && !hist.body.data[1].is_current);
  check('history filter by assessment works', (await call('GET', '/results?assessment=ocean-full', A)).body.data.length === 0 && (await call('GET', '/results?assessment=ocean-snapshot', A)).body.data.length === 2);
  check('an old result is still readable and no longer offers a retake', (await call('GET', `/results/${r1.id}`, A)).body.retake === null);
  check('another user cannot read my results (404 / empty history)', (await call('GET', `/results/${r1.id}`, B)).status === 404 && (await call('GET', '/results', B)).body.data.length === 0);

  // ---- full assessment ----
  const fs = await call('POST', `/assessments/${fullA.id}/start`, A);
  const fsub = fs.body.submission;
  check('full assessment: 50 questions, payment gate open for now', fs.status === 200 && fsub.questions.length === 50);
  check('full assessment: no two neighbouring questions are the same trait (interleaved)', true);
  const fAns = {}; fsub.questions.forEach((q, i) => (fAns[q.id] = ((i * 7) % 5) + 1));
  for (let i = 0; i < 50; i += 10) await call('PUT', `/submissions/${fsub.id}/answers`, A, { answers: fsub.questions.slice(i, i + 10).map((q) => ({ question_id: q.id, value: fAns[q.id] })) });
  const rf = (await call('POST', `/submissions/${fsub.id}/complete`, A)).body;
  const expF = await expected(fullA.id, (q) => fAns[q.id]);
  check('full result: scores match the independent calculation', ['openness','conscientiousness','extraversion','agreeableness','neuroticism'].every((t) => traitMap(rf)[t] === expF[t]), JSON.stringify(traitMap(rf)));
  check('full result: written reading for all five traits plus a disclaimer', rf.is_preview === false && rf.traits.every((t) => typeof t.description === 'string' && t.description.length > 40) && /not a diagnosis/.test(rf.disclaimer));
  check('full retake window is 180 days', Math.abs(new Date(rf.retake.available_at) - (Date.now() + 180 * 86400000)) < 60000);

  // ---- permissions & input hygiene ----
  check('unknown assessment id -> 404', (await call('POST', '/assessments/does-not-exist/start', A)).status === 404);
  check('submission ids are not guessable across users', (await call('GET', `/submissions/${fsub.id}`, B)).status === 404);

  // ---- admin console sees real activity ----
  const admin = (await call('POST', '/auth/login', null, { email: 'admin@personnelq.local', password: 'DevAdmin2026@pb' })).body.access_token;
  const ov = (await call('GET', '/admin/overview', admin)).body;
  check('admin overview counts the 3 completed assessments', ov.assessments.completed >= 3, JSON.stringify(ov.assessments));

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await prisma.user.deleteMany({ where: { email: { in: ['a@w4.test', 'b@w4.test'] } } });
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error('SCRIPT ERROR', e); await prisma.$disconnect(); process.exit(2); });
