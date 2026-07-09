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

## Formal Evaluation Result

Execution environment:

- local PowerShell / local Qdrant / configured `.env.local`
- evaluationId: `agent-phase-2-e-contract-target`
- scoringMethod: `context-isolated-blind-llm`
- sample count: 16
- failed runs: 0

Quality:

| Mode | Seven-axis mean | Median |
|---|---:|---:|
| Baseline single-pass | 4.839 | 4.929 |
| Checklist single-pass | 4.857 | 4.857 |

Paired comparison:

| Checklist wins | Baseline wins | Ties |
|---:|---:|---:|
| 2 | 4 | 2 |

Axis-level deltas:

| Axis | Baseline | Checklist | Delta |
|---|---:|---:|---:|
| productSpecificRuleCoverage | 5.000 | 5.000 | 0.000 |
| unsupportedAssumptionControl | 4.250 | 4.250 | 0.000 |
| acceptanceCriteriaSpecificity | 4.875 | 4.750 | -0.125 |
| jiraDecompositionAppropriateness | 5.000 | 5.000 | 0.000 |
| jsonStructureStability | 5.000 | 5.000 | 0.000 |
| crossFieldConsistency | 4.875 | 5.000 | +0.125 |
| requirementToTaskTraceability | 4.875 | 5.000 | +0.125 |

Latency and usage:

| Mode | Mean elapsed ms | Median elapsed ms | Mean input tokens | Mean output tokens | Mean total tokens |
|---|---:|---:|---:|---:|---:|
| Baseline single-pass | 7333.375 | 6904 | 979.250 | 1076.375 | 2055.625 |
| Checklist single-pass | 7379.875 | 7202 | 1240.500 | 1153.750 | 2394.250 |

Ratios:

| Metric | Checklist / baseline |
|---|---:|
| elapsed ratio | 1.006 |
| total token ratio | 1.165 |

## Result Interpretation

Conclusion Category: **B. Partial improvement with cost trade-off**

Phase 2-E showed a small mean quality lift for checklist single-pass generation
on the targeted low-risk contract-detail dataset:

- seven-axis mean improved from 4.839 to 4.857
- cross-field consistency improved by +0.125
- requirement-to-task traceability improved by +0.125

However, the result is not strong enough to make checklist prompting the default
path:

- paired comparison favored baseline in four pairs, checklist in two, with two
  ties
- acceptance criteria specificity decreased by -0.125
- total token usage increased by about 16.5%
- elapsed time was effectively flat but slightly higher for checklist

Practical conclusion for this PoC phase:

- keep the deterministic checklist bridge as an optional candidate for
  contract-detail support
- do not default all low-risk detail-dense requests to checklist prompting from
  this result alone
- preserve the target dataset and evaluation harness for future prompt/checklist
  calibration
- investigate why checklist guidance improved consistency and traceability but
  did not consistently win pairwise

This result applies only to the eight-case Phase 2-E target dataset, current
prompt/schema, current provider/runtime environment, and context-isolated blind
scoring setup. It should not be generalized to all providers, all product
requirements, or all Agent workflows.

## Non-Goals

Phase 2-E target dataset preparation does not:

- change `/api/generate`
- change routing defaults
- change Phase 2-A / 2-B / 2-D results
- run providers during calibration
- call Qdrant during calibration
- call Embeddings during calibration
- commit local evaluation bundles
