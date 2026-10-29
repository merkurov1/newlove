# Phase B — Local UNFRAMED Parser & Chunker Report

**Status:** Phase B complete. Local prototype only. No Phase C, SQL, Supabase, migrations, API routes, environment changes, Vercel settings, or Pierrot integration were performed.

**Branch:** `phase-b-unframed-parser`

**Commit/push:** none.

---

## 1. Source verification

| Item | Value |
|---|---|
| Canonical source | `app/unframed/Unframed.markdown` |
| SHA-256 | `cf1852c708185408b9ec1081584d62857c1f05cbd8ad1f5fd15ad7efa39d9923` |
| File size | 310,782 bytes |
| Repository copy | unchanged |
| `public/unframed/Unframed.markdown` | byte-identical, untouched |
| `content/Unframed.markdown` | absent |

No manuscript text was written to fixtures, logs, generated reports or the dry-run output. The prototype’s test fixtures are synthetic.

---

## 2. Files added

| File | Purpose |
|---|---|
| `lib/knowledge/types.ts` | Typed parser, chunk, manifest and fail-closed error contracts. |
| `lib/knowledge/unframed.ts` | Deterministic parser, chapter-aware chunker, manifest builder, hash validation and manifest checks. |
| `lib/knowledge/__tests__/unframed.test.ts` | Node/Jest tests covering the eight required Phase B validations. |
| `scripts/knowledge/phase-b-manifest.ts` | Dry-run-only CLI; refuses to run without `--dry-run`; prints metadata and checks only. |

No existing application files were edited. The earlier architecture report remains untracked and untouched.

---

## 3. Implementation summary

- TOC and front matter are excluded by locating the second `INTRODUCTION: UNFRAMED` heading.
- `# PART`, `CHAPTER NN:`, `INTRODUCTION:`, `PROLOGUE:` and `EPILOGUE:` are recognized independently of Markdown heading level.
- Section paths preserve part and chapter headings.
- Chunks never cross section boundaries.
- Stable `chk_…` IDs are derived from document ID, chunker version, chunk index and content hash.
- Exact `charStart` / `charEnd` and line offsets are retained.
- Oversized paragraphs split at sentence boundaries where possible; unpunctuated text falls back to word-boundary splitting.
- Source hash mismatch throws before parsing or chunking.
- Manifest output excludes passage text entirely.

---

## 4. Test results

```text
npx jest lib/knowledge/__tests__/unframed.test.ts --runInBand

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
Snapshots:   0 total
```

Targeted TypeScript check passed with no output:

```bash
npx tsc --noEmit --strict --target ES2022 --module commonjs \
  --moduleResolution node --esModuleInterop --skipLibCheck \
  --lib ES2022 --types node \
  lib/knowledge/unframed.ts lib/knowledge/types.ts \
  scripts/knowledge/phase-b-manifest.ts
```

`git diff --check` reported no whitespace errors.

---

## 5. Dry-run result

```json
{
  "mode": "dry-run",
  "status": "ok",
  "sourcePath": "app/unframed/Unframed.markdown",
  "sourceSha256": "cf1852c708185408b9ec1081584d62857c1f05cbd8ad1f5fd15ad7efa39d9923",
  "parserVersion": "unframed-parser-v1",
  "chunkerVersion": "unframed-chunker-v1",
  "documentId": "doc_unframed_manuscript",
  "sourceCharCount": 310765,
  "sourceWordCount": 53113,
  "bodyCharCount": 306947,
  "bodyWordCount": 52511,
  "partCount": 4,
  "chapterCount": 46,
  "sectionCount": 49,
  "chunkCount": 169,
  "manifestHash": "78f704b33c900897256a7e9a3b6263c3d7114783ae184326be0301d32f0624d2",
  "checks": {
    "tocExcluded": true,
    "sectionBoundaries": true,
    "offsetsValid": true,
    "uniqueChunkIds": true,
    "sectionPathsValid": true,
    "maxChunkCharsRespected": true
  },
  "checksAllPassed": true
}
```

A second dry run produced byte-identical output, confirming repeat-run determinism.

Character counts are JavaScript UTF-16 code units; the file itself is 310,782 bytes. Word counts are whitespace-token counts and match `wc -w`.

---

## 6. Reproduce the dry run

```bash
cd /workspaces/newlove
git switch phase-b-unframed-parser

./node_modules/.bin/esbuild scripts/knowledge/phase-b-manifest.ts \
  --bundle --platform=node --format=cjs \
  --outfile=/tmp/opencode/phase-b-manifest.cjs

node /tmp/opencode/phase-b-manifest.cjs --dry-run
```

`--dry-run` is mandatory. Without it, the CLI exits with code 2 and prints only an error code.

### Reproduce the tests

```bash
cd /workspaces/newlove
npx jest lib/knowledge/__tests__/unframed.test.ts --runInBand
```

---

## 7. Remaining risks

- Sentence splitting is heuristic; abbreviations and unusual punctuation may split imperfectly.
- The 169-chunk result is structurally valid, but retrieval quality is not evaluated until Phase C.
- Any manuscript edit changes the hash and fails closed until the expected hash is intentionally updated.
- The parser depends on the current body-heading conventions; future manuscript reformatting may require a parser-version change.
- The public duplicate manuscript remains a separate, unaddressed issue.
- No Supabase, database, API-route, environment or Pierrot validation has been performed.

---

## 8. Stop point

Phase B only. No Phase C evaluation, SQL, Supabase access, migrations, API routes, environment changes or Pierrot integration were performed. Nothing was committed or pushed.
