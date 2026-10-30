/**
 * @jest-environment node
 */

import { signUnframedToken, verifyUnframedToken } from '../access';

const ORIGINAL_SECRET = process.env.NEXT_JWT_SECRET;
const ORIGINAL_NEXTAUTH = process.env.NEXTAUTH_SECRET;

beforeEach(() => {
  process.env.NEXT_JWT_SECRET = 'x'.repeat(48);
  delete process.env.NEXTAUTH_SECRET;
});

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.NEXT_JWT_SECRET;
  else process.env.NEXT_JWT_SECRET = ORIGINAL_SECRET;

  if (ORIGINAL_NEXTAUTH === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = ORIGINAL_NEXTAUTH;
});

describe('UNFRAMED access tokens', () => {
  it('round-trips each scope', () => {
    const access = signUnframedToken('access', 3600);
    const admin = signUnframedToken('admin', 3600);

    expect(access).toBeTruthy();
    expect(admin).toBeTruthy();
    expect(verifyUnframedToken(access, 'access')).toBe(true);
    expect(verifyUnframedToken(admin, 'admin')).toBe(true);
  });

  it('does not accept a token from a different scope', () => {
    const access = signUnframedToken('access', 3600) as string;

    expect(verifyUnframedToken(access, 'admin')).toBe(false);
  });

  it('rejects the legacy plain "true" cookie', () => {
    expect(verifyUnframedToken('true', 'access')).toBe(false);
    expect(verifyUnframedToken(undefined, 'access')).toBe(false);
  });

  it('rejects tampered signatures and expired tokens', () => {
    const token = signUnframedToken('access', 3600) as string;
    const tampered = `${token.slice(0, -2)}aa`;

    expect(verifyUnframedToken(tampered, 'access')).toBe(false);

    const now = Date.now();
    const expired = signUnframedToken('access', -1) as string;

    expect(verifyUnframedToken(expired, 'access', now)).toBe(false);
  });

  it('refuses to sign when no strong secret is configured', () => {
    delete process.env.NEXT_JWT_SECRET;
    delete process.env.NEXTAUTH_SECRET;

    expect(signUnframedToken('access', 3600)).toBeNull();
  });
});
