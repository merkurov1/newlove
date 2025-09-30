// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2, // 20% трафика, можно уменьшить
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === 'production',
});
