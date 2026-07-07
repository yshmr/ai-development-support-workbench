import { loadRagCliEnv } from "@/lib/rag/cli";
import {
  agentEvaluationBlindBundlePath,
  agentEvaluationManualScoresPath,
  agentEvaluationRawBundlePath,
  agentEvaluationReportPath,
  agentEvaluationSampleMappingPath,
  agentEvaluationSummaryPath,
  blindEvaluationBundleSchema,
  createEvaluationReportMarkdown,
  createEvaluationSummary,
  manualScoresFileSchema,
  rawEvaluationBundleSchema,
  readJsonFile,
  sampleMappingFileSchema,
  writeJsonFile,
  writeTextFile
} from "@/lib/agent/evaluation";

async function main() {
  loadRagCliEnv();

  const rawBundle = await readJsonFile(
    agentEvaluationRawBundlePath,
    rawEvaluationBundleSchema
  );
  const blindBundle = await readJsonFile(
    agentEvaluationBlindBundlePath,
    blindEvaluationBundleSchema
  );
  const mappingFile = await readJsonFile(
    agentEvaluationSampleMappingPath,
    sampleMappingFileSchema
  );
  const manualScores = await readJsonFile(
    agentEvaluationManualScoresPath,
    manualScoresFileSchema
  );
  const summary = createEvaluationSummary({
    rawBundle,
    blindBundle,
    mappingFile,
    manualScores
  });
  const report = createEvaluationReportMarkdown(summary);

  await writeJsonFile(agentEvaluationSummaryPath, summary);
  await writeTextFile(agentEvaluationReportPath, report);

  console.info("Agent Phase 1-E evaluation summary created.");
  console.info(`summary=${agentEvaluationSummaryPath}`);
  console.info(`report=${agentEvaluationReportPath}`);
  console.info(
    `agentOffMean=${summary.quality.modeSummary.off.mean ?? "N/A"} agentOnMean=${summary.quality.modeSummary.on.mean ?? "N/A"}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
