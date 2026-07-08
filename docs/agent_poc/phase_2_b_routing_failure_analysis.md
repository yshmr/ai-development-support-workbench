# AI Agent PoC Phase 2-B Routing Failure Analysis

## Scope

This document analyzes Phase 2-B routed v2 failure cases after the
context-isolated blind evaluator check.

Inputs:

- Raw bundle: `data/agent/evaluation/phase_2_b_raw_bundle.json`
- Sample mapping: `data/agent/evaluation/phase_2_b_sample_mapping.json`
- Manual scores: `data/agent/evaluation/phase_2_b_manual_scores.json`
- Summary: `data/agent/evaluation/phase_2_b_summary.json`

These files are local evaluation artifacts and are gitignored. This document
records only public-safe aggregate findings and sample-level interpretations.

The analysis does not rerun generation, OpenAI, Embeddings, or Qdrant.

## Current Result

Context-isolated blind evaluator scoring:

| Metric | Always OFF | Always ON | Routed v2 |
|---|---:|---:|---:|
| Seven-axis mean | 4.768 | 4.696 | 4.661 |
| Seven-axis median | 4.857 | 4.714 | 4.857 |

Pair outcomes:

| Comparison | Routed wins | Ties | Routed losses |
|---|---:|---:|---:|
| Routed v2 vs Always OFF | 0 | 3 | 5 |
| Routed v2 vs Always ON | 2 | 2 | 4 |

Routing and cost:

| Metric | Value |
|---|---:|
| agentInvocationRate | 0.500 |
| avoidedAgentRate | 0.500 |
| Routed v2 / Always ON elapsed ratio | 0.894 |
| Routed v2 / Always ON token ratio | 0.691 |

Interpretation:

- v2 fixed the Phase 2-A failure where routed mode always invoked Agent workflow.
- v2 reduced cost relative to Always ON.
- v2 still did not beat Always OFF on quality.

## Routed Single-Pass Cases

Routed v2 selected `single_pass` for four runs.

| Pair | Case | Routed - OFF | Routed - ON | Notes |
|---|---|---:|---:|---|
| ROUTE-PAIR-001 | AGENT-001 run 1 | 0.000 | +0.286 | Correct avoidance; single-pass tied OFF and beat ON. |
| ROUTE-PAIR-005 | AGENT-005 run 1 | -0.286 | -0.286 | Material single-pass failure. |
| ROUTE-PAIR-007 | AGENT-001 run 2 | -0.143 | -0.143 | Near-ceiling micro-loss. |
| ROUTE-PAIR-008 | AGENT-001 run 3 | -0.143 | -0.143 | Near-ceiling micro-loss. |

### AGENT-005 Failure Domain

Case:

```text
Search status filter requirement
```

Expected rules:

- filter by `open`, `in_progress`, `resolved`, `archived`
- allow multiple statuses
- persist `status` query parameter as comma-separated values
- initial sort order is relevance
- show an empty state when result count is zero

Routing decision:

| Signal | Value |
|---|---:|
| routedExecutionMode | `single_pass` |
| candidateScore | 1 |
| ambiguityMarkerCount | 0 |
| clauseCount | 3 |
| riskKeywordCount | 0 |
| scopeKeywordCount | 2 |
| lifecycleKeywordCount | 0 |
| unresolvedScopeMarkerCount | 0 |
| validationSecurityMarkerCount | 0 |

Reasons:

- multiple scope markers contribute weak routing evidence
- candidate score stayed below Agent workflow threshold

Scores:

| Axis | OFF | ON | Routed |
|---|---:|---:|---:|
| productSpecificRuleCoverage | 3 | 3 | 3 |
| unsupportedAssumptionControl | 4 | 5 | 4 |
| acceptanceCriteriaSpecificity | 4 | 3 | 3 |
| jiraDecompositionAppropriateness | 5 | 4 | 4 |
| jsonStructureStability | 5 | 5 | 5 |
| crossFieldConsistency | 4 | 5 | 4 |
| requirementToTaskTraceability | 3 | 3 | 3 |

Evaluator note for routed:

```text
4ステータス、複数選択、URL反映、空状態はあるが、status queryのカンマ区切りと初期関連度順が抜けている。
```

Failure interpretation:

- The router saw the request as low risk because it had no ambiguity, lifecycle,
  validation, security, or risk markers.
- The actual quality loss came from precise UI/state/query contract details,
  not from high-level ambiguity or risk.
- The missed details were exact representation constraints:
  comma-separated query values and relevance sort default.

This is a different failure class from the lifecycle / ambiguity cases that
Agent workflow was designed to catch.

## Near-Ceiling AGENT-001 Micro-Losses

AGENT-001 routed single-pass was not a major failure.

Two runs scored 4.857 against OFF/ON at 5.000:

- run 2: backend implementation responsibility looked partly shifted into test
  tasks
- run 3: acceptance criteria were slightly weaker on endpoint / payload checks

Both losses were small and occurred near the scoring ceiling. They do not prove
that AGENT-001 should route to Agent workflow by default.

They do suggest that even low-risk single-pass generation can drift on task
decomposition or acceptance criteria specificity.

## Routed Agent-Workflow Losses

Routed v2 also lost to OFF in two `agent_workflow` cases:

| Pair | Case | Routed - OFF | Main issue |
|---|---|---:|---|
| ROUTE-PAIR-002 | AGENT-002 | -0.143 | MIME type and actual image content server validation was less explicit. |
| ROUTE-PAIR-004 | AGENT-004 | -0.143 | Important terms-of-service notification exception and documentation task were weak. |

This matters because invoking Agent workflow did not guarantee quality parity
with Always OFF. Routing policy alone cannot fully solve generation variance.

## Failure Classes

Observed failure classes:

1. Contract representation detail miss

   AGENT-005 missed comma-separated `status` query representation and relevance
   default sort. These are precise product contract details with low apparent
   ambiguity.

2. Near-ceiling decomposition drift

   AGENT-001 mostly succeeded, but tiny score differences came from task
   decomposition and acceptance criteria specificity.

3. Agent workflow non-dominance

   AGENT-002 and AGENT-004 show that Agent workflow can still miss details or
   produce weaker task decomposition than single-pass OFF.

## Routing Implications

The current v2 router mostly detects:

- ambiguity
- lifecycle / cleanup concerns
- validation / security markers
- explicit unresolved scope
- notification exception markers
- broad risk markers

It does not detect:

- exact query parameter representation requirements
- default sort order / default state requirements
- small but important UI state contract details
- "low-risk but detail-dense" tasks

Adding more risk keywords would likely make the router too conservative again.
The failure is not simply that the threshold is too high.

## Next Hypothesis

The next useful hypothesis is not "route more requests to Agent workflow".

Better hypothesis:

```text
Routing should distinguish high-cost Agent-worthy ambiguity from low-cost
contract-detail risk. Some low-risk but detail-dense requests may need a cheaper
contract checklist or single-pass prompt augmentation rather than full Agent
workflow.
```

Potential Phase 2-C directions:

1. Contract-detail detector

   Add deterministic signals for query parameters, enum values, default sort,
   empty state, persistence, and representation formats. Do not automatically
   route all such cases to Agent workflow.

2. Lightweight checklist path

   For low-risk detail-dense cases, keep single-pass generation but add a
   deterministic checklist into the prompt or post-generation validation. This
   should be cheaper than full Agent workflow.

3. Retrieval-derived source breadth signal

   Evaluate whether retrieved source composition predicts detail-density misses.
   This should be tested offline first and should not change default behavior
   without an evaluation gate.

4. More balanced calibration set

   Add cases specifically covering:

   - URL query representation
   - enum filters
   - default sorting
   - empty states
   - persistence / restoration
   - low-risk but detail-dense UI contracts

## Recommendation

Do not adopt routed v2 as default.

Keep `agent-routing-v2-candidate` as an experimental cost-aware routing policy.

For the next implementation step, prefer a Phase 2-C design spike for
low-risk contract-detail detection and lightweight checklist evaluation before
adding another real provider-backed formal run.

The first Phase 2-C step should be routing-only and local:

- no OpenAI API call
- no Embeddings API call
- no Qdrant call
- no generation rerun
- no default `/api/generate` behavior change
