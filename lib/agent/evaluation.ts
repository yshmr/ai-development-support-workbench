import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  generateFromRequirementMemo,
  getPromptVersion
} from "@/lib/generator";
import {
  type RagContextPolicy,
  type RagMetadata,
  generationOutputJsonSchema,
  generationOutputSchema,
  ragMetadataSchema,
  type GenerationOutput
} from "@/lib/schema";
import { buildGroundedContext } from "@/lib/rag/context";
import {
  getCandidateTopKForContextPolicy,
  selectRagContextChunks
} from "@/lib/rag/context-selection";
import { getGroundedGenerationRagConfig } from "@/lib/rag/config";
import * as ragRetriever from "@/lib/rag/retriever";
import { createRealAgentWorkflowDependencies } from "./runtime";
import {
  runAgentWorkflow,
  type AgentWorkflowDependencies
} from "./orchestrator";
import {
  agentRoutingDecisionSchema,
  createAgentRoutingCandidateDecision,
  createAgentRoutingContractCandidateDecision,
  createAgentRoutingDecision,
  type AgentRoutingDecision
} from "./routing";
import {
  createAgentContractChecklist,
  formatAgentContractChecklistForPrompt
} from "./contract-checklist";
import {
  agentRoutingCalibrationCaseSchema,
  agentRoutingContractTargetCasesPath,
  validateAgentRoutingCalibrationCases,
  type AgentRoutingCalibrationCase
} from "./routing-calibration";
import {
  agentPlanSchema,
  agentReviewHistoryEntrySchema,
  agentRunMetadataSchema,
  type AgentRunResult
} from "./schema";

export const agentEvaluationDirectory = path.join(
  process.cwd(),
  "data",
  "agent",
  "evaluation"
);
export const agentEvaluationCasesPath = path.join(
  agentEvaluationDirectory,
  "agent_evaluation_cases.json"
);
export const agentEvaluationRawBundlePath = path.join(
  agentEvaluationDirectory,
  "phase_1_e_raw_bundle.json"
);
export const agentEvaluationBlindBundlePath = path.join(
  agentEvaluationDirectory,
  "phase_1_e_blind_bundle.json"
);
export const agentEvaluationSampleMappingPath = path.join(
  agentEvaluationDirectory,
  "phase_1_e_sample_mapping.json"
);
export const agentEvaluationManualScoresPath = path.join(
  agentEvaluationDirectory,
  "phase_1_e_manual_scores.json"
);
export const agentEvaluationRevisionPairsPath = path.join(
  agentEvaluationDirectory,
  "phase_1_e_revision_pairs.json"
);
export const agentEvaluationSummaryPath = path.join(
  agentEvaluationDirectory,
  "phase_1_e_summary.json"
);
export const agentEvaluationReportPath = path.join(
  agentEvaluationDirectory,
  "phase_1_e_report.md"
);
export const agentEvaluationManualScoreTemplatePath = path.join(
  agentEvaluationDirectory,
  "phase_1_e_manual_score_template.md"
);
export const agentRoutingEvaluationRawBundlePath = path.join(
  agentEvaluationDirectory,
  "phase_2_a_raw_bundle.json"
);
export const agentRoutingEvaluationBlindBundlePath = path.join(
  agentEvaluationDirectory,
  "phase_2_a_blind_bundle.json"
);
export const agentRoutingEvaluationSampleMappingPath = path.join(
  agentEvaluationDirectory,
  "phase_2_a_sample_mapping.json"
);
export const agentRoutingEvaluationManualScoresPath = path.join(
  agentEvaluationDirectory,
  "phase_2_a_manual_scores.json"
);
export const agentRoutingEvaluationSummaryPath = path.join(
  agentEvaluationDirectory,
  "phase_2_a_summary.json"
);
export const agentRoutingEvaluationReportPath = path.join(
  agentEvaluationDirectory,
  "phase_2_a_report.md"
);
export const agentRoutingEvaluationManualScoreTemplatePath = path.join(
  agentEvaluationDirectory,
  "phase_2_a_manual_score_template.md"
);
export const agentRoutingV2EvaluationRawBundlePath = path.join(
  agentEvaluationDirectory,
  "phase_2_b_raw_bundle.json"
);
export const agentRoutingV2EvaluationBlindBundlePath = path.join(
  agentEvaluationDirectory,
  "phase_2_b_blind_bundle.json"
);
export const agentRoutingV2EvaluationSampleMappingPath = path.join(
  agentEvaluationDirectory,
  "phase_2_b_sample_mapping.json"
);
export const agentRoutingV2EvaluationManualScoresPath = path.join(
  agentEvaluationDirectory,
  "phase_2_b_manual_scores.json"
);
export const agentRoutingV2EvaluationSummaryPath = path.join(
  agentEvaluationDirectory,
  "phase_2_b_summary.json"
);
export const agentRoutingV2EvaluationReportPath = path.join(
  agentEvaluationDirectory,
  "phase_2_b_report.md"
);
export const agentRoutingV2EvaluationManualScoreTemplatePath = path.join(
  agentEvaluationDirectory,
  "phase_2_b_manual_score_template.md"
);
export const agentRoutingContractEvaluationRawBundlePath = path.join(
  agentEvaluationDirectory,
  "phase_2_d_raw_bundle.json"
);
export const agentRoutingContractEvaluationBlindBundlePath = path.join(
  agentEvaluationDirectory,
  "phase_2_d_blind_bundle.json"
);
export const agentRoutingContractEvaluationSampleMappingPath = path.join(
  agentEvaluationDirectory,
  "phase_2_d_sample_mapping.json"
);
export const agentRoutingContractEvaluationManualScoresPath = path.join(
  agentEvaluationDirectory,
  "phase_2_d_manual_scores.json"
);
export const agentRoutingContractEvaluationSummaryPath = path.join(
  agentEvaluationDirectory,
  "phase_2_d_summary.json"
);
export const agentRoutingContractEvaluationReportPath = path.join(
  agentEvaluationDirectory,
  "phase_2_d_report.md"
);
export const agentRoutingContractEvaluationManualScoreTemplatePath = path.join(
  agentEvaluationDirectory,
  "phase_2_d_manual_score_template.md"
);
export const agentContractChecklistEvaluationRawBundlePath = path.join(
  agentEvaluationDirectory,
  "phase_2_e_raw_bundle.json"
);
export const agentContractChecklistEvaluationBlindBundlePath = path.join(
  agentEvaluationDirectory,
  "phase_2_e_blind_bundle.json"
);
export const agentContractChecklistEvaluationSampleMappingPath = path.join(
  agentEvaluationDirectory,
  "phase_2_e_sample_mapping.json"
);
export const agentContractChecklistEvaluationManualScoresPath = path.join(
  agentEvaluationDirectory,
  "phase_2_e_manual_scores.json"
);
export const agentContractChecklistEvaluationSummaryPath = path.join(
  agentEvaluationDirectory,
  "phase_2_e_summary.json"
);
export const agentContractChecklistEvaluationReportPath = path.join(
  agentEvaluationDirectory,
  "phase_2_e_report.md"
);
export const agentContractChecklistEvaluationManualScoreTemplatePath = path.join(
  agentEvaluationDirectory,
  "phase_2_e_manual_score_template.md"
);

const manualScoreAxisNames = [
  "productSpecificRuleCoverage",
  "unsupportedAssumptionControl",
  "acceptanceCriteriaSpecificity",
  "jiraDecompositionAppropriateness",
  "jsonStructureStability",
  "crossFieldConsistency",
  "requirementToTaskTraceability"
] as const;

const evaluationModeSchema = z.enum(["off", "on"]);
const routingEvaluationModeSchema = z.enum(["off", "on", "routed"]);
const routingExecutionModeSchema = z.enum(["single_pass", "agent_workflow"]);
export const routingEvaluationIdSchema = z.enum([
  "agent-phase-2-a-routing",
  "agent-phase-2-b-routing-v2",
  "agent-phase-2-d-contract-checklist"
]);
export const contractChecklistEvaluationId = "agent-phase-2-e-contract-target";
export const contractChecklistEvaluationModeSchema = z.enum([
  "baseline",
  "checklist"
]);

export const agentEvaluationCaseSchema = z.object({
  caseId: z.string().regex(/^AGENT-\d{3}$/),
  title: z.string().min(1),
  requirementMemo: z.string().min(1),
  expectedRelevantDocumentIds: z.array(z.string().min(1)).min(1),
  importantExpectedRules: z.array(z.string().min(1)).min(1),
  unsupportedAssumptionsToAvoid: z.array(z.string().min(1)),
  crossFieldConsistencyChecks: z.array(z.string().min(1)).min(1),
  notes: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)])
});

export const agentEvaluationCasesSchema = z
  .array(agentEvaluationCaseSchema)
  .length(6);

const manualAxisScoreSchema = z.number().int().min(1).max(5);
export const scoringMethodSchema = z.enum([
  "blind-manual",
  "context-isolated-blind-llm",
  "secondary-blind-llm-check"
]);

export const manualQualityScoreSchema = z.object({
  productSpecificRuleCoverage: manualAxisScoreSchema,
  unsupportedAssumptionControl: manualAxisScoreSchema,
  acceptanceCriteriaSpecificity: manualAxisScoreSchema,
  jiraDecompositionAppropriateness: manualAxisScoreSchema,
  jsonStructureStability: manualAxisScoreSchema,
  crossFieldConsistency: manualAxisScoreSchema,
  requirementToTaskTraceability: manualAxisScoreSchema
});

export const manualScoreEntrySchema = z.object({
  sampleId: z.string().regex(/^SAMPLE-\d{3}$/),
  scores: manualQualityScoreSchema,
  notes: z.union([z.string(), z.array(z.string())]).optional()
});

export const manualScoresFileSchema = z.object({
  evaluationId: z.literal("agent-phase-1-e"),
  scoringMethod: scoringMethodSchema,
  scores: z.array(manualScoreEntrySchema)
});

const usageSchema = z.object({
  inputTokens: z.number().nonnegative().optional(),
  outputTokens: z.number().nonnegative().optional(),
  totalTokens: z.number().nonnegative().optional()
});

const rawRunAgentSchema = z.object({
  metadata: agentRunMetadataSchema,
  plan: agentPlanSchema.optional(),
  reviewHistory: z.array(agentReviewHistoryEntrySchema),
  retrieval: z
    .object({
      retrievalMetadata: z.record(z.unknown()).optional(),
      embeddingUsage: z
        .object({
          promptTokens: z.number().nonnegative().optional(),
          totalTokens: z.number().nonnegative().optional()
        })
        .optional(),
      sources: z.array(z.record(z.unknown()))
    })
    .optional(),
  initialDraft: generationOutputSchema.optional(),
  revisedOutput: generationOutputSchema.optional(),
  error: z
    .object({
      message: z.string().min(1),
      stepName: z.string().optional()
    })
    .optional()
});

export const rawEvaluationRunSchema = z.object({
  rawRunId: z.string().min(1),
  executionOrder: z.number().int().positive(),
  pairId: z.string().min(1),
  caseId: z.string().min(1),
  caseTitle: z.string().min(1),
  runIndex: z.number().int().positive(),
  mode: evaluationModeSchema,
  requirementMemo: z.string().min(1),
  request: z.record(z.unknown()),
  status: z.enum(["completed", "completed_with_findings", "failed"]),
  provider: z.string().min(1).optional(),
  modelName: z.string().min(1).optional(),
  promptVersion: z.string().min(1).optional(),
  evaluationElapsedMs: z.number().nonnegative(),
  finalOutput: generationOutputSchema.optional(),
  rag: ragMetadataSchema.optional(),
  usage: usageSchema.optional(),
  agent: rawRunAgentSchema.optional(),
  error: z
    .object({
      message: z.string().min(1)
    })
    .optional()
});

export const rawEvaluationBundleSchema = z.object({
  evaluationId: z.literal("agent-phase-1-e"),
  createdAt: z.string().datetime(),
  runMatrix: z.object({
    totalRuns: z.literal(16),
    offRuns: z.literal(8),
    onRuns: z.literal(8)
  }),
  cases: agentEvaluationCasesSchema,
  runs: z.array(rawEvaluationRunSchema).length(16)
});

export const blindEvaluationSampleSchema = z.object({
  sampleId: z.string().regex(/^SAMPLE-\d{3}$/),
  caseId: z.string().min(1),
  caseTitle: z.string().min(1),
  requirementMemo: z.string().min(1),
  expectations: z.object({
    expectedRelevantDocumentIds: z.array(z.string().min(1)),
    importantExpectedRules: z.array(z.string().min(1)),
    unsupportedAssumptionsToAvoid: z.array(z.string().min(1)),
    crossFieldConsistencyChecks: z.array(z.string().min(1))
  }),
  finalOutput: generationOutputSchema
});

export const blindEvaluationBundleSchema = z.object({
  evaluationId: z.literal("agent-phase-1-e"),
  createdAt: z.string().datetime(),
  scoringMethod: z.literal("blind-manual"),
  generationOutputSchema: z.record(z.unknown()).optional(),
  samples: z.array(blindEvaluationSampleSchema)
});

export const sampleMappingEntrySchema = z.object({
  sampleId: z.string().regex(/^SAMPLE-\d{3}$/),
  rawRunId: z.string().min(1),
  pairId: z.string().min(1),
  caseId: z.string().min(1),
  runIndex: z.number().int().positive(),
  mode: evaluationModeSchema,
  executionOrder: z.number().int().positive()
});

export const sampleMappingFileSchema = z.object({
  evaluationId: z.literal("agent-phase-1-e"),
  createdAt: z.string().datetime(),
  mappings: z.array(sampleMappingEntrySchema)
});

export const plannedEvaluationRunSchema = z.object({
  rawRunId: z.string().min(1),
  executionOrder: z.number().int().positive(),
  pairId: z.string().min(1),
  caseId: z.string().min(1),
  runIndex: z.number().int().positive(),
  mode: evaluationModeSchema
});

export const plannedRoutingEvaluationRunSchema = plannedEvaluationRunSchema.extend({
  mode: routingEvaluationModeSchema
});

export const rawRoutingEvaluationRunSchema = rawEvaluationRunSchema.extend({
  mode: routingEvaluationModeSchema,
  routing: agentRoutingDecisionSchema.optional(),
  routedExecutionMode: routingExecutionModeSchema.optional()
});

export const rawRoutingEvaluationBundleSchema = z.object({
  evaluationId: routingEvaluationIdSchema,
  createdAt: z.string().datetime(),
  runMatrix: z.object({
    totalRuns: z.literal(24),
    offRuns: z.literal(8),
    onRuns: z.literal(8),
    routedRuns: z.literal(8)
  }),
  cases: agentEvaluationCasesSchema,
  runs: z.array(rawRoutingEvaluationRunSchema).length(24)
});

export const routingSampleMappingEntrySchema = sampleMappingEntrySchema.extend({
  mode: routingEvaluationModeSchema
});

export const routingSampleMappingFileSchema = sampleMappingFileSchema.extend({
  evaluationId: routingEvaluationIdSchema,
  mappings: z.array(routingSampleMappingEntrySchema)
});

export const blindRoutingEvaluationBundleSchema = blindEvaluationBundleSchema.extend({
  evaluationId: routingEvaluationIdSchema
});

export const routingManualScoresFileSchema = manualScoresFileSchema.extend({
  evaluationId: routingEvaluationIdSchema
});

export const agentContractTargetCasesSchema = z
  .array(agentRoutingCalibrationCaseSchema)
  .length(8);

export const plannedContractChecklistEvaluationRunSchema = z.object({
  rawRunId: z.string().min(1),
  executionOrder: z.number().int().positive(),
  pairId: z.string().min(1),
  caseId: z.string().min(1),
  runIndex: z.number().int().positive(),
  mode: contractChecklistEvaluationModeSchema
});

export const rawContractChecklistEvaluationRunSchema = z.object({
  rawRunId: z.string().min(1),
  executionOrder: z.number().int().positive(),
  pairId: z.string().min(1),
  caseId: z.string().min(1),
  caseTitle: z.string().min(1),
  runIndex: z.number().int().positive(),
  mode: contractChecklistEvaluationModeSchema,
  requirementMemo: z.string().min(1),
  request: z.record(z.unknown()),
  status: z.enum(["completed", "failed"]),
  provider: z.string().min(1).optional(),
  modelName: z.string().min(1).optional(),
  promptVersion: z.string().min(1).optional(),
  evaluationElapsedMs: z.number().nonnegative(),
  finalOutput: generationOutputSchema.optional(),
  rag: ragMetadataSchema.optional(),
  usage: usageSchema.optional(),
  checklistRecommended: z.boolean(),
  error: z
    .object({
      message: z.string().min(1)
    })
    .optional()
});

export const rawContractChecklistEvaluationBundleSchema = z.object({
  evaluationId: z.literal(contractChecklistEvaluationId),
  createdAt: z.string().datetime(),
  runMatrix: z.object({
    totalRuns: z.literal(16),
    baselineRuns: z.literal(8),
    checklistRuns: z.literal(8)
  }),
  cases: agentContractTargetCasesSchema,
  runs: z.array(rawContractChecklistEvaluationRunSchema).length(16)
});

export const contractChecklistSampleMappingEntrySchema = z.object({
  sampleId: z.string().regex(/^SAMPLE-\d{3}$/),
  rawRunId: z.string().min(1),
  pairId: z.string().min(1),
  caseId: z.string().min(1),
  runIndex: z.number().int().positive(),
  mode: contractChecklistEvaluationModeSchema,
  executionOrder: z.number().int().positive()
});

export const contractChecklistSampleMappingFileSchema = z.object({
  evaluationId: z.literal(contractChecklistEvaluationId),
  createdAt: z.string().datetime(),
  mappings: z.array(contractChecklistSampleMappingEntrySchema)
});

export const blindContractChecklistEvaluationBundleSchema =
  blindEvaluationBundleSchema.extend({
    evaluationId: z.literal(contractChecklistEvaluationId)
  });

export const contractChecklistManualScoresFileSchema =
  manualScoresFileSchema.extend({
    evaluationId: z.literal(contractChecklistEvaluationId)
  });

export type AgentEvaluationCase = z.infer<typeof agentEvaluationCaseSchema>;
export type PlannedEvaluationRun = z.infer<typeof plannedEvaluationRunSchema>;
export type RawEvaluationRun = z.infer<typeof rawEvaluationRunSchema>;
export type RawEvaluationBundle = z.infer<typeof rawEvaluationBundleSchema>;
export type BlindEvaluationBundle = z.infer<typeof blindEvaluationBundleSchema>;
export type SampleMappingFile = z.infer<typeof sampleMappingFileSchema>;
export type ManualScoresFile = z.infer<typeof manualScoresFileSchema>;
export type ScoringMethod = z.infer<typeof scoringMethodSchema>;
export type ManualQualityScore = z.infer<typeof manualQualityScoreSchema>;
export type RoutingEvaluationMode = z.infer<typeof routingEvaluationModeSchema>;
export type RoutingExecutionMode = z.infer<typeof routingExecutionModeSchema>;
export type RoutingEvaluationId = z.infer<typeof routingEvaluationIdSchema>;
export type PlannedRoutingEvaluationRun = z.infer<
  typeof plannedRoutingEvaluationRunSchema
>;
export type RawRoutingEvaluationRun = z.infer<typeof rawRoutingEvaluationRunSchema>;
export type RawRoutingEvaluationBundle = z.infer<
  typeof rawRoutingEvaluationBundleSchema
>;
export type BlindRoutingEvaluationBundle = z.infer<
  typeof blindRoutingEvaluationBundleSchema
>;
export type RoutingSampleMappingFile = z.infer<
  typeof routingSampleMappingFileSchema
>;
export type RoutingManualScoresFile = z.infer<
  typeof routingManualScoresFileSchema
>;
export type ContractChecklistEvaluationMode = z.infer<
  typeof contractChecklistEvaluationModeSchema
>;
export type PlannedContractChecklistEvaluationRun = z.infer<
  typeof plannedContractChecklistEvaluationRunSchema
>;
export type RawContractChecklistEvaluationRun = z.infer<
  typeof rawContractChecklistEvaluationRunSchema
>;
export type RawContractChecklistEvaluationBundle = z.infer<
  typeof rawContractChecklistEvaluationBundleSchema
>;
export type BlindContractChecklistEvaluationBundle = z.infer<
  typeof blindContractChecklistEvaluationBundleSchema
>;
export type ContractChecklistSampleMappingFile = z.infer<
  typeof contractChecklistSampleMappingFileSchema
>;
export type ContractChecklistManualScoresFile = z.infer<
  typeof contractChecklistManualScoresFileSchema
>;

type ExecuteRunResult = Omit<
  RawEvaluationRun,
  | "rawRunId"
  | "executionOrder"
  | "pairId"
  | "caseId"
  | "caseTitle"
  | "runIndex"
  | "mode"
  | "requirementMemo"
>;

type ExecuteEvaluationRun = (
  testCase: AgentEvaluationCase,
  plannedRun: PlannedEvaluationRun
) => Promise<ExecuteRunResult>;

type ExecuteRoutingRunResult = Omit<
  RawRoutingEvaluationRun,
  | "rawRunId"
  | "executionOrder"
  | "pairId"
  | "caseId"
  | "caseTitle"
  | "runIndex"
  | "mode"
  | "requirementMemo"
>;

type ExecuteRoutingEvaluationRun = (
  testCase: AgentEvaluationCase,
  plannedRun: PlannedRoutingEvaluationRun
) => Promise<ExecuteRoutingRunResult>;

type ExecuteContractChecklistRunResult = Omit<
  RawContractChecklistEvaluationRun,
  | "rawRunId"
  | "executionOrder"
  | "pairId"
  | "caseId"
  | "caseTitle"
  | "runIndex"
  | "mode"
  | "requirementMemo"
>;

type ExecuteContractChecklistEvaluationRun = (
  testCase: AgentRoutingCalibrationCase,
  plannedRun: PlannedContractChecklistEvaluationRun
) => Promise<ExecuteContractChecklistRunResult>;

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

function mean(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertUniqueStrings(values: string[], label: string) {
  const seen = new Set<string>();
  const duplicate = values.find((value) => {
    if (seen.has(value)) {
      return true;
    }

    seen.add(value);
    return false;
  });

  if (duplicate) {
    throw new Error(`${label} contains duplicate value: ${duplicate}`);
  }
}

export async function readJsonFile<T>(
  filePath: string,
  schema: z.ZodType<T>
): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return schema.parse(JSON.parse(raw));
}

export async function writeJsonFile(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeTextFile(filePath: string, value: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

export function validateAgentEvaluationCases(
  cases: AgentEvaluationCase[]
): AgentEvaluationCase[] {
  const parsedCases = agentEvaluationCasesSchema.parse(cases);
  assertUniqueStrings(
    parsedCases.map((testCase) => testCase.caseId),
    "agent evaluation cases"
  );

  return parsedCases;
}

export async function loadAgentEvaluationCases(
  filePath = agentEvaluationCasesPath
): Promise<AgentEvaluationCase[]> {
  return validateAgentEvaluationCases(
    await readJsonFile(filePath, agentEvaluationCasesSchema)
  );
}

export function validateAgentContractTargetCases(
  cases: AgentRoutingCalibrationCase[]
): AgentRoutingCalibrationCase[] {
  const parsedCases = agentContractTargetCasesSchema.parse(cases);
  assertUniqueStrings(
    parsedCases.map((testCase) => testCase.caseId),
    "agent contract target cases"
  );
  validateAgentRoutingCalibrationCases(parsedCases);

  return parsedCases;
}

export async function loadAgentContractTargetCases(
  filePath = agentRoutingContractTargetCasesPath
): Promise<AgentRoutingCalibrationCase[]> {
  return validateAgentContractTargetCases(
    await readJsonFile(filePath, agentContractTargetCasesSchema)
  );
}

export function buildAgentEvaluationRunPlan(
  cases: AgentEvaluationCase[]
): PlannedEvaluationRun[] {
  validateAgentEvaluationCases(cases);
  const caseIds = cases.map((testCase) => testCase.caseId);
  const requiredCaseIds = [
    "AGENT-001",
    "AGENT-002",
    "AGENT-003",
    "AGENT-004",
    "AGENT-005",
    "AGENT-006"
  ];

  for (const requiredCaseId of requiredCaseIds) {
    if (!caseIds.includes(requiredCaseId)) {
      throw new Error(`Missing required evaluation case: ${requiredCaseId}`);
    }
  }

  const pairs = [
    { caseId: "AGENT-001", runIndex: 1 },
    { caseId: "AGENT-002", runIndex: 1 },
    { caseId: "AGENT-003", runIndex: 1 },
    { caseId: "AGENT-004", runIndex: 1 },
    { caseId: "AGENT-005", runIndex: 1 },
    { caseId: "AGENT-006", runIndex: 1 },
    { caseId: "AGENT-001", runIndex: 2 },
    { caseId: "AGENT-001", runIndex: 3 }
  ];
  const runs: PlannedEvaluationRun[] = [];

  for (const [pairIndex, pair] of pairs.entries()) {
    const pairNumber = pairIndex + 1;
    const modeOrder: Array<"off" | "on"> =
      pairNumber % 2 === 1 ? ["off", "on"] : ["on", "off"];

    for (const mode of modeOrder) {
      const executionOrder = runs.length + 1;
      runs.push({
        rawRunId: `RUN-${String(executionOrder).padStart(3, "0")}`,
        executionOrder,
        pairId: `PAIR-${String(pairNumber).padStart(3, "0")}`,
        caseId: pair.caseId,
        runIndex: pair.runIndex,
        mode
      });
    }
  }

  return runs;
}

export function buildAgentContractChecklistEvaluationRunPlan(
  cases: AgentRoutingCalibrationCase[]
): PlannedContractChecklistEvaluationRun[] {
  validateAgentContractTargetCases(cases);
  const modeOrders: ContractChecklistEvaluationMode[][] = [
    ["baseline", "checklist"],
    ["checklist", "baseline"]
  ];
  const runs: PlannedContractChecklistEvaluationRun[] = [];

  for (const [caseIndex, testCase] of cases.entries()) {
    const pairNumber = caseIndex + 1;
    const modeOrder = modeOrders[caseIndex % modeOrders.length];

    for (const mode of modeOrder) {
      const executionOrder = runs.length + 1;
      runs.push(
        plannedContractChecklistEvaluationRunSchema.parse({
          rawRunId: `CHECKLIST-RUN-${String(executionOrder).padStart(3, "0")}`,
          executionOrder,
          pairId: `CHECKLIST-PAIR-${String(pairNumber).padStart(3, "0")}`,
          caseId: testCase.caseId,
          runIndex: 1,
          mode
        })
      );
    }
  }

  return runs;
}

export function buildAgentRoutingEvaluationRunPlan(
  cases: AgentEvaluationCase[]
): PlannedRoutingEvaluationRun[] {
  validateAgentEvaluationCases(cases);
  const basePlan = buildAgentEvaluationRunPlan(cases);
  const modeOrders: RoutingEvaluationMode[][] = [
    ["off", "on", "routed"],
    ["on", "routed", "off"],
    ["routed", "off", "on"]
  ];
  const runs: PlannedRoutingEvaluationRun[] = [];
  const seenPairs = new Map<string, PlannedEvaluationRun>();

  for (const plannedRun of basePlan) {
    const key = `${plannedRun.caseId}:${plannedRun.runIndex}`;

    if (!seenPairs.has(key)) {
      seenPairs.set(key, plannedRun);
    }
  }

  for (const [pairIndex, pair] of [...seenPairs.values()].entries()) {
    const pairNumber = pairIndex + 1;
    const modeOrder = modeOrders[pairIndex % modeOrders.length];

    for (const mode of modeOrder) {
      const executionOrder = runs.length + 1;
      runs.push({
        rawRunId: `ROUTE-RUN-${String(executionOrder).padStart(3, "0")}`,
        executionOrder,
        pairId: `ROUTE-PAIR-${String(pairNumber).padStart(3, "0")}`,
        caseId: pair.caseId,
        runIndex: pair.runIndex,
        mode
      });
    }
  }

  return runs;
}

export function buildAgentOffRequest(testCase: AgentEvaluationCase) {
  return {
    inputText: testCase.requirementMemo,
    ragMode: "on" as const,
    ragContextPolicy: "document-diversity-v1" as const satisfies RagContextPolicy
  };
}

export function buildAgentOnRequest(testCase: AgentEvaluationCase) {
  return {
    inputText: testCase.requirementMemo,
    agentMode: "on" as const
  };
}

export function buildAgentRoutedRequest(testCase: AgentEvaluationCase) {
  return {
    inputText: testCase.requirementMemo,
    agentMode: "auto" as const
  };
}

export function buildAgentRoutingDecisionForEvaluation(
  testCase: AgentEvaluationCase
) {
  return createAgentRoutingDecision({
    requirementMemo: testCase.requirementMemo
  });
}

export function buildAgentRoutingCandidateDecisionForEvaluation(
  testCase: AgentEvaluationCase
) {
  return createAgentRoutingCandidateDecision({
    requirementMemo: testCase.requirementMemo
  });
}

export function buildAgentRoutingContractDecisionForEvaluation(
  testCase: AgentEvaluationCase
) {
  return createAgentRoutingContractCandidateDecision({
    requirementMemo: testCase.requirementMemo
  });
}

export function assertNoEvaluationRubricLeak(request: unknown) {
  const serializedRequest = JSON.stringify(request);
  const forbiddenMarkers = [
    "importantExpectedRules",
    "unsupportedAssumptionsToAvoid",
    "crossFieldConsistencyChecks",
    "expectedRelevantDocumentIds",
    "Product-specific rule coverage",
    "Unsupported assumption control",
    "JSON structure stability"
  ];
  const leakedMarker = forbiddenMarkers.find((marker) =>
    serializedRequest.includes(marker)
  );

  if (leakedMarker) {
    throw new Error(`Evaluation rubric leaked into generation input: ${leakedMarker}`);
  }
}

export function assertRoutingEvaluationBundleIsScorable(
  rawBundle: RawRoutingEvaluationBundle
) {
  const failedRuns = rawBundle.runs.filter((run) => run.status === "failed");
  const missingOutputRuns = rawBundle.runs.filter((run) => !run.finalOutput);

  if (failedRuns.length > 0 || missingOutputRuns.length > 0) {
    throw new Error(
      `Routing evaluation is not scorable: failedRuns=${failedRuns.length}, missingFinalOutputRuns=${missingOutputRuns.length}. Raw bundle was written for diagnostics; rerun after fixing the execution environment.`
    );
  }
}

export function assertContractChecklistEvaluationBundleIsScorable(
  rawBundle: RawContractChecklistEvaluationBundle
) {
  const failedRuns = rawBundle.runs.filter((run) => run.status === "failed");
  const missingOutputRuns = rawBundle.runs.filter((run) => !run.finalOutput);

  if (failedRuns.length > 0 || missingOutputRuns.length > 0) {
    throw new Error(
      `Contract checklist evaluation is not scorable: failedRuns=${failedRuns.length}, missingFinalOutputRuns=${missingOutputRuns.length}. Raw bundle was written for diagnostics; rerun after fixing the execution environment.`
    );
  }
}

function buildRawRun(input: {
  plannedRun: PlannedEvaluationRun;
  testCase: AgentEvaluationCase;
  result: ExecuteRunResult;
}): RawEvaluationRun {
  return rawEvaluationRunSchema.parse({
    rawRunId: input.plannedRun.rawRunId,
    executionOrder: input.plannedRun.executionOrder,
    pairId: input.plannedRun.pairId,
    caseId: input.testCase.caseId,
    caseTitle: input.testCase.title,
    runIndex: input.plannedRun.runIndex,
    mode: input.plannedRun.mode,
    requirementMemo: input.testCase.requirementMemo,
    ...input.result
  });
}

function buildRoutingRawRun(input: {
  plannedRun: PlannedRoutingEvaluationRun;
  testCase: AgentEvaluationCase;
  result: ExecuteRoutingRunResult;
}): RawRoutingEvaluationRun {
  return rawRoutingEvaluationRunSchema.parse({
    rawRunId: input.plannedRun.rawRunId,
    executionOrder: input.plannedRun.executionOrder,
    pairId: input.plannedRun.pairId,
    caseId: input.testCase.caseId,
    caseTitle: input.testCase.title,
    runIndex: input.plannedRun.runIndex,
    mode: input.plannedRun.mode,
    requirementMemo: input.testCase.requirementMemo,
    ...input.result
  });
}

function buildContractChecklistRawRun(input: {
  plannedRun: PlannedContractChecklistEvaluationRun;
  testCase: AgentRoutingCalibrationCase;
  result: ExecuteContractChecklistRunResult;
}): RawContractChecklistEvaluationRun {
  return rawContractChecklistEvaluationRunSchema.parse({
    rawRunId: input.plannedRun.rawRunId,
    executionOrder: input.plannedRun.executionOrder,
    pairId: input.plannedRun.pairId,
    caseId: input.testCase.caseId,
    caseTitle: input.testCase.title,
    runIndex: input.plannedRun.runIndex,
    mode: input.plannedRun.mode,
    requirementMemo: input.testCase.requirementMemo,
    ...input.result
  });
}

export async function executeAgentEvaluationRunPlan(input: {
  cases: AgentEvaluationCase[];
  executeOff?: ExecuteEvaluationRun;
  executeOn?: ExecuteEvaluationRun;
  createdAt?: string;
}): Promise<RawEvaluationBundle> {
  const cases = validateAgentEvaluationCases(input.cases);
  const caseById = new Map(cases.map((testCase) => [testCase.caseId, testCase]));
  const plannedRuns = buildAgentEvaluationRunPlan(cases);
  const runs: RawEvaluationRun[] = [];
  const executeOff = input.executeOff ?? executeAgentOffRun;
  const executeOn = input.executeOn ?? executeAgentOnRun;

  for (const plannedRun of plannedRuns) {
    const testCase = caseById.get(plannedRun.caseId);

    if (!testCase) {
      throw new Error(`Unknown planned caseId: ${plannedRun.caseId}`);
    }

    const result =
      plannedRun.mode === "off"
        ? await executeOff(testCase, plannedRun)
        : await executeOn(testCase, plannedRun);
    runs.push(buildRawRun({ plannedRun, testCase, result }));
  }

  return rawEvaluationBundleSchema.parse({
    evaluationId: "agent-phase-1-e",
    createdAt: input.createdAt ?? new Date().toISOString(),
    runMatrix: {
      totalRuns: 16,
      offRuns: 8,
      onRuns: 8
    },
    cases,
    runs
  });
}

export async function executeAgentRoutingEvaluationRunPlan(input: {
  cases: AgentEvaluationCase[];
  evaluationId?: RoutingEvaluationId;
  executeOff?: ExecuteRoutingEvaluationRun;
  executeOn?: ExecuteRoutingEvaluationRun;
  executeRouted?: ExecuteRoutingEvaluationRun;
  createRoutingDecision?: (testCase: AgentEvaluationCase) => AgentRoutingDecision;
  createdAt?: string;
  onRunStart?: (input: {
    plannedRun: PlannedRoutingEvaluationRun;
    totalRuns: number;
  }) => void;
  onRunComplete?: (input: {
    plannedRun: PlannedRoutingEvaluationRun;
    totalRuns: number;
    rawRun: RawRoutingEvaluationRun;
  }) => void;
}): Promise<RawRoutingEvaluationBundle> {
  const cases = validateAgentEvaluationCases(input.cases);
  const caseById = new Map(cases.map((testCase) => [testCase.caseId, testCase]));
  const plannedRuns = buildAgentRoutingEvaluationRunPlan(cases);
  const runs: RawRoutingEvaluationRun[] = [];
  const executeOff = input.executeOff ?? executeAgentOffRun;
  const executeOn = input.executeOn ?? executeAgentOnRun;
  const executeRouted =
    input.executeRouted ??
    ((testCase) =>
      executeAgentRoutedRun(testCase, input.createRoutingDecision));

  for (const plannedRun of plannedRuns) {
    const testCase = caseById.get(plannedRun.caseId);

    if (!testCase) {
      throw new Error(`Unknown planned caseId: ${plannedRun.caseId}`);
    }

    input.onRunStart?.({ plannedRun, totalRuns: plannedRuns.length });

    const result =
      plannedRun.mode === "off"
        ? await executeOff(testCase, plannedRun)
        : plannedRun.mode === "on"
          ? await executeOn(testCase, plannedRun)
          : await executeRouted(testCase, plannedRun);
    const rawRun = buildRoutingRawRun({ plannedRun, testCase, result });
    runs.push(rawRun);
    input.onRunComplete?.({
      plannedRun,
      totalRuns: plannedRuns.length,
      rawRun
    });
  }

  return rawRoutingEvaluationBundleSchema.parse({
    evaluationId: input.evaluationId ?? "agent-phase-2-a-routing",
    createdAt: input.createdAt ?? new Date().toISOString(),
    runMatrix: {
      totalRuns: 24,
      offRuns: 8,
      onRuns: 8,
      routedRuns: 8
    },
    cases,
    runs
  });
}

export async function executeAgentContractChecklistEvaluationRunPlan(input: {
  cases: AgentRoutingCalibrationCase[];
  executeRun?: ExecuteContractChecklistEvaluationRun;
  createdAt?: string;
  onRunStart?: (input: {
    plannedRun: PlannedContractChecklistEvaluationRun;
    totalRuns: number;
  }) => void;
  onRunComplete?: (input: {
    plannedRun: PlannedContractChecklistEvaluationRun;
    totalRuns: number;
    rawRun: RawContractChecklistEvaluationRun;
  }) => void;
}): Promise<RawContractChecklistEvaluationBundle> {
  const cases = validateAgentContractTargetCases(input.cases);
  const caseById = new Map(cases.map((testCase) => [testCase.caseId, testCase]));
  const plannedRuns = buildAgentContractChecklistEvaluationRunPlan(cases);
  const runs: RawContractChecklistEvaluationRun[] = [];
  const executeRun = input.executeRun ?? executeContractChecklistRun;

  for (const plannedRun of plannedRuns) {
    const testCase = caseById.get(plannedRun.caseId);

    if (!testCase) {
      throw new Error(`Unknown planned caseId: ${plannedRun.caseId}`);
    }

    input.onRunStart?.({ plannedRun, totalRuns: plannedRuns.length });

    const result = await executeRun(testCase, plannedRun);
    const rawRun = buildContractChecklistRawRun({
      plannedRun,
      testCase,
      result
    });
    runs.push(rawRun);
    input.onRunComplete?.({
      plannedRun,
      totalRuns: plannedRuns.length,
      rawRun
    });
  }

  return rawContractChecklistEvaluationBundleSchema.parse({
    evaluationId: contractChecklistEvaluationId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    runMatrix: {
      totalRuns: 16,
      baselineRuns: 8,
      checklistRuns: 8
    },
    cases,
    runs
  });
}

async function executeContractChecklistRun(
  testCase: AgentRoutingCalibrationCase,
  plannedRun: PlannedContractChecklistEvaluationRun
): Promise<ExecuteContractChecklistRunResult> {
  const request = { inputText: testCase.requirementMemo };
  const startedAtMs = getTimerNow();

  try {
    const ragMetadata = await retrieveRagMetadataForSinglePass(
      request.inputText,
      "document-diversity-v1"
    );
    const routingDecision = createAgentRoutingContractCandidateDecision({
      requirementMemo: request.inputText
    });
    const checklist = createAgentContractChecklist({
      requirementMemo: request.inputText,
      routingDecision
    });
    const contractChecklistText =
      plannedRun.mode === "checklist"
        ? formatAgentContractChecklistForPrompt(checklist)
        : undefined;
    const result = await generateFromRequirementMemo(request.inputText, {
      ragContextText: ragMetadata.contextText,
      contractChecklistText
    });

    return {
      request,
      status: "completed",
      provider: result.provider,
      modelName: result.modelName,
      promptVersion: result.promptVersion,
      evaluationElapsedMs: toNonNegativeDurationMs(startedAtMs),
      finalOutput: result.output,
      rag: ragMetadata.metadata,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        totalTokens: result.totalTokens
      },
      checklistRecommended: checklist.recommended
    };
  } catch (error) {
    return {
      request,
      status: "failed",
      promptVersion: getPromptVersion(),
      evaluationElapsedMs: toNonNegativeDurationMs(startedAtMs),
      checklistRecommended: plannedRun.mode === "checklist",
      error: {
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

async function executeAgentOffRun(
  testCase: AgentEvaluationCase
): Promise<ExecuteRunResult> {
  const request = buildAgentOffRequest(testCase);
  assertNoEvaluationRubricLeak(request);
  const startedAtMs = getTimerNow();

  try {
    const ragMetadata = await retrieveRagMetadataForSinglePass(
      request.inputText,
      request.ragContextPolicy
    );
    const result = await generateFromRequirementMemo(request.inputText, {
      ragContextText: ragMetadata.contextText
    });

    return {
      request,
      status: "completed",
      provider: result.provider,
      modelName: result.modelName,
      promptVersion: result.promptVersion,
      evaluationElapsedMs: toNonNegativeDurationMs(startedAtMs),
      finalOutput: result.output,
      rag: ragMetadata.metadata,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        totalTokens: result.totalTokens
      }
    };
  } catch (error) {
    return {
      request,
      status: "failed",
      promptVersion: getPromptVersion(),
      evaluationElapsedMs: toNonNegativeDurationMs(startedAtMs),
      error: {
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

async function retrieveRagMetadataForSinglePass(
  query: string,
  contextPolicy: RagContextPolicy
): Promise<{ contextText: string; metadata: Extract<RagMetadata, { mode: "on" }> }> {
  const ragConfig = getGroundedGenerationRagConfig();
  const candidateTopK = getCandidateTopKForContextPolicy(contextPolicy);
  const retrievalStartedAtMs = getTimerNow();
  const retrieval = await ragRetriever.retrieveRagChunks({
    query,
    strategy: ragConfig.strategy,
    topK: candidateTopK
  });
  const retrievalLatencyMs = toNonNegativeDurationMs(retrievalStartedAtMs);
  const selection = selectRagContextChunks(retrieval.results, contextPolicy);
  const groundedContext = buildGroundedContext(selection.selectedChunks);

  return {
    contextText: groundedContext.contextText,
    metadata: {
      mode: "on",
      strategy: ragConfig.strategy,
      topK: ragConfig.topK,
      embeddingModel: retrieval.embeddingModel,
      retrievalLatencyMs,
      contextPolicy: selection.policy,
      candidateTopK: selection.candidateTopK,
      candidateChunkCount: selection.candidateMetrics.selectedChunkCount,
      candidateUniqueDocumentCount:
        selection.candidateMetrics.uniqueDocumentCount,
      candidateDocumentChunkCounts:
        selection.candidateMetrics.documentChunkCounts,
      requestedFinalTopK: selection.requestedFinalTopK,
      maxChunksPerDocument: selection.maxChunksPerDocument,
      selectedChunkCount: selection.metrics.selectedChunkCount,
      uniqueDocumentCount: selection.metrics.uniqueDocumentCount,
      maximumChunksFromSameDocument:
        selection.metrics.maximumChunksFromSameDocument,
      documentChunkCounts: selection.metrics.documentChunkCounts,
      sources: groundedContext.sources,
      embeddingUsage: retrieval.embeddingUsage
    }
  };
}

async function executeAgentOnRun(
  testCase: AgentEvaluationCase
): Promise<ExecuteRunResult> {
  return executeAgentOnRunWithDependencies(testCase, createRealAgentWorkflowDependencies());
}

async function executeAgentRoutedRun(
  testCase: AgentEvaluationCase,
  createRoutingDecision = buildAgentRoutingDecisionForEvaluation
): Promise<ExecuteRoutingRunResult> {
  const request = buildAgentRoutedRequest(testCase);
  const routing = createRoutingDecision(testCase);
  assertNoEvaluationRubricLeak(request);

  if (routing.mode === "single_pass") {
    return executeRoutedSinglePassRun(testCase, routing);
  }

  return executeRoutedAgentRun(testCase, routing, createRealAgentWorkflowDependencies());
}

async function executeRoutedSinglePassRun(
  testCase: AgentEvaluationCase,
  routing: AgentRoutingDecision
): Promise<ExecuteRoutingRunResult> {
  const request = buildAgentRoutedRequest(testCase);
  const startedAtMs = getTimerNow();

  try {
    const ragMetadata = await retrieveRagMetadataForSinglePass(
      request.inputText,
      "document-diversity-v1"
    );
    const contractChecklistText =
      routing.signals.lightweightChecklistRecommended === true
        ? formatAgentContractChecklistForPrompt(
            createAgentContractChecklist({
              requirementMemo: request.inputText,
              routingDecision: routing
            })
          )
        : undefined;
    const result = await generateFromRequirementMemo(request.inputText, {
      ragContextText: ragMetadata.contextText,
      contractChecklistText
    });

    return {
      request,
      status: "completed",
      provider: result.provider,
      modelName: result.modelName,
      promptVersion: result.promptVersion,
      evaluationElapsedMs: toNonNegativeDurationMs(startedAtMs),
      finalOutput: result.output,
      rag: ragMetadata.metadata,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        totalTokens: result.totalTokens
      },
      routing,
      routedExecutionMode: "single_pass"
    };
  } catch (error) {
    return {
      request,
      status: "failed",
      promptVersion: getPromptVersion(),
      evaluationElapsedMs: toNonNegativeDurationMs(startedAtMs),
      routing,
      routedExecutionMode: "single_pass",
      error: {
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

async function executeRoutedAgentRun(
  testCase: AgentEvaluationCase,
  routing: AgentRoutingDecision,
  dependencies: AgentWorkflowDependencies
): Promise<ExecuteRoutingRunResult> {
  const request = buildAgentRoutedRequest(testCase);
  const startedAtMs = getTimerNow();

  try {
    const result = await runAgentWorkflow({
      requirementMemo: request.inputText,
      dependencies
    });
    const rawResult = toAgentRawRunResult({
      request,
      result,
      evaluationElapsedMs: toNonNegativeDurationMs(startedAtMs)
    });

    return {
      ...rawResult,
      routing,
      routedExecutionMode: "agent_workflow"
    };
  } catch (error) {
    return {
      request,
      status: "failed",
      promptVersion: "agent-poc-workflow-v1",
      evaluationElapsedMs: toNonNegativeDurationMs(startedAtMs),
      routing,
      routedExecutionMode: "agent_workflow",
      error: {
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

export async function executeAgentOnRunWithDependencies(
  testCase: AgentEvaluationCase,
  dependencies: AgentWorkflowDependencies
): Promise<ExecuteRunResult> {
  const request = buildAgentOnRequest(testCase);
  assertNoEvaluationRubricLeak(request);
  const startedAtMs = getTimerNow();

  try {
    const result = await runAgentWorkflow({
      requirementMemo: request.inputText,
      dependencies
    });

    return toAgentRawRunResult({
      request,
      result,
      evaluationElapsedMs: toNonNegativeDurationMs(startedAtMs)
    });
  } catch (error) {
    return {
      request,
      status: "failed",
      promptVersion: "agent-poc-workflow-v1",
      evaluationElapsedMs: toNonNegativeDurationMs(startedAtMs),
      error: {
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

function toAgentRawRunResult(input: {
  request: ReturnType<typeof buildAgentOnRequest> | ReturnType<typeof buildAgentRoutedRequest>;
  result: AgentRunResult;
  evaluationElapsedMs: number;
}): ExecuteRunResult {
  const firstProviderStep = input.result.metadata.steps.find(
    (step) => step.providerBacked === true
  );
  const ragMetadata = input.result.knowledge?.retrievalMetadata
    ? ragMetadataSchema.safeParse(input.result.knowledge.retrievalMetadata)
    : undefined;

  return {
    request: input.request,
    status: input.result.metadata.status,
    provider: firstProviderStep?.provider,
    modelName: firstProviderStep?.modelName,
    promptVersion: "agent-poc-workflow-v1",
    evaluationElapsedMs: input.evaluationElapsedMs,
    finalOutput: input.result.output,
    rag: ragMetadata?.success ? ragMetadata.data : undefined,
    usage: aggregateAgentStepUsage(input.result.metadata.steps),
    agent: {
      metadata: input.result.metadata,
      plan: input.result.plan,
      reviewHistory: input.result.reviewHistory,
      retrieval: input.result.knowledge
        ? {
            retrievalMetadata: input.result.knowledge.retrievalMetadata,
            embeddingUsage: input.result.knowledge.embeddingUsage,
            sources: input.result.knowledge.sources.map((source) => ({
              sourceId: source.sourceId,
              rank: source.rank,
              contextRank: source.contextRank,
              retrievalRank: source.retrievalRank,
              score: source.score,
              chunkId: source.chunkId,
              documentId: source.documentId,
              documentTitle: source.documentTitle,
              headingPath: source.headingPath,
              sourcePath: source.sourcePath
            }))
          }
        : undefined,
      initialDraft: input.result.initialDraft,
      revisedOutput: input.result.revisedOutput,
      error: input.result.error
    },
    error: input.result.error
  };
}

function sumDefined(values: Array<number | undefined>): number | undefined {
  const definedValues = values.filter((value): value is number => value !== undefined);

  if (definedValues.length === 0) {
    return undefined;
  }

  return definedValues.reduce((sum, value) => sum + value, 0);
}

function aggregateAgentStepUsage(
  steps: AgentRunResult["metadata"]["steps"]
): z.infer<typeof usageSchema> {
  const providerSteps = steps.filter((step) => step.providerBacked === true);

  return {
    inputTokens: sumDefined(providerSteps.map((step) => step.inputTokens)),
    outputTokens: sumDefined(providerSteps.map((step) => step.outputTokens)),
    totalTokens: sumDefined(providerSteps.map((step) => step.totalTokens))
  };
}

function requireCompletedOutput(run: {
  rawRunId: string;
  finalOutput?: GenerationOutput;
}): GenerationOutput {
  if (!run.finalOutput) {
    throw new Error(`Raw run does not contain finalOutput: ${run.rawRunId}`);
  }

  return run.finalOutput;
}

export function createBlindBundleAndMapping(
  rawBundle: RawEvaluationBundle
): { blindBundle: BlindEvaluationBundle; mappingFile: SampleMappingFile } {
  const caseById = new Map(
    rawBundle.cases.map((testCase) => [testCase.caseId, testCase])
  );
  const completedRuns = rawBundle.runs.filter((run) => run.finalOutput);
  const orderedRuns = [...completedRuns].sort((a, b) => {
    const hashA = stableHash(
      `agent-phase-1-e-blind-v1:${a.rawRunId}:${a.caseId}:${a.mode}`
    );
    const hashB = stableHash(
      `agent-phase-1-e-blind-v1:${b.rawRunId}:${b.caseId}:${b.mode}`
    );
    return hashA.localeCompare(hashB);
  });
  const createdAt = new Date().toISOString();
  const samples = orderedRuns.map((run, index) => {
    const testCase = caseById.get(run.caseId);

    if (!testCase) {
      throw new Error(`Unknown raw run caseId: ${run.caseId}`);
    }

    return {
      sampleId: `SAMPLE-${String(index + 1).padStart(3, "0")}`,
      caseId: testCase.caseId,
      caseTitle: testCase.title,
      requirementMemo: testCase.requirementMemo,
      expectations: {
        expectedRelevantDocumentIds: testCase.expectedRelevantDocumentIds,
        importantExpectedRules: testCase.importantExpectedRules,
        unsupportedAssumptionsToAvoid: testCase.unsupportedAssumptionsToAvoid,
        crossFieldConsistencyChecks: testCase.crossFieldConsistencyChecks
      },
      finalOutput: requireCompletedOutput(run)
    };
  });
  const mappings = orderedRuns.map((run, index) => ({
    sampleId: `SAMPLE-${String(index + 1).padStart(3, "0")}`,
    rawRunId: run.rawRunId,
    pairId: run.pairId,
    caseId: run.caseId,
    runIndex: run.runIndex,
    mode: run.mode,
    executionOrder: run.executionOrder
  }));

  return {
    blindBundle: blindEvaluationBundleSchema.parse({
      evaluationId: "agent-phase-1-e",
      createdAt,
      scoringMethod: "blind-manual",
      generationOutputSchema: generationOutputJsonSchema,
      samples
    }),
    mappingFile: sampleMappingFileSchema.parse({
      evaluationId: "agent-phase-1-e",
      createdAt,
      mappings
    })
  };
}

export function createBlindRoutingBundleAndMapping(
  rawBundle: RawRoutingEvaluationBundle
): {
  blindBundle: BlindRoutingEvaluationBundle;
  mappingFile: RoutingSampleMappingFile;
} {
  const caseById = new Map(
    rawBundle.cases.map((testCase) => [testCase.caseId, testCase])
  );
  const completedRuns = rawBundle.runs.filter((run) => run.finalOutput);
  const orderedRuns = [...completedRuns].sort((a, b) => {
    const hashA = stableHash(
      `${rawBundle.evaluationId}-blind-v1:${a.rawRunId}:${a.caseId}:${a.mode}`
    );
    const hashB = stableHash(
      `${rawBundle.evaluationId}-blind-v1:${b.rawRunId}:${b.caseId}:${b.mode}`
    );
    return hashA.localeCompare(hashB);
  });
  const createdAt = new Date().toISOString();
  const samples = orderedRuns.map((run, index) => {
    const testCase = caseById.get(run.caseId);

    if (!testCase) {
      throw new Error(`Unknown raw run caseId: ${run.caseId}`);
    }

    return {
      sampleId: `SAMPLE-${String(index + 1).padStart(3, "0")}`,
      caseId: testCase.caseId,
      caseTitle: testCase.title,
      requirementMemo: testCase.requirementMemo,
      expectations: {
        expectedRelevantDocumentIds: testCase.expectedRelevantDocumentIds,
        importantExpectedRules: testCase.importantExpectedRules,
        unsupportedAssumptionsToAvoid: testCase.unsupportedAssumptionsToAvoid,
        crossFieldConsistencyChecks: testCase.crossFieldConsistencyChecks
      },
      finalOutput: requireCompletedOutput(run)
    };
  });
  const mappings = orderedRuns.map((run, index) => ({
    sampleId: `SAMPLE-${String(index + 1).padStart(3, "0")}`,
    rawRunId: run.rawRunId,
    pairId: run.pairId,
    caseId: run.caseId,
    runIndex: run.runIndex,
    mode: run.mode,
    executionOrder: run.executionOrder
  }));

  return {
    blindBundle: blindRoutingEvaluationBundleSchema.parse({
      evaluationId: rawBundle.evaluationId,
      createdAt,
      scoringMethod: "blind-manual",
      generationOutputSchema: generationOutputJsonSchema,
      samples
    }),
    mappingFile: routingSampleMappingFileSchema.parse({
      evaluationId: rawBundle.evaluationId,
      createdAt,
      mappings
    })
  };
}

export function createBlindContractChecklistBundleAndMapping(
  rawBundle: RawContractChecklistEvaluationBundle
): {
  blindBundle: BlindContractChecklistEvaluationBundle;
  mappingFile: ContractChecklistSampleMappingFile;
} {
  const caseById = new Map(
    rawBundle.cases.map((testCase) => [testCase.caseId, testCase])
  );
  const completedRuns = rawBundle.runs.filter((run) => run.finalOutput);
  const orderedRuns = [...completedRuns].sort((a, b) => {
    const hashA = stableHash(
      `${rawBundle.evaluationId}-blind-v1:${a.rawRunId}:${a.caseId}:${a.mode}`
    );
    const hashB = stableHash(
      `${rawBundle.evaluationId}-blind-v1:${b.rawRunId}:${b.caseId}:${b.mode}`
    );
    return hashA.localeCompare(hashB);
  });
  const createdAt = new Date().toISOString();
  const samples = orderedRuns.map((run, index) => {
    const testCase = caseById.get(run.caseId);

    if (!testCase) {
      throw new Error(`Unknown raw run caseId: ${run.caseId}`);
    }

    return {
      sampleId: `SAMPLE-${String(index + 1).padStart(3, "0")}`,
      caseId: testCase.caseId,
      caseTitle: testCase.title,
      requirementMemo: testCase.requirementMemo,
      expectations: {
        expectedRelevantDocumentIds: [],
        importantExpectedRules: [
          "Preserve exact query parameter names and value formats.",
          "Preserve enum values or allowed option values from the requirement memo.",
          "State default behavior as testable acceptance criteria.",
          "State URL reload, sharing, or persistence expectations when present.",
          "Trace contract details into acceptance criteria and implementation tasks."
        ],
        unsupportedAssumptionsToAvoid: [
          "Do not introduce backend, security, lifecycle, or policy requirements not present in the memo.",
          "Do not infer Agent workflow metadata, routing mode, provider, latency, or checklist status."
        ],
        crossFieldConsistencyChecks: [
          "summary, spec, acceptanceCriteria, jiraTasks, implementationPlan, reviewPoints, and risks should use consistent query parameter names and values.",
          "Jira tasks should cover the same contract details stated in acceptance criteria."
        ]
      },
      finalOutput: requireCompletedOutput(run)
    };
  });
  const mappings = orderedRuns.map((run, index) => ({
    sampleId: `SAMPLE-${String(index + 1).padStart(3, "0")}`,
    rawRunId: run.rawRunId,
    pairId: run.pairId,
    caseId: run.caseId,
    runIndex: run.runIndex,
    mode: run.mode,
    executionOrder: run.executionOrder
  }));

  return {
    blindBundle: blindContractChecklistEvaluationBundleSchema.parse({
      evaluationId: rawBundle.evaluationId,
      createdAt,
      scoringMethod: "blind-manual",
      generationOutputSchema: generationOutputJsonSchema,
      samples
    }),
    mappingFile: contractChecklistSampleMappingFileSchema.parse({
      evaluationId: rawBundle.evaluationId,
      createdAt,
      mappings
    })
  };
}

export function assertBlindBundleHasNoModeLeak(blindBundle: unknown) {
  const serializedBundle = JSON.stringify(blindBundle);
  const forbiddenMarkers = [
    "agentMode",
    "ragMode",
    "promptVersion",
    "AgentPlan",
    "reviewHistory",
    "revisionCount",
    "reviewCount",
    "llmStepCount",
    "providerLatencyMs",
    "modelName",
    "rawRunId",
    "\"mode\"",
    "\"agent\"",
    "\"rag\""
  ];
  const leakedMarker = forbiddenMarkers.find((marker) =>
    serializedBundle.includes(marker)
  );

  if (leakedMarker) {
    throw new Error(`Blind bundle leaked non-blind metadata: ${leakedMarker}`);
  }
}

export function createManualScoreTemplate(blindBundle: {
  generationOutputSchema?: unknown;
  samples: Array<{ sampleId: string }>;
}): string {
  return [
    "# Phase 1-E Blind Manual Score Template",
    "",
    "Score each axis as an integer from 1 to 5. Do not add mode guesses.",
    "",
    "## GenerationOutput Schema",
    "",
    "Use this schema only to score jsonStructureStability. Do not infer routing mode, Agent metadata, provider, latency, or sample mapping from it.",
    "",
    "```json",
    JSON.stringify(
      blindBundle.generationOutputSchema ?? generationOutputJsonSchema,
      null,
      2
    ),
    "```",
    "",
    ...blindBundle.samples.flatMap((sample) => [
      `## ${sample.sampleId}`,
      "",
      `- productSpecificRuleCoverage: `,
      `- unsupportedAssumptionControl: `,
      `- acceptanceCriteriaSpecificity: `,
      `- jiraDecompositionAppropriateness: `,
      `- jsonStructureStability: `,
      `- crossFieldConsistency: `,
      `- requirementToTaskTraceability: `,
      `- notes: `,
      ""
    ])
  ].join("\n");
}

export function validateManualScores(
  manualScores: ManualScoresFile,
  blindBundle: BlindEvaluationBundle
): ManualScoresFile {
  const parsedScores = manualScoresFileSchema.parse(manualScores);
  const expectedSampleIds = blindBundle.samples.map((sample) => sample.sampleId);
  const actualSampleIds = parsedScores.scores.map((score) => score.sampleId);

  assertUniqueStrings(actualSampleIds, "manual score sampleIds");

  const expectedSet = new Set(expectedSampleIds);
  const actualSet = new Set(actualSampleIds);
  const unknownSample = actualSampleIds.find((sampleId) => !expectedSet.has(sampleId));
  const missingSample = expectedSampleIds.find((sampleId) => !actualSet.has(sampleId));

  if (unknownSample) {
    throw new Error(`Manual score contains unknown sampleId: ${unknownSample}`);
  }

  if (missingSample) {
    throw new Error(`Manual score is missing sampleId: ${missingSample}`);
  }

  return parsedScores;
}

export function validateRoutingManualScores(
  manualScores: RoutingManualScoresFile,
  blindBundle: BlindRoutingEvaluationBundle
): RoutingManualScoresFile {
  const parsedScores = routingManualScoresFileSchema.parse(manualScores);
  const expectedSampleIds = blindBundle.samples.map((sample) => sample.sampleId);
  const actualSampleIds = parsedScores.scores.map((score) => score.sampleId);

  assertUniqueStrings(actualSampleIds, "routing manual score sampleIds");

  const expectedSet = new Set(expectedSampleIds);
  const actualSet = new Set(actualSampleIds);
  const unknownSample = actualSampleIds.find((sampleId) => !expectedSet.has(sampleId));
  const missingSample = expectedSampleIds.find((sampleId) => !actualSet.has(sampleId));

  if (unknownSample) {
    throw new Error(`Routing manual score contains unknown sampleId: ${unknownSample}`);
  }

  if (missingSample) {
    throw new Error(`Routing manual score is missing sampleId: ${missingSample}`);
  }

  return parsedScores;
}

export function validateContractChecklistManualScores(
  manualScores: ContractChecklistManualScoresFile,
  blindBundle: BlindContractChecklistEvaluationBundle
): ContractChecklistManualScoresFile {
  const parsedScores = contractChecklistManualScoresFileSchema.parse(manualScores);
  const expectedSampleIds = blindBundle.samples.map((sample) => sample.sampleId);
  const actualSampleIds = parsedScores.scores.map((score) => score.sampleId);

  assertUniqueStrings(actualSampleIds, "contract checklist manual score sampleIds");

  const expectedSet = new Set(expectedSampleIds);
  const actualSet = new Set(actualSampleIds);
  const unknownSample = actualSampleIds.find((sampleId) => !expectedSet.has(sampleId));
  const missingSample = expectedSampleIds.find((sampleId) => !actualSet.has(sampleId));

  if (unknownSample) {
    throw new Error(
      `Contract checklist manual score contains unknown sampleId: ${unknownSample}`
    );
  }

  if (missingSample) {
    throw new Error(
      `Contract checklist manual score is missing sampleId: ${missingSample}`
    );
  }

  return parsedScores;
}

function averageManualScore(scores: ManualQualityScore): number {
  return (
    manualScoreAxisNames.reduce((sum, axis) => sum + scores[axis], 0) /
    manualScoreAxisNames.length
  );
}

function modeRuns(rawBundle: RawEvaluationBundle, mode: "off" | "on") {
  return rawBundle.runs.filter((run) => run.mode === mode);
}

function routingModeRuns(
  rawBundle: RawRoutingEvaluationBundle,
  mode: RoutingEvaluationMode
) {
  return rawBundle.runs.filter((run) => run.mode === mode);
}

function getScoreByMode(input: {
  rawBundle: RawEvaluationBundle;
  mappingFile: SampleMappingFile;
  manualScores: ManualScoresFile;
}) {
  const runByRawId = new Map(
    input.rawBundle.runs.map((run) => [run.rawRunId, run])
  );
  const scoreBySampleId = new Map(
    input.manualScores.scores.map((score) => [score.sampleId, score])
  );

  return input.mappingFile.mappings.map((mapping) => {
    const score = scoreBySampleId.get(mapping.sampleId);
    const run = runByRawId.get(mapping.rawRunId);

    if (!score || !run) {
      throw new Error(`Unable to join manual score for sample: ${mapping.sampleId}`);
    }

    return {
      mapping,
      run,
      score
    };
  });
}

export function aggregateQualityScores(input: {
  rawBundle: RawEvaluationBundle;
  mappingFile: SampleMappingFile;
  manualScores: ManualScoresFile;
}) {
  const joinedScores = getScoreByMode(input);
  const byMode = (mode: "off" | "on") =>
    joinedScores.filter((entry) => entry.mapping.mode === mode);
  const sampleAverageByMode = (mode: "off" | "on") =>
    byMode(mode).map((entry) => averageManualScore(entry.score.scores));
  const axisSummaries = Object.fromEntries(
    manualScoreAxisNames.map((axis) => {
      const offValues = byMode("off").map((entry) => entry.score.scores[axis]);
      const onValues = byMode("on").map((entry) => entry.score.scores[axis]);

      return [
        axis,
        {
          offMean: mean(offValues),
          onMean: mean(onValues),
          delta:
            mean(onValues) !== undefined && mean(offValues) !== undefined
              ? mean(onValues)! - mean(offValues)!
              : undefined
        }
      ];
    })
  );
  const pairSummaries = pairJoinedScores(joinedScores);
  const pairedWinTieLoss = pairSummaries.reduce(
    (summary, pair) => {
      if (pair.onAverage > pair.offAverage) {
        summary.agentOnWins += 1;
      } else if (pair.onAverage < pair.offAverage) {
        summary.agentOffWins += 1;
      } else {
        summary.ties += 1;
      }

      return summary;
    },
    { agentOnWins: 0, agentOffWins: 0, ties: 0 }
  );

  return {
    modeSummary: {
      off: {
        mean: mean(sampleAverageByMode("off")),
        median: median(sampleAverageByMode("off"))
      },
      on: {
        mean: mean(sampleAverageByMode("on")),
        median: median(sampleAverageByMode("on"))
      }
    },
    axisSummaries,
    pairedWinTieLoss,
    pairSummaries
  };
}

function getRoutingScoreByMode(input: {
  rawBundle: RawRoutingEvaluationBundle;
  mappingFile: RoutingSampleMappingFile;
  manualScores: RoutingManualScoresFile;
}) {
  const runByRawId = new Map(
    input.rawBundle.runs.map((run) => [run.rawRunId, run])
  );
  const scoreBySampleId = new Map(
    input.manualScores.scores.map((score) => [score.sampleId, score])
  );

  return input.mappingFile.mappings.map((mapping) => {
    const score = scoreBySampleId.get(mapping.sampleId);
    const run = runByRawId.get(mapping.rawRunId);

    if (!score || !run) {
      throw new Error(`Unable to join routing manual score for sample: ${mapping.sampleId}`);
    }

    return {
      mapping,
      run,
      score
    };
  });
}

function getContractChecklistScoreByMode(input: {
  rawBundle: RawContractChecklistEvaluationBundle;
  mappingFile: ContractChecklistSampleMappingFile;
  manualScores: ContractChecklistManualScoresFile;
}) {
  const runByRawId = new Map(
    input.rawBundle.runs.map((run) => [run.rawRunId, run])
  );
  const scoreBySampleId = new Map(
    input.manualScores.scores.map((score) => [score.sampleId, score])
  );

  return input.mappingFile.mappings.map((mapping) => {
    const score = scoreBySampleId.get(mapping.sampleId);
    const run = runByRawId.get(mapping.rawRunId);

    if (!score || !run) {
      throw new Error(
        `Unable to join contract checklist manual score for sample: ${mapping.sampleId}`
      );
    }

    return {
      mapping,
      run,
      score
    };
  });
}

export function aggregateRoutingQualityScores(input: {
  rawBundle: RawRoutingEvaluationBundle;
  mappingFile: RoutingSampleMappingFile;
  manualScores: RoutingManualScoresFile;
}) {
  const joinedScores = getRoutingScoreByMode(input);
  const byMode = (mode: RoutingEvaluationMode) =>
    joinedScores.filter((entry) => entry.mapping.mode === mode);
  const sampleAverageByMode = (mode: RoutingEvaluationMode) =>
    byMode(mode).map((entry) => averageManualScore(entry.score.scores));
  const axisSummaries = Object.fromEntries(
    manualScoreAxisNames.map((axis) => {
      const offValues = byMode("off").map((entry) => entry.score.scores[axis]);
      const onValues = byMode("on").map((entry) => entry.score.scores[axis]);
      const routedValues = byMode("routed").map(
        (entry) => entry.score.scores[axis]
      );
      const offMean = mean(offValues);
      const onMean = mean(onValues);
      const routedMean = mean(routedValues);

      return [
        axis,
        {
          offMean,
          onMean,
          routedMean,
          routedMinusOff:
            routedMean !== undefined && offMean !== undefined
              ? routedMean - offMean
              : undefined,
          routedMinusOn:
            routedMean !== undefined && onMean !== undefined
              ? routedMean - onMean
              : undefined
        }
      ];
    })
  );
  const pairSummaries = pairRoutingJoinedScores(joinedScores);
  const routedVsOffWinTieLoss = pairSummaries.reduce(
    (summary, pair) => {
      if (pair.routedAverage > pair.offAverage) {
        summary.routedWins += 1;
      } else if (pair.routedAverage < pair.offAverage) {
        summary.offWins += 1;
      } else {
        summary.ties += 1;
      }

      return summary;
    },
    { routedWins: 0, offWins: 0, ties: 0 }
  );
  const routedVsOnWinTieLoss = pairSummaries.reduce(
    (summary, pair) => {
      if (pair.routedAverage > pair.onAverage) {
        summary.routedWins += 1;
      } else if (pair.routedAverage < pair.onAverage) {
        summary.onWins += 1;
      } else {
        summary.ties += 1;
      }

      return summary;
    },
    { routedWins: 0, onWins: 0, ties: 0 }
  );

  return {
    modeSummary: {
      off: {
        mean: mean(sampleAverageByMode("off")),
        median: median(sampleAverageByMode("off"))
      },
      on: {
        mean: mean(sampleAverageByMode("on")),
        median: median(sampleAverageByMode("on"))
      },
      routed: {
        mean: mean(sampleAverageByMode("routed")),
        median: median(sampleAverageByMode("routed"))
      }
    },
    axisSummaries,
    routedVsOffWinTieLoss,
    routedVsOnWinTieLoss,
    pairSummaries
  };
}

export function aggregateContractChecklistQualityScores(input: {
  rawBundle: RawContractChecklistEvaluationBundle;
  mappingFile: ContractChecklistSampleMappingFile;
  manualScores: ContractChecklistManualScoresFile;
}) {
  const joinedScores = getContractChecklistScoreByMode(input);
  const byMode = (mode: ContractChecklistEvaluationMode) =>
    joinedScores.filter((entry) => entry.mapping.mode === mode);
  const sampleAverageByMode = (mode: ContractChecklistEvaluationMode) =>
    byMode(mode).map((entry) => averageManualScore(entry.score.scores));
  const axisSummaries = Object.fromEntries(
    manualScoreAxisNames.map((axis) => {
      const baselineValues = byMode("baseline").map(
        (entry) => entry.score.scores[axis]
      );
      const checklistValues = byMode("checklist").map(
        (entry) => entry.score.scores[axis]
      );
      const baselineMean = mean(baselineValues);
      const checklistMean = mean(checklistValues);

      return [
        axis,
        {
          baselineMean,
          checklistMean,
          checklistMinusBaseline:
            checklistMean !== undefined && baselineMean !== undefined
              ? checklistMean - baselineMean
              : undefined
        }
      ];
    })
  );
  const pairSummaries = pairContractChecklistJoinedScores(joinedScores);
  const pairedWinTieLoss = pairSummaries.reduce(
    (summary, pair) => {
      if (pair.checklistAverage > pair.baselineAverage) {
        summary.checklistWins += 1;
      } else if (pair.checklistAverage < pair.baselineAverage) {
        summary.baselineWins += 1;
      } else {
        summary.ties += 1;
      }

      return summary;
    },
    { checklistWins: 0, baselineWins: 0, ties: 0 }
  );

  return {
    modeSummary: {
      baseline: {
        mean: mean(sampleAverageByMode("baseline")),
        median: median(sampleAverageByMode("baseline"))
      },
      checklist: {
        mean: mean(sampleAverageByMode("checklist")),
        median: median(sampleAverageByMode("checklist"))
      }
    },
    axisSummaries,
    pairedWinTieLoss,
    pairSummaries
  };
}

function pairJoinedScores(
  joinedScores: ReturnType<typeof getScoreByMode>
): Array<{
  pairId: string;
  caseId: string;
  runIndex: number;
  offAverage: number;
  onAverage: number;
  delta: number;
}> {
  const grouped = new Map<string, typeof joinedScores>();

  for (const entry of joinedScores) {
    const key = `${entry.mapping.caseId}:${entry.mapping.runIndex}`;
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }

  return [...grouped.values()].map((entries) => {
    const offEntry = entries.find((entry) => entry.mapping.mode === "off");
    const onEntry = entries.find((entry) => entry.mapping.mode === "on");

    if (!offEntry || !onEntry) {
      throw new Error("Manual scores must include both OFF and ON for each pair.");
    }

    const offAverage = averageManualScore(offEntry.score.scores);
    const onAverage = averageManualScore(onEntry.score.scores);

    return {
      pairId: offEntry.mapping.pairId,
      caseId: offEntry.mapping.caseId,
      runIndex: offEntry.mapping.runIndex,
      offAverage,
      onAverage,
      delta: onAverage - offAverage
    };
  });
}

function pairRoutingJoinedScores(
  joinedScores: ReturnType<typeof getRoutingScoreByMode>
): Array<{
  pairId: string;
  caseId: string;
  runIndex: number;
  offAverage: number;
  onAverage: number;
  routedAverage: number;
  routedMinusOff: number;
  routedMinusOn: number;
}> {
  const grouped = new Map<string, typeof joinedScores>();

  for (const entry of joinedScores) {
    const key = `${entry.mapping.caseId}:${entry.mapping.runIndex}`;
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }

  return [...grouped.values()].map((entries) => {
    const offEntry = entries.find((entry) => entry.mapping.mode === "off");
    const onEntry = entries.find((entry) => entry.mapping.mode === "on");
    const routedEntry = entries.find((entry) => entry.mapping.mode === "routed");

    if (!offEntry || !onEntry || !routedEntry) {
      throw new Error(
        "Routing manual scores must include OFF, ON, and routed for each pair."
      );
    }

    const offAverage = averageManualScore(offEntry.score.scores);
    const onAverage = averageManualScore(onEntry.score.scores);
    const routedAverage = averageManualScore(routedEntry.score.scores);

    return {
      pairId: offEntry.mapping.pairId,
      caseId: offEntry.mapping.caseId,
      runIndex: offEntry.mapping.runIndex,
      offAverage,
      onAverage,
      routedAverage,
      routedMinusOff: routedAverage - offAverage,
      routedMinusOn: routedAverage - onAverage
    };
  });
}

function pairContractChecklistJoinedScores(
  joinedScores: ReturnType<typeof getContractChecklistScoreByMode>
): Array<{
  pairId: string;
  caseId: string;
  runIndex: number;
  baselineAverage: number;
  checklistAverage: number;
  delta: number;
}> {
  const grouped = new Map<string, typeof joinedScores>();

  for (const entry of joinedScores) {
    const key = `${entry.mapping.caseId}:${entry.mapping.runIndex}`;
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }

  return [...grouped.values()].map((entries) => {
    const baselineEntry = entries.find(
      (entry) => entry.mapping.mode === "baseline"
    );
    const checklistEntry = entries.find(
      (entry) => entry.mapping.mode === "checklist"
    );

    if (!baselineEntry || !checklistEntry) {
      throw new Error(
        "Contract checklist manual scores must include baseline and checklist for each pair."
      );
    }

    const baselineAverage = averageManualScore(baselineEntry.score.scores);
    const checklistAverage = averageManualScore(checklistEntry.score.scores);

    return {
      pairId: baselineEntry.mapping.pairId,
      caseId: baselineEntry.mapping.caseId,
      runIndex: baselineEntry.mapping.runIndex,
      baselineAverage,
      checklistAverage,
      delta: checklistAverage - baselineAverage
    };
  });
}

export function aggregateAgentMetrics(rawBundle: RawEvaluationBundle) {
  const onRuns = modeRuns(rawBundle, "on");
  const completedOnRuns = onRuns.filter((run) =>
    ["completed", "completed_with_findings"].includes(run.status)
  );
  const reviewHistory = onRuns.flatMap((run) => run.agent?.reviewHistory ?? []);
  const allFindings = reviewHistory.flatMap((entry) => entry.review.findings);
  const firstReviewPassCount = onRuns.filter(
    (run) =>
      run.agent?.metadata.reviewCount === 1 &&
      run.agent.metadata.terminationReason === "review_passed"
  ).length;
  const revisionInvocationCount = onRuns.filter(
    (run) => (run.agent?.metadata.revisionCount ?? 0) > 0
  ).length;
  const revisionLimitReachedCount = onRuns.filter(
    (run) =>
      run.agent?.metadata.terminationReason === "revision_limit_reached"
  ).length;
  const knowledgeInvocationCounts = onRuns.map(
    (run) => run.agent?.metadata.toolInvocationCount ?? 0
  );

  return {
    workflowCompletionRate:
      onRuns.length > 0 ? completedOnRuns.length / onRuns.length : undefined,
    firstReviewPassRate:
      onRuns.length > 0 ? firstReviewPassCount / onRuns.length : undefined,
    revisionInvocationRate:
      onRuns.length > 0 ? revisionInvocationCount / onRuns.length : undefined,
    revisionLimitReachedRate:
      onRuns.length > 0 ? revisionLimitReachedCount / onRuns.length : undefined,
    averageLlmStepCount: mean(
      onRuns
        .map((run) => run.agent?.metadata.llmStepCount)
        .filter((count): count is number => count !== undefined)
    ),
    knowledgeToolInvocationCountDistribution: Object.fromEntries(
      [...new Set(knowledgeInvocationCounts)].map((count) => [
        String(count),
        knowledgeInvocationCounts.filter((value) => value === count).length
      ])
    ),
    traceCompletenessRate:
      onRuns.length > 0
        ? onRuns.filter((run) => isAgentTraceComplete(run)).length / onRuns.length
        : undefined,
    findingSeverityCounts: countBy(allFindings.map((finding) => finding.severity)),
    findingCategoryCounts: countBy(allFindings.map((finding) => finding.category)),
    minorOnlyReviewCount: reviewHistory.filter(
      (entry) =>
        entry.review.findings.length > 0 &&
        entry.review.findings.every((finding) => finding.severity === "minor")
    ).length
  };
}

function isAgentTraceComplete(run: RawEvaluationRun): boolean {
  const metadata = run.agent?.metadata;

  if (!metadata) {
    return false;
  }

  const stepNames = metadata.steps.map((step) => step.stepName);
  return (
    stepNames.includes("planning") &&
    stepNames.includes("knowledge_retrieval") &&
    stepNames.includes("draft_generation") &&
    stepNames.includes("review") &&
    stepNames.includes("finalization") &&
    metadata.status === run.status
  );
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function sourceSignature(run: RawEvaluationRun, field: "documentId" | "chunkId") {
  const sources =
    run.mode === "on"
      ? (run.agent?.retrieval?.sources ?? [])
      : (run.rag?.mode === "on" ? run.rag.sources : []);

  return sources
    .map((source) => {
      const value = source[field];
      return typeof value === "string" ? value : "";
    })
    .filter(Boolean)
    .join("|");
}

export function aggregateRetrievalParity(rawBundle: RawEvaluationBundle) {
  const pairs = new Map<string, RawEvaluationRun[]>();

  for (const run of rawBundle.runs) {
    const key = `${run.caseId}:${run.runIndex}`;
    pairs.set(key, [...(pairs.get(key) ?? []), run]);
  }

  const pairResults = [...pairs.values()].map((runs) => {
    const offRun = runs.find((run) => run.mode === "off");
    const onRun = runs.find((run) => run.mode === "on");

    if (!offRun || !onRun) {
      throw new Error("Retrieval parity requires OFF and ON run pairs.");
    }

    return {
      pairId: offRun.pairId,
      caseId: offRun.caseId,
      runIndex: offRun.runIndex,
      sameDocumentSequence:
        sourceSignature(offRun, "documentId") === sourceSignature(onRun, "documentId"),
      sameChunkSequence:
        sourceSignature(offRun, "chunkId") === sourceSignature(onRun, "chunkId"),
      offContextPolicy:
        offRun.rag?.mode === "on" ? offRun.rag.contextPolicy : undefined,
      onContextPolicy:
        onRun.rag?.mode === "on" ? onRun.rag.contextPolicy : undefined
    };
  });

  return {
    pairResults,
    exactChunkParityRate:
      pairResults.filter((pair) => pair.sameChunkSequence).length /
      pairResults.length,
    exactDocumentParityRate:
      pairResults.filter((pair) => pair.sameDocumentSequence).length /
      pairResults.length
  };
}

export function aggregateLatencyAndUsage(rawBundle: RawEvaluationBundle) {
  const summarizeMode = (mode: "off" | "on") => {
    const runs = modeRuns(rawBundle, mode);

    return {
      evaluationElapsedMs: {
        mean: mean(runs.map((run) => run.evaluationElapsedMs)),
        median: median(runs.map((run) => run.evaluationElapsedMs))
      },
      inputTokens: {
        mean: mean(
          runs
            .map((run) => run.usage?.inputTokens)
            .filter((value): value is number => value !== undefined)
        )
      },
      outputTokens: {
        mean: mean(
          runs
            .map((run) => run.usage?.outputTokens)
            .filter((value): value is number => value !== undefined)
        )
      },
      totalTokens: {
        mean: mean(
          runs
            .map((run) => run.usage?.totalTokens)
            .filter((value): value is number => value !== undefined)
        )
      },
      retrievalLatencyMs: {
        mean: mean(
          runs
            .map((run) =>
              run.rag?.mode === "on" ? run.rag.retrievalLatencyMs : undefined
            )
            .filter((value): value is number => value !== undefined)
        )
      }
    };
  };

  return {
    off: summarizeMode("off"),
    on: summarizeMode("on")
  };
}

export function aggregateRoutingDecisionMetrics(
  rawBundle: RawRoutingEvaluationBundle
) {
  const routedRuns = routingModeRuns(rawBundle, "routed");
  const agentWorkflowRuns = routedRuns.filter(
    (run) => run.routedExecutionMode === "agent_workflow"
  );
  const singlePassRuns = routedRuns.filter(
    (run) => run.routedExecutionMode === "single_pass"
  );
  const reasonCounts = countBy(
    routedRuns.flatMap((run) => run.routing?.reasons ?? [])
  );
  const decisionModeCounts = countBy(
    routedRuns.map((run) => run.routing?.mode ?? "missing")
  );

  return {
    routedRunCount: routedRuns.length,
    agentInvocationRate:
      routedRuns.length > 0 ? agentWorkflowRuns.length / routedRuns.length : undefined,
    avoidedAgentRate:
      routedRuns.length > 0 ? singlePassRuns.length / routedRuns.length : undefined,
    decisionModeCounts,
    routedExecutionModeCounts: {
      agent_workflow: agentWorkflowRuns.length,
      single_pass: singlePassRuns.length
    },
    reasonCounts
  };
}

export function aggregateRoutingLatencyAndUsage(
  rawBundle: RawRoutingEvaluationBundle
) {
  const summarizeMode = (mode: RoutingEvaluationMode) => {
    const runs = routingModeRuns(rawBundle, mode);

    return {
      evaluationElapsedMs: {
        mean: mean(runs.map((run) => run.evaluationElapsedMs)),
        median: median(runs.map((run) => run.evaluationElapsedMs))
      },
      inputTokens: {
        mean: mean(
          runs
            .map((run) => run.usage?.inputTokens)
            .filter((value): value is number => value !== undefined)
        )
      },
      outputTokens: {
        mean: mean(
          runs
            .map((run) => run.usage?.outputTokens)
            .filter((value): value is number => value !== undefined)
        )
      },
      totalTokens: {
        mean: mean(
          runs
            .map((run) => run.usage?.totalTokens)
            .filter((value): value is number => value !== undefined)
        )
      },
      retrievalLatencyMs: {
        mean: mean(
          runs
            .map((run) =>
              run.rag?.mode === "on" ? run.rag.retrievalLatencyMs : undefined
            )
            .filter((value): value is number => value !== undefined)
        )
      }
    };
  };
  const off = summarizeMode("off");
  const on = summarizeMode("on");
  const routed = summarizeMode("routed");
  const routedVsAlwaysOnElapsedRatio =
    routed.evaluationElapsedMs.mean !== undefined &&
    on.evaluationElapsedMs.mean !== undefined &&
    on.evaluationElapsedMs.mean > 0
      ? routed.evaluationElapsedMs.mean / on.evaluationElapsedMs.mean
      : undefined;
  const routedVsAlwaysOnTokenRatio =
    routed.totalTokens.mean !== undefined &&
    on.totalTokens.mean !== undefined &&
    on.totalTokens.mean > 0
      ? routed.totalTokens.mean / on.totalTokens.mean
      : undefined;

  return {
    off,
    on,
    routed,
    routedVsAlwaysOnElapsedRatio,
    routedVsAlwaysOnTokenRatio
  };
}

export function aggregateContractChecklistLatencyAndUsage(
  rawBundle: RawContractChecklistEvaluationBundle
) {
  const summarizeMode = (mode: ContractChecklistEvaluationMode) => {
    const runs = rawBundle.runs.filter((run) => run.mode === mode);

    return {
      evaluationElapsedMs: {
        mean: mean(runs.map((run) => run.evaluationElapsedMs)),
        median: median(runs.map((run) => run.evaluationElapsedMs))
      },
      inputTokens: {
        mean: mean(
          runs
            .map((run) => run.usage?.inputTokens)
            .filter((value): value is number => value !== undefined)
        )
      },
      outputTokens: {
        mean: mean(
          runs
            .map((run) => run.usage?.outputTokens)
            .filter((value): value is number => value !== undefined)
        )
      },
      totalTokens: {
        mean: mean(
          runs
            .map((run) => run.usage?.totalTokens)
            .filter((value): value is number => value !== undefined)
        )
      },
      retrievalLatencyMs: {
        mean: mean(
          runs
            .map((run) =>
              run.rag?.mode === "on" ? run.rag.retrievalLatencyMs : undefined
            )
            .filter((value): value is number => value !== undefined)
        )
      }
    };
  };
  const baseline = summarizeMode("baseline");
  const checklist = summarizeMode("checklist");
  const checklistVsBaselineElapsedRatio =
    checklist.evaluationElapsedMs.mean !== undefined &&
    baseline.evaluationElapsedMs.mean !== undefined &&
    baseline.evaluationElapsedMs.mean > 0
      ? checklist.evaluationElapsedMs.mean / baseline.evaluationElapsedMs.mean
      : undefined;
  const checklistVsBaselineTokenRatio =
    checklist.totalTokens.mean !== undefined &&
    baseline.totalTokens.mean !== undefined &&
    baseline.totalTokens.mean > 0
      ? checklist.totalTokens.mean / baseline.totalTokens.mean
      : undefined;

  return {
    baseline,
    checklist,
    checklistVsBaselineElapsedRatio,
    checklistVsBaselineTokenRatio
  };
}

export function createRevisionPairs(rawBundle: RawEvaluationBundle) {
  const revisionRuns = rawBundle.runs.filter(
    (run) => run.mode === "on" && (run.agent?.metadata.revisionCount ?? 0) > 0
  );

  return {
    evaluationId: "agent-phase-1-e",
    createdAt: new Date().toISOString(),
    revisionPairCount: revisionRuns.length,
    note:
      revisionRuns.length === 0
        ? "No revision pairs were observable in this run bundle."
        : "Pairs contain initialDraft and finalOutput for revision analysis.",
    pairs: revisionRuns.map((run, index) => ({
      revisionPairId: `REVPAIR-${String(index + 1).padStart(3, "0")}`,
      rawRunId: run.rawRunId,
      caseId: run.caseId,
      caseTitle: run.caseTitle,
      runIndex: run.runIndex,
      reviewHistory: run.agent?.reviewHistory ?? [],
      initialDraft: run.agent?.initialDraft,
      revisedOutput: run.agent?.revisedOutput,
      finalOutput: run.finalOutput
    }))
  };
}

export function createEvaluationSummary(input: {
  rawBundle: RawEvaluationBundle;
  blindBundle: BlindEvaluationBundle;
  mappingFile: SampleMappingFile;
  manualScores: ManualScoresFile;
}) {
  const validatedScores = validateManualScores(
    input.manualScores,
    input.blindBundle
  );
  const quality = aggregateQualityScores({
    rawBundle: input.rawBundle,
    mappingFile: input.mappingFile,
    manualScores: validatedScores
  });

  return {
    evaluationId: "agent-phase-1-e",
    createdAt: new Date().toISOString(),
    scoringMethod: validatedScores.scoringMethod,
    runMatrix: input.rawBundle.runMatrix,
    quality,
    agentMetrics: aggregateAgentMetrics(input.rawBundle),
    retrievalParity: aggregateRetrievalParity(input.rawBundle),
    latencyAndUsage: aggregateLatencyAndUsage(input.rawBundle)
  };
}

export function createRoutingEvaluationSummary(input: {
  rawBundle: RawRoutingEvaluationBundle;
  blindBundle: BlindRoutingEvaluationBundle;
  mappingFile: RoutingSampleMappingFile;
  manualScores: RoutingManualScoresFile;
}) {
  const validatedScores = validateRoutingManualScores(
    input.manualScores,
    input.blindBundle
  );
  const quality = aggregateRoutingQualityScores({
    rawBundle: input.rawBundle,
    mappingFile: input.mappingFile,
    manualScores: validatedScores
  });

  return {
    evaluationId: input.rawBundle.evaluationId,
    createdAt: new Date().toISOString(),
    scoringMethod: validatedScores.scoringMethod,
    runMatrix: input.rawBundle.runMatrix,
    quality,
    routingMetrics: aggregateRoutingDecisionMetrics(input.rawBundle),
    latencyAndUsage: aggregateRoutingLatencyAndUsage(input.rawBundle)
  };
}

export function createContractChecklistEvaluationSummary(input: {
  rawBundle: RawContractChecklistEvaluationBundle;
  blindBundle: BlindContractChecklistEvaluationBundle;
  mappingFile: ContractChecklistSampleMappingFile;
  manualScores: ContractChecklistManualScoresFile;
}) {
  const validatedScores = validateContractChecklistManualScores(
    input.manualScores,
    input.blindBundle
  );
  const quality = aggregateContractChecklistQualityScores({
    rawBundle: input.rawBundle,
    mappingFile: input.mappingFile,
    manualScores: validatedScores
  });

  return {
    evaluationId: input.rawBundle.evaluationId,
    createdAt: new Date().toISOString(),
    scoringMethod: validatedScores.scoringMethod,
    runMatrix: input.rawBundle.runMatrix,
    quality,
    latencyAndUsage: aggregateContractChecklistLatencyAndUsage(input.rawBundle)
  };
}

export function createEvaluationReportMarkdown(summary: ReturnType<typeof createEvaluationSummary>) {
  return [
    "# Agent PoC Phase 1-E Evaluation Report",
    "",
    "This report was generated from the raw evaluation bundle, blind sample mapping, and blind manual scores.",
    "",
    "## Quality Summary",
    "",
    `- Agent OFF mean: ${formatOptionalNumber(summary.quality.modeSummary.off.mean)}`,
    `- Agent ON mean: ${formatOptionalNumber(summary.quality.modeSummary.on.mean)}`,
    `- Agent ON wins: ${summary.quality.pairedWinTieLoss.agentOnWins}`,
    `- Agent OFF wins: ${summary.quality.pairedWinTieLoss.agentOffWins}`,
    `- Ties: ${summary.quality.pairedWinTieLoss.ties}`,
    "",
    "## Agent Metrics",
    "",
    `- Workflow completion rate: ${formatOptionalNumber(summary.agentMetrics.workflowCompletionRate)}`,
    `- First review pass rate: ${formatOptionalNumber(summary.agentMetrics.firstReviewPassRate)}`,
    `- Revision invocation rate: ${formatOptionalNumber(summary.agentMetrics.revisionInvocationRate)}`,
    `- Revision limit reached rate: ${formatOptionalNumber(summary.agentMetrics.revisionLimitReachedRate)}`,
    `- Average LLM step count: ${formatOptionalNumber(summary.agentMetrics.averageLlmStepCount)}`,
    "",
    "## Retrieval Parity",
    "",
    `- Exact chunk parity rate: ${formatOptionalNumber(summary.retrievalParity.exactChunkParityRate)}`,
    `- Exact document parity rate: ${formatOptionalNumber(summary.retrievalParity.exactDocumentParityRate)}`,
    "",
    "## Scope Note",
    "",
    "These results apply only to the Phase 1-E dataset, current prompt/schema, current local environment, and manually scored blind samples."
  ].join("\n");
}

export function createContractChecklistEvaluationReportMarkdown(
  summary: ReturnType<typeof createContractChecklistEvaluationSummary>
) {
  return [
    `# Agent PoC Contract Checklist Target Evaluation Report (${summary.evaluationId})`,
    "",
    "This report was generated from the contract-detail target raw bundle, blind sample mapping, and blind manual scores.",
    "",
    "## Quality Summary",
    "",
    `- Baseline mean: ${formatOptionalNumber(summary.quality.modeSummary.baseline.mean)}`,
    `- Checklist mean: ${formatOptionalNumber(summary.quality.modeSummary.checklist.mean)}`,
    `- Checklist wins: ${summary.quality.pairedWinTieLoss.checklistWins}`,
    `- Baseline wins: ${summary.quality.pairedWinTieLoss.baselineWins}`,
    `- Ties: ${summary.quality.pairedWinTieLoss.ties}`,
    "",
    "## Axis Deltas",
    "",
    ...manualScoreAxisNames.map((axis) => {
      const axisSummary = summary.quality.axisSummaries[axis];
      return `- ${axis}: baseline=${formatOptionalNumber(axisSummary.baselineMean)} checklist=${formatOptionalNumber(axisSummary.checklistMean)} delta=${formatOptionalNumber(axisSummary.checklistMinusBaseline)}`;
    }),
    "",
    "## Cost",
    "",
    `- Checklist / baseline elapsed ratio: ${formatOptionalNumber(summary.latencyAndUsage.checklistVsBaselineElapsedRatio)}`,
    `- Checklist / baseline token ratio: ${formatOptionalNumber(summary.latencyAndUsage.checklistVsBaselineTokenRatio)}`,
    "",
    "## Scope Note",
    "",
    "These results apply only to the Phase 2-E low-risk contract-detail target dataset, current prompt/schema, current local environment, and blind scored samples."
  ].join("\n");
}

export function createRoutingEvaluationReportMarkdown(
  summary: ReturnType<typeof createRoutingEvaluationSummary>
) {
  return [
    `# Agent PoC Routing Evaluation Report (${summary.evaluationId})`,
    "",
    "This report was generated from the routing raw evaluation bundle, blind sample mapping, and blind manual scores.",
    "",
    "## Quality Summary",
    "",
    `- Always OFF mean: ${formatOptionalNumber(summary.quality.modeSummary.off.mean)}`,
    `- Always ON mean: ${formatOptionalNumber(summary.quality.modeSummary.on.mean)}`,
    `- Routed mean: ${formatOptionalNumber(summary.quality.modeSummary.routed.mean)}`,
    `- Routed vs OFF wins: ${summary.quality.routedVsOffWinTieLoss.routedWins}`,
    `- OFF vs routed wins: ${summary.quality.routedVsOffWinTieLoss.offWins}`,
    `- Routed vs OFF ties: ${summary.quality.routedVsOffWinTieLoss.ties}`,
    `- Routed vs ON wins: ${summary.quality.routedVsOnWinTieLoss.routedWins}`,
    `- ON vs routed wins: ${summary.quality.routedVsOnWinTieLoss.onWins}`,
    `- Routed vs ON ties: ${summary.quality.routedVsOnWinTieLoss.ties}`,
    "",
    "## Routing Metrics",
    "",
    `- Agent invocation rate: ${formatOptionalNumber(summary.routingMetrics.agentInvocationRate)}`,
    `- Avoided Agent rate: ${formatOptionalNumber(summary.routingMetrics.avoidedAgentRate)}`,
    `- Routed execution counts: ${JSON.stringify(summary.routingMetrics.routedExecutionModeCounts)}`,
    "",
    "## Cost",
    "",
    `- Routed / Always ON elapsed ratio: ${formatOptionalNumber(summary.latencyAndUsage.routedVsAlwaysOnElapsedRatio)}`,
    `- Routed / Always ON token ratio: ${formatOptionalNumber(summary.latencyAndUsage.routedVsAlwaysOnTokenRatio)}`,
    "",
    "## Scope Note",
    "",
    "These results apply only to the selected routing dataset, current prompt/schema, current local environment, and manually scored blind samples."
  ].join("\n");
}

function formatOptionalNumber(value: number | undefined) {
  return value === undefined ? "N/A" : Number(value.toFixed(3)).toString();
}
