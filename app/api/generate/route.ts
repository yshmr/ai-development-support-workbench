import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { generateFromRequirementMemo } from "@/lib/generator";
import { saveGeneration, updateGenerationMetadata } from "@/lib/storage";
import { generateRequestSchema, type RagMetadata } from "@/lib/schema";
import { runAgentWorkflow } from "@/lib/agent/orchestrator";
import { createRealAgentWorkflowDependencies } from "@/lib/agent/runtime";
import { createFileAgentRunStore } from "@/lib/agent/storage";
import { createAgentRoutingDecision } from "@/lib/agent/routing";
import { getGroundedGenerationRagConfig } from "@/lib/rag/config";
import { buildGroundedContext } from "@/lib/rag/context";
import {
  getCandidateTopKForContextPolicy,
  selectRagContextChunks
} from "@/lib/rag/context-selection";
import * as ragRetriever from "@/lib/rag/retriever";

export const runtime = "nodejs";

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

function hasOwnField(body: unknown, fieldName: string): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    Object.prototype.hasOwnProperty.call(body, fieldName)
  );
}

function getAgentProviderMetadata(
  steps: Array<{
    providerBacked?: boolean;
    provider?: string;
    modelName?: string;
    promptVersion?: string;
  }>
) {
  const firstProviderStep = steps.find((step) => step.providerBacked === true);

  return {
    provider: firstProviderStep?.provider ?? "mock",
    modelName: firstProviderStep?.modelName ?? "mock-local",
    promptVersion: "agent-poc-workflow-v1"
  };
}

export async function POST(request: Request) {
  const serverStartedAtMs = getTimerNow();
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON形式のリクエストを送信してください。" },
      { status: 400 }
    );
  }

  const parsedRequest = generateRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: parsedRequest.error.issues[0]?.message ?? "入力を確認してください。" },
      { status: 400 }
    );
  }

  try {
    const agentRouting =
      parsedRequest.data.agentMode === "auto"
        ? createAgentRoutingDecision({
            requirementMemo: parsedRequest.data.inputText
          })
        : undefined;
    const effectiveAgentMode =
      parsedRequest.data.agentMode === "on" ||
      agentRouting?.mode === "agent_workflow"
        ? "on"
        : "off";

    if (
      parsedRequest.data.agentMode !== "off" &&
      (hasOwnField(body, "ragMode") || hasOwnField(body, "ragContextPolicy"))
    ) {
      return NextResponse.json(
        {
          error:
            "agentMode=on/auto の場合は ragMode / ragContextPolicy を指定しないでください。Agent workflowまたはrouterは内部RAG policyを使用します。"
        },
        { status: 400 }
      );
    }

    if (effectiveAgentMode === "on") {
      const agentResult = await runAgentWorkflow({
        requirementMemo: parsedRequest.data.inputText,
        dependencies: createRealAgentWorkflowDependencies(),
        runStore: createFileAgentRunStore()
      });
      const providerMetadata = getAgentProviderMetadata(
        agentResult.metadata.steps
      );
      const serverProcessingMs = toNonNegativeDurationMs(serverStartedAtMs);
      const agentResponse = {
        id: agentResult.runId,
        ...(agentResult.output ?? {}),
        ...providerMetadata,
        providerLatencyMs: undefined,
        serverProcessingMs,
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined,
        rag: { mode: "off" },
        agentRouting,
        createdAt: agentResult.createdAt,
        agent: {
          runId: agentResult.runId,
          status: agentResult.metadata.status,
          finalState: agentResult.metadata.finalState,
          terminationReason: agentResult.metadata.terminationReason,
          revisionCount: agentResult.metadata.revisionCount,
          reviewCount: agentResult.metadata.reviewCount,
          totalAgentLatencyMs: agentResult.metadata.totalAgentLatencyMs,
          llmStepCount: agentResult.metadata.llmStepCount,
          toolInvocationCount: agentResult.metadata.toolInvocationCount,
          routing: agentRouting,
          steps: agentResult.metadata.steps,
          plan: agentResult.plan,
          reviewHistory: agentResult.reviewHistory,
          retrieval: agentResult.knowledge
            ? {
                retrievalMetadata: agentResult.knowledge.retrievalMetadata,
                embeddingUsage: agentResult.knowledge.embeddingUsage,
                sources: agentResult.knowledge.sources.map((source) => ({
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
          error: agentResult.error
        }
      };

      if (agentResult.metadata.status === "failed") {
        return NextResponse.json(
          {
            error: agentResult.error?.message ?? "Agent workflow failed.",
            agent: agentResponse.agent
          },
          { status: 500 }
        );
      }

      return NextResponse.json(agentResponse);
    }

    let ragContextText: string | undefined;
    let ragMetadata: RagMetadata = { mode: "off" };
    const effectiveRagMode = agentRouting ? "on" : parsedRequest.data.ragMode;
    const effectiveRagContextPolicy = agentRouting
      ? "document-diversity-v1"
      : parsedRequest.data.ragContextPolicy;

    if (effectiveRagMode === "on") {
      const ragConfig = getGroundedGenerationRagConfig();
      const contextPolicy = effectiveRagContextPolicy;
      const candidateTopK = getCandidateTopKForContextPolicy(contextPolicy);
      const retrievalStartedAtMs = getTimerNow();
      const retrieval = await ragRetriever.retrieveRagChunks({
        query: parsedRequest.data.inputText,
        strategy: ragConfig.strategy,
        topK: candidateTopK
      });
      const retrievalLatencyMs = toNonNegativeDurationMs(retrievalStartedAtMs);
      const selection = selectRagContextChunks(
        retrieval.results,
        contextPolicy
      );
      const groundedContext = buildGroundedContext(selection.selectedChunks);

      ragContextText = groundedContext.contextText;
      ragMetadata = {
        mode: "on",
        strategy: ragConfig.strategy,
        topK: ragConfig.topK,
        embeddingModel: retrieval.embeddingModel,
        retrievalLatencyMs,
        contextPolicy: selection.policy,
        candidateTopK: selection.candidateTopK,
        candidateChunkCount: selection.candidateMetrics.selectedChunkCount,
        candidateUniqueDocumentCount: selection.candidateMetrics.uniqueDocumentCount,
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
      };
    }

    const {
      output,
      provider,
      promptVersion,
      modelName,
      providerLatencyMs,
      inputTokens,
      outputTokens,
      totalTokens
    } = await generateFromRequirementMemo(parsedRequest.data.inputText, {
      ragContextText
    });

    const record = await saveGeneration({
      id: randomUUID(),
      inputText: parsedRequest.data.inputText,
      output,
      provider,
      promptVersion,
      modelName,
      providerLatencyMs,
      inputTokens,
      outputTokens,
      totalTokens,
      rag: ragMetadata,
      createdAt: new Date().toISOString()
    });
    const serverProcessingMs = toNonNegativeDurationMs(serverStartedAtMs);
    const updatedRecord =
      (await updateGenerationMetadata(record.id, { serverProcessingMs })) ?? {
        ...record,
        serverProcessingMs
      };

    return NextResponse.json({
      ...output,
      id: updatedRecord.id,
      provider: updatedRecord.provider,
      promptVersion: updatedRecord.promptVersion,
      modelName: updatedRecord.modelName,
      providerLatencyMs: updatedRecord.providerLatencyMs,
      serverProcessingMs: updatedRecord.serverProcessingMs,
      inputTokens: updatedRecord.inputTokens,
      outputTokens: updatedRecord.outputTokens,
      totalTokens: updatedRecord.totalTokens,
      rag: updatedRecord.rag,
      agentRouting,
      createdAt: updatedRecord.createdAt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成に失敗しました。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
