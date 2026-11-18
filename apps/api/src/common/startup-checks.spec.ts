import { productionProblems } from './startup-checks';

const good = {
  JWT_SECRET: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718',
  JWT_REFRESH_SECRET: '0f9e8d7c6b5a49382716a5b4c3d2e1f00f9e8d7c6b5a4938',
  DATABASE_URL: 'postgresql://u:p@db:5432/x',
  FRONTEND_URL: 'https://app.example.org',
};

describe('productionProblems', () => {
  it('accepts a sound configuration', () => {
    expect(productionProblems(good)).toEqual([]);
  });

  it('refuses missing, short, example and identical secrets', () => {
    expect(productionProblems({ ...good, JWT_SECRET: undefined })).toContain('JWT_SECRET is not set.');
    expect(productionProblems({ ...good, JWT_SECRET: 'short' }).join()).toMatch(/too short/);
    expect(productionProblems({ ...good, JWT_REFRESH_SECRET: 'your-256-bit-refresh-secret-change-in-production' }).join()).toMatch(/example value/);
    expect(productionProblems({ ...good, JWT_REFRESH_SECRET: good.JWT_SECRET }).join()).toMatch(/must be different/);
  });

  it('wants a database and an https website address', () => {
    expect(productionProblems({ ...good, DATABASE_URL: '' }).join()).toMatch(/DATABASE_URL/);
    expect(productionProblems({ ...good, FRONTEND_URL: undefined }).join()).toMatch(/FRONTEND_URL is not set/);
    expect(productionProblems({ ...good, FRONTEND_URL: 'http://app.example.org' }).join()).toMatch(/https/);
  });

  it('only complains about the seed password when one is set and weak', () => {
    expect(productionProblems({ ...good, SEED_ADMIN_PASSWORD: undefined })).toEqual([]);
    expect(productionProblems({ ...good, SEED_ADMIN_PASSWORD: 'Admin123!' }).join()).toMatch(/SEED_ADMIN_PASSWORD/);
    expect(productionProblems({ ...good, SEED_ADMIN_PASSWORD: 'k9Vq2xLm8ZrT4wYb7Nc' })).toEqual([]);
  });
});
