import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TempleSupportClient from '../TempleSupportClient';

jest.mock('next/link', () => {
  return function MockLink({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: React.ReactNode;
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

jest.mock('@/lib/tributes/analytics', () => ({
  trackTributeSupportView: jest.fn(),
  trackTributeAmountSelected: jest.fn(),
  trackTributeCheckoutCreated: jest.fn(),
  trackTributeCheckoutReturned: jest.fn(),
  trackTributePaymentAbandoned: jest.fn(),
  trackTributePaymentConfirmed: jest.fn(),
  trackTributePaymentFailed: jest.fn(),
  markTributeConfirmedOnce: jest.fn(() => false),
}));

jest.mock('@/lib/tributes/checkoutClient', () => ({
  createTributeCheckout: jest.fn(async () => ({
    url: 'https://checkout.stripe.com/c/pay/test',
    sessionId: 'cs_test_1234567890',
  })),
  openSecureCheckout: jest.fn(() => 'browser'),
}));

const checkoutClient = require('@/lib/tributes/checkoutClient') as {
  createTributeCheckout: jest.Mock;
  openSecureCheckout: jest.Mock;
};

beforeEach(() => {
  checkoutClient.createTributeCheckout.mockClear();
  checkoutClient.openSecureCheckout.mockClear();
  window.localStorage.clear();
});

describe('Temple support payment step', () => {
  it('is a non-modal selection step and links back to the Temple', () => {
    render(<TempleSupportClient />);

    expect(screen.getByTestId('temple-support-step')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('link', { name: /Temple/ })).toHaveAttribute(
      'href',
      '/temple'
    );
  });

  it('opens Stripe immediately for a preset amount', async () => {
    render(<TempleSupportClient />);

    fireEvent.click(screen.getByRole('button', { name: '$20' }));

    await waitFor(() => {
      expect(checkoutClient.createTributeCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 20 })
      );
    });

    expect(checkoutClient.openSecureCheckout).toHaveBeenCalledWith(
      'https://checkout.stripe.com/c/pay/test'
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('validates and opens a custom amount', async () => {
    render(<TempleSupportClient />);

    fireEvent.change(
      screen.getByRole('textbox', {
        name: 'Custom tribute amount in US dollars',
      }),
      { target: { value: '7.50' } }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(checkoutClient.createTributeCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 7.5 })
      );
    });
  });

  it('rejects a malformed custom amount before calling the server', () => {
    render(<TempleSupportClient />);

    fireEvent.change(
      screen.getByRole('textbox', {
        name: 'Custom tribute amount in US dollars',
      }),
      { target: { value: '0' } }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter an amount between $1 and $999999.99'
    );
    expect(checkoutClient.createTributeCheckout).not.toHaveBeenCalled();
  });
});
