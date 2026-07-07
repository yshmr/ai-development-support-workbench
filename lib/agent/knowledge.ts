import type { RagMetadata } from "@/lib/schema";
import { getGroundedGenerationRagConfig } from "@/lib/rag/config";
import { buildGroundedContext } from "@/lib/rag/context";
import {
  getCandidateTopKForContextPolicy,
  selectRagContextChunks
} from "@/lib/rag/context-selection";
import * as ragRetriever from "@/lib/rag/retriever";
import type { RetrievedChunk } from "@/lib/rag/schema";
import type {
  KnowledgeRetrievalTool,
  AgentExecutorResult
} from "./orchestrator";
import { createAgentExecutorResult } from "./orchestrator";
import type { KnowledgeRetrievalToolResult } from "./schema";

const agentRagContextPolicy = "document-diversity-v1" as const;

type RetrieveRagChunks = typeof ragRetriever.retrieveRagChunks;

export type AgentKnowledgeToolDependencies = {
  retrieveRagChunks?: RetrieveRagChunks;
};

export type RagKnowledgeRetrievalTool = Omit<KnowledgeRetrievalTool, "invoke"> & {
  invoke(input: {
    query: string;
  }): Promise<AgentExecutorResult<KnowledgeRetrievalToolResult>>;
};

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

function buildRagMetadata(input: {
  retrievalLatencyMs: number;
  embeddingModel: string;
  embeddingUsage?: {
    promptTokens?: number;
    totalTokens?: number;
  };
  selectedChunks: RetrievedChunk[];
  selection: ReturnType<typeof selectRagContextChunks>;
}): Extract<RagMetadata, { mode: "on" }> {
  const ragConfig = getGroundedGenerationRagConfig();

  return {
    mode: "on",
    strategy: ragConfig.strategy,
    topK: ragConfig.topK,
    embeddingModel: input.embeddingModel,
    retrievalLatencyMs: input.retrievalLatencyMs,
    contextPolicy: input.selection.policy,
    candidateTopK: input.selection.candidateTopK,
    candidateChunkCount: input.selection.candidateMetrics.selectedChunkCount,
    candidateUniqueDocumentCount:
      input.selection.candidateMetrics.uniqueDocumentCount,
    candidateDocumentChunkCounts:
      input.selection.candidateMetrics.documentChunkCounts,
    requestedFinalTopK: input.selection.requestedFinalTopK,
    maxChunksPerDocument: input.selection.maxChunksPerDocument,
    selectedChunkCount: input.selection.metrics.selectedChunkCount,
    uniqueDocumentCount: input.selection.metrics.uniqueDocumentCount,
    maximumChunksFromSameDocument:
      input.selection.metrics.maximumChunksFromSameDocument,
    documentChunkCounts: input.selection.metrics.documentChunkCounts,
    sources: buildGroundedContext(input.selection.selectedChunks).sources,
    embeddingUsage: input.embeddingUsage
  };
}

export function createRagKnowledgeRetrievalTool(
  dependencies: AgentKnowledgeToolDependencies = {}
): RagKnowledgeRetrievalTool {
  const retrieve = dependencies.retrieveRagChunks ?? ragRetriever.retrieveRagChunks;

  return {
    toolName: "knowledge.retrieve",
    async invoke({ query }): Promise<AgentExecutorResult<KnowledgeRetrievalToolResult>> {
      const ragConfig = getGroundedGenerationRagConfig();
      const candidateTopK = getCandidateTopKForContextPolicy(agentRagContextPolicy);
      const startedAtMs = getTimerNow();
      const retrieval = await retrieve({
        query,
        strategy: ragConfig.strategy,
        topK: candidateTopK
      });
      const retrievalLatencyMs = toNonNegativeDurationMs(startedAtMs);
      const selection = selectRagContextChunks(
        retrieval.results,
        agentRagContextPolicy
      );
      const groundedContext = buildGroundedContext(selection.selectedChunks);
      const ragMetadata = buildRagMetadata({
        retrievalLatencyMs,
        embeddingModel: retrieval.embeddingModel,
        embeddingUsage: retrieval.embeddingUsage,
        selectedChunks: retrieval.results,
        selection
      });

      return createAgentExecutorResult({
        groundedContext: groundedContext.contextText,
        sources: groundedContext.sources,
        retrievalMetadata: ragMetadata,
        embeddingUsage: retrieval.embeddingUsage
      });
    }
  };
}
