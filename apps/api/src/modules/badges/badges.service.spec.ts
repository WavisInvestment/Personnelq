import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BadgesService } from './badges.service';

const USER = { id: 'u1', first_name: 'Ada' };
const DAY = 24 * 60 * 60 * 1000;

const badgeRow = (over: object = {}) => ({
  id: 'b1',
  user_id: 'u1',
  result_id: 'res-1',
  share_token: 'T'.repeat(43),
  share_url: `/b/${'T'.repeat(43)}`,
  is_public: true,
  published_at: new Date(),
  expires_at: null,
  shared_elements: { scores: true, descriptions: false, date: true, class: true },
  view_count: 0,
  last_viewed_at: null,
  display_name: 'Ada',
  custom_message: null,
  deleted_at: null,
  ...over,
});

function setup() {
  const prisma: any = {
    assessmentResult: { count: jest.fn().mockResolvedValue(1), findFirst: jest.fn().mockResolvedValue({ id: 'res-1', assessment: { type: 'full_assessment' } }) },
    shareableBadge: {
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }: any) => badgeRow(data)),
      update: jest.fn().mockImplementation(async ({ data }: any) => badgeRow(data)),
    },
  };
  return { prisma, service: new BadgesService(prisma) };
}

describe('BadgesService', () => {
  describe('who can share what', () => {
    it('404s for a result that is not the caller’s', async () => {
      const { service, prisma } = setup();
      prisma.assessmentResult.findFirst.mockResolvedValue(null);
      await expect(service.upsert(USER, 'res-1', { is_public: true })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.assessmentResult.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'res-1', user_id: 'u1' });
    });

    it('refuses to make a badge from the free snapshot', async () => {
      const { service, prisma } = setup();
      prisma.assessmentResult.findFirst.mockResolvedValue({ id: 'res-1', assessment: { type: 'free_snapshot' } });
      const error: any = await service.upsert(USER, 'res-1', { is_public: true }).catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse().code).toBe('BADGE_NOT_AVAILABLE');
      expect(prisma.shareableBadge.create).not.toHaveBeenCalled();
    });
  });

  describe('creating a badge', () => {
    it('starts private-by-default choices: first name only, scores and date shown, descriptions hidden', async () => {
      const { service, prisma } = setup();

      await service.upsert(USER, 'res-1', { is_public: true });

      const data = prisma.shareableBadge.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ user_id: 'u1', result_id: 'res-1', is_public: true, display_name: 'Ada', custom_message: null, expires_at: null });
      expect(data.shared_elements).toEqual({ scores: true, descriptions: false, date: true, class: true });
    });

    it('issues an unguessable 256-bit token and a matching path', async () => {
      const { service, prisma } = setup();
      await service.upsert(USER, 'res-1', { is_public: true });
      const data = prisma.shareableBadge.create.mock.calls[0][0].data;
      expect(data.share_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(data.share_url).toBe(`/b/${data.share_token}`);
    });

    it('never reuses a token between badges', async () => {
      const { service, prisma } = setup();
      await service.upsert(USER, 'res-1', { is_public: true });
      await service.upsert(USER, 'res-1', { is_public: true });
      const [a, b] = prisma.shareableBadge.create.mock.calls.map((c: any) => c[0].data.share_token);
      expect(a).not.toBe(b);
    });

    it('applies the owner’s choices and an expiry', async () => {
      const { service, prisma } = setup();
      await service.upsert(USER, 'res-1', {
        is_public: true,
        display_name: 'Ada U.',
        custom_message: 'Open to mentoring',
        show_scores: false,
        show_descriptions: true,
        show_date: false,
        expires_in_days: 30,
      });
      const data = prisma.shareableBadge.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ display_name: 'Ada U.', custom_message: 'Open to mentoring' });
      expect(data.shared_elements).toEqual({ scores: false, descriptions: true, date: false, class: true });
      expect(data.expires_at.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
      expect(data.expires_at.getTime()).toBeLessThan(Date.now() + 31 * DAY);
    });

    it('shows a share path only while sharing is on', async () => {
      const { service } = setup();
      const on = await service.upsert(USER, 'res-1', { is_public: true });
      const off = await service.upsert(USER, 'res-1', { is_public: false });
      expect(on.badge.share_path).toMatch(/^\/b\//);
      expect(off.badge.share_path).toBeNull();
    });
  });

  describe('changing a badge', () => {
    it('keeps the same link when settings change while sharing stays on', async () => {
      const { service, prisma } = setup();
      prisma.shareableBadge.findUnique.mockResolvedValue(badgeRow());
      await service.upsert(USER, 'res-1', { is_public: true, custom_message: 'Hello' });
      expect(prisma.shareableBadge.update.mock.calls[0][0].data.share_token).toBe('T'.repeat(43));
    });

    it('issues a brand-new link when sharing is switched back on, so an old link can never return', async () => {
      const { service, prisma } = setup();
      prisma.shareableBadge.findUnique.mockResolvedValue(badgeRow({ is_public: false, published_at: null }));
      await service.upsert(USER, 'res-1', { is_public: true });
      const data = prisma.shareableBadge.update.mock.calls[0][0].data;
      expect(data.share_token).not.toBe('T'.repeat(43));
      expect(data.share_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(data.published_at).toBeInstanceOf(Date);
    });

    it('treats an expired badge as off: saving it again issues a new link and clears the old expiry', async () => {
      const { service, prisma } = setup();
      // Expired but still flagged public in the database: the exact state a lapsed link is left in.
      prisma.shareableBadge.findUnique.mockResolvedValue(badgeRow({ is_public: true, expires_at: new Date(Date.now() - DAY) }));

      await service.upsert(USER, 'res-1', { is_public: true });

      const data = prisma.shareableBadge.update.mock.calls[0][0].data;
      expect(data.share_token).not.toBe('T'.repeat(43));
      expect(data.expires_at).toBeNull();
    });

    it('keeps a still-valid expiring badge on the same link when it is saved again', async () => {
      const { service, prisma } = setup();
      prisma.shareableBadge.findUnique.mockResolvedValue(badgeRow({ is_public: true, expires_at: new Date(Date.now() + 5 * DAY) }));
      await service.upsert(USER, 'res-1', { is_public: true, custom_message: 'Hi' });
      expect(prisma.shareableBadge.update.mock.calls[0][0].data.share_token).toBe('T'.repeat(43));
    });

    it('does not carry an old expiry into a re-opened link', async () => {
      const { service, prisma } = setup();
      prisma.shareableBadge.findUnique.mockResolvedValue(badgeRow({ is_public: false, expires_at: new Date(Date.now() - DAY) }));
      await service.upsert(USER, 'res-1', { is_public: true });
      expect(prisma.shareableBadge.update.mock.calls[0][0].data.expires_at).toBeNull();
    });

    it('leaves the expiry alone when none is specified, and removes it with null', async () => {
      const { service, prisma } = setup();
      const expiry = new Date(Date.now() + 5 * DAY);
      prisma.shareableBadge.findUnique.mockResolvedValue(badgeRow({ expires_at: expiry }));

      await service.upsert(USER, 'res-1', { is_public: true });
      expect(prisma.shareableBadge.update.mock.calls[0][0].data).not.toHaveProperty('expires_at');

      await service.upsert(USER, 'res-1', { is_public: true, expires_in_days: null });
      expect(prisma.shareableBadge.update.mock.calls[1][0].data.expires_at).toBeNull();
    });

    it('turning sharing off stops it immediately', async () => {
      const { service, prisma } = setup();
      prisma.shareableBadge.findUnique.mockResolvedValue(badgeRow());
      await service.upsert(USER, 'res-1', { is_public: false });
      expect(prisma.shareableBadge.update.mock.calls[0][0].data).toMatchObject({ is_public: false, published_at: null });
    });
  });

  describe('revoking', () => {
    it('stops sharing and retires the old link', async () => {
      const { service, prisma } = setup();
      prisma.shareableBadge.findFirst.mockResolvedValue(badgeRow());
      await service.revoke('u1', 'res-1');
      const data = prisma.shareableBadge.update.mock.calls[0][0].data;
      expect(data.is_public).toBe(false);
      expect(data.share_token).not.toBe('T'.repeat(43));
    });

    it('is harmless when there was never a badge', async () => {
      const { service, prisma } = setup();
      prisma.shareableBadge.findFirst.mockResolvedValue(null);
      expect(await service.revoke('u1', 'res-1')).toEqual({ badge: null });
    });
  });

  describe('the public view', () => {
    const publicRow = (over: object = {}) => ({
      ...badgeRow(over),
      result: {
        openness_score: 82,
        conscientiousness_score: 45,
        extraversion_score: 12,
        agreeableness_score: 70,
        neuroticism_score: 30,
        assessment: { name: 'Full personality assessment' },
        submission: { completed_at: new Date('2026-10-01T10:00:00Z') },
      },
    });

    it('404s for a token with the wrong shape without touching the database', async () => {
      const { service, prisma } = setup();
      for (const bad of ['', 'short', 'a'.repeat(100), 'has spaces and !!', '../etc/passwd', "' OR 1=1 --"]) {
        await expect(service.publicView(bad)).rejects.toBeInstanceOf(NotFoundException);
      }
      expect(prisma.shareableBadge.findFirst).not.toHaveBeenCalled();
    });

    it('404s for a badge that is off, expired, or does not exist', async () => {
      const { service, prisma } = setup();
      prisma.shareableBadge.findFirst.mockResolvedValue(null);
      await expect(service.publicView('T'.repeat(43))).rejects.toBeInstanceOf(NotFoundException);
      const where = prisma.shareableBadge.findFirst.mock.calls[0][0].where;
      expect(where).toMatchObject({ share_token: 'T'.repeat(43), is_public: true, deleted_at: null });
      expect(where.OR).toEqual([{ expires_at: null }, { expires_at: { gt: expect.any(Date) } }]);
    });

    it('shows only what was chosen: levels and scores by default, no descriptions', async () => {
      const { service, prisma } = setup();
      prisma.shareableBadge.findFirst.mockResolvedValue(publicRow());
      prisma.shareableBadge.update.mockResolvedValue({});

      const view = await service.publicView('T'.repeat(43));

      expect(view.display_name).toBe('Ada');
      expect(view.assessment_name).toBe('Full personality assessment');
      expect(view.traits.map((t) => t.trait)).toEqual(['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']);
      expect(view.traits[0]).toMatchObject({ level: 'very_high', level_label: 'Very high', score: 82, description: null });
      expect(view.completed_at).toEqual(new Date('2026-10-01T10:00:00Z'));
    });

    it('hides scores and the date when the owner turned them off, and shows readings when turned on', async () => {
      const { service, prisma } = setup();
      prisma.shareableBadge.findFirst.mockResolvedValue(publicRow({ shared_elements: { scores: false, descriptions: true, date: false, class: false } }));
      prisma.shareableBadge.update.mockResolvedValue({});

      const view = await service.publicView('T'.repeat(43));

      expect(view.traits.every((t) => t.score === null)).toBe(true);
      expect(view.traits.every((t) => typeof t.description === 'string')).toBe(true);
      expect(view.completed_at).toBeNull();
    });

    it('includes the personality class, its partners and the tier when the owner chose to show them, and leaves them out otherwise', async () => {
      const { service, prisma } = setup();
      prisma.shareableBadge.update.mockResolvedValue({});
      prisma.shareableBadge.findFirst.mockResolvedValue(publicRow());
      const shown = await service.publicView('T'.repeat(43));
      expect(shown.profile_class).toMatchObject({ name: expect.stringMatching(/^CL-0[1-8]$/) });
      expect(shown.profile_class!.pairs_with).toHaveLength(3);
      expect(shown.tier).toMatchObject({ key: 'insight' });

      prisma.shareableBadge.findFirst.mockResolvedValue(publicRow({ shared_elements: { scores: true, descriptions: false, date: true, class: false } }));
      const hidden = await service.publicView('T'.repeat(43));
      expect(hidden.profile_class).toBeNull();
      expect(hidden.tier).toBeNull();
    });

    it('never exposes anything about the account', async () => {
      const { service, prisma } = setup();
      prisma.shareableBadge.findFirst.mockResolvedValue(publicRow({ custom_message: 'Hi there' }));
      prisma.shareableBadge.update.mockResolvedValue({});

      const json = JSON.stringify(await service.publicView('T'.repeat(43)));

      expect(json).not.toMatch(/user_id|email|result_id|share_token|"id"|u1|res-1/);
      expect(JSON.parse(json)).toHaveProperty('message', 'Hi there');
    });

    it('counts the view, and still shows the badge if counting fails', async () => {
      const { service, prisma } = setup();
      prisma.shareableBadge.findFirst.mockResolvedValue(publicRow());
      prisma.shareableBadge.update.mockRejectedValue(new Error('db hiccup'));

      await expect(service.publicView('T'.repeat(43))).resolves.toMatchObject({ display_name: 'Ada' });
      expect(prisma.shareableBadge.update.mock.calls[0][0].data).toMatchObject({ view_count: { increment: 1 } });
    });
  });
});
