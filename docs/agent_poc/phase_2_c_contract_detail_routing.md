# AI Agent PoC Phase 2-C Contract-Detail Routing Spike

## Scope

Phase 2-C is a local routing-only spike after Phase 2-B.

Phase 2-B showed that `agent-routing-v2-candidate` reduced cost relative to
Always ON, but it still did not beat Always OFF on quality. The most informative
failure was not high ambiguity or lifecycle risk. It was a low-risk but
detail-dense UI/query contract case.

This phase adds a deterministic candidate policy:

```text
agent-routing-v3-contract-candidate
```

The goal is not to make routed mode the default. The goal is to test whether
contract-detail signals can identify requests that should stay on single-pass
generation while receiving a lightweight checklist.

## Non-Goals

Phase 2-C does not add:

- LLM-based routing
- provider-backed routing calls
- OpenAI API calls
- Embeddings API calls
- Qdrant calls
- generation reruns
- `/api/generate` default behavior changes
- a new public UI mode
- automatic adoption of routed mode

## Motivation

Phase 2-B failure analysis found this failure class:

```text
low-risk but detail-dense contract requirement
```

Example missed details:

- comma-separated `status` query values
- enum filter values
- default sort order
- empty state behavior
- URL persistence and restoration

These details are important, but they do not necessarily justify full Agent
workflow. Routing every such request to Agent workflow would risk returning to
the Phase 2-A failure mode where routed mode became too conservative.

## Candidate Policy

The Phase 2-C candidate extends v2 signals with contract-detail markers:

- query parameter markers
- enum value markers
- default state markers
- persistence / restoration markers
- aggregate `contractDetailScore`
- `lightweightChecklistRecommended`

Policy behavior:

- keep high-risk lifecycle, ambiguity, validation, security, and exception-policy
  cases as Agent workflow candidates
- keep low-risk detail-dense cases on `single_pass`
- mark those low-risk detail-dense cases with
  `lightweightChecklistRecommended: true`

This keeps routing cost-aware while separating two concepts:

```text
Agent workflow required
```

from:

```text
single-pass generation should pay attention to contract details
```

## Calibration Dataset

The local calibration dataset is:

```text
data/agent/evaluation/agent_routing_contract_calibration_cases.json
```

It includes eight public-safe cases:

| Case type | Expected route | Expected checklist |
|---|---|---:|
| status filter query representation | `single_pass` | true |
| sort query option with default behavior | `single_pass` | true |
| tab URL persistence | `single_pass` | true |
| copy-only label change | `single_pass` | false |
| static empty state copy | `single_pass` | false |
| profile image lifecycle rollback | `agent_workflow` | false |
| notification exception policy | `agent_workflow` | false |
| upload validation / internal detail masking | `agent_workflow` | false |

## Command

Run the routing-only calibration:

```bash
npm run agent:routing:contract:calibrate
```

This command is local-only and does not call providers, Qdrant, or Embeddings.

Inspect the deterministic checklist categories for calibration cases:

```bash
npm run agent:routing:contract:checklist
```

This command is also local-only.

Run the local synthetic checklist comparison:

```bash
npm run agent:routing:contract:evaluate
```

This command compares synthetic baseline outputs with synthetic checklist-aware
outputs for the three low-risk detail-dense cases. It does not run generation,
call providers, call Embeddings, or call Qdrant.

## Current Calibration Result

The expected gate is:

- total cases: 8
- low-risk avoidance rate: 1.000
- high-risk route rate: 1.000
- checklist expectation pass rate: 1.000
- gate passed: true

The gate verifies that:

- low-risk contract-detail cases do not automatically become Agent workflow
- detail-dense single-pass cases can be flagged for checklist treatment
- high-risk cases remain Agent workflow candidates

## Interpretation

This is a routing-only design spike. It does not prove that a checklist improves
generation quality.

## Lightweight Checklist Foundation

Phase 2-C also includes a deterministic checklist foundation:

```text
contract-detail-checklist-v1
```

The checklist is created only when:

- `agent-routing-v3-contract-candidate` selects `single_pass`
- `lightweightChecklistRecommended` is `true`

Checklist categories:

- `query_parameter`
- `enum_values`
- `default_state`
- `persistence`
- `traceability`

The checklist does not store the raw requirement memo. It emits generic
instructions such as:

- carry exact query parameter names and value formats into spec and acceptance
  criteria
- preserve enum values and multi-select behavior across tasks and tests
- state default sort, default tab, empty state, or initial display behavior as
  testable acceptance criteria
- specify reload, restoration, sharing, or persistence expectations without
  inventing unsupported synchronization guarantees
- ensure each contract detail appears in acceptance criteria and at least one
  Jira task or review point

This foundation is intentionally not wired into `/api/generate`. It exists so
the checklist can be inspected and tested before any provider-backed experiment.

## Local Checklist Audit

Phase 2-C includes a local audit helper:

```text
contract-detail-checklist-audit-v1
```

The audit checks whether each checklist category appears in the target
`GenerationOutput` fields. It returns:

- `covered`
- `needs_review`

This audit is intentionally conservative:

- it does not assign quality scores
- it does not replace blind evaluation
- it does not persist the raw requirement memo
- it only marks likely missing checklist coverage for manual review

The audit is useful before a provider-backed experiment because it makes the
expected checklist behavior testable with synthetic outputs.

## Synthetic Checklist Evaluation

Phase 2-C includes a local-only synthetic evaluation for the three cases where
`lightweightChecklistRecommended` is expected to be `true`.

| Metric | Baseline synthetic outputs | Checklist-aware synthetic outputs | Delta |
|---|---:|---:|---:|
| Covered checklist items | 4 | 13 | +9 |
| Needs-review checklist items | 9 | 0 | -9 |
| Improved cases | - | 3 / 3 | - |
| Regressed cases | - | 0 / 3 | - |
| Gate passed | - | true | - |

Case-level result:

| Case | Baseline covered | Checklist covered | Delta | Baseline needs review | Checklist needs review | Delta |
|---|---:|---:|---:|---:|---:|---:|
| ROUTE-CONTRACT-001 | 1 | 5 | +4 | 4 | 0 | -4 |
| ROUTE-CONTRACT-002 | 1 | 4 | +3 | 3 | 0 | -3 |
| ROUTE-CONTRACT-003 | 2 | 4 | +2 | 2 | 0 | -2 |

Interpretation:

- the checklist audit can distinguish weak generic outputs from outputs that
  preserve query parameter, enum/default state, persistence, and traceability
  details
- the result is a local fixture-based gate, not a real LLM quality result
- provider-backed generation and blind scoring remain separate future work

## Prompt Context Bridge

Phase 2-C also prepares a minimal prompt bridge for a future lightweight
checklist experiment:

- `formatAgentContractChecklistForPrompt` converts deterministic checklist items
  into reference guidance
- the formatted text does not include the raw requirement memo
- `generateFromRequirementMemo` accepts `contractChecklistText` only as an
  explicit option
- default generation, `/api/generate`, RAG behavior, Agent workflow, and routing
  defaults are unchanged

The checklist reference is scoped as guidance for preserving details already in
the requirement memo. It is not treated as new product knowledge or a separate
source of truth.

The next possible step would be a separate lightweight checklist experiment:

- keep single-pass generation
- inject or apply a deterministic contract checklist only for flagged cases
- compare against normal single-pass on the low-risk detail-dense dataset
- use blind scoring if real generation is evaluated

Do not run a real provider-backed formal evaluation until the local calibration
gate and checklist design are both stable.
