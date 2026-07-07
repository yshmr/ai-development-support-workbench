import { loadRagCliEnv } from "@/lib/rag/cli";
import { runAgentWorkflow } from "@/lib/agent/orchestrator";
import { createRealAgentWorkflowDependencies } from "@/lib/agent/runtime";
import { createFileAgentRunStore } from "@/lib/agent/storage";

const smokeRequirementMemo = `ユーザーがプロフィール画像を変更できるようにしたい。
画像は5MBまで、jpg/png対応。
変更後は即時反映したい。
失敗時にはエラーメッセージを表示したい。`;

function stripSourceContent(source: Record<string, unknown>) {
  const { content: _content, ...metadata } = source;
  return metadata;
}

async function main() {
  loadRagCliEnv();

  const result = await runAgentWorkflow({
    requirementMemo: smokeRequirementMemo,
    dependencies: createRealAgentWorkflowDependencies(),
    runStore: createFileAgentRunStore()
  });
  const retrievalMetadata =
    result.knowledge?.retrievalMetadata &&
    typeof result.knowledge.retrievalMetadata === "object"
      ? (result.knowledge.retrievalMetadata as Record<string, unknown>)
      : undefined;
  const safeSources = result.knowledge?.sources.map((source) =>
    stripSourceContent(source as Record<string, unknown>)
  );

  console.log(
    JSON.stringify(
      {
        agent: {
          runId: result.runId,
          status: result.metadata.status,
          finalState: result.metadata.finalState,
          terminationReason: result.metadata.terminationReason,
          revisionCount: result.metadata.revisionCount,
          reviewCount: result.metadata.reviewCount,
          totalAgentLatencyMs: result.metadata.totalAgentLatencyMs,
          llmStepCount: result.metadata.llmStepCount,
          toolInvocationCount: result.metadata.toolInvocationCount,
          steps: result.metadata.steps.map((step) => ({
            stepName: step.stepName,
            status: step.status,
            latencyMs: step.latencyMs,
            provider: step.provider,
            modelName: step.modelName,
            promptVersion: step.promptVersion,
            providerBacked: step.providerBacked,
            providerLatencyMs: step.providerLatencyMs,
            inputTokens: step.inputTokens,
            outputTokens: step.outputTokens,
            totalTokens: step.totalTokens,
            reviewDecision: step.reviewDecision
          }))
        },
        plan: result.plan,
        retrieval: retrievalMetadata
          ? {
              retrievalLatencyMs: retrievalMetadata.retrievalLatencyMs,
              contextPolicy: retrievalMetadata.contextPolicy,
              candidateTopK: retrievalMetadata.candidateTopK,
              candidateChunkCount: retrievalMetadata.candidateChunkCount,
              candidateUniqueDocumentCount:
                retrievalMetadata.candidateUniqueDocumentCount,
              candidateDocumentChunkCounts:
                retrievalMetadata.candidateDocumentChunkCounts,
              requestedFinalTopK: retrievalMetadata.requestedFinalTopK,
              maxChunksPerDocument: retrievalMetadata.maxChunksPerDocument,
              selectedChunkCount: retrievalMetadata.selectedChunkCount,
              uniqueDocumentCount: retrievalMetadata.uniqueDocumentCount,
              maximumChunksFromSameDocument:
                retrievalMetadata.maximumChunksFromSameDocument,
              documentChunkCounts: retrievalMetadata.documentChunkCounts,
              embeddingUsage: result.knowledge?.embeddingUsage,
              sources: safeSources
            }
          : undefined,
        reviews: result.reviewHistory.map((entry) => ({
          reviewNumber: entry.reviewNumber,
          stage: entry.stage,
          summary: entry.review.summary,
          decision: entry.decision,
          findings: entry.review.findings
        })),
        output: result.output,
        error: result.error
      },
      null,
      2
    )
  );

  if (result.metadata.status === "failed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Agent smoke test failed."
  );
  process.exitCode = 1;
});
