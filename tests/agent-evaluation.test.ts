import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generationOutputJsonSchema } from "@/lib/schema";
import {
  exportAgentBlindEvaluationPackage,
  importAgentBlindEvaluationScores
} from "@/lib/agent/blind-evaluation-package";
import {
  aggregateAgentMetrics,
  aggregateLatencyAndUsage,
  aggregateQualityScores,
  aggregateRetrievalParity,
  aggregateRoutingDecisionMetrics,
  aggregateRoutingLatencyAndUsage,
  aggregateRoutingQualityScores,
  assertBlindBundleHasNoModeLeak,
  assertNoEvaluationRubricLeak,
  assertRoutingEvaluationBundleIsScorable,
  buildAgentEvaluationRunPlan,
  buildAgentOffRequest,
  buildAgentOnRequest,
  buildAgentRoutingCandidateDecisionForEvaluation,
  buildAgentRoutingContractDecisionForEvaluation,
  buildAgentRoutingDecisionForEvaluation,
  buildAgentRoutingEvaluationRunPlan,
  buildAgentRoutedRequest,
  createBlindBundleAndMapping,
  createBlindRoutingBundleAndMapping,
  createEvaluationSummary,
  createManualScoreTemplate,
  createRoutingEvaluationSummary,
  createRevisionPairs,
  executeAgentEvaluationRunPlan,
  executeAgentRoutingEvaluationRunPlan,
  loadAgentEvaluationCases,
  manualScoresFileSchema,
  routingManualScoresFileSchema,
  validateAgentEvaluationCases,
  validateManualScores,
  validateRoutingManualScores,
  type AgentEvaluationCase,
  type ManualScoresFile,
  type RawEvaluationRun,
  type RoutingManualScoresFile
} from "@/lib/agent/evaluation";
import type { GenerationOutput, RagMetadata } from "@/lib/schema";

const fixedCreatedAt = "2026-07-07T00:00:00.000Z";

function sampleOutput(label = "sample"): GenerationOutput {
  return {
    summary: `${label} summary`,
    spec: [`${label} spec`],
    acceptanceCriteria: [`${label} acceptance criteria`],
    jiraTasks: [
      {
        title: `${label} task`,
        description: `${label} task description`,
        type: "backend"
      }
    ],
    implementationPlan: [`${label} implementation plan`],
    reviewPoints: [`${label} review point`],
    risks: [`${label} risk`]
  };
}

function ragMetadata(documentIds: string[]): Extract<RagMetadata, { mode: "on" }> {
  return {
    mode: "on",
    strategy: "heading-aware-v1",
    topK: 5,
    embeddingModel: "text-embedding-3-small",
    retrievalLatencyMs: 10,
    contextPolicy: "document-diversity-v1",
    candidateTopK: 10,
    candidateChunkCount: 5,
    candidateUniqueDocumentCount: documentIds.length,
    candidateDocumentChunkCounts: Object.fromEntries(
      documentIds.map((documentId) => [documentId, 1])
    ),
    requestedFinalTopK: 5,
    maxChunksPerDocument: 2,
    selectedChunkCount: documentIds.length,
    uniqueDocumentCount: documentIds.length,
    maximumChunksFromSameDocument: 1,
    documentChunkCounts: Object.fromEntries(
      documentIds.map((documentId) => [documentId, 1])
    ),
    sources: documentIds.map((documentId, index) => ({
      sourceId: `S${index + 1}`,
      rank: index + 1,
      contextRank: index + 1,
      retrievalRank: index + 1,
      score: 0.9 - index * 0.01,
      chunkId: `${documentId}:heading-aware-v1:000${index}`,
      documentId,
      documentTitle: documentId,
      headingPath: ["root"],
      sourcePath: `data/rag/knowledge/${documentId}.md`,
      content: `${documentId} content`
    })),
    embeddingUsage: {
      promptTokens: 10,
      totalTokens: 10
    }
  };
}

function onAgent(runIndex: number, revisionCount = 0) {
  const status =
    revisionCount > 0
      ? ("completed_with_findings" as const)
      : ("completed" as const);
  const stepNames =
    revisionCount > 0
      ? ([
          "planning",
          "knowledge_retrieval",
          "draft_generation",
          "review",
          "revision",
          "review",
          "finalization"
        ] as const)
      : ([
          "planning",
          "knowledge_retrieval",
          "draft_generation",
          "review",
          "finalization"
        ] as const);
  const reviewHistory = [
    {
      reviewNumber: 1,
      stage: "draft" as const,
      decision: revisionCount > 0 ? ("revise" as const) : ("pass" as const),
      review: {
        summary: "review",
        findings:
          revisionCount > 0
            ? [
                {
                  findingId: "F1",
                  category: "requirement_coverage" as const,
                  severity: "major" as const,
                  targetFields: ["acceptanceCriteria" as const],
                  message: "missing source-backed condition",
                  requiredChange: "add source-backed condition",
                  sourceIds: ["S1"]
                }
              ]
            : []
      }
    }
  ];

  return {
    metadata: {
      agentVersion: "agent-poc-runtime-v1",
      status,
      finalState: status,
      maxRevisionCount: 1,
      revisionCount,
      reviewCount: revisionCount > 0 ? 2 : 1,
      terminationReason:
        revisionCount > 0 ? ("revision_limit_reached" as const) : ("review_passed" as const),
      totalAgentLatencyMs: 100 + runIndex,
      llmStepCount: revisionCount > 0 ? 5 : 3,
      toolInvocationCount: 1,
      steps: stepNames.map((stepName, index) => ({
        stepId: `${stepName}-${index}`,
        stepName,
        sequence: index + 1,
        startedAt: fixedCreatedAt,
        completedAt: fixedCreatedAt,
        latencyMs: 1,
        status: "completed" as const,
        provider: stepName === "knowledge_retrieval" || stepName === "finalization" ? undefined : "openai",
        modelName:
          stepName === "knowledge_retrieval" || stepName === "finalization"
            ? undefined
            : "gpt-5.4-mini",
        promptVersion:
          stepName === "knowledge_retrieval" || stepName === "finalization"
            ? undefined
            : `agent-${stepName}-v1`,
        providerBacked:
          stepName === "knowledge_retrieval" || stepName === "finalization"
            ? undefined
            : true,
        inputTokens:
          stepName === "knowledge_retrieval" || stepName === "finalization"
            ? undefined
            : 10,
        outputTokens:
          stepName === "knowledge_retrieval" || stepName === "finalization"
            ? undefined
            : 20,
        totalTokens:
          stepName === "knowledge_retrieval" || stepName === "finalization"
            ? undefined
            : 30
      }))
    },
    reviewHistory,
    retrieval: {
      retrievalMetadata: ragMetadata(["profile-image-spec", "profile-api"]),
      embeddingUsage: {
        promptTokens: 10,
        totalTokens: 10
      },
      sources: [
        {
          sourceId: "S1",
          documentId: "profile-image-spec",
          chunkId: "profile-image-spec:heading-aware-v1:0001"
        },
        {
          sourceId: "S2",
          documentId: "profile-api",
          chunkId: "profile-api:heading-aware-v1:0001"
        }
      ]
    },
    initialDraft: sampleOutput("initial"),
    revisedOutput: revisionCount > 0 ? sampleOutput("revised") : undefined
  };
}

function completeManualScores(sampleIds: string[], onWins = true): ManualScoresFile {
  return manualScoresFileSchema.parse({
    evaluationId: "agent-phase-1-e",
    scoringMethod: "blind-manual",
    scores: sampleIds.map((sampleId, index) => ({
      sampleId,
      scores: {
        productSpecificRuleCoverage: onWins && index % 2 === 0 ? 5 : 4,
        unsupportedAssumptionControl: 4,
        acceptanceCriteriaSpecificity: 4,
        jiraDecompositionAppropriateness: 4,
        jsonStructureStability: 5,
        crossFieldConsistency: 4,
        requirementToTaskTraceability: 4
      }
    }))
  });
}

function completeRoutingManualScores(
  sampleIds: string[],
  evaluationId:
    | "agent-phase-2-a-routing"
    | "agent-phase-2-b-routing-v2"
    | "agent-phase-2-d-contract-checklist" = "agent-phase-2-a-routing",
  scoringMethod:
    | "blind-manual"
    | "context-isolated-blind-llm"
    | "secondary-blind-llm-check" = "blind-manual"
): RoutingManualScoresFile {
  return routingManualScoresFileSchema.parse({
    evaluationId,
    scoringMethod,
    scores: sampleIds.map((sampleId, index) => ({
      sampleId,
      scores: {
        productSpecificRuleCoverage: index % 3 === 0 ? 5 : 4,
        unsupportedAssumptionControl: 4,
        acceptanceCriteriaSpecificity: 4,
        jiraDecompositionAppropriateness: 4,
        jsonStructureStability: 5,
        crossFieldConsistency: index % 2 === 0 ? 5 : 4,
        requirementToTaskTraceability: 4
      },
      notes: `routing note ${sampleId}`
    }))
  });
}

describe("Agent Phase 1-E evaluation dataset and matrix", () => {
  it("loads the six public evaluation cases and rejects duplicates", async () => {
    const cases = await loadAgentEvaluationCases();

    expect(cases.map((testCase) => testCase.caseId)).toEqual([
      "AGENT-001",
      "AGENT-002",
      "AGENT-003",
      "AGENT-004",
      "AGENT-005",
      "AGENT-006"
    ]);
    expect(() =>
      validateAgentEvaluationCases([
        ...cases.slice(0, 5),
        { ...cases[0], title: "duplicate" }
      ])
    ).toThrow("duplicate");
  });

  it("creates the 16-run paired matrix with deterministic alternating order", async () => {
    const cases = await loadAgentEvaluationCases();
    const plan = buildAgentEvaluationRunPlan(cases);

    expect(plan).toHaveLength(16);
    expect(plan.filter((run) => run.mode === "off")).toHaveLength(8);
    expect(plan.filter((run) => run.mode === "on")).toHaveLength(8);
    expect(plan.slice(0, 4).map((run) => run.mode)).toEqual([
      "off",
      "on",
      "on",
      "off"
    ]);
    expect(plan.filter((run) => run.caseId === "AGENT-001" && run.mode === "off")).toHaveLength(3);
    expect(plan.filter((run) => run.caseId === "AGENT-001" && run.mode === "on")).toHaveLength(3);
    expect(plan.filter((run) => run.caseId === "AGENT-006")).toHaveLength(2);
    expect(plan.map((run) => run.executionOrder)).toEqual(
      Array.from({ length: 16 }, (_, index) => index + 1)
    );
  });

  it("builds OFF and ON requests without leaking rubric metadata", async () => {
    const [testCase] = await loadAgentEvaluationCases();
    const offRequest = buildAgentOffRequest(testCase);
    const onRequest = buildAgentOnRequest(testCase);

    expect(offRequest).toEqual({
      inputText: testCase.requirementMemo,
      ragMode: "on",
      ragContextPolicy: "document-diversity-v1"
    });
    expect(onRequest).toEqual({
      inputText: testCase.requirementMemo,
      agentMode: "on"
    });
    expect(() => assertNoEvaluationRubricLeak(offRequest)).not.toThrow();
    expect(() => assertNoEvaluationRubricLeak(onRequest)).not.toThrow();
    expect(() =>
      assertNoEvaluationRubricLeak({
        inputText: testCase.requirementMemo,
        importantExpectedRules: testCase.importantExpectedRules
      })
    ).toThrow("rubric leaked");
  });

  it("creates the Phase 2-A 24-run routing matrix", async () => {
    const cases = await loadAgentEvaluationCases();
    const plan = buildAgentRoutingEvaluationRunPlan(cases);

    expect(plan).toHaveLength(24);
    expect(plan.filter((run) => run.mode === "off")).toHaveLength(8);
    expect(plan.filter((run) => run.mode === "on")).toHaveLength(8);
    expect(plan.filter((run) => run.mode === "routed")).toHaveLength(8);
    expect(plan.slice(0, 6).map((run) => run.mode)).toEqual([
      "off",
      "on",
      "routed",
      "on",
      "routed",
      "off"
    ]);
    expect(plan.map((run) => run.executionOrder)).toEqual(
      Array.from({ length: 24 }, (_, index) => index + 1)
    );
  });

  it("builds routed requests without leaking rubric metadata", async () => {
    const [testCase] = await loadAgentEvaluationCases();
    const routedRequest = buildAgentRoutedRequest(testCase);

    expect(routedRequest).toEqual({
      inputText: testCase.requirementMemo,
      agentMode: "auto"
    });
    expect(() => assertNoEvaluationRubricLeak(routedRequest)).not.toThrow();
  });
});

describe("Agent Phase 2-A routing evaluation behavior", () => {
  async function createRoutingStubBundle(input?: {
    evaluationId?:
      | "agent-phase-2-a-routing"
      | "agent-phase-2-b-routing-v2"
      | "agent-phase-2-d-contract-checklist";
    useCandidateRouting?: boolean;
    useContractRouting?: boolean;
    failFirstRun?: boolean;
    onRunStart?: Parameters<
      typeof executeAgentRoutingEvaluationRunPlan
    >[0]["onRunStart"];
    onRunComplete?: Parameters<
      typeof executeAgentRoutingEvaluationRunPlan
    >[0]["onRunComplete"];
  }) {
    const cases = await loadAgentEvaluationCases();
    return executeAgentRoutingEvaluationRunPlan({
      cases,
      evaluationId: input?.evaluationId,
      createdAt: fixedCreatedAt,
      onRunStart: input?.onRunStart,
      onRunComplete: input?.onRunComplete,
      executeOff: async (testCase, plannedRun) => ({
        ...(input?.failFirstRun && plannedRun.executionOrder === 1
          ? {
              request: buildAgentOffRequest(testCase),
              status: "failed" as const,
              promptVersion: "llm-app-poc-rag-v1",
              evaluationElapsedMs: 1000 + plannedRun.executionOrder,
              error: { message: "stubbed failure" }
            }
          : {
              request: buildAgentOffRequest(testCase),
              status: "completed" as const,
              provider: "openai",
              modelName: "gpt-5.4-mini",
              promptVersion: "llm-app-poc-rag-v1",
              evaluationElapsedMs: 1000 + plannedRun.executionOrder,
              finalOutput: sampleOutput(`off-${plannedRun.rawRunId}`),
              rag: ragMetadata(["profile-image-spec", "profile-api"]),
              usage: {
                inputTokens: 100,
                outputTokens: 200,
                totalTokens: 300
              }
            })
      }),
      executeOn: async (testCase, plannedRun) => ({
        request: buildAgentOnRequest(testCase),
        status: "completed",
        provider: "openai",
        modelName: "gpt-5.4-mini",
        promptVersion: "agent-poc-workflow-v1",
        evaluationElapsedMs: 3000 + plannedRun.executionOrder,
        finalOutput: sampleOutput(`on-${plannedRun.rawRunId}`),
        rag: ragMetadata(["profile-image-spec", "profile-api"]),
        usage: {
          inputTokens: 300,
          outputTokens: 600,
          totalTokens: 900
        },
        agent: onAgent(plannedRun.runIndex)
      }),
      executeRouted: async (testCase, plannedRun) => {
        const routing = input?.useContractRouting
          ? buildAgentRoutingContractDecisionForEvaluation(testCase)
          : input?.useCandidateRouting
            ? buildAgentRoutingCandidateDecisionForEvaluation(testCase)
            : buildAgentRoutingDecisionForEvaluation(testCase);
        const routedExecutionMode =
          input?.useCandidateRouting || input?.useContractRouting
            ? routing.mode
            : testCase.caseId === "AGENT-006"
              ? "agent_workflow"
              : "single_pass";

        return {
          request: buildAgentRoutedRequest(testCase),
          status: "completed",
          provider: "openai",
          modelName: "gpt-5.4-mini",
          promptVersion:
            routedExecutionMode === "agent_workflow"
              ? "agent-poc-workflow-v1"
              : "llm-app-poc-rag-v1",
          evaluationElapsedMs:
            routedExecutionMode === "agent_workflow"
              ? 3000 + plannedRun.executionOrder
              : 1000 + plannedRun.executionOrder,
          finalOutput: sampleOutput(`routed-${plannedRun.rawRunId}`),
          rag: ragMetadata(["profile-image-spec", "profile-api"]),
          usage:
            routedExecutionMode === "agent_workflow"
              ? {
                  inputTokens: 300,
                  outputTokens: 600,
                  totalTokens: 900
                }
              : {
                  inputTokens: 100,
                  outputTokens: 200,
                  totalTokens: 300
                },
          agent:
            routedExecutionMode === "agent_workflow"
              ? onAgent(plannedRun.runIndex)
              : undefined,
          routing: {
            ...routing,
            mode: routedExecutionMode
          },
          routedExecutionMode
        };
      }
    });
  }

  it("creates Phase 2-A raw, blind, mapping, and routing metrics without mode leaks", async () => {
    const startedRunIds: string[] = [];
    const completedRunIds: string[] = [];
    const rawBundle = await createRoutingStubBundle({
      onRunStart: ({ plannedRun }) => {
        startedRunIds.push(plannedRun.rawRunId);
      },
      onRunComplete: ({ rawRun }) => {
        completedRunIds.push(rawRun.rawRunId);
      }
    });
    const { blindBundle, mappingFile } = createBlindRoutingBundleAndMapping(rawBundle);
    const manualScores = completeRoutingManualScores(
      blindBundle.samples.map((sample) => sample.sampleId)
    );
    const quality = aggregateRoutingQualityScores({
      rawBundle,
      mappingFile,
      manualScores
    });
    const routingMetrics = aggregateRoutingDecisionMetrics(rawBundle);
    const latencyAndUsage = aggregateRoutingLatencyAndUsage(rawBundle);
    const summary = createRoutingEvaluationSummary({
      rawBundle,
      blindBundle,
      mappingFile,
      manualScores
    });

    expect(rawBundle.runs).toHaveLength(24);
    expect(startedRunIds).toHaveLength(24);
    expect(completedRunIds).toHaveLength(24);
    expect(startedRunIds[0]).toBe("ROUTE-RUN-001");
    expect(completedRunIds[23]).toBe("ROUTE-RUN-024");
    expect(rawBundle.runs.filter((run) => run.mode === "routed")).toHaveLength(8);
    expect(blindBundle.samples).toHaveLength(24);
    expect(blindBundle.generationOutputSchema).toEqual(generationOutputJsonSchema);
    expect(mappingFile.mappings).toHaveLength(24);
    expect(() => assertBlindBundleHasNoModeLeak(blindBundle)).not.toThrow();
    expect(validateRoutingManualScores(manualScores, blindBundle)).toEqual(
      manualScores
    );
    expect(quality.modeSummary.routed.mean).toBeGreaterThan(0);
    expect(quality.routedVsOffWinTieLoss.routedWins + quality.routedVsOffWinTieLoss.offWins + quality.routedVsOffWinTieLoss.ties).toBe(8);
    expect(routingMetrics.routedRunCount).toBe(8);
    expect(routingMetrics.agentInvocationRate).toBeGreaterThan(0);
    expect(routingMetrics.avoidedAgentRate).toBeGreaterThan(0);
    expect(latencyAndUsage.routedVsAlwaysOnElapsedRatio).toBeLessThan(1);
    expect(latencyAndUsage.routedVsAlwaysOnTokenRatio).toBeLessThan(1);
    expect(summary.evaluationId).toBe("agent-phase-2-a-routing");
    expect(() => assertRoutingEvaluationBundleIsScorable(rawBundle)).not.toThrow();
  });

  it("creates isolated Phase 2-B routing v2 bundles with candidate routing metadata", async () => {
    const rawBundle = await createRoutingStubBundle({
      evaluationId: "agent-phase-2-b-routing-v2",
      useCandidateRouting: true
    });
    const { blindBundle, mappingFile } = createBlindRoutingBundleAndMapping(rawBundle);
    const manualScores = completeRoutingManualScores(
      blindBundle.samples.map((sample) => sample.sampleId),
      "agent-phase-2-b-routing-v2"
    );
    const summary = createRoutingEvaluationSummary({
      rawBundle,
      blindBundle,
      mappingFile,
      manualScores
    });
    const routedRuns = rawBundle.runs.filter((run) => run.mode === "routed");

    expect(rawBundle.evaluationId).toBe("agent-phase-2-b-routing-v2");
    expect(blindBundle.evaluationId).toBe("agent-phase-2-b-routing-v2");
    expect(blindBundle.generationOutputSchema).toEqual(generationOutputJsonSchema);
    expect(mappingFile.evaluationId).toBe("agent-phase-2-b-routing-v2");
    expect(summary.evaluationId).toBe("agent-phase-2-b-routing-v2");
    expect(routedRuns).toHaveLength(8);
    expect(
      routedRuns.every(
        (run) => run.routing?.policyVersion === "agent-routing-v2-candidate"
      )
    ).toBe(true);
    expect(summary.routingMetrics.routedExecutionModeCounts.single_pass).toBeGreaterThan(
      0
    );
    expect(
      summary.routingMetrics.routedExecutionModeCounts.agent_workflow
    ).toBeGreaterThan(0);
    expect(() => assertBlindBundleHasNoModeLeak(blindBundle)).not.toThrow();
  });

  it("creates Phase 2-D contract checklist routing bundles with v3 metadata", async () => {
    const rawBundle = await createRoutingStubBundle({
      evaluationId: "agent-phase-2-d-contract-checklist",
      useContractRouting: true
    });
    const { blindBundle, mappingFile } = createBlindRoutingBundleAndMapping(rawBundle);
    const manualScores = completeRoutingManualScores(
      blindBundle.samples.map((sample) => sample.sampleId),
      "agent-phase-2-d-contract-checklist"
    );
    const summary = createRoutingEvaluationSummary({
      rawBundle,
      blindBundle,
      mappingFile,
      manualScores
    });
    const routedRuns = rawBundle.runs.filter((run) => run.mode === "routed");

    expect(rawBundle.evaluationId).toBe("agent-phase-2-d-contract-checklist");
    expect(blindBundle.evaluationId).toBe("agent-phase-2-d-contract-checklist");
    expect(mappingFile.evaluationId).toBe("agent-phase-2-d-contract-checklist");
    expect(summary.evaluationId).toBe("agent-phase-2-d-contract-checklist");
    expect(
      routedRuns.every(
        (run) =>
          run.routing?.policyVersion === "agent-routing-v3-contract-candidate"
      )
    ).toBe(true);
    expect(
      routedRuns.some(
        (run) => run.routing?.signals.lightweightChecklistRecommended === true
      )
    ).toBe(true);
    expect(() => assertBlindBundleHasNoModeLeak(blindBundle)).not.toThrow();
  });

  it("exports and imports Phase 2-D context-isolated blind packages", async () => {
    const rawBundle = await createRoutingStubBundle({
      evaluationId: "agent-phase-2-d-contract-checklist",
      useContractRouting: true
    });
    const { blindBundle } = createBlindRoutingBundleAndMapping(rawBundle);
    const packageDirectory = await mkdtemp(
      path.join(os.tmpdir(), "agent-blind-package-")
    );

    try {
      const exported = await exportAgentBlindEvaluationPackage({
        phase: "phase_2_d",
        outputDirectory: packageDirectory,
        blindBundle
      });
      const scoreFilePath = path.join(
        packageDirectory,
        "output",
        "manual_scores.json"
      );
      const manualScores = completeRoutingManualScores(
        blindBundle.samples.map((sample) => sample.sampleId),
        "agent-phase-2-d-contract-checklist",
        "context-isolated-blind-llm"
      );
      await writeFile(scoreFilePath, JSON.stringify(manualScores, null, 2), "utf8");

      const imported = await importAgentBlindEvaluationScores({
        phase: "phase_2_d",
        scoreFilePath,
        outputPath: path.join(packageDirectory, "imported_scores.json"),
        blindBundle
      });

      expect(exported).toEqual({
        outputDirectory: packageDirectory,
        evaluationId: "agent-phase-2-d-contract-checklist",
        sampleCount: 24
      });
      expect(imported).toEqual({
        outputPath: path.join(packageDirectory, "imported_scores.json"),
        evaluationId: "agent-phase-2-d-contract-checklist",
        scoreCount: 24
      });
    } finally {
      await rm(packageDirectory, { recursive: true, force: true });
    }
  });

  it("exports and imports context-isolated blind evaluation packages without mode leaks", async () => {
    const rawBundle = await createRoutingStubBundle({
      evaluationId: "agent-phase-2-b-routing-v2",
      useCandidateRouting: true
    });
    const { blindBundle, mappingFile } = createBlindRoutingBundleAndMapping(rawBundle);
    const packageDirectory = await mkdtemp(
      path.join(os.tmpdir(), "agent-blind-package-")
    );

    try {
      const exported = await exportAgentBlindEvaluationPackage({
        phase: "phase_2_b",
        outputDirectory: packageDirectory,
        blindBundle
      });
      const exportedBlindBundle = JSON.parse(
        await readFile(
          path.join(packageDirectory, "input", "blind_bundle.json"),
          "utf8"
        )
      );
      const generationSchema = JSON.parse(
        await readFile(
          path.join(packageDirectory, "input", "generation_output_schema.json"),
          "utf8"
        )
      );
      const outputSchema = JSON.parse(
        await readFile(
          path.join(packageDirectory, "input", "output_schema.json"),
          "utf8"
        )
      );
      const rubric = await readFile(
        path.join(packageDirectory, "input", "scoring_rubric.md"),
        "utf8"
      );
      const prompt = await readFile(
        path.join(packageDirectory, "scoring_prompt.md"),
        "utf8"
      );
      const serializedPackageInputs = JSON.stringify({
        exportedBlindBundle,
        generationSchema,
        outputSchema,
        rubric,
        prompt
      });

      expect(exported).toEqual({
        outputDirectory: packageDirectory,
        evaluationId: "agent-phase-2-b-routing-v2",
        sampleCount: 24
      });
      expect(exportedBlindBundle.generationOutputSchema).toEqual(
        generationOutputJsonSchema
      );
      expect(generationSchema).toEqual(generationOutputJsonSchema);
      expect(outputSchema.properties.scoringMethod.enum).toContain(
        "context-isolated-blind-llm"
      );
      expect(rubric).toContain("jsonStructureStability");
      expect(prompt).toContain("context-isolated-blind-llm");
      expect(serializedPackageInputs).not.toContain("routedExecutionMode");
      expect(serializedPackageInputs).not.toContain("agent_workflow");
      expect(serializedPackageInputs).not.toContain("single_pass");
      expect(serializedPackageInputs).not.toContain("reviewHistory");
      expect(serializedPackageInputs).not.toContain("providerLatencyMs");
      expect(serializedPackageInputs).not.toContain("OPENAI_API_KEY");

      const scoreFilePath = path.join(
        packageDirectory,
        "output",
        "manual_scores.json"
      );
      const manualScores = completeRoutingManualScores(
        blindBundle.samples.map((sample) => sample.sampleId),
        "agent-phase-2-b-routing-v2",
        "context-isolated-blind-llm"
      );
      await writeFile(scoreFilePath, JSON.stringify(manualScores, null, 2), "utf8");

      const imported = await importAgentBlindEvaluationScores({
        phase: "phase_2_b",
        scoreFilePath,
        outputPath: path.join(packageDirectory, "imported_scores.json"),
        blindBundle
      });
      const importedScores = routingManualScoresFileSchema.parse(
        JSON.parse(await readFile(imported.outputPath, "utf8"))
      );
      const summary = createRoutingEvaluationSummary({
        rawBundle,
        blindBundle,
        mappingFile,
        manualScores: importedScores
      });

      expect(imported).toEqual({
        outputPath: path.join(packageDirectory, "imported_scores.json"),
        evaluationId: "agent-phase-2-b-routing-v2",
        scoreCount: 24
      });
      expect(importedScores.scoringMethod).toBe("context-isolated-blind-llm");
      expect(summary.scoringMethod).toBe("context-isolated-blind-llm");
    } finally {
      await rm(packageDirectory, { recursive: true, force: true });
    }
  });

  it("rejects routing evaluation bundles with failed runs before blind scoring", async () => {
    const rawBundle = await createRoutingStubBundle({ failFirstRun: true });

    expect(() => assertRoutingEvaluationBundleIsScorable(rawBundle)).toThrow(
      "Routing evaluation is not scorable"
    );
  });
});

describe("Agent Phase 1-E raw and blind bundle behavior", () => {
  async function createStubBundle() {
    const cases = await loadAgentEvaluationCases();
    return executeAgentEvaluationRunPlan({
      cases,
      createdAt: fixedCreatedAt,
      executeOff: async (testCase, plannedRun) => ({
        request: buildAgentOffRequest(testCase),
        status: "completed",
        provider: "openai",
        modelName: "gpt-5.4-mini",
        promptVersion: "llm-app-poc-rag-v1",
        evaluationElapsedMs: 1000 + plannedRun.executionOrder,
        finalOutput: sampleOutput(`off-${plannedRun.rawRunId}`),
        rag: ragMetadata(["profile-image-spec", "profile-api"]),
        usage: {
          inputTokens: 100,
          outputTokens: 200,
          totalTokens: 300
        }
      }),
      executeOn: async (testCase, plannedRun) => ({
        request: buildAgentOnRequest(testCase),
        status: plannedRun.runIndex === 3 ? "completed_with_findings" : "completed",
        provider: "openai",
        modelName: "gpt-5.4-mini",
        promptVersion: "agent-poc-workflow-v1",
        evaluationElapsedMs: 2000 + plannedRun.executionOrder,
        finalOutput: sampleOutput(`on-${plannedRun.rawRunId}`),
        rag: ragMetadata(["profile-image-spec", "profile-api"]),
        usage: {
          inputTokens: 30,
          outputTokens: 60,
          totalTokens: 90
        },
        agent: onAgent(plannedRun.runIndex, plannedRun.runIndex === 3 ? 1 : 0)
      })
    });
  }

  it("executes with stubbed external calls and records safe raw metadata", async () => {
    const rawBundle = await createStubBundle();

    expect(rawBundle.runs).toHaveLength(16);
    expect(rawBundle.runs[0]).toMatchObject({
      rawRunId: "RUN-001",
      mode: "off",
      provider: "openai",
      modelName: "gpt-5.4-mini"
    });
    expect(rawBundle.runs[1].agent?.metadata.toolInvocationCount).toBe(1);
    expect(JSON.stringify(rawBundle)).not.toContain("OPENAI_API_KEY");
    expect(JSON.stringify(rawBundle)).not.toContain("x-api-key");
    expect(JSON.stringify(rawBundle)).not.toContain("[0.1,");
  });

  it("creates deterministic blind samples, mapping, and a score template without mode leaks", async () => {
    const rawBundle = await createStubBundle();
    const first = createBlindBundleAndMapping(rawBundle);
    const second = createBlindBundleAndMapping(rawBundle);

    expect(first.blindBundle.samples).toHaveLength(16);
    expect(first.mappingFile.mappings).toHaveLength(16);
    expect(first.blindBundle.generationOutputSchema).toEqual(
      generationOutputJsonSchema
    );
    expect(first.blindBundle.samples.map((sample) => sample.sampleId)).toEqual(
      Array.from({ length: 16 }, (_, index) => `SAMPLE-${String(index + 1).padStart(3, "0")}`)
    );
    expect(first.blindBundle.samples.map((sample) => sample.caseId)).toEqual(
      second.blindBundle.samples.map((sample) => sample.caseId)
    );
    expect(() => assertBlindBundleHasNoModeLeak(first.blindBundle)).not.toThrow();
    expect(JSON.stringify(first.blindBundle)).not.toContain("agentMode");
    expect(JSON.stringify(first.blindBundle)).not.toContain("reviewHistory");
    expect(createManualScoreTemplate(first.blindBundle)).toContain("SAMPLE-001");
    expect(createManualScoreTemplate(first.blindBundle)).toContain(
      "GenerationOutput Schema"
    );
  });

  it("validates manual score files and rejects duplicate, missing, unknown, and out-of-range samples", async () => {
    const rawBundle = await createStubBundle();
    const { blindBundle } = createBlindBundleAndMapping(rawBundle);
    const validScores = completeManualScores(
      blindBundle.samples.map((sample) => sample.sampleId)
    );

    expect(validateManualScores(validScores, blindBundle)).toEqual(validScores);
    expect(() =>
      validateManualScores(
        {
          ...validScores,
          scores: [validScores.scores[0], validScores.scores[0]]
        },
        blindBundle
      )
    ).toThrow("duplicate");
    expect(() =>
      validateManualScores(
        {
          ...validScores,
          scores: validScores.scores.slice(1)
        },
        blindBundle
      )
    ).toThrow("missing");
    expect(() =>
      validateManualScores(
        {
          ...validScores,
          scores: [
            ...validScores.scores.slice(1),
            { ...validScores.scores[0], sampleId: "SAMPLE-999" }
          ]
        },
        blindBundle
      )
    ).toThrow("unknown");
    expect(() =>
      manualScoresFileSchema.parse({
        ...validScores,
        scores: [
          {
            ...validScores.scores[0],
            scores: {
              ...validScores.scores[0].scores,
              jsonStructureStability: 6
            }
          }
        ]
      })
    ).toThrow();
    expect(() =>
      manualScoresFileSchema.parse({
        ...validScores,
        scores: [
          {
            ...validScores.scores[0],
            notes: "single reviewer note"
          }
        ]
      })
    ).not.toThrow();
    expect(() =>
      manualScoresFileSchema.parse({
        ...validScores,
        scores: [
          {
            ...validScores.scores[0],
            notes: ["first reviewer note", "second reviewer note"]
          }
        ]
      })
    ).not.toThrow();
  });

  it("aggregates quality, Agent metrics, retrieval parity, latency, usage, and revision pairs", async () => {
    const rawBundle = await createStubBundle();
    const { blindBundle, mappingFile } = createBlindBundleAndMapping(rawBundle);
    const manualScores = completeManualScores(
      blindBundle.samples.map((sample) => sample.sampleId)
    );
    const quality = aggregateQualityScores({
      rawBundle,
      mappingFile,
      manualScores
    });
    const agentMetrics = aggregateAgentMetrics(rawBundle);
    const retrievalParity = aggregateRetrievalParity(rawBundle);
    const latencyAndUsage = aggregateLatencyAndUsage(rawBundle);
    const revisionPairs = createRevisionPairs(rawBundle);
    const summary = createEvaluationSummary({
      rawBundle,
      blindBundle,
      mappingFile,
      manualScores
    });

    expect(quality.modeSummary.off.mean).toBeGreaterThan(0);
    expect(quality.axisSummaries).toHaveProperty("productSpecificRuleCoverage");
    expect(
      quality.pairedWinTieLoss.agentOnWins +
        quality.pairedWinTieLoss.agentOffWins +
        quality.pairedWinTieLoss.ties
    ).toBe(8);
    expect(agentMetrics.workflowCompletionRate).toBe(1);
    expect(agentMetrics.revisionInvocationRate).toBeGreaterThan(0);
    expect(agentMetrics.knowledgeToolInvocationCountDistribution).toHaveProperty("1");
    expect(agentMetrics.findingSeverityCounts.major).toBeGreaterThan(0);
    expect(retrievalParity.exactDocumentParityRate).toBe(1);
    expect(latencyAndUsage.off.inputTokens.mean).toBe(100);
    expect(latencyAndUsage.on.totalTokens.mean).toBe(90);
    expect(revisionPairs.revisionPairCount).toBeGreaterThan(0);
    expect(summary.scoringMethod).toBe("blind-manual");
  });

  it("detects retrieval parity mismatches instead of assuming equality", async () => {
    const rawBundle = await createStubBundle();
    const mutatedRuns = rawBundle.runs.map((run): RawEvaluationRun => {
      if (run.mode === "on" && run.agent) {
        return {
          ...run,
          agent: {
            ...run.agent,
            retrieval: {
              retrievalMetadata: ragMetadata(["different-document"]),
              embeddingUsage: {
                promptTokens: 10,
                totalTokens: 10
              },
              sources: [
                {
                  sourceId: "S1",
                  documentId: "different-document",
                  chunkId: "different-document:heading-aware-v1:0001"
                }
              ]
            }
          }
        };
      }

      return run;
    });
    const parity = aggregateRetrievalParity({
      ...rawBundle,
      runs: mutatedRuns
    });

    expect(parity.exactDocumentParityRate).toBeLessThan(1);
    expect(parity.pairResults.some((pair) => !pair.sameDocumentSequence)).toBe(true);
  });
});
