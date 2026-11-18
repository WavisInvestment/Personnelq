import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

// Not versioned: load balancers and Docker call this address.
@Controller({ version: VERSION_NEUTRAL })
export class AppController {
  @SkipThrottle()
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
