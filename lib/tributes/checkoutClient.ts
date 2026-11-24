import { readPierrotTributeAttribution } from '@/lib/pierrot/orderAttribution';

export type TributeCheckoutRequest = {
  amount: number;
  donorName?: string;
  message?: string;
  /** The current query string, used only for opaque Pierrot attribution. */
  search?: string | null;
};

export type TributeCheckout = {
  url: string;
  sessionId: string | null;
};

type CheckoutResponse = {
  url?: unknown;
  sessionId?: unknown;
  error?: unknown;
  message?: unknown;
};

type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: { user?: unknown };
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
};

function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;

  const webApp = (
    window as Window & {
      Telegram?: { WebApp?: TelegramWebApp };
    }
  ).Telegram?.WebApp;

  return webApp && typeof webApp === 'object' ? webApp : null;
}

/**
 * The Telegram SDK can be present on the normal web page too. Only treat it as
 * the Mini App bridge when Telegram actually supplied init data; otherwise a
 * regular browser must perform a normal same-tab navigation instead of a
 * popup that would lose the Temple page.
 */
function isTelegramMiniApp(tg: TelegramWebApp | null): tg is TelegramWebApp {
  return Boolean(tg?.initData || tg?.initDataUnsafe?.user);
}

/**
 * Creates a Stripe Checkout session through the existing server route.
 *
 * The amount is sent for convenience only: `/api/tribute/checkout` re-validates
 * it with `toTributeCents` before the Stripe API is called. This helper never
 * treats a browser response as payment proof — the visitor must still confirm
 * on Stripe's hosted page, and the server/webhook verifies the result.
 */
export async function createTributeCheckout({
  amount,
  donorName = 'Pilgrim',
  message = 'Fuel for the Temple',
  search = null,
}: TributeCheckoutRequest): Promise<TributeCheckout> {
  const attribution = readPierrotTributeAttribution(search);

  const response = await fetch('/api/tribute/checkout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: Math.round(amount * 100) / 100,
      currency: 'usd',
      donor_name: donorName,
      message,
      ...(attribution ? { pierrotAttribution: attribution } : {}),
    }),
  });

  let data: CheckoutResponse = {};

  if (response.headers.get('content-type')?.includes('application/json')) {
    data = (await response.json().catch(() => ({}))) as CheckoutResponse;
  } else {
    const text = await response.text().catch(() => '');
    data = { error: text || 'Invalid server response.' };
  }

  if (!response.ok) {
    throw new Error(
      typeof data.error === 'string' && data.error
        ? data.error
        : typeof data.message === 'string' && data.message
          ? data.message
          : `Payment gateway busy (${response.status}). Try again.`
    );
  }

  if (typeof data.url !== 'string' || !data.url) {
    throw new Error('Payment link generation failed.');
  }

  return {
    url: data.url,
    sessionId:
      typeof data.sessionId === 'string' && data.sessionId
        ? data.sessionId
        : null,
  };
}

/**
 * Hands the confirmed checkout URL to the browser. Telegram uses its native
 * openLink bridge when available so the Mini App keeps a return path; every
 * other environment performs a normal top-level navigation.
 */
export function openSecureCheckout(url: string): 'telegram' | 'browser' {
  const tg = getTelegramWebApp();

  if (isTelegramMiniApp(tg) && tg?.openLink) {
    try {
      tg.openLink(url, { try_instant_view: false });
      return 'telegram';
    } catch {
      // Fall through to a normal navigation if the bridge throws.
    }
  }

  if (typeof window !== 'undefined') {
    window.location.assign(url);
  }

  return 'browser';
}
