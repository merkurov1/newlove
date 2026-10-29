/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type MockFn = {
  mock: { calls: unknown[][] };
  mockResolvedValue: (value: unknown) => void;
  mockRejectedValue: (error: unknown) => void;
};

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(() => null),
  getClientIp: jest.fn(() => 'test-client'),
}));

jest.mock('@/lib/serverAuth', () => ({
  getServerSupabaseClient: jest.fn(() => ({ mocked: true })),
}));

jest.mock('@/lib/pierrot/serviceInquiryStore', () => ({
  getServiceLeadSummaryById: jest.fn(),
  getServiceLeadForContact: jest.fn(),
  saveServiceLeadContact: jest.fn(),
  recordServiceInquiryEvent: jest.fn(),
}));

jest.mock('@/lib/advising/notifyServiceInquiry', () => ({
  notifyServiceInquiry: jest.fn(),
}));

const storeModule = require('@/lib/pierrot/serviceInquiryStore') as {
  getServiceLeadSummaryById: MockFn;
  getServiceLeadForContact: MockFn;
  saveServiceLeadContact: MockFn;
  recordServiceInquiryEvent: MockFn;
};
const notifyModule = require('@/lib/advising/notifyServiceInquiry') as {
  notifyServiceInquiry: MockFn;
};
const { GET, POST } = require('../route') as {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
};

const leadId = '11111111-1111-4111-8111-111111111111';

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: leadId,
    conversation_id: '22222222-2222-4222-8222-222222222222',
    status: 'qualified',
    need_type: 'analysis',
    stage: 'exploring',
    timeline: 'this_quarter',
    questions_asked: 2,
    summary: 'analysis / exploring / this_quarter',
    contact_name: null,
    contact_email: null,
    consent_at: null,
    submitted_at: null,
    ...overrides,
  };
}

function makeRequest(body: Record<string, unknown> = {}): Request {
  return new Request('http://localhost/api/advising/inquiries', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      leadId,
      name: 'Guest',
      email: 'person@example.com',
      consent: true,
      ...body,
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  storeModule.getServiceLeadSummaryById.mockResolvedValue({
    id: leadId,
    status: 'qualified',
    needType: 'analysis',
    stage: 'exploring',
    timeline: 'this_quarter',
    summary: 'analysis / exploring / this_quarter',
    questionsAsked: 2,
  });
  storeModule.getServiceLeadForContact.mockResolvedValue(makeLead());
  storeModule.saveServiceLeadContact.mockResolvedValue(undefined);
  storeModule.recordServiceInquiryEvent.mockResolvedValue(undefined);
  notifyModule.notifyServiceInquiry.mockResolvedValue(true);
});

describe('GET /api/advising/inquiries', () => {
  it('returns only the summary, never contact fields', async () => {
    const response = await GET(
      new Request(`http://localhost/api/advising/inquiries?lead=${leadId}`)
    );
    const json = (await response.json()) as { lead: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(json.lead).toMatchObject({ canSubmit: true, needType: 'analysis' });
    expect(JSON.stringify(json)).not.toContain('email');
    expect(JSON.stringify(json)).not.toContain('contact_name');
  });
});

describe('POST /api/advising/inquiries', () => {
  it('saves contact only with explicit consent and records the lifecycle', async () => {
    const response = await POST(makeRequest());
    const json = (await response.json()) as { ok?: boolean; notified?: boolean };

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(storeModule.saveServiceLeadContact).toHaveBeenCalledWith({
      store: { mocked: true },
      leadId,
      name: 'Guest',
      email: 'person@example.com',
    });
    expect(notifyModule.notifyServiceInquiry).toHaveBeenCalledTimes(1);
    expect(storeModule.recordServiceInquiryEvent).toHaveBeenCalledTimes(3);
  });

  it('rejects a submission without explicit consent', async () => {
    const response = await POST(makeRequest({ consent: false }));

    expect(response.status).toBe(400);
    expect(storeModule.saveServiceLeadContact).not.toHaveBeenCalled();
    expect(notifyModule.notifyServiceInquiry).not.toHaveBeenCalled();
  });

  it('rejects invalid contact data', async () => {
    const response = await POST(makeRequest({ email: 'not-an-email' }));

    expect(response.status).toBe(400);
    expect(storeModule.getServiceLeadForContact).not.toHaveBeenCalled();
  });

  it('refuses contact before qualification', async () => {
    storeModule.getServiceLeadForContact.mockResolvedValue(makeLead({ status: 'new' }));

    const response = await POST(makeRequest());

    expect(response.status).toBe(409);
    expect(storeModule.saveServiceLeadContact).not.toHaveBeenCalled();
  });

  it('handles a repeated submission idempotently without another notification', async () => {
    storeModule.getServiceLeadForContact.mockResolvedValue(
      makeLead({ status: 'contact_requested' })
    );

    const response = await POST(makeRequest());
    const json = (await response.json()) as { alreadySubmitted?: boolean };

    expect(response.status).toBe(200);
    expect(json.alreadySubmitted).toBe(true);
    expect(storeModule.saveServiceLeadContact).not.toHaveBeenCalled();
    expect(notifyModule.notifyServiceInquiry).not.toHaveBeenCalled();
  });

  it('does not expose contact data in analytics payloads', async () => {
    await POST(makeRequest());

    const serialized = JSON.stringify(storeModule.recordServiceInquiryEvent.mock.calls);

    expect(serialized).not.toContain('person@example.com');
    expect(serialized).not.toContain('Guest');
  });

  it('returns 500 when saving the lead fails', async () => {
    storeModule.saveServiceLeadContact.mockRejectedValue(new Error('db down'));

    const response = await POST(makeRequest());

    expect(response.status).toBe(500);
    expect(notifyModule.notifyServiceInquiry).not.toHaveBeenCalled();
  });
});
