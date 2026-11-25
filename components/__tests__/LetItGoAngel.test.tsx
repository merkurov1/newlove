import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LetItGoAngel from '../LetItGoAngel';

jest.mock('next/image', () => {
  return function MockImage({
    alt,
    src,
    fill,
    priority,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    src: string;
    fill?: boolean;
    priority?: boolean;
  }) {
    void fill;
    void priority;

    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} src={src} {...props} />;
  };
});

jest.mock('@/components/AuthContext', () => ({
  useAuth: () => ({ user: null, profile: null }),
}));

jest.mock('@/hooks/useTempleIdentity', () => ({
  __esModule: true,
  default: () => ({
    displayName: '',
    source: null,
    status: 'anonymous',
    initDataPending: false,
    isLoading: false,
    error: null,
    isTelegram: false,
    refresh: async () => false,
  }),
}));

jest.mock('@/lib/templeLogger', () => ({
  logTempleEvent: jest.fn(async () => true),
}));

jest.mock('@/components/TempleTopBar', () => ({
  __esModule: true,
  default: () => <div data-testid="temple-top-bar" />,
}));

jest.mock('@/components/temple/useRitualModalTimer', () => ({
  useRitualModalTimer: jest.fn(),
}));

describe('Let It Go instruction and keyboard access', () => {
  it('shows a concise visible touch instruction', () => {
    render(<LetItGoAngel />);

    const instruction = screen.getByTestId('letitgo-instruction');

    expect(instruction).toBeVisible();
    expect(instruction).toHaveTextContent(/Tap the angel to release a burden/i);
  });

  it('exposes the instruction to the release button and works from the keyboard', () => {
    render(<LetItGoAngel />);

    const button = screen.getByRole('button', {
      name: /release a burden with the angel/i,
    });

    expect(button).toHaveAttribute('aria-describedby', 'letitgo-instruction');
    expect(button).toHaveAttribute('type', 'button');

    fireEvent.keyDown(button, { key: 'Enter' });

    expect(screen.getByText('1 heart released')).toBeInTheDocument();
  });
});
