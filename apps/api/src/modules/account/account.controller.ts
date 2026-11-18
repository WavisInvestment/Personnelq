import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { AccountService } from './account.service';
import { ChangeEmailDto, ChangePasswordDto, DeleteAccountDto, UpdateProfileDto } from './dto/account.dto';

const HOURLY = (limit: number) => ({ default: { limit, ttl: 60 * 60 * 1000 } });

@Controller('account')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('manage:own_account')
export class AccountController {
  constructor(private service: AccountService) {}

  @Get()
  get(@Request() req: any) {
    return this.service.get(req.user.id);
  }

  @Patch()
  update(@Request() req: any, @Body() dto: UpdateProfileDto) {
    return this.service.updateProfile(req.user.id, dto);
  }

  @Post('password')
  @Throttle(HOURLY(10))
  @HttpCode(HttpStatus.OK)
  password(@Request() req: any, @Body() dto: ChangePasswordDto) {
    return this.service.changePassword(req.user.id, dto);
  }

  @Post('email')
  @Throttle(HOURLY(5))
  @HttpCode(HttpStatus.OK)
  email(@Request() req: any, @Body() dto: ChangeEmailDto) {
    return this.service.changeEmail(req.user.id, dto);
  }

  @Post('sign-out-everywhere')
  @HttpCode(HttpStatus.OK)
  signOutEverywhere(@Request() req: any) {
    return this.service.signOutEverywhere(req.user.id);
  }

  @Get('export')
  @Throttle(HOURLY(10))
  @Header('Cache-Control', 'private, no-store')
  export(@Request() req: any) {
    return this.service.exportData(req.user.id);
  }

  @Delete()
  @Throttle(HOURLY(5))
  @HttpCode(HttpStatus.OK)
  remove(@Request() req: any, @Body() dto: DeleteAccountDto) {
    return this.service.deleteAccount(req.user.id, dto.password);
  }
}
