// This file configures the initialization of Sentry for the client side.
// The config you add here will be used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://6ce114062f8188107b85b2255f4305dc@o4510107334606848.ingest.de.sentry.io/4510107337359440",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Filter out browser extension errors
  beforeSend(event) {
    // Check if the error is from a browser extension
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
      // Don't send browser extension errors to Sentry
      return null;
    }

    return event;
  },

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});