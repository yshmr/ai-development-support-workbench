# AI Agent PoC Evaluation Design v0.1

## 1. Evaluation Objective

AI Agent PoCの評価目的は、bounded Agent workflowが、既存single-pass grounded generationと比較して、tested workloadにおけるfinal output quality、cross-field consistency、requirement-to-task traceabilityを改善するかを確認することである。

Agent workflowは複数structured LLM callを行うため、latencyとtoken usageの増加が予想される。評価questionは以下である。

```text
tested workloadにおいて、測定されたquality、consistency、requirement traceabilityのgainがadditional execution costを正当化するか。
```

Agent workflowが品質を改善すると事前に仮定しない。

## 2. Comparison Definition

Main comparison:

```text
single-pass grounded generation
vs
bounded Agent workflow
```

Agent OFF:

```text
Requirement memo
  -> existing RAG retrieval
  -> single structured generation
  -> GenerationOutput
```

Agent ON:

```text
Requirement memo
  -> Requirement Analysis
  -> Knowledge Retrieval Tool
  -> Draft Generation
  -> Structured Review
  -> Deterministic Revision Decision
  -> optional one Revision
  -> Final Review
  -> GenerationOutput
```

Agent ON内部でrevisionが発生したrunについては、paired comparisonを行う。

```text
first draft
vs
final output
```

## 3. Comparison Validity Constraints

Formal comparisonでは、適用可能な範囲で以下を揃える。

- same requirement memo
- same provider
- same model
- same synthetic corpus
- same chunk strategy
- same embedding model
- same context policy
- same candidateTopK
- same finalTopK
- same `GenerationOutput` schema

Agent OFF / ONともretrieval queryはoriginal requirement memoを使用する。

Plannerは `knowledgeNeeds` を識別してよいが、Phase 1評価ではretrieval query rewrite、query decomposition、multiple query generationに使用しない。

この比較はsystem-level workflow comparisonであり、strict single-variable causal ablationではない。そのような主張はしない。

## 4. Agent OFF Conditions

Agent OFF conditions:

- generation mode: single-pass
- `ragMode = on`
- `ragContextPolicy = document-diversity-v1`
- chunk strategy: `heading-aware-v1`
- embedding model: `text-embedding-3-small`
- candidateTopK = 10
- requestedFinalTopK = 5
- maxChunksPerDocument = 2
- promptVersion: current grounded generation prompt version, currently `llm-app-poc-rag-v1`
- final output schema: existing `GenerationOutput`

Agent OFF uses the existing `/api/generate` grounded generation behavior.

## 5. Agent ON Conditions

Agent ON conditions:

- generation mode: Agent workflow
- same provider / model as Agent OFF
- same original requirement memo
- same RAG corpus
- same `heading-aware-v1`
- same `document-diversity-v1`
- same candidateTopK / finalTopK / maxChunksPerDocument
- same `GenerationOutput` schema
- `maxRevisionCount = 1`
- retrieval query = original requirement memo

Agent ON records:

- `AgentPlan`
- retrieval metadata
- first draft
- review history
- revision decision
- optional revised output
- final review
- execution trace
- final `GenerationOutput`

## 6. Common 5-Axis Quality Rubric

RAG Phase 1-D / 1-Eとのcontinuityを保つため、final outputには既存common 5-axisを使用する。

Each axis is scored 1 to 5.

### 1. Product-specific rule coverage

Synthetic corpusに存在するproduct-specific ruleが、一般論ではなく正しく反映されているか。

Examples:

- 5MB
- JPG / PNG
- `POST /api/profile/image`
- `multipart/form-data`
- `profileImageUrl`
- user-facing validation message

### 2. Unsupported assumption control

inputやretrieved sourceにない条件を、断定的な必須仕様として追加していないか。

Unsupported mandatory examples:

- WebP必須
- strict SLA
- specific cloud vendor mandatory
- virus scan mandatory
- drag and drop mandatory

### 3. Acceptance criteria specificity

acceptance criteriaが検証可能か。

Good examples:

- file size and format validation is testable
- success response updates displayed profile image URL
- invalid file shows specific user-facing message

### 4. Jira decomposition appropriateness

`jiraTasks`がfrontend、backend、test、documentationの作業単位へ妥当に分解されているか。

### 5. JSON structure stability

existing `GenerationOutput` schemaを満たしているか。Schema validation failureは重大な失敗として扱う。

## 7. Cross-Field Consistency Rubric

Additional Agent outcome axis.

Score 1 to 5.

Evaluate consistency across:

- `summary`
- `spec`
- `acceptanceCriteria`
- `jiraTasks`
- `implementationPlan`
- `reviewPoints`
- `risks`

Check examples:

- `spec` and `jiraTasks` use the same API endpoint name.
- `spec` and `acceptanceCriteria` use the same file size rule.
- mandatory requirement in `summary` appears in implementation or task decomposition.
- risk item does not contradict accepted spec.
- implementation plan does not require technology that is absent from spec and source.

This axis is applied to both Agent OFF and Agent ON final output.

## 8. Requirement-To-Task Traceability Rubric

Additional Agent outcome axis.

Score 1 to 5.

Evaluate whether important explicit requirements are not merely mentioned in prose but are reflected in actionable acceptance criteria or Jira work.

Examples:

- "画像は5MBまで" appears in validation acceptance criteria and backend/test task.
- "jpg/png対応" appears in spec and test task.
- "即時反映" appears in frontend task and acceptance criteria.
- "失敗時にはエラーメッセージ" appears in acceptance criteria and review/test task.

Ambiguous input detail should be placed in `risks` or confirmation items, not invented as mandatory work.

## 9. Agent-Specific Metrics

Operational metrics:

- `workflowCompletionRate`
- `firstReviewPassRate`
- `revisionInvocationRate`
- `revisionLimitReachedRate`
- `majorBlockerFindingResolutionRate`
- `invalidTransitionCount`
- `averageLlmStepCount`
- `knowledgeToolInvocationCount`
- `traceCompletenessRate`

Definitions:

| Metric | Definition |
|---|---|
| `workflowCompletionRate` | completed or completed_with_findings runs / all Agent ON runs |
| `firstReviewPassRate` | first review pass runs / Agent ON runs that reached first review |
| `revisionInvocationRate` | runs with one revision / Agent ON runs that reached decision |
| `revisionLimitReachedRate` | completed_with_findings due to revision_limit_reached / Agent ON runs |
| `majorBlockerFindingResolutionRate` | first-review blocker/major findings no longer present after revision / first-review blocker/major findings |
| `invalidTransitionCount` | rejected invalid transitions |
| `averageLlmStepCount` | average count of planning, draft, review, revision, second review LLM steps |
| `knowledgeToolInvocationCount` | count of `knowledge.retrieve` invocations |
| `traceCompletenessRate` | runs with required step traces / all Agent ON runs |

Reviewer findings are part of workflow behavior and may be used for revision invocation and finding resolution analysis. They must not be used as independent final quality ground truth.

## 10. Draft Vs Final Paired Analysis

For runs where revision occurs:

- `draftToFinalQualityDelta`
- `finalQualityRegressionRate`

`draftToFinalQualityDelta` compares manual final quality axes between first draft and final output.

`finalQualityRegressionRate` counts runs where final output is worse than first draft on one or more key axes.

The paired comparison helps determine whether revision improves output or introduces regression.

## 11. Evaluation Dataset Schema

Phase 1-A does not create actual JSON dataset unless a later implementation phase needs it. The schema is designed here for later use.

```ts
type AgentEvaluationCase = {
  caseId: string;
  requirementMemo: string;
  expectedRelevantDocumentIds: string[];
  importantExpectedRules: string[];
  unsupportedAssumptionsToAvoid: string[];
  crossFieldConsistencyChecks: string[];
  notes: string;
};
```

Use only the existing synthetic RAG corpus under `data/rag/knowledge`.

Do not use real company internal specifications.

## 12. Proposed Seed Cases

### AGENT-001: Profile image basic multi-document requirement

Requirement memo:

```text
ユーザーがプロフィール画像を変更できるようにしたい。
画像は5MBまで、jpg/png対応。
変更後は即時反映したい。
失敗時にはエラーメッセージを表示したい。
```

Expected relevant documents:

- `profile-image-spec`
- `profile-api`
- `error-message-guideline`
- `frontend-cache-guideline`
- `storage-lifecycle`

Important expected rules:

- 5MB
- JPG / PNG
- latest profile image URL
- no full page reload
- actionable validation message
- save new image before switching profile reference

Unsupported assumptions to avoid:

- WebP mandatory
- virus scan mandatory
- strict real-time multi-device sync

### AGENT-002: Profile image validation / invalid upload behavior

Requirement memo:

```text
プロフィール画像アップロードで、壊れた画像や形式違いを分かりやすく拒否したい。
ユーザーには修正方法が分かるエラーを出したい。
```

Expected relevant documents:

- `profile-image-spec`
- `profile-api`
- `media-upload-security`
- `error-message-guideline`

Important expected rules:

- `unsupported_format`
- `invalid_image_content`
- server-side actual image validation
- do not expose internal exception details

Unsupported assumptions to avoid:

- malware scan mandatory
- specific image library mandatory

### AGENT-003: Profile image replacement lifecycle / cleanup concern

Requirement memo:

```text
プロフィール画像を置き換えるとき、保存失敗や参照先更新失敗で中途半端な状態にしたくない。
古い画像や一時ファイルの扱いも整理したい。
```

Expected relevant documents:

- `storage-lifecycle`
- `profile-api`
- `error-message-guideline`

Important expected rules:

- save new object before switching profile reference
- cleanup temporary object on failure
- old image cleanup policy needs decision
- rollback consideration

Unsupported assumptions to avoid:

- immediate permanent deletion mandatory
- specific object storage vendor mandatory

### AGENT-004: Disable email notification requirement

Requirement memo:

```text
ユーザーがメール通知を無効にできるようにしたい。
ただし重要なセキュリティ通知は止めないようにしたい。
```

Expected relevant documents:

- `notification-settings-spec`

Important expected rules:

- product update, weekly summary, campaign mails stop when disabled
- security notifications, password change notifications, important terms changes remain mandatory
- queued mail may not be stopped

Unsupported assumptions to avoid:

- all email is stopped
- profile image documents are relevant

### AGENT-005: Search status filter requirement

Requirement memo:

```text
検索結果をステータスで絞り込めるようにしたい。
複数ステータス選択とURL共有も考慮したい。
```

Expected relevant documents:

- `search-filter-spec`

Important expected rules:

- supported statuses: `open`, `in_progress`, `resolved`, `archived`
- multiple statuses can be selected
- URL query parameter `status`
- comma separated values for multiple statuses
- empty state when result count is zero

Unsupported assumptions to avoid:

- profile image upload endpoint
- email notification rules

### AGENT-006: Ambiguous product requirement

Requirement memo:

```text
プロフィール周りの画像更新をもっと安全で使いやすくしたい。
どこまで対応するべきか整理したい。
```

Expected relevant documents:

- `profile-image-spec`
- `profile-api`
- `media-upload-security`
- `frontend-cache-guideline`
- `error-message-guideline`
- `storage-lifecycle`

Important expected rules:

- known profile image constraints should be surfaced
- ambiguous scope should be placed in risks / confirmation items
- security and lifecycle items should be framed as decisions if not explicit

Unsupported assumptions to avoid:

- mandatory virus scan without confirmation
- mandatory real-time multi-device sync
- mandatory cloud vendor
- invented SLA

## 13. Retrieval / Source Analysis

For each run, record:

- candidate documents
- selected documents
- source composition
- `candidateUniqueDocumentCount`
- `uniqueDocumentCount`
- `maximumChunksFromSameDocument`
- retrieved source appropriateness

Maintain distinction between:

- candidate source absent
- selected context / context composition issue
- source selected but rule ignored in generation
- source selected and rule correctly generated

Selected source does not guarantee every source rule is reflected in final output.

Do not claim claim-level citation exists. Existing RAG sources are source metadata for grounded context, not claim-level proof.

## 14. Latency Measurement

Measure:

- total end-to-end latency
- retrieval latency
- total LLM provider latency
- Agent step latency
- planning latency
- knowledge retrieval latency
- draft generation latency
- review latency
- revision latency
- finalization latency

`totalAgentLatencyMs` is measured from Agent orchestration start to final Agent result construction.

Per-step `latencyMs` is workflow step duration. If provider call duration is separately available, record it separately and do not redefine existing `providerLatencyMs`.

Past latency metrics must not be silently redefined.

## 15. Token Usage Measurement

Generation LLM usage:

- record provider-reported usage per LLM step
- aggregate inputTokens / outputTokens / totalTokens when provider reports them
- do not estimate unavailable tokens

LLM steps:

- planning
- draft generation
- review
- revision
- second review

Retrieval embedding usage:

- record separately
- do not merge embedding tokens into generation LLM usage total

Agent OFF / ON comparison should include:

- input tokens
- output tokens
- total tokens
- embedding tokens separately
- LLM step count
- tool invocation count

Provider-specific token definitions may differ. Do not assume totalTokens are directly comparable across providers unless the provider semantics are documented.

## 16. Failure-Domain Analysis

Minimum failure domains:

1. input / request validation
2. Planner output / `AgentPlan` schema
3. Knowledge Retrieval Tool invocation
4. candidate source absent
5. context selection / source composition
6. draft `GenerationOutput` schema
7. Reviewer output / `AgentReview` schema
8. deterministic revision decision
9. revision `GenerationOutput` schema
10. revision limit reached
11. invalid state transition
12. trace persistence
13. provider failure
14. final result construction

Maintain RAG distinction:

- candidate source absent
- selected context / context composition issue

If Generator misses a product rule, first check whether the corresponding source was available to the Agent. Do not immediately classify it as Generator failure.

Also distinguish:

- source selected
- rule actually reflected in output

## 17. Result Interpretation Rules

Use manual documented rubric for final output quality.

Reviewer self-assessment is not independent quality ground truth because Reviewer is part of the evaluated workflow.

Reviewer findings may be used for:

- revision invocation behavior
- finding resolution
- workflow trace completeness

Formal result should report:

- Agent OFF final quality
- Agent ON final quality
- Agent ON first draft quality if revision occurred
- latency overhead
- token overhead
- workflow completion behavior
- failure domains

Do not treat one run as conclusive.

If a later evaluation uses three runs, explicitly state that the result is limited to:

- tested workload
- current local environment
- selected provider/model
- selected corpus
- selected prompt/schema
- current network/API-side conditions

## 18. Claims That Must Not Be Made

Do not claim:

- Agent workflow is generally superior to single-pass generation.
- A provider company or model family is generally better.
- The result is a strict single-variable causal ablation.
- Reviewer model output is independent evaluation truth.
- selected source guarantees all source rules are generated.
- source metadata is claim-level citation.
- query optimization effect is included in Phase 1 Agent comparison.
- RAG was redesigned for Agent Phase 1.
- latency/token overhead is acceptable before measurement.

## 19. Evaluation Limitations

Expected limitations:

- small synthetic corpus
- limited scenario count
- one or few provider/model settings
- `maxRevisionCount = 1`
- retrieval query is intentionally not rewritten
- no MMR / reranker / hybrid retrieval
- no multi-agent debate
- manual rubric remains necessary
- real production correctness is not measured

## 20. Phase 1-E Expected Result Template

```markdown
# Agent PoC Phase 1-E Evaluation Results

## Conditions

| Item | Agent OFF | Agent ON |
|---|---|---|
| provider/model | | |
| promptVersion | | |
| corpus | synthetic 8-document corpus | synthetic 8-document corpus |
| chunk strategy | heading-aware-v1 | heading-aware-v1 |
| context policy | document-diversity-v1 | document-diversity-v1 |
| retrieval query | original requirement memo | original requirement memo |
| GenerationOutput schema | existing | existing |

## Run Summary

| caseId | mode | runId | status | revisionCount | reviewCount | terminationReason |
|---|---|---|---:|---:|---:|---|

## Final Output Quality

| Axis | Agent OFF avg | Agent ON avg | Observation |
|---|---:|---:|---|
| Product-specific rule coverage | | | |
| Unsupported assumption control | | | |
| Acceptance criteria specificity | | | |
| Jira decomposition appropriateness | | | |
| JSON structure stability | | | |
| Cross-field consistency | | | |
| Requirement-to-task traceability | | | |

## Draft Vs Final

| caseId | draft score | final score | delta | regression? | Notes |
|---|---:|---:|---:|---|---|

## Agent Workflow Metrics

| Metric | Value |
|---|---:|
| workflowCompletionRate | |
| firstReviewPassRate | |
| revisionInvocationRate | |
| revisionLimitReachedRate | |
| majorBlockerFindingResolutionRate | |
| invalidTransitionCount | |
| averageLlmStepCount | |
| knowledgeToolInvocationCount | |
| traceCompletenessRate | |

## Latency And Usage

| Metric | Agent OFF median | Agent ON median |
|---|---:|---:|
| total end-to-end latency | | |
| retrieval latency | | |
| total LLM provider latency | | |
| input tokens | | |
| output tokens | | |
| total tokens | | |
| embedding tokens | | |
| LLM step count | | |
| tool invocation count | | |

## Failure Domains

| Domain | Observed? | Notes |
|---|---|---|

## Conclusion

State whether Agent workflow quality / consistency / traceability gains justify measured overhead for this tested workload only.
```
