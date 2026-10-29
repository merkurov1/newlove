# Phase C.4 — Evaluation Protocol and Multilingual Retrieval Bake-Off

**Branch:** `phase-c4-multilingual-bakeoff`, created from `phase-c3-evidence-abstention`.

**Status:** Completed for Strategies A and B. Strategies C and D are blocked by the local model/runtime environment. No production integration. No commit or push.

**Protected files unchanged:** manuscript, parser, chunker, Phase B/C/C.1/C.2/C.3 implementations, routes, UI, authentication, environment and configuration.

---

## 1. Files added

| File | Purpose |
|---|---|
| `lib/knowledge/evaluation/c4/types.ts` | C4 protocol, metrics, features, policies and report contracts. |
| `lib/knowledge/evaluation/c4/questions.ts` | Independent 134-question multilingual challenge fixture. |
| `lib/knowledge/evaluation/c4/split.ts` | Deterministic three-way fact-group split. |
| `lib/knowledge/evaluation/c4/protocol.ts` | Versioned protocol, metric definitions, policy definitions and protocol hash. |
| `lib/knowledge/evaluation/c4/semanticAvailability.ts` | Read-only offline model/runtime probe. |
| `lib/knowledge/evaluation/c4/features.ts` | Inference-time top score, margin, coverage, distinct-term and exact-phrase features. |
| `lib/knowledge/evaluation/c4/policies.ts` | Independent explainable abstention policies. |
| `lib/knowledge/evaluation/c4/evaluate.ts` | A/B measurement, policy evaluation, blocked C/D reporting and protocol checks. |
| `lib/knowledge/evaluation/c4/__tests__/c4.test.ts` | 10 C4 tests. |
| `scripts/knowledge/phase-c4-evaluate.ts` | Explicit local-only C4 CLI. |

---

## 2. Identifiers

**Source SHA-256:** `cf1852c708185408b9ec1081584d62857c1f05cbd8ad1f5fd15ad7efa39d9923`

**Manifest hash:** `78f704b33c900897256a7e9a3b6263c3d7114783ae184326be0301d32f0624d2`

**Parser/chunker:** `unframed-parser-v1` / `unframed-chunker-v1`

**Protocol:** `c4-protocol-v1`  
**Protocol hash:** `d2dba136d553ddb959880bc315d4b886474f3559899dadfd171e60574d4541b8`

**Question-set hash:** `d65b319474378ebc2f0f71ba946f11a4fdbf93417b1c53d05288834eb816d167`

**Evaluator:** `unframed-eval-c4-v1`

**Split seed:** `phase-c4-v7`

---

## 3. Protocol and metric definitions

The C4 protocol freezes:

- Retrieval ranking metrics: Recall@1/3/5, Precision@5, MRR. nDCG@5 is not computed because labels are binary, not graded.
- Answer decision metrics: answerable coverage, evidence recall, correct abstention, false accept, false reject and evidence miss.
- All metrics include numerator and denominator. No outcome label is used as a substitute for verified evidence.
- Unverified/ambiguous questions are excluded from scored metrics and reported separately.
- `weak_match` is not automatically an abstention; policy acceptance decides.
- Ground-truth section and chunk identifiers are evaluation-only and never enter inference features.
- Thresholds are selected on calibration only.

### C2 metric defect recorded

C2 `retrievalSuccessRate` counts `relevant_results` rather than verified relevant retrieval. C2 `correctAbstention` also treats every non-`relevant_results` outcome as abstention, including `weak_match`. C2 is unchanged; C4 uses independent evidence-based definitions.

---

## 4. Dataset

**Total: 134 questions** — independently verified, separate from C2/C3.

| Composition | Count |
|---|---:|
| Answerable English | 40 |
| Answerable pure-Russian | 30 |
| Answerable Russian with Latin proper nouns | 14 |
| Unanswerable/misleading English | 20 |
| Unanswerable/misleading pure-Russian | 20 |
| Ambiguous/unverified | 10 |
| **Total** | **134** |

**Verified:** 124  
**Unverified:** 10  
**Answerable:** 84  
**Unanswerable:** 40

**Language:** English 65, Russian 69.  
**Modes:** English 65, pure Russian 55, Russian-with-Latin 14.

**Categories:** direct factual 44, structure 20, specific passage 20, absent 22, misleading 14, prompt injection 4, ambiguous 10.

The dataset exceeds the 120 target because 14 Latin-proper-noun Russian questions were added separately after the 30 pure-Russian target was reached. They are reported separately, not merged into the pure-Russian results.

### Split

| Split | Questions | Fact groups | Answerable | Unanswerable | Unverified |
|---|---:|---:|---:|---:|---:|
| Development | 66 | 22 | 42 | 16 | 8 |
| Calibration | 24 | 9 | 12 | 12 | 0 |
| Held-out test | 44 | 14 | 30 | 12 | 2 |

The held-out set has 30 answerable and 12 unanswerable questions. It is more useful than C3’s split but still small for high-confidence conclusions.

---

## 5. Strategy A — Original BM25

Held-out test:

| Metric | Numerator | Denominator | Value |
|---|---:|---:|---:|
| Recall@1 | 9 | 30 | 0.300 |
| Recall@3 | 13 | 30 | 0.433 |
| Recall@5 | 13 | 30 | 0.433 |
| Precision@5 | 14 | 150 | 0.093 |
| MRR | 10.833 | 30 | 0.361 |
| Evidence miss | 17 | 30 | 0.567 |

Baseline B policy over A:

| Metric | Numerator | Denominator | Value |
|---|---:|---:|---:|
| Answerable coverage | 16 | 30 | 0.533 |
| Evidence recall | 13 | 30 | 0.433 |
| Correct abstention | 4 | 12 | 0.333 |
| False accept | 8 | 12 | 0.667 |
| False reject | 14 | 30 | 0.467 |

Index build: ~232 ms. Test query p50/p95: 0.31 / 2.95 ms.

---

## 6. Strategy B — Field-weighted BM25

Held-out test:

| Metric | Numerator | Denominator | Value |
|---|---:|---:|---:|
| Recall@1 | 8 | 30 | 0.267 |
| Recall@3 | 12 | 30 | 0.400 |
| Recall@5 | 14 | 30 | 0.467 |
| Precision@5 | 18 | 150 | 0.120 |
| MRR | 10.117 | 30 | 0.337 |
| Evidence miss | 16 | 30 | 0.533 |

Baseline B policy:

| Metric | Numerator | Denominator | Value |
|---|---:|---:|---:|
| Answerable coverage | 16 | 30 | 0.533 |
| Evidence recall | 14 | 30 | 0.467 |
| Correct abstention | 5 | 12 | 0.417 |
| False accept | 7 | 12 | 0.583 |
| False reject | 14 | 30 | 0.467 |

Index build: ~195 ms. Test query p50/p95: 0.65 / 3.02 ms.

B improves Precision@5 and Recall@5 slightly over A, but A has better Recall@1, Recall@3 and MRR on this harder multilingual split.

---

## 7. Strategy C and D — blocked

No suitable local multilingual model/runtime is available.

- Local model candidate: `all-MiniLM-L6-v2`, ONNX, 384 dimensions.
- It is English-only, not multilingual.
- No installed runtime: `onnxruntime-node`, `onnxruntime-web`, `@xenova/transformers`, `@huggingface/transformers` are absent.
- No local Python `torch`, `sentence-transformers` or `onnxruntime`.

No weights were downloaded and no dependency was installed.

**Strategy C:** blocked.  
**Strategy D:** blocked. No hypothetical hybrid metrics are reported.

Smallest decision required:

1. Approve a known multilingual embedding model plus an offline runtime; or
2. Explicitly limit semantic evaluation to English and leave pure-Russian unsupported.

---

## 8. Evidence-validation policies

All thresholds were selected on calibration only. Test denominators: 30 answerable, 12 unanswerable.

| Strategy | Policy | Threshold | Test coverage | Test evidence recall | Correct abstention | False accept | False reject |
|---|---|---:|---:|---:|---:|---:|---:|
| B | Baseline | — | 16/30 = 0.533 | 14/30 = 0.467 | 5/12 = 0.417 | 7/12 = 0.583 | 14/30 = 0.467 |
| B | Top score | 6 | 16/30 = 0.533 | 14/30 = 0.467 | 7/12 = 0.583 | 5/12 = 0.417 | 14/30 = 0.467 |
| B | Margin | 6 | 3/30 = 0.100 | 3/30 = 0.100 | 12/12 = 1.000 | 0/12 = 0.000 | 27/30 = 0.900 |
| B | Coverage | 0.4 | 13/30 = 0.433 | 12/30 = 0.400 | 8/12 = 0.667 | 4/12 = 0.333 | 17/30 = 0.567 |
| B | Exact phrase | — | 3/30 = 0.100 | 3/30 = 0.100 | 12/12 = 1.000 | 0/12 = 0.000 | 27/30 = 0.900 |
| B | Top score + coverage | 9 | 8/30 = 0.267 | 8/30 = 0.267 | 10/12 = 0.833 | 2/12 = 0.167 | 22/30 = 0.733 |
| A | Baseline | — | 16/30 = 0.533 | 13/30 = 0.433 | 4/12 = 0.333 | 8/12 = 0.667 | 14/30 = 0.467 |
| A | Margin | 2 | 9/30 = 0.300 | 8/30 = 0.267 | 11/12 = 0.917 | 1/12 = 0.083 | 21/30 = 0.700 |
| A | Top score | 9 | 6/30 = 0.200 | 6/30 = 0.200 | 11/12 = 0.917 | 1/12 = 0.083 | 24/30 = 0.800 |

The trade-off is stark: margin/exact-phrase policies achieve perfect abstention but reject 90% of answerable questions. Top-score and coverage policies are less extreme but still accept many unanswerable cases.

---

## 9. Language results

### Strategy B, held-out test

| Language mode | Answerable | Unanswerable | Recall@5 | Precision@5 | MRR | Coverage | Evidence recall | Correct abstention | False accept |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| English | 14 | 6 | 12/14 = 0.857 | 16/70 = 0.229 | 8.117/14 = 0.580 | 14/14 = 1.000 | 12/14 = 0.857 | 0/6 = 0.000 | 6/6 = 1.000 |
| Pure Russian | 10 | 6 | 0/10 = 0.000 | 0/50 = 0.000 | 0/10 = 0.000 | 0/10 = 0.000 | 0/10 = 0.000 | 5/6 = 0.833 | 1/6 = 0.167 |
| Russian + Latin proper nouns | 6 | 0 | 2/6 = 0.333 | 2/30 = 0.067 | 2/6 = 0.333 | 2/6 = 0.333 | 2/6 = 0.333 | — | — |

Pure-Russian retrieval over the English manuscript is **0/10** with Strategy B. The current lexical design cannot satisfy the multilingual objective.

---

## 10. Failure analysis

### Strategy B held-out misses

Answerable IDs missed: `C4-article228-EN1`, `C4-article228-RU1..RU4`, `C4-liar-RU1/RU2`, `C4-fidonet-RU1..RU4`, `C4-birthplace-EN1`, `C4-birthplace-RU1/RU2`, `C4-prigozhin-RU3/RU4`.

Strategy A additionally missed `C4-icons-EN1`.

### Unanswerable cases accepted by baseline B

`C4-sochi_opening-EN`, `C4-campaign-EN`, `C4-campaign-RU`, `C4-gallery-EN`, `C4-passport-EN`, `C4-harvard-EN`, `C4-injection_en-EN`.

Several Russian variants abstained only because pure-Cyrillic terms did not match; this is not evidence of robust abstention.

### Resolved / unresolved

- Pure-Russian retrieval remains unresolved and is the largest blocker.
- English retrieval is materially better than Russian: 12/14 at Recall@5.
- Russian with Latin proper nouns is weak: 2/6.
- No simple evidence feature separates relevant from lexical overlap without large false rejects.
- Strategies C/D could not test whether multilingual semantic retrieval would fix pure-Russian performance.

---

## 11. Tests and reproducibility

```bash
npx jest lib/knowledge --runInBand
```

Result: **6 suites passed, 60 tests passed.**

- Phase B: 10
- Phase C: 10
- Phase C.1: 10
- Phase C.2: 10
- Phase C.3: 10
- Phase C.4: 10

Targeted TypeScript check passed with no output.

CLI guard without `--local-evaluation`:

```json
{"mode":"local-evaluation","phase":"C4","status":"failed","code":"missing_local_evaluation"}
```

Two independent runs produced identical protocol hash, question-set hash, manifest, policy thresholds and ranking metrics. Latency varied slightly, as expected.

All integrity checks passed:

- source hash valid
- question set valid
- deterministic manifest
- stable chunk IDs
- unique chunk IDs
- fact-group integrity
- no ground-truth leakage
- no passage text in report

Raw local report: `/tmp/opencode/phase-c4-evaluation.json` (untracked).

---

## 12. Recommendation

**Do not integrate retrieval into the website or Pierrot based on this experiment.**

Measured conclusions:

- Strategy B is only marginally different from A on the held-out test: better Recall@5 and Precision@5, worse Recall@1/3 and MRR.
- English retrieval is usable enough for further research: 12/14 Recall@5.
- Pure-Russian retrieval is effectively unsupported: 0/10 Recall@5.
- Russian-with-Latin is weak: 2/6.
- Baseline B accepts 7/12 unanswerable test cases.
- Evidence policies with strong abstention reject 90% of answerable questions.
- No lexical policy provides a satisfactory evidence/coverage balance.
- Semantic/hybrid evaluation remains blocked by missing local multilingual model and runtime.

Recommended next local decision:

1. Approve a specific multilingual embedding model and offline runtime, or explicitly defer multilingual support.
2. If approved, evaluate it against this frozen C4 fixture and protocol without changing thresholds on the test set.
3. Expand the calibration and test sets; 12 unanswerable test cases is still not enough for a robust abstention policy.
4. Keep the C4 protocol and fixture hashes fixed for future comparisons.
5. Do not claim production readiness from this local experiment.

**Stopped after C4. Awaiting explicit approval before any model, database, API, production or Pierrot work.**
