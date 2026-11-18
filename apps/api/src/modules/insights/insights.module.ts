import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClaudeClient } from "./claude.client";
import { InsightsController } from "./insights.controller";
import { InsightsService } from "./insights.service";

@Module({
  imports: [AuthModule],
  controllers: [InsightsController],
  providers: [InsightsService, ClaudeClient],
  exports: [InsightsService],
})
export class InsightsModule {}
