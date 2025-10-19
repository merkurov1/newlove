// Sentry removed - instrumentation registration is a no-op
export async function register() {
  // no-op: sentry disabled
  return;
}

export const onRequestError = () => {};
