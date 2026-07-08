# AI Agent PoC Phase 2-A Adaptive Routing Evaluation Results

## Scope

This document records the formal Phase 2-A result for the tested workload only.

Comparison:

- Always OFF: single-pass grounded generation, `ragMode=on`, `ragContextPolicy=document-diversity-v1`
- Always ON: bounded Agent workflow, `agentMode=on`
- Routed: deterministic `agent-routing-v1` chooses `single_pass` or `agent_workflow`
- Provider/model: OpenAI `gpt-5.4-mini`
- Dataset: 6 public-safe synthetic Agent evaluation cases
- Run matrix: 24 runs, 8 per mode
- Scoring: blind manual scoring, seven-axis rubric

This is a system-level orchestration comparison. It is not a strict causal ablation and does not establish general Agent routing superiority or provider/model superiority.

## Conclusion

Conclusion Category: **D. Negative routing result**

The deterministic router did not satisfy the Phase 2-A adoption gate.

Observed result:

- Routed mode quality was lower than both Always OFF and Always ON.
- Routed mode selected `agent_workflow` for all 8 routed runs.
- `avoidedAgentRate` was 0.
- Routed token usage was higher than Always ON.
- Routed elapsed time was lower than Always ON in this run, but that does not represent a successful cost-aware routing result because the router did not actually avoid Agent workflow.

The result is still useful: it falsifies the current `agent-routing-v1` policy as a cost-aware selective orchestration strategy for this dataset. The router should remain experimental and must not become the public default.

## Run Matrix

| Item | Count |
|---|---:|
| Total runs | 24 |
| Always OFF | 8 |
| Always ON | 8 |
| Routed | 8 |
| Completed | 22 |
| Completed with findings | 2 |
| Failed | 0 |

## Quality Summary

| Metric | Always OFF | Always ON | Routed |
|---|---:|---:|---:|
| Seven-axis mean | 4.571 | 4.536 | 4.357 |
| Seven-axis median | 4.500 | 4.643 | 4.214 |

## Axis Results

| Axis | OFF | ON | Routed | Routed - OFF | Routed - ON |
|---|---:|---:|---:|---:|---:|
| Product-specific rule coverage | 4.375 | 4.250 | 4.000 | -0.375 | -0.250 |
| Unsupported assumption control | 4.375 | 4.625 | 4.625 | +0.250 | 0.000 |
| Acceptance criteria specificity | 4.625 | 4.500 | 4.250 | -0.375 | -0.250 |
| Jira decomposition appropriateness | 4.750 | 4.500 | 4.000 | -0.750 | -0.500 |
| JSON structure stability | 5.000 | 5.000 | 5.000 | 0.000 | 0.000 |
| Cross-field consistency | 4.625 | 4.625 | 4.750 | +0.125 | +0.125 |
| Requirement-to-task traceability | 4.250 | 4.250 | 3.875 | -0.375 | -0.375 |

Routed mode improved only:

- Unsupported assumption control vs Always OFF
- Cross-field consistency vs both baselines

But the improvements were not enough to offset lower product-specific rule coverage, acceptance criteria specificity, Jira decomposition appropriateness, and requirement-to-task traceability.

## Paired Results

| Comparison | Routed wins | Ties | Routed losses |
|---|---:|---:|---:|
| Routed vs Always OFF | 2 | 2 | 4 |
| Routed vs Always ON | 3 | 1 | 4 |

Pair-level results:

| Pair | Case | Run | OFF | ON | Routed | Routed - OFF | Routed - ON |
|---|---|---:|---:|---:|---:|---:|---:|
| ROUTE-PAIR-001 | AGENT-001 | 1 | 5.000 | 5.000 | 4.000 | -1.000 | -1.000 |
| ROUTE-PAIR-002 | AGENT-002 | 1 | 5.000 | 4.571 | 4.714 | -0.286 | +0.143 |
| ROUTE-PAIR-003 | AGENT-003 | 1 | 4.286 | 4.000 | 4.286 | 0.000 | +0.286 |
| ROUTE-PAIR-004 | AGENT-004 | 1 | 4.143 | 4.714 | 4.429 | +0.286 | -0.286 |
| ROUTE-PAIR-005 | AGENT-005 | 1 | 4.286 | 4.143 | 4.143 | -0.143 | 0.000 |
| ROUTE-PAIR-006 | AGENT-006 | 1 | 4.143 | 4.714 | 4.143 | 0.000 | -0.571 |
| ROUTE-PAIR-007 | AGENT-001 | 2 | 4.714 | 4.286 | 5.000 | +0.286 | +0.714 |
| ROUTE-PAIR-008 | AGENT-001 | 3 | 5.000 | 4.857 | 4.143 | -0.857 | -0.714 |

## Routing Metrics

| Metric | Value |
|---|---:|
| routedRunCount | 8 |
| agentInvocationRate | 1.000 |
| avoidedAgentRate | 0.000 |
| `agent_workflow` routed executions | 8 |
| `single_pass` routed executions | 0 |

Reason counts:

| Reason | Count |
|---|---:|
| requirement contains multiple risk or failure markers | 6 |
| multi-clause requirement includes risk or scope signals | 4 |
| requirement contains ambiguity or scope-planning markers | 2 |
| requirement spans multiple scope or policy concerns | 2 |

Interpretation:

The current deterministic policy is too conservative for this dataset. It collapses into Always Agent Workflow behavior in routed mode, so the expected cost-aware selective behavior was not observed.

## Latency And Usage

| Metric | Always OFF | Always ON | Routed |
|---|---:|---:|---:|
| Mean evaluation elapsed ms | 11988.4 | 26015.0 | 21040.0 |
| Median evaluation elapsed ms | 10912.5 | 24493.5 | 21696.0 |
| Mean input tokens | 1031.4 | 4535.1 | 6622.3 |
| Mean output tokens | 1306.1 | 1882.0 | 2566.8 |
| Mean total tokens | 2337.5 | 6417.1 | 9189.0 |
| Mean retrieval latency ms | 613.9 | 340.4 | 306.4 |

Cost ratios:

| Ratio | Value |
|---|---:|
| Routed / Always ON elapsed ratio | 0.809 |
| Routed / Always ON token ratio | 1.432 |

Interpretation:

Routed mode was faster than Always ON in elapsed time for this run, but used more provider-reported total tokens. Since all routed runs selected Agent workflow, the elapsed reduction should not be interpreted as successful Agent avoidance. The token result is a negative signal for cost-aware routing.

## Failure Domain

Primary failure domain:

- Router decision policy failure

Secondary observations:

- The dataset contains many risk, failure, scope, and ambiguity markers.
- The deterministic threshold/reason policy is not discriminating enough.
- The routed path did not exercise `single_pass`, so the formal run cannot demonstrate selective orchestration benefit.
- Quality deltas do not support routed mode adoption.

Not observed:

- JSON structure instability
- failed run
- secret leakage
- external scoring leakage in blind bundle

## Adoption Decision

Do not make routed mode the default.

Keep:

- deterministic routing schema
- routing metadata
- evaluation harness
- negative result documentation

Do not claim:

- adaptive routing improved quality
- adaptive routing reduced cost
- deterministic router is production-ready
- Phase 2-A generalizes beyond this dataset

## Next Hypotheses

Future work may evaluate:

- less conservative routing thresholds
- explicit low-risk / near-ceiling cases in the dataset
- source breadth signals from retrieval metadata
- separate policy for lifecycle / notification / image-validation domains
- calibrated policy that must choose `single_pass` for at least some low-risk cases before formal scoring

These are future candidates and were not implemented in Phase 2-A.
