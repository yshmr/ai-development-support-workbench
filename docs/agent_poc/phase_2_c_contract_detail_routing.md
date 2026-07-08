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

The next possible step would be a separate lightweight checklist experiment:

- keep single-pass generation
- inject or apply a deterministic contract checklist only for flagged cases
- compare against normal single-pass on the low-risk detail-dense dataset
- use blind scoring if real generation is evaluated

Do not run a real provider-backed formal evaluation until the local calibration
gate and checklist design are both stable.
