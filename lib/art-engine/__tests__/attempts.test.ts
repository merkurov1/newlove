import { extractAttemptDossier, summarizeAttempt } from '../attempts';

describe('Art Engine attempt summaries', () => {
  it('summarizes a parser attempt without exposing the raw payload', () => {
    const summary = summarizeAttempt({
      id: 'attempt-1',
      url: 'https://www.christies.com/en/lot/lot-1',
      status: 'partial',
      error_message: null,
      house: 'christies',
      parsed_title: 'Elephants',
      execution_time_ms: 3210,
      created_at: '2026-11-03T07:00:00.000Z',
      payload: {
        parser: 'christies',
        parser_version: '1.1.0',
        lot_id: 'lot-1',
        http_status: 200,
        fetch_method: 'direct',
        warnings: ['Missing dimensions'],
        errors: [],
        missing_fields: ['dimensions'],
        image: {
          availability: 'mirrored',
          originalUrl: 'https://images.example.com/original.jpg',
        },
        result: {
          description: 'A catalogue note.',
        },
      },
    });

    expect(summary).toMatchObject({
      id: 'attempt-1',
      status: 'partial',
      parser: 'christies',
      parser_version: '1.1.0',
      lot_id: 'lot-1',
      warnings: ['Missing dimensions'],
      missing_fields: ['dimensions'],
      image_availability: 'mirrored',
    });
    expect(summary).not.toHaveProperty('payload');
  });

  it('extracts catalogue fields from the latest structured result', () => {
    const dossier = extractAttemptDossier({
      payload: {
        result: {
          description: 'Catalogue description',
          signature: 'Signed and dated 1968',
          lotNumber: '42',
          auctionDate: '2026-11-12',
          estimate: { raw: 'GBP 4,000 – 6,000' },
          price: { raw: 'GBP 7,000' },
          provenance: ['Private collection'],
          exhibitions: ['London, 1968'],
          literature: ['Catalogue raisonné'],
        },
      },
    });

    expect(dossier).toEqual({
      description: 'Catalogue description',
      signature: 'Signed and dated 1968',
      lot_number: '42',
      auction_date: '2026-11-12',
      estimate_raw: 'GBP 4,000 – 6,000',
      price_realized_raw: 'GBP 7,000',
      provenance: ['Private collection'],
      exhibitions: ['London, 1968'],
      literature: ['Catalogue raisonné'],
    });
  });

  it('returns empty values when the payload is unavailable', () => {
    expect(extractAttemptDossier(null)).toEqual({
      description: null,
      signature: null,
      lot_number: null,
      auction_date: null,
      estimate_raw: null,
      price_realized_raw: null,
      provenance: [],
      exhibitions: [],
      literature: [],
    });
  });
});
