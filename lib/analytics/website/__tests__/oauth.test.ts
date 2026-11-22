/** @jest-environment node */

import {
  buildGoogleConsentUrl,
  buildYouTubeManagementConsentUrl,
  chooseGa4Property,
  chooseSearchConsoleSite,
  normalizeGa4AccountId,
  normalizeGa4PropertyId,
} from '../providers/oauth';
import { YOUTUBE_MANAGEMENT_CONSENT_SCOPES, YOUTUBE_MANAGEMENT_SCOPES } from '../config';

const previousEnv = { ...process.env };

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.merkurov.love';
  delete process.env.ANALYTICS_GOOGLE_REDIRECT_URI;
  delete process.env.ANALYTICS_GA4_PROPERTY_ID;
  delete process.env.ANALYTICS_GA4_ACCOUNT_ID;
  delete process.env.ANALYTICS_GSC_SITE_URL;
});

afterAll(() => {
  process.env = previousEnv;
});

describe('Google consent configuration', () => {
  it('requests offline access and only read-only website and YouTube scopes', () => {
    const url = new URL(buildGoogleConsentUrl({ state: 'signed-state' }));

    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent select_account');
    expect(url.searchParams.get('include_granted_scopes')).toBe('true');
    // The site-login email must not be forced: it would preselect the account
    // and hide the chooser needed for a separate UNFRAMED Google account.
    expect(url.searchParams.get('login_hint')).toBeNull();
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://www.merkurov.love/api/auth/google-analytics/callback'
    );

    const scopes = (url.searchParams.get('scope') || '').split(' ');
    expect(scopes).toEqual([
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/webmasters.readonly',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
    ]);
    expect(scopes.some((scope) => /monetary/i.test(scope))).toBe(false);
  });

  it('only sends login_hint when the owner explicitly chooses an account', () => {
    const explicit = new URL(
      buildGoogleConsentUrl({ state: 'signed-state', loginHint: 'unframed@example.com' })
    );

    expect(explicit.searchParams.get('login_hint')).toBe('unframed@example.com');
    expect(explicit.searchParams.get('prompt')).toContain('select_account');
  });

  it('builds a separate least-privilege management consent with a distinct callback', () => {
    const url = new URL(
      buildYouTubeManagementConsentUrl({
        state: 'signed-state',
        scopes: YOUTUBE_MANAGEMENT_CONSENT_SCOPES,
      })
    );

    expect(url.searchParams.get('prompt')).toBe('consent select_account');
    expect(url.searchParams.get('include_granted_scopes')).toBe('true');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://www.merkurov.love/api/auth/youtube-management/callback'
    );
    expect(url.searchParams.get('login_hint')).toBeNull();

    const scopes = (url.searchParams.get('scope') || '').split(' ');
    expect(scopes).toEqual(expect.arrayContaining([...YOUTUBE_MANAGEMENT_SCOPES]));
    expect(scopes).toContain('openid');
    expect(scopes).toContain('email');
    expect(scopes).toContain('https://www.googleapis.com/auth/youtube.readonly');
    // Analytics stays incremental; the management flow never broadens it.
    expect(scopes).not.toContain('https://www.googleapis.com/auth/yt-analytics.readonly');
    expect(scopes).not.toContain('https://www.googleapis.com/auth/analytics.readonly');
    expect(scopes).not.toContain('https://www.googleapis.com/auth/webmasters.readonly');
  });

  it('selects the property whose web stream matches the measurement id', () => {
    const property = chooseGa4Property(
      [
        {
          propertyId: '111',
          displayName: 'Other',
          accountId: '176791840',
          accountName: 'Account',
          propertyType: 'GA4',
          measurementIds: ['G-OTHER'],
        },
        {
          propertyId: '222',
          displayName: 'Merkurov',
          accountId: '176791840',
          accountName: 'Account',
          propertyType: 'GA4',
          measurementIds: ['G-J1F4ZTK9ND'],
        },
      ],
      {}
    );

    expect(property?.propertyId).toBe('222');
  });

  it('keeps Account ID, Property ID and Measurement ID separate', () => {
    const properties = [
      {
        propertyId: '244838264',
        displayName: 'Merkurov',
        accountId: '176791840',
        accountName: 'Merkurov',
        propertyType: 'GA4',
        measurementIds: ['G-J1F4ZTK9ND'],
      },
    ];

    expect(normalizeGa4AccountId('accounts/176791840')).toBe('176791840');
    expect(normalizeGa4PropertyId('properties/244838264')).toBe('244838264');
    expect(chooseGa4Property(properties, { accountId: '176791840' })?.propertyId).toBe('244838264');

    // The account id must not be accepted as a property id.
    expect(chooseGa4Property(properties, { override: '176791840' })).toBeNull();
    expect(chooseGa4Property(properties, { accountId: '999' })).toBeNull();
  });

  it('does not accept an override when its web stream lacks the expected measurement id', () => {
    const properties = [
      {
        propertyId: '244838264',
        displayName: 'Merkurov',
        accountId: '176791840',
        accountName: 'Merkurov',
        propertyType: 'GA4',
        measurementIds: ['G-OTHER'],
      },
    ];

    expect(chooseGa4Property(properties, { override: '244838264' })).toBeNull();
  });

  it('selects the Search Console property for the site host', () => {
    const site = chooseSearchConsoleSite(
      [
        { siteUrl: 'https://example.com/', permissionLevel: 'siteOwner' },
        { siteUrl: 'sc-domain:merkurov.love', permissionLevel: 'siteOwner' },
      ],
      {}
    );

    expect(site?.siteUrl).toBe('sc-domain:merkurov.love');
  });
});
