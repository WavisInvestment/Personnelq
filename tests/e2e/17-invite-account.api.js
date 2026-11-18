process.env.W5_TAG = 'inv';
const { prisma, call, check, makeUser, PW, finish } = require('./lib');
const rnd = () => Math.floor(Math.random() * 250) + 1;
const ipn = () => ({ 'X-Forwarded-For': `10.${rnd()}.${rnd()}.${rnd()}` });

(async () => {
  const admin = await makeUser('admin', { first: 'Ada', last: 'Boss' });
  const existing = await makeUser('existing');
  const org = await prisma.organization.create({ data: { name: 'Stay Co', slug: 'w5-inv-co', type: 'corporate', admin_name: 'Ada Boss', admin_email: admin.email, subscription_plan: 'team', subscription_status: 'active' } });
  const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });
  await prisma.organizationMember.create({ data: { user_id: admin.id, organization_id: org.id, role_id: (await role('admin')).id } });
  await prisma.subscription.create({ data: { organization_id: org.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 25 * 86400000), auto_renew: false, seats_limit: 10 } });
  const O = `/organizations/${org.id}`;

  const newEmail = `fresh-inv-${Date.now()}@w5.test`;
  const inv = await call('POST', `${O}/invitations`, admin.token, { emails: [newEmail, existing.email] });
  const link = (e) => inv.body.invitations.find((i) => i.email === e).link.split('/invite/')[1];

  // A brand-new account made from the invitation link
  const su = await call('POST', '/auth/signup', null, { email: newEmail, first_name: 'Fay', last_name: 'Fresh', password: PW, password_confirm: PW, invitation_token: link(newEmail) }, ipn());
  check('sign-up from the link works', su.status === 201, su.text);
  const fay = { token: su.body.access_token, id: su.body.user.id };
  const row = await prisma.user.findUniqueOrThrow({ where: { id: fay.id } });
  check('the account remembers which company it was created for', row.joined_via_organization_id === org.id);
  const acc = await call('POST', `/invitations/${link(newEmail)}/accept`, fay.token);
  check('they accept and join the team', acc.status === 201 || acc.status === 200, acc.text);

  const orgs = await call('GET', '/me/organizations', fay.token);
  check('their company list says they cannot leave', orgs.body.data[0]?.can_leave === false, orgs.text);
  const leave = await call('POST', `${O}/leave`, fay.token);
  check('leaving is refused (403 CANNOT_LEAVE) and they are still in the team', leave.status === 403 && leave.body.code === 'CANNOT_LEAVE' && (await prisma.organizationMember.findFirstOrThrow({ where: { user_id: fay.id, organization_id: org.id } })).status === 'active', leave.text);
  const mail = await call('POST', '/account/email', fay.token, { email: `changed-${Date.now()}@w5.test`, password: PW }, ipn());
  check('changing the email address is refused (403 ACCOUNT_MANAGED)', mail.status === 403 && mail.body.code === 'ACCOUNT_MANAGED', mail.text);
  const del = await call('DELETE', '/account', fay.token, { password: PW });
  check('deleting the account is refused (403 ACCOUNT_MANAGED) and the account is still there', del.status === 403 && del.body.code === 'ACCOUNT_MANAGED' && !!(await prisma.user.findFirst({ where: { id: fay.id, deleted_at: null } })), del.text);
  check('the account page says it is managed and by whom', (await call('GET', '/account', fay.token)).body.managed_by === 'Stay Co');
  check('an administrator can still remove them', (await call('DELETE', `${O}/members/${fay.id}`, admin.token)).status === 200);
  const freed = await call('POST', '/account/email', fay.token, { email: `freed-${Date.now()}@w5.test`, password: PW }, ipn());
  check('once removed, the account is theirs again: the email can be changed', freed.status === 200 && (await call('GET', '/account', fay.token)).body.managed === false, freed.text);

  // An existing account that accepts an invitation can leave as before
  const acc2 = await call('POST', `/invitations/${link(existing.email)}/accept`, existing.token);
  check('an existing account accepts the invitation', acc2.status === 201 || acc2.status === 200, acc2.text);
  check('its company list says it can leave', (await call('GET', '/me/organizations', existing.token)).body.data[0]?.can_leave === true);
  check('and leaving works', (await call('POST', `${O}/leave`, existing.token)).status === 200);

  await prisma.subscription.deleteMany({ where: { organization_id: org.id } });
  await finish();
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
