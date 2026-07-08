# AI Agent PoC Phase 2-D Contract Checklist Evaluation

## Scope

Phase 2-D is the provider-backed follow-up to the Phase 2-C local spike.

It evaluates whether a deterministic lightweight contract checklist improves
low-risk but detail-dense single-pass routed generation without routing those
cases into the full Agent workflow.

## What Changes

Phase 2-D uses:

- routing policy: `agent-routing-v3-contract-candidate`
- evaluationId: `agent-phase-2-d-contract-checklist`
- same 24-run routing matrix shape as Phase 2-A / 2-B
- same OFF / ON / routed comparison structure
- same blind bundle and context-isolated evaluator workflow

For routed runs:

- `agent_workflow` routes continue to use Agent workflow
- `single_pass` routes continue to use grounded single-pass generation
- only routed `single_pass` cases with
  `lightweightChecklistRecommended: true` receive `contractChecklistText`

## What Does Not Change

Phase 2-D does not change:

- default `/api/generate` behavior
- public UI routing default
- RAG context policy default
- GenerationOutput schema
- Phase 2-A / Phase 2-B score files
- historical bundles or reports

## Manual Run Commands

手動確認が必要です。

The run command performs real provider-backed generation and may call Qdrant,
Embeddings, and the configured LLM provider. Run it only from the normal local
PowerShell environment where Docker/Qdrant and `.env.local` are configured.

```powershell
cd C:\Users\tomo5\ai_development_support_workbench
npm run agent:routing:contract:evaluate:run
```

After the run succeeds, export a blind evaluation package:

```powershell
npm run agent:evaluation:export-blind-package -- phase_2_d C:\Users\tomo5\ai_evaluation_blind_workspace
```

The isolated evaluator should use only the exported package and write:

```text
C:\Users\tomo5\ai_evaluation_blind_workspace\output\manual_scores.json
```

Then import scores and summarize:

```powershell
npm run agent:evaluation:import-scores -- phase_2_d C:\Users\tomo5\ai_evaluation_blind_workspace\output\manual_scores.json
npm run agent:routing:contract:evaluate:summarize
```

## Expected Artifacts

The run command writes:

- `data/agent/evaluation/phase_2_d_raw_bundle.json`
- `data/agent/evaluation/phase_2_d_blind_bundle.json`
- `data/agent/evaluation/phase_2_d_sample_mapping.json`
- `data/agent/evaluation/phase_2_d_manual_score_template.md`

After blind scoring and summarization:

- `data/agent/evaluation/phase_2_d_manual_scores.json`
- `data/agent/evaluation/phase_2_d_summary.json`
- `data/agent/evaluation/phase_2_d_report.md`

These local evaluation outputs are not meant to be committed until they have
been reviewed for safety and relevance.

## Formal Evaluation Result

Execution date:

- local PowerShell / local Qdrant / configured `.env.local`
- evaluationId: `agent-phase-2-d-contract-checklist`
- scoringMethod: `context-isolated-blind-llm`
- sample count: 24
- failed runs: 0

Quality:

| Mode | Seven-axis mean | Median |
|---|---:|---:|
| Always OFF | 4.768 | 4.929 |
| Always ON | 4.679 | 4.786 |
| Routed v3 + checklist bridge | 4.768 | 4.929 |

Paired comparison:

| Comparison | Routed wins | Other wins | Ties |
|---|---:|---:|---:|
| Routed vs Always OFF | 1 | 1 | 6 |
| Routed vs Always ON | 5 | 0 | 3 |

Axis-level deltas:

| Axis | Routed - OFF | Routed - ON |
|---|---:|---:|
| productSpecificRuleCoverage | 0.000 | 0.000 |
| unsupportedAssumptionControl | 0.000 | +0.125 |
| acceptanceCriteriaSpecificity | +0.125 | +0.250 |
| jiraDecompositionAppropriateness | -0.125 | +0.375 |
| jsonStructureStability | 0.000 | 0.000 |
| crossFieldConsistency | 0.000 | -0.125 |
| requirementToTaskTraceability | 0.000 | 0.000 |

Routing and cost:

| Metric | Result |
|---|---:|
| Routed runs | 8 |
| Routed single-pass runs | 4 |
| Routed Agent workflow runs | 4 |
| Agent invocation rate | 0.500 |
| Avoided Agent rate | 0.500 |
| Checklist-recommended routed runs | 1 |
| Routed / Always ON elapsed ratio | 0.650 |
| Routed / Always ON token ratio | 0.746 |

Latency and usage:

| Mode | Mean elapsed ms | Median elapsed ms | Mean total tokens |
|---|---:|---:|---:|
| Always OFF | 10532.125 | 10254.500 | 2315.250 |
| Always ON | 21930.000 | 20697.000 | 7308.000 |
| Routed v3 + checklist bridge | 14254.000 | 12599.000 | 5454.750 |

Observed checklist bridge usage:

- `ROUTE-RUN-014`
- case: `AGENT-005`
- routedExecutionMode: `single_pass`
- `lightweightChecklistRecommended: true`
- elapsed: 7917 ms
- totalTokens: 2363

## Result Interpretation

Phase 2-D did not show a quality lift over Always OFF on this dataset. Routed v3
matched the Always OFF seven-axis mean and median, with one routed win, one OFF
win, and six ties.

Compared with Always ON, Routed v3 performed better in this run:

- higher seven-axis mean: 4.768 vs 4.679
- no pairwise losses against Always ON
- lower mean elapsed time
- lower mean token usage

The checklist bridge was exercised in one routed single-pass run. This validates
that the contract-detail checklist path can be applied without forcing all
detail-dense cases into Agent workflow, but the sample count is too small to
claim general checklist quality improvement.

Practical conclusion for this PoC phase:

- keep Always OFF / grounded single-pass as the quality baseline
- keep Routed v3 + checklist bridge as a candidate for cost-aware selective
  orchestration
- do not make Routed v3 the default solely from this result
- gather more targeted low-risk detail-dense cases before treating the checklist
  bridge as a proven quality improvement

## Interpretation

Phase 2-D should answer a narrow question:

```text
Does routed single-pass generation with deterministic contract checklist
guidance improve the detail-dense failure class observed in Phase 2-B?
```

It should not be used to claim that checklist prompting is generally superior
across all Agent workflows, all providers, or all product requirement types.
