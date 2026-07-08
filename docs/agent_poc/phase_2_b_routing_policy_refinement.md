# AI Agent PoC Phase 2-B Routing Policy Refinement Hypothesis

## Scope

This document proposes the next hypothesis after Phase 2-A adaptive routing evaluation.

Phase 2-B is not implemented yet. This document is a design note for future work and must not be read as a completed evaluation result.

## Phase 2-A Observation

Phase 2-A evaluated `agent-routing-v1` across 24 runs:

- Always OFF: 8 runs
- Always ON: 8 runs
- Routed: 8 runs

Formal result:

| Metric | Always OFF | Always ON | Routed |
|---|---:|---:|---:|
| Seven-axis mean | 4.571 | 4.536 | 4.357 |
| Seven-axis median | 4.500 | 4.643 | 4.214 |
| Median evaluationElapsedMs | 10912.5 ms | 24493.5 ms | 21696.0 ms |
| Mean total tokens | 2337.5 | 6417.1 | 9189.0 |

Routing result:

| Metric | Value |
|---|---:|
| routedRunCount | 8 |
| agentInvocationRate | 1.000 |
| avoidedAgentRate | 0.000 |
| `agent_workflow` routed executions | 8 |
| `single_pass` routed executions | 0 |

Conclusion:

`agent-routing-v1` collapsed into Always Agent Workflow behavior for the formal dataset. The policy did not demonstrate cost-aware selective orchestration.

## Root Cause Analysis

The current policy is structurally conservative:

```ts
const mode = reasons.length > 0 ? "agent_workflow" : "single_pass";
```

This means any single matched reason invokes Agent workflow.

Current reasons:

- requirement contains ambiguity or scope-planning markers
- requirement contains multiple risk or failure markers
- requirement spans multiple scope or policy concerns
- evaluation case expects broad multi-document coverage
- retrieval context spans many unique documents
- multi-clause requirement includes risk or scope signals

The formal dataset intentionally contains product-rule, risk, scope, lifecycle, validation, notification, and ambiguity concerns. As a result, nearly every realistic development request gets at least one reason.

Observed route decisions for the six cases:

| Case | Key signals | v1 decision reason |
|---|---|---|
| AGENT-001 | clauseCount 4, riskKeywordCount 2 | risk + multi-clause |
| AGENT-002 | riskKeywordCount 2 | risk |
| AGENT-003 | ambiguityMarkerCount 3, riskKeywordCount 2 | ambiguity + risk |
| AGENT-004 | clauseCount 4, riskKeywordCount 2 | risk + multi-clause |
| AGENT-005 | scopeKeywordCount 2 | scope |
| AGENT-006 | ambiguityMarkerCount 2, scopeKeywordCount 2 | ambiguity + scope |

Failure domain:

- router decision policy failure

Not the primary failure:

- routing schema
- routing metadata persistence
- evaluation harness
- structured output schema
- provider integration

## Design Problem

The router must distinguish:

- "Agent may help"
- "Agent is worth its cost"

`agent-routing-v1` only detects the first. Phase 2-B should evaluate the second.

The router also needs a credible negative decision path. A cost-aware router that never chooses `single_pass` cannot prove cost-aware behavior.

## Phase 2-B Hypothesis

Primary hypothesis:

```text
A calibrated deterministic router that requires stronger combined evidence can avoid Agent workflow
for low-risk or near-ceiling cases while preserving Agent workflow for cases with demonstrated
ambiguity, lifecycle, or cross-field consistency risk.
```

Dataset hypothesis:

```text
The Phase 2-A dataset is too dense with risk/scope markers to evaluate avoidance behavior.
Phase 2-B needs additional public-safe low-risk and near-ceiling cases before another formal run.
```

Policy hypothesis:

```text
Routing should use weighted signal scoring and minimum trigger combinations rather than
"any reason invokes Agent workflow".
```

Failure hypothesis:

```text
If calibrated routing still cannot avoid Agent workflow without losing quality, deterministic
input-side routing is too weak for this workload and should remain experimental.
```

## Candidate Policy Direction

Possible `agent-routing-v2` behavior:

- Keep deterministic and non-LLM.
- Keep explainable reasons.
- Do not add provider-backed routing calls.
- Do not persist hidden reasoning.
- Do not change default `/api/generate` behavior.

Candidate scoring:

| Signal | Suggested weight | Note |
|---|---:|---|
| ambiguityMarkerCount | 2 | Stronger indicator for planning/review value |
| riskKeywordCount | 1 | Common in normal requirements; should not trigger alone too easily |
| scopeKeywordCount | 1 | Common in UI/API tasks; should not trigger alone too easily |
| clauseCount >= 4 | 1 | Weak complexity indicator |
| expectedSourceBreadth >= 5 | 1 | Evaluation-only signal unless safely available |
| retrievalUniqueDocumentCount >= 5 | 1 | Requires retrieval-before-routing or two-stage routing |
| lifecycle / rollback / cleanup domain | 2 | Stronger Agent candidate |
| explicit unresolved scope | 2 | Stronger Agent candidate |

Candidate threshold:

```text
agent_workflow if score >= 4
single_pass otherwise
```

This is only a hypothesis. It must be tested with dry-run routing simulation before any real LLM evaluation.

## Low-Risk Dataset Gap

Phase 2-A reused six Phase 1-E cases. These were not designed to provide a balanced routing calibration set.

Phase 2-B should add public-safe synthetic cases such as:

| Candidate case type | Expected route |
|---|---|
| Simple label text change | single_pass |
| Add one static empty-state message | single_pass |
| Add one optional UI field with existing API support | single_pass |
| Simple list sort toggle with clear existing parameter | single_pass |
| Profile image lifecycle rollback | agent_workflow |
| Ambiguous cache / CDN scope | agent_workflow |
| Notification policy exception | agent_workflow |
| Multi-document validation/security behavior | agent_workflow |

The new cases should be committed as public-safe synthetic evaluation data before formal scoring.

## Dry-Run Gate Before Real LLM Evaluation

Before spending API quota, Phase 2-B should run routing-only simulation.

Required gate:

| Metric | Target |
|---|---:|
| routed `single_pass` decisions | at least 25% |
| routed `agent_workflow` decisions | at least 25% |
| known high-risk cases routed to Agent | 100% for selected must-route cases |
| known low-risk cases routed to single-pass | 100% for selected must-avoid cases |

If the dry-run gate fails, do not run real LLM evaluation.

## Evaluation Plan

Only after the dry-run gate passes:

1. Commit synthetic expanded evaluation cases.
2. Generate Always OFF / Always ON / Routed bundles.
3. Create blind bundle and sample mapping.
4. Use blind manual scoring.
5. Summarize quality, latency, token usage, and routing metrics.
6. Preserve negative or partial results.

Compare:

- Always OFF
- Always ON
- Routed v2

Key metrics:

- routed seven-axis mean
- routed vs OFF win/tie/loss
- routed vs ON win/tie/loss
- agentInvocationRate
- avoidedAgentRate
- routed / Always ON elapsed ratio
- routed / Always ON token ratio
- known-benefit recall
- known-non-benefit avoidance

## Adoption Gate

Do not adopt routed mode as default unless:

- Routed quality is not materially worse than Always OFF.
- Routed preserves the Agent-relevant axes where Agent ON helped.
- Routed token usage is meaningfully lower than Always ON.
- Routed elapsed time is meaningfully lower than Always ON.
- `avoidedAgentRate` is non-zero and meaningful.
- Failure cases are documented.

## Non-Goals

Phase 2-B design does not propose:

- LLM-based router
- provider-backed routing call
- multi-agent debate
- reviewer prompt tuning
- GenerationOutput schema changes
- RAG retrieval changes
- vector collection changes
- default behavior change
- production adoption

## Recommended Next Step

The next implementation step, if pursued, should be:

```text
Phase 2-B dry-run routing calibration
```

It should add:

- expanded public-safe evaluation cases
- deterministic `agent-routing-v2` candidate policy
- routing-only simulation script or test
- no external LLM calls
- no Qdrant calls
- no Embeddings calls

Only after routing-only simulation demonstrates a meaningful mix of `single_pass` and `agent_workflow` should real formal evaluation be considered.
