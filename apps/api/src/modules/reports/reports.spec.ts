import { BadRequestException, HttpException } from '@nestjs/common';

// These tests never render a real PDF; keep the heavy browser library out of the test process.
jest.mock('puppeteer', () => ({ __esModule: true, default: { launch: jest.fn() } }));

import { validInsights } from '../insights/insights.test-helpers';
import { PdfUnavailableError } from './pdf.service';
import { radarSvg, TRAIT_ORDER } from './radar-svg';
import { ReportData, renderReportHtml } from './report-template';
import { ReportsService } from './reports.service';

const data = (over: Partial<ReportData> = {}): ReportData => ({
  personName: 'Ada Uzo',
  assessmentName: 'Full personality assessment',
  version: '1.0.0',
  attempt: 2,
  completedAt: new Date('2026-10-01T10:00:00Z'),
  generatedAt: new Date('2026-10-02T10:00:00Z'),
  traits: [
    { trait: 'openness', score: 70, level_label: 'High', description: 'You are curious and imaginative.' },
    { trait: 'conscientiousness', score: 50, level_label: 'Moderate', description: 'You are reasonably organised.' },
    { trait: 'extraversion', score: 25, level_label: 'Low', description: 'You are reserved and reflective.' },
    { trait: 'agreeableness', score: 82, level_label: 'Very high', description: 'You are warm and considerate.' },
    { trait: 'neuroticism', score: 40, level_label: 'Low', description: 'You tend to stay calm.' },
  ],
  insights: null,
  disclaimer: 'These descriptions are a starting point, not a diagnosis.',
  ...over,
});

describe('radarSvg', () => {
  it('draws the chart with one coloured dot per trait and a lettered label for each', () => {
    const svg = radarSvg([70, 50, 25, 82, 40]);
    expect(svg).toContain('<svg');
    expect((svg.match(/stroke="#fff"/g) ?? []).length).toBe(5); // data dots
    for (const letter of ['>C<', '>D<', '>E<', '>W<', '>S<']) expect(svg).toContain(letter);
  });

  it('keeps out-of-range scores inside the chart', () => {
    expect(() => radarSvg([-50, 500, 0, 100, 50])).not.toThrow();
    expect(radarSvg([-50, 500, 0, 100, 50])).not.toMatch(/NaN|Infinity/);
  });

  it('orders traits O, C, E, A, N', () => {
    expect(TRAIT_ORDER).toEqual(['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']);
  });
});

describe('renderReportHtml', () => {
  it('is a complete document naming the person, assessment, date and every trait with its reading', () => {
    const html = renderReportHtml(data());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('Ada Uzo');
    expect(html).toContain('Full personality assessment');
    expect(html).toContain('1 October 2026');
    for (const name of ['Curiosity', 'Discipline', 'Energy', 'Warmth', 'Sensitivity']) expect(html).toContain(name);
    expect(html).toContain('You are curious and imaginative.');
    expect(html).toContain('not a diagnosis');
    expect(html).toContain('Attempt 2');
  });

  it('shows the eight insight sections only when insights exist', () => {
    expect(renderReportHtml(data())).not.toContain('Your insights');
    const withInsights = renderReportHtml(data({ insights: validInsights() }));
    expect(withInsights).toContain('Your insights');
    for (const title of ['How you communicate', 'How you lead', 'Possible blind spots', 'Where to go from here']) expect(withInsights).toContain(title);
  });

  it('escapes everything user-supplied so a name can never inject markup or script', () => {
    const hostile = '<script>alert(1)</script><img src=x onerror=alert(2)>"\'&';
    const html = renderReportHtml(
      data({
        personName: hostile,
        traits: [{ trait: 'openness', score: 70, level_label: hostile, description: hostile }, ...data().traits.slice(1)],
        insights: validInsights({ personality: { summary: `${hostile} is a long enough summary string`, points: [hostile, hostile] } }),
      }),
    );
    // No real tag may appear: only the escaped, visible text.
    expect(html).not.toContain('<script>');
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toContain('"\'&'); // raw quote/apostrophe/ampersand never pass through
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(html).toContain('&quot;&#39;&amp;');
  });

  it('clamps bar widths so a bad score cannot break the layout', () => {
    const html = renderReportHtml(data({ traits: [{ trait: 'openness', score: 900, level_label: 'x', description: null }, { trait: 'extraversion', score: -40, level_label: 'x', description: null }] }));
    expect(html).toContain('width:100%');
    expect(html).toContain('width:0%');
    expect(html).not.toMatch(/width:900%|width:-40%/);
  });
});

describe('ReportsService', () => {
  const person = { id: 'u1', email: 'ada@example.com', first_name: 'Ada', last_name: 'Uzo' };
  const fullResult = {
    is_preview: false,
    assessment: { name: 'Full personality assessment', version: '1.0.0' },
    submission_number: 1,
    completed_at: new Date('2026-10-01T10:00:00Z'),
    traits: data().traits,
    insights: null,
    disclaimer: 'Not a diagnosis.',
  };

  function setup(over: { result?: any; pdf?: jest.Mock; mail?: string } = {}) {
    const assessments = { getResult: jest.fn().mockResolvedValue(over.result ?? fullResult) };
    const pdf = { render: over.pdf ?? jest.fn().mockResolvedValue(Buffer.from('%PDF-fake')) };
    const mail = { sendResults: jest.fn().mockResolvedValue(over.mail ?? 'sent') };
    const billing = { frontendUrl: 'https://app.example.com' };
    return { assessments, pdf, mail, service: new ReportsService(assessments as any, pdf as any, mail as any, billing as any) };
  }

  it('renders the PDF for the owner and names the file after the completion date', async () => {
    const { service, pdf, assessments } = setup();
    const out = await service.buildPdf(person, 'res-1');
    expect(assessments.getResult).toHaveBeenCalledWith('u1', 'res-1');
    expect(out.pdf.toString()).toBe('%PDF-fake');
    expect(out.filename).toBe('Ada-Uzo-personality-report-2026-10-01.pdf');
    expect(pdf.render.mock.calls[0][0]).toContain('Ada Uzo');
  });

  it('refuses a report for the free snapshot', async () => {
    const { service, pdf } = setup({ result: { ...fullResult, is_preview: true } });
    const error: any = await service.buildPdf(person, 'res-1').catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse().code).toBe('REPORT_NOT_AVAILABLE');
    expect(pdf.render).not.toHaveBeenCalled();
  });

  it('says 503 REPORT_UNAVAILABLE when there is no browser to render with', async () => {
    const { service } = setup({ pdf: jest.fn().mockRejectedValue(new PdfUnavailableError()) });
    const error: any = await service.buildPdf(person, 'res-1').catch((e) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse().code).toBe('REPORT_UNAVAILABLE');
  });

  it('emails the report with the PDF attached, linking to the online results', async () => {
    const { service, mail } = setup();
    const out = await service.emailReport(person, 'res-1');
    expect(out).toEqual({ status: 'sent', attached: true });
    expect(mail.sendResults).toHaveBeenCalledWith('ada@example.com', expect.objectContaining({ link: 'https://app.example.com/results/res-1', pdf: expect.any(Buffer) }));
  });

  it('still emails a link when the PDF cannot be made', async () => {
    const { service, mail } = setup({ pdf: jest.fn().mockRejectedValue(new PdfUnavailableError()) });
    const out = await service.emailReport(person, 'res-1');
    expect(out).toEqual({ status: 'sent', attached: false });
    expect(mail.sendResults.mock.calls[0][1].pdf).toBeUndefined();
  });

  it('reports honestly when email is not configured', async () => {
    const { service } = setup({ mail: 'not_configured' });
    expect(await service.emailReport(person, 'res-1')).toEqual({ status: 'not_configured', attached: true });
  });

  it('only ever sends to the signed-in person’s own address', async () => {
    const { service, mail } = setup();
    await service.emailReport(person, 'res-1');
    expect(mail.sendResults.mock.calls[0][0]).toBe('ada@example.com');
  });
});
