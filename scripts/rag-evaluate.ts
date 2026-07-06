import {
  evaluateRetrievedChunks,
  loadRetrievalEvaluationCases,
  summarizeRetrievalEvaluation,
  validateEvaluationDocumentIds
} from "../lib/rag/evaluation";
import { loadRagCliEnv, parseRagCliArgs } from "../lib/rag/cli";
import { loadRagDocuments } from "../lib/rag/loader";
import { retrieveRagChunks } from "../lib/rag/retriever";

function formatMetric(value: number): string {
  return value.toFixed(3);
}

async function main() {
  loadRagCliEnv();
  const { strategy, topK } = parseRagCliArgs(process.argv.slice(2));

  const documents = await loadRagDocuments();
  const cases = await loadRetrievalEvaluationCases();
  validateEvaluationDocumentIds(
    cases,
    documents.map((document) => document.documentId)
  );

  const caseResults = [];
  for (const testCase of cases) {
    const retrieval = await retrieveRagChunks({
      query: testCase.query,
      strategy,
      topK
    });
    caseResults.push(
      evaluateRetrievedChunks(testCase, retrieval.results, topK)
    );
  }

  const summary = summarizeRetrievalEvaluation(caseResults, topK);

  console.log(`strategy: ${strategy}`);
  console.log(`topK: ${summary.topK}`);
  console.log(`cases: ${summary.cases}`);
  console.log(`Hit@${topK}: ${formatMetric(summary.hitAtK)}`);
  console.log(`MRR: ${formatMetric(summary.mrr)}`);
  console.log(`Source Recall@${topK}: ${formatMetric(summary.sourceRecallAtK)}`);

  for (const result of summary.results) {
    console.log(
      `${result.caseId} hit=${result.hit} firstRelevantRank=${
        result.firstRelevantRank ?? "none"
      } sourceRecall=${result.sourceRecall.toFixed(2)}`
    );
    if (!result.hit) {
      console.log(
        `  retrievedDocumentIds=${result.retrieved
          .map((retrieved) => retrieved.documentId)
          .join(",")}`
      );
    }
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "RAG retrieval evaluation failed."
  );
  process.exitCode = 1;
});
