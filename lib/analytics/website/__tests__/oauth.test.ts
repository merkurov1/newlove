/** @jest-environment node */

import {
  buildGoogleConsentUrl,
  chooseGa4Property,
  chooseSearchConsoleSite,
} from '../providers/oauth';

const previousEnv = { ...process.env };

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.merkurov.love';
  delete process.env.ANALYTICS_GOOGLE_REDIRECT_URI;
  delete process.env.ANALYTICS_GA4_PROPERTY_ID;
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
          accountName: 'Account',
          measurementIds: ['G-OTHER'],
        },
        {
          propertyId: '222',
          displayName: 'Merkurov',
          accountName: 'Account',
          measurementIds: ['G-J1F4ZTK9ND'],
        },
      ],
      {}
    );

    expect(property?.propertyId).toBe('222');
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
