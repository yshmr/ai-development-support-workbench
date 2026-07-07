import {
  type AgentGenerator,
  type AgentPlanner,
  type AgentReviewer,
  createAgentExecutorResult
} from "./orchestrator";
import { generateAgentDraft, generateAgentPlan } from "./provider";
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
    revise({ currentOutput }) {
      return currentOutput;
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
