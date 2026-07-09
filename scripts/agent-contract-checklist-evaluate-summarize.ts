import { loadRagCliEnv } from "@/lib/rag/cli";
import {
  agentContractChecklistEvaluationBlindBundlePath,
  agentContractChecklistEvaluationManualScoresPath,
  agentContractChecklistEvaluationRawBundlePath,
  agentContractChecklistEvaluationReportPath,
  agentContractChecklistEvaluationSampleMappingPath,
  agentContractChecklistEvaluationSummaryPath,
  blindContractChecklistEvaluationBundleSchema,
  contractChecklistManualScoresFileSchema,
  contractChecklistSampleMappingFileSchema,
  createContractChecklistEvaluationReportMarkdown,
  createContractChecklistEvaluationSummary,
  rawContractChecklistEvaluationBundleSchema,
  readJsonFile,
  writeJsonFile,
  writeTextFile
} from "@/lib/agent/evaluation";

async function main() {
  loadRagCliEnv();

  const rawBundle = await readJsonFile(
    agentContractChecklistEvaluationRawBundlePath,
    rawContractChecklistEvaluationBundleSchema
  );
  const blindBundle = await readJsonFile(
    agentContractChecklistEvaluationBlindBundlePath,
    blindContractChecklistEvaluationBundleSchema
  );
  const mappingFile = await readJsonFile(
    agentContractChecklistEvaluationSampleMappingPath,
    contractChecklistSampleMappingFileSchema
  );
  const manualScores = await readJsonFile(
    agentContractChecklistEvaluationManualScoresPath,
    contractChecklistManualScoresFileSchema
  );
  const summary = createContractChecklistEvaluationSummary({
    rawBundle,
    blindBundle,
    mappingFile,
    manualScores
  });
  const report = createContractChecklistEvaluationReportMarkdown(summary);

  await writeJsonFile(agentContractChecklistEvaluationSummaryPath, summary);
  await writeTextFile(agentContractChecklistEvaluationReportPath, report);

  console.info("Agent Phase 2-E contract-detail target evaluation summary created.");
  console.info(`summary=${agentContractChecklistEvaluationSummaryPath}`);
  console.info(`report=${agentContractChecklistEvaluationReportPath}`);
  console.info(
    `baselineMean=${summary.quality.modeSummary.baseline.mean ?? "N/A"} checklistMean=${summary.quality.modeSummary.checklist.mean ?? "N/A"}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
