# merkurov.love / newlove

**The personal website, publishing system, and experimental digital space of Anton Merkurov.**

Production site: [merkurov.love](https://merkurov.love) · Source: [github.com/merkurov1/newlove](https://github.com/merkurov1/newlove)

This repository powers a multilingual personal platform that brings together writing, art, projects, a lightweight publishing feed, and interactive experiments. It is an evolving production application, not a starter template.

## What lives here

- **Personal website and archive** — biography, media references, research, projects, and editorial work.
- **Flow** — a lightweight publishing layer for notes, links, photos, and videos, with public item pages and social cross-posting integrations.
- **Journal and letters** — editorial publications and archive pages.
- **Art and Heart & Angel** — art projects, the Heart & Angel world, and interactive visitor experiences.
- **Lobby and public-facing sections** — navigation into the different parts of the platform.
- **Admin tools** — authenticated content and publishing workflows.
- **Telegram research tools** — a local CLI workflow for exporting, verifying, and analysing Telegram conversation data. This is separate from the public website; see the security notes below.
- **Integrations** — Supabase authentication and data, social publishing integrations, email, payments, and selected AI-assisted workflows.

The exact routes and capabilities evolve with the application. The source code is the definitive reference for current behaviour.

## Architecture

| Layer                      | Role                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Next.js App Router + React | Website, server-rendered pages, route handlers, and application UI                        |
| TypeScript                 | Application and tooling code                                                              |
| Supabase                   | Primary application data, authentication, and configured storage services                 |
| Vercel                     | Production hosting and deployment                                                         |
| External services          | Optional integrations used by specific features, configured through environment variables |

The project uses a mixture of server-side rendering, static generation, and revalidation where appropriate. Do not assume every route or integration uses the same rendering or caching strategy.

## Stack

- Node.js **22.x**
- Next.js **14.2.x**
- React **18**
- TypeScript **5.5**
- Supabase JS / SSR packages
- Tailwind CSS
- Jest and Testing Library for tests
- Bun for the Telegram research CLI scripts

See [`package.json`](./package.json) for the authoritative dependency and script list.

## Getting started

### Requirements

- Node.js 22.x
- npm
- A Supabase project for features that require database or authentication access

### Local setup

```bash
git clone https://github.com/merkurov1/newlove.git
cd newlove
npm install
cp .env.example .env.local
```

Edit `.env.local` and replace the example values with credentials for your own development environment. Then start Next.js:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Some routes and integrations will not work until their corresponding services, database schema, and environment variables are configured. Do not point local experiments at production credentials or production data unless that is intentional.

## Environment variables

Start with [`.env.example`](./.env.example). The core variables currently documented there are:

| Variable                          | Purpose                                                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`             | Canonical app URL for the current environment                                                                               |
| `NEXT_PUBLIC_SUPABASE_URL`        | Supabase project URL used by client-side configuration                                                                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Supabase publishable/anon key                                                                                               |
| `SUPABASE_URL`                    | Server-side Supabase project URL                                                                                            |
| `SUPABASE_KEY`                    | Compatibility key used by selected integrations                                                                             |
| `SUPABASE_SERVICE_ROLE_KEY`       | Privileged server-side Supabase access; **never expose to the browser**                                                     |
| `TELEGRAM_WEBHOOK_SECRET`         | Secret used to validate configured Telegram webhook requests                                                                |
| `TELEGRAM_WEBHOOK_ENFORCE_SECRET` | Set to `1` only after the webhook is registered with `secret_token` matching `TELEGRAM_WEBHOOK_SECRET`; otherwise leave off |
| `DEEPSEEK_API_KEY`                | DeepSeek key used by Pierrot, Brain graph extraction, Flow AI and Media Intelligence                                        |
| `OPENROUTER_API_KEY`              | Server-only embeddings key (`baai/bge-m3`, 1024 dimensions)                                                                 |
| `CRON_SECRET`                     | Bearer secret required by every `/api/cron/*` worker route                                                                  |
| `PIERROT_RAG_ENABLED`             | Owner Brain retrieval flag; `true` in production for verified owners                                                        |
| `PIERROT_PUBLIC_RAG_ENABLED`      | Public-only Pierrot/Flow retrieval; default `false`, enabled only after document approval                                   |
| `FLOW_AI_RAG_ENABLED`             | Public Flow AI context retrieval; defaults to `true`                                                                        |
| `BRAIN_AUTO_GRAPH`                | Queue graph extraction after a completed Brain ingestion run                                                                |
| `PIERO_API_SECRET`                | Server-to-server secret for the Telegram adapter's internal requests; never expose to the browser                           |
| `TELEGRAM_ALLOWED_USER_IDS`       | Telegram user IDs allowed by the relevant bot workflow                                                                      |
| `NEXT_PUBLIC_SITE_NAME`           | Optional display name                                                                                                       |

Worker budgets, AI model overrides (`BRAIN_GRAPH_MODEL`, `MEDIA_ANALYSIS_MODEL`),
similarity floors and kill switches (`OPS_KILL_SWITCH`, `OPS_WORKERS_ENABLED`,
`OPS_<SCOPE>_ENABLED`) are documented in
[`docs/production-operations.md`](./docs/production-operations.md). The
canonical implementation is `lib/operations/config.ts`.

`vercel.json` intentionally contains no cron entries at the moment. Queues are
processed by an external scheduler or explicitly from the admin operations API;
see the scheduling section of the production operations guide.

Individual features may require additional variables (for example, email delivery, payment processing, or AI providers). Check the relevant implementation and deployment documentation before configuring them.

**Security rules**

- Never commit `.env.local`, real API keys, tokens, private exports, or personal conversation data.
- Keep service-role keys and all other privileged credentials server-side.
- Use placeholders in documentation and examples. Rotate a credential if it has been exposed in a public commit.
- Treat generated research reports as sensitive unless they have been explicitly reviewed and approved for publication.

## Useful scripts

Run scripts from `package.json`; the following are the main development commands:

```bash
npm run dev                 # Start local development server
npm run build               # Build the Next.js application
npm run start               # Run the production build locally
npm run lint                # Run Next.js lint command
npm test                    # Run Jest tests
npm run test:watch          # Run Jest in watch mode
npm run test:coverage       # Run tests with coverage
npm run format:check        # Check Prettier formatting
npm run check:metadata      # Run metadata checks
```

The repository also defines specialised commands for Telegram research, deployment, contracts, and diagnostics. Inspect `package.json` before running a specialised command; some require local credentials, external tools, or a specific environment.

## Feeds

The site publishes two separate RSS 2.0 feeds:

| URL               | Description                                                |
| ----------------- | ---------------------------------------------------------- |
| `/feed.xml`       | **Canonical Journal feed** — essays and dispatches         |
| `/rss.xml`        | Public RSS entry point; permanent alias to `/feed.xml`     |
| `/flow/rss`       | **Canonical Flow feed** — notes, links, images and videos  |
| `/flow/rss.xml`   | Alias for readers that probe the `.xml` path; serves the Flow feed with a `/flow/rss` self link |
| `/flow/feed.json` | JSON Feed 1.1 mirror of the Flow feed                      |

`/rss.xml` must not point at `/flow/rss`: it is the site-level RSS entry point
and resolves to the Journal feed. Flow readers should subscribe directly to
`/flow/rss`.

Optional Flow query parameters: `?lang=ru`, `?lang=en`, `?limit=1..100` (default 40). The Flow RSS document includes Atom self-discovery, `content:encoded`, Media RSS previews, Dublin Core author metadata and `sy:updatePeriod`. Responses support `ETag`/`If-None-Match` and `Last-Modified`/`If-Modified-Since`, and are cached for 15 minutes with the `flow-items` revalidation tag, so publishing an item invalidates the feed immediately.

## Deployment

The production site is hosted on Vercel.

1. Connect the repository to the intended Vercel project.
2. Configure the required environment variables for each environment in Vercel Project Settings.
3. Ensure the Supabase schema and required services are ready.
4. Deploy and inspect the build and function logs.
5. Smoke-test the key public routes and any integrations affected by the change.

Relevant deployment notes:

- [Production operations and deployment checklist](./docs/production-operations.md) — environment variables, migration parity, queue recovery, post-deploy smoke tests and known limitations.
- [Vercel environment setup](./VERCEL_ENV_SETUP.md)
- [Prisma migration notes](./VERCEL_PRISMA_MIGRATION.md)
- [Render migration notes](./RENDER_MIGRATION.md)

Deployment and migration instructions may apply only to particular legacy or feature-specific paths. Verify the current code and target environment before running database migrations or changing infrastructure.

## Documentation

- [Telegram research module](./docs/telegram-research.md) — local export, verification, statistics, and analysis workflow; includes important privacy and access-control details.
- [Bluesky integration](./docs/BLUESKY-INTEGRATION-COMPLETE.md)
- [Medium integration](./docs/MEDIUM-INTEGRATION-COMPLETE.md)
- [Editor button architecture](./docs/EDIT-BUTTON-ARCHITECTURE.md)
- [Migration guide](./docs/MIGRATION-GUIDE.md)
- [Migration cheatsheet](./docs/MIGRATION-CHEATSHEET.md)
- [Admin media checks](./docs/ADMIN_MEDIA_CHECK.md)
- [Unified Brain ingestion](./docs/brain-unified-ingestion.md)
- [Autonomous Brain and Graph workers](./docs/brain-autonomous-workers.md)
- [Media Intelligence](./docs/media-intelligence.md)
- [Media source ingestion](./docs/media-source-ingestion.md)
- [Pierrot production readiness](./docs/pierrot-production.md)
- [Flow public RAG](./docs/flow-ai-rag.md)
- [Production operations](./docs/production-operations.md)
- Operations dashboard: `/admin/operations` (admin-only)

More notes live in `docs/` and the repository root. Some documents describe historical implementation work; check dates and current source before treating them as operational instructions.

## Telegram research: additional caution

The Telegram research CLI is a local analysis workflow, not a general-purpose public API. It can process private conversations. Keep raw exports, caches, source messages, API responses, and intermediate analysis out of Git. Only publish a reviewed, anonymised output when there is an explicit reason to do so. Research pages must retain their server-side access controls; never rely on obscuring a URL as access control.

## Working principles

- **Supabase is the primary application data layer** for the current platform; verify the relevant schema before changing data access.
- Preserve existing public routes and content when refactoring.
- Prefer small, testable changes over broad rewrites.
- Do not add a new AI provider or background process unless the feature needs it.
- Avoid logging secrets, private content, or unnecessary personal data.
- Verify sitemap, metadata, canonical URLs, and cache/revalidation behaviour when changing routing or publishing.

## Contributing

This is a personal production project. Before opening a pull request or deploying a change:

1. Describe the user-visible behaviour being changed.
2. Check the existing implementation and related documentation.
3. Run the relevant tests and build where feasible.
4. Review the diff for secrets, private data, unintended route changes, and accidental generated files.

---

© Anton Merkurov · [merkurov.love](https://merkurov.love)
