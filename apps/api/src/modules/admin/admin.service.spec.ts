import { Test } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;
  const prisma: any = {
    user: { count: jest.fn(), findMany: jest.fn() },
    role: { findMany: jest.fn() },
    permission: { findMany: jest.fn() },
    organization: { count: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() },
    subscription: { groupBy: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    payment: { groupBy: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    assessmentSubmission: { count: jest.fn() },
    auditLog: { count: jest.fn(), findMany: jest.fn() },
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AdminService);
  });

  describe('overview', () => {
    it('aggregates totals, converts recurring revenue to monthly and fills empty signup days', async () => {
      prisma.user.count.mockResolvedValueOnce(120).mockResolvedValueOnce(8).mockResolvedValueOnce(31);
      prisma.organization.count.mockResolvedValue(4);
      prisma.organization.groupBy
        .mockResolvedValueOnce([{ status: 'active', _count: { _all: 3 } }, { status: 'suspended', _count: { _all: 1 } }])
        .mockResolvedValueOnce([{ type: 'corporate', _count: { _all: 4 } }]);
      prisma.subscription.groupBy.mockResolvedValue([{ status: 'active', _count: { _all: 2 } }]);
      prisma.subscription.findMany.mockResolvedValue([
        { amount: 100, currency: 'USD', billing_cycle: 'monthly' },
        { amount: 1200, currency: 'USD', billing_cycle: 'annual' },
      ]);
      prisma.payment.groupBy
        .mockResolvedValueOnce([{ currency: 'USD', _sum: { amount: 1300 }, _count: { _all: 2 } }])
        .mockResolvedValueOnce([{ status: 'success', _count: { _all: 2 } }, { status: 'failed', _count: { _all: 1 } }]);
      prisma.assessmentSubmission.count.mockResolvedValueOnce(15).mockResolvedValueOnce(3);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.$queryRaw.mockResolvedValue([{ day: new Date().toISOString().slice(0, 10), count: BigInt(5) }]);

      const result = await service.overview();

      expect(result.users).toEqual({ total: 120, new_7d: 8, new_30d: 31 });
      expect(result.organizations.by_status).toEqual({ active: 3, suspended: 1 });
      expect(result.subscriptions.active).toBe(2);
      expect(result.subscriptions.mrr).toEqual([{ currency: 'USD', amount: 200 }]); // 100 + 1200/12
      expect(result.payments.revenue).toEqual([{ currency: 'USD', total: 1300, count: 2 }]);
      expect(result.assessments).toEqual({ completed: 15, in_progress: 3 });
      expect(result.signups_30d).toHaveLength(30);
      expect(result.signups_30d[29].count).toBe(5);
      expect(result.signups_30d[0].count).toBe(0);
    });
  });

  describe('listUsers', () => {
    it('never selects credential fields and flattens counts', async () => {
      prisma.user.count.mockResolvedValue(45);
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          email: 'a@b.com',
          platform_role: { key: 'support', name: 'Support' },
          account_role: { key: 'individual', name: 'Individual' },
          _count: { organization_members: 1, submissions: 2 },
          organization_members: [{ role: { key: 'hr', name: 'HR' }, organization: { id: 'o1', name: 'Acme' } }],
        },
      ]);

      const result = await service.listUsers({ page: 2, limit: 20 } as any);

      const { select } = prisma.user.findMany.mock.calls[0][0];
      expect(select).not.toHaveProperty('password_hash');
      expect(select).not.toHaveProperty('password_reset_token');
      expect(result.meta).toEqual({ page: 2, limit: 20, total: 45, total_pages: 3 });
      expect(prisma.user.findMany.mock.calls[0][0]).toMatchObject({ skip: 20, take: 20 });
      expect(result.data[0]).toMatchObject({
        platform_role: 'support',
        platform_role_name: 'Support',
        account_role: 'individual',
        account_role_name: 'Individual',
        organization_count: 1,
        assessment_count: 2,
        organizations: [{ id: 'o1', name: 'Acme', role: 'hr', role_name: 'HR' }],
      });
    });

    it('filters platform staff by the role foreign key', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findMany.mockResolvedValue([]);

      await service.listUsers({ page: 1, limit: 20, staff: 'true' } as any);

      expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ platform_role_id: { not: null } });
    });
  });

  describe('listRoles', () => {
    it('returns each role with its permission keys and the right user count for its scope', async () => {
      prisma.role.findMany.mockResolvedValue([
        {
          id: 'r1', scope: 'platform', key: 'support', name: 'Support', description: null, is_system: true,
          permissions: [{ permission: { key: 'view:payments' } }],
          _count: { platform_users: 3, memberships: 0, account_users: 0 },
        },
        {
          id: 'r2', scope: 'organization', key: 'hr', name: 'HR', description: null, is_system: true,
          permissions: [{ permission: { key: 'invite:members' } }],
          _count: { platform_users: 0, memberships: 12, account_users: 0 },
        },
        {
          id: 'r3', scope: 'account', key: 'individual', name: 'Individual', description: null, is_system: true,
          permissions: [{ permission: { key: 'take:assessments' } }],
          _count: { platform_users: 0, memberships: 0, account_users: 240 },
        },
      ]);
      prisma.permission.findMany.mockResolvedValue([{ key: 'view:payments', scope: 'platform', description: 'x' }]);

      const result = await service.listRoles();

      expect(result.roles[0]).toMatchObject({ key: 'support', permissions: ['view:payments'], user_count: 3 });
      expect(result.roles[1]).toMatchObject({ key: 'hr', permissions: ['invite:members'], user_count: 12 });
      expect(result.roles[2]).toMatchObject({ key: 'individual', user_count: 240 });
      expect(result.permissions).toHaveLength(1);
    });
  });

  describe('listPayments', () => {
    it('never selects gateway secrets or raw metadata', async () => {
      prisma.payment.count.mockResolvedValue(0);
      prisma.payment.findMany.mockResolvedValue([]);

      await service.listPayments({ page: 1, limit: 20 } as any);

      const { select } = prisma.payment.findMany.mock.calls[0][0];
      expect(select).not.toHaveProperty('authorization_url');
      expect(select).not.toHaveProperty('access_code');
      expect(select).not.toHaveProperty('metadata');
      expect(select).toHaveProperty('provider_reference');
    });

    it('includes who paid, so payments made by a person (no company) can still be shown', async () => {
      prisma.payment.count.mockResolvedValue(1);
      prisma.payment.findMany.mockResolvedValue([
        { id: 'p1', organization: null, user: { id: 'u1', first_name: 'Eve', last_name: 'Okafor', email: 'eve@x.test' } },
      ]);

      const result = await service.listPayments({ page: 1, limit: 20 } as any);

      const { select } = prisma.payment.findMany.mock.calls[0][0];
      expect(select.user).toEqual({ select: { id: true, first_name: true, last_name: true, email: true } });
      expect(select.organization).toBeDefined();
      expect(result.data[0]).toMatchObject({ organization: null, user: { email: 'eve@x.test' } });
    });

    it('searches by the payer’s name and email as well as the company and reference', async () => {
      prisma.payment.count.mockResolvedValue(0);
      prisma.payment.findMany.mockResolvedValue([]);

      await service.listPayments({ page: 1, limit: 20, search: 'eve' } as any);

      const or = prisma.payment.findMany.mock.calls[0][0].where.OR;
      const keys = or.map((c: any) => Object.keys(c)[0] + '.' + Object.keys(Object.values(c)[0] as object)[0]);
      expect(keys).toEqual(expect.arrayContaining(['provider_reference.contains', 'organization.name', 'user.email', 'user.first_name', 'user.last_name']));
    });
  });
});
