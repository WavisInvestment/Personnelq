// Live checks for the launch flows: email verification, account settings and deletion, company roles,
// HR retake approval, and the scheduled jobs. Runs against the isolated test API (3101) and the fake services.
process.env.W5_TAG = 'w9';
process.env.RESEND_API_KEY = 're_fakefakefake1234';
process.env.RESEND_BASE_URL = 'http://127.0.0.1:3192';
process.env.FROM_EMAIL = 'noreply@test.example';
process.env.PAYMENTS_ENABLED = 'true';
process.env.FRONTEND_URL = 'http://localhost:3100';

const ROOT = require('path').resolve(__dirname, '../..').split(require('path').sep).join('/');
const bcrypt = require('./lib').need('bcrypt');
const { prisma, call, fake, check, makeUser, assessments, takeAssessment, finish, cleanup, PW, sleep } = require('./lib');

const rnd = () => Math.floor(Math.random() * 250) + 1;
const ipn = () => ({ 'X-Forwarded-For': `10.${rnd()}.${rnd()}.${rnd()}` }); // a fresh address per call keeps each throttle out of the way
const emails = () => fake('resend', '/__control/emails');
const tokenIn = (html, key = 'token') => new RegExp(`${key}=([A-Za-z0-9_-]{20,})`).exec(html)?.[1];
const stamp = Date.now();
const deletedIds = [];

const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });
async function makeOrg(label, { plan = true } = {}) {
  const admin = await makeUser(`${label}-admin`, { first: 'Ada', last: 'Admin' });
  const org = await prisma.organization.create({ data: { name: `W9 ${label}`, slug: `w5-w9-${label}`, type: 'corporate', admin_name: 'Ada Admin', admin_email: admin.email } });
  await prisma.organizationMember.create({ data: { user_id: admin.id, organization_id: org.id, role_id: (await role('admin')).id } });
  if (plan) await prisma.subscription.create({ data: { organization_id: org.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 30 * 86400000), auto_renew: false, seats_used: 0, seats_limit: 20 } });
  return { admin, org };
}
/** Invites someone by email through the API and accepts as them: the way a real person joins. */
async function join(admin, org, person, roleKey) {
  const inv = await call('POST', `/organizations/${org.id}/invitations`, admin.token, { emails: [person.email], ...(roleKey && { role: roleKey }) });
  const link = inv.body?.invitations?.[0]?.link;
  const token = link?.split('/invite/')[1];
  const acc = await call('POST', `/invitations/${token}/accept`, person.token);
  if (acc.status !== 200) throw new Error(`join failed: ${acc.status} ${acc.text}`);
  return token;
}
async function takeFor(user, fullId, orgId) {
  const start = await call('POST', `/assessments/${fullId}/start`, user.token, { organization_id: orgId });
  if (start.status !== 200) return { start };
  const sub = start.body.submission;
  for (let i = 0; i < sub.questions.length; i += 10) {
    await call('PUT', `/submissions/${sub.id}/answers`, user.token, { answers: sub.questions.slice(i, i + 10).map((q, j) => ({ question_id: q.id, value: ((i + j) * 7) % 5 + 1 })) });
  }
  const done = await call('POST', `/submissions/${sub.id}/complete`, user.token);
  return { start, done, submissionId: sub.id };
}
const login = (email, password = PW) => call('POST', '/auth/login', null, { email, password }, ipn());

(async () => {
  await fake('resend', '/__control/reset', 'POST');

  // ================================================================== email verification
  console.log('\n--- email verification');
  const vEmail = `v-${stamp}@w5.test`;
  const su = await call('POST', '/auth/signup', null, { account_type: 'corporate', organization_name: `W9 Verify ${stamp}`, email: vEmail, first_name: 'Vera', last_name: 'Verify', password: PW, password_confirm: PW }, ipn());
  check('sign-up starts unconfirmed', su.status === 201 && su.body.user.email_verified === false, su.text);
  const vOrg = su.body.user.organizations[0].id;
  const vToken = su.body.access_token;
  let mails = await emails();
  const verifyMail = mails.find((m) => m.to === vEmail && /Confirm your email/.test(m.subject));
  const vLink = tokenIn(verifyMail?.html ?? '');
  check('a confirmation email goes to the new address, with a 64-character link', !!verifyMail && /^[a-f0-9]{64}$/.test(vLink ?? ''), verifyMail?.subject);
  check('the link points at the website', /localhost:3100\/auth\/verify-email\?token=/.test(verifyMail?.html ?? ''));

  const stored = await prisma.user.findUnique({ where: { email: vEmail } });
  check('only a hash of the token is stored', stored.email_verify_token && stored.email_verify_token !== vLink && stored.email_verify_token.length === 64);

  const inviteUnverified = await call('POST', `/organizations/${vOrg}/invitations`, vToken, { emails: [`x-${stamp}@w5.test`] });
  check('unconfirmed: cannot invite people (403 EMAIL_NOT_VERIFIED)', inviteUnverified.status === 403 && inviteUnverified.body.code === 'EMAIL_NOT_VERIFIED', inviteUnverified.text);
  const full0 = (await assessments(vToken)).full;
  const payUnverified = await call('POST', '/payments/checkout', vToken, { assessment_id: full0.id });
  check('unconfirmed: cannot pay (403 EMAIL_NOT_VERIFIED)', payUnverified.status === 403 && payUnverified.body.code === 'EMAIL_NOT_VERIFIED', payUnverified.text);
  const planUnverified = await call('POST', '/payments/subscription-checkout', vToken, { organization_id: vOrg, plan: 'team' });
  check('unconfirmed: cannot buy a plan (403 EMAIL_NOT_VERIFIED)', planUnverified.status === 403 && planUnverified.body.code === 'EMAIL_NOT_VERIFIED', planUnverified.text);
  const indiv = await call('POST', '/auth/signup', null, { account_type: 'individual', email: `i-${stamp}@w5.test`, first_name: 'Ivy', last_name: 'Unverified', password: PW, password_confirm: PW }, ipn());
  const snapUnverified = await call('GET', '/assessments', indiv.body.access_token);
  check('unconfirmed: can still browse and take the free snapshot', snapUnverified.status === 200);

  check('confirming: an unknown link is refused (400 EMAIL_LINK_INVALID)', (await call('POST', '/auth/verify-email', null, { token: 'a'.repeat(64) }, ipn())).body?.code === 'EMAIL_LINK_INVALID');
  check('confirming: a malformed link is refused (400)', (await call('POST', '/auth/verify-email', null, { token: 'nope' }, ipn())).status === 400);

  const resend = await call('POST', '/auth/resend-verification', vToken, undefined, ipn());
  mails = await emails();
  const second = mails.filter((m) => m.to === vEmail && /Confirm your email/.test(m.subject));
  const vLink2 = tokenIn(second[second.length - 1]?.html ?? '');
  check('asking again sends a new link', resend.status === 200 && second.length === 2 && vLink2 !== vLink, resend.text);
  check('the older link stops working once a new one is sent', (await call('POST', '/auth/verify-email', null, { token: vLink }, ipn())).status === 400);
  check('resend needs sign-in (401)', (await call('POST', '/auth/resend-verification', null, undefined, ipn())).status === 401);

  const ok = await call('POST', '/auth/verify-email', null, { token: vLink2 }, ipn());
  check('the newest link confirms the address', ok.status === 200 && ok.body.verified === true && ok.body.email === vEmail, ok.text);
  check('the database says confirmed, and the token is gone', (await prisma.user.findUnique({ where: { email: vEmail } })).email_verified === true && !(await prisma.user.findUnique({ where: { email: vEmail } })).email_verify_token);
  check('a link works once (400 on reuse)', (await call('POST', '/auth/verify-email', null, { token: vLink2 }, ipn())).status === 400);
  const again = await call('POST', '/auth/resend-verification', vToken, undefined, ipn());
  check('resending after confirming says so and sends nothing', again.body.already_verified === true);

  await prisma.subscription.create({ data: { organization_id: vOrg, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 1, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 86400000 * 30), auto_renew: false, seats_limit: 5 } });
  const inviteNow = await call('POST', `/organizations/${vOrg}/invitations`, vToken, { emails: [`later-${stamp}@w5.test`] });
  check('once confirmed, inviting works', inviteNow.status === 200 && inviteNow.body.invitations[0].status === 'invited', inviteNow.text);

  // invitation sign-up proves the address already
  const before = (await emails()).length;
  const inviteeEmail = `invitee-${stamp}@w5.test`;
  const inv2 = await call('POST', `/organizations/${vOrg}/invitations`, vToken, { emails: [inviteeEmail] });
  const inviteToken = inv2.body.invitations[0].link.split('/invite/')[1];
  const invSignup = await call('POST', '/auth/signup', null, { email: inviteeEmail, first_name: 'Ivy', last_name: 'Invited', password: PW, password_confirm: PW, invitation_token: inviteToken }, ipn());
  const verifyMailsForInvitee = (await emails()).filter((m) => m.to === inviteeEmail && /Confirm your email/.test(m.subject));
  check('signing up from an invitation is confirmed straight away, with no extra email', invSignup.status === 201 && invSignup.body.user.email_verified === true && verifyMailsForInvitee.length === 0, invSignup.text);
  check('and they can accept it', (await call('POST', `/invitations/${inviteToken}/accept`, invSignup.body.access_token)).status === 200);
  void before;

  // an existing unconfirmed account that gets invited must confirm first
  const lateEmail = `late-${stamp}@w5.test`;
  const lateSignup = await call('POST', '/auth/signup', null, { email: lateEmail, first_name: 'Lena', last_name: 'Late', password: PW, password_confirm: PW }, ipn());
  const inv3 = await call('POST', `/organizations/${vOrg}/invitations`, vToken, { emails: [lateEmail] });
  const lateToken = inv3.body.invitations[0].link.split('/invite/')[1];
  const lateAccept = await call('POST', `/invitations/${lateToken}/accept`, lateSignup.body.access_token);
  check('an unconfirmed account cannot accept an invitation (403 EMAIL_NOT_VERIFIED)', lateAccept.status === 403 && lateAccept.body.code === 'EMAIL_NOT_VERIFIED', lateAccept.text);
  const lateLink = tokenIn((await emails()).filter((m) => m.to === lateEmail && /Confirm your email/.test(m.subject)).pop()?.html ?? '');
  await call('POST', '/auth/verify-email', null, { token: lateLink }, ipn());
  check('after confirming they can accept it', (await call('POST', `/invitations/${lateToken}/accept`, lateSignup.body.access_token)).status === 200);

  // a password reset also proves the mailbox
  const resetEmail = `reset-${stamp}@w5.test`;
  await call('POST', '/auth/signup', null, { email: resetEmail, first_name: 'Rey', last_name: 'Reset', password: PW, password_confirm: PW }, ipn());
  await call('POST', '/auth/forgot-password', null, { email: resetEmail }, ipn());
  const resetTok = tokenIn((await emails()).filter((m) => m.to === resetEmail && /Reset your password/.test(m.subject)).pop()?.html ?? '');
  await call('POST', '/auth/reset-password', null, { token: resetTok, password: 'Another123!x', password_confirm: 'Another123!x' }, ipn());
  check('resetting a password also confirms the address', (await prisma.user.findUnique({ where: { email: resetEmail } })).email_verified === true);

  // ================================================================== account settings
  console.log('\n--- account settings');
  const ada = await makeUser('acct', { first: 'Ada', last: 'Lovelace' });
  const info = await call('GET', '/account', ada.token);
  check('shows the account', info.status === 200 && info.body.email === ada.email && info.body.email_verified === true && info.body.signed_in_devices >= 1, info.text);
  check('needs sign-in (401)', (await call('GET', '/account')).status === 401);
  const renamed = await call('PATCH', '/account', ada.token, { first_name: 'Adaline' });
  check('changes the name', renamed.status === 200 && renamed.body.first_name === 'Adaline' && renamed.body.last_name === 'Lovelace', renamed.text);
  check('an empty change is refused (400)', (await call('PATCH', '/account', ada.token, {})).status === 400);
  check('an unknown field is refused (400)', (await call('PATCH', '/account', ada.token, { email: 'a@b.co' })).status === 400);
  check('a one-letter name is refused (400)', (await call('PATCH', '/account', ada.token, { first_name: 'A' })).status === 400);

  const sA = (await login(ada.email)).body;
  const sB = (await login(ada.email)).body;
  const NEW = 'Fresh456!yz';
  check('password: wrong current password is refused (403 WRONG_PASSWORD)', (await call('POST', '/account/password', ada.token, { current_password: 'Nope123!xx', password: NEW, password_confirm: NEW }, ipn())).body?.code === 'WRONG_PASSWORD');
  check('password: mismatched confirmation is refused (400)', (await call('POST', '/account/password', ada.token, { current_password: PW, password: NEW, password_confirm: 'Different1!x' }, ipn())).status === 400);
  check('password: a weak new password is refused (400)', (await call('POST', '/account/password', ada.token, { current_password: PW, password: 'weak', password_confirm: 'weak' }, ipn())).status === 400);
  check('password: the same password is refused (400 SAME_PASSWORD)', (await call('POST', '/account/password', ada.token, { current_password: PW, password: PW, password_confirm: PW }, ipn())).body?.code === 'SAME_PASSWORD');
  const changed = await call('POST', '/account/password', ada.token, { current_password: PW, password: NEW, password_confirm: NEW, refresh_token: sB.refresh_token }, ipn());
  check('password: changes', changed.status === 200 && changed.body.changed === true, changed.text);
  check('password: the other device is signed out', (await call('POST', '/auth/refresh', null, { refresh_token: sA.refresh_token })).status === 401);
  check('password: this device stays signed in', (await call('POST', '/auth/refresh', null, { refresh_token: sB.refresh_token })).status === 200);
  check('password: the old password no longer works, the new one does', (await login(ada.email, PW)).status === 401 && (await login(ada.email, NEW)).status === 200);

  // email change
  const newAddr = `ada-new-${stamp}@w5.test`;
  const other = await makeUser('taken');
  check('email: wrong password is refused (403)', (await call('POST', '/account/email', ada.token, { email: newAddr, password: 'Nope123!xx' }, ipn())).body?.code === 'WRONG_PASSWORD');
  check('email: the same address is refused (400)', (await call('POST', '/account/email', ada.token, { email: ada.email, password: NEW }, ipn())).body?.code === 'SAME_EMAIL');
  check('email: an address another account uses is refused (409)', (await call('POST', '/account/email', ada.token, { email: other.email, password: NEW }, ipn())).body?.code === 'EMAIL_TAKEN');
  check('email: an invalid address is refused (400)', (await call('POST', '/account/email', ada.token, { email: 'not-an-email', password: NEW }, ipn())).status === 400);
  const ch = await call('POST', '/account/email', ada.token, { email: newAddr.toUpperCase(), password: NEW }, ipn());
  check('email: starts a change and lower-cases the new address', ch.status === 200 && ch.body.pending_email === newAddr, ch.text);
  const chMail = (await emails()).filter((m) => m.to === newAddr).pop();
  check('email: the confirmation link goes to the NEW address', !!chMail && /Confirm your email/.test(chMail.subject));
  check('email: until confirmed, sign-in still uses the old address', (await login(ada.email, NEW)).status === 200 && (await login(newAddr, NEW)).status === 401);
  check('email: the account page shows the pending address', (await call('GET', '/account', ada.token)).body.pending_email === newAddr);
  const chTok = tokenIn(chMail.html);
  const chOk = await call('POST', '/auth/verify-email', null, { token: chTok }, ipn());
  check('email: confirming switches the address', chOk.status === 200 && chOk.body.email === newAddr, chOk.text);
  check('email: sign-in now uses the new address only', (await login(newAddr, NEW)).status === 200 && (await login(ada.email, NEW)).status === 401);

  // export + sign out everywhere
  const adaToken = (await login(newAddr, NEW)).body;
  await takeAssessment(adaToken.access_token, (await assessments(adaToken.access_token)).snap.id);
  const exp = await call('GET', '/account/export', adaToken.access_token, undefined, ipn());
  check('export: returns the person’s data', exp.status === 200 && exp.body.account.email === newAddr && exp.body.results.length === 1 && exp.body.assessments.length >= 1 && Array.isArray(exp.body.assessments[0].answers), exp.text?.slice(0, 200));
  check('export: includes the answers with their question text', exp.body.assessments[0].answers.length === 10 && typeof exp.body.assessments[0].answers[0].question.question_text === 'string');
  check('export: not cached', /no-store/.test(exp.headers.get('cache-control') ?? ''));
  check('export: needs sign-in (401)', (await call('GET', '/account/export')).status === 401);

  const live = (await login(newAddr, NEW)).body;
  const out = await call('POST', '/account/sign-out-everywhere', adaToken.access_token);
  check('sign out everywhere: ends every session', out.status === 200 && out.body.signed_out >= 2, out.text);
  check('sign out everywhere: a refresh no longer works', (await call('POST', '/auth/refresh', null, { refresh_token: live.refresh_token })).status === 401);

  // ================================================================== deleting an account
  console.log('\n--- deleting an account');
  const del = await makeUser('del', { first: 'Dee', last: 'Leted' });
  await takeAssessment(del.token, (await assessments(del.token)).snap.id);
  await prisma.payment.create({ data: { user_id: del.id, amount: 5000, currency: 'NGN', status: 'success', payment_method: 'card', provider_reference: `w5-grant-w9-del-${stamp}`, payment_type: 'assessment', description: 'del test' } });
  deletedIds.push(del.id);
  check('delete: wrong password is refused (403) and nothing happens', (await call('DELETE', '/account', del.token, { password: 'Nope123!xx' }, ipn())).status === 403 && (await prisma.user.findUnique({ where: { id: del.id } })).deleted_at === null);
  check('delete: needs the password field (400)', (await call('DELETE', '/account', del.token, {}, ipn())).status === 400);
  const gone = await call('DELETE', '/account', del.token, { password: PW }, ipn());
  check('delete: succeeds', gone.status === 200 && gone.body.deleted === true, gone.text);
  const row = await prisma.user.findUnique({ where: { id: del.id } });
  check('delete: the account is anonymised', row.deleted_at && row.email === `deleted+${del.id}@deleted.invalid` && row.first_name === 'Deleted' && row.email_verified === false);
  check('delete: results, submissions, answers and sessions are erased', (await prisma.assessmentResult.count({ where: { user_id: del.id } })) === 0 && (await prisma.assessmentSubmission.count({ where: { user_id: del.id } })) === 0 && (await prisma.session.count({ where: { user_id: del.id } })) === 0);
  check('delete: the payment record is kept, still tied to the anonymised account', (await prisma.payment.count({ where: { user_id: del.id } })) === 1);
  check('delete: signing in fails (401)', (await login(del.email)).status === 401);
  check('delete: the old access token stops working (401)', (await call('GET', '/account', del.token)).status === 401);
  check('delete: the address can be registered again', (await call('POST', '/auth/signup', null, { email: del.email, first_name: 'Dee', last_name: 'Again', password: PW, password_confirm: PW }, ipn())).status === 201);

  // sole administrator
  const { admin: soleA, org: soleOrg } = await makeOrg('sole');
  const soleE = await makeUser('sole-emp');
  await join(soleA, soleOrg, soleE);
  const blocked = await call('DELETE', '/account', soleA.token, { password: PW }, ipn());
  check('delete: the only administrator of a company with people is refused (409 SOLE_ADMIN)', blocked.status === 409 && blocked.body.code === 'SOLE_ADMIN' && blocked.body.organizations.includes('W9 sole'), blocked.text);
  check('delete: nothing was removed in that case', (await prisma.user.findUnique({ where: { id: soleA.id } })).deleted_at === null);
  await call('PATCH', `/organizations/${soleOrg.id}/members/${soleE.id}`, soleA.token, { role: 'admin' });
  deletedIds.push(soleA.id);
  const okDel = await call('DELETE', '/account', soleA.token, { password: PW }, ipn());
  check('delete: allowed once another administrator exists', okDel.status === 200, okDel.text);
  check('delete: the company stays open for them', (await prisma.organization.findUnique({ where: { id: soleOrg.id } })).deleted_at === null);

  const { admin: aloneA, org: aloneOrg } = await makeOrg('alone', { plan: false });
  deletedIds.push(aloneA.id);
  await call('DELETE', '/account', aloneA.token, { password: PW }, ipn());
  const closed = await prisma.organization.findUnique({ where: { id: aloneOrg.id } });
  check('delete: a company with nobody else in it is closed with its administrator', closed.deleted_at && closed.status === 'inactive');

  const staff = await makeUser('staff');
  await prisma.user.update({ where: { id: staff.id }, data: { platform_role_id: (await prisma.role.findFirstOrThrow({ where: { scope: 'platform', key: 'support' } })).id } });
  check('delete: platform staff cannot use the account page at all (403 STAFF_ADMIN_ONLY)', (await call('DELETE', '/account', staff.token, { password: PW }, ipn())).body?.code === 'STAFF_ADMIN_ONLY');
  await prisma.user.update({ where: { id: staff.id }, data: { platform_role_id: null } });

  // ================================================================== company roles
  console.log('\n--- company roles');
  const { admin: A, org: R } = await makeOrg('roles');
  const hr = await makeUser('hr');
  const emp = await makeUser('emp');
  const emp2 = await makeUser('emp2');
  const invHr = await call('POST', `/organizations/${R.id}/invitations`, A.token, { emails: [hr.email], role: 'hr' });
  check('an administrator can invite someone as HR', invHr.status === 200 && invHr.body.invitations[0].status === 'invited', invHr.text);
  const hrToken = invHr.body.invitations[0].link.split('/invite/')[1];
  const hrInfo = await call('GET', `/invitations/${hrToken}`);
  check('the invitation page shows the role it grants', hrInfo.body.role?.key === 'hr' && hrInfo.body.role?.name === 'HR', hrInfo.text);
  check('the invitation list shows the role', (await call('GET', `/organizations/${R.id}/invitations`, A.token)).body.data.find((i) => i.email === hr.email).role === 'hr');
  await call('POST', `/invitations/${hrToken}/accept`, hr.token);
  check('accepting gives that role', (await prisma.organizationMember.findFirst({ where: { user_id: hr.id, organization_id: R.id }, include: { role: true } })).role.key === 'hr');
  await join(A, R, emp);
  await join(A, R, emp2);

  check('HR cannot invite HR or administrators (403)', (await call('POST', `/organizations/${R.id}/invitations`, hr.token, { emails: [`x1-${stamp}@w5.test`], role: 'hr' })).status === 403 && (await call('POST', `/organizations/${R.id}/invitations`, hr.token, { emails: [`x2-${stamp}@w5.test`], role: 'admin' })).status === 403);
  check('HR can invite employees (200)', (await call('POST', `/organizations/${R.id}/invitations`, hr.token, { emails: [`x3-${stamp}@w5.test`] })).status === 200);
  check('an invalid role is refused (400)', (await call('POST', `/organizations/${R.id}/invitations`, A.token, { emails: [`x4-${stamp}@w5.test`], role: 'owner' })).status === 400);
  check('an employee cannot invite at all (403)', (await call('POST', `/organizations/${R.id}/invitations`, emp.token, { emails: [`x5-${stamp}@w5.test`] })).status === 403);

  check('HR cannot change roles (403)', (await call('PATCH', `/organizations/${R.id}/members/${emp.id}`, hr.token, { role: 'hr' })).status === 403);
  check('HR can still set a department (200)', (await call('PATCH', `/organizations/${R.id}/members/${emp.id}`, hr.token, { department: 'Finance' })).body?.department === 'Finance');
  check('HR cannot list administrators and staff (403)', (await call('GET', `/organizations/${R.id}/staff`, hr.token)).status === 403);
  check('an employee cannot change roles (403)', (await call('PATCH', `/organizations/${R.id}/members/${emp2.id}`, emp.token, { role: 'admin' })).status === 403);

  const promote = await call('PATCH', `/organizations/${R.id}/members/${emp.id}`, A.token, { role: 'hr' });
  check('an administrator makes an employee HR', promote.status === 200 && promote.body.role === 'hr', promote.text);
  check('the new HR gets HR access straight away', (await call('GET', `/organizations/${R.id}/dashboard`, emp.token)).status === 200);
  const demote = await call('PATCH', `/organizations/${R.id}/members/${emp.id}`, A.token, { role: 'employee' });
  check('and loses it again when made an employee', demote.status === 200 && (await call('GET', `/organizations/${R.id}/dashboard`, emp.token)).status === 403);
  check('an invalid role value is refused (400)', (await call('PATCH', `/organizations/${R.id}/members/${emp.id}`, A.token, { role: 'owner' })).status === 400);
  check('a person outside the company is refused (404)', (await call('PATCH', `/organizations/${R.id}/members/${staff.id}`, A.token, { role: 'hr' })).status === 404);

  const lastAdmin = await call('PATCH', `/organizations/${R.id}/members/${A.id}`, A.token, { role: 'employee' });
  check('the only administrator cannot step down (409 LAST_ADMIN)', lastAdmin.status === 409 && lastAdmin.body.code === 'LAST_ADMIN', lastAdmin.text);
  check('the only administrator cannot leave (409 ADMIN_CANNOT_LEAVE)', (await call('POST', `/organizations/${R.id}/leave`, A.token)).body?.code === 'ADMIN_CANNOT_LEAVE');
  check('administrators cannot be removed from the people list (409)', (await call('DELETE', `/organizations/${R.id}/members/${A.id}`, hr.token)).status === 409);

  await call('PATCH', `/organizations/${R.id}/members/${emp.id}`, A.token, { role: 'admin' });
  const staffList = await call('GET', `/organizations/${R.id}/staff`, A.token);
  check('the administrators list shows both administrators and the HR person', staffList.status === 200 && staffList.body.data.filter((p) => p.role === 'admin').length === 2 && staffList.body.data.some((p) => p.user_id === hr.id && p.role === 'hr'), staffList.text);
  check('with a second administrator the first can step down', (await call('PATCH', `/organizations/${R.id}/members/${A.id}`, A.token, { role: 'employee' })).status === 200);
  check('the remaining administrator cannot step down (409)', (await call('PATCH', `/organizations/${R.id}/members/${emp.id}`, emp.token, { role: 'hr' })).body?.code === 'LAST_ADMIN');
  check('a second administrator can run billing (manage:billing)', (await call('GET', `/payments/billing/${R.id}`, emp.token)).status === 200);
  check('the first, now an employee, no longer can (403)', (await call('GET', `/payments/billing/${R.id}`, A.token)).status === 403);
  await call('PATCH', `/organizations/${R.id}/members/${A.id}`, emp.token, { role: 'admin' });
  const leave = await call('POST', `/organizations/${R.id}/leave`, emp.token);
  check('an administrator can leave when another remains', leave.status === 200, leave.text);
  const audit = await prisma.auditLog.findMany({ where: { organization_id: R.id, action: 'member.role_changed' } });
  check('every role change is in the audit trail', audit.length >= 5 && audit.every((a) => a.changes && a.changes.from && a.changes.to), `rows=${audit.length}`);

  // ================================================================== HR retake approval
  console.log('\n--- retake approval');
  const { admin: RA, org: RO } = await makeOrg('retake');
  const RH = await makeUser('rhr');
  const RE = await makeUser('remp', { first: 'Eli', last: 'Employee' });
  const RE2 = await makeUser('remp2', { first: 'Nia', last: 'Newcomer' });
  const XA = (await makeOrg('outsider')).admin;
  await join(RA, RO, RH, 'hr');
  await join(RA, RO, RE);
  await join(RA, RO, RE2);
  const { full } = await assessments(RE.token);
  const first = await takeFor(RE, full.id, RO.id);
  check('setup: the employee finished the assessment for the company', first.done?.status === 200 || first.done?.status === 201, first.done?.text);
  const firstResult = first.done.body;

  let list = (await call('GET', '/assessments', RE.token)).body.data.find((a) => a.slug === 'ocean-full');
  check('the assessment list says a retake needs approval', list.company_retake?.state === 'needs_approval' && list.company_retake.organization_id === RO.id && list.company_cover?.id === RO.id, JSON.stringify(list.company_retake));
  const locked = await call('POST', `/assessments/${full.id}/start`, RE.token, { organization_id: RO.id });
  check('starting again through the company is refused (409 RETAKE_NEEDS_APPROVAL)', locked.status === 409 && locked.body.code === 'RETAKE_NEEDS_APPROVAL' && locked.body.request_status === null, locked.text);
  const priv = await call('POST', `/assessments/${full.id}/start`, RE.token);
  check('starting privately is still governed by the retake window (409 RETAKE_LOCKED)', priv.status === 409 && priv.body.code === 'RETAKE_LOCKED', priv.text);

  await fake('resend', '/__control/reset', 'POST');
  check('only company members can ask (403)', (await call('POST', '/retake-requests', XA.token, { assessment_id: full.id, organization_id: RO.id })).status === 403);
  const noResult = await call('POST', '/retake-requests', RE2.token, { assessment_id: full.id, organization_id: RO.id });
  check('someone who has not finished has nothing to repeat (409 RETAKE_NOT_NEEDED)', noResult.status === 409 && noResult.body.code === 'RETAKE_NOT_NEEDED', noResult.text);
  const ask = await call('POST', '/retake-requests', RE.token, { assessment_id: full.id, organization_id: RO.id });
  check('the employee asks for a retake', ask.status === 200 && ask.body.status === 'requested', ask.text);
  mails = await emails();
  const reqMails = mails.filter((m) => /asked to retake/.test(m.subject));
  check('the company’s administrator and HR are both emailed', reqMails.length === 2 && reqMails.some((m) => m.to === RA.email) && reqMails.some((m) => m.to === RH.email), JSON.stringify(reqMails.map((m) => m.to)));
  const askAgain = await call('POST', '/retake-requests', RE.token, { assessment_id: full.id, organization_id: RO.id });
  check('asking twice returns the same request and sends nothing more', askAgain.body.id === ask.body.id && (await emails()).filter((m) => /asked to retake/.test(m.subject)).length === 2);
  check('the assessment list now says the request is waiting', (await call('GET', '/assessments', RE.token)).body.data.find((a) => a.slug === 'ocean-full').company_retake?.state === 'requested');
  const waiting = await call('POST', `/assessments/${full.id}/start`, RE.token, { organization_id: RO.id });
  check('starting while waiting says so', waiting.status === 409 && waiting.body.request_status === 'requested' && /waiting/.test(waiting.body.message), waiting.text);

  check('an employee cannot see the requests (403)', (await call('GET', `/organizations/${RO.id}/retakes`, RE.token)).status === 403);
  check('another company’s administrator cannot see them (403)', (await call('GET', `/organizations/${RO.id}/retakes`, XA.token)).status === 403);
  check('another company’s administrator cannot approve (403)', (await call('POST', `/organizations/${RO.id}/retakes/${ask.body.id}/approve`, XA.token)).status === 403);
  const rlist = await call('GET', `/organizations/${RO.id}/retakes`, RH.token);
  check('HR sees the waiting request with the person and assessment', rlist.status === 200 && rlist.body.data.length === 1 && rlist.body.data[0].person.name === 'Eli Employee' && rlist.body.data[0].status === 'requested' && rlist.body.data[0].assessment.id === full.id, rlist.text);

  const decl = await call('POST', `/organizations/${RO.id}/retakes/${ask.body.id}/decline`, RH.token);
  check('HR can decline', decl.status === 200 && decl.body.status === 'declined', decl.text);
  check('declining twice is refused (409)', (await call('POST', `/organizations/${RO.id}/retakes/${ask.body.id}/decline`, RH.token)).status === 409);
  check('after declining, the employee is back to "needs approval"', (await call('GET', '/assessments', RE.token)).body.data.find((a) => a.slug === 'ocean-full').company_retake?.state === 'needs_approval');

  const ask2 = await call('POST', '/retake-requests', RE.token, { assessment_id: full.id, organization_id: RO.id });
  check('they can ask again after a decline (a new request)', ask2.status === 200 && ask2.body.id !== ask.body.id);
  await fake('resend', '/__control/reset', 'POST');
  const appr = await call('POST', `/organizations/${RO.id}/retakes/${ask2.body.id}/approve`, RH.token);
  const days = (new Date(appr.body.expires_at).getTime() - Date.now()) / 86400000;
  check('HR approves: valid for 14 days', appr.status === 200 && appr.body.status === 'approved' && days > 13.9 && days <= 14, appr.text);
  const apprMail = (await emails()).find((m) => /approved your retake/.test(m.subject));
  check('the employee is emailed, with a link to start', apprMail?.to === RE.email && /assessments\/full/.test(apprMail.html), JSON.stringify(apprMail?.subject));
  check('the list shows it as approved', (await call('GET', `/organizations/${RO.id}/retakes`, RA.token)).body.data[0].status === 'approved');
  check('approving it again is refused (409)', (await call('POST', `/organizations/${RO.id}/retakes/${ask2.body.id}/approve`, RH.token)).status === 409);
  list = (await call('GET', '/assessments', RE.token)).body.data.find((a) => a.slug === 'ocean-full');
  check('the assessment list says approved, with the deadline', list.company_retake?.state === 'approved' && !!list.company_retake.expires_at);
  check('an approval does not unlock a private retake (409 RETAKE_LOCKED)', (await call('POST', `/assessments/${full.id}/start`, RE.token)).body?.code === 'RETAKE_LOCKED');

  const retake2 = await takeFor(RE, full.id, RO.id);
  check('starting through the company now works, as attempt 2', retake2.start.status === 200 && retake2.start.body.submission.submission_number === 2, retake2.start.text);
  check('the approval is used up', (await prisma.retakeRequest.findUnique({ where: { id: ask2.body.id } })).status === 'used');
  check('the retake is completed and counted', retake2.done?.status === 200 || retake2.done?.status === 201);
  const results = await prisma.assessmentResult.findMany({ where: { user_id: RE.id, organization_id: RO.id }, orderBy: { calculated_at: 'asc' } });
  check('both results are kept, only the newest is current', results.length === 2 && results[0].is_current === false && results[1].is_current === true, JSON.stringify(results.map((r) => r.is_current)));
  const link = await prisma.assessmentSubmission.findFirst({ where: { id: retake2.submissionId } });
  check('the new attempt points back to the old one', link.previous_submission_id === first.start.body.submission.id);
  check('the company team view shows the newest result only', (await call('GET', `/organizations/${RO.id}/members`, RH.token)).body.data.find((m) => m.user_id === RE.id).result.id === retake2.done.body.id);
  const again2 = await call('POST', `/assessments/${full.id}/start`, RE.token, { organization_id: RO.id });
  check('after the retake, another needs approval again (409)', again2.status === 409 && again2.body.code === 'RETAKE_NEEDS_APPROVAL');

  await fake('resend', '/__control/reset', 'POST');
  const allow = await call('POST', `/organizations/${RO.id}/retakes`, RH.token, { user_id: RE.id });
  check('HR can allow a retake without being asked (defaults to the full assessment)', allow.status === 200 && allow.body.status === 'approved', allow.text);
  const allowRow = await prisma.retakeRequest.findUnique({ where: { id: allow.body.id } });
  check('it is recorded as started by HR', allowRow.requested_by === 'hr' && allowRow.assessment_id === full.id && allowRow.decided_by === RH.id);
  check('the employee is emailed', (await emails()).some((m) => m.to === RE.email && /approved your retake/.test(m.subject)));
  check('allowing again returns the same approval and does not email again', (await call('POST', `/organizations/${RO.id}/retakes`, RH.token, { user_id: RE.id })).body.id === allow.body.id && (await emails()).filter((m) => /approved your retake/.test(m.subject)).length === 1);
  check('an employee cannot allow retakes (403)', (await call('POST', `/organizations/${RO.id}/retakes`, RE.token, { user_id: RE.id })).status === 403);
  check('allowing for someone who has not finished is refused (409)', (await call('POST', `/organizations/${RO.id}/retakes`, RH.token, { user_id: RE2.id })).body?.code === 'RETAKE_NOT_NEEDED');
  check('allowing for someone outside the company is refused (404)', (await call('POST', `/organizations/${RO.id}/retakes`, RH.token, { user_id: XA.id })).status === 404);
  const withdrawn = await call('POST', `/organizations/${RO.id}/retakes/${allow.body.id}/cancel`, RH.token);
  check('HR can withdraw an unused approval', withdrawn.status === 200 && withdrawn.body.status === 'cancelled', withdrawn.text);
  check('after withdrawing, starting needs approval again', (await call('POST', `/assessments/${full.id}/start`, RE.token, { organization_id: RO.id })).body?.code === 'RETAKE_NEEDS_APPROVAL');
  check('withdrawing something not approved is refused (409)', (await call('POST', `/organizations/${RO.id}/retakes/${allow.body.id}/cancel`, RH.token)).status === 409);

  const exp1 = await call('POST', `/organizations/${RO.id}/retakes`, RH.token, { user_id: RE.id });
  await prisma.retakeRequest.update({ where: { id: exp1.body.id }, data: { expires_at: new Date(Date.now() - 1000) } });
  check('an expired approval no longer lets them start', (await call('POST', `/assessments/${full.id}/start`, RE.token, { organization_id: RO.id })).body?.code === 'RETAKE_NEEDS_APPROVAL');
  check('and is not listed as approved', !(await call('GET', `/organizations/${RO.id}/retakes`, RH.token)).body.data.some((r) => r.id === exp1.body.id && r.status === 'approved'));

  // leaving the company detaches results, so a later company attempt is a first one again
  await call('DELETE', `/organizations/${RO.id}/members/${RE.id}`, RH.token);
  check('a removed person cannot be approved for a retake (404)', (await call('POST', `/organizations/${RO.id}/retakes`, RH.token, { user_id: RE.id })).status === 404);

  // ================================================================== scheduled jobs
  console.log('\n--- scheduled jobs');
  const DIST = `${ROOT}/apps/api/dist`;
  const { PrismaService } = require(`${DIST}/database/prisma.service`);
  const { MailService } = require(`${DIST}/common/mail/mail.service`);
  const { BillingConfigService } = require(`${DIST}/common/billing/billing-config.service`);
  const { JobsService } = require(`${DIST}/common/jobs/jobs.service`);
  const rawPrisma = new PrismaService();
  await rawPrisma.$connect();
  // The jobs are global by design; here they may only touch this test's own rows.
  const orgScope = { organization: { slug: { startsWith: 'w5-w9' } } };
  const scopes = { subscription: orgScope, employeeInvitation: orgScope, retakeRequest: orgScope, idempotencyKey: { key: { startsWith: 'w5-' } }, webhookEvent: { reference: { startsWith: 'w5-' } }, session: { user: { email: { endsWith: '@w5.test' } } }, user: { email: { endsWith: '@w5.test' } } };
  const scoped = new Proxy(rawPrisma, {
    get(target, key) {
      const v = target[key];
      if (!scopes[key]) return typeof v === 'function' ? v.bind(target) : v;
      return new Proxy(v, { get: (m, fn) => (['findMany', 'updateMany', 'deleteMany'].includes(fn) ? (args = {}) => m[fn]({ ...args, where: { AND: [args.where ?? {}, scopes[key]] } }) : m[fn].bind(m)) });
    },
  });
  const cfg = { get: (k) => process.env[k] };
  const jobs = new JobsService(scoped, new MailService(cfg), new BillingConfigService(cfg), cfg);

  const { admin: JA, org: JO } = await makeOrg('jobs');
  const sub = await prisma.subscription.findUnique({ where: { organization_id: JO.id } });
  const setEnd = (ms, extra = {}) => prisma.subscription.update({ where: { id: sub.id }, data: { end_date: new Date(Date.now() + ms), ...extra } });
  const noticesTo = async (to) => (await emails()).filter((m) => m.to === to && /plan/.test(m.subject));

  await fake('resend', '/__control/reset', 'POST');
  await jobs.runAll();
  check('a plan with 30 days left gets no notice', (await noticesTo(JA.email)).length === 0);
  await setEnd(5 * 86400000, { last_expiry_notice: null });
  await jobs.sendPlanNotices();
  let n = await noticesTo(JA.email);
  check('with 5 days left the administrator is told the plan ends soon', n.length === 1 && /ends soon/.test(n[0].subject) && /billing/.test(n[0].html), JSON.stringify(n.map((m) => m.subject)));
  await jobs.sendPlanNotices();
  check('running again does not repeat it', (await noticesTo(JA.email)).length === 1);
  await setEnd(3 * 3600000);
  await jobs.sendPlanNotices();
  check('with hours left a final warning follows', (await noticesTo(JA.email)).length === 2 && (await prisma.subscription.findUnique({ where: { id: sub.id } })).last_expiry_notice === '1d');
  await setEnd(-1000);
  await jobs.sendPlanNotices();
  const ended = await prisma.subscription.findUnique({ where: { id: sub.id } });
  n = await noticesTo(JA.email);
  check('when it runs out the plan is marked expired, the company deactivated, and the administrator told', ended.status === 'expired' && ended.last_expiry_notice === 'ended' && (await prisma.organization.findUnique({ where: { id: JO.id } })).subscription_status === 'inactive' && /has ended/.test(n[n.length - 1].subject));
  check('an expired plan blocks inviting (402 SUBSCRIPTION_REQUIRED)', (await call('POST', `/organizations/${JO.id}/invitations`, JA.token, { emails: [`j1-${stamp}@w5.test`] })).body?.code === 'SUBSCRIPTION_REQUIRED');
  const ovr = await call('GET', `/organizations/${JO.id}/dashboard`, JA.token);
  check('the dashboard reports the plan as ended', ovr.body.plan && ovr.body.plan.active === false, JSON.stringify(ovr.body.plan));
  await jobs.sendPlanNotices();
  check('nothing more is sent once it has ended', (await noticesTo(JA.email)).length === n.length);
  await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'active', end_date: new Date(Date.now() + 30 * 86400000), last_expiry_notice: null } });
  check('renewing restores inviting', (await call('POST', `/organizations/${JO.id}/invitations`, JA.token, { emails: [`j2-${stamp}@w5.test`] })).status === 200);

  // invitations and approvals that ran out, stale credentials
  const old = await prisma.employeeInvitation.create({ data: { organization_id: JO.id, sender_id: JA.id, recipient_email: `old-${stamp}@w5.test`, invitation_token: `jobs-old-${stamp}-aaaaaaaaaa`, invitation_url: `/invite/jobs-old-${stamp}`, expires_at: new Date(Date.now() - 1000), assessment_id: full.id } });
  const fresh = await prisma.employeeInvitation.findFirst({ where: { organization_id: JO.id, recipient_email: `j2-${stamp}@w5.test` } });
  check('expired invitations are closed, live ones untouched', (await jobs.expireInvitations()) >= 1 && (await prisma.employeeInvitation.findUnique({ where: { id: old.id } })).status === 'expired' && (await prisma.employeeInvitation.findUnique({ where: { id: fresh.id } })).status === 'pending');
  check('a closed invitation can be sent again (resend)', (await call('POST', `/organizations/${JO.id}/invitations/${old.id}/resend`, JA.token)).status === 200);
  const retakeOrgMember = await prisma.organizationMember.findFirst({ where: { organization_id: RO.id, user_id: RE2.id } });
  void retakeOrgMember;
  const rq = await prisma.retakeRequest.create({ data: { organization_id: RO.id, user_id: RE2.id, assessment_id: full.id, status: 'approved', expires_at: new Date(Date.now() - 1000) } });
  check('expired approvals are closed', (await jobs.expireRetakes()) >= 1 && (await prisma.retakeRequest.findUnique({ where: { id: rq.id } })).status === 'expired');

  await prisma.session.create({ data: { user_id: JA.id, refresh_token: `jobs-stale-${stamp}`, ip_address: '1.1.1.1', user_agent: 'test', expires_at: new Date(Date.now() - 1000) } });
  await prisma.user.update({ where: { id: JA.id }, data: { password_reset_token: 'x'.repeat(64), password_reset_expires: new Date(Date.now() - 1000), email_verify_token: 'y'.repeat(64), email_verify_expires: new Date(Date.now() - 1000), pending_email: `pending-${stamp}@w5.test` } });
  check('stale sessions and links are cleared', (await jobs.clearStale()) >= 3);
  const cleaned = await prisma.user.findUnique({ where: { id: JA.id } });
  check('including an unconfirmed address change', !cleaned.password_reset_token && !cleaned.email_verify_token && !cleaned.pending_email);
  check('and the stale session is gone', (await prisma.session.count({ where: { refresh_token: `jobs-stale-${stamp}` } })) === 0);
  const report = await jobs.runAll();
  check('runAll reports every task and none failed', Object.keys(report).length === 4 && Object.values(report).every((v) => typeof v === 'number'), JSON.stringify(report));
  await rawPrisma.$disconnect();

  // ================================================================== tidy
  await prisma.organization.deleteMany({ where: { admin_email: { endsWith: '@w5.test' } } });
  await prisma.payment.deleteMany({ where: { user_id: { in: deletedIds } } });
  await prisma.user.deleteMany({ where: { id: { in: deletedIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: 'deleted+' }, first_name: 'Deleted', id: { in: deletedIds } } });
  await finish();
})().catch(async (e) => {
  console.error('SCRIPT ERROR', e);
  try {
    await prisma.organization.deleteMany({ where: { admin_email: { endsWith: '@w5.test' } } });
    await cleanup();
  } catch {}
  process.exit(2);
});
