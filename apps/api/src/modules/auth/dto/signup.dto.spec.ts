import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SignupDto } from './signup.dto';

const base = {
  email: 'a@b.com',
  first_name: 'Ada',
  last_name: 'Obi',
  password: 'SecurePass123!',
  password_confirm: 'SecurePass123!',
};

const errorsFor = async (extra: object) => {
  const errors = await validate(plainToInstance(SignupDto, { ...base, ...extra }));
  return errors.map((e) => e.property);
};

describe('SignupDto account type', () => {
  it('defaults to an individual when no type is sent', async () => {
    const dto = plainToInstance(SignupDto, base);
    expect(dto.account_type).toBe('individual');
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts an individual without an organisation name', async () => {
    expect(await errorsFor({ account_type: 'individual' })).toEqual([]);
  });

  it.each(['corporate', 'school', 'church'])('accepts %s with an organisation name', async (type) => {
    expect(await errorsFor({ account_type: type, organization_name: 'Grace Chapel' })).toEqual([]);
  });

  it.each(['corporate', 'school', 'church'])('requires an organisation name for %s', async (type) => {
    expect(await errorsFor({ account_type: type })).toContain('organization_name');
    expect(await errorsFor({ account_type: type, organization_name: 'A' })).toContain('organization_name');
  });

  it('tells the user the name is required (not a length complaint) when it is missing', async () => {
    const errors = await validate(plainToInstance(SignupDto, { ...base, account_type: 'school' }));
    const messages = Object.values(errors.find((e) => e.property === 'organization_name')!.constraints!);
    expect(messages[0]).toBe('Organisation name is required');
  });

  it('rejects an organisation name longer than 100 characters', async () => {
    expect(await errorsFor({ account_type: 'school', organization_name: 'x'.repeat(101) })).toContain('organization_name');
  });

  it('rejects an unknown account type, including attempts to pick a privileged one', async () => {
    for (const type of ['admin', 'super_admin', 'professional', '']) {
      expect(await errorsFor({ account_type: type })).toContain('account_type');
    }
  });
});

describe('email addresses are one person whatever the capitals', () => {
  it('lower-cases and trims the email on sign-up, sign-in and password reset', async () => {
    const { LoginDto } = await import('./login.dto');
    const { ForgotPasswordDto } = await import('./forgot-password.dto');
    expect(plainToInstance(SignupDto, { ...base, email: '  Eve.Okafor@Acme.TEST ' }).email).toBe('eve.okafor@acme.test');
    expect(plainToInstance(LoginDto, { email: 'Eve@Acme.test', password: 'whatever12' }).email).toBe('eve@acme.test');
    expect(plainToInstance(ForgotPasswordDto, { email: 'EVE@ACME.TEST' }).email).toBe('eve@acme.test');
  });

  it('still rejects something that is not an email', async () => {
    expect(await errorsFor({ email: 'not an email' })).toContain('email');
  });
});
