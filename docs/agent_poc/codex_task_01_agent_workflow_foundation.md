# Codex Task 01 — Agent Workflow Runtime Foundation

## Objective

Implement AI Agent PoC Phase 1-B: Agent Workflow Runtime Foundation in:

```text
C:\Users\tomo5\ai_development_support_workbench
```

Read these documents first:

```text
docs/agent_poc/agent_poc_spec_v0_1.md
docs/agent_poc/agent_poc_evaluation_v0_1.md
```

Phase 1-B implements runtime foundation only. Do not integrate real provider calls, real Qdrant retrieval, UI, persistence, or formal evaluation.

Do not commit.

## Current Background

The repository already contains:

- Next.js / React / TypeScript
- `generationOutputSchema` and `GenerationOutput`
- multi-provider generation: `mock`, `openai`, `gemini`, `anthropic`
- RAG retriever, context selection, grounded context builder
- `RagContextPolicy`: `raw-top-k-v1`, `document-cap-v1`, `document-diversity-v1`
- recommended RAG context policy after Phase 1-E: `document-diversity-v1`

Keep existing `GenerationOutput` unchanged.

Do not change existing RAG behavior.

Do not change `ragContextPolicy` default.

Do not migrate generation history.

## Repository Inspection

Before choosing exact file paths or names, inspect current repository conventions:

1. `git status --short`
2. `package.json`
3. `lib/schema.ts`
4. `lib/generator.ts`
5. `lib/rag/retriever.ts`
6. `lib/rag/context-selection.ts`
7. `lib/rag/context.ts`
8. `tests/generation.test.ts`
9. `tests/rag.test.ts`

Use actual repository naming as source of truth. If this task uses conceptual names that differ from current implementation, preserve the design intent and use repository terminology.

If working tree is not clean, report it before mixing changes.

## Scope

Implement:

- Agent state types
- explicit allowed transition policy
- state transition validation
- `AgentPlan` Zod schema
- `AgentReview` Zod schema
- review finding severity / category
- deterministic revision decision
- `maxRevisionCount = 1`
- workflow orchestrator skeleton
- Agent tool interface
- stub / fake Knowledge Retrieval Tool
- stub Planner
- stub Generator
- stub Reviewer
- Generator revision mode
- execution trace model
- bounded loop
- terminal states
- failure result model
- unit tests

## Non-goals

Do not implement:

- real provider integration
- real Knowledge Retrieval Tool integration
- real OpenAI / Gemini / Anthropic call
- real Qdrant call
- real Embeddings call
- UI
- persistence
- formal evaluation
- multi-agent debate
- LangGraph
- Temporal
- MCP
- shell / browser / code execution tools
- autonomous code modification
- claim-level citation

External calls must be stubbed/faked in tests.

## Suggested File Organization

Choose exact paths after inspecting repository conventions.

Expected direction:

```text
lib/agent/schema.ts
lib/agent/state.ts
lib/agent/decision.ts
lib/agent/orchestrator.ts
tests/agent.test.ts
```

This is a suggestion, not a hard requirement. Keep the implementation small and coherent.

## State Model

Implement conceptual state:

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

Terminal states:

- `completed`
- `completed_with_findings`
- `failed`

Run status may be separate from workflow state:

```ts
type AgentRunStatus =
  | "running"
  | "completed"
  | "completed_with_findings"
  | "failed";
```

## Allowed Transition Policy

Implement allowed transitions:

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

Reject undefined transitions.

Invalid examples:

- `initialized -> reviewing`
- `planning -> revising`
- `reviewing -> drafting`
- `completed -> planning`

## AgentPlan Schema

Implement a Zod schema:

```ts
type AgentPlan = {
  normalizedGoal: string;
  explicitRequirements: string[];
  constraints: string[];
  ambiguities: string[];
  knowledgeNeeds: string[];
};
```

Do not include:

- hidden reasoning
- chain-of-thought
- free-form reasoning field
- `retrievalQuery`

Planner must not generate final `GenerationOutput`, detailed implementation plan, or final Jira decomposition.

## AgentReview Schema

Implement:

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

`sourceIds` may be empty.

Reviewer output must be structured findings, not only `decision: pass | revise`.

## Deterministic Revision Decision

Implement:

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

- blocker -> revise
- major -> revise
- minor only -> pass
- no findings -> pass

Workflow code makes the decision. Reviewer model does not control state transition directly.

## Bounded Loop

Use:

```text
maxRevisionCount = 1
```

Track:

- `revisionCount`
- `reviewCount`

Maximum review count is 2.

If second review still has blocker or major findings after one revision, return:

```text
status = completed_with_findings
terminationReason = revision_limit_reached
```

Do not run a second revision.

## Tool Interface

Define a conceptual Agent tool interface for future Knowledge Retrieval Tool.

For Phase 1-B, implement a stub/fake Knowledge Retrieval Tool.

Conceptual tool:

```text
knowledge.retrieve
```

Conceptual input:

```ts
type KnowledgeRetrievalToolInput = {
  query: string;
};
```

Phase 1-B stub result can be minimal but must represent:

- grounded context text or equivalent placeholder
- source metadata reference
- retrieval metadata
- optional embedding usage

Successful or review-complete Agent runs must call Knowledge Retrieval Tool exactly once.

Zero usable knowledge result must fail closed.

Do not call real Qdrant or Embeddings.

## Stub Executors

Implement dependency-injected stubs/fakes:

- Planner
- Knowledge Retrieval Tool
- Generator
- Reviewer

Generator supports:

- draft mode
- revision mode

The orchestrator should be testable by swapping stub behavior.

## Orchestrator Skeleton

Implement a small orchestrator that:

1. starts in `initialized`
2. transitions to `planning`
3. calls Planner
4. validates `AgentPlan`
5. transitions to `retrieving`
6. calls Knowledge Retrieval Tool exactly once
7. fails closed on zero usable knowledge
8. transitions to `drafting`
9. calls Generator draft mode
10. validates `GenerationOutput`
11. transitions to `reviewing`
12. calls Reviewer
13. validates `AgentReview`
14. transitions to `deciding`
15. uses deterministic revision decision
16. either finalizes or revises
17. if revising, calls Generator revision mode once
18. validates revised `GenerationOutput`
19. reviews again
20. finalizes as `completed` or `completed_with_findings`

Technical / contract failures return `failed`.

Do not silently fallback to single-pass generation.

## Failure Result Model

Represent technical failures with sanitized metadata.

Examples:

- planner schema failure
- retrieval tool failure
- zero knowledge result
- draft schema failure
- review schema failure
- revision schema failure
- invalid state transition

Do not include:

- API keys
- raw provider request
- raw provider response
- full debug prompt
- hidden reasoning

## Execution Trace Model

Implement trace data for each step.

Conceptual shape:

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

Token usage, when included in stubs, should represent provider-reported values. Do not estimate unavailable usage.

## Metadata Model

Return Agent metadata separately from `GenerationOutput`.

Conceptual shape:

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
  steps: AgentStepTrace[];
};
```

Do not put AgentPlan, AgentReview, trace, or Agent metadata inside `GenerationOutput`.

## Tests Required

Add unit tests with external calls stubbed.

Minimum tests:

1. happy path
   - first review passes
   - result is `completed`
   - no revision

2. revision path
   - first review returns major finding
   - one revision runs
   - second review passes
   - result is `completed`

3. revision limit path
   - first review requires revision
   - revision runs
   - second review still requires revision
   - result is `completed_with_findings`
   - `terminationReason = revision_limit_reached`

4. blocker path
   - blocker triggers revision

5. minor-only path
   - minor findings only do not trigger revision

6. planner schema failure
   - Agent run fails closed

7. retrieval tool failure
   - Agent run fails closed

8. zero knowledge result
   - Agent run fails closed

9. draft schema failure
   - Agent run fails closed

10. review schema failure
   - Agent run fails closed

11. revision schema failure
   - Agent run fails closed

12. invalid state transition
   - rejected

13. maxRevisionCount
   - revision never exceeds one

14. trace
   - step sequence and terminal state are recorded

15. tool invocation
   - successful or review-complete Agent run calls Knowledge Retrieval Tool exactly once

Existing generation and RAG tests must continue to pass.

## Validation Commands

Run:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Do not run real external API, Qdrant, or Embeddings calls.

## Security Requirements

Ensure:

- `.env.local` remains ignored
- `data/generations.json` remains ignored
- future `data/agent-runs.json` is ignored before persistence is implemented
- no API key values
- no auth headers
- no embedding vectors
- no raw provider prompts/responses
- no hidden chain-of-thought

Debug logs must not include full requirement memo or full retrieved context.

## Documentation Notes

If implementation adds public docs, state clearly:

- Phase 1-B uses stubs/fakes only
- real provider integration is Phase 1-C or later
- UI and persistence are Phase 1-D or later
- formal Agent OFF / ON evaluation is Phase 1-E

## Final Report

Summarize:

- files changed
- architecture
- state model
- transition validation
- deterministic revision decision
- bounded loop behavior
- failure policy
- stub tool/executor design
- tests added
- validation results
- confirmation that no external API/Qdrant/Embeddings calls were made
- current git status

Do not commit.
