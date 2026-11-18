import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { InsightsService } from "./insights.service";

@Controller("results")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions("read:own_results")
export class InsightsController {
  constructor(private service: InsightsService) {}

  // Each call may cost money, so this is limited tightly. Repeat calls for the same result are free: it is generated once.
  @Post(":id/insights")
  @Throttle({ default: { limit: 8, ttl: 60 * 60 * 1000 } })
  @HttpCode(HttpStatus.OK)
  generate(@Request() req: any, @Param("id") id: string) {
    return this.service.getOrGenerate(req.user.id, id);
  }
}
