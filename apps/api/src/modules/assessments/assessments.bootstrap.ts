import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { seedCoreAssessments } from './catalog/core-assessments';

@Injectable()
export class AssessmentsBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(AssessmentsBootstrap.name);

  constructor(private prisma: PrismaService) {}

  // Makes sure the official assessments exist after a deploy. It only ever creates; it never edits.
  async onApplicationBootstrap() {
    try {
      const { created, existing, mismatched } = await seedCoreAssessments(this.prisma);
      if (created.length) this.logger.log(`Created official assessments: ${created.join(', ')}`);
      this.logger.log(`Official assessments ready (${existing.length + created.length})`);
      if (mismatched.length) {
        this.logger.warn(`Stored questions differ from the catalogue for: ${mismatched.join(', ')}. Publish a new version instead of editing.`);
      }
    } catch (err) {
      this.logger.error('Could not prepare the official assessments', err as Error);
    }
  }
}
