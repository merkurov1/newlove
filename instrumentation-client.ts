// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://6ce114062f8188107b85b2255f4305dc@o4510107334606848.ingest.de.sentry.io/4510107337359440",
  integrations: [
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1,
  enableLogs: true,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  debug: false,
  // Фильтрация ошибок расширений браузера (перенесено из sentry.client.config.ts)
  beforeSend(event) {
    if (
      event.exception?.values?.[0]?.value?.includes('runtime.sendMessage') ||
      event.exception?.values?.[0]?.value?.includes('Extension context invalidated') ||
      event.exception?.values?.[0]?.value?.includes('Tab not found') ||
      event.exception?.values?.[0]?.stacktrace?.frames?.some(frame => 
        frame.filename?.includes('chrome-extension://') ||
        frame.filename?.includes('safari-extension://') ||
        frame.filename?.includes('moz-extension://')
      )
    ) {
      return null;
    }
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;