import { isAllowedOrigin, parseConfiguredOrigins } from './cors';

const dev = { configured: ['http://localhost:3000'], production: false };
const prod = { configured: ['https://app.example.com'], production: true };

describe('isAllowedOrigin', () => {
  describe('in development', () => {
    it.each([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://192.168.1.100:3000',
      'http://192.168.0.7:3000',
      'http://10.0.0.15:3000',
      'http://172.16.4.2:3000',
      'http://172.31.255.1:3000',
    ])('allows %s', (origin) => {
      expect(isAllowedOrigin(origin, dev)).toBe(true);
    });

    it.each([
      'https://evil.example.com',
      'http://192.168.1.100.evil.com',
      'http://evil.com/192.168.1.100',
      'http://172.32.0.1:3000', // just outside the private 172.16-31 range
      'http://172.15.0.1:3000',
      'http://8.8.8.8:3000',
      'ftp://192.168.1.100',
      'null',
    ])('rejects %s', (origin) => {
      expect(isAllowedOrigin(origin, dev)).toBe(false);
    });
  });

  describe('in production', () => {
    it('allows only the configured website', () => {
      expect(isAllowedOrigin('https://app.example.com', prod)).toBe(true);
    });

    it('rejects private-network addresses and everything else', () => {
      for (const origin of ['http://localhost:3000', 'http://192.168.1.100:3000', 'https://evil.example.com']) {
        expect(isAllowedOrigin(origin, prod)).toBe(false);
      }
    });
  });

  it('does not restrict requests that send no Origin header (curl, server-to-server)', () => {
    expect(isAllowedOrigin(undefined, prod)).toBe(true);
    expect(isAllowedOrigin(undefined, dev)).toBe(true);
  });
});

describe('parseConfiguredOrigins', () => {
  it('defaults to the local web app', () => {
    expect(parseConfiguredOrigins(undefined)).toEqual(['http://localhost:3000']);
    expect(parseConfiguredOrigins('  ')).toEqual(['http://localhost:3000']);
  });

  it('accepts several comma-separated origins and ignores trailing slashes and spaces', () => {
    expect(parseConfiguredOrigins('https://a.com/, https://b.com')).toEqual(['https://a.com', 'https://b.com']);
  });
});
