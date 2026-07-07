# AI Agent PoC Phase 1-C Planning, Knowledge Tool, and Draft Integration

## 1. Purpose

Phase 1-C connects real Planning, real Knowledge Retrieval, and real Draft Generation to the Phase 1-B bounded Agent workflow runtime.

The workflow boundary is:

```text
original requirement memo
  -> real single-model Planner
  -> AgentPlan
  -> real knowledge.retrieve
  -> existing RAG retrieval
  -> existing context selection
  -> grounded product knowledge
  -> real structured Draft Generator
  -> GenerationOutput
  -> stub Reviewer
  -> deterministic decision
  -> finalization
```

## 2. Scope

Implemented in this phase:

- real Planner adapter
- real Draft Generator adapter
- real Knowledge Retrieval Tool adapter
- Agent composition root
- local smoke CLI
- provider/model/prompt/usage metadata propagation into Agent step trace
- tests with provider and RAG boundaries mocked

## 3. Non-goals

Phase 1-C does not implement:

- real Reviewer
- real revision LLM call
- Agent API mode
- Agent UI
- Agent run persistence
- formal Agent OFF / ON evaluation
- query rewriting
- query decomposition
- multi-query retrieval
- MMR
- reranking
- hybrid retrieval
- new vector collection
- new embedding model
- multi-agent workflow
- orchestration framework dependency

## 4. Real Planner Integration

The Planner uses the selected `LLM_PROVIDER` and model from the existing environment convention. It returns `AgentPlan` and validates the final result with the existing Phase 1-B `agentPlanSchema`.

Planner prompt version:

```text
agent-poc-planner-v1
```

The Planner does not generate `GenerationOutput`, final acceptance criteria, Jira decomposition, implementation plan, or retrieval query.

## 5. Planner Structured Output / AgentPlan Validation

Planner structured output contains only:

- `normalizedGoal`
- `explicitRequirements`
- `constraints`
- `ambiguities`
- `knowledgeNeeds`

`retrievalQuery`, free-form reasoning fields, and chain-of-thought fields are not part of the schema. Invalid planner output is a technical / contract failure and the Agent run fails closed before retrieval.

## 6. Original Requirement Memo Retrieval Query Policy

Phase 1-C always calls:

```ts
knowledge.retrieve({ query: originalRequirementMemo })
```

The Agent does not use `normalizedGoal`, `knowledgeNeeds`, rewritten text, decomposed queries, or multiple queries for retrieval.

## 7. Real Knowledge Retrieval Tool Integration

The real `knowledge.retrieve` adapter reuses existing RAG modules:

- `retrieveRagChunks`
- `selectRagContextChunks`
- `buildGroundedContext`

It does not implement independent semantic ranking.

## 8. Existing RAG Reuse Mapping

| Agent tool responsibility | Existing RAG implementation |
|---|---|
| semantic retrieval | `retrieveRagChunks` |
| chunk strategy | `heading-aware-v1` |
| context policy | `document-diversity-v1` |
| candidate count | `getCandidateTopKForContextPolicy("document-diversity-v1")` |
| selected context construction | `selectRagContextChunks` |
| grounded context text / source metadata | `buildGroundedContext` |

The adapter preserves original semantic score, `retrievalRank`, `contextRank`, source IDs, candidate metrics, and selected context metrics.

## 9. Explicit Agent Context Policy

Agent Phase 1-C explicitly selects:

```text
document-diversity-v1
```

This does not change the existing API default:

```text
ragContextPolicy omitted -> raw-top-k-v1
```

## 10. Real Draft Generator Integration

The Draft Generator uses the same provider/model as Planner and returns the existing `GenerationOutput`. The result is validated with the existing `generationOutputSchema`.

Draft prompt version:

```text
agent-poc-draft-v1
```

This is intentionally distinct from the single-pass grounded generation prompt version `llm-app-poc-rag-v1`.

## 11. Authority Distinction

Draft input authority:

- original requirement memo: user-explicit requirement / constraint
- retrieved product knowledge: product-specific fact / rule
- AgentPlan: workflow planning artifact

AgentPlan `knowledgeNeeds` are not product truth. If a Planner identifies a knowledge need but retrieved sources do not provide the rule, the Draft Generator must not turn it into a mandatory product requirement.

## 12. Prompt Versions

| Step | Prompt version |
|---|---|
| Planner | `agent-poc-planner-v1` |
| Draft Generator | `agent-poc-draft-v1` |

## 13. Provider / Model Policy

Planner and Draft Generator use the same selected provider/model from existing environment variables.

Phase 1-C does not implement role-specific provider/model assignment.

## 14. Fail-closed Behavior

The Agent run fails closed for:

- Planner provider failure
- Planner parse / schema validation failure
- query embedding failure
- Qdrant / retrieval failure
- context selection failure
- zero selected chunks
- grounded context construction failure
- Draft Generator provider failure
- Draft `GenerationOutput` validation failure

The workflow does not silently fallback to single-pass generation or fake knowledge.

## 15. Usage Metadata

Planner and Draft Generator propagate provider-reported usage when available:

- `inputTokens`
- `outputTokens`
- `totalTokens`

Unavailable token usage remains undefined. Retrieval embedding usage stays separate and is not merged into LLM usage totals.

## 16. Latency Semantics

`AgentStepTrace.latencyMs` is workflow step duration from step start to step completion.

`providerLatencyMs`, when available, is provider call duration. Existing LLM App and RAG latency definitions are not redefined.

## 17. Stub Reviewer Policy

Reviewer remains deterministic stub in Phase 1-C. The normal smoke path returns:

```json
{
  "summary": "Phase 1-C stub reviewer returned no findings.",
  "findings": []
}
```

This produces deterministic `pass`, `revisionCount = 0`, and `reviewCount = 1`.

## 18. Smoke Harness

Local smoke command:

```bash
npm run agent:smoke
```

The CLI loads `.env.local` at the entrypoint using the existing RAG CLI env bootstrap pattern. It does not persist smoke output.

## 19. Security

Smoke output excludes:

- API keys
- authorization headers
- raw provider request
- raw provider response
- embedding vectors
- full grounded context
- full retrieved chunk content
- raw provider prompt
- hidden chain-of-thought
- free-form internal reasoning trace

Source metadata is printed without chunk `content`.

## 20. Backward Compatibility

Phase 1-C does not change:

- existing `/api/generate`
- existing generation UI
- existing generation history
- `GenerationOutput`
- RAG API
- RAG context policies
- `ragContextPolicy` default
- RAG evaluation commands

Agent runtime remains a separate integration path.

## 21. Tests

Tests cover:

- Planner structured validation
- invalid Planner fail-closed behavior
- original requirement memo retrieval query policy
- Knowledge Retrieval Tool RAG configuration
- retrieval failure and zero context fail-closed behavior
- Draft Generator use of AgentPlan and grounded knowledge
- Draft `GenerationOutput` validation
- same provider/model policy
- prompt version separation
- provider usage preservation
- unavailable usage remaining undefined
- stub Reviewer normal workflow

External provider and RAG boundaries are mocked in tests.

## 22. Phase 1-C Limitations

- Reviewer is still a stub.
- Revision LLM integration is not implemented.
- Agent API and UI are not implemented.
- Agent run persistence is not implemented.
- No formal Agent OFF / ON evaluation is performed.
- Retrieval query optimization remains intentionally out of scope.

## 23. Phase 1-D Next Scope

Phase 1-D candidates:

- real structured Reviewer
- real Generator revision mode
- review / revision LLM integration
- Agent API integration
- Agent run persistence
- execution trace persistence
- Agent workflow UI
- `completed_with_findings` UI / metadata handling

## 24. Local Real Smoke Result

The first local real smoke run completed successfully with the Phase 1-C workflow integration.

Run summary:

| Field | Value |
|---|---:|
| status | `completed` |
| finalState | `completed` |
| terminationReason | `review_passed` |
| revisionCount | 0 |
| reviewCount | 1 |
| toolInvocationCount | 1 |
| totalAgentLatencyMs | 11224 |

Step sequence:

```text
planning
knowledge_retrieval
draft_generation
review
finalization
```

Latency:

| Step | Step latency | Provider latency |
|---|---:|---:|
| planning | 4198 ms | 4191 ms |
| knowledge_retrieval | 924 ms | N/A |
| draft_generation | 6102 ms | 6100 ms |
| review | 0 ms | N/A |

Provider / usage:

| Step | Provider | Model | Prompt version | Input | Output | Total |
|---|---|---|---|---:|---:|---:|
| planning | `openai` | `gpt-5.4-mini` | `agent-poc-planner-v1` | 286 | 326 | 612 |
| draft_generation | `openai` | `gpt-5.4-mini` | `agent-poc-draft-v1` | 1366 | 1101 | 2467 |

Retrieval embedding usage is recorded separately:

| Metric | Value |
|---|---:|
| promptTokens | 72 |
| totalTokens | 72 |

Retrieval composition:

| Metric | Value |
|---|---:|
| candidateTopK | 10 |
| candidateChunkCount | 10 |
| candidateUniqueDocumentCount | 5 |
| requestedFinalTopK | 5 |
| selectedChunkCount | 5 |
| uniqueDocumentCount | 5 |
| maximumChunksFromSameDocument | 1 |

Selected documents:

- `profile-image-spec`
- `error-message-guideline`
- `profile-api`
- `storage-lifecycle`
- `frontend-cache-guideline`

## 25. llmStepCount Instrumentation Correction

Initial smoke output reported:

```text
llmStepCount = 3
```

However, Phase 1-C uses a stub Reviewer. The only real provider-backed LLM steps in the normal path are:

- `planning`
- `draft_generation`

The metric semantics were corrected to count actual provider-backed LLM executions, not logical LLM-capable role names. Stub Reviewer steps are excluded. Knowledge Retrieval Tool invocations, including embedding calls, are not generation LLM steps.

Corrected expected Phase 1-C normal smoke:

```text
llmStepCount = 2
```

This is an instrumentation correction, not a quality improvement.

## 26. Grounding Authority Audit

This audit uses the selected source metadata and existing synthetic corpus. It does not claim every generated claim is supported merely because a source was selected.

### Claim A: ログイン中ユーザー本人

Classification: `source-supported`

Support:

- document: `profile-api`
- section: `プロフィールAPI仕様 > Endpoint > プロフィール画像アップロード`
- rule: `POST /api/profile/image` updates the profile image for the logged-in user.

The Draft output's "ログイン中ユーザー" framing is supported by the selected `profile-api` endpoint source. No code correction was required for this claim.

### Claim B: 画像実体検証

Classification: `source-supported` for validation failure handling.

Support:

- document: `error-message-guideline`
- section: `エラーメッセージガイドライン > プロフィール画像アップロード > Validation error`
- rule: when image content validation fails, show a user-facing message asking the user to check the image file and select it again.

The selected `error-message-guideline` source supports image content validation failure messaging. The selected `profile-image-spec` acceptance chunk supports 5MB / JPG / PNG / latest URL behavior.

Limitation:

`media-upload-security` was not selected, so extension-only validation, MIME validation, metadata handling, and malware / virus scan considerations are not source-grounded by the selected context in this smoke run. Those remain a candidate-source-absent or unselected-source limitation, not proof that all security-related rules were grounded.

## 27. Corrected Local Real Smoke Rerun

After the `llmStepCount` instrumentation correction, the local real smoke command was rerun from normal local PowerShell:

```bash
npm run agent:smoke
```

Run summary:

| Field | Value |
|---|---:|
| status | `completed` |
| finalState | `completed` |
| terminationReason | `review_passed` |
| revisionCount | 0 |
| reviewCount | 1 |
| totalAgentLatencyMs | 13946 |
| llmStepCount | 2 |
| toolInvocationCount | 1 |

Step sequence:

```text
planning
knowledge_retrieval
draft_generation
review
finalization
```

Planner:

| Field | Value |
|---|---|
| provider | `openai` |
| modelName | `gpt-5.4-mini` |
| promptVersion | `agent-poc-planner-v1` |
| providerBacked | `true` |
| providerLatencyMs | `3746` |
| inputTokens | `286` |
| outputTokens | `302` |
| totalTokens | `588` |

Knowledge retrieval:

| Field | Value |
|---|---:|
| retrievalLatencyMs | 2022 |
| contextPolicy | `document-diversity-v1` |
| candidateTopK | 10 |
| candidateChunkCount | 10 |
| candidateUniqueDocumentCount | 5 |
| requestedFinalTopK | 5 |
| selectedChunkCount | 5 |
| uniqueDocumentCount | 5 |
| maximumChunksFromSameDocument | 1 |

Retrieval embedding usage remains separate from Agent LLM usage:

| Metric | Value |
|---|---:|
| promptTokens | 72 |
| totalTokens | 72 |

Selected documents:

- `profile-image-spec`
- `error-message-guideline`
- `profile-api`
- `storage-lifecycle`
- `frontend-cache-guideline`

Draft:

| Field | Value |
|---|---|
| provider | `openai` |
| modelName | `gpt-5.4-mini` |
| promptVersion | `agent-poc-draft-v1` |
| providerBacked | `true` |
| providerLatencyMs | `8169` |
| inputTokens | `1403` |
| outputTokens | `1150` |
| totalTokens | `2553` |

Review:

| Field | Value |
|---|---|
| implementation | stub Reviewer |
| reviewDecision | `pass` |
| provider metadata | none |

Provider-reported Agent LLM usage aggregate for this smoke:

| Metric | Value |
|---|---:|
| inputTokens | 1689 |
| outputTokens | 1452 |
| totalTokens | 3141 |

Embedding usage is not merged into the Agent LLM total token usage. This is one local smoke run in the current environment; latency and token values should not be generalized to all Agent workloads. The `llmStepCount` change is an instrumentation correction, not a quality improvement.
