# Phase C.2 — Local Retrieval Bake-Off Report

**Branch:** `phase-c2-retrieval-bakeoff`, created from `phase-c1-retrieval-quality`.

**Status:** Completed for the feasible strategies. Strategies A and B were measured. Strategies C and D are blocked by the local model/runtime environment and are not reported as measured results.

No commit or push. No Supabase, database, migrations, API routes, production configuration, environment changes, or Pierrot integration.

---

## 1. Files added

| File | Purpose |
|---|---|
| `lib/knowledge/evaluation/c2/types.ts` | C2 strategy, metrics, split, abstention and report contracts. |
| `lib/knowledge/evaluation/c2/questions.ts` | Expanded 87-question dataset built on the preserved C1 questions plus verified additions. |
| `lib/knowledge/evaluation/c2/split.ts` | Deterministic three-way fact-group split. |
| `lib/knowledge/evaluation/c2/semanticAvailability.ts` | Read-only local runtime/model probe; no downloads or network calls. |
| `lib/knowledge/evaluation/c2/hybrid.ts` | Reciprocal Rank Fusion design and deterministic tie-breaking. |
| `lib/knowledge/evaluation/c2/evaluate.ts` | Strategies A/B metrics, calibration-only abstention selection, blocked C/D reporting. |
| `lib/knowledge/evaluation/c2/__tests__/c2.test.ts` | 10 C2 tests. |
| `scripts/knowledge/phase-c2-evaluate.ts` | Explicit local-only C2 CLI. |

No existing Phase B, Phase C, or Phase C.1 implementation was modified. The manuscript and both manuscript copies are unchanged.

**Source SHA-256:** `cf1852c708185408b9ec1081584d62857c1f05cbd8ad1f5fd15ad7efa39d9923`

**Manifest hash:** `78f704b33c900897256a7e9a3b6263c3d7114783ae184326be0301d32f0624d2`

**Parser/chunker:** `unframed-parser-v1` / `unframed-chunker-v1`

**Evaluator:** `unframed-eval-c2-v1`

**Question-set hash:** `247083ad38dd436a29b38a00e65bdf9c86004253145f572b7e6043be73523cd1`

**Split seed:** `phase-c2-v90`

---

## 2. Dataset

**Total:** 87 questions.

- Verified: **83**
- Unverified/excluded: **4**
- English: **79**
- Russian: **8**

### Categories

| Category | Questions |
|---|---:|
| Direct factual | 20 |
| Structure / chapter location | 38 |
| Specific passage | 8 |
| Paraphrased | 5 |
| Ambiguous | 4 |
| Absent | 2 |
| Misleading | 5 |
| Prompt injection | 5 |

### Three-way split

| Split | Questions | Fact groups | Answerable | Unanswerable | Unverified |
|---|---:|---:|---:|---:|---:|
| Development | 45 | 34 | 40 | 3 | 2 |
| Calibration | 16 | 14 | 12 | 3 | 1 |
| Held-out test | 26 | 21 | 20 | 5 | 1 |

Split rule: unique fact groups are sorted by `sha256(seed:group)`. The first 30% form the held-out test set, the next 20% calibration, and the remainder development. Questions sharing a fact group remain in the same split. `factGroupIntegrity` passed.

The existing Phase C.1 duplicate paraphrase questions remain removed. C2 adds chapter-location, paraphrase, Russian, absent, misleading and injection questions, all grouped by underlying fact.

---

## 3. Semantic / hybrid blocker

**Strategy C — local semantic retrieval: blocked.**

**Strategy D — hybrid lexical + semantic retrieval: blocked.**

Local inspection found:

- Local ONNX file: `.../continue.continue-2.0.0-linux-x64/models/all-MiniLM-L6-v2/onnx/model_quantized.onnx`
- Dimensions: 384
- Model identity: `all-MiniLM-L6-v2`
- English-only model; **not suitable for claiming Russian-to-English semantic retrieval**
- No project-local runtime package:
  - `onnxruntime-node`: absent
  - `onnxruntime-web`: absent
  - `@xenova/transformers`: absent
  - `@huggingface/transformers`: absent
- No local Python `torch`, `sentence-transformers`, `onnxruntime`, or equivalent runtime.

No model weights were downloaded and no dependency was installed. Hybrid RRF is implemented and unit-tested as a design, but **no hypothetical hybrid metrics are reported**.

Smallest decision required to proceed:

1. Approve one local multilingual embedding model plus an offline inference runtime; or
2. Explicitly scope semantic retrieval to English-only and accept that Russian support remains blocked.

---

## 4. Strategy results

Metrics definitions:

- Recall@1/3/5: binary hit at the corresponding depth.
- Precision@5: relevant top-5 chunks divided by 5.
- MRR: reciprocal rank of the first relevant chunk.
- nDCG@5: not computed; labels are binary, not graded.
- Retrieval success: answerable question with `relevant_results`.
- Correct abstention: unanswerable question with `weak_match` or `no_match`.
- False positive: unanswerable question with `relevant_results`.
- False negative: answerable question without a relevant top-5 result.

### Held-out test — all strategies

| Strategy | Status | Recall@1 | Recall@3 | Recall@5 | Precision@5 | MRR | Success | Abstention | FP | FN | p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A — Original BM25 | measured | 0.650 | 0.700 | 0.800 | 0.220 | 0.692 | 0.900 | 0.000 | 1.000 | 0.200 | 0.35 / 0.86 ms |
| B — Field-weighted BM25 | measured | 0.650 | 0.750 | 0.900 | 0.280 | 0.722 | 0.900 | 0.000 | 1.000 | 0.100 | 0.52 / 1.78 ms |
| C — Semantic | blocked | — | — | — | — | — | — | — | — | — | — |
| D — Hybrid | blocked | — | — | — | — | — | — | — | — | — | — |

Test denominators: 20 answerable, 5 unanswerable, 1 unverified. Test-level percentages are based on small counts and are unstable.

### Development set

| Strategy | Recall@1 | Recall@3 | Recall@5 | Precision@5 | MRR | Success | Abstention | FP | FN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A | 0.750 | 0.850 | 0.900 | 0.285 | 0.800 | 0.975 | 0.000 | 1.000 | 0.100 |
| B | 0.750 | 0.825 | 0.900 | 0.305 | 0.798 | 0.975 | 0.333 | 0.667 | 0.100 |

Development denominators: 40 answerable, 3 unanswerable.

### Calibration set

| Strategy | Recall@1 | Recall@3 | Recall@5 | Precision@5 | MRR | Success | Abstention | FP | FN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A | 0.667 | 0.833 | 0.917 | 0.250 | 0.757 | 1.000 | 0.333 | 0.667 | 0.083 |
| B | 0.833 | 0.917 | 1.000 | 0.383 | 0.882 | 1.000 | 0.333 | 0.667 | 0.000 |

Calibration denominators: 12 answerable, 3 unanswerable.

### Held-out test by language

| Language | Strategy | Recall@5 | Precision@5 | MRR | Success | Abstention | FP | FN |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| English | A | 0.882 | 0.247 | 0.755 | 1.000 | 0.000 | 1.000 | 0.118 |
| English | B | **1.000** | **0.318** | **0.790** | 1.000 | 0.000 | 1.000 | 0.000 |
| Russian | A | 0.333 | 0.067 | 0.333 | 0.333 | — | — | 0.667 |
| Russian | B | 0.333 | 0.067 | 0.333 | 0.333 | — | — | 0.667 |

Russian test questions: 3. Only questions containing Latin proper nouns or no lexical match behaved well; pure-Cyrillic questions failed.

### Held-out test by category

| Category | Questions | A Recall@5 / Precision@5 / MRR | B Recall@5 / Precision@5 / MRR |
|---|---:|---|---|
| Direct factual | 6 | 0.667 / 0.133 / 0.542 | 0.833 / 0.167 / 0.567 |
| Structure | 8 | 1.000 / 0.350 / 0.823 | 1.000 / 0.375 / 0.854 |
| Specific passage | 5 | 0.600 / 0.120 / 0.600 | 0.800 / 0.280 / 0.640 |
| Paraphrased | 1 | 1.000 / 0.200 / 1.000 | 1.000 / 0.200 / 1.000 |
| Misleading | 3 | — / — / —; FP 1.000 | — / — / —; FP 1.000 |
| Prompt injection | 2 | — / — / —; FP 1.000 | — / — / —; FP 1.000 |

The paraphrased category has only one held-out question; it is not a stable paraphrase benchmark.

---

## 5. Calibration and abstention

Calibration-only threshold policy:

- Strategy: B
- Selected threshold: **3.0**, the existing C1 threshold
- Objective: maximise calibration correct abstention subject to no more than 0.02 loss in calibration Recall@5 or Precision@5 versus B at threshold 3.

Calibration trade-off for Strategy B:

| Threshold | Recall@5 | Precision@5 | MRR | Correct abstention | FP rate |
|---:|---:|---:|---:|---:|---:|
| 3 | 1.000 | 0.383 | 0.882 | 0.333 | 0.667 |
| 4 | 0.917 | 0.367 | 0.799 | 0.333 | 0.667 |
| 5 | 0.917 | 0.367 | 0.799 | 0.333 | 0.667 |
| 6 | 0.750 | 0.317 | 0.694 | 0.333 | 0.667 |
| 7 | 0.583 | 0.283 | 0.528 | 0.333 | 0.667 |
| 8 | 0.583 | 0.267 | 0.528 | 0.667 | 0.333 |
| 10 | 0.417 | 0.150 | 0.417 | 0.667 | 0.333 |
| 12 | 0.333 | 0.083 | 0.333 | 1.000 | 0.000 |

Higher thresholds improve abstention only by sharply reducing recall. The calibration rule therefore retained threshold 3. On held-out test, both strategies still return a result for all five unanswerable questions: **correct abstention 0.000, FP rate 1.000**.

This is the principal failure of the bake-off. The calibrated lexical systems do not reliably abstain.

---

## 6. Error analysis

### Resolved or improved

- **C10 — arrest-chapter ranking:** Strategy A missed section 45 on calibration; Strategy B retrieved it at rank 4. This earlier failure is improved but not eliminated from every split.
- **C30 and C41 — held-out misses in A:** Strategy B retrieved both; they are no longer test misses.
- **English held-out Recall@5:** A 0.882 → B 1.000.
- **Specific-passage Recall@5:** A 0.600 → B 0.800.
- **Test false-negative rate:** A 0.200 → B 0.100.

### Still failing

- **C36 — final-chapter structure question:** missed by both A and B across the available split; wrong-section/ranking failure.
- **C49 and C83 — pure-Russian questions:** both fail; cross-language lexical mismatch.
- **C24, C86, C87, C88, C89 — held-out unanswerable questions:** both A and B return `relevant_results`; false-positive matches on misleading or injection queries.
- **C36** is a chapter/section ranking failure, not a ground-truth ambiguity.
- **C10** is improved but still rank 4 rather than rank 1.

Failure classes observed:

- Lexical mismatch: C49, C83.
- Cross-language mismatch: pure-Cyrillic Russian questions.
- Generic-term interference: absence/misleading questions with shared words.
- Wrong chapter or section: C36.
- Relevant passage ranked too low: C10 in Strategy A.
- False positive on unanswerable: C24, C86–C89.
- Ground-truth ambiguity: unverified C20, C21, C44, C45.
- Semantic similarity without answer evidence: not measured; Strategy C blocked.

No manuscript passages were used in the error report; only IDs and section identifiers.

---

## 7. Latency, indexing and resources

| Measurement | Strategy A | Strategy B |
|---|---:|---:|
| Lexical index build | ~39 ms | ~41 ms |
| Test p50 query latency | 0.35 ms | 0.52 ms |
| Test p95 query latency | 0.86 ms | 1.78 ms |
| Corpus size | 169 chunks | 169 chunks |
| External runtime | none | none |
| Network calls | none | none |

These are in-memory measurements on one local run. They do not include database, network, model inference or application latency. Semantic/hybrid indexing cost is unavailable because Strategy C/D are blocked.

---

## 8. Chunk and manifest integrity

- Chunks: **169**
- Minimum: 286 chars
- Median: 1,974 chars
- p95: 2,347 chars
- Maximum: 2,394 chars
- Near-empty: 0
- Duplicate content hashes: 0
- Invalid offsets: 0
- Overlapping offset pairs: 2, both section-local and intentional
- Chunks crossing section boundaries: 0
- Sections with no chunks: 0
- Stable manifest: true
- Stable chunk IDs: true
- Unique chunk IDs: true

Section count remains 49 content sections: 1 introduction + 1 prologue + 46 chapters + 1 epilogue. The four PART headings are structural markers, not content sections.

---

## 9. Tests

```bash
npx jest lib/knowledge --runInBand
```

Result: **4 suites passed, 40 tests passed.**

- Phase B: 10 passed
- Phase C: 10 passed
- Phase C.1: 10 passed
- Phase C.2: 10 passed

Targeted TypeScript check passed with no output.

CLI guard: without `--local-evaluation`, C2 exits 2 with only:

```json
{"mode":"local-evaluation","phase":"C2","status":"failed","code":"missing_local_evaluation"}
```

Two independent runs produced identical manifest, question-set hash, rankings and abstention policy. `git diff --check` was clean.

---

## 10. Privacy and reproducibility

- Report contains no question text, chunk text or manuscript passages.
- Per-question output contains IDs, language/category, outcome, ranks, scores and section identifiers only.
- `checks.noPassageTextInReport` is `true`.
- `allChecksPassed` means integrity/privacy checks passed, not that retrieval quality passed.
- Raw local report: `/tmp/opencode/phase-c2-evaluation.json` (untracked).

---

## 11. Recommendation

**Do not proceed to SQL, Supabase, ingestion, embeddings, API routes, owner authentication, public RAG or Pierrot integration.**

Measured conclusion:

- Strategy B is a modest improvement over A on English held-out retrieval:
  - Recall@5 0.800 → 0.900
  - Precision@5 0.220 → 0.280
  - MRR 0.692 → 0.722
  - False-negative rate 0.200 → 0.100
- Strategy B still has **zero correct abstention on the held-out set** and a **1.000 false-positive rate** on unanswerable questions.
- The calibration set is too small and the lexical systems cannot separate strong topical matches from actual answer evidence.
- Pure-Russian retrieval remains effectively unsupported without a multilingual model or translation layer.
- Semantic and hybrid strategies cannot be evaluated under the current local constraints.

Recommended next local decision:

1. Approve a local multilingual embedding model plus an offline runtime, or explicitly limit scope to English.
2. Expand the held-out set further; 5 unanswerable test questions is not enough to calibrate abstention.
3. Add interpretable abstention features such as query coverage, score margin, exact entity evidence and lexical/semantic agreement.
4. Keep Strategy B as the current measured lexical baseline, but do not treat it as production-ready.
5. Keep the parser/chunker unchanged; no structural defect was found.

**Stopped after the local bake-off. Awaiting explicit approval before any further phase.**
