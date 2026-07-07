import { loadRagCliEnv } from "@/lib/rag/cli";
import {
  agentRoutingEvaluationBlindBundlePath,
  agentRoutingEvaluationManualScoresPath,
  agentRoutingEvaluationRawBundlePath,
  agentRoutingEvaluationReportPath,
  agentRoutingEvaluationSampleMappingPath,
  agentRoutingEvaluationSummaryPath,
  blindRoutingEvaluationBundleSchema,
  createRoutingEvaluationReportMarkdown,
  createRoutingEvaluationSummary,
  rawRoutingEvaluationBundleSchema,
  readJsonFile,
  routingManualScoresFileSchema,
  routingSampleMappingFileSchema,
  writeJsonFile,
  writeTextFile
} from "@/lib/agent/evaluation";

async function main() {
  loadRagCliEnv();

  const rawBundle = await readJsonFile(
    agentRoutingEvaluationRawBundlePath,
    rawRoutingEvaluationBundleSchema
  );
  const blindBundle = await readJsonFile(
    agentRoutingEvaluationBlindBundlePath,
    blindRoutingEvaluationBundleSchema
  );
  const mappingFile = await readJsonFile(
    agentRoutingEvaluationSampleMappingPath,
    routingSampleMappingFileSchema
  );
  const manualScores = await readJsonFile(
    agentRoutingEvaluationManualScoresPath,
    routingManualScoresFileSchema
  );
  const summary = createRoutingEvaluationSummary({
    rawBundle,
    blindBundle,
    mappingFile,
    manualScores
  });
  const report = createRoutingEvaluationReportMarkdown(summary);

  await writeJsonFile(agentRoutingEvaluationSummaryPath, summary);
  await writeTextFile(agentRoutingEvaluationReportPath, report);

  console.info("Agent Phase 2-A routing evaluation summary created.");
  console.info(`summary=${agentRoutingEvaluationSummaryPath}`);
  console.info(`report=${agentRoutingEvaluationReportPath}`);
  console.info(
    `offMean=${summary.quality.modeSummary.off.mean ?? "N/A"} onMean=${summary.quality.modeSummary.on.mean ?? "N/A"} routedMean=${summary.quality.modeSummary.routed.mean ?? "N/A"}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
