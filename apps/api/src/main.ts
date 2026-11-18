import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';
import { isAllowedOrigin, parseConfiguredOrigins } from './common/cors';
import { productionProblems } from './common/startup-checks';

async function bootstrap() {
  // rawBody keeps the exact bytes of each request: Paystack webhook signatures are computed over them.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // A production server with a placeholder secret would let anyone sign in as anyone: refuse to start instead.
  if (process.env.NODE_ENV === 'production') {
    const problems = productionProblems(process.env);
    if (problems.length) {
      console.error(`Refusing to start in production:\n - ${problems.join('\n - ')}`);
      await app.close();
      process.exit(1);
    }
  }
  app.disable('x-powered-by');

  // Set TRUST_PROXY to the number of proxies in front of the API (e.g. 1 behind a load balancer)
  // so rate limiting sees real client IPs instead of the proxy's.
  const trustProxy = Number(process.env.TRUST_PROXY);
  if (trustProxy > 0) {
    app.set('trust proxy', trustProxy);
  }

  // Enable validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS: the configured website(s) always; in development also any private-network address, so the app
  // can be opened from a phone on the same Wi-Fi.
  const corsOptions = {
    configured: parseConfiguredOrigins(process.env.FRONTEND_URL),
    production: process.env.NODE_ENV === 'production',
  };
  app.enableCors({
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin, corsOptions)),
    credentials: true,
    // Lets the website read the PDF's file name from the download response.
    exposedHeaders: ['Content-Disposition', 'X-API-Version', 'Idempotent-Replayed', 'Retry-After'],
  });

  // Every route lives at /api/v1/... A breaking change ships as /api/v2 next to it, never by changing v1 (see docs/api-versioning.md).
  // Only the health check and the payment webhook are unversioned: other systems have their addresses saved.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use((req: { path: string }, res: { setHeader(k: string, v: string): void }, next: () => void) => {
    const version = /^\/api\/v(\d+)\//.exec(req.path)?.[1];
    if (version) res.setHeader('X-API-Version', version);
    next();
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Personnelq API running on http://localhost:${port}/api/v1`);
}

bootstrap();
