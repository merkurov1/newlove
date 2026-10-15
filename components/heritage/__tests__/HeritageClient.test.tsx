import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import HeritageClient from '../HeritageClient';

// Mock Next.js Image component for test environment
jest.mock('next/image', () => {
  return function MockImage({ fill, priority, ...props }: any) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt || ''} />;
  };
});

describe('HeritageClient', () => {
  it('renders the hero title and navigation items in English by default', () => {
    render(<HeritageClient />);

    expect(screen.getByText(/Objects have/i)).toBeInTheDocument();
    expect(screen.getByText(/histories\./i)).toBeInTheDocument();

    // Check nav chapters
    expect(screen.getByRole('link', { name: /01 Family/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /02 Gyumri/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /03 Dynamo/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /04 Death Masks/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /05 Digital Art/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /06 Alphabet 1931/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /07 Press/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /08 Sources/i })).toBeInTheDocument();
  });

  it('switches language to Russian when clicking the RU toggle', () => {
    render(<HeritageClient />);

    const ruButton = screen.getByRole('button', { name: 'ru' });
    fireEvent.click(ruButton);

    expect(screen.getByText(/У вещей/i)).toBeInTheDocument();
    expect(screen.getByText(/история\./i)).toBeInTheDocument();

    // Check Russian navigation labels
    expect(screen.getByRole('link', { name: /01 Семья/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /02 Дом-музей/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /03 Динамо/i })).toBeInTheDocument();
  });

  it('filters press items when clicking filter buttons', () => {
    render(<HeritageClient />);

    // Default: 'all' filter shows both own and coverage
    expect(screen.getByText(/The fight for Merkurov’s historic reliefs at Dynamo stadium/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /The Museum as a Tool of City Development/i })).toBeInTheDocument();

    // Filter by 'By Anton'
    const ownButton = screen.getByRole('button', { name: /By Anton/i });
    fireEvent.click(ownButton);

    expect(screen.getByRole('heading', { name: /The Museum as a Tool of City Development/i })).toBeInTheDocument();
    expect(screen.queryByText(/The fight for Merkurov’s historic reliefs at Dynamo stadium/i)).not.toBeInTheDocument();

    // Filter by 'Coverage'
    const covButton = screen.getByRole('button', { name: /Coverage/i });
    fireEvent.click(covButton);

    expect(screen.getByText(/The fight for Merkurov’s historic reliefs at Dynamo stadium/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /The Museum as a Tool of City Development/i })).not.toBeInTheDocument();
  });

  it('opens and closes the image lightbox modal', () => {
    render(<HeritageClient />);

    // Click on the hero monument photo
    const heroImage = screen.getByAltText(/Sculpture “Thought” on Sergey Merkurov’s grave/i);
    fireEvent.click(heroImage);

    // Lightbox modal should be opened
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Heritage Archive Viewer/i)).toBeInTheDocument();

    // Close lightbox
    const closeBtn = screen.getByRole('button', { name: /Close/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
