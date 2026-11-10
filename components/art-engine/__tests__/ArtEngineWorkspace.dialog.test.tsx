import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ArtEngineWorkspace from '../ArtEngineWorkspace';

jest.mock('../useComposerOffset', () => () => 0);

const detail = {
  lot: {
    id: 'lot-1',
    artist: 'Mark Rothko',
    title: 'Untitled',
    year: '1967',
    medium: 'paper mounted on canvas',
    dimensions: '102.9 by 66 cm.',
    estimate: '10,000,000 – 15,000,000',
    price_realized: null,
    provenance: null,
    source_url: 'https://www.sothebys.com/lot',
    image_path: 'parsed/lot.jpg',
    image_url: 'https://images.example.com/rothko.jpg',
    auction_house: "Sotheby's",
    auction_date: '2026-11-12',
    currency: 'USD',
    external_id: '5',
    status: 'draft',
    created_at: '2026-11-03T07:00:00.000Z',
  },
  vault: {
    ingestion: {
      status: 'partial',
      parser: 'sothebys',
      parser_version: '1.1.0',
      attempt_id: 'attempt-1',
      warnings: ['Missing dimensions'],
      errors: [],
      missing_fields: ['dimensions'],
    },
  },
  attempts: [],
  extracted: {
    description: 'A catalogue note.',
    signature: null,
    lot_number: '5',
    auction_date: '2026-11-12',
    estimate_raw: '10,000,000 – 15,000,000',
    price_realized_raw: null,
    provenance: ['Private collection'],
    exhibitions: [],
    literature: [],
    artist_dates: '1903–1970',
    lot_essay: null,
    catalogue_note: null,
    condition_report: null,
    condition_report_status: 'unknown',
  },
  extraction: {
    title: 'Untitled',
    artist: 'Mark Rothko',
    artistDates: '1903–1970',
    auctionHouse: "Sotheby's",
    year: 1967,
    medium: 'paper mounted on canvas',
    dimensions: '102.9 by 66 cm.',
    signature: null,
    description: 'A catalogue note.',
    lotEssay: null,
    catalogueNote: null,
    conditionReport: null,
    conditionReportStatus: 'unknown',
    provenance: ['Private collection'],
    exhibitions: [],
    literature: [],
    lotNumber: '5',
    auctionDate: '2026-11-12',
    estimate: { raw: '10,000,000 – 15,000,000', currency: 'USD' },
    price: null,
    currency: 'USD',
  },
  wikipedia: null,
  editorial: null,
  publication: null,
};

function response(data: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: async () => data,
  } as Response);
}

describe('ArtEngineWorkspace inside Pierrot dialog', () => {
  beforeAll(() => {
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: jest.fn(),
    });
  });

  it('uses the inline Pierrot composer and completes the existing parse cycle', async () => {
    const authFetch = jest.fn(async (url: string, options?: RequestInit) => {
      if (url.startsWith('/api/admin/art-engine/lots?')) return response({ lots: [] });
      if (url.startsWith('/api/admin/art-engine/attempts?')) return response({ attempts: [] });
      if (url === '/api/admin/parse-url') {
        expect(options?.body).toContain('https://www.sothebys.com/lot');
        return response({ status: 'ready', lot_id: 'lot-1' });
      }
      if (url === '/api/admin/art-engine/lots/lot-1/wikipedia') {
        return response({ status: 'not_found', warnings: [] });
      }
      if (url === '/api/admin/art-engine/lots/lot-1') return response(detail);
      return response({ error: 'not found' }, false, 404);
    });

    const onModeCommand = jest.fn(() => false);
    render(
      <ArtEngineWorkspace authFetch={authFetch} embeddedInDialog onModeCommand={onModeCommand} />
    );

    const composer = document.querySelector('[data-art-engine-composer-inline]');
    expect(composer).not.toBeNull();

    const input = screen.getByLabelText('Art Engine input');
    fireEvent.change(input, { target: { value: 'https://www.sothebys.com/lot' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Mark Rothko' })).toBeInTheDocument();
    });
    expect(screen.getByText('A catalogue note.')).toBeInTheDocument();
  });

  it('shows an API error and allows the same request to be retried', async () => {
    let parseCalls = 0;
    const authFetch = jest.fn(async (url: string) => {
      if (url.startsWith('/api/admin/art-engine/lots?')) return response({ lots: [] });
      if (url.startsWith('/api/admin/art-engine/attempts?')) return response({ attempts: [] });
      if (url === '/api/admin/parse-url') {
        parseCalls += 1;
        if (parseCalls === 1) return response({ error: 'Unauthorized' }, false, 401);
        return response({ status: 'ready', lot_id: 'lot-1' });
      }
      if (url === '/api/admin/art-engine/lots/lot-1/wikipedia') {
        return response({ status: 'not_found', warnings: [] });
      }
      if (url === '/api/admin/art-engine/lots/lot-1') return response(detail);
      return response({ error: 'not found' }, false, 404);
    });

    render(<ArtEngineWorkspace authFetch={authFetch} embeddedInDialog />);

    const input = screen.getByLabelText('Art Engine input');
    fireEvent.change(input, { target: { value: 'https://www.sothebys.com/lot' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
    });
    expect(screen.getByText(/Attempt/)).toBeInTheDocument();

    fireEvent.keyDown(screen.getByLabelText('Art Engine input'), { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Mark Rothko' })).toBeInTheDocument();
    });
    expect(parseCalls).toBe(2);
  });

  it('routes the exit command before URL validation', async () => {
    const authFetch = jest.fn(async (url: string) => {
      if (url.startsWith('/api/admin/art-engine/lots?')) return response({ lots: [] });
      if (url.startsWith('/api/admin/art-engine/attempts?')) return response({ attempts: [] });
      return response({ error: 'not found' }, false, 404);
    });
    const onModeCommand = jest.fn((text: string) => text === 'Обычный режим');

    render(
      <ArtEngineWorkspace authFetch={authFetch} embeddedInDialog onModeCommand={onModeCommand} />
    );

    const input = screen.getByLabelText('Art Engine input');
    fireEvent.change(input, { target: { value: 'Обычный режим' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(onModeCommand).toHaveBeenCalledWith('Обычный режим');
    });
    expect(authFetch.mock.calls.some(([url]) => url === '/api/admin/parse-url')).toBe(false);
  });
});
