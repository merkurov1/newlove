/** @jest-environment node */

import {
  buildGoogleConsentUrl,
  chooseGa4Property,
  chooseSearchConsoleSite,
  normalizeGa4AccountId,
  normalizeGa4PropertyId,
} from '../providers/oauth';

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
  it('requests offline access and only the two read-only scopes', () => {
    const url = new URL(buildGoogleConsentUrl({ state: 'signed-state' }));

    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('include_granted_scopes')).toBe('true');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://www.merkurov.love/api/auth/google-analytics/callback'
    );

    const scopes = (url.searchParams.get('scope') || '').split(' ');
    expect(scopes).toEqual([
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/webmasters.readonly',
    ]);
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
