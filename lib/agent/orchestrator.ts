import { randomUUID } from "node:crypto";
import {
  type AgentPlan,
  type AgentRetrievalArtifact,
  type AgentReview,
  type AgentReviewHistoryEntry,
  type AgentRunRecord,
  type AgentRunMetadata,
  type AgentRunResult,
  type AgentSafeSource,
  type AgentStepName,
  type AgentStepTrace,
  type KnowledgeRetrievalToolResult,
  type RevisionDecision,
  agentPlanSchema,
  agentReviewSchema,
  generationOutputSchema,
  knowledgeRetrievalToolResultSchema,
  type GenerationOutput
} from "./schema";
import { decideRevision, getRevisionRequiredFindings } from "./decision";
import {
  type AgentStateName,
  transitionAgentState
} from "./state";

export const agentVersion = "agent-poc-runtime-v1";
export const maxRevisionCount = 1;
const maxReviewCount = maxRevisionCount + 1;

type MaybePromise<T> = T | Promise<T>;

export type AgentExecutorStepMetadata = Pick<
  AgentStepTrace,
  | "provider"
  | "modelName"
  | "promptVersion"
  | "providerBacked"
  | "providerLatencyMs"
  | "inputTokens"
  | "outputTokens"
  | "totalTokens"
>;

export type AgentExecutorResult<T> = {
  __agentExecutorResult: true;
  data: T;
  metadata?: AgentExecutorStepMetadata;
};

export type AgentPlanner = {
  plan(input: { requirementMemo: string }): MaybePromise<unknown>;
};

export type KnowledgeRetrievalTool = {
  toolName: "knowledge.retrieve";
  invoke(input: { query: string }): MaybePromise<unknown>;
};

export type AgentGenerator = {
  draft(input: {
    requirementMemo: string;
    plan: AgentPlan;
    knowledge: KnowledgeRetrievalToolResult;
  }): MaybePromise<unknown>;
  revise(input: {
    requirementMemo: string;
    plan: AgentPlan;
    knowledge: KnowledgeRetrievalToolResult;
    currentOutput: GenerationOutput;
    findings: AgentReview["findings"];
  }): MaybePromise<unknown>;
};

export type AgentReviewer = {
  review(input: {
    requirementMemo: string;
    plan: AgentPlan;
    knowledge: KnowledgeRetrievalToolResult;
    output: GenerationOutput;
  }): MaybePromise<unknown>;
};

export type AgentWorkflowDependencies = {
  planner: AgentPlanner;
  knowledgeTool: KnowledgeRetrievalTool;
  generator: AgentGenerator;
  reviewer: AgentReviewer;
};

export type AgentRunStore = {
  saveRun(record: AgentRunRecord): MaybePromise<AgentRunRecord>;
};

export type RunAgentWorkflowInput = {
  requirementMemo: string;
  dependencies: AgentWorkflowDependencies;
  runStore?: AgentRunStore;
};

class AgentWorkflowRuntimeError extends Error {
  constructor(message: string, readonly stepName?: AgentStepName) {
    super(message);
    this.name = "AgentWorkflowRuntimeError";
  }
}

function getTimerNow(): number {
  try {
    return globalThis.performance?.now?.() ?? Date.now();
  } catch {
    return Date.now();
  }
}

function toNonNegativeDurationMs(startMs: number, endMs = getTimerNow()): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return 0;
  }

  return Math.max(0, Math.round(endMs - startMs));
}

function toIsoString(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

function isAgentExecutorResult<T>(
  value: T | AgentExecutorResult<T>
): value is AgentExecutorResult<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "__agentExecutorResult" in value &&
    (value as { __agentExecutorResult?: unknown }).__agentExecutorResult === true
  );
}

export function createAgentExecutorResult<T>(
  data: T,
  metadata?: AgentExecutorStepMetadata
): AgentExecutorResult<T> {
  return {
    __agentExecutorResult: true,
    data,
    metadata
  };
}

function isUsableKnowledge(result: KnowledgeRetrievalToolResult): boolean {
  return result.groundedContext.trim().length > 0 && result.sources.length > 0;
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function sanitizeSource(source: KnowledgeRetrievalToolResult["sources"][number]): AgentSafeSource {
  return {
    sourceId: source.sourceId,
    rank: typeof source.rank === "number" ? source.rank : undefined,
    contextRank:
      typeof source.contextRank === "number" ? source.contextRank : undefined,
    retrievalRank:
      typeof source.retrievalRank === "number" ? source.retrievalRank : undefined,
    score: typeof source.score === "number" ? source.score : undefined,
    chunkId: typeof source.chunkId === "string" ? source.chunkId : undefined,
    documentId:
      typeof source.documentId === "string" ? source.documentId : undefined,
    documentTitle:
      typeof source.documentTitle === "string" ? source.documentTitle : undefined,
    headingPath: Array.isArray(source.headingPath)
      ? source.headingPath.filter(
          (heading): heading is string => typeof heading === "string"
        )
      : undefined,
    sourcePath:
      typeof source.sourcePath === "string" ? source.sourcePath : undefined
  };
}

function createRetrievalArtifact(
  knowledge: KnowledgeRetrievalToolResult | undefined
): AgentRetrievalArtifact | undefined {
  if (!knowledge) {
    return undefined;
  }

  return {
    retrievalMetadata: knowledge.retrievalMetadata,
    embeddingUsage: knowledge.embeddingUsage,
    sources: knowledge.sources.map(sanitizeSource)
  };
}

function validateReviewSourceIds(
  review: AgentReview,
  knowledge: KnowledgeRetrievalToolResult | undefined
) {
  const validSourceIds = new Set(
    knowledge?.sources.map((source) => source.sourceId) ?? []
  );
  const unknownSourceId = review.findings
    .flatMap((finding) => finding.sourceIds)
    .find((sourceId) => !validSourceIds.has(sourceId));

  if (unknownSourceId) {
    throw new AgentWorkflowRuntimeError(
      `AgentReview referenced unknown sourceId: ${unknownSourceId}`,
      "review"
    );
  }
}

function createMetadata(input: {
  status: AgentRunMetadata["status"];
  finalState: AgentStateName;
  revisionCount: number;
  reviewCount: number;
  terminationReason: AgentRunMetadata["terminationReason"];
  totalAgentLatencyMs: number;
  llmStepCount: number;
  toolInvocationCount: number;
  steps: AgentStepTrace[];
}): AgentRunMetadata {
  return {
    agentVersion,
    status: input.status,
    finalState: input.finalState,
    maxRevisionCount,
    revisionCount: input.revisionCount,
    reviewCount: input.reviewCount,
    terminationReason: input.terminationReason,
    totalAgentLatencyMs: input.totalAgentLatencyMs,
    llmStepCount: input.llmStepCount,
    toolInvocationCount: input.toolInvocationCount,
    steps: input.steps
  };
}

export async function runAgentWorkflow({
  requirementMemo,
  dependencies,
  runStore
}: RunAgentWorkflowInput): Promise<AgentRunResult> {
  const runId = randomUUID();
  const createdAt = new Date().toISOString();
  const runStartedAtMs = getTimerNow();
  const steps: AgentStepTrace[] = [];
  const reviews: AgentReview[] = [];
  const reviewHistory: AgentReviewHistoryEntry[] = [];
  let state: AgentStateName = "initialized";
  let revisionCount = 0;
  let reviewCount = 0;
  let llmStepCount = 0;
  let toolInvocationCount = 0;
  let plan: AgentPlan | undefined;
  let knowledge: KnowledgeRetrievalToolResult | undefined;
  let initialDraft: GenerationOutput | undefined;
  let revisedOutput: GenerationOutput | undefined;
  let currentOutput: GenerationOutput | undefined;
  let activeStepName: AgentStepName | undefined;

  const transitionTo = (nextState: AgentStateName) => {
    state = transitionAgentState(state, nextState);
  };

  const applyStepMetadata = (
    trace: AgentStepTrace,
    metadata?: AgentExecutorStepMetadata
  ) => {
    if (!metadata) {
      return;
    }

    if (metadata.provider !== undefined) {
      trace.provider = metadata.provider;
    }

    if (metadata.modelName !== undefined) {
      trace.modelName = metadata.modelName;
    }

    if (metadata.promptVersion !== undefined) {
      trace.promptVersion = metadata.promptVersion;
    }

    if (metadata.providerBacked !== undefined) {
      trace.providerBacked = metadata.providerBacked;
    }

    if (metadata.providerLatencyMs !== undefined) {
      trace.providerLatencyMs = metadata.providerLatencyMs;
    }

    if (metadata.inputTokens !== undefined) {
      trace.inputTokens = metadata.inputTokens;
    }

    if (metadata.outputTokens !== undefined) {
      trace.outputTokens = metadata.outputTokens;
    }

    if (metadata.totalTokens !== undefined) {
      trace.totalTokens = metadata.totalTokens;
    }
  };

  const runStep = async <T>(
    stepName: AgentStepName,
    operation: () => MaybePromise<unknown | AgentExecutorResult<unknown>>,
    parseResult: (value: unknown) => T
  ): Promise<T> => {
    const startedAtMs = getTimerNow();
    const trace: AgentStepTrace = {
      stepId: randomUUID(),
      stepName,
      sequence: steps.length + 1,
      startedAt: toIsoString(startedAtMs),
      completedAt: toIsoString(startedAtMs),
      latencyMs: 0,
      status: "completed"
    };

    activeStepName = stepName;

    try {
      const rawResult = await operation();
      const result = isAgentExecutorResult(rawResult)
        ? rawResult.data
        : rawResult;
      applyStepMetadata(
        trace,
        isAgentExecutorResult(rawResult) ? rawResult.metadata : undefined
      );
      const parsedResult = parseResult(result);
      const completedAtMs = getTimerNow();
      trace.completedAt = toIsoString(completedAtMs);
      trace.latencyMs = toNonNegativeDurationMs(startedAtMs, completedAtMs);
      steps.push(trace);

      if (trace.providerBacked === true) {
        llmStepCount += 1;
      }

      activeStepName = undefined;
      return parsedResult;
    } catch (error) {
      const completedAtMs = getTimerNow();
      trace.completedAt = toIsoString(completedAtMs);
      trace.latencyMs = toNonNegativeDurationMs(startedAtMs, completedAtMs);
      trace.status = "failed";
      steps.push(trace);

      if (trace.providerBacked === true) {
        llmStepCount += 1;
      }

      activeStepName = stepName;
      throw error;
    }
  };

  const finalize = async (
    finalStatus: "completed" | "completed_with_findings",
    terminationReason: "review_passed" | "revision_limit_reached"
  ): Promise<AgentRunResult> => {
    transitionTo("finalizing");
    await runStep("finalization", () => undefined, () => undefined);
    const metadata = createMetadata({
      status: finalStatus,
      finalState: finalStatus,
      revisionCount,
      reviewCount,
      terminationReason,
      totalAgentLatencyMs: toNonNegativeDurationMs(runStartedAtMs),
      llmStepCount,
      toolInvocationCount,
      steps
    });
    const result: AgentRunResult = {
      runId,
      createdAt,
      output: currentOutput,
      initialDraft,
      revisedOutput,
      plan,
      knowledge,
      reviews,
      reviewHistory,
      metadata
    };

    if (runStore) {
      await runStore.saveRun(createRunRecord(result));
    }

    transitionTo(finalStatus);
    result.metadata.finalState = state;
    return result;
  };

  const createRunRecord = (result: AgentRunResult): AgentRunRecord => {
    const providerStep = result.metadata.steps.find(
      (step) => step.providerBacked === true
    );

    return {
      runId,
      createdAt,
      updatedAt: new Date().toISOString(),
      inputText: requirementMemo,
      provider: providerStep?.provider,
      modelName: providerStep?.modelName,
      metadata: result.metadata,
      plan: result.plan,
      retrieval: createRetrievalArtifact(result.knowledge),
      initialDraft: result.initialDraft,
      revisedOutput: result.revisedOutput,
      finalOutput: result.output,
      reviewHistory: result.reviewHistory,
      error: result.error
    };
  };

  const failClosed = async (error: unknown): Promise<AgentRunResult> => {
    if (state !== "failed") {
      transitionTo("failed");
    }

    const result: AgentRunResult = {
      runId,
      createdAt,
      output: currentOutput,
      initialDraft,
      revisedOutput,
      plan,
      knowledge,
      reviews,
      reviewHistory,
      metadata: createMetadata({
        status: "failed",
        finalState: state,
        revisionCount,
        reviewCount,
        terminationReason: "technical_failure",
        totalAgentLatencyMs: toNonNegativeDurationMs(runStartedAtMs),
        llmStepCount,
        toolInvocationCount,
        steps
      }),
      error: {
        message: sanitizeError(error),
        stepName: activeStepName
      }
    };

    if (runStore) {
      try {
        await runStore.saveRun(createRunRecord(result));
      } catch {
        // The workflow is already failed. Avoid logging sensitive fallback data.
      }
    }

    return result;
  };

  try {
    transitionTo("planning");
    plan = await runStep(
      "planning",
      async () => dependencies.planner.plan({ requirementMemo }),
      (value) => agentPlanSchema.parse(value)
    );

    transitionTo("retrieving");
    knowledge = await runStep(
      "knowledge_retrieval",
      async () => {
        toolInvocationCount += 1;
        return dependencies.knowledgeTool.invoke({ query: requirementMemo });
      },
      (value) => {
        const parsedKnowledge = knowledgeRetrievalToolResultSchema.parse(value);

        if (!isUsableKnowledge(parsedKnowledge)) {
          throw new AgentWorkflowRuntimeError(
            "Knowledge Retrieval Tool returned zero usable knowledge.",
            "knowledge_retrieval"
          );
        }

        return parsedKnowledge;
      }
    );

    transitionTo("drafting");
    currentOutput = await runStep(
      "draft_generation",
      async () =>
        dependencies.generator.draft({
          requirementMemo,
          plan: plan!,
          knowledge: knowledge!
        }),
      (value) => generationOutputSchema.parse(value)
    );
    initialDraft = currentOutput;

    while (reviewCount < maxReviewCount) {
      transitionTo("reviewing");
      reviewCount += 1;
      const review = await runStep(
        "review",
        async () =>
          dependencies.reviewer.review({
            requirementMemo,
            plan: plan!,
            knowledge: knowledge!,
            output: currentOutput!
          }),
        (value) => {
          const parsedReview = agentReviewSchema.parse(value);
          validateReviewSourceIds(parsedReview, knowledge);
          return parsedReview;
        }
      );
      reviews.push(review);

      transitionTo("deciding");
      const decision = decideRevision(review);
      steps[steps.length - 1].reviewDecision = decision;
      reviewHistory.push({
        reviewNumber: reviewCount,
        stage: revisionCount === 0 ? "draft" : "revision",
        review,
        decision
      });

      if (decision === "pass") {
        return await finalize("completed", "review_passed");
      }

      if (revisionCount >= maxRevisionCount) {
        return await finalize(
          "completed_with_findings",
          "revision_limit_reached"
        );
      }

      transitionTo("revising");
      revisionCount += 1;
      currentOutput = await runStep(
        "revision",
        async () =>
          dependencies.generator.revise({
            requirementMemo,
            plan: plan!,
            knowledge: knowledge!,
            currentOutput: currentOutput!,
            findings: getRevisionRequiredFindings(review)
        }),
        (value) => generationOutputSchema.parse(value)
      );
      revisedOutput = currentOutput;
    }

    throw new AgentWorkflowRuntimeError(
      "Agent review bound was exceeded.",
      "review"
    );
  } catch (error) {
    return failClosed(error);
  }
}

export function createStaticPlanner(plan: unknown): AgentPlanner {
  return {
    plan: () => plan
  };
}

export function createStaticKnowledgeRetrievalTool(
  result: unknown
): KnowledgeRetrievalTool {
  return {
    toolName: "knowledge.retrieve",
    invoke: () => result
  };
}

export function createStaticGenerator(input: {
  draft: unknown;
  revision?: unknown;
}): AgentGenerator {
  return {
    draft: () => input.draft,
    revise: () => input.revision ?? input.draft
  };
}

export function createSequenceReviewer(reviews: unknown[]): AgentReviewer {
  let index = 0;

  return {
    review: () => {
      const review = reviews[Math.min(index, reviews.length - 1)];
      index += 1;
      return review;
    }
  };
}
