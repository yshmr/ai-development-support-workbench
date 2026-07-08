# AI Agent PoC Phase 2-E Contract-Detail Target Dataset

## Scope

Phase 2-E prepares a targeted low-risk detail-dense dataset after Phase 2-D.

Phase 2-D showed that the checklist bridge can run in the real routed pipeline,
but only one routed run used `lightweightChecklistRecommended: true`. That is
too small to evaluate whether checklist guidance improves the contract-detail
failure class.

Phase 2-E therefore adds a local-only target dataset before any additional
provider-backed formal run.

## Dataset

The target dataset is:

```text
data/agent/evaluation/agent_contract_detail_target_cases.json
```

It contains eight public-safe low-risk detail-dense cases:

| Case | Theme |
|---|---|
| ROUTE-CONTRACT-101 | status filter query contract |
| ROUTE-CONTRACT-102 | sort option query contract |
| ROUTE-CONTRACT-103 | settings tab query persistence |
| ROUTE-CONTRACT-104 | pagination query persistence |
| ROUTE-CONTRACT-105 | date range query serialization |
| ROUTE-CONTRACT-106 | view mode query default |
| ROUTE-CONTRACT-107 | language query default |
| ROUTE-CONTRACT-108 | search keyword query contract |

Every case is expected to:

- remain `single_pass`
- set `lightweightChecklistRecommended: true`
- avoid full Agent workflow

## Local Calibration

Run:

```bash
npm run agent:routing:contract:target-calibrate
```

Current local result:

| Metric | Result |
|---|---:|
| totalCases | 8 |
| expectedChecklistCount | 8 |
| actualChecklistRecommendedCount | 8 |
| passRate | 1.000 |
| checklistRecommendedRate | 1.000 |
| gatePassed | true |

Case-level result:

| Case | Expected | Actual | Checklist | Result |
|---|---|---|---|---|
| ROUTE-CONTRACT-101 | single_pass | single_pass | true | pass |
| ROUTE-CONTRACT-102 | single_pass | single_pass | true | pass |
| ROUTE-CONTRACT-103 | single_pass | single_pass | true | pass |
| ROUTE-CONTRACT-104 | single_pass | single_pass | true | pass |
| ROUTE-CONTRACT-105 | single_pass | single_pass | true | pass |
| ROUTE-CONTRACT-106 | single_pass | single_pass | true | pass |
| ROUTE-CONTRACT-107 | single_pass | single_pass | true | pass |
| ROUTE-CONTRACT-108 | single_pass | single_pass | true | pass |

## Interpretation

This is a dataset and routing calibration step only.

It does not prove checklist quality improvement because it does not run real
generation or blind scoring. It establishes that Phase 2-E has enough
checklist-recommended low-risk cases to make a future provider-backed checklist
experiment meaningful.

## Non-Goals

Phase 2-E target dataset preparation does not:

- change `/api/generate`
- change routing defaults
- change Phase 2-A / 2-B / 2-D results
- run providers
- call Qdrant
- call Embeddings
- commit local evaluation bundles
