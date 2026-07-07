# AI Agent PoC Phase 1-D Review, Revision, Trace, and UI Integration

## 1. Purpose

Phase 1-D completes the bounded Agent workflow runtime for application use. It connects the Phase 1-C real Planner, Knowledge Retrieval Tool, and Draft Generator to a real structured Reviewer, real Generator revision mode, Agent API mode, Agent run persistence, and an Agent Workflow UI panel.

## 2. Scope

Implemented in this phase:

- real structured Reviewer
- real Generator revision mode
- bounded review / revision completion
- Agent API integration through `agentMode`
- separate Agent run persistence
- Agent workflow UI
- review history UI
- `completed_with_findings` warning state
- Phase 1-D smoke harness update

## 3. Non-goals

Phase 1-D does not implement formal Agent OFF / ON evaluation, Phase 1-E dataset runs, role-specific provider assignment, multi-agent debate, query rewriting, query decomposition, multi-query retrieval, MMR, reranking, hybrid retrieval, a new vector collection, a new embedding model, an orchestration framework dependency, Agent history list UI, or Agent history detail UI.

## 4. Real Reviewer Integration

The Reviewer uses the existing provider / model selected by `LLM_PROVIDER` and the corresponding model environment variable. It returns the existing `AgentReview` schema and is validated again with Zod after structured output parsing.

Reviewer prompt version:

```text
agent-poc-reviewer-v1
```

The Reviewer does not return workflow decisions. The deterministic runtime still derives `pass` or `revise` from review findings.

## 5. Reviewer Authority Policy

Reviewer authority is:

- original requirement memo: user-explicit requirements and constraints
- retrieved product knowledge: product-specific facts and rules
- AgentPlan: workflow planning artifact

AgentPlan ambiguities, knowledgeNeeds, and Planner-generated inferences are not product truth. If an ambiguity was promoted into a mandatory product rule, the Reviewer checks whether the original requirement memo or retrieved product knowledge supports it.

## 6. Severity Calibration

Severity is calibrated as follows:

- `blocker`: a core requirement or retrieved product rule has a severe error or contradiction.
- `major`: a material issue that requires revision, such as important requirement coverage loss, unsupported mandatory product rule, important cross-field inconsistency, or missing actionable work.
- `minor`: local improvement that does not require the revision loop, such as wording, redundancy, or non-critical organization.

Minor-only findings pass deterministically. The Reviewer prompt explicitly avoids major findings merely because output could be improved.

## 7. SourceIds Validation

Reviewer findings may reference selected source IDs only. `sourceIds` must be a subset of the selected Knowledge Retrieval Tool source IDs. Cross-field findings can use `sourceIds: []`.

Unknown source IDs are treated as an AgentReview contract failure and fail closed. They are not silently removed.

## 8. Deterministic Decision

`decideRevision` remains the source of truth:

- no findings or minor-only findings: `pass`
- blocker or major findings: `revise`

The provider never controls the workflow decision directly.

## 9. Real Generator Revision Mode

Revision is implemented as Generator revision mode, not a new Agent role. It uses the same provider / model as Planner, Draft, and Reviewer.

Revision prompt version:

```text
agent-poc-revision-v1
```

Revision receives the original requirement memo, AgentPlan, the same retrieved knowledge result, current `GenerationOutput`, and only blocker / major findings.

## 10. Targeted Revision Policy

Revision is instructed to:

- fix blocker / major findings targetfully
- preserve correct source-supported content
- avoid unrelated full rewrites
- avoid inventing new mandatory product rules
- keep unresolved matters as risks or confirmation concerns
- keep the final output within the existing `GenerationOutput` schema

Minor findings are retained in review history but are not passed as required correction input.

## 11. Bounded Loop

The runtime keeps:

```text
maxRevisionCount = 1
reviewCount <= 2
revisionCount <= 1
```

Knowledge Retrieval Tool is called once per Agent run. Revision and second review reuse the same knowledge result.

## 12. Completion Semantics

First review pass:

```text
planning -> knowledge_retrieval -> draft_generation -> review -> finalization
```

Revision then pass:

```text
planning -> knowledge_retrieval -> draft_generation -> review -> revision -> review -> finalization
```

Revision limit reached:

```text
planning -> knowledge_retrieval -> draft_generation -> review -> revision -> review -> finalization
```

If the second review still contains blocker / major findings, the run returns `completed_with_findings` with `terminationReason = revision_limit_reached`.

## 13. llmStepCount Semantics

`llmStepCount` counts actual provider-backed generation LLM executions:

- first review pass: Planner + Draft + Reviewer = 3
- revision path: Planner + Draft + Review #1 + Revision + Review #2 = 5

Knowledge Retrieval Tool calls, embedding calls, and finalization do not count. Usage may be unavailable; `providerBacked = true` is the count condition.

## 14. Agent Execution Artifacts

Agent artifacts are separated from `GenerationOutput`:

- AgentPlan
- safe retrieval source metadata
- retrieval metadata
- initialDraft
- revisedOutput, when revision occurred
- finalOutput
- review history
- AgentRunMetadata
- sanitized error metadata

No hidden chain-of-thought or raw reasoning trace is stored.

## 15. Review History

Review history records:

- review number
- reviewed stage: `draft` or `revision`
- AgentReview
- deterministic decision

This allows `completed_with_findings` results to expose unresolved final findings without treating them as technical failures.

## 16. Agent Run Persistence

Agent runs are persisted separately from generation history:

```text
data/agent-runs.json
```

This file is gitignored. Existing `data/generations.json` is not migrated or reused for Agent runs.

## 17. Persistence Failure Semantics

Successful terminal results persist before transition to `completed` or `completed_with_findings`. If critical persistence fails, the workflow transitions from `finalizing` to `failed` and returns `terminationReason = technical_failure`.

Technical failures persist partial structured artifacts when available. If failure-record persistence also fails, no sensitive fallback log is emitted.

## 18. Agent API Integration

`POST /api/generate` supports:

```json
{
  "inputText": "...",
  "agentMode": "on"
}
```

`agentMode` omitted or `off` preserves existing single-pass behavior.

## 19. Request Mode Semantics

When `agentMode = on`, `ragMode` and `ragContextPolicy` must be omitted. The Agent uses its internal retrieval policy:

- `heading-aware-v1`
- `document-diversity-v1`
- candidate Top K 10
- final Top K 5
- max 2 chunks per document

Conflicting RAG fields are rejected instead of silently ignored.

## 20. Agent API Response

Agent mode success returns the final `GenerationOutput` fields plus separate Agent metadata:

- runId
- status
- finalState
- terminationReason
- revisionCount
- reviewCount
- totalAgentLatencyMs
- llmStepCount
- toolInvocationCount
- step trace
- AgentPlan
- review history
- retrieval metadata
- selected source metadata

Full grounded context and retrieved chunk content are not returned as Agent artifacts.

## 21. completed_with_findings API Semantics

`completed_with_findings` is a successful HTTP response. It returns the latest valid final output, Agent warning metadata, and unresolved final findings.

It is not a technical API failure.

## 22. Agent Workflow UI

The UI adds a generation mode control:

- Single-pass
- Agent

Single-pass preserves existing RAG controls. Agent mode sends `agentMode: "on"` and does not send single-pass RAG controls.

## 23. Review History UI

Agent mode results display:

- Agent Workflow metadata
- step trace
- Agent Plan
- review history
- finding severity, category, target fields, required change, and source IDs

`completed_with_findings` appears as a warning state while still showing final output.

## 24. Retrieved Sources Reuse

Agent mode reuses Retrieved Sources concepts but displays safe metadata only:

- source ID
- document title
- heading path
- source path
- context rank
- retrieval rank
- score

It does not present claim-level citations and does not show embedding vectors.

## 25. Security

The implementation does not persist or display:

- API keys
- auth headers
- raw provider requests
- raw provider responses
- raw provider prompts
- embedding vectors
- full groundedContext duplicate
- full retrieved chunk content duplicate
- hidden chain-of-thought

Structured AgentPlan, AgentReview, GenerationOutput, and execution trace metadata are treated as structured artifacts, not chain-of-thought.

## 26. Backward Compatibility

Preserved behavior:

- existing `GenerationOutput` schema
- existing LLM App generation
- existing provider selection
- existing generation history
- `agentMode` omitted behavior
- `ragMode` off / on behavior
- `ragContextPolicy` omitted -> `raw-top-k-v1`
- existing RAG context policy semantics
- existing RAG API and evaluation CLI

Agent runs use separate persistence.

## 27. Tests

Tests cover:

- valid and invalid Reviewer output
- deterministic decision independence
- sourceIds subset validation
- same provider / model / prompt version metadata
- revision path and revision finding filtering
- completed, completed_with_findings, and failure persistence
- persistence failure fail-closed behavior
- Agent API success, warning, failure, and conflict validation
- existing single-pass and RAG request compatibility
- UI source strings for Agent workflow mode and panels

External provider, Qdrant, and embedding calls are stubbed in tests.

## 28. Smoke Harness

Local smoke command:

```bash
npm run agent:smoke
```

The smoke harness uses the full Phase 1-D real Agent workflow:

- real Planner
- real Knowledge Retrieval Tool
- real Draft Generator
- real Reviewer
- real Revision when deterministic decision requires it

The smoke output includes runId, Agent metadata, step trace, plan, retrieval metadata, review history, final output, and sanitized error metadata. It excludes raw prompts, raw provider responses, full grounded context, retrieved content, embedding vectors, and secrets.

## 29. Phase 1-D Limitations

- Formal Agent OFF / ON evaluation is not performed.
- Agent history list / detail UI is not implemented.
- Role-specific model assignment is not implemented.
- Query rewriting and multi-query retrieval are not implemented.
- Real smoke results are environment-specific and should not be generalized.

## 30. Phase 1-E Next Scope

Phase 1-E candidates:

- Agent evaluation dataset implementation
- single-pass grounded generation vs bounded Agent workflow formal runs
- common 5-axis evaluation
- cross-field consistency evaluation
- requirement-to-task traceability
- Agent-specific metrics
- Draft vs final paired analysis
- latency and token usage comparison
- embedding usage separation
- failure-domain analysis
- final recommendation and limitations

Phase 1-E is not implemented in this phase.
