# AI Agent PoC Phase 2-A: Cost-Aware Adaptive Agent Routing

## 1. Purpose

Phase 2-Aでは、AI Agent PoC Phase 1-Eで得られた結論を受けて、bounded Agent workflowを常時default pathにするのではなく、どのrequestでAgent workflowを使うべきかを判断するrouting foundationを設計する。

Phase 1-Eでは、Agent ONはCross-field consistencyを明確に改善した一方で、latencyとLLM token usageが大きく増加した。そのため、次のtechnical questionはAgent workflowをさらに重くすることではなく、Agent workflowのselective use条件を定義できるかである。

Phase 2-Aの目的は、deterministicで説明可能なrouting policyにより、常時Agent ONよりcostを抑えながら、Agent ONで観測されたconsistency benefitを必要なcaseへ適用できるかを評価することである。

## 2. Phase 1 Evidence

Phase 1-E formal evaluation result:

| Metric | Agent OFF | Agent ON | Delta |
|---|---:|---:|---:|
| Common 5-axis average | 4.750 | 4.725 | -0.025 |
| Seven-axis average | 4.714 | 4.768 | +0.054 |
| Cross-field consistency | 4.375 | 5.000 | +0.625 |
| Unsupported assumption control | 4.750 | 4.875 | +0.125 |
| Jira decomposition appropriateness | 5.000 | 4.750 | -0.250 |
| Requirement-to-task traceability | 4.875 | 4.750 | -0.125 |

Operational result:

| Metric | Agent OFF | Agent ON | Observation |
|---|---:|---:|---|
| median `evaluationElapsedMs` | 8549.5 ms | 15198.5 ms | Agent ON about 1.78x |
| mean LLM `totalTokens` | 2344.0 | 7934.5 | Agent ON about 3.39x |
| embedding usage mean | 94.5 | 94.5 | equal |

Paired result:

- Agent ON wins: 2
- Agent OFF wins: 1
- Ties: 5

Revision analysis:

- AGENT-003 revision did not improve manual seven-axis score.
- AGENT-006 revision produced material improvement, Draft 4.571 to Final 5.000.
- Revision effectiveness must not be generalized from `n=2`.

Phase 1 conclusion:

```text
Agent workflow should not be the default path for every request.
Selective use is more appropriate for complex or high-value workloads where consistency,
ambiguity control, reviewable intermediate artifacts, and bounded correction matter.
```

## 3. Technical Question

```text
Can a deterministic routing policy selectively invoke bounded Agent workflow only for cases likely to benefit, preserving consistency gains while reducing latency and token cost compared with always-Agent ON?
```

This is a system-level orchestration question. It does not attempt to prove that Agent architecture alone causes quality improvement.

## 4. Hypothesis

Primary hypothesis:

```text
Requirement memos with higher ambiguity, higher cross-field consistency risk, broader product-rule surface, or stronger need for reviewable intermediate artifacts are more likely to benefit from Agent workflow.
```

Cost hypothesis:

```text
A deterministic router can avoid Agent ON for near-ceiling or low-risk cases, reducing average latency and LLM token usage compared with always-Agent ON.
```

Failure hypothesis:

```text
If routing signals are weak or overfit to the small Phase 1-E dataset, the router will either collapse into always-Agent ON / always-Agent OFF behavior or miss cases where Agent workflow materially helps.
```

## 5. Candidate Routing Signals

Phase 2-A starts with a deterministic, non-LLM router. It should not add another provider-backed LLM step.

Candidate input-side signals:

| Signal | Rationale |
|---|---|
| requirement memo ambiguity markers | Ambiguous scope was a key case where Agent ON improved AGENT-006. |
| broad scope wording | "整理したい", "どこまで", "安全で使いやすく" may indicate planning/review value. |
| multiple requirement clauses | More clauses increase cross-field consistency risk. |
| explicit risk / failure wording | Error, rollback, safety, partial failure may benefit from review and bounded correction. |
| expected multi-document coverage | More source families can increase traceability and consistency risk. |
| source composition from retrieval | Diverse sources may increase need to reconcile rules across fields. |
| high-stakes implementation concern | Security, lifecycle, data integrity, notification exceptions, or ambiguous product policy. |

Signals must be explainable and persisted as routing metadata. They must not include hidden chain-of-thought or raw provider reasoning.

## 6. Proposed Router Output

Conceptual output:

```ts
type AgentRoutingDecision = {
  mode: "single_pass" | "agent_workflow";
  policyVersion: "agent-routing-v1";
  reasons: string[];
  signals: {
    ambiguityScore: number;
    clauseCount: number;
    riskKeywordCount: number;
    expectedSourceBreadth?: number;
    retrievalUniqueDocumentCount?: number;
  };
};
```

This is a conceptual design only. Phase 2-A implementation may refine field names, but the router should remain deterministic and explainable.

## 7. Baselines

Phase 2-A compares three modes.

| Mode | Definition |
|---|---|
| Always OFF | existing single-pass grounded generation, `ragMode=on`, `ragContextPolicy=document-diversity-v1` |
| Always ON | existing bounded Agent workflow, `agentMode=on` |
| Routed | deterministic router chooses Always OFF behavior or Agent workflow per case |

For formal comparison, the controlled conditions should match Phase 1-E as much as possible:

- same provider
- same model
- same synthetic corpus
- same chunk strategy
- same embedding model
- same context policy
- same final `GenerationOutput` schema
- same evaluation rubric

## 8. Evaluation Dataset

Phase 2-A may start from the existing six Phase 1-E cases:

- AGENT-001
- AGENT-002
- AGENT-003
- AGENT-004
- AGENT-005
- AGENT-006

However, routing evaluation is weaker if it only uses the original six cases. A stronger formal evaluation should add a small number of public-safe synthetic cases that deliberately vary:

- low-risk near-ceiling cases
- ambiguous scope cases
- lifecycle / rollback cases
- multi-document product-rule cases
- unrelated simple feature cases
- cases likely to be harmed by over-processing

Any added cases must be committed as public-safe synthetic data before formal scoring. Do not use private or company-confidential requirements.

## 9. Metrics

Quality metrics:

- Common 5-axis average
- Seven-axis average
- Cross-field consistency
- Unsupported assumption control
- Jira decomposition appropriateness
- Requirement-to-task traceability
- Paired win / tie / loss against Always OFF and Always ON

Routing metrics:

| Metric | Definition |
|---|---|
| agentInvocationRate | routed runs that choose Agent workflow / all routed runs |
| avoidedAgentRate | routed runs that choose single-pass / all routed runs |
| routedVsAlwaysOnCostRatio | routed cost / always-Agent-ON cost |
| routedVsAlwaysOffQualityDelta | routed quality - always-Agent-OFF quality |
| routedVsAlwaysOnQualityDelta | routed quality - always-Agent-ON quality |
| knownBenefitCaseRecall | cases where Agent ON won in Phase 1-E and router chose Agent workflow |
| knownNonBenefitAvoidance | ties or OFF-win cases where router avoided Agent workflow |

Operational metrics:

- `evaluationElapsedMs`
- provider-reported input / output / total tokens
- embedding usage
- LLM step count
- tool invocation count
- revision invocation count
- router decision latency

Instrumentation audit:

- timestamp plausibility
- routing decision presence
- terminal state
- retrieval parity where applicable
- token aggregation semantics
- no hidden input/rubric leakage

## 10. Success / Partial / Negative Framing

Success:

- Routed mode keeps Cross-field consistency close to Always ON.
- Routed common 5-axis average is no worse than Always OFF within predefined tolerance.
- Routed seven-axis average is equal to or better than Always OFF.
- Routed latency and LLM token usage are meaningfully lower than Always ON.
- Router invokes Agent workflow for at least one known or independently observed beneficial case.
- Router avoids Agent workflow for at least one low-risk or near-ceiling case.

Partial success:

- Routed mode reduces cost, but quality is only comparable to Always OFF.
- Routed mode preserves quality, but cost reduction is small.
- Router identifies some beneficial cases but misses one important case.
- Router works on the seed dataset but requires more cases before adoption.

Negative result:

- Router collapses to Always ON or Always OFF.
- Router misses cases where Agent ON materially improves quality.
- Router routes too many low-risk cases to Agent ON without quality gain.
- Routing metadata adds complexity without actionable decision value.
- Deterministic signals do not correlate with observed Agent benefit.

Negative result must be preserved as a valid technical outcome.

## 11. Independent Evaluation

Formal quality scoring should continue to separate implementation and final quality assessment.

Recommended flow:

1. Codex implements routing and evaluation harness.
2. Codex generates raw bundle, blind bundle, and sample mapping.
3. Independent evaluator scores blind samples only.
4. Codex ingests manual scores and aggregates quality, routing, retrieval, latency, and usage metrics.

Codex must not use its own generated output as final quality ground truth. Reviewer findings must not be converted into quality scores.

## 12. Non-goals

Phase 2-A does not implement:

- LLM-based router
- additional provider-backed routing call
- multi-agent debate
- multi-model role assignment
- reviewer prompt tuning
- reviewer severity recalibration
- retrieval query rewrite
- query decomposition
- multi-query retrieval
- MMR
- reranking
- hybrid retrieval
- new embedding model
- new vector collection
- `GenerationOutput` schema change
- Phase 1 result rewriting

These may become future candidates, but Phase 2-A focuses on cost-aware selective orchestration.

## 13. Failure-Domain Discipline

Maintain existing distinctions:

- routed to Agent workflow does not mean quality improved
- routed to single-pass does not mean Agent had no possible value
- Reviewer finding is not independent quality ground truth
- revision invoked is not quality improved
- retrieval parity is not strict causal proof
- selected source does not guarantee every rule is generated
- candidate source absent is not generator failure

For routing-specific analysis, distinguish:

- router signal failure
- router decision policy failure
- retrieval/source composition issue
- generation quality issue
- reviewer/revision issue
- evaluation harness issue
- instrumentation issue

## 14. Expected Implementation Scope

Suggested implementation phases after this design is accepted:

1. Routing schema and deterministic policy.
2. Unit tests for routing signals and decisions.
3. API/evaluation integration without changing existing default behavior.
4. Routing metadata persistence in evaluation artifacts.
5. Formal run harness for Always OFF / Always ON / Routed.
6. Blind bundle generation and manual score ingestion.
7. Aggregation of quality, routing, cost, and failure-domain metrics.
8. Documentation of result and adoption decision.

Do not change existing `/api/generate` default behavior without an explicit routing mode or evaluation-only entrypoint.

## 15. Adoption Gate

Phase 2-A should not make routed mode the public default unless the evaluation shows a clear reason.

Adoption can be considered if:

- routed quality is comparable to Always ON on the axes where Agent matters,
- routed cost is meaningfully lower than Always ON,
- router decisions are explainable,
- failure cases are understood,
- no security or data exposure regression is introduced.

If these conditions are not met, keep the router as an experimental evaluation artifact and preserve the negative or partial result.

## 16. Claims To Avoid

Do not claim:

- Agent routing is generally optimal.
- Agent workflow is broadly superior.
- routing proves causality of Agent improvement.
- deterministic router can replace manual evaluation.
- Phase 2-A result generalizes to all development tasks.
- cost reduction is production-ready.
- routed mode should be default before formal evaluation.

Accurate framing:

- tested workload only
- deterministic routing PoC
- cost-aware orchestration experiment
- formal PoC evaluation
- selective Agent use hypothesis
- small synthetic dataset unless expanded
