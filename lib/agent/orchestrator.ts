import { randomUUID } from "node:crypto";
import {
  type AgentPlan,
  type AgentReview,
  type AgentRunMetadata,
  type AgentRunResult,
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

export type RunAgentWorkflowInput = {
  requirementMemo: string;
  dependencies: AgentWorkflowDependencies;
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

function isLlmStep(stepName: AgentStepName): boolean {
  return (
    stepName === "planning" ||
    stepName === "draft_generation" ||
    stepName === "review" ||
    stepName === "revision"
  );
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
  dependencies
}: RunAgentWorkflowInput): Promise<AgentRunResult> {
  const runStartedAtMs = getTimerNow();
  const steps: AgentStepTrace[] = [];
  const reviews: AgentReview[] = [];
  let state: AgentStateName = "initialized";
  let revisionCount = 0;
  let reviewCount = 0;
  let llmStepCount = 0;
  let toolInvocationCount = 0;
  let plan: AgentPlan | undefined;
  let knowledge: KnowledgeRetrievalToolResult | undefined;
  let initialDraft: GenerationOutput | undefined;
  let currentOutput: GenerationOutput | undefined;
  let activeStepName: AgentStepName | undefined;

  const transitionTo = (nextState: AgentStateName) => {
    state = transitionAgentState(state, nextState);
  };

  const runStep = async <T>(
    stepName: AgentStepName,
    operation: () => MaybePromise<T>
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
      const result = await operation();
      const completedAtMs = getTimerNow();
      trace.completedAt = toIsoString(completedAtMs);
      trace.latencyMs = toNonNegativeDurationMs(startedAtMs, completedAtMs);
      steps.push(trace);

      if (isLlmStep(stepName)) {
        llmStepCount += 1;
      }

      activeStepName = undefined;
      return result;
    } catch (error) {
      const completedAtMs = getTimerNow();
      trace.completedAt = toIsoString(completedAtMs);
      trace.latencyMs = toNonNegativeDurationMs(startedAtMs, completedAtMs);
      trace.status = "failed";
      steps.push(trace);

      if (isLlmStep(stepName)) {
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
    await runStep("finalization", () => undefined);
    transitionTo(finalStatus);

    return {
      output: currentOutput,
      initialDraft,
      plan,
      reviews,
      metadata: createMetadata({
        status: finalStatus,
        finalState: state,
        revisionCount,
        reviewCount,
        terminationReason,
        totalAgentLatencyMs: toNonNegativeDurationMs(runStartedAtMs),
        llmStepCount,
        toolInvocationCount,
        steps
      })
    };
  };

  const failClosed = (error: unknown): AgentRunResult => {
    if (state !== "failed") {
      transitionTo("failed");
    }

    return {
      output: currentOutput,
      initialDraft,
      plan,
      reviews,
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
  };

  try {
    transitionTo("planning");
    plan = await runStep("planning", async () =>
      agentPlanSchema.parse(
        await dependencies.planner.plan({ requirementMemo })
      )
    );

    transitionTo("retrieving");
    knowledge = await runStep("knowledge_retrieval", async () => {
      toolInvocationCount += 1;
      const parsedKnowledge = knowledgeRetrievalToolResultSchema.parse(
        await dependencies.knowledgeTool.invoke({ query: requirementMemo })
      );

      if (!isUsableKnowledge(parsedKnowledge)) {
        throw new AgentWorkflowRuntimeError(
          "Knowledge Retrieval Tool returned zero usable knowledge.",
          "knowledge_retrieval"
        );
      }

      return parsedKnowledge;
    });

    transitionTo("drafting");
    currentOutput = await runStep("draft_generation", async () =>
      generationOutputSchema.parse(
        await dependencies.generator.draft({
          requirementMemo,
          plan: plan!,
          knowledge: knowledge!
        })
      )
    );
    initialDraft = currentOutput;

    while (reviewCount < maxReviewCount) {
      transitionTo("reviewing");
      reviewCount += 1;
      const review = await runStep("review", async () =>
        agentReviewSchema.parse(
          await dependencies.reviewer.review({
            requirementMemo,
            plan: plan!,
            knowledge: knowledge!,
            output: currentOutput!
          })
        )
      );
      reviews.push(review);

      transitionTo("deciding");
      const decision = decideRevision(review);
      steps[steps.length - 1].reviewDecision = decision;

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
      currentOutput = await runStep("revision", async () =>
        generationOutputSchema.parse(
          await dependencies.generator.revise({
            requirementMemo,
            plan: plan!,
            knowledge: knowledge!,
            currentOutput: currentOutput!,
            findings: getRevisionRequiredFindings(review)
          })
        )
      );
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
