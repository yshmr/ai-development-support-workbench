# AI Agent PoC Phase 2-E Contract-Detail Target Dataset

## Scope

Phase 2-E prepares a targeted low-risk detail-dense dataset after Phase 2-D.

Phase 2-D showed that the checklist bridge can run in the real routed pipeline,
but only one routed run used `lightweightChecklistRecommended: true`. That is
too small to evaluate whether checklist guidance improves the contract-detail
failure class.

Phase 2-E therefore adds a local-only target dataset and the provider-backed
baseline/checklist evaluation harness for that target dataset.

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

It does not prove checklist quality improvement by itself. It establishes that
Phase 2-E has enough checklist-recommended low-risk cases to make a
provider-backed checklist experiment meaningful.

## Provider-Backed Evaluation Workflow

The real evaluation command should be run from a normal local PowerShell with
Docker/Qdrant, `.env.local`, and provider credentials ready:

```bash
npm run agent:contract-checklist:evaluate:run
```

This creates local-only raw, blind, sample mapping, and manual score template
artifacts under `data/agent/evaluation/phase_2_e_*`. Those files are ignored by
Git.

After blind scoring is completed in the context-isolated evaluator workspace,
import the evaluator JSON and summarize:

```bash
npm run agent:evaluation:export-blind-package -- phase_2_e
npm run agent:evaluation:import-scores -- phase_2_e C:\path\to\blind_workspace\output\manual_scores.json
npm run agent:contract-checklist:evaluate:summarize
```

The evaluation compares:

- `baseline`: single-pass grounded generation with document-diversity RAG context
- `checklist`: the same single-pass grounded generation plus deterministic
  `contractChecklistText`

It does not change `/api/generate`, routing defaults, or prior routing results.

## Non-Goals

Phase 2-E target dataset preparation does not:

- change `/api/generate`
- change routing defaults
- change Phase 2-A / 2-B / 2-D results
- run providers during calibration
- call Qdrant during calibration
- call Embeddings during calibration
- commit local evaluation bundles
