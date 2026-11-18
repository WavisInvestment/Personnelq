import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { BillingConfigService } from "../../common/billing/billing-config.service";
import { MailOutcome, MailService } from "../../common/mail/mail.service";
import { AssessmentsService } from "../assessments/assessments.service";
import { downloadName } from "../../common/filename";
import { PdfService, PdfUnavailableError } from "./pdf.service";
import { ReportData, renderReportHtml } from "./report-template";

interface Person {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private assessments: AssessmentsService,
    private pdf: PdfService,
    private mail: MailService,
    private billing: BillingConfigService,
  ) {}

  private async data(person: Person, resultId: string): Promise<ReportData> {
    const result = await this.assessments.getResult(person.id, resultId); // 404 for anyone but the owner

    if (result.is_preview || result.kind === "custom") {
      throw new BadRequestException({
        statusCode: 400,
        message: "Reports are part of the full assessment.",
        code: "REPORT_NOT_AVAILABLE",
      });
    }

    return {
      personName: `${person.first_name} ${person.last_name}`.trim(),
      assessmentName: result.assessment.name,
      version: result.assessment.version,
      attempt: result.submission_number,
      completedAt: new Date(result.completed_at ?? Date.now()),
      generatedAt: new Date(),
      traits: result.traits.map((t) => ({
        trait: t.trait,
        score: t.score,
        level_label: t.level_label,
        description: t.description,
      })),
      insights: result.insights as ReportData['insights'],
      disclaimer: result.disclaimer,
    };
  }

  private async render(data: ReportData): Promise<Buffer> {
    try {
      return await this.pdf.render(renderReportHtml(data));
    } catch (err) {
      if (err instanceof PdfUnavailableError) {
        throw new HttpException(
          {
            statusCode: 503,
            message: "PDF reports aren’t available right now.",
            code: "REPORT_UNAVAILABLE",
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw new HttpException(
        {
          statusCode: 500,
          message: "We couldn’t create your report. Please try again.",
          code: "REPORT_FAILED",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async buildPdf(person: Person, resultId: string) {
    const data = await this.data(person, resultId);
    const pdf = await this.render(data);
    return {
      pdf,
      filename: downloadName(
        data.personName,
        "personality-report",
        "pdf",
        data.completedAt,
      ),
    };
  }

  /** Emails the report to the account's own address. Falls back to a link-only email if a PDF can't be made. */
  async emailReport(
    person: Person,
    resultId: string,
  ): Promise<{ status: MailOutcome; attached: boolean }> {
    const data = await this.data(person, resultId);

    let pdf: Buffer | undefined;
    try {
      pdf = await this.render(data);
    } catch {
      pdf = undefined;
    }

    const status = await this.mail.sendResults(person.email, {
      first_name: person.first_name,
      assessment: data.assessmentName,
      link: `${this.billing.frontendUrl}/results/${resultId}`,
      pdf,
      filename: downloadName(
        data.personName,
        "personality-report",
        "pdf",
        data.completedAt,
      ),
    });
    return { status, attached: !!pdf };
  }
}
