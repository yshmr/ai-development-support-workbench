import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { generateFromRequirementMemo } from "@/lib/generator";
import { saveGeneration, updateGenerationMetadata } from "@/lib/storage";
import { generateRequestSchema, type RagMetadata } from "@/lib/schema";
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
    let ragContextText: string | undefined;
    let ragMetadata: RagMetadata = { mode: "off" };

    if (parsedRequest.data.ragMode === "on") {
      const ragConfig = getGroundedGenerationRagConfig();
      const contextPolicy = parsedRequest.data.ragContextPolicy;
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
      createdAt: updatedRecord.createdAt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成に失敗しました。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
