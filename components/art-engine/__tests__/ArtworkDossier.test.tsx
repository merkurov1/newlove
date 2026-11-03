import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import ArtworkDossier from '../ArtworkDossier';
import type { ArtworkDetail } from '../types';

afterEach(cleanup);

const detail: ArtworkDetail = {
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
    image: {
      publicUrl: 'https://images.example.com/rothko.jpg',
      originalUrl: 'https://images.example.com/original.jpg',
      availability: 'mirrored',
      width: 1200,
      height: 1600,
      rights: { publication: 'unreviewed' },
    },
  },
  attempts: [
    {
      id: 'attempt-1',
      url: 'https://www.sothebys.com/lot',
      status: 'partial',
      error_message: null,
      house: 'sothebys',
      parsed_title: 'Untitled',
      execution_time_ms: 2000,
      created_at: '2026-11-03T07:00:00.000Z',
      parser: 'sothebys',
      parser_version: '1.1.0',
      lot_id: 'lot-1',
      http_status: 200,
      fetch_method: 'direct',
      warnings: ['Missing dimensions'],
      errors: [],
      missing_fields: ['dimensions'],
      image_availability: 'mirrored',
      image_original_url: 'https://images.example.com/original.jpg',
    },
  ],
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
  },
};

describe('ArtworkDossier', () => {
  it('renders the Selection-like artwork record with service metadata', () => {
    render(<ArtworkDossier detail={detail} />);

    expect(screen.getByRole('heading', { name: 'Mark Rothko' })).toBeInTheDocument();
    expect(screen.getByText(/Untitled/)).toBeInTheDocument();
    expect(screen.getByText('A catalogue note.')).toBeInTheDocument();
    expect(screen.getByText('Extraction record')).toBeInTheDocument();
    expect(screen.getByText(/Missing fields: dimensions/)).toBeInTheDocument();
    expect(screen.getByText('Private collection')).toBeInTheDocument();
  });

  it('does not render the retired Investment Memorandum presentation', () => {
    render(<ArtworkDossier detail={detail} />);

    expect(screen.queryByText(/Investment Memorandum/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Synthesize Curatorial Dossier/i)).not.toBeInTheDocument();
  });
});
