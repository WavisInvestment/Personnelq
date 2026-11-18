import { ValidationPipe } from '@nestjs/common';
import { RefreshTokenDto } from './dto/auth-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

// The same pipe main.ts installs. A body class with no validation decorators is rejected outright by it
// ("property x should not exist"), which once made every token refresh and sign-out fail silently.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const body = (metatype: any, value: unknown) => pipe.transform(value, { type: 'body', metatype });

describe('auth request bodies', () => {
  it('accepts a refresh token', async () => {
    await expect(body(RefreshTokenDto, { refresh_token: 'abc123' })).resolves.toMatchObject({ refresh_token: 'abc123' });
  });

  it('refuses a missing, empty or oversized refresh token, and extra fields', async () => {
    await expect(body(RefreshTokenDto, {})).rejects.toThrow();
    await expect(body(RefreshTokenDto, { refresh_token: '' })).rejects.toThrow();
    await expect(body(RefreshTokenDto, { refresh_token: 'x'.repeat(300) })).rejects.toThrow();
    await expect(body(RefreshTokenDto, { refresh_token: 'abc', extra: 1 })).rejects.toThrow();
  });

  it('accepts only a 64-character hex confirmation token', async () => {
    await expect(body(VerifyEmailDto, { token: 'a'.repeat(64) })).resolves.toBeDefined();
    await expect(body(VerifyEmailDto, { token: 'nope' })).rejects.toThrow();
    await expect(body(VerifyEmailDto, { token: 'G'.repeat(64) })).rejects.toThrow();
  });
});
