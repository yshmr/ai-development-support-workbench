import type { AgentWorkflowDependencies } from "./orchestrator";
import {
  createRealAgentDraftGenerator,
  createRealAgentPlanner,
  createRealAgentReviewer
} from "./executors";
import { createRagKnowledgeRetrievalTool } from "./knowledge";

export function createRealAgentWorkflowDependencies(): AgentWorkflowDependencies {
  return {
    planner: createRealAgentPlanner(),
    knowledgeTool: createRagKnowledgeRetrievalTool(),
    generator: createRealAgentDraftGenerator(),
    reviewer: createRealAgentReviewer()
  };
}
