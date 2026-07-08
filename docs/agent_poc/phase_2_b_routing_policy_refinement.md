# AI Agent PoC Phase 2-B Routing Policy Refinement

## Scope

This document proposes the next hypothesis after Phase 2-A adaptive routing evaluation.

Phase 2-B dry-run calibration is implemented as a routing-only simulation.
Phase 2-B formal evaluation was then completed with the same 24-run routing
matrix used in Phase 2-A.

Implemented scope:

- public-safe routing calibration cases
- deterministic `agent-routing-v2-candidate`
- routing-only calibration command
- no OpenAI API call
- no Embeddings API call
- no Qdrant call
- no `/api/generate` default behavior change

Formal evaluation scope:

- Always OFF: single-pass grounded generation
- Always ON: bounded Agent workflow
- Routed v2: deterministic `agent-routing-v2-candidate`
- Provider/model: OpenAI `gpt-5.4-mini`
- Dataset: 6 public-safe synthetic Agent evaluation cases
- Run matrix: 24 runs, 8 per mode
- Scoring: blind manual scoring, seven-axis rubric

This is a system-level orchestration comparison for this tested workload only.
It is not a general claim about Agent routing, provider/model quality, or
production readiness.

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

## Candidate Policy Implementation

Implemented `agent-routing-v2-candidate` behavior:

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
| validation / security detail | 3 | High-risk input handling and internal detail masking |

Candidate threshold:

```text
agent_workflow if score >= 4
single_pass otherwise
```

This policy is implemented only as a candidate policy for dry-run calibration.
`agent-routing-v1` remains the existing Phase 2-A routing policy for backward
compatibility and reproducibility.

## Low-Risk Dataset Gap

Phase 2-A reused six Phase 1-E cases. These were not designed to provide a balanced routing calibration set.

Phase 2-B adds public-safe synthetic calibration cases:

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

The calibration dataset is stored separately from the Phase 1-E / Phase 2-A
formal six-case dataset:

```text
data/agent/evaluation/agent_routing_calibration_cases.json
```

This avoids changing the existing six-case formal evaluation schema or previous
history.

## Dry-Run Gate Before Real LLM Evaluation

Before spending API quota, Phase 2-B runs routing-only simulation.

Required gate:

| Metric | Target |
|---|---:|
| routed `single_pass` decisions | at least 25% |
| routed `agent_workflow` decisions | at least 25% |
| known high-risk cases routed to Agent | 100% for selected must-route cases |
| known low-risk cases routed to single-pass | 100% for selected must-avoid cases |

If the dry-run gate fails, do not run real LLM evaluation.

Dry-run command:

```bash
npm run agent:routing:calibrate
```

The command reads public-safe calibration cases and evaluates only deterministic
routing decisions. It does not call a provider, Qdrant, or Embeddings API.

Implemented dry-run result:

| Metric | Value |
|---|---:|
| totalCases | 8 |
| passRate | 1.000 |
| singlePassRate | 0.500 |
| agentWorkflowRate | 0.500 |
| lowRiskAvoidanceRate | 1.000 |
| highRiskRouteRate | 1.000 |
| gatePassed | true |

## Evaluation Plan

Only after the dry-run gate passes:

1. Commit synthetic expanded evaluation cases.
2. Generate Always OFF / Always ON / Routed bundles.
3. Create blind bundle and sample mapping.
4. Use blind manual scoring.
5. Summarize quality, latency, token usage, and routing metrics.
6. Preserve negative or partial results.

Phase 2-B formal evaluation commands are prepared separately from Phase 2-A:

```bash
npm run agent:routing:v2:evaluate:run
npm run agent:routing:v2:evaluate:summarize
```

`agent:routing:v2:evaluate:run` executes real provider-backed generation,
Agent workflow, RAG retrieval, and embedding calls. It should only be run from a
normal local PowerShell after manual confirmation. Codex sandbox execution must
not be treated as a valid real-environment result.

Phase 2-B formal output paths:

| Artifact | Path |
|---|---|
| Raw bundle | `data/agent/evaluation/phase_2_b_raw_bundle.json` |
| Blind bundle | `data/agent/evaluation/phase_2_b_blind_bundle.json` |
| Sample mapping | `data/agent/evaluation/phase_2_b_sample_mapping.json` |
| Manual score template | `data/agent/evaluation/phase_2_b_manual_score_template.md` |
| Manual scores | `data/agent/evaluation/phase_2_b_manual_scores.json` |
| Summary | `data/agent/evaluation/phase_2_b_summary.json` |
| Report | `data/agent/evaluation/phase_2_b_report.md` |

## Blind Scoring Schema Note

Phase 2-B initial blind manual scoring used `phase_2_b_blind_bundle.json`,
which included each sample's `finalOutput` but did not include the actual
`GenerationOutput` JSON schema definition.

The `jsonStructureStability` axis was therefore evaluated by visible structure:

- required common fields were present:
  `summary`, `spec`, `acceptanceCriteria`, `jiraTasks`,
  `implementationPlan`, `reviewPoints`, `risks`
- array / string / object structure was stable across samples
- `jiraTasks` had stable `title`, `description`, and `type` fields
- no empty field or obvious structural breakage was observed

This does not invalidate the Phase 2-B scoring, because the other six axes were
fully assessable from `requirementMemo`, `expectations`, and `finalOutput`.
However, the `jsonStructureStability` score should be treated as lower
confidence than the other six axes unless the evaluator is also given the actual
schema.

For future blind scoring, the blind bundle and manual scoring template include
the routing-free `GenerationOutput` schema. This preserves blindness because it
does not include raw bundle data, sample mapping, routing mode, Agent metadata,
review history, provider, latency, or token usage.

## Context-Isolated Blind Evaluator Check

After introducing the reusable blind evaluation package workflow, Phase 2-B was
also scored by a separate context-isolated Codex evaluator session using only:

- `input/blind_bundle.json`
- `input/generation_output_schema.json`
- `input/output_schema.json`
- `input/scoring_rubric.md`
- `scoring_prompt.md`

The evaluator reported:

- `output/manual_scores.json` was created.
- 24 samples were scored.
- The score JSON followed `input/output_schema.json`.
- No unscorable or ambiguous sample was reported.
- Only the permitted files in the blind workspace were used.

This run used `scoringMethod: context-isolated-blind-llm`. It is not an external
independent evaluator result, because it still uses the Codex/model family. It is
recorded as a workflow validation and secondary scoring check for the
context-isolated evaluation architecture.

Context-isolated scoring aggregate:

| Metric | Always OFF | Always ON | Routed v2 |
|---|---:|---:|---:|
| Seven-axis mean | 4.768 | 4.696 | 4.661 |
| Seven-axis median | 4.857 | 4.714 | 4.857 |

Paired result:

| Comparison | Routed wins | Ties | Routed losses |
|---|---:|---:|---:|
| Routed v2 vs Always OFF | 0 | 3 | 5 |
| Routed v2 vs Always ON | 2 | 2 | 4 |

The cost and routing metrics are unchanged because they come from the same raw
formal evaluation bundle:

| Metric | Value |
|---|---:|
| agentInvocationRate | 0.500 |
| avoidedAgentRate | 0.500 |
| Routed v2 / Always ON elapsed ratio | 0.894 |
| Routed v2 / Always ON token ratio | 0.691 |

This secondary check reaches the same practical decision as the original manual
scoring: Routed v2 avoids Agent workflow for half of routed runs and reduces
cost relative to Always ON, but it does not beat Always OFF on quality. Therefore
Routed v2 remains experimental and should not become the default policy.

## Formal Evaluation Result

Conclusion Category: **B. Partial routing improvement with quality trade-off**

Phase 2-B fixed the primary Phase 2-A routing failure: routed mode no longer
collapsed into Always Agent Workflow. The candidate router selected
`single_pass` for 4 routed runs and `agent_workflow` for 4 routed runs.

The routed path reduced elapsed time and token usage relative to Always ON, but
it did not beat Always OFF on mean quality. Therefore `agent-routing-v2-candidate`
is a meaningful improvement over v1 as a cost-aware routing candidate, but it
should not become the default policy.

## Quality Summary

| Metric | Always OFF | Always ON | Routed v2 |
|---|---:|---:|---:|
| Seven-axis mean | 4.732 | 4.661 | 4.696 |
| Seven-axis median | 4.786 | 4.714 | 4.714 |

Interpretation:

- Routed v2 was higher than Always ON on mean score.
- Routed v2 was lower than Always OFF on mean score.
- The difference between modes was small, but the adoption gate requires routed
  quality not to be materially worse than Always OFF.

## Axis Results

| Axis | OFF | ON | Routed v2 | Routed - OFF | Routed - ON |
|---|---:|---:|---:|---:|---:|
| Product-specific rule coverage | 4.250 | 4.250 | 4.250 | 0.000 | 0.000 |
| Unsupported assumption control | 5.000 | 5.000 | 5.000 | 0.000 | 0.000 |
| Acceptance criteria specificity | 4.750 | 4.750 | 4.750 | 0.000 | 0.000 |
| Jira decomposition appropriateness | 5.000 | 4.625 | 4.750 | -0.250 | +0.125 |
| JSON structure stability | 5.000 | 5.000 | 5.000 | 0.000 | 0.000 |
| Cross-field consistency | 4.875 | 5.000 | 5.000 | +0.125 | 0.000 |
| Requirement-to-task traceability | 4.250 | 4.000 | 4.125 | -0.125 | +0.125 |

`jsonStructureStability` should be read with the schema note above. The generated
outputs were validated by the repository's Zod schema, but the initial blind
evaluator did not receive the actual schema definition.

## Paired Results

| Comparison | Routed wins | Ties | Routed losses |
|---|---:|---:|---:|
| Routed v2 vs Always OFF | 1 | 5 | 2 |
| Routed v2 vs Always ON | 3 | 3 | 2 |

Pair-level interpretation:

- Routed v2 was more competitive with Always ON than Phase 2-A routed v1.
- Routed v2 still lost to Always OFF in more pairs than it won.
- The result supports keeping selective routing experimental rather than default.

## Routing Metrics

| Metric | Value |
|---|---:|
| routedRunCount | 8 |
| agentInvocationRate | 0.500 |
| avoidedAgentRate | 0.500 |
| `agent_workflow` routed executions | 4 |
| `single_pass` routed executions | 4 |

Reason counts:

| Reason | Count |
|---|---:|
| multiple risk or failure markers contribute weak routing evidence | 6 |
| multi-clause requirement contributes weak routing evidence | 4 |
| candidate score stayed below Agent workflow threshold | 4 |
| candidate score reached Agent workflow threshold | 4 |
| ambiguity or planning marker contributes strong routing evidence | 2 |
| lifecycle, rollback, or cleanup domain contributes strong evidence | 2 |
| explicit unresolved scope contributes strong evidence | 2 |
| multiple scope markers contribute weak routing evidence | 2 |
| validation or security detail contributes strong evidence | 1 |
| notification exception policy contributes strong evidence | 1 |

## Latency And Usage

| Metric | Always OFF | Always ON | Routed v2 |
|---|---:|---:|---:|
| Mean evaluation elapsed ms | 8617.5 | 12335.9 | 11022.9 |
| Median evaluation elapsed ms | 8494.0 | 12627.5 | 11142.0 |
| Mean input tokens | 1031.4 | 4492.0 | 2797.8 |
| Mean output tokens | 1350.0 | 1817.1 | 1562.0 |
| Mean total tokens | 2381.4 | 6309.1 | 4359.8 |
| Mean retrieval latency ms | 302.9 | 255.1 | 279.4 |

Cost ratios:

| Ratio | Value |
|---|---:|
| Routed v2 / Always ON elapsed ratio | 0.894 |
| Routed v2 / Always ON token ratio | 0.691 |

Interpretation:

- Routed v2 reduced mean elapsed time relative to Always ON by about 10.6%.
- Routed v2 reduced mean provider-reported total tokens relative to Always ON by
  about 30.9%.
- The reduction came from avoiding Agent workflow for half of routed runs.
- Routed v2 still remained slower and more token-heavy than Always OFF.

## Adoption Decision

Do not make routed mode the default.

Keep:

- `agent-routing-v2-candidate` as an experimental policy
- dry-run calibration before real evaluation
- fail-closed behavior for incomplete evaluation runs
- blind scoring with routing-free `GenerationOutput` schema included

Do not claim:

- routed mode improves quality over Always OFF
- deterministic routing is production-ready
- Agent routing generally reduces cost for all workloads
- this result generalizes beyond the tested dataset and environment

Recommended next hypotheses:

- add more low-risk and near-ceiling cases to test avoidance behavior
- evaluate whether retrieval-derived source breadth can improve routing decisions
- separately analyze cases where routed v2 chose `single_pass` but lost to OFF
- keep `agent-routing-v1` only as a documented negative baseline

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
