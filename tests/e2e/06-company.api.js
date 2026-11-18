process.env.W5_TAG = 'w6';
const { prisma, call, fake, check, makeUser, assessments, grantPaid, takeAssessment, finish } = require('./lib');

const emails = () => fake('resend', '/__control/emails');
const tokenOf = (link) => link.split('/invite/')[1];
const pub = (token) => fetch(`http://localhost:3101/api/v1/invitations/${token}`).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const getRaw = async (path, token) => { const r = await fetch('http://localhost:3101/api/v1' + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} }); return { status: r.status, headers: r.headers, buf: Buffer.from(await r.arrayBuffer()) }; };
const audit = (orgId, action) => prisma.auditLog.count({ where: { organization_id: orgId, action } });

(async () => {
  await fake('resend', '/__control/reset', 'POST');
  const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });
  const admin = await makeUser('admin', { first: 'Ada', last: 'Boss' });
  const hr = await makeUser('hr', { first: 'Hana', last: 'Resources' });
  const e1 = await makeUser('e1', { first: 'Eve', last: 'One' });
  const e2 = await makeUser('e2', { first: '=1+1', last: 'Two' }); // hostile name for the CSV
  const stranger = await makeUser('stranger');
  const outsiderAdmin = await makeUser('oadmin');

  const mkOrg = async (slug, name, owner) => {
    const o = await prisma.organization.create({ data: { name, slug, type: 'corporate', admin_name: 'x', admin_email: owner.email } });
    await prisma.organizationMember.create({ data: { user_id: owner.id, organization_id: o.id, role_id: (await role('admin')).id } });
    return o;
  };
  const org = await mkOrg('w5-w6-acme', 'Acme Co', admin);
  const other = await mkOrg('w5-w6-other', 'Other Co', outsiderAdmin);
  await prisma.organizationMember.create({ data: { user_id: hr.id, organization_id: org.id, role_id: (await role('hr')).id } });
  const plan = (organization_id, seats) => prisma.subscription.create({ data: { organization_id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 30 * 86400000), auto_renew: false, seats_used: 0, seats_limit: seats } });
  await plan(org.id, 3); await plan(other.id, 5);
  const { full } = await assessments(admin.token);
  const O = org.id;
  

  // ---------------------------------------------------------------- who can do what
  for (const [who, label] of [[null, 'no login'], [stranger, 'a stranger'], [outsiderAdmin, 'another company’s admin'], [e1, 'a person who is not a member']]) {
    const t = who?.token;
    const r = await call('GET', `/organizations/${O}/dashboard`, t);
    check(`access: ${label} cannot open the dashboard (${who ? '403' : '401'})`, r.status === (who ? 403 : 401));
  }
  check('access: nobody outside can invite or export either', (await call('POST', `/organizations/${O}/invitations`, stranger.token, { emails: ['a@b.co'] })).status === 403 && (await call('GET', `/organizations/${O}/export/results.csv`, stranger.token)).status === 403);

  // ---------------------------------------------------------------- inviting
  const bad = async (body) => (await call('POST', `/organizations/${O}/invitations`, admin.token, body)).status;
  check('invite: invalid email, empty list, 51 emails, unknown field and a non-array are all 400', (await bad({ emails: ['not-an-email'] })) === 400 && (await bad({ emails: [] })) === 400 && (await bad({ emails: Array.from({ length: 51 }, (_, i) => `p${i}@x.co`) })) === 400 && (await bad({ emails: ['a@b.co'], is_admin: true })) === 400 && (await bad({ emails: 'a@b.co' })) === 400);
  const inv = await call('POST', `/organizations/${O}/invitations`, hr.token, { emails: [e1.email.toUpperCase(), e2.email, e1.email], department: 'Sales', job_title: 'Account exec' });
  const list = inv.body.invitations;
  check('invite: HR can invite; duplicates and case are folded; each gets a link', inv.status === 200 && list.length === 2 && list.every((i) => i.status === 'invited' && /\/invite\/[A-Za-z0-9_-]{43}$/.test(i.link)), inv.text);
  const sent = (await emails()).filter((m) => /invited you/.test(m.subject));
  check('invite: emails went out to exactly those two addresses, with the privacy notice', sent.length === 2 && sent.some((m) => m.to === e1.email) && sent.every((m) => /visible to the company/.test(m.html) && m.html.includes('/invite/')));
  const link1 = list.find((i) => i.email === e1.email).link, link2 = list.find((i) => i.email === e2.email).link;
  const t1 = tokenOf(link1), t2 = tokenOf(link2);
  check('invite: the plan has 3 seats; 2 are taken by waiting invitations, so 2 more people are refused (409 SEATS_FULL)', (await call('POST', `/organizations/${O}/invitations`, admin.token, { emails: ['x1@w5.test', 'x2@w5.test'] })).body?.code === 'SEATS_FULL');
  check('invite: an employee-level user cannot invite (403)', (await call('POST', `/organizations/${O}/invitations`, e1.token, { emails: ['x1@w5.test'] })).status === 403);
  const again = await call('POST', `/organizations/${O}/invitations`, admin.token, { emails: [e1.email] });
  check('invite: inviting someone already waiting just says so, no second invitation', again.body.invitations[0].status === 'already_invited');

  const info = await pub(t1);
  check('public: the invitation page data needs no login and gives company, inviter, the invited address and the fixed role', info.status === 200 && info.body.organization_name === 'Acme Co' && info.body.inviter_name === 'Hana Resources' && info.body.email === e1.email && info.body.role.name === 'Employee');
  check('public: unknown, short and hostile tokens are all 404', (await pub('x'.repeat(43))).status === 404 && (await pub('short')).status === 404 && (await pub("' OR 1=1 --")).status === 404);
  check('invite list: HR sees both as pending with usable links', (await call('GET', `/organizations/${O}/invitations`, hr.token)).body.data.filter((i) => i.status === 'pending' && i.link).length === 2);

  // ---------------------------------------------------------------- accepting
  check('accept: needs a login (401)', (await call('POST', `/invitations/${t1}/accept`)).status === 401);
  const wrong = await call('POST', `/invitations/${t1}/accept`, stranger.token);
  check('accept: someone else with the link is refused (403, wrong address)', wrong.status === 403 && wrong.body.code === 'INVITATION_EMAIL_MISMATCH');
  check('accept: and nothing changed', (await prisma.organizationMember.count({ where: { organization_id: O, user_id: stranger.id } })) === 0);
  const acc = await call('POST', `/invitations/${t1}/accept`, e1.token);
  check('accept: the invited person joins', acc.status === 200 && acc.body.organization.name === 'Acme Co' && acc.body.already_accepted === false, acc.text);
  const mem = await prisma.organizationMember.findUnique({ where: { user_id_organization_id: { user_id: e1.id, organization_id: O } }, include: { role: true } });
  check('accept: as an employee, with department, title and consent time recorded', mem.role.key === 'employee' && mem.department === 'Sales' && mem.job_title === 'Account exec' && mem.consented_at instanceof Date);
  check('accept: accepting again is harmless', (await call('POST', `/invitations/${t1}/accept`, e1.token)).body.already_accepted === true);
  check('accept: a used link cannot be used by another account (409)', (await call('POST', `/invitations/${t1}/accept`, e2.token)).status === 409);
  check('accept: seats used is kept in step', (await prisma.subscription.findUnique({ where: { organization_id: O } })).seats_used === 1);

  await prisma.employeeInvitation.updateMany({ where: { invitation_token: t2 }, data: { expires_at: new Date(Date.now() - 1000) } });
  const exp = await call('POST', `/invitations/${t2}/accept`, e2.token);
  check('expired: an expired invitation is refused (409) and shows as expired', exp.status === 409 && exp.body.code === 'INVITATION_EXPIRED' && (await pub(t2)).body.status === 'expired');
  const invRow = (await call('GET', `/organizations/${O}/invitations`, admin.token)).body.data.find((i) => i.email === e2.email);
  const resent = await call('POST', `/organizations/${O}/invitations/${invRow.id}/resend`, admin.token);
  check('resend: gives an expired invitation a fresh two weeks and emails it again', resent.status === 200 && new Date(resent.body.expires_at) > new Date(Date.now() + 13 * 86400000) && (await emails()).filter((m) => m.to === e2.email).length === 2);
  const acc2 = await call('POST', `/invitations/${t2}/accept`, e2.token);
  check('resend: …and it can then be accepted', acc2.status === 200);

  // revoke path
  const rv = await call('POST', `/organizations/${other.id}/invitations`, outsiderAdmin.token, { emails: [stranger.email] });
  const rvId = (await call('GET', `/organizations/${other.id}/invitations`, outsiderAdmin.token)).body.data[0].id;
  check('revoke: another company’s admin cannot touch this company’s invitations (403/404)', [403, 404].includes((await call('DELETE', `/organizations/${O}/invitations/${rvId}`, outsiderAdmin.token)).status));
  check('revoke: the owning admin can; the link then stops working', (await call('DELETE', `/organizations/${other.id}/invitations/${rvId}`, outsiderAdmin.token)).status === 200 && (await call('POST', `/invitations/${tokenOf(rv.body.invitations[0].link)}/accept`, stranger.token)).body.code === 'INVITATION_REVOKED');

  // ---------------------------------------------------------------- taking the assessment through the company
  const list1 = (await call('GET', '/assessments', e1.token)).body.data.find((a) => a.slug === 'ocean-full');
  check('cover: the full assessment offers "take it for Acme Co"; the snapshot does not', list1.company_cover?.name === 'Acme Co' && (await call('GET', '/assessments', e1.token)).body.data.find((a) => a.slug === 'ocean-snapshot').company_cover === null);
  check('cover: a private attempt still needs payment (402) while the company one does not', (await call('POST', `/assessments/${full.id}/start`, e1.token, {})).status === 402);
  check('cover: starting for a company you are not in is refused (403)', (await call('POST', `/assessments/${full.id}/start`, e1.token, { organization_id: other.id })).status === 403);
  const stranger1 = await call('POST', `/assessments/${full.id}/start`, stranger.token, { organization_id: O });
  check('cover: a non-member cannot claim the company’s cover (403)', stranger1.status === 403);

  const startCo = await call('POST', `/assessments/${full.id}/start`, e1.token, { organization_id: O });
  const sub = startCo.body.submission;
  for (let i = 0; i < sub.questions.length; i += 10) await call('PUT', `/submissions/${sub.id}/answers`, e1.token, { answers: sub.questions.slice(i, i + 10).map((q, j) => ({ question_id: q.id, value: ((i + j) * 7) % 5 + 1 })) });
  const dashMid = (await call('GET', `/organizations/${O}/dashboard`, admin.token)).body;
  check('dashboard: an unfinished attempt shows as in progress', dashMid.team.in_progress === 1 && dashMid.team.completed === 0);
  const done = await call('POST', `/submissions/${sub.id}/complete`, e1.token);
  check('cover: finishing gives a result marked as shared with Acme Co', done.status === 200 && done.body.company === 'Acme Co');
  const resRow = await prisma.assessmentResult.findUnique({ where: { id: done.body.id } });
  check('cover: the result carries the company', resRow.organization_id === O);
  check('cover: the person’s own list says which results the company sees', (await call('GET', '/results', e1.token)).body.data.find((r) => r.id === done.body.id).company === 'Acme Co');

  // ---------------------------------------------------------------- the dashboard
  const d = (await call('GET', `/organizations/${O}/dashboard`, hr.token)).body;
  check('dashboard: HR sees team of 2, 1 completed, 0 in progress, 1 not started, 50%', d.team.members === 2 && d.team.completed === 1 && d.team.not_started === 1 && d.team.completion_pct === 50, JSON.stringify(d.team));
  check('dashboard: plan shows seats 2 of 3', d.plan.seats_limit === 3 && d.plan.seats_used === 2 && d.plan.active === true, JSON.stringify(d.plan));
  check('dashboard: distribution has five traits with the one finisher counted', d.distribution.length === 5 && d.distribution.every((x) => x.low + x.medium + x.high === 1 && typeof x.average === 'number'));
  check('dashboard: department view groups by Sales', d.departments.length === 1 && d.departments[0].department === 'Sales' && d.departments[0].members === 2 && d.departments[0].completed === 1);
  check('dashboard: recent activity lists the completion and the joins', d.recent.some((r) => r.type === 'completed' && r.who === 'Eve One') && d.recent.some((r) => r.type === 'joined'));
  check('dashboard: the admin (not in the team) is not counted as a person', d.team.members === 2);
  check('dashboard: employees cannot open it (403) but the admin can', (await call('GET', `/organizations/${O}/dashboard`, e1.token)).status === 403 && (await call('GET', `/organizations/${O}/dashboard`, admin.token)).status === 200);

  const members = (await call('GET', `/organizations/${O}/members`, hr.token)).body.data;
  const m1 = members.find((m) => m.user_id === e1.id), m2 = members.find((m) => m.user_id === e2.id);
  check('members: list has status, department and the finisher’s five scores', m1.status === 'completed' && Object.keys(m1.result.scores).length === 5 && m2.status === 'not_started' && m2.result === null);
  const view = await call('GET', `/organizations/${O}/members/${e1.id}/result`, hr.token);
  check('member result: HR can read one person’s company result, with readings', view.status === 200 && view.body.result.traits.length === 5 && view.body.result.traits.every((t) => typeof t.description === 'string') && /no-store/.test(view.headers.get('cache-control') || ''));
  check('member result: a person with no company result is 404; an employee cannot ask at all (403)', (await call('GET', `/organizations/${O}/members/${e2.id}/result`, hr.token)).status === 404 && (await call('GET', `/organizations/${O}/members/${e1.id}/result`, e2.token)).status === 403);
  check('member result: viewing it was written to the audit trail', (await audit(O, 'member.result_viewed')) === 1);

  // ---------------------------------------------------------------- the person's own progress and the privacy of a private attempt
  await prisma.assessmentSubmission.updateMany({ where: { user_id: e1.id }, data: { completed_at: new Date(Date.now() - 200 * 86400000) } });
  await grantPaid(e1, full.id);
  const second = await takeAssessment(e1.token, full.id, (i) => ((i * 3) % 5) + 1);
  check('private: a second, personal attempt has no company on it', second.company === null);
  const prog = (await call('GET', '/me/progress', e1.token)).body;
  check('progress: two full attempts, oldest first, with where each was taken', prog.points.length === 2 && prog.points[0].company === 'Acme Co' && prog.points[1].company === null && prog.summary.full_attempts === 2 && prog.summary.assessments_taken === 2);
  check('progress: change compares first and latest per trait with a direction', prog.change && ['up', 'down', 'steady'].includes(prog.change.openness.trend) && Math.abs(prog.change.openness.delta - (prog.points[1].scores.openness - prog.points[0].scores.openness)) < 0.11);
  const d2 = (await call('GET', `/organizations/${O}/dashboard`, hr.token)).body;
  const m1b = (await call('GET', `/organizations/${O}/members`, hr.token)).body.data.find((m) => m.user_id === e1.id);
  check('privacy: HR still sees only the company attempt, never the private one', d2.team.completed === 1 && m1b.result.id === done.body.id && m1b.result.scores.openness === prog.points[0].scores.openness);
  check('progress: nobody else can read it (it is always the caller’s own)', (await call('GET', '/me/progress')).status === 401);
  const prog0 = (await call('GET', '/me/progress', stranger.token)).body;
  check('progress: a person with no results gets an empty, calm answer', prog0.points.length === 0 && prog0.change === null && prog0.summary.last_taken === null);

  // ---------------------------------------------------------------- exports
  const csv = await getRaw(`/organizations/${O}/export/results.csv`, hr.token);
  const text = csv.buf.toString('utf8');
  check('csv: downloads as a dated attachment, never cached, with a BOM for Excel', csv.status === 200 && /text\/csv/.test(csv.headers.get('content-type')) && /attachment; filename="team-results-\d{4}-\d{2}-\d{2}\.csv"/.test(csv.headers.get('content-disposition')) && /no-store/.test(csv.headers.get('cache-control')) && text.charCodeAt(0) === 0xfeff);
  const lines = text.replace(/^﻿/, '').trim().split('\r\n');
  check('csv: header, then one row per team member', lines.length === 3 && lines[0].startsWith('Name,Email,Department'));
  check('csv: the hostile name "=1+1" is neutralised so a spreadsheet will not run it', text.includes("'=1+1") && !/(^|,)=1\+1/.test(text));
  check('csv: the finisher’s scores and levels are in their row', lines.find((l) => l.includes('Eve One')).includes(String(Math.round(prog.points[0].scores.openness * 10) / 10)));
  check('csv: employees cannot export (403)', (await getRaw(`/organizations/${O}/export/results.csv`, e1.token)).status === 403);
  const pdf = await getRaw(`/organizations/${O}/export/team-report.pdf`, admin.token);
  check('pdf: the team report is a real PDF attachment', pdf.status === 200 && pdf.buf.slice(0, 5).toString() === '%PDF-' && pdf.buf.length > 15000 && /team-report-/.test(pdf.headers.get('content-disposition')), String(pdf.buf.length));
  check('pdf: employees cannot get it (403)', (await getRaw(`/organizations/${O}/export/team-report.pdf`, e1.token)).status === 403);
  check('exports are audited', (await audit(O, 'results.exported')) === 2);

  // ---------------------------------------------------------------- removing and leaving
  check('remove: an administrator cannot be removed (409)', (await call('DELETE', `/organizations/${O}/members/${admin.id}`, hr.token)).body?.code === 'CANNOT_REMOVE_ADMIN');
  check('remove: an employee cannot remove anyone (403)', (await call('DELETE', `/organizations/${O}/members/${e2.id}`, e1.token)).status === 403);
  const rm = await call('DELETE', `/organizations/${O}/members/${e2.id}`, admin.token);
  check('remove: the admin removes a member; they lose the company cover and a seat frees', rm.status === 200 && (await call('GET', '/assessments', e2.token)).body.data.find((a) => a.slug === 'ocean-full').company_cover === null && (await prisma.subscription.findUnique({ where: { organization_id: O } })).seats_used === 1);
  const lv = await call('POST', `/organizations/${O}/leave`, e1.token);
  const dAfter = (await call('GET', `/organizations/${O}/dashboard`, admin.token)).body;
  check('leave: the person leaves; the company stops seeing them at once', lv.status === 200 && dAfter.team.members === 0 && dAfter.team.completed === 0);
  const kept = await prisma.assessmentResult.findUnique({ where: { id: done.body.id } });
  check('leave: their results still belong to them, now with no company attached', kept && kept.organization_id === null && (await call('GET', `/results/${done.body.id}`, e1.token)).body.company === null);
  check('leave: an administrator cannot leave (409)', (await call('POST', `/organizations/${O}/leave`, admin.token)).body?.code === 'ADMIN_CANNOT_LEAVE');
  check('leave: and the former member can no longer see the dashboard', (await call('GET', `/organizations/${O}/dashboard`, e1.token)).status === 403);
  const counts = await Promise.all(['invitation.created', 'invitation.accepted', 'member.removed', 'member.left'].map((a) => audit(O, a)));
  check('audit: invitations, acceptances, removals and leaving are all recorded', counts[0] === 2 && counts[1] === 2 && counts[2] === 1 && counts[3] === 1, counts.join(','));

  // lapsed plan: cannot invite
  await prisma.subscription.update({ where: { organization_id: O }, data: { end_date: new Date(Date.now() - 1000) } });
  check('plan: with a lapsed plan nobody can be invited (402)', (await call('POST', `/organizations/${O}/invitations`, admin.token, { emails: ['late@w5.test'] })).body?.code === 'SUBSCRIPTION_REQUIRED');

  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await require('./lib').cleanup(); } catch {} process.exit(2); });
