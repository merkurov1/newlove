/**
 * Account access is a full page, never a Temple modal.
 *
 * Parallel-route slots keep their previously active page during soft
 * navigation, even when that page no longer matches the URL. Without a page
 * in this slot, opening /login from an intercepted ritual leaves the ritual
 * overlay in place and the login route looks inert. Rendering nothing here
 * clears the slot so the account page is actually visible.
 */
export default function LoginModalSlot() {
  return null;
}
