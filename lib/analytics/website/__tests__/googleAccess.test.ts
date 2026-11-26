/** @jest-environment node */

import {
  EXPECTED_GA4_PROPERTY_ID,
  EXPECTED_GSC_PROPERTY,
  GA4_MINIMUM_ROLE,
  GSC_MINIMUM_ROLE,
  buildGoogleAccessGuidance,
  googleAccountEmailFromMeta,
  redactGoogleSecrets,
} from '../googleAccess';

const TOKEN_LIKE = /ya29\.|refresh_token|client_secret|access_token/i;

describe('Google access guidance', () => {
  it('explains a revoked grant as a reconnect action, not a permission grant', () => {
    const guidance = buildGoogleAccessGuidance({
      provider: 'google_analytics',
      errorCode: 'invalid_grant',
      googleAccountEmail: 'owner@example.com',
      ga4PropertyId: EXPECTED_GA4_PROPERTY_ID,
    });

    expect(guidance.reconnectRequired).toBe(true);
    expect(guidance.retryable).toBe(false);
    expect(guidance.accountChangeRequired).toBe(false);
    expect(guidance.reason).toContain('refresh token');
    expect(guidance.ownerAction).toContain('Переподключить');
    expect(guidance.ownerAction).toContain('owner@example.com');
    expect(`${guidance.reason} ${guidance.ownerAction}`).not.toMatch(TOKEN_LIKE);
  });

  it('names the GA4 property, connected account and minimum Viewer role', () => {
    const guidance = buildGoogleAccessGuidance({
      provider: 'google_analytics',
      errorCode: 'insufficient_permissions',
      googleAccountEmail: 'owner@example.com',
      ga4PropertyId: EXPECTED_GA4_PROPERTY_ID,
      requiredScopeGranted: true,
    });

    expect(guidance.resourceKind).toBe('ga4_property');
    expect(guidance.resource).toBe(EXPECTED_GA4_PROPERTY_ID);
    expect(guidance.minimumRole).toBe(GA4_MINIMUM_ROLE);
    expect(guidance.reconnectRequired).toBe(false);
    expect(guidance.retryable).toBe(true);
    expect(guidance.ownerAction).toContain(EXPECTED_GA4_PROPERTY_ID);
    expect(guidance.ownerAction).toContain('Viewer');
    expect(guidance.ownerAction).toContain('owner@example.com');
    expect(guidance.ownerAction).toContain('Повторить синхронизацию');
    expect(`${guidance.reason} ${guidance.ownerAction}`).not.toMatch(TOKEN_LIKE);
  });

  it('names the Search Console property and Full user/Owner requirement', () => {
    const guidance = buildGoogleAccessGuidance({
      provider: 'search_console',
      errorCode: 'insufficient_permissions',
      googleAccountEmail: 'owner@example.com',
      gscProperty: EXPECTED_GSC_PROPERTY,
      requiredScopeGranted: true,
    });

    expect(guidance.resourceKind).toBe('search_console_property');
    expect(guidance.resource).toBe(EXPECTED_GSC_PROPERTY);
    expect(guidance.minimumRole).toBe(GSC_MINIMUM_ROLE);
    expect(guidance.ownerAction).toContain(EXPECTED_GSC_PROPERTY);
    expect(guidance.ownerAction).toContain('Full user');
    expect(guidance.ownerAction).toContain('Owner');
    expect(guidance.ownerAction).toContain('Повторить синхронизацию');
    expect(`${guidance.reason} ${guidance.ownerAction}`).not.toMatch(TOKEN_LIKE);
  });

  it('asks for a reconnect when the stored grant lacks the required scope', () => {
    const guidance = buildGoogleAccessGuidance({
      provider: 'search_console',
      errorCode: 'insufficient_permissions',
      lastErrorMessage: 'The stored Google grant does not include the webmasters.readonly scope.',
      requiredScopeGranted: false,
    });

    expect(guidance.reconnectRequired).toBe(true);
    expect(guidance.retryable).toBe(false);
    expect(guidance.reason).toContain('webmasters.readonly');
    expect(guidance.ownerAction).toContain('Переподключить');
  });

  it('stops and asks the owner to choose the correct Google account', () => {
    const guidance = buildGoogleAccessGuidance({
      provider: 'google_analytics',
      errorCode: 'account_mismatch',
      googleAccountEmail: 'wrong@example.com',
      ga4PropertyId: EXPECTED_GA4_PROPERTY_ID,
    });

    expect(guidance.accountChangeRequired).toBe(true);
    expect(guidance.reconnectRequired).toBe(true);
    expect(guidance.ownerAction).toContain('Не выдавайте права автоматически');
    expect(guidance.ownerAction).toContain('остановитесь');
  });

  it('redacts accidental credentials from display strings', () => {
    expect(
      redactGoogleSecrets(
        'failed with access_token=ya29.secret&refresh_token=1//refresh and Bearer abc.def'
      )
    ).toBe('failed with access_token=[redacted]&refresh_token=[redacted] and Bearer [redacted]');
    expect(redactGoogleSecrets(null)).toBeNull();
  });

  it('reads identity only from explicit display metadata', () => {
    expect(googleAccountEmailFromMeta({ google_account_email: 'owner@example.com' })).toBe(
      'owner@example.com'
    );
    expect(googleAccountEmailFromMeta({ google_account: { email: 'nested@example.com' } })).toBe(
      'nested@example.com'
    );
    expect(googleAccountEmailFromMeta({ token_ciphertext: 'secret' })).toBeNull();
    expect(googleAccountEmailFromMeta(null)).toBeNull();
  });
});
