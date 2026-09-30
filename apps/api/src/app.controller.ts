import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get()
  root() {
    return {
      app: 'Personality Badge API',
      version: '0.1.0',
      status: 'running',
      endpoints: {
        health: '/health',
        auth: {
          signup: 'POST /auth/signup',
          login: 'POST /auth/login',
          refresh: 'POST /auth/refresh',
          logout: 'POST /auth/logout',
          profile: 'POST /auth/me',
        },
      },
    };
  }
}
