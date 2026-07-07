import type { AgentWorkflowDependencies } from "./orchestrator";
import {
  createPassThroughStubReviewer,
  createRealAgentDraftGenerator,
  createRealAgentPlanner
} from "./executors";
import { createRagKnowledgeRetrievalTool } from "./knowledge";

export function createRealAgentWorkflowDependencies(): AgentWorkflowDependencies {
  return {
    planner: createRealAgentPlanner(),
    knowledgeTool: createRagKnowledgeRetrievalTool(),
    generator: createRealAgentDraftGenerator(),
    reviewer: createPassThroughStubReviewer()
  };
}
