import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { AssessmentsModule } from './modules/assessments/assessments.module';
import { PrismaModule } from './database/prisma.module';
import { RbacModule } from './common/rbac/rbac.module';
import { MailModule } from './common/mail/mail.module';
import { BillingModule } from './common/billing/billing.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { InsightsModule } from './modules/insights/insights.module';
import { ReportsModule } from './modules/reports/reports.module';
import { BadgesModule } from './modules/badges/badges.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { CustomAssessmentsModule } from './modules/custom-assessments/custom-assessments.module';
import { AccountModule } from './modules/account/account.module';
import { JobsModule } from './common/jobs/jobs.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env.local',
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: Number(config.get('THROTTLE_TTL_MS')) || 60_000,
            limit: Number(config.get('THROTTLE_LIMIT')) || 100,
          },
        ],
        errorMessage: 'Too many requests. Please wait a moment and try again.',
      }),
    }),
    PrismaModule,
    RbacModule,
    MailModule,
    BillingModule,
    AuthModule,
    AdminModule,
    AssessmentsModule,
    PaymentsModule,
    InsightsModule,
    ReportsModule,
    BadgesModule,
    OrganizationsModule,
    AnalyticsModule,
    CustomAssessmentsModule,
    AccountModule,
    JobsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
