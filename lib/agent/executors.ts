import {
  type AgentGenerator,
  type AgentPlanner,
  type AgentReviewer,
  createAgentExecutorResult
} from "./orchestrator";
import {
  generateAgentDraft,
  generateAgentPlan,
  generateAgentReview,
  generateAgentRevision
} from "./provider";
import type { AgentReview } from "./schema";

export function createRealAgentPlanner(): AgentPlanner {
  return {
    async plan({ requirementMemo }) {
      const result = await generateAgentPlan(requirementMemo);
      return createAgentExecutorResult(result.data, result.metadata);
    }
  };
}

export function createRealAgentDraftGenerator(): AgentGenerator {
  return {
    async draft({ requirementMemo, plan, knowledge }) {
      const result = await generateAgentDraft({
        requirementMemo,
        plan,
        groundedContext: knowledge.groundedContext
      });
      return createAgentExecutorResult(result.data, result.metadata);
    },
    async revise({ requirementMemo, plan, knowledge, currentOutput, findings }) {
      const result = await generateAgentRevision({
        requirementMemo,
        plan,
        groundedContext: knowledge.groundedContext,
        currentOutput,
        findings
      });
      return createAgentExecutorResult(result.data, result.metadata);
    }
  };
}

export function createRealAgentReviewer(): AgentReviewer {
  return {
    async review({ requirementMemo, plan, knowledge, output }) {
      const result = await generateAgentReview({
        requirementMemo,
        plan,
        groundedContext: knowledge.groundedContext,
        sources: knowledge.sources,
        output
      });
      return createAgentExecutorResult(result.data, result.metadata);
    }
  };
}

export function createPassThroughStubReviewer(): AgentReviewer {
  const passReview: AgentReview = {
    summary: "Phase 1-C stub reviewer returned no findings.",
    findings: []
  };

  return {
    review: () => passReview
  };
}
