# Phase C — Local UNFRAMED Retrieval Evaluation

**Branch:** `phase-c-unframed-evaluation`, created from `phase-b-unframed-parser`.

**Status:** Phase C complete. No SQL, Supabase, Vercel, migrations, API routes, embeddings, environment changes, or Pierrot integration. No commit or push.

**Source unchanged:** `app/unframed/Unframed.markdown`

**SHA-256:** `cf1852c708185408b9ec1081584d62857c1f05cbd8ad1f5fd15ad7efa39d9923`

**Manifest hash:** `78f704b33c900897256a7e9a3b6263c3d7114783ae184326be0301d32f0624d2`

**Parser/chunker:** `unframed-parser-v1` / `unframed-chunker-v1`

**Evaluator:** `unframed-eval-v1`

**Question-set hash:** `57e787f51b9142518cc865590f4b02f7d20dcadab9a7b89cb378abb00f60adec`

---

## 1. Files added

| File | Purpose |
|---|---|
| `lib/knowledge/evaluation/types.ts` | Evaluation, retrieval, metrics, diagnostics and report contracts. |
| `lib/knowledge/evaluation/tokenize.ts` | Deterministic lexical tokenization; no stemming, synonyms, network or LLM. |
| `lib/knowledge/evaluation/bm25.ts` | BM25 index and deterministic ranking with stable chunk-index tie-breaking. |
| `lib/knowledge/evaluation/questions.ts` | 28-question fixture with short labels and section/chunk ground truth; no manuscript passages. |
| `lib/knowledge/evaluation/diagnostics.ts` | Metadata-only chunk structure and integrity diagnostics. |
| `lib/knowledge/evaluation/evaluate.ts` | Metrics, per-question evaluation, checks and metadata-only serialization. |
| `lib/knowledge/evaluation/__tests__/evaluation.test.ts` | 10 Phase C tests. |
| `scripts/knowledge/phase-c-evaluate.ts` | Explicit local-only CLI; refuses to run without `--local-evaluation`. |

No existing application files were modified. Phase B files were not changed.

---

## 2. Test commands and results

### Phase B regression

```bash
npx jest lib/knowledge/__tests__/unframed.test.ts --runInBand
```

Result: **1 suite passed, 10 tests passed.**

### Phase C tests

```bash
npx jest lib/knowledge/evaluation/__tests__/evaluation.test.ts --runInBand
```

Result: **1 suite passed, 10 tests passed.**

### Combined knowledge tests

```bash
npx jest lib/knowledge --runInBand
```

Result: **2 suites passed, 20 tests passed.**

### Targeted TypeScript check

```bash
npx tsc --noEmit --strict --target ES2022 --module commonjs \
  --moduleResolution node --esModuleInterop --skipLibCheck \
  --lib ES2022 --types node \
  lib/knowledge/types.ts lib/knowledge/unframed.ts \
  lib/knowledge/evaluation/types.ts \
  lib/knowledge/evaluation/tokenize.ts \
  lib/knowledge/evaluation/bm25.ts \
  lib/knowledge/evaluation/questions.ts \
  lib/knowledge/evaluation/diagnostics.ts \
  lib/knowledge/evaluation/evaluate.ts \
  scripts/knowledge/phase-b-manifest.ts \
  scripts/knowledge/phase-c-evaluate.ts
```

Result: **no output, exit 0.**

### CLI guard

Without `--local-evaluation`, the CLI exits with code 2 and prints only:

```json
{"mode":"local-evaluation","status":"failed","code":"missing_local_evaluation"}
```

---

## 3. Evaluation definition

This is a retrieval-only evaluation. No answer generation, no LLM, no database and no network access.

- Retrieval algorithm: deterministic BM25, `k1=1.2`, `b=0.75`.
- Search text includes chunk heading and section path as metadata, plus passage text.
- Tokenization: lowercase Unicode words; hyphens and apostrophes are separators; one-character tokens are removed. No stemming or synonyms.
- Top-k default: **5**; configurable with `--top-k=3` or `--top-k 3`.
- A query is `results` when at least one BM25 score is positive; otherwise `no_match`.
- Stable ranking: score descending, then chunk index ascending, then chunk ID.

### Relevance definition

A retrieved chunk is relevant if either:

- its chunk ID is in the question’s `relevantChunkIds`, or
- its section index is in the question’s `relevantSectionIndexes`.

### Metric definitions

- **Recall@5:** binary hit rate — `1` if at least one relevant chunk appears in the top 5, otherwise `0`.
- **Precision@5:** relevant top-5 chunks divided by **5** (fixed denominator, including when fewer results are returned).
- **MRR:** mean reciprocal rank of the first relevant chunk; `0` if none.
- **Retrieval success rate:** answerable verified questions returning at least one result, divided by all answerable verified questions.
- **False-positive rate:** unanswerable verified questions returning at least one result, divided by all unanswerable verified questions.
- Unverified questions are excluded from scored metrics.
- Invalid ground-truth references are excluded and counted separately.

No relevance labels were changed after seeing results.

---

## 4. Retrieval metrics

**Question set:** 28 total.

| Metric | Result |
|---|---:|
| Verified questions | 26 |
| Unverified/excluded | 2 |
| Answerable verified | 20 |
| Unanswerable verified | 6 |
| Invalid ground-truth references | 0 |
| **Recall@5** | **0.95** (19/20) |
| **Precision@5** | **0.26** |
| **MRR** | **0.85** |
| Retrieval success rate | **1.00** |
| False-positive rate | **1.00** (6/6) |
| p50 latency | **0.71 ms** |
| p95 latency | **2.13 ms** |

Latency is in-memory BM25 only. It excludes database, network, embedding and model latency and is not production evidence.

### By category

| Category | Questions | Answerable | Recall@5 | Precision@5 | MRR | False-positive |
|---|---:|---:|---:|---:|---:|---:|
| Direct factual | 6 | 6 | 1.00 | 0.30 | 1.00 | — |
| Structure | 5 | 5 | 0.80 | 0.24 | 0.80 | — |
| Specific passage | 4 | 4 | 1.00 | 0.20 | 0.83 | — |
| Paraphrased | 4 | 4 | 1.00 | 0.20 | 0.67 | — |
| Ambiguous | 2 | 0 | — | — | — | — |
| Absent | 2 | 0 | — | — | — | 1.00 |
| Misleading | 3 | 0 | — | — | — | 1.00 |
| Prompt injection | 2 | 1 | 1.00 | 0.60 | 1.00 | 1.00 |

**Interpretation:** lexical recall is high on this small set, but precision is low and the baseline never rejects an unanswerable query. This is not production-ready evidence.

---

## 5. Failed, unverified and excluded questions

### Retrieval miss

- **C10 — structure / arrest chapter.** Ground truth section is 45, but the top 5 did not include it. The term “arrest” occurs in 11 chunks across 9 sections; generic terms such as “chapter” are indexed in every chunk. This is a genuine ranking failure, not a ground-truth correction.
- Three additional questions were relevant but ranked lower:
  - **C15** — first relevant at rank 3.
  - **C17** — first relevant at rank 3.
  - **C18** — first relevant at rank 3.

### Unverified and excluded

- **C20** — broad “System” question. Multiple sections; no single reproducible ground truth.
- **C21** — broad “most important person” question. No reproducible ground truth.

### False positives on unanswerable questions

All six returned at least one positive-score result:

- **C22** — absent home address.
- **C23** — absent borscht recipe.
- **C24** — misleading restaurant-franchise assumption.
- **C25** — misleading Olympics opening-ceremony assumption.
- **C26** — misleading restaurant-meal assumption.
- **C27** — pure prompt-injection query.

C27 returned chunks but there is no LLM in Phase C, so no instruction was executed. C28 (injection plus username) retrieved the correct LiveJournal section at rank 1.

---

## 6. Metadata-only chunk diagnostics

| Diagnostic | Result |
|---|---:|
| Total chunks | 169 |
| Minimum chunk length | 286 chars |
| Median chunk length | 1,974 chars |
| p95 chunk length | 2,347 chars |
| Maximum chunk length | 2,394 chars |
| Near-empty chunks | 0 |
| Duplicate content hashes | 0 |
| Invalid offsets | 0 |
| Overlapping offset pairs | 2 |
| Chunks crossing section boundaries | 0 |
| Sections with no chunks | 0 |
| Stable manifest | true |
| Stable chunk IDs | true |
| Unique chunk IDs | true |

### Chunk counts by section type

| Section type | Chunks |
|---|---:|
| Introduction | 2 |
| Prologue | 2 |
| Chapter | 164 |
| Epilogue | 1 |

### Chunk counts by part

| Part | Chunks |
|---|---:|
| Unassigned (introduction/prologue) | 4 |
| Part 0 | 23 |
| Part 1 | 62 |
| Part 2 | 62 |
| Part 3 | 18 |

### Section-count explanation

The parser reports **4 parts, 46 chapters and 49 sections**:

- 1 introduction
- 1 prologue
- 46 chapters
- 1 epilogue
- Total: **49 content sections**

The four `PART` headings are structural markers. They update section paths but do not create content sections or chunks. All 49 content sections have at least one chunk. No expected section is missing.

### Overlapping offsets

There are two overlapping pairs, both inside section 16:

- 291-character overlap.
- 307-character overlap.

Both are intentional sentence-level overlaps from the Phase B chunker’s configured 300-character overlap. The 307 figure includes boundary whitespace. They are not invalid offsets and do not cross section boundaries.

---

## 7. Privacy and output checks

- CLI output contains no question text.
- CLI output contains no chunk/passage text.
- Per-question output uses IDs, ranks, scores, section identifiers and chapter numbers only.
- The output was checked for known answer strings and section-specific terms; none were present.
- `checks.noPassageTextInReport` is `true`.
- All integrity checks passed:
  - source hash valid
  - ground-truth references valid
  - section boundaries intact
  - offsets valid
  - deterministic manifest
  - stable chunk IDs
  - unique chunk IDs
  - no passage text in report

`allChecksPassed` refers to **integrity and privacy checks**, not retrieval quality.

---

## 8. Known limitations of the lexical baseline

- No stemming, synonyms or semantic matching; paraphrases can rank lower.
- Generic words such as “chapter”, “address”, “recipe” and “what” create false positives.
- No minimum-score threshold is applied; any positive lexical overlap is treated as a result. This is why the unanswerable false-positive rate is 1.00.
- Section-level relevance makes precision coarse; a direct question with one relevant chunk can score at most 0.20 precision at top 5.
- The arrest-chapter question demonstrates that incidental mentions of a term can outrank the chapter that actually describes the event.
- The set is small: 28 questions, one English source, no Russian queries.
- In-memory latency is not representative of database retrieval.
- Two paraphrase-category questions (C18 and C19) are near-duplicates of earlier questions, so independent paraphrase evidence is effectively limited. This should be corrected before a larger evaluation.
- No claim is made that lexical retrieval is sufficient for production.

---

## 9. Phase B defects or observations

**No Phase B correctness defect was found.** The Phase B parser/chunker produced a deterministic manifest and all Phase B tests still pass.

One observation:

- Sentence-level overlap can exceed the nominal 300-character overlap by a few whitespace characters: the largest measured offset overlap is 307 characters. It remains within the same section and is intentional. No parser change was made.

---

## 10. Recommendation

**Do not proceed to SQL, Supabase, ingestion, embeddings, API routes, owner authentication changes, public RAG or Pierrot integration yet.**

Recommended next local step: **improve the retrieval baseline and evaluation fixture before a larger evaluation.**

Priority order:

1. Add a measured minimum-score threshold and stopword/field weighting to reduce the 100% false-positive rate on unanswerable questions.
2. Fix the duplicated paraphrase questions (C18/C19) and expand to 40–60 questions, including more absent/misleading cases and Russian queries.
3. Add section-aware aggregation or reranking to address structure misses such as C10.
4. Keep the parser/chunker unchanged unless the larger evaluation reveals structural failures.

Current assessment:

- **Recall@5 0.95** is encouraging for a simple lexical baseline.
- **Precision@5 0.26**, **MRR 0.85** and **false-positive rate 1.00** mean the baseline is not ready for retrieval-augmented generation or production use.
- The next decision should be based on a larger, improved local evaluation — not on this 28-question set alone.

---

## 11. Reproduce

```bash
cd /workspaces/newlove
git switch phase-c-unframed-evaluation

./node_modules/.bin/esbuild scripts/knowledge/phase-c-evaluate.ts \
  --bundle --platform=node --format=cjs \
  --outfile=/tmp/opencode/phase-c-evaluate.cjs

node /tmp/opencode/phase-c-evaluate.cjs --local-evaluation \
  > /tmp/opencode/phase-c-evaluation.json

npx jest lib/knowledge --runInBand
```

The evaluation JSON is local and untracked at `/tmp/opencode/phase-c-evaluation.json`. No generated report or manuscript text was committed.
