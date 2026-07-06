# AI Agent PoC Phase 1-B Runtime Foundation

## Status

Phase 1-B implements the Agent workflow runtime foundation with stubbed executors only.

No real OpenAI, Gemini, Anthropic, Qdrant, or Embeddings calls are performed by this runtime foundation.

## File Mapping

| Design area | Implementation file |
|---|---|
| State model and allowed transitions | `lib/agent/state.ts` |
| AgentPlan, AgentReview, trace, metadata schemas | `lib/agent/schema.ts` |
| Deterministic revision decision | `lib/agent/decision.ts` |
| Orchestrator skeleton and stub executor helpers | `lib/agent/orchestrator.ts` |
| Unit tests | `tests/agent.test.ts` |

## Implemented Runtime Behavior

- Explicit Agent state names.
- Explicit allowed transition policy.
- Invalid transition rejection.
- Terminal states: `completed`, `completed_with_findings`, `failed`.
- `AgentPlan` Zod validation.
- `AgentReview` Zod validation.
- Deterministic `decideRevision` policy.
- `maxRevisionCount = 1`.
- `reviewCount <= 2`.
- Knowledge Retrieval Tool abstraction named `knowledge.retrieve`.
- Fake / stub executors for Planner, Generator, Reviewer, and Knowledge Retrieval Tool.
- One retrieval invocation per Agent run.
- Revision mode is implemented as Generator revision mode, not a fourth autonomous agent.
- Technical / contract failures return `failed`.
- Revision budget exhaustion with remaining blocker / major findings returns `completed_with_findings`.
- Execution trace and Agent metadata are returned separately from `GenerationOutput`.

## Non-goals Preserved

Phase 1-B does not implement:

- real provider integration
- real RAG integration
- new API route
- UI
- Agent run persistence
- formal Agent OFF / ON evaluation
- multi-agent workflow
- orchestration framework dependency

`GenerationOutput` remains unchanged. Existing RAG behavior and `ragContextPolicy` defaults remain unchanged.
