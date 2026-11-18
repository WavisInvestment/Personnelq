import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import puppeteer, { Browser } from 'puppeteer';

export class PdfUnavailableError extends Error {
  constructor(message = 'No browser is available to render PDFs') {
    super(message);
    this.name = 'PdfUnavailableError';
  }
}

const CANDIDATE_BROWSERS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const MAX_CONCURRENT_PAGES = 2;
const RENDER_TIMEOUT_MS = 30_000;

@Injectable()
export class PdfService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfService.name);
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private active = 0;
  private waiting: (() => void)[] = [];

  constructor(private config: ConfigService) {}

  /** Set PUPPETEER_EXECUTABLE_PATH in production (e.g. /usr/bin/chromium). In development a local Chrome or Edge is found. */
  private browserPath(): string | undefined {
    const configured = this.config.get<string>('PUPPETEER_EXECUTABLE_PATH');
    if (configured) return existsSync(configured) ? configured : undefined;
    return CANDIDATE_BROWSERS.find((p) => existsSync(p));
  }

  isAvailable() {
    return this.browserPath() !== undefined;
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    if (this.launching) return this.launching;

    const executablePath = this.browserPath();
    if (!executablePath) throw new PdfUnavailableError();

    this.launching = puppeteer
      .launch({
        executablePath,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--font-render-hinting=none'],
      })
      .then((browser) => {
        this.browser = browser;
        browser.on('disconnected', () => {
          this.browser = null;
        });
        return browser;
      })
      .catch((err) => {
        throw new PdfUnavailableError(`Could not start the PDF browser: ${(err as Error).message}`);
      })
      .finally(() => {
        this.launching = null;
      });

    return this.launching;
  }

  private async acquire() {
    if (this.active < MAX_CONCURRENT_PAGES) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
  }

  private release() {
    this.active--;
    this.waiting.shift()?.();
  }

  /** Renders trusted, already-escaped HTML to an A4 PDF. */
  async render(html: string): Promise<Buffer> {
    await this.acquire();
    let page: Awaited<ReturnType<Browser['newPage']>> | null = null;
    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();

      // The report is self-contained. Lock the page down so nothing in it can run code or fetch anything.
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = request.url();
        if (url.startsWith('data:') || url === 'about:blank') void request.continue();
        else void request.abort();
      });

      await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate:
          '<div style="width:100%;font-size:8px;color:#8a857b;padding:0 15mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif"><span>Personnelq</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
        margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' },
        timeout: RENDER_TIMEOUT_MS,
      });
      return Buffer.from(pdf);
    } catch (err) {
      if (err instanceof PdfUnavailableError) throw err;
      this.logger.error(`PDF rendering failed: ${(err as Error).message}`);
      throw err;
    } finally {
      await page?.close().catch(() => undefined);
      this.release();
    }
  }

  async onModuleDestroy() {
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
  }
}
