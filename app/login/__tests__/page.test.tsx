import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginPage from '../page';

const push = jest.fn();
let mockSearchParams = new URLSearchParams();
let mockAuth = {
  user: null as { id: string } | null,
  isLoading: false,
  signInWithGoogle: jest.fn<() => Promise<void>>(),
  signInWithPasskey: jest.fn<() => Promise<void>>(),
};

const mockSupabase = {
  auth: {
    signInWithOtp: jest.fn(),
    verifyOtp: jest.fn(),
    setSession: jest.fn(),
  },
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@/components/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

jest.mock('@/lib/supabase-browser', () => ({
  createClient: () => mockSupabase,
}));

describe('Login page', () => {
  beforeEach(() => {
    push.mockReset();
    mockSearchParams = new URLSearchParams();
    mockAuth = {
      user: null,
      isLoading: false,
      signInWithGoogle: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      signInWithPasskey: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    mockSupabase.auth.signInWithOtp.mockReset().mockResolvedValue({ error: null });
    mockSupabase.auth.verifyOtp.mockReset().mockResolvedValue({ error: null });
    mockSupabase.auth.setSession.mockReset();

    window.localStorage.clear();
  });

  it('keeps all four identity methods on one short screen', () => {
    render(<LoginPage />);

    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Passkey' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wallet' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send sign-in code' })).toBeInTheDocument();
  });

  it('switches to registration copy without adding a second onboarding flow', () => {
    mockSearchParams = new URLSearchParams('mode=register&next=%2Fprofile');

    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByText(/Your Newlove account is created on first use/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=%2Fprofile'
    );
  });

  it('keeps the Vigil return path while opening Register mode', () => {
    mockSearchParams = new URLSearchParams('mode=register&next=%2Fvigil');

    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute(
      'href',
      '/login?mode=register&next=%2Fvigil'
    );
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=%2Fvigil'
    );
  });

  it('returns to /vigil after an already initialized session is confirmed', async () => {
    mockSearchParams = new URLSearchParams('next=%2Fvigil');
    mockAuth = {
      ...mockAuth,
      user: { id: 'user-vigil' },
      isLoading: false,
    };

    render(<LoginPage />);

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/vigil');
    });

    expect(push).not.toHaveBeenCalledWith('/art-engine');
  });

  it('ignores an external next and falls back to the safe default path', async () => {
    mockSearchParams = new URLSearchParams('next=https%3A%2F%2Fevil.example');

    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
        'href',
        '/login?next=%2Fart-engine'
      );
    });

    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute(
      'href',
      '/login?mode=register&next=%2Fart-engine'
    );
  });

  it('surfaces a Google OAuth failure instead of leaving an unhandled rejection', async () => {
    mockAuth.signInWithGoogle.mockRejectedValueOnce(new Error('OAuth unavailable'));

    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('OAuth unavailable');
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  });

  it('sends an email code and verifies it against the requested return path', async () => {
    mockSearchParams = new URLSearchParams('next=%2Fjournal%3Ffrom%3Dlogin');

    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
        'href',
        '/login?next=%2Fjournal%3Ffrom%3Dlogin'
      );
    });

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: ' reader@example.com ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in code' }));

    await waitFor(() => {
      expect(mockSupabase.auth.signInWithOtp).toHaveBeenCalledWith({
        email: 'reader@example.com',
        options: {
          emailRedirectTo: `${window.location.origin}/login?next=${encodeURIComponent(
            '/journal?from=login'
          )}`,
          shouldCreateUser: true,
        },
      });
    });

    expect(await screen.findByText('Check your inbox')).toBeInTheDocument();
    expect(screen.getByText('reader@example.com')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '12a3456' },
    });
    expect(screen.getByLabelText('Verification code')).toHaveValue('123456');

    fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));

    await waitFor(() => {
      expect(mockSupabase.auth.verifyOtp).toHaveBeenCalledWith({
        email: 'reader@example.com',
        token: '123456',
        type: 'email',
      });
      expect(push).toHaveBeenCalledWith('/journal?from=login');
    });
  });

  it('reports a failed code request and allows retrying', async () => {
    mockSupabase.auth.signInWithOtp.mockResolvedValueOnce({
      error: new Error('Email rate limit exceeded'),
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'reader@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email rate limit exceeded');
    expect(screen.queryByText('Check your inbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send sign-in code' })).toBeEnabled();
  });
});
