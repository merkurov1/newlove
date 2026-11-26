# Google Analytics 4 / Search Console permissions — owner instructions

This runbook explains the difference between a revoked Google grant
(`invalid_grant`) and a resource-level permission failure
(`insufficient_permissions`) shown on `/admin/pierrot/analytics`.

No code path grants Google permissions automatically. Tokens are encrypted at
rest, never rendered in the admin UI and never written to sync logs. Do not
change Vercel environment variables or secrets to fix a Google permission
problem.

## 1. Identify the connected Google account

Open `/admin/pierrot/analytics`. Each Google source card shows:

- **Google account** — the identity that granted the shared read-only grant.
  If it is empty, reconnect Google once so the identity can be recorded.
- **GA4 account ID** and **GA4 property** — distinct identifiers, never
  interchangeable.
- **Search Console property** and its stored permission level.
- **Last error**, classified code, HTTP status, Google reason and API stage.

Diagnostics are also available without secrets at
`/api/admin/pierrot/analytics/status` (admin-only). That endpoint never returns
access or refresh tokens.

## 2. If the error is `invalid_grant`

The saved refresh token is no longer accepted. The Google grant was revoked or
expired.

1. On the source card, press **Переподключить**.
2. Choose the correct Google account in Google's account chooser.
3. Approve the read-only consent.
4. Retry discovery and then synchronization.

A reconnect updates the existing provider connection (one row per provider) and
does not create duplicate metric rows: synchronization replaces the same
provider/report/date slice.

## 3. If the error is `insufficient_permissions`

The grant is valid, but the connected Google account cannot read the selected
resource. Do not reconnect first; grant the role below.

### GA4 property `244838264`

- Minimum role: **Viewer** (or higher).
- Where: Google Analytics → **Admin** → **Property access management** for
  property `244838264`.
- Add the Google account shown on the admin card.
- After the role is granted, press **Повторить синхронизацию**. A new OAuth
  consent is not required.

### Search Console property `sc-domain:merkurov.love`

- Minimum role: **Full user** or **Owner**.
- Where: Google Search Console → **Settings** → **Users and permissions** for
  the property `sc-domain:merkurov.love`.
- Add the Google account shown on the admin card.
- After the role is granted, press **Повторить синхронизацию** or
  **Повторить обнаружение** if the property is not selected yet.

If the stored grant is missing `analytics.readonly` or `webmasters.readonly`,
the UI asks for **Переподключить** instead. Reconnect and confirm the read-only
scope; scopes are never weakened or broadened to write access.

## 4. If the wrong Google account is connected

Stop. Do not grant permissions to an account you do not recognise and do not
change production secrets. The admin UI marks this as an account/identity
mismatch. The owner must decide which Google account should own the grant, then
reconnect with that account.

## 5. Expected resources

| Source         | Resource                                                    | Minimum role       |
| -------------- | ----------------------------------------------------------- | ------------------ |
| GA4            | property `244838264`                                        | Viewer             |
| Search Console | `sc-domain:merkurov.love`                                   | Full user or Owner |
| Google Cloud   | Analytics Admin API, Analytics Data API, Search Console API | enabled            |

The GA4 Measurement ID (`G-...`) is not a Property ID and cannot be used in the
permission steps above.

## 6. Verification

After the owner action:

1. `Повторить обнаружение` should show `google_analytics:connected` and/or
   `search_console:connected`.
2. `Повторить синхронизацию` should complete for the selected range.
3. The source card clears the permission error and shows the last successful
   sync.
4. Existing URLs, stored history and previously collected metrics remain
   unchanged; re-syncs are idempotent.
