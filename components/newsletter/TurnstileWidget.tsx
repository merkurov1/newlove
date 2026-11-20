'use client';

import { useEffect, useRef, useState } from 'react';

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
      theme?: 'auto' | 'light' | 'dark';
    }
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript(onReady: () => void): () => void {
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;

  if (existing) {
    if (window.turnstile) onReady();
    else existing.addEventListener('load', onReady);
    return () => existing.removeEventListener('load', onReady);
  }

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.src = SCRIPT_SRC;
  script.async = true;
  script.defer = true;
  script.addEventListener('load', onReady);
  document.head.appendChild(script);

  return () => script.removeEventListener('load', onReady);
}

export default function TurnstileWidget({
  name,
  onToken,
  resetKey = 0,
  className,
}: {
  name?: string;
  onToken?: (token: string | null) => void;
  resetKey?: number;
  className?: string;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [widgetId, setWidgetId] = useState<string | null>(null);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    let cancelled = false;

    const render = () => {
      if (cancelled || !window.turnstile || !containerRef.current || widgetIdRef.current) return;

      const id = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'auto',
        callback: (token) => {
          if (inputRef.current) inputRef.current.value = token;
          onToken?.(token);
        },
        'expired-callback': () => {
          if (inputRef.current) inputRef.current.value = '';
          onToken?.(null);
        },
        'error-callback': () => {
          if (inputRef.current) inputRef.current.value = '';
          onToken?.(null);
        },
      });

      setWidgetId(id);
      widgetIdRef.current = id;
    };

    const cleanupScript = loadScript(render);

    return () => {
      cancelled = true;
      cleanupScript();
      const id = widgetIdRef.current;
      if (id && window.turnstile) {
        window.turnstile.remove(id);
      }
      widgetIdRef.current = null;
    };
    // Reset is handled by the explicit resetKey effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, onToken]);

  useEffect(() => {
    if (!resetKey || !widgetId || !window.turnstile) return;
    window.turnstile.reset(widgetId);
    if (inputRef.current) inputRef.current.value = '';
    onToken?.(null);
    // Only react to explicit reset requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, widgetId]);

  if (!siteKey) return null;

  return (
    <div className={className}>
      {name ? <input ref={inputRef} type="hidden" name={name} /> : null}
      <div ref={containerRef} />
    </div>
  );
}
