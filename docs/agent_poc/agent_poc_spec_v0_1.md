# AI Agent PoC Specification v0.1

## 1. Purpose

AI Agent PoC Phase 1では、既存のLLM App PoCとRAG PoC Phase 1の上に、開発タスク作成を支援するbounded Agent workflowを設計する。

このPoCの目的は、単に複数promptを順番に呼ぶことではない。以下を明示的に扱うことで、Agent behaviorを観測・評価可能にする。

- explicit state
- explicit state transition
- tool invocation
- structured intermediate output
- deterministic conditional decision
- bounded review / revision loop
- explicit termination condition
- failure handling
- execution trace

Phase 1-Aは設計・ドキュメント作成のみであり、source code、API route、UI、schema実装、package dependencyは変更しない。

## 2. Background

このrepositoryでは、LLM App PoC Phase 1とRAG PoC Phase 1が完了している。

既存の最終生成schemaは `lib/schema.ts` の `generationOutputSchema` で定義されている。

```ts
type GenerationOutput = {
  summary: string;
  spec: string[];
  acceptanceCriteria: string[];
  jiraTasks: Array<{
    title: string;
    description: string;
    type: "frontend" | "backend" | "test" | "documentation";
  }>;
  implementationPlan: string[];
  reviewPoints: string[];
  risks: string[];
};
```

AI Agent PoCでも、最終outputはこの `GenerationOutput` を維持する。Agent固有のplan、review、state、trace、execution metadataは `GenerationOutput` に混ぜず、別metadataとして扱う。

既存providerは `mock`、`openai`、`gemini`、`anthropic` に対応している。既存RAGはQdrant OSS、OpenAI Embeddings、`text-embedding-3-small`、`heading-aware-v1`、context selection policy abstractionを備えている。

RAG Phase 1-E後のrecommended context policyは `document-diversity-v1` である。API omitted defaultの `raw-top-k-v1` behaviorはbackward compatibilityのため変更しない。

## 3. User Story

開発者またはTech Leadが粗いrequirement memoを入力する。

Agentは以下を実行する。

1. requirementを分析し、構造化する
2. product knowledge retrieval toolを呼び出す
3. structured development taskのdraftを生成する
4. requirement coverage、grounding、unsupported assumption、internal consistencyの観点でdraftをreviewする
5. structured review findingsから、revisionが必要かをdeterministicに決定する
6. 最大1回だけrevisionする
7. revised outputを再度reviewする
8. 最終的な既存 `GenerationOutput` を返す
9. `GenerationOutput` とは別に、透明性のあるAgent execution metadataとtraceを返す

## 4. Scope

Phase 1-Aで設計する。

- single-model Agent workflow
- logical role design
- state model
- allowed transition policy
- `AgentPlan`
- `knowledge.retrieve` tool contract
- draft generation contract
- `AgentReview`
- deterministic revision decision
- bounded revision loop
- failure policy
- execution metadata / trace
- trace persistence model
- minimal future UI concept
- Agent OFF / ON evaluation design
- Phase 1-B implementation task

すべてのLLM stepでは、選択された1つのprovider / modelを使用する。Roleはlogical roleであり、独立したautonomous agentではない。

## 5. Non-goals

Phase 1では以下を行わない。

- multi-agent debate
- roleごとのdifferent provider
- ClaudeとCodexの議論
- LangGraph
- Temporal
- MCP server
- browser agent
- distributed orchestration
- autonomous code modification
- autonomous shell execution
- retrieval query rewrite
- query decomposition
- multi-query retrieval
- MMR
- reranking
- hybrid retrieval
- Agent専用vector collection
- new embedding model
- `GenerationOutput` schema変更
- existing generation history migration

Future candidateとして query reformulation、multi-query retrieval、additional tools、multi-model role assignment、multi-agent debate、LangGraphまたはdedicated orchestration frameworkは検討対象になり得る。ただし、Agent PoC Phase 1のscope外である。

## 6. Agent Definition In This PoC

このPoCにおけるAgentは、以下を持つbounded workflow runtimeである。

- workflow state
- structured intermediate artifacts
- tool invocation contract
- deterministic decision policy
- bounded review / revision loop
- traceable execution metadata
- fail-closed failure policy

単なるprompt chainではなく、state transitionとdecision policyにより実行経路が制御されるworkflowとして扱う。

## 7. Reuse Of Existing Architecture

既存実装を再利用する。

- `generationOutputSchema`
- provider abstraction: `generateFromRequirementMemo`
- prompt versioning: `llm-app-poc-rag-v1`
- RAG retriever: `retrieveRagChunks`
- context selection: `selectRagContextChunks`
- grounded context builder: `buildGroundedContext`
- RAG source metadata: `RagSource`
- RAG metadata: `RagMetadata`
- generation history compatibility

Agent Phase 1はRAGを再設計しない。semantic retrieval baseline、chunking、embedding model、Qdrant payload、context selection policyは既存RAG Phase 1の結果を前提にする。

## 8. Agent OFF / ON Definition

### Agent OFF

Agent OFFは、既存のsingle-pass grounded generationである。

```text
Requirement memo
  -> existing RAG retrieval
  -> single structured generation
  -> GenerationOutput
```

条件:

- `ragMode = on`
- `ragContextPolicy = document-diversity-v1`
- `heading-aware-v1`
- `text-embedding-3-small`
- candidateTopK = 10
- requestedFinalTopK = 5
- maxChunksPerDocument = 2

### Agent ON

Agent ONは、bounded Agent workflowである。

```text
Requirement memo
  -> Requirement Analysis
  -> Knowledge Retrieval Tool
  -> Draft Generation
  -> Structured Review
  -> Deterministic Revision Decision
       |-> Pass -> Final
       |-> Revise -> Revision -> Review -> Final
  -> GenerationOutput
```

正式比較では、適用可能な範囲で同じrequirement memo、provider、model、synthetic corpus、chunk strategy、embedding model、context policy、candidateTopK、finalTopK、`GenerationOutput` schemaを使用する。

Agent OFF / ONともretrieval queryは元のrequirement memoそのものを使用する。Plannerは `knowledgeNeeds` を識別してよいが、Phase 1ではretrieval queryのrewrite、decomposition、multiple query生成に使用しない。

この比較はsingle-pass grounded generation vs bounded Agent workflowである。strict single-variable causal ablationではないため、そのような主張はしない。

## 9. Workflow Overview

最大successful workflow:

```text
initialized
  -> planning
  -> retrieving
  -> drafting
  -> reviewing
  -> deciding
  -> revising
  -> reviewing
  -> deciding
  -> finalizing
  -> completed or completed_with_findings
```

revisionが不要な場合:

```text
initialized
  -> planning
  -> retrieving
  -> drafting
  -> reviewing
  -> deciding
  -> finalizing
  -> completed
```

technical / contract failureが発生した場合は `failed` へ遷移する。既存single-pass generationへsilent fallbackしない。

## 10. State Model

Conceptual state:

```ts
type AgentStateName =
  | "initialized"
  | "planning"
  | "retrieving"
  | "drafting"
  | "reviewing"
  | "deciding"
  | "revising"
  | "finalizing"
  | "completed"
  | "completed_with_findings"
  | "failed";
```

Agent run statusとcurrent workflow stateは区別する。

```ts
type AgentRunStatus =
  | "running"
  | "completed"
  | "completed_with_findings"
  | "failed";
```

Terminal states:

- `completed`
- `completed_with_findings`
- `failed`

Terminal stateから別stateへの遷移は拒否する。

## 11. Allowed Transitions

Allowed transitions:

| From | To |
|---|---|
| `initialized` | `planning` |
| `planning` | `retrieving`, `failed` |
| `retrieving` | `drafting`, `failed` |
| `drafting` | `reviewing`, `failed` |
| `reviewing` | `deciding`, `failed` |
| `deciding` | `finalizing`, `revising`, `failed` |
| `revising` | `reviewing`, `failed` |
| `finalizing` | `completed`, `completed_with_findings`, `failed` |

未定義transitionはrejectする。

Invalid examples:

- `initialized -> reviewing`
- `planning -> revising`
- `reviewing -> drafting`
- `completed -> planning`

State transition validationはworkflow runtimeの責務であり、model出力に委譲しない。

## 12. Logical Roles

### Requirement Analyst / Planner

Input:

- original requirement memo

Output:

- `AgentPlan`

Responsibilities:

- goal normalize
- explicit requirement extraction
- constraint extraction
- ambiguity identification
- knowledge need identification

Non-responsibilities:

- final `GenerationOutput`
- detailed implementation design
- final Jira decomposition
- retrieval query rewrite

### Generator

Input:

- original requirement memo
- `AgentPlan`
- retrieved product knowledge

Output:

- existing `GenerationOutput`

The Generator must respect retrieved product knowledge and avoid turning unsupported assumptions into mandatory product requirements.

### Reviewer

Input:

- original requirement memo
- `AgentPlan`
- retrieved product knowledge / source references
- current `GenerationOutput`

Output:

- structured `AgentReview`

Reviewer does not directly modify `GenerationOutput`.

### Reviser

Reviser is not modeled as an independent autonomous agent. Revision is Generator revision mode.

Revision input:

- original requirement memo
- `AgentPlan`
- same retrieved product knowledge
- current `GenerationOutput`
- blocker / major review findings

Revision output:

- existing `GenerationOutput`

## 13. AgentPlan

Minimal structured `AgentPlan`:

```ts
type AgentPlan = {
  normalizedGoal: string;
  explicitRequirements: string[];
  constraints: string[];
  ambiguities: string[];
  knowledgeNeeds: string[];
};
```

Rules:

- Do not include free-form reasoning fields.
- Do not include chain-of-thought.
- Do not generate final implementation plan.
- Do not generate final Jira decomposition.
- Do not add `retrievalQuery` in Phase 1.
- Knowledge Retrieval Tool input query is the original requirement memo.

## 14. Knowledge Retrieval Tool Contract

Conceptual tool name:

```text
knowledge.retrieve
```

This tool reuses existing RAG implementation:

- `retrieveRagChunks`
- `selectRagContextChunks`
- `buildGroundedContext`

Recommended configuration:

```text
chunkStrategy = heading-aware-v1
contextPolicy = document-diversity-v1
candidateTopK = 10
requestedFinalTopK = 5
maxChunksPerDocument = 2
```

Conceptual input:

```ts
type KnowledgeRetrievalToolInput = {
  query: string;
};
```

The query must be the original requirement memo in Phase 1.

Conceptual result:

```ts
type KnowledgeRetrievalToolResult = {
  groundedContext: string;
  sources: RagSource[];
  ragMetadata: Extract<RagMetadata, { mode: "on" }>;
  embeddingUsage?: {
    promptTokens?: number;
    totalTokens?: number;
  };
};
```

Tool abstraction must preserve:

- original semantic score
- retrievalRank
- contextRank
- source IDs
- candidate metrics
- selected context metrics

Tool execution metadata:

```ts
type AgentToolInvocationTrace = {
  toolName: "knowledge.retrieve";
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  status: "completed" | "failed";
};
```

Persisted trace should prefer source metadata references over duplicated full retrieved content.

## 15. Draft Generation

Draft generation uses the selected provider / model and produces existing `GenerationOutput`.

Input:

- original requirement memo
- `AgentPlan`
- `groundedContext`
- source references

Output:

- `GenerationOutput`

Validation:

- JSON parse
- `generationOutputSchema` Zod validation

Draft failure is a technical / contract failure and transitions to `failed`.

## 16. AgentReview

Review output must contain structured findings. It must not be only `decision: pass | revise`.

```ts
type AgentReviewSeverity =
  | "blocker"
  | "major"
  | "minor";

type AgentReviewCategory =
  | "requirement_coverage"
  | "grounding_consistency"
  | "unsupported_assumption"
  | "cross_field_consistency"
  | "actionability";

type GenerationOutputField =
  | "summary"
  | "spec"
  | "acceptanceCriteria"
  | "jiraTasks"
  | "implementationPlan"
  | "reviewPoints"
  | "risks";

type AgentReviewFinding = {
  findingId: string;
  category: AgentReviewCategory;
  severity: AgentReviewSeverity;
  targetFields: GenerationOutputField[];
  message: string;
  requiredChange: string;
  sourceIds: string[];
};

type AgentReview = {
  summary: string;
  findings: AgentReviewFinding[];
};
```

`sourceIds` may be an empty array when a finding is not source-specific.

Rules:

- Do not include hidden reasoning.
- Do not include chain-of-thought.
- Do not include raw provider prompts or responses.

## 17. Deterministic Revision Decision

Revision decision is derived by workflow code from structured findings.

```ts
function decideRevision(review: AgentReview): "pass" | "revise" {
  const requiresRevision = review.findings.some(
    (finding) =>
      finding.severity === "blocker" ||
      finding.severity === "major"
  );

  return requiresRevision ? "revise" : "pass";
}
```

Policy:

- blocker exists -> revise
- major exists -> revise
- minor findings only -> pass
- no findings -> pass

This prevents contradictory states such as major finding present and decision = pass. Reviewer identifies findings; workflow code makes the transition decision.

## 18. Bounded Revision Loop

Configuration:

```text
maxRevisionCount = 1
```

Counters:

- `revisionCount`
- `reviewCount`

Maximum review count:

```text
maxReviewCount = maxRevisionCount + 1 = 2
```

The workflow must terminate deterministically.

If first review passes, no revision occurs.

If first review has blocker or major findings, one revision may occur.

If second review still has blocker or major findings and `revisionCount === maxRevisionCount`, the run completes as `completed_with_findings`, not `failed`.

## 19. Failure Policy

Technical / contract failure and bounded quality non-pass are separated.

Technical / contract failure examples:

- Planner provider failure
- `AgentPlan` parse failure
- `AgentPlan` schema validation failure
- Knowledge Retrieval Tool failure
- zero retrieved chunks when Agent knowledge retrieval is required
- RAG payload validation failure
- Draft provider failure
- `GenerationOutput` validation failure
- Reviewer provider failure
- `AgentReview` validation failure
- Revision provider failure
- revised `GenerationOutput` validation failure
- invalid state transition
- critical Agent trace persistence failure

These set:

```text
state = failed
status = failed
terminationReason = technical_failure
```

Do not silently fallback to existing single-pass generation. Agent ON must not secretly become Agent OFF.

Quality non-pass:

If second review still has blocker or major findings and revision budget is exhausted:

```text
state = completed_with_findings
status = completed_with_findings
terminationReason = revision_limit_reached
```

The latest structurally valid `GenerationOutput` is returned with transparent review findings.

## 20. Execution Metadata

Agent metadata is separated from `GenerationOutput`.

```ts
type AgentRunMetadata = {
  agentVersion: string;
  status: "completed" | "completed_with_findings" | "failed";
  finalState: AgentStateName;
  maxRevisionCount: number;
  revisionCount: number;
  reviewCount: number;
  terminationReason:
    | "review_passed"
    | "revision_limit_reached"
    | "technical_failure";
  totalAgentLatencyMs: number;
  llmStepCount: number;
  toolInvocationCount: number;
  llmUsage?: AgentLlmUsageAggregate;
  retrievalEmbeddingUsage?: {
    promptTokens?: number;
    totalTokens?: number;
  };
  steps: AgentStepTrace[];
};

type AgentLlmUsageAggregate = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};
```

Provider token usage must use provider-reported usage only. Do not estimate unavailable token usage. Retrieval embedding usage is separate from generation LLM usage.

## 21. Step Trace

```ts
type AgentStepTrace = {
  stepId: string;
  stepName:
    | "planning"
    | "knowledge_retrieval"
    | "draft_generation"
    | "review"
    | "revision"
    | "finalization";
  sequence: number;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  status: "completed" | "failed";
  provider?: string;
  modelName?: string;
  promptVersion?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reviewDecision?: "pass" | "revise";
};
```

`latencyMs` is the broader workflow step duration. Provider-specific LLM call duration may be tracked separately if the implementation exposes it, but existing `providerLatencyMs` definitions must not be redefined.

## 22. Trace Persistence

Future MVP path:

```text
data/agent-runs.json
```

Implementation must add this file to `.gitignore` before it is generated.

Candidate `AgentRunRecord` fields:

- runId
- createdAt
- updatedAt
- original input
- Agent configuration
- current / final state
- `AgentPlan`
- retrieval source metadata
- initial draft
- review history
- revision count
- final `GenerationOutput`
- Agent execution metadata
- sanitized error metadata

Do not persist:

- API keys
- authorization headers
- raw provider requests
- raw provider responses
- embedding vectors
- hidden chain-of-thought
- free-form model reasoning traces
- full debug prompts

Structured `AgentPlan` and `AgentReview` are execution artifacts. They must not be described as chain-of-thought.

Existing generation history remains readable. Agent Phase 1 must not require migration of existing `data/generations.json`.

## 23. UI Concept

Future UI adds a generation mode control:

- Single-pass
- Agent workflow

The existing `GenerationOutput` rendering is reused.

Agent workflow adds an Agent trace panel:

```text
Agent Workflow

✓ Requirement Analysis
✓ Knowledge Retrieval
✓ Draft Generation
✓ Review
↻ Revision
✓ Final Review
✓ Completed
```

Summary metadata:

- final status
- revision count
- review count
- termination reason
- total Agent latency
- LLM step count
- tool invocation count

Review summary and structured findings may be displayed.

Do not display:

- raw provider prompt
- raw provider response
- API keys
- auth headers
- hidden chain-of-thought
- free-form internal reasoning

Existing Retrieved Sources display concepts may be reused. Do not claim claim-level citation exists unless a future implementation explicitly supports it.

## 24. Security

Existing repository security rules are maintained.

Gitignored:

- `.env.local`
- `data/generations.json`
- future `data/agent-runs.json`

Do not display, save, or commit:

- API keys
- `QDRANT_API_KEY`
- authorization headers
- embedding vectors
- hidden chain-of-thought

Do not log:

- full requirement memo
- full retrieved context
- raw provider request with secrets
- auth headers

Agent execution trace uses structured artifacts and sanitized metadata. Public-safe evaluation uses synthetic corpus only.

## 25. Backward Compatibility

The Agent PoC must preserve:

- existing `GenerationOutput` schema
- existing `/api/generate` behavior unless an explicit Agent route/mode is added in a later phase
- existing RAG OFF / ON behavior
- existing `ragContextPolicy` default
- existing generation history readability
- existing public sample policy

No history migration is required for Agent Phase 1.

## 26. Phase Decomposition

### Phase 1-A: Agent Workflow and Evaluation Design

Deliverables:

- Agent PoC specification
- evaluation specification
- implementation task prompt / document

### Phase 1-B: Agent Workflow Runtime Foundation

Scope:

- Agent state types
- explicit state transition policy
- orchestrator skeleton
- `AgentPlan` schema
- `AgentReview` schema
- deterministic revision decision
- tool interface
- stub executors
- bounded loop behavior
- unit tests

No external API call.

### Phase 1-C: Planning, Knowledge Tool, and Draft Integration

Scope:

- single-model Planner integration
- existing provider abstraction reuse
- Knowledge Retrieval Tool
- existing RAG reuse
- `document-diversity-v1`
- draft `GenerationOutput` integration
- fail-closed retrieval behavior

### Phase 1-D: Review, Revision, Trace, and UI Integration

Scope:

- structured Reviewer
- revision mode
- bounded review / revision loop
- Agent run persistence
- execution trace
- Agent workflow UI
- `completed_with_findings` behavior
- failure handling

### Phase 1-E: Single-pass vs Agent Workflow Evaluation

Scope:

- Agent evaluation dataset
- formal Agent OFF / ON runs
- first draft vs final paired evaluation
- common quality axes
- Agent outcome axes
- Agent-specific workflow metrics
- latency
- provider-reported token usage
- failure-domain analysis
- final recommendation / limitation documentation

## 27. Open Limitations / Future Candidates

Open limitations:

- Agent workflow increases LLM step count, latency, and token usage.
- Reviewer findings are part of the workflow and are not independent quality ground truth.
- `maxRevisionCount = 1` may leave some major findings unresolved.
- Retrieval query is intentionally unchanged, so missed candidate sources remain possible.
- selected source does not guarantee every rule in that source appears in final output.

Future candidates outside Phase 1:

- query reformulation
- multi-query retrieval
- MMR
- reranking
- hybrid retrieval
- additional tools
- multi-model role assignment
- multi-agent debate
- LangGraph or dedicated orchestration framework
