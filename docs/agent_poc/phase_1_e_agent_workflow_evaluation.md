# AI Agent PoC Phase 1-E: Single-pass vs Bounded Agent Workflow Evaluation

## Purpose

Phase 1-E evaluates whether the bounded Agent workflow improves grounded generation quality compared with the existing single-pass grounded generation path.

This phase is an evaluation foundation and protocol. It does not change the `GenerationOutput` schema, existing RAG retrieval behavior, `ragContextPolicy` defaults, or `/api/generate` request contract.

## Compared Modes

### Agent OFF

- Existing single-pass grounded generation
- `ragMode=on`
- `ragContextPolicy=document-diversity-v1`
- Prompt version: `llm-app-poc-rag-v1`

### Agent ON

- Bounded Agent workflow
- `agentMode=on`
- Internal retrieval strategy: `heading-aware-v1`
- Internal context policy: `document-diversity-v1`
- `candidateTopK=10`
- `requestedFinalTopK=5`
- `maxChunksPerDocument=2`
- Workflow version: `agent-poc-workflow-v1`

## Formal Evaluation Model

Formal local evaluation should use the same provider/model for both modes:

- provider: `openai`
- model: `gpt-5.4-mini`

The comparison is scoped to this PoC dataset, current prompts, current schema, current local environment, and the current synthetic RAG corpus. It must not be generalized to provider companies, model families, or all Agent/RAG workloads.

## Dataset

Public, safe evaluation cases are stored in:

```text
data/agent/evaluation/agent_evaluation_cases.json
```

The dataset contains six cases:

- `AGENT-001`: Profile image basic multi-document requirement
- `AGENT-002`: Profile image validation / invalid upload behavior
- `AGENT-003`: Profile image replacement lifecycle / cleanup concern
- `AGENT-004`: Disable email notification requirement
- `AGENT-005`: Search status filter requirement
- `AGENT-006`: Ambiguous product requirement where unresolved details should remain as risks / confirmation items

Each case includes:

- requirement memo used as generation input
- expected relevant document IDs
- important expected rules
- unsupported assumptions to avoid
- cross-field consistency checks
- notes

Rubric and expectation metadata is used only for blind manual evaluation. It must not be injected into generation prompts.

## Run Matrix

The formal matrix has 16 runs:

- Agent OFF: 8 runs
- Agent ON: 8 runs
- `AGENT-001`: OFF 3 runs and ON 3 runs
- `AGENT-002` to `AGENT-006`: OFF 1 run and ON 1 run each

Execution order is deterministic and alternates by pair:

- Pair 1: OFF -> ON
- Pair 2: ON -> OFF
- Pair 3: OFF -> ON
- Pair 4: ON -> OFF
- Pair 5: OFF -> ON
- Pair 6: ON -> OFF
- Pair 7: OFF -> ON
- Pair 8: ON -> OFF

The raw bundle records the exact execution order.

## Latency Boundary

`evaluationElapsedMs` is measured from immediately before mode invocation until the result is available.

For Agent OFF, this includes retrieval plus single-pass generation.

For Agent ON, this includes planning, knowledge retrieval, draft generation, review, optional revision, and finalization.

Provider latency, server processing latency, retrieval latency, and Agent step latencies remain separate metadata where available.

## Blind Manual Evaluation

Quality scoring is manual only.

The system does not:

- create final quality scores automatically
- use LLM-as-a-judge
- use Agent reviewer findings as quality scores
- persist hidden chain-of-thought or raw reasoning traces

The blind bundle includes only:

- `sampleId`
- `caseId`
- `caseTitle`
- `requirementMemo`
- case expectations
- final `GenerationOutput`

The blind bundle excludes:

- mode
- `agentMode`
- `ragMode`
- prompt version
- provider/model trace
- raw run IDs
- Agent plan
- review history
- revision count
- review count
- LLM step count
- Agent metadata

Opaque sample IDs use `SAMPLE-001` style and do not encode mode. Ordering is deterministic by stable hash, not unseeded randomness.

## Scoring Axes

Common axes:

1. Product-specific rule coverage
2. Unsupported assumption control
3. Acceptance criteria specificity
4. Jira decomposition appropriateness
5. JSON structure stability

Additional Agent-sensitive axes:

6. Cross-field consistency
7. Requirement-to-task traceability

Scores must be integers from 1 to 5. There must be exactly one score entry for each blind sample.

## Runtime Artifacts

Runtime artifacts are local-only and ignored by Git:

- `data/agent/evaluation/phase_1_e_raw_bundle.json`
- `data/agent/evaluation/phase_1_e_blind_bundle.json`
- `data/agent/evaluation/phase_1_e_sample_mapping.json`
- `data/agent/evaluation/phase_1_e_manual_scores.json`
- `data/agent/evaluation/phase_1_e_revision_pairs.json`
- `data/agent/evaluation/phase_1_e_summary.json`
- `data/agent/evaluation/phase_1_e_report.md`
- `data/agent/evaluation/phase_1_e_manual_score_template.md`

The public dataset file remains committable.

## Local Formal Procedure

Run these commands from the repository root in a normal local PowerShell session, not from a sandboxed environment:

```powershell
# 1. Start Qdrant separately and confirm the heading-aware-v1 collection is ingested.

# 2. Configure .env.local with safe local values.
# LLM_PROVIDER=openai
# OPENAI_MODEL=gpt-5.4-mini
# OPENAI_API_KEY=<do not commit>
# RAG_EMBEDDING_PROVIDER=openai
# OPENAI_EMBEDDING_MODEL=text-embedding-3-small
# QDRANT_URL=http://localhost:6333

# 3. Create raw, blind, mapping, revision-pair, and manual-score-template artifacts.
npm run agent:evaluate:run

# 4. Confirm the run counts.
# totalRuns=16 offRuns=8 onRuns=8

# 5. Pass only the blind bundle and score template to the manual evaluator.
# data/agent/evaluation/phase_1_e_blind_bundle.json
# data/agent/evaluation/phase_1_e_manual_score_template.md

# 6. Create the validated manual scores file.
# data/agent/evaluation/phase_1_e_manual_scores.json

# 7. Aggregate results.
npm run agent:evaluate:summarize
```

Do not add CLI flags to these commands. The command interface is intentionally fixed to avoid npm argument-forwarding ambiguity.

## Summary Outputs

`npm run agent:evaluate:summarize` joins:

- raw bundle
- blind bundle
- sample mapping
- manual score JSON

It produces:

- machine-readable summary: `phase_1_e_summary.json`
- Markdown report draft: `phase_1_e_report.md`

The summary includes:

- mode mean/median
- axis-level OFF/ON/delta
- paired win/tie/loss
- workflow completion rate
- first review pass rate
- revision invocation rate
- revision limit reached rate
- average LLM step count
- knowledge tool invocation count distribution
- trace completeness rate
- finding severity/category counts
- minor-only review count
- latency and token usage aggregates
- retrieval parity metrics

## Retrieval Parity

Agent OFF and Agent ON are expected to use the same RAG corpus, `heading-aware-v1` retrieval, and `document-diversity-v1` context policy. The summarizer reports exact document sequence parity and exact chunk sequence parity by pair.

If parity differs, the evaluation report should describe the difference rather than assuming equality.

## Formal Results

Formal evaluation results are recorded separately to keep this protocol stable:

- [Phase 1-E evaluation results](phase_1_e_agent_workflow_evaluation_results.md)

## Security Notes

The evaluation artifacts must not contain:

- `.env.local`
- API key values
- auth headers
- embedding vectors
- Qdrant local storage
- private corpus content
- hidden chain-of-thought
- raw reasoning traces

The raw bundle may contain final outputs, selected source metadata, source content, Agent plan, review findings, and revision artifacts for evaluation. It is therefore local-only and ignored by Git.
