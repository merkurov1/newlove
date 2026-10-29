# Phase C.1 — Local Retrieval Quality Report

**Branch:** `phase-c1-retrieval-quality`, created from `phase-c-unframed-evaluation`.

**Status:** Phase C.1 complete. No SQL, Supabase, database, migrations, API routes, embeddings, external APIs, environment changes, or Pierrot integration. No commit or push.

**Source unchanged:** `app/unframed/Unframed.markdown`

**SHA-256:** `cf1852c708185408b9ec1081584d62857c1f05cbd8ad1f5fd15ad7efa39d9923`

**Manifest hash:** `78f704b33c900897256a7e9a3b6263c3d7114783ae184326be0301d32f0624d2`

**Parser/chunker:** `unframed-parser-v1` / `unframed-chunker-v1`

**Evaluator:** `unframed-eval-c1-v1`

---

## 1. Files added

| File | Purpose |
|---|---|
| `lib/knowledge/evaluation/c1/types.ts` | C1 question, retrieval, metrics, split and report contracts. |
| `lib/knowledge/evaluation/c1/retrieval.ts` | Baseline adapter, field-weighted BM25 variant, stopwords, section boost and threshold outcomes. |
| `lib/knowledge/evaluation/c1/questions.ts` | 49-question fixture with English/Russian questions, groups, short labels and structural ground truth. |
| `lib/knowledge/evaluation/c1/split.ts` | Deterministic fact-group dev/test split. |
| `lib/knowledge/evaluation/c1/evaluate.ts` | Baseline-vs-improved metrics, language/category breakdowns and checks. |
| `lib/knowledge/evaluation/c1/__tests__/c1.test.ts` | 10 C1 tests. |
| `scripts/knowledge/phase-c1-evaluate.ts` | Explicit local-only C1 CLI. |

The original Phase C `bm25.ts`, `evaluate.ts`, fixture and CLI were not modified. The original baseline remains reproducible.

---

## 2. Baseline diagnosis

Confirmed issues in the original Phase C baseline:

- Heading and section-path tokens were mixed into the body token stream. Headings were repeated twice and section paths once.
- Generic structural terms such as “chapter” appeared in nearly every chunk and distorted structure queries.
- No stopword handling existed.
- Any positive BM25 score counted as successful retrieval; there was no abstention threshold.
- Unanswerable queries therefore could not be rejected unless every query term was absent.
- Precision used a fixed top-5 denominator, which is correct but produces low values when one relevant chunk is retrieved.
- The provisional held-out split was too small: it had only one unanswerable question.
- Two paraphrase-category questions (old C18/C19) were duplicates of earlier questions.
- Ground-truth labels were not changed to improve scores. C10’s section-45 label remains the actual arrest chapter.

The new fixture removes the duplicate questions and uses 49 independently useful questions.

---

## 3. Improved model

### Configuration selected on the development set only

| Parameter | Value |
|---|---|
| BM25 `k1` | 1.2 |
| BM25 `b` | 0.75 |
| Body field weight | 1.0 |
| Section-heading weight | 2.2 |
| Part-heading weight | 0.3 |
| Section-path weight | 0.4 |
| Section boost | 0.2 |
| Minimum score | 3.0 |
| Stemming / synonyms | none |
| Semantic matching | none |

Stopwords include common English/Russian function words and generic structural terms such as “chapter”, “part”, “section”, “book”, “describe”, “cover”, “mention”, “happen”, and “say”. `epilogue`, `prologue`, and `introduction` are deliberately **not** stopped because they can be answer targets.

### Retrieval outcomes

- `relevant_results`: top score meets the calibration threshold.
- `weak_match`: positive lexical overlap exists but the top score is below the threshold.
- `no_match`: no positive lexical match.

These remain retrieval outcomes only; they do not prove that a future generated answer would be factually supported.

### Calibration tradeoff on the development set

| Threshold | Recall@5 | Precision@5 | MRR | Correct abstention | FP rate | FN rate |
|---:|---:|---:|---:|---:|---:|---:|
| 3 | 0.875 | 0.342 | 0.725 | 0.200 | 0.800 | 0.125 |
| 4 | 0.833 | 0.333 | 0.717 | 0.200 | 0.800 | 0.167 |
| 5 | 0.708 | 0.300 | 0.677 | 0.200 | 0.800 | 0.292 |
| 6 | 0.667 | 0.275 | 0.667 | 0.400 | 0.600 | 0.333 |
| 7 | 0.667 | 0.275 | 0.667 | 0.400 | 0.600 | 0.333 |
| 8 | 0.625 | 0.267 | 0.625 | 0.600 | 0.400 | 0.375 |

Threshold 3 was selected because it preserved the best development recall while providing the three-outcome distinction. Higher thresholds improve abstention only by sacrificing substantial recall.

---

## 4. Evaluation split

- Seed: `phase-c1-v3`
- Rule: unique fact groups sorted by `sha256(seed:group)`; the first 30% of groups form the held-out test set.
- All questions about the same fact stay in the same split.
- 37 fact groups total.
- Development: **33 questions**, 26 groups.
- Held-out test: **16 questions**, 11 groups.
- Test composition: 14 answerable, 2 unanswerable, 3 Russian.

**Important limitation:** the held-out set is small and has only two verified unanswerable questions. This is not sufficient for production-readiness claims.

---

## 5. Metrics

Relevance definition: a retrieved chunk is relevant if its chunk ID is in the question’s ground-truth chunk IDs or its section index is in the ground-truth section indexes.

- Recall@5: binary hit rate; 1 if at least one relevant chunk is in the top 5.
- Precision@5: relevant top-5 chunks divided by 5.
- MRR: reciprocal rank of the first relevant chunk; 0 if none.
- Retrieval success: answerable question with `relevant_results`.
- Correct abstention: unanswerable question with `weak_match` or `no_match`.
- False positive: unanswerable question with `relevant_results`.
- False negative: answerable question without a relevant top-5 result.

### Development set

| Model | Recall@5 | Precision@5 | MRR | Retrieval success | Correct abstention | FP rate | FN rate | p50 / p95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline | 0.750 | 0.217 | 0.660 | 0.917 | 0.000 | 1.000 | 0.250 | 0.64 / 3.72 ms |
| Improved | **0.875** | **0.342** | **0.725** | 0.917 | **0.200** | **0.800** | **0.125** | 0.86 / 7.39 ms |

### Held-out test set

| Model | Recall@5 | Precision@5 | MRR | Retrieval success | Correct abstention | FP rate | FN rate | p50 / p95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline | 0.929 | 0.329 | 0.732 | 1.000 | 0.500 | 0.500 | 0.071 | 0.65 / 2.87 ms |
| Improved | 0.929 | **0.386** | **0.744** | 1.000 | 0.500 | 0.500 | 0.071 | 0.85 / 4.09 ms |

### Test metrics by language

| Language | Model | Recall@5 | Precision@5 | MRR | Correct abstention | FP rate |
|---|---|---:|---:|---:|---:|---:|
| English | Baseline | 0.917 | 0.283 | 0.688 | 0.000 | 1.000 |
| English | Improved | 0.917 | **0.350** | **0.701** | 0.000 | 1.000 |
| Russian | Baseline | 1.000 | 0.600 | 1.000 | 1.000 | 0.000 |
| Russian | Improved | 1.000 | 0.600 | 1.000 | 1.000 | 0.000 |

The Russian held-out questions include Latin proper nouns (`LiveJournal`) and a no-match injection query. The three development-set Russian questions tell a more important story: pure Cyrillic questions about English source text failed; Russian with Latin names could succeed.

### Test metrics by category

| Category | Questions | Baseline recall / precision / MRR | Improved recall / precision / MRR |
|---|---:|---|---|
| Direct factual | 5 | 1.000 / 0.480 / 1.000 | 1.000 / 0.480 / 0.767 |
| Structure | 4 | 0.750 / 0.200 / 0.396 | 0.750 / 0.250 / 0.583 |
| Specific passage | 3 | 1.000 / 0.200 / 0.778 | 1.000 / 0.400 / 1.000 |
| Paraphrased | 1 | 1.000 / 0.200 / 0.333 | 1.000 / 0.200 / 0.250 |
| Misleading | 1 | — / — / —; FP 1.000 | — / — / —; FP 1.000 |
| Prompt injection | 2 | 1.000 / 0.600 / 1.000; abstention 1.000 | same |

The improved model has better precision/MRR overall, but there are regressions: direct-factual MRR and the single paraphrased question’s MRR were lower on the held-out set. This is reported rather than hidden.

---

## 6. Failed, unverified and excluded questions

### Held-out miss

- **C36** — final-chapter structure question. Ground truth section 47; neither model retrieved it in the top 5.

### Development misses

- **C29** — birthplace question; both models missed section 2.
- **C48** — pure-Cyrillic birthplace question; no lexical match.
- **C49** — pure-Cyrillic identity question; no lexical match.

The improved model fixed several earlier development misses: C10 reached rank 4, C30 rank 5, C41 rank 5; C32 reached rank 4; C39 improved from rank 4 to rank 2; C43 improved from rank 4 to rank 1.

### Unverified and excluded

- **C20** — broad “System” question.
- **C21** — broad “most important person” question.
- **C44** — broad city-history question.
- **C45** — ambiguous “Granite” reference.

These are excluded from scored metrics and are not used to claim retrieval success.

### Unanswerable questions

Development: C22, C23, C24, C26, C27. The improved model correctly abstained only on C23.

Held-out: C25 and C51. Both models correctly abstained on C51; both returned a misleading result for C25.

The remaining false positives are largely lexical: a misleading or absent question can still contain words that match a real passage.

---

## 7. Chunk diagnostics

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

**Section-count rule:** 4 parts, 46 chapters, 49 content sections = 1 introduction + 1 prologue + 46 chapters + 1 epilogue. The four `PART` headings are structural markers and do not create content sections.

The two overlapping offset pairs are both inside section 16: 291 and 307 characters. They are intentional sentence-level overlaps from the Phase B chunker; the nominal 300-character overlap can exceed 300 by boundary whitespace. They are not invalid offsets and do not cross section boundaries.

---

## 8. Privacy and reproducibility

- CLI output contains no question text, chunk text or manuscript passages.
- Per-question output contains IDs, language, category, outcome, ranks, scores and section identifiers only.
- Output was checked for known answer strings and section-specific terms; none were present.
- `checks.noPassageTextInReport` is `true`.
- All integrity checks passed:
  - source hash valid
  - question set valid
  - deterministic manifest
  - stable chunk IDs
  - unique chunk IDs
  - no passage text in report
- Two independent CLI runs produced the same manifest, question-set hash, rankings and metrics.
- `allChecksPassed` means integrity/privacy checks passed; it does not mean retrieval quality passed.

---

## 9. Known limitations

- The held-out set has only 16 questions and two unanswerable questions. It is too small for production conclusions.
- Lexical overlap still produces false positives on misleading questions with strong surface matches.
- No stemming, synonyms, semantic matching, reranking model or embeddings were added.
- Pure Russian queries over the English manuscript fail without Latin proper nouns.
- Precision@5 uses a fixed denominator of 5; low precision values are expected when only one chunk is relevant.
- Section-level ground truth is coarser than exact chunk-level ground truth.
- In-memory latency is not representative of database or network retrieval.
- The improved model improves development ranking but does not improve held-out abstention.
- No claim is made that retrieval success implies a future LLM answer will be correct.

---

## 10. Phase B defects or observations

No Phase B correctness defect was found. The parser/chunker remains deterministic and all Phase B tests pass.

One observation remains: sentence-level overlap can exceed the nominal 300-character overlap by boundary whitespace; the maximum measured offset overlap is 307 characters. It is intentional and section-local. No parser change was made.

---

## 11. Recommendation

**Do not proceed to SQL, Supabase, ingestion, embeddings, API routes, owner authentication changes, public RAG or Pierrot integration.**

The current result supports a limited conclusion:

- Field weighting and stopwords materially improve development-set ranking.
- Held-out precision and MRR improve slightly, but recall and abstention do not.
- The baseline still cannot reliably distinguish a relevant passage from an incidental lexical match.
- A higher threshold improves abstention only by sacrificing substantial recall.
- Pure Russian retrieval over English source text remains unsupported.

Recommended next local work:

1. Expand to 60–100 verified questions with a balanced held-out set, including more absent/misleading cases and pure-Russian queries.
2. Add interpretable abstention features — query coverage, score margin, exact entity/phrase evidence — and calibrate them on development data only.
3. Improve section-aware ranking without hiding rank regressions.
4. Keep the parser/chunker unchanged unless a larger evaluation exposes structural defects.
5. Treat cross-lingual retrieval as a separate approved design decision.

---

## 12. Commands

```bash
cd /workspaces/newlove
git switch phase-c1-retrieval-quality

./node_modules/.bin/esbuild scripts/knowledge/phase-c1-evaluate.ts \
  --bundle --platform=node --format=cjs \
  --outfile=/tmp/opencode/phase-c1-evaluate.cjs

node /tmp/opencode/phase-c1-evaluate.cjs --local-evaluation \
  > /tmp/opencode/phase-c1-evaluation.json

npx jest lib/knowledge --runInBand
```

Optional top-k:

```bash
node /tmp/opencode/phase-c1-evaluate.cjs --local-evaluation --top-k=3
```

The CLI refuses to run without `--local-evaluation`. The JSON report is local and untracked at `/tmp/opencode/phase-c1-evaluation.json`.

**Stopped after Phase C.1. No production or database changes were made.**
