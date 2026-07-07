# AI Agent PoC Phase 1-E Evaluation Results

## Scope

This document records the formal Phase 1-E result for the tested workload only.

Comparison:

- Agent OFF: existing single-pass grounded generation, `ragMode=on`, `ragContextPolicy=document-diversity-v1`
- Agent ON: bounded Agent workflow, `agentMode=on`
- Retrieval query: original requirement memo for both modes
- Retrieval parity: same selected document sequence and chunk sequence in all 8 pairs

This remains a system-level workflow comparison. It is not a strict single-variable causal ablation, and it does not establish general model/provider superiority.

## Conclusion

Conclusion Category: **B**

Bounded Agent workflow mostly maintained common final-output quality while clearly improving cross-field consistency. Unsupported assumption control also improved slightly.

However, the evaluation also observed:

- small decrease in Jira decomposition appropriateness
- small decrease in requirement-to-task traceability
- Reviewer scope relevance / severity precision limitations
- material latency increase
- material LLM token usage increase

The evidence does not support making Agent workflow the default path for every request. The measured benefit is more appropriate for selective use on complex or high-value workloads where consistency, ambiguity control, reviewable intermediate artifacts, and bounded correction matter.

## Run Matrix

| Item | Count |
|---|---:|
| Total runs | 16 |
| Agent OFF | 8 |
| Agent ON | 8 |
| AGENT-001 per mode | 3 |
| AGENT-002 to AGENT-006 per mode | 1 |

## Quality Summary

| Metric | Agent OFF | Agent ON | Delta |
|---|---:|---:|---:|
| Common 5-axis average | 4.750 | 4.725 | -0.025 |
| Seven-axis average | 4.714 | 4.768 | +0.054 |

| Axis | Agent OFF | Agent ON | Delta |
|---|---:|---:|---:|
| Product-specific rule coverage | 4.375 | 4.375 | 0.000 |
| Unsupported assumption control | 4.750 | 4.875 | +0.125 |
| Acceptance criteria specificity | 4.625 | 4.625 | 0.000 |
| Jira decomposition appropriateness | 5.000 | 4.750 | -0.250 |
| JSON structure stability | 5.000 | 5.000 | 0.000 |
| Cross-field consistency | 4.375 | 5.000 | +0.625 |
| Requirement-to-task traceability | 4.875 | 4.750 | -0.125 |

## Paired Results

| Pair | Result | Delta |
|---|---|---:|
| AGENT-001 Run 1 | Tie | 0.000 |
| AGENT-001 Run 2 | Tie | 0.000 |
| AGENT-001 Run 3 | Tie | 0.000 |
| AGENT-002 | Agent OFF win | -0.286 |
| AGENT-003 | Tie | 0.000 |
| AGENT-004 | Tie | 0.000 |
| AGENT-005 | Agent ON win | +0.143 |
| AGENT-006 | Agent ON win | +0.571 |

Paired win / tie / loss:

- Agent ON wins: 2
- Agent OFF wins: 1
- Ties: 5

## Retrieval Parity

| Metric | Value |
|---|---:|
| exactChunkParityRate | 1.000 |
| exactDocumentParityRate | 1.000 |

All 8 paired comparisons used the same selected document sequence and selected chunk sequence.

Interpretation: paired quality differences and retrieval evidence differences were not observed at the same time. This does not prove that the Agent architecture alone causally produced the quality delta.

## Agent Operational Metrics

| Metric | Value |
|---|---:|
| workflowCompletionRate | 1.000 |
| firstReviewPassRate | 0.750 |
| revisionInvocationRate | 0.250 |
| revisionLimitReachedRate | 0.000 |
| averageLlmStepCount | 3.500 |
| traceCompletenessRate | 1.000 |

Knowledge Tool invocation count:

- 1 invocation: 8 Agent ON runs

Reviewer finding severity:

- minor: 23
- major: 2
- blocker: 0

Reviewer finding category:

- cross_field_consistency: 8
- grounding_consistency: 6
- requirement_coverage: 6
- actionability: 5

## Revision Analysis

Revision occurred in:

- AGENT-003
- AGENT-006

Draft vs Final paired manual analysis was performed after blind final-output scoring. The evaluator knew Draft / Final ordering for this revision-specific analysis, so this part is not blind with respect to stage.

### AGENT-003

Initial Draft seven-axis scores:

- Product-specific rule coverage: 4
- Unsupported assumption control: 4
- Acceptance criteria specificity: 5
- Jira decomposition appropriateness: 5
- JSON structure stability: 5
- Cross-field consistency: 5
- Requirement-to-task traceability: 5
- Mean: 4.714

Final Output had the same seven-axis scores:

- Mean: 4.714
- draftToFinalQualityDelta: 0.000

Observation:

Review #1 requested removing the 5MB / JPG / PNG rule because it did not appear in the original requirement memo. That rule was directly supported by selected `profile-image-spec` product knowledge. The established authority model treats the original requirement memo as user-explicit authority and retrieved product knowledge as product-specific authority, while AgentPlan is a planning artifact.

The finding may still represent a scope relevance concern, but the major severity appears over-calibrated. A scope policy inconsistency was also observed:

- Review #1: source-supported rule absent from original memo -> remove as out of scope
- Review #2: source-supported cache busting rule absent from original memo -> recommend adding
- Review #2: source-supported metadata rule absent from original memo -> recommend adding

Failure-domain observations:

- Reviewer scope relevance policy inconsistency
- possible major severity over-calibration

AGENT-003 should not be described as proof of revision-driven quality improvement.

### AGENT-006

Initial Draft manual scores:

- Product-specific rule coverage: 5
- Unsupported assumption control: 4
- Acceptance criteria specificity: 5
- Jira decomposition appropriateness: 5
- JSON structure stability: 5
- Cross-field consistency: 3
- Requirement-to-task traceability: 5
- Mean: 4.571

Final Output blind manual score:

- 5 / 5 / 5 / 5 / 5 / 5 / 5
- Mean: 5.000
- draftToFinalQualityDelta: +0.429

Observation:

Initial Draft committed CDN-related cache avoidance as an acceptance criterion while also treating CDN scope as unresolved. Review #1's major cross-field consistency finding was materially valid. Revision weakened the CDN-specific commitment and kept CDN / multi-device scope as confirmation items.

Material Draft -> Final quality improvement was observed for AGENT-006.

### Revision Aggregate

| Metric | Value |
|---|---:|
| revision runs | 2 |
| mean draftToFinalQualityDelta | +0.214 |
| finalQualityRegressionRate | 0 / 2 = 0.000 |

Observed in the 2 revision runs:

- 1 run showed material manual quality improvement
- 1 run showed no manual seven-axis improvement
- neither run showed final quality regression

Do not generalize revision effectiveness from `n=2`.

Reviewer-reported major finding resolution:

- Review #1 major findings: 2
- Review #2 major / blocker findings: 0
- Reviewer-reported major finding resolution: 2 / 2

This is distinct from independent manual quality improvement. Revision invocation does not equal quality improvement.

## Reviewer Limitations

The deterministic revision policy worked as designed: minor-only findings did not trigger revision, while major findings did.

Observed limitations:

- sensitivity-side minor findings
- scope relevance inconsistency
- possible major severity over-calibration in AGENT-003
- possible minor finding redundancy
- Reviewer structured artifact language consistency is not guaranteed

AGENT-006 Review #1 returned parts of `summary`, `message`, and `requiredChange` in English. Final GenerationOutput was Japanese, so blind final-output scoring was not affected. Review History UI may still display mixed-language structured artifacts.

Future improvement areas:

- Reviewer scope relevance policy
- Reviewer severity precision
- minor finding redundancy
- structured review artifact language consistency

No Reviewer prompt or promptVersion was changed in Phase 1-E.

## Latency And Token Usage

| Metric | Agent OFF | Agent ON | Observation |
|---|---:|---:|---|
| evaluationElapsedMs mean | 8882.0 ms | 18044.25 ms | ON higher |
| evaluationElapsedMs median | 8549.5 ms | 15198.5 ms | ON about 1.78x |
| inputTokens mean | 1031.375 | 5716.5 | ON higher |
| outputTokens mean | 1312.625 | 2218.0 | ON higher |
| totalTokens mean | 2344.0 | 7934.5 | ON about 3.39x |
| embedding usage mean | 94.5 | 94.5 | equal |

Embedding usage is not merged into LLM usage. The observed Agent cost overhead came from multi-step LLM orchestration, not increased embedding usage.

## AGENT-001 Repeatability

AGENT-001 had 3 runs per mode.

| Run | Agent OFF | Agent ON | Delta |
|---|---:|---:|---:|
| 1 | 5.000 | 5.000 | 0.000 |
| 2 | 4.857 | 4.857 | 0.000 |
| 3 | 5.000 | 5.000 | 0.000 |

Overall mean:

- Agent OFF: 4.952
- Agent ON: 4.952
- Delta: 0.000

Observation: AGENT-001 showed stable near-ceiling quality in both modes. This should not be generalized to all cases. A future hypothesis is that strong retrieval plus strong single-pass generation may already approach a quality ceiling for well-grounded cases.

No automatic routing is implemented in Phase 1-E.

## Trace Timestamp Limitation

The formal raw bundle captured Agent ON step `startedAt` / `completedAt` timestamps as epoch-looking ISO values such as `1970-01-01T00:00:13.191Z`.

Root cause: Agent runtime used `performance.now()` for both elapsed measurement and ISO timestamp construction. `performance.now()` is a monotonic elapsed timer, not a wall-clock timestamp.

Impact:

- affected Agent step trace timestamps in raw bundle
- affected Agent run persistence records
- affected API response trace metadata
- affected UI display of Agent trace metadata
- did not affect `latencyMs`, `totalAgentLatencyMs`, step order, workflow decisions, LLM calls, retrieval calls, or final GenerationOutput

Trace completeness rate evaluated step presence, sequence, and terminal metadata. Absolute timestamp plausibility was not part of the trace completeness definition.
