import { z } from "zod";

export const agentStateNameSchema = z.enum([
  "initialized",
  "planning",
  "retrieving",
  "drafting",
  "reviewing",
  "deciding",
  "revising",
  "finalizing",
  "completed",
  "completed_with_findings",
  "failed"
]);

export const agentRunStatusSchema = z.enum([
  "running",
  "completed",
  "completed_with_findings",
  "failed"
]);

export type AgentStateName = z.infer<typeof agentStateNameSchema>;
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export const terminalAgentStates = new Set<AgentStateName>([
  "completed",
  "completed_with_findings",
  "failed"
]);

const allowedTransitions: Record<AgentStateName, AgentStateName[]> = {
  initialized: ["planning"],
  planning: ["retrieving", "failed"],
  retrieving: ["drafting", "failed"],
  drafting: ["reviewing", "failed"],
  reviewing: ["deciding", "failed"],
  deciding: ["finalizing", "revising", "failed"],
  revising: ["reviewing", "failed"],
  finalizing: ["completed", "completed_with_findings", "failed"],
  completed: [],
  completed_with_findings: [],
  failed: []
};

export class AgentStateTransitionError extends Error {
  constructor(from: AgentStateName, to: AgentStateName) {
    super(`Invalid Agent state transition: ${from} -> ${to}`);
    this.name = "AgentStateTransitionError";
  }
}

export function isTerminalAgentState(state: AgentStateName): boolean {
  return terminalAgentStates.has(state);
}

export function canTransitionAgentState(
  from: AgentStateName,
  to: AgentStateName
): boolean {
  return allowedTransitions[from].includes(to);
}

export function transitionAgentState(
  from: AgentStateName,
  to: AgentStateName
): AgentStateName {
  if (!canTransitionAgentState(from, to)) {
    throw new AgentStateTransitionError(from, to);
  }

  return to;
}

export function getAllowedAgentStateTransitions(
  state: AgentStateName
): readonly AgentStateName[] {
  return allowedTransitions[state];
}
