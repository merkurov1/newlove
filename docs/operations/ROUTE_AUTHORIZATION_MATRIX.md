# Sensitive route authorization matrix

This is a repository-level policy matrix for the sensitive route families. It is intentionally explicit about public routes that perform server-side work. The source code remains authoritative; this document is a deployment and review aid, not an authorization mechanism.

| Route / family | Method(s) | Intended audience | Authentication | Authorization | Rate limit / bounds | Test status |
|---|---|---|---|---|---|---|
| `/api/monitor/search` | POST | Admin | Supabase/admin header/verified Telegram via `requireAdminFromRequest` | Admin | 10/min/IP, 4 KB JSON, 120-char artist, 8 s provider timeout | VERIFIED by new tests |
| `/api/link-preview` | GET, POST | Public Lounge legacy client | None | Public safe-preview only | 20/min/IP, 2,048-char URL; parser validates protocol/private hosts/redirects | Redirect unit test; route test pending |
| `/api/flow/parse-url` | GET, POST | Admin Flow editor | `requireAdminFromRequest` | Admin | Shared parser 6 s fetch timeout and redirect bound | Existing route/source coverage |
| `/api/request-variant` | POST | NFT UI placeholder | None | Not implemented | Returns 501; no side effect | VERIFIED by new test |
| `/api/whispers` | POST | Admin capture UI | `requireAdminFromRequest` | Admin | 10/min/IP, 10 MB, allowlisted audio MIME | Source verified; live storage pending |
| `/api/transcribe` | POST | Admin moderation | `requireAdminFromRequest` | Admin; whisper ID selects stored object | 10/min/IP, signed URL 10 min, 10 MB, 10 s fetch | Source verified; live provider pending |
| `/api/whispers/reply` | POST | Admin moderation | `requireAdminFromRequest` | Admin; row selected by ID | 20/min/IP, 2,000-char message, 8 s Telegram timeout | Source verified |
| `/api/admin/**` | All declared methods | Admin | Central admin guard or `authorizeKnowledgeAdmin` | Admin/knowledge admin as documented per route | Route-specific; no public access | Family review required |
| `/api/admin/parse-url` | GET, POST | Admin editor | Admin | Admin | Shared SSRF guard and timeout | Source reviewed |
| `/api/pierrot-web` | POST | Public visitor, owner adapter | Session/Telegram/internal adapter identity | Owner-only contexts require verified owner | Pierrot rate limit, request limits, model timeout/circuit | Extensive route tests |
| `/api/pierrot` | POST/webhook methods | Telegram bot | Telegram webhook secret plus bot identity | Allowlisted Telegram admin for owner actions | Telegram idempotency and message bounds | Existing Telegram tests |
| `/api/pierrot/memory/**` | GET/POST/PATCH/DELETE | Owner | Verified owner/session | Owner record ownership | Route-specific bounds/rate limit | Existing memory tests |
| `/api/pierrot/skills/**` | GET/POST/PATCH | Owner/admin | Verified owner or admin route | Admin/owner only; never visitor | Route-specific | Existing skill tests; runtime execution gap remains |
| `/api/cron/**` | GET, POST | External scheduler/admin | `CRON_SECRET`/`isCronAuthorized` | Worker scope/kill switch | Bounded duration, batch, lock and daily/hourly limits | Source reviewed; scheduler external |
| `/api/stripe/webhook` | POST | Stripe | Stripe signature | Event-type handling | Provider signature; payload controlled by Stripe | Existing webhook tests |
| `/api/telegram/webhook` | POST | Telegram | Telegram secret token | Bot route | Provider delivery | Existing source/tests |
| `/api/auth/**` | GET/POST | Authenticated browser/OAuth | Supabase verified session/PKCE | User identity from verified token | Request-specific | Existing auth tests limited |
| `/api/upload/**`, `/api/media/**` | POST/PATCH/DELETE | Admin/editor | Admin | Admin | Upload validation/rate limit | Family review required |
| `/api/cast/**`, `/api/liveheart/**`, `/api/unframed-contact` | POST | Public visitor | Public feature-specific identity where applicable | Narrow row/content scope | Must remain rate-limited and payload-bounded | External verification required |
| `/api/health` | GET | Monitoring/public | None | No sensitive data | No external provider fan-out beyond bounded DB probe | Source verified |
| `/api/articles`, `/api/article-by-slug`, `/api/letters`, `/api/flow/items` | GET | Public website | None | Published/public filters | Pagination/cache bounds | Existing/source review |

## Review procedure for new routes

Before merging a route, add its row here and answer:

1. Is the route public by product requirement, or merely unauthenticated by accident?
2. Does it use the centralized auth helper for privileged actions?
3. Is the request body bounded before parsing expensive data?
4. Is every external fetch bounded by timeout and redirect/SSRF policy?
5. Is there a per-user/IP/provider rate limit where abuse can cost money?
6. Does a success response prove durable persistence or confirmed delivery?
7. Is there a test for unauthorized, malformed, oversized and provider-failure paths?
