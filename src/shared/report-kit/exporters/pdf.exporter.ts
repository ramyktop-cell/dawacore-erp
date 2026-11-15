import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  ServiceUnavailableException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { ReportMeta } from '../interfaces/report-meta.interface';
import { PdfSection, PdfTableColumn } from '../interfaces/pdf-section.interface';

export interface PdfRenderOptions {
  landscape?: boolean;
  format?: 'A4' | 'A3' | 'Letter';
}

/**
 * PdfExporter
 * ───────────
 * يُحوّل بيانات التقرير (meta + sections) إلى ملف PDF.
 *
 * الميزات الأمنية والأداء:
 *   🚀 Browser Singleton — Chromium instance واحدة لكل السيرفر
 *   🔤 Cairo Font مضمّن كـ Base64 — لا requests خارجية
 *   🛡️ حماية من استنزاف الذاكرة (MAX_CONCURRENT = 5)
 *   🔒 Request interception — يمنع أي طلب شبكي خارجي
 *   ⏱️ Timeouts لتفادي الطلبات المعلّقة
 */
@Injectable()
export class PdfExporter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PdfExporter.name);

  // ─── Browser Singleton
  private browser: puppeteer.Browser | null = null;
  private initPromise: Promise<void> | null = null;

  // ─── Concurrency Guard
  private activeRequests = 0;
  private readonly MAX_CONCURRENT = 5;
  private readonly PAGE_TIMEOUT_MS = 30_000;

  // ─── Font & Template (loaded once)
  private cairoFontBase64 = '';
  private template?: Handlebars.TemplateDelegate;

  // ─────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    this.loadFont();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
        this.logger.log('🛑 Puppeteer browser closed');
      } catch (error) {
        this.logger.warn(`Failed to close browser: ${(error as Error).message}`);
      } finally {
        this.browser = null;
      }
    }
  }

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  async render(
    meta: ReportMeta,
    sections: PdfSection[],
    options: PdfRenderOptions = {},
  ): Promise<Buffer> {
    if (this.activeRequests >= this.MAX_CONCURRENT) {
      this.logger.warn(
        `⚠️  PDF export rejected — ${this.activeRequests} active requests`,
      );
      throw new ServiceUnavailableException(
        'خدمة التصدير مشغولة حالياً، الرجاء المحاولة بعد لحظات',
      );
    }

    await this.ensureBrowser();
    this.activeRequests++;

    const start = Date.now();
    try {
      const html = this.buildHtml(meta, sections);
      const pdf = await this.htmlToPdf(html, options);
      this.logger.log(
        `✅ PDF generated in ${Date.now() - start}ms (${(pdf.length / 1024).toFixed(0)}KB)`,
      );
      return pdf;
    } catch (error) {
      this.logger.error(
        `❌ PDF generation failed — ${Date.now() - start}ms`,
        error instanceof Error ? error.stack : String(error),
      );
      if (error instanceof ServiceUnavailableException) throw error;
      throw new InternalServerErrorException('فشل إنشاء ملف PDF');
    } finally {
      this.activeRequests--;
    }
  }

  // ─────────────────────────────────────────────
  // Browser Management
  // ─────────────────────────────────────────────

  private async ensureBrowser(): Promise<void> {
    if (this.browser?.connected) return;
    if (this.initPromise) return this.initPromise;

    const systemChrome = [
      process.env.CHROME_BIN,
      process.env.PUPPETEER_EXECUTABLE_PATH,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
    ].find((p) => p && fs.existsSync(p));

    this.initPromise = (async () => {
      this.browser = await puppeteer.launch({
        headless: true,
        executablePath: systemChrome || undefined,
        timeout: 15000,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--font-render-hinting=none',
        ],
      });

      this.browser.on('disconnected', () => {
        this.logger.warn('⚠️  Puppeteer disconnected — will reinit on next request');
        this.browser = null;
      });

      this.logger.log(`🚀 Puppeteer browser launched${systemChrome ? ` using ${path.basename(systemChrome)}` : ''}`);
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  // ─────────────────────────────────────────────
  // Font Loading
  // ─────────────────────────────────────────────

  private loadFont(): void {
    const fontPath = path.join(__dirname, '..', 'assets', 'fonts', 'Cairo.ttf');

    if (!fs.existsSync(fontPath)) {
      this.logger.error(`❌ Cairo font not found at ${fontPath}`);
      this.logger.error('⚠️  PDFs will use fallback font. Run: npm run fonts:download');
      return;
    }

    try {
      this.cairoFontBase64 = fs.readFileSync(fontPath).toString('base64');
      this.logger.log(
        `✅ Cairo font loaded (${(this.cairoFontBase64.length / 1024).toFixed(0)}KB)`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to load font: ${(error as Error).message}`,
      );
    }
  }

  // ─────────────────────────────────────────────
  // HTML Building
  // ─────────────────────────────────────────────

  private buildHtml(meta: ReportMeta, sections: PdfSection[]): string {
    if (!this.template) {
      this.registerHelpers();
      this.template = Handlebars.compile(BASE_TEMPLATE);
    }

    return this.template({
      meta: {
        ...meta,
        generatedAt: this.formatDate(meta.generatedAt),
      },
      sections,
      cairoFontBase64: this.cairoFontBase64,
    });
  }

  private registerHelpers(): void {
    Handlebars.registerHelper('formatNumber', (v: unknown) => {
      if (typeof v !== 'number') return v;
      return v.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    });

    Handlebars.registerHelper(
      'formatCell',
      (value: unknown, format?: string) => {
        if (value === null || value === undefined || value === '') return '—';

        if (format === 'currency' || format === 'number') {
          if (typeof value === 'number') {
            return value.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
          }
        }
        return value;
      },
    );

    Handlebars.registerHelper('hasTotals', (totals: unknown) => {
      return totals && typeof totals === 'object' && Object.keys(totals).length > 0;
    });
  }

  // ─────────────────────────────────────────────
  // HTML → PDF
  // ─────────────────────────────────────────────

  private async htmlToPdf(
    html: string,
    options: PdfRenderOptions = {},
  ): Promise<Buffer> {
    if (!this.browser) {
      throw new InternalServerErrorException('Browser not available');
    }

    const page = await this.browser.newPage();

    try {
      page.setDefaultTimeout(this.PAGE_TIMEOUT_MS);
      page.setDefaultNavigationTimeout(this.PAGE_TIMEOUT_MS);

      // 🔒 منع أي requests خارجية (أمان + سرعة)
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const url = req.url();
        if (url.startsWith('data:') || url.startsWith('about:')) {
          req.continue();
        } else {
          req.abort();
        }
      });

      await page.setContent(html, {
        waitUntil: 'domcontentloaded',
        timeout: this.PAGE_TIMEOUT_MS,
      });

      // ✅ هوامش أضيق في landscape (مساحة أكبر للأعمدة)
      const margins = options.landscape
        ? { top: '15mm', right: '10mm', bottom: '15mm', left: '10mm' }
        : { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' };

      const pdf = await page.pdf({
        format: options.format ?? 'A4',
        landscape: options.landscape ?? false,
        printBackground: true,
        margin: margins,
      });

      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  // ─────────────────────────────────────────────
  // Date Formatting
  // ─────────────────────────────────────────────

  private formatDate(date: Date): string {
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }
}

// ─────────────────────────────────────────────────────────────────────
// HTML Template
// ─────────────────────────────────────────────────────────────────────

const BASE_TEMPLATE = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8" />
<style>
  @font-face {
    font-family: 'Cairo';
    src: url('data:font/truetype;base64,{{cairoFontBase64}}') format('truetype');
    font-weight: 400 900;
    font-display: block;
  }

  * { box-sizing: border-box; }

  body {
    font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
    color: #1f2937;
    font-size: 12px;
    margin: 0;
    padding: 0;
    direction: rtl;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #0f766e;
    padding-bottom: 12px;
    margin-bottom: 20px;
  }
  .header h1 { font-size: 20px; margin: 0 0 6px 0; color: #0f766e; }
  .header .subtitle { font-size: 11px; color: #6b7280; }
  .header .meta-info { text-align: left; font-size: 11px; color: #374151; }
  .header .meta-info div { margin-bottom: 2px; }

  .section { margin-bottom: 24px; page-break-inside: avoid; }
  .section h2 {
    font-size: 14px;
    color: #0f766e;
    border-right: 4px solid #0f766e;
    padding-right: 8px;
    margin: 0 0 12px 0;
  }
  .section h3 { font-size: 12px; margin: 8px 0; color: #374151; }

  .kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 16px;
  }
  .kpi {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 10px;
    background: #f9fafb;
  }
  .kpi .label { font-size: 10px; color: #6b7280; margin-bottom: 4px; }
  .kpi .value { font-size: 16px; font-weight: bold; color: #111827; }
  .kpi .hint { font-size: 9px; color: #9ca3af; margin-top: 2px; }
  .kpi.success .value { color: #059669; }
  .kpi.danger .value { color: #dc2626; }
  .kpi.warning .value { color: #d97706; }
  .kpi.info .value { color: #2563eb; }
  .kpi.primary .value { color: #0f766e; }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    margin-bottom: 12px;
  }
  table th {
    background: #0f766e;
    color: white;
    padding: 6px 8px;
    text-align: right;
    font-weight: 600;
  }
  table td {
    padding: 5px 8px;
    border-bottom: 1px solid #e5e7eb;
  }
  table tr:nth-child(even) td { background: #f9fafb; }
  table tr.total-row td {
    font-weight: bold;
    background: #ecfdf5;
    border-top: 2px solid #0f766e;
    color: #0f766e;
  }

  .note {
    font-size: 10px;
    color: #92400e;
    background: #fef3c7;
    border-right: 3px solid #d97706;
    padding: 8px 10px;
    border-radius: 4px;
    margin-top: 8px;
  }

  .footer {
    margin-top: 30px;
    border-top: 1px solid #e5e7eb;
    padding-top: 8px;
    font-size: 9px;
    color: #9ca3af;
    text-align: center;
  }
</style>
</head>
<body>

<div class="header">
  <div style="display: flex; align-items: center; gap: 14px;">
    {{#if meta.companyLogo}}
      <img src="{{meta.companyLogo}}" alt="Logo" style="height: 48px; max-width: 130px; object-fit: contain; border-radius: 6px;" />
    {{/if}}
    <div>
      <h1 style="margin: 0 0 4px 0;">{{meta.title}}</h1>
      <div class="subtitle">
        {{meta.companyName}}{{#if meta.branchName}} — {{meta.branchName}}{{/if}}
      </div>
    </div>
  </div>
  <div class="meta-info">
    <div><strong>الفترة:</strong> {{meta.fromDate}} إلى {{meta.toDate}}</div>
    <div><strong>تم الإنشاء:</strong> {{meta.generatedAt}}</div>
    <div><strong>بواسطة:</strong> {{meta.generatedBy.name}}</div>
  </div>
</div>

{{#each sections}}
  <div class="section">
    {{#if heading}}<h2>{{heading}}</h2>{{/if}}

    {{#if kpis}}
      <div class="kpis">
        {{#each kpis}}
          <div class="kpi {{color}}">
            <div class="label">{{label}}</div>
            <div class="value">{{value}}</div>
            {{#if hint}}<div class="hint">{{hint}}</div>{{/if}}
          </div>
        {{/each}}
      </div>
    {{/if}}

    {{#if tables}}
      {{#each tables}}
        {{#if title}}<h3>{{title}}</h3>{{/if}}
        <table>
          <thead>
            <tr>
              {{#each columns}}
                <th style="text-align: {{align}}">{{label}}</th>
              {{/each}}
            </tr>
          </thead>
          <tbody>
            {{#each rows}}
              <tr>
                {{#each ../columns}}
                  <td style="text-align: {{align}}">{{formatCell (lookup .. key) format}}</td>
                {{/each}}
              </tr>
            {{/each}}
            {{#if totals}}
              <tr class="total-row">
                {{#each columns}}
                  <td style="text-align: {{align}}">
                    {{#if @first}}
                      الإجمالي
                    {{else}}
                      {{#if (lookup ../totals key)}}{{formatNumber (lookup ../totals key)}}{{/if}}
                    {{/if}}
                  </td>
                {{/each}}
              </tr>
            {{/if}}
          </tbody>
        </table>
      {{/each}}
    {{/if}}

    {{#if note}}<div class="note">{{note}}</div>{{/if}}
  </div>
{{/each}}

<div class="footer">
  تم إنشاء هذا التقرير آلياً بواسطة {{#if meta.companyName}}{{meta.companyName}} — {{/if}}MadarCore ERP — {{meta.generatedAt}}
</div>

</body>
</html>
`;
