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
import { createAgentRoutingDecision } from "./routing";
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
  scoringMethod: z.literal("blind-manual"),
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

export type AgentEvaluationCase = z.infer<typeof agentEvaluationCaseSchema>;
export type PlannedEvaluationRun = z.infer<typeof plannedEvaluationRunSchema>;
export type RawEvaluationRun = z.infer<typeof rawEvaluationRunSchema>;
export type RawEvaluationBundle = z.infer<typeof rawEvaluationBundleSchema>;
export type BlindEvaluationBundle = z.infer<typeof blindEvaluationBundleSchema>;
export type SampleMappingFile = z.infer<typeof sampleMappingFileSchema>;
export type ManualScoresFile = z.infer<typeof manualScoresFileSchema>;
export type ManualQualityScore = z.infer<typeof manualQualityScoreSchema>;

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
  request: ReturnType<typeof buildAgentOnRequest>;
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

function requireCompletedOutput(run: RawEvaluationRun): GenerationOutput {
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
      samples
    }),
    mappingFile: sampleMappingFileSchema.parse({
      evaluationId: "agent-phase-1-e",
      createdAt,
      mappings
    })
  };
}

export function assertBlindBundleHasNoModeLeak(
  blindBundle: BlindEvaluationBundle
) {
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

export function createManualScoreTemplate(
  blindBundle: BlindEvaluationBundle
): string {
  return [
    "# Phase 1-E Blind Manual Score Template",
    "",
    "Score each axis as an integer from 1 to 5. Do not add mode guesses.",
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

function averageManualScore(scores: ManualQualityScore): number {
  return (
    manualScoreAxisNames.reduce((sum, axis) => sum + scores[axis], 0) /
    manualScoreAxisNames.length
  );
}

function modeRuns(rawBundle: RawEvaluationBundle, mode: "off" | "on") {
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
    scoringMethod: "blind-manual",
    runMatrix: input.rawBundle.runMatrix,
    quality,
    agentMetrics: aggregateAgentMetrics(input.rawBundle),
    retrievalParity: aggregateRetrievalParity(input.rawBundle),
    latencyAndUsage: aggregateLatencyAndUsage(input.rawBundle)
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

function formatOptionalNumber(value: number | undefined) {
  return value === undefined ? "N/A" : Number(value.toFixed(3)).toString();
}
