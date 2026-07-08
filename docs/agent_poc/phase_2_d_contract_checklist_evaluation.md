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

## Interpretation

Phase 2-D should answer a narrow question:

```text
Does routed single-pass generation with deterministic contract checklist
guidance improve the detail-dense failure class observed in Phase 2-B?
```

It should not be used to claim that checklist prompting is generally superior
across all Agent workflows, all providers, or all product requirement types.
