# Phase C.3 — Evidence and Abstention Audit Report

**Branch:** `phase-c3-evidence-abstention`, created from `phase-c2-retrieval-bakeoff`.

**Status:** Local audit complete. No existing Phase B/C/C.1/C.2 implementation was modified. No manuscript, parser, chunker, route, UI, auth, environment, database, API, or Pierrot change. No commit or push.

**Source SHA-256:** `cf1852c708185408b9ec1081584d62857c1f05cbd8ad1f5fd15ad7efa39d9923`

**Manifest hash:** `78f704b33c900897256a7e9a3b6263c3d7114783ae184326be0301d32f0624d2`

**Parser/chunker:** `unframed-parser-v1` / `unframed-chunker-v1`

**Evaluator:** `unframed-eval-c3-v1`

---

## 1. Files added

| File | Purpose |
|---|---|
| `lib/knowledge/evaluation/c3/types.ts` | C3 metric, feature, split, policy and audit contracts. |
| `lib/knowledge/evaluation/c3/questions.ts` | Independent 50-question challenge fixture. |
| `lib/knowledge/evaluation/c3/split.ts` | Deterministic three-way fact-group split. |
| `lib/knowledge/evaluation/c3/features.ts` | Top score, margin, coverage, exact phrase and diagnostic section-match features. |
| `lib/knowledge/evaluation/c3/policies.ts` | Independent, explainable abstention policies. |
| `lib/knowledge/evaluation/c3/evaluate.ts` | Independent C3 metrics, policy evaluation, C2 metric audit, report output. |
| `lib/knowledge/evaluation/c3/__tests__/c3.test.ts` | 10 C3 tests. |
| `scripts/knowledge/phase-c3-evaluate.ts` | Explicit local-only C3 CLI. |

---

## 2. Metric-definition audit

The independent C3 evaluator applies these definitions:

- **Retrieval success:** an answerable question is accepted by the policy **and** has at least one verified relevant chunk within the retrieval depth.
- **`relevant_results`:** only an outcome label. It is not proof of relevant retrieval.
- **False negative:** an answerable question without a verified relevant chunk, independent of abstention.
- **Correct abstention:** a verified unanswerable question rejected by the policy.
- **False positive / false accept:** a verified unanswerable question accepted by the policy.
- **Unverified questions:** excluded from scored metrics and reported separately.
- **`weak_match`:** not automatically an abstention. It is accepted or rejected according to the explicit policy under test.

### C2 defect found

C2’s `retrievalSuccessRate` uses `outcome === 'relevant_results'`, not verified relevance. It therefore overstates success for Strategy A. C2’s `correctAbstention` also treats every non-`relevant_results` outcome as abstention, including `weak_match`, which can be unsafe if a downstream policy passes weak evidence.

Independent C2 audit:

| Strategy | Split | Answerable | C2 reported success | Verified evidence success | Discrepancy |
|---|---|---:|---:|---:|---:|
| A | dev | 40 | 0.975 | 0.900 | +0.075 |
| A | calibration | 12 | 1.000 | 0.917 | +0.083 |
| A | test | 20 | 0.900 | 0.800 | +0.100 |
| B | dev | 40 | 0.975 | 0.900 | +0.075 |
| B | calibration | 12 | 1.000 | 1.000 | 0.000 |
| B | test | 20 | 0.900 | 0.900 | 0.000 |

C2 remains unchanged; C3 recomputes independently. The C2 success values should not be used as evidence metrics in future reports.

---

## 3. C3 challenge dataset

**50 questions total** — independent of the C2 fixture.

| Group | Questions |
|---|---:|
| Answerable | 20 |
| Unanswerable / misleading | 20 |
| Ambiguous / unverified | 10 |
| Verified total | 40 |
| Unverified total | 10 |

**Language balance:** 42 English, 8 Russian.

**Categories:** 11 direct factual, 5 structure, 4 specific passage, 12 absent, 6 misleading, 2 prompt-injection, 10 ambiguous.

The set includes:

- generic words that also occur in the manuscript;
- false premises;
- absent entities;
- requests for facts not present;
- topical terms appearing in irrelevant sections;
- prompt-injection text treated only as query text;
- English and Russian formulations.

All answerable cases have verified chunk or section references. All unanswerable cases were checked for the absence of the requested fact. Ambiguous cases are excluded from scored metrics.

### Split

Seed: `phase-c3-v457`.

| Split | Questions | Fact groups | Answerable | Unanswerable | Unverified |
|---|---:|---:|---:|---:|---:|
| Development | 24 | 24 | 10 | 8 | 6 |
| Calibration | 10 | 9 | 4 | 4 | 2 |
| Held-out test | 16 | 14 | 6 | 8 | 2 |

The calibration and test sets are small. Percentages below are unstable and should not be treated as precise population estimates.

---

## 4. Strategy B ranking on C3

Strategy B was used unchanged.

| Split | Recall@1 | Recall@3 | Recall@5 | Precision@5 | MRR | Answerable |
|---|---:|---:|---:|---:|---:|---:|
| Development | 0.300 | 0.500 | 0.600 | 0.240 | 0.425 | 10 |
| Calibration | 1.000 | 1.000 | 1.000 | 0.650 | 1.000 | 4 |
| Held-out test | 0.667 | 0.667 | 0.667 | 0.133 | 0.667 | 6 |

The C3 test set intentionally contains hard false-premise and generic-term cases. The low test ranking metrics reflect that challenge, not a new model change.

---

## 5. Abstention policies

All thresholds were selected on calibration only. No held-out result was used to choose a threshold.

| Policy | Threshold | Calibration evidence recall | Calibration abstention | Test coverage | Test evidence recall | Test abstention | Test false accept | Test false reject |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline B | — | 1.000 | 0.250 | 0.833 | 0.667 | 0.000 | 1.000 | 0.167 |
| Top score | 9 | 0.750 | 0.750 | 0.500 | 0.500 | 0.500 | 0.500 | 0.500 |
| Margin | 6 | 0.250 | 1.000 | 0.500 | 0.500 | **1.000** | **0.000** | 0.500 |
| Coverage | 0.70 | 0.250 | 1.000 | 0.167 | 0.167 | **1.000** | **0.000** | 0.833 |
| Distinct terms | 1 | 1.000 | 0.250 | 0.833 | 0.667 | 0.000 | 1.000 | 0.167 |
| Exact phrase | — | 0.000 | 0.750 | 0.333 | 0.333 | 0.875 | 0.125 | 0.667 |
| Top score + coverage | 9 | 0.250 | 0.750 | 0.500 | 0.500 | 0.625 | 0.375 | 0.500 |

Denominators: calibration 4 answerable / 4 unanswerable; test 6 answerable / 8 unanswerable.

### Interpretation

- **Margin** achieves perfect test abstention but rejects half of answerable questions.
- **Coverage 0.70** also achieves perfect abstention but rejects five of six answerable questions.
- **Top score 9** gives a 50/50 trade-off between evidence recall and abstention.
- **Exact phrase** rejects most answerable questions and still accepts one unanswerable case.
- **Distinct terms = 1** is effectively the baseline and provides no abstention benefit.
- No simple feature dominates. Lexical evidence alone does not cleanly separate a relevant passage from a superficial match.

`weak_match` is never counted as correct abstention unless the policy explicitly rejects it.

---

## 6. Results by language and category

### Test by language — baseline B

| Language | Answerable | Unanswerable | Coverage | Evidence recall | Abstention | False accept | False reject |
|---|---:|---:|---:|---:|---:|---:|---:|
| English | 3 | 8 | 1.000 | 0.667 | 0.000 | 1.000 | 0.000 |
| Russian | 3 | 0 | 0.667 | 0.667 | — | — | 0.333 |

### Test by language — margin policy

| Language | Answerable | Unanswerable | Coverage | Evidence recall | Abstention | False accept | False reject |
|---|---:|---:|---:|---:|---:|---:|---:|
| English | 3 | 8 | 0.333 | 0.333 | 1.000 | 0.000 | 0.667 |
| Russian | 3 | 0 | 0.667 | 0.667 | — | — | 0.333 |

Pure-Russian answerable questions remain weak: Russian with Latin proper nouns can succeed; pure Cyrillic formulations fail.

### Test by category — baseline B

| Category | Answerable | Unanswerable | Evidence recall | Abstention |
|---|---:|---:|---:|---:|
| Direct factual | 5 | 0 | 0.600 | — |
| Structure | 1 | 0 | 1.000 | — |
| Absent | 0 | 4 | — | 0.000 |
| Misleading | 0 | 3 | — | 0.000 |
| Prompt injection | 0 | 1 | — | 0.000 |

Baseline accepts every absent, misleading and injection case. That is the principal failure.

---

## 7. Error analysis

### Metric defects

- C2 success metric overcounts Strategy A by 7.5–10 percentage points.
- C2 abstention definition treats any non-`relevant_results` outcome as abstention; this is too permissive if weak evidence is later accepted.
- C2 labels remain unchanged and are not rewritten; C3 provides the independent correction.

### Retrieval failures

- **Generic-term interference:** absent and misleading questions still retrieve topical passages.
- **False premises:** C3 unanswerable cases C3-U03 through C3-U19 are accepted by baseline B.
- **Prompt injection:** C3-U19 is accepted as relevant evidence by baseline B; no instruction is executed, but the evidence is not useful.
- **Cross-language:** pure-Cyrillic C3 answerable cases remain unresolved by lexical matching.
- **Low coverage:** the margin and coverage policies abstain correctly but reject answerable questions.
- **Structure:** the C3 structure question ranked correctly; the earlier C2 C36 final-chapter miss remains unresolved from C2.
- **C10:** C2 Strategy B fixed the earlier arrest-chapter ranking by retrieving section 45 at rank 4; C3 does not retest it independently.

No manuscript passages are included in this report.

---

## 8. Tests and reproducibility

```bash
npx jest lib/knowledge --runInBand
```

Result: **5 suites passed, 50 tests passed.**

- Phase B: 10
- Phase C: 10
- Phase C.1: 10
- Phase C.2: 10
- Phase C.3: 10

Targeted TypeScript check passed with no output.

CLI guard:

```json
{"mode":"local-evaluation","phase":"C3","status":"failed","code":"missing_local_evaluation"}
```

Two independent C3 runs produced identical manifest, question-set hash, rankings and policy thresholds. All integrity checks passed:

- source hash valid
- question set valid
- deterministic manifest
- stable chunk IDs
- unique chunk IDs
- fact-group integrity
- no passage text in report

Raw local report: `/tmp/opencode/phase-c3-evaluation.json` (untracked).

---

## 9. Recommendation

**Do not integrate RAG into Pierrot or the website based on this evidence.**

The audit shows:

- Lexical ranking can find many relevant passages, but the C3 challenge set reduces test Recall@5 to 0.667.
- Baseline B accepts every verified unanswerable test case.
- Simple abstention features expose a hard trade-off: margin/coverage achieve 100% abstention but reject 50–83% of answerable questions.
- No single lexical feature safely separates relevant evidence from superficial overlap.
- Pure-Russian retrieval remains unsupported.
- The C2 success metric must be treated as overstated; C3’s evidence-based metric is the correct audit baseline.

Recommended next local step:

1. Keep C2 and C3 separate; do not rewrite C2.
2. Expand the challenge set and calibration split; 4 calibration unanswerable questions is insufficient.
3. Evaluate the margin and top-score policies on a larger, more balanced test set before choosing between them.
4. If semantic retrieval is introduced later, evaluate it against this same C3 challenge set and report the same evidence/abstention denominators.
5. Do not claim production readiness from this small local experiment.

**Stopped after the local C3 audit. Awaiting explicit approval before any further phase.**
