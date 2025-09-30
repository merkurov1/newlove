// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://6ce114062f8188107b85b2255f4305dc@o4510107334606848.ingest.de.sentry.io/4510107337359440",
  sendDefaultPii: true,
  integrations: [
    Sentry.replayIntegration(),
    Sentry.feedbackIntegration({
      colorScheme: "system",
    }),
  ],
  enableLogs: true,
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
  enabled: process.env.NODE_ENV === 'production',
});
